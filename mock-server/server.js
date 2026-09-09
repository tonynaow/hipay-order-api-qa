const express = require('express');
const crypto = require('crypto');

// NOTE IMPORTANTE : les messages retournés dans les réponses HTTP ci-dessous
// (error.message, error.description, valeurs comme "Success"/"Failure"...)
// reproduisent volontairement le contrat réel documenté par HiPay, qui est
// rédigé en anglais. Ils ne sont pas traduits afin de rester fidèles au
// comportement réel de l'API ; seuls les commentaires de ce fichier sont en
// français.

const app = express();
app.use(express.json());

const VALID_LOGIN = process.env.MOCK_API_LOGIN || 'test-login';
const VALID_PASSWORD = process.env.MOCK_API_PASSWORD || 'test-password';

function parseBasicAuth(header) {
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;
  return {
    login: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

// Identifiant de corrélation : repris du header X-Request-Id envoyé par le
// client s'il existe, sinon généré ici. Renvoyé dans chaque réponse (succès
// ET erreur) et journalisé côté serveur, pour permettre de retrouver la
// requête correspondante dans les logs à partir du rapport d'exécution.
function getRequestId(req) {
  return req.headers['x-request-id'] || crypto.randomUUID();
}

function logRequest(requestId, status, details) {
  console.log(`[mock-server] requestId=${requestId} POST /v1/connector/order -> ${status} (${details})`);
}

function unauthorized(res, details, requestId) {
  logRequest(requestId, 401, details);
  return res.status(401).json({
    requestId,
    error: {
      status: 401,
      code: 'connector.api.login.unauthorized',
      message: 'Unauthorized',
      description: 'The login has been rejected.',
      details,
    },
  });
}

function badRequest(res, path, fieldName, requestId) {
  logRequest(requestId, 400, `missing field ${path}`);
  return res.status(400).json({
    requestId,
    error: {
      status: 400,
      code: 'required.openapi.requestValidation',
      message: `should have required property '${fieldName}'`,
      description: `should have required property '${fieldName}'`,
      details: { path },
    },
  });
}

function getByPath(obj, path) {
  return path
    .split('.')
    .reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), obj);
}

// L'ordre n'a d'importance que pour la lisibilité : chaque champ est vérifié
// de toute façon, donc supprimer un seul champ signale toujours exactement
// le chemin de ce champ.
const REQUIRED_FIELDS = [
  'order.order_id',
  'order.transaction_type',
  'order.price',
  'order.price.amount',
  'order.price.currency',
  'pos_technical_info',
  'pos_technical_info.device_information',
  'pos_technical_info.device_information.serial_number',
  'pos_technical_info.device_information.manufacturer',
  'pos_technical_info.terminal_transaction_display',
  'pos_technical_info.terminal_transaction_display.protocol',
];

app.get('/v1/connector/healthcheck', (req, res) => {
  res.status(200).type('text/html').send('up');
});

app.post('/v1/connector/order', (req, res) => {
  const requestId = getRequestId(req);
  const authHeader = req.headers.authorization;
  const credentials = parseBasicAuth(authHeader);

  if (!authHeader) {
    return unauthorized(res, 'Authorization header not found', requestId);
  }
  if (!credentials) {
    return unauthorized(res, "Authorization header doesn't rely on HTTP Basic Authentication", requestId);
  }
  if (credentials.login !== VALID_LOGIN || credentials.password !== VALID_PASSWORD) {
    return unauthorized(res, 'Incorrect credentials', requestId);
  }

  const payload = req.body || {};

  const missingField = REQUIRED_FIELDS.find((path) => getByPath(payload, path) === undefined);
  if (missingField) {
    const fieldName = missingField.split('.').pop();
    return badRequest(res, missingField, fieldName, requestId);
  }

  const orderId = String(payload.order.order_id);

  // Simulation de scénario pilotée par une convention de préfixe sur order_id.
  // Cela permet à la suite BDD de déclencher de manière déterministe chaque
  // issue documentée, sans avoir besoin d'un vrai terminal POS physique.
  // Voir README.md.
  if (orderId.startsWith('FORBIDDEN_')) {
    logRequest(requestId, 403, 'passphrase not set');
    return res.status(403).json({
      requestId,
      error: {
        status: 403,
        code: 'connector.api.passphrase.notset',
        message: 'Forbidden',
        description: 'The passphrase used to secure the communication with the POS payment terminal was not set.',
      },
    });
  }

  if (orderId.startsWith('BADGATEWAY_')) {
    logRequest(requestId, 502, 'terminal unreachable');
    return res.status(502).json({
      requestId,
      error: {
        status: 502,
        code: 'connector.api.terminal.unreachable',
        message: 'Bad Gateway',
        description: 'The POS payment terminal could not be reached.',
      },
    });
  }

  if (orderId.startsWith('SERVERERROR_')) {
    logRequest(requestId, 500, 'internal error');
    return res.status(500).json({
      requestId,
      error: {
        status: 500,
        code: 'connector.api.internal',
        message: 'Internal Server Error',
        description: 'An unexpected condition prevented the server from fulfilling the request.',
      },
    });
  }

  if (orderId.startsWith('TIMEOUT_')) {
    // Simule le timeout documente de 10s pour l'acquittement du terminal POS,
    // raccourci ici pour que la suite reste rapide.
    setTimeout(() => {
      logRequest(requestId, 504, 'terminal acknowledgement timeout');
      res.status(504).json({
        requestId,
        error: {
          status: 504,
          code: 'connector.api.terminal.timeout',
          message: 'Gateway Timeout',
          description: 'The POS payment terminal did not acknowledge the request in time.',
        },
      });
    }, 200);
    return undefined;
  }

  let paymentStatus = 'Success';
  if (orderId.startsWith('FAIL_')) paymentStatus = 'Failure';
  if (orderId.startsWith('BUSY_')) paymentStatus = 'Busy';

  logRequest(requestId, 200, `paymentStatus=${paymentStatus}`);
  return res.status(200).json({
    requestId,
    paymentStatus,
    receipt: Buffer.from(`RECEIPT ${payload.order.price.amount} ${payload.order.price.currency}`).toString('base64'),
    errorCode: null,
    errorData: {},
    order: payload.order,
    customer: payload.customer || null,
    // NOTE : la documentation officielle HiPay renvoie cette section sous
    // une clé différente ("technical_pos_info") de celle utilisée dans le
    // corps de la requête ("pos_technical_info"). Ce mock reproduit
    // volontairement cette incohérence documentée afin que les tests de
    // contrat détectent un consommateur qui se fierait à la mauvaise clé.
    technical_pos_info: payload.pos_technical_info,
  });
});

const PORT = process.env.MOCK_SERVER_PORT || 3000;

/* istanbul ignore next */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Serveur mock de l'API Order HiPay en écoute sur le port ${PORT}`);
  });
}

module.exports = app;
