const axios = require('axios');
const crypto = require('crypto');
const { getConfig } = require('../config/environments');

const ENDPOINT_PATH = '/v1/connector/order';

/**
 * Équivalent "Page Object" pour l'endpoint Order : toute la construction des
 * requêtes et l'appel HTTP lui-même vivent ici, afin que les step definitions
 * n'expriment que l'intention ("envoyer ce payload") sans manipuler du HTTP.
 *
 * `validateStatus: () => true` est volontaire : les réponses 400/401/403/5xx
 * sont des assertions à part entière dans cette suite, pas des exceptions à
 * intercepter.
 */
function client() {
  const { baseUrl } = getConfig();
  return axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    validateStatus: () => true,
  });
}

/**
 * Génère des valeurs aléatoires pour les champs "données" du payload à chaque
 * appel, plutôt que des littéraux figés partagés entre tous les scénarios.
 * Deux bénéfices :
 * - les assertions de cohérence de contrat (payload envoyé vs données
 *   échomatiquement renvoyées dans la réponse) deviennent réellement
 *   probantes, au lieu de comparer deux constantes qui coïncideraient de
 *   toute façon même en cas de bug
 * - une plus grande variété de valeurs est couverte (montants à virgule,
 *   identifiants différents à chaque run...) sans dupliquer de scénarios
 *
 * Les champs qui relèvent d'une énumération métier contrainte et documentée
 * de manière incomplète (`transaction_type`, `protocol`) restent volontairement
 * fixes : les randomiser sans connaître l'ensemble exact des valeurs valides
 * introduirait un risque de faux négatifs non maîtrisé.
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomFrom(values) {
  return values[randomInt(0, values.length - 1)];
}

function randomDigits(length) {
  return Array.from({ length }, () => randomInt(0, 9)).join('');
}

function randomAlphaNumeric(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[randomInt(0, chars.length - 1)]).join('');
}

function buildMinimalPayload(overrides = {}) {
  return {
    order: {
      order_id: overrides.order_id || `ORDER_${Date.now()}_${randomAlphaNumeric(4)}`,
      transaction_type: 'Debit',
      price: {
        amount: randomAmount(1, 500),
        currency: randomFrom(['EUR', 'USD', 'GBP']),
      },
    },
    pos_technical_info: {
      device_information: {
        serial_number: randomDigits(10),
        manufacturer: randomFrom(['PAX', 'Verifone', 'Ingenico']),
      },
      terminal_transaction_display: {
        protocol: 'AppNepting',
      },
    },
  };
}

function buildFullPayload(overrides = {}) {
  const minimal = buildMinimalPayload(overrides);
  return {
    order: {
      ...minimal.order,
      basket: [
        {
          product_reference: `NF-${randomAlphaNumeric(5)}`,
          name: `Product ${randomAlphaNumeric(4)}`,
          type: 'good',
          quantity: randomInt(1, 5),
          unit_price: randomAmount(1, 50),
          tax_rate: randomFrom([0, 5.5, 10, 20]),
          discount: 0,
          total_amount: randomAmount(1, 250),
        },
      ],
      description: `Description de test ${randomAlphaNumeric(6)}`,
      custom_data: {
        internal_reference: `ORD_${randomDigits(6)}`,
        customer_first_order: randomFrom([true, false]),
        other_sample_parameter: `value-${randomAlphaNumeric(4)}`,
      },
    },
    customer: {
      customer_id: randomDigits(9),
      email: `hipay.pos.${randomAlphaNumeric(6)}@test.com`,
      phone: `33${randomDigits(9)}`,
      first_name: randomFrom(['Cathy', 'Marc', 'Sophie', 'Julien']),
      last_name: randomFrom(['Doe', 'Martin', 'Bernard', 'Petit']),
    },
    pos_technical_info: {
      ...minimal.pos_technical_info,
      notify_url: 'https://hipay.com/notify',
      terminal_transaction_display: {
        ...minimal.pos_technical_info.terminal_transaction_display,
        force_authorization: true,
      },
    },
  };
}

/** Clone en profondeur le payload et supprime le champ situé au chemin (dot-path) donné. */
function removeField(payload, path) {
  const clone = JSON.parse(JSON.stringify(payload));
  const keys = path.split('.');
  let target = clone;
  for (let i = 0; i < keys.length - 1; i += 1) {
    target = target[keys[i]];
  }
  delete target[keys[keys.length - 1]];
  return clone;
}

/**
 * Masque le header Authorization dans toute reproduction de requête
 * (curl, logs) : aucune credential - même de test - ne doit apparaître en
 * clair dans le rapport d'exécution (cf. STRATEGY.md).
 */
function maskAuthorizationHeader(headers) {
  if (!headers.Authorization) return headers;
  return { ...headers, Authorization: 'Basic ***MASKED***' };
}

/** Reconstruit la commande curl exacte envoyée, avec l'auth masquée. */
function buildCurlCommand(baseUrl, payload, headers) {
  const safeHeaders = maskAuthorizationHeader(headers);
  const headerFlags = Object.entries(safeHeaders)
    .map(([key, value]) => `-H '${key}: ${value}'`)
    .join(' ');
  return `curl -X POST '${baseUrl}${ENDPOINT_PATH}' ${headerFlags} -d '${JSON.stringify(payload)}'`;
}

async function sendPaymentRequest(payload, auth) {
  const { baseUrl } = getConfig();
  // Identifiant de corrélation généré côté test et transmis au serveur, qui
  // le renvoie dans chaque réponse et le logue - permet de retrouver la
  // requête correspondante dans les logs côté serveur à partir du rapport.
  const requestId = crypto.randomUUID();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  };
  if (auth && auth.login !== undefined && auth.password !== undefined) {
    const token = Buffer.from(`${auth.login}:${auth.password}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }

  const response = await client().post(ENDPOINT_PATH, payload, { headers });

  // Attaché directement sur la réponse pour que la couche de reporting
  // (step definitions) puisse l'exploiter sans rien recalculer.
  response.diagnostics = {
    requestId,
    requestPayload: payload,
    curl: buildCurlCommand(baseUrl, payload, headers),
  };

  return response;
}

/**
 * Formate les éléments de preuve d'exécution pour une réponse donnée : curl
 * exact, payload envoyé, code de statut, corps de la réponse et request ID.
 * Destiné à être journalisé (I.say) pour apparaître dans le rapport.
 */
function describeResponse(response) {
  const { requestId, requestPayload, curl } = response.diagnostics;
  return [
    `curl : ${curl}`,
    `Payload envoyé : ${JSON.stringify(requestPayload)}`,
    `Code de statut : ${response.status}`,
    `Corps de la réponse : ${JSON.stringify(response.data)}`,
    `Request ID (corrélation logs) : ${requestId}`,
  ];
}

module.exports = {
  buildMinimalPayload,
  buildFullPayload,
  removeField,
  sendPaymentRequest,
  describeResponse,
};
