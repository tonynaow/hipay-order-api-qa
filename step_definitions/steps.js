const assert = require('assert');
const orderApi = require('../pageobjects/orderApi');
const { getConfig } = require('../config/environments');
const { addDiagnosticLine } = require('../reporting/context');

const { I } = inject();

// NB : l'utilisation de `function` classique (et non de fonctions fléchées) est
// volontaire ici, afin que `this` corresponde au contexte ("World") partagé
// entre les étapes Given/When/Then d'un même scénario - c'est la façon
// documentée de faire transiter un état entre les étapes en BDD CodeceptJS.

Given('un payload de paiement avec uniquement les champs obligatoires', function () {
  this.payload = orderApi.buildMinimalPayload();
});

Given('un payload de paiement complet', function () {
  this.payload = orderApi.buildFullPayload();
});

Given('un payload dont le champ {string} est manquant', function (fieldPath) {
  this.payload = orderApi.removeField(orderApi.buildMinimalPayload(), fieldPath);
});

Given('un payload de paiement simulant un terminal POS déconnecté', function () {
  this.payload = orderApi.buildMinimalPayload({ order_id: `BADGATEWAY_${Date.now()}` });
});

Given('je suis authentifié avec des identifiants valides', function () {
  this.auth = getConfig();
});

Given('je ne suis pas authentifié', function () {
  this.auth = null;
});

Given('je suis authentifié avec des identifiants invalides', function () {
  this.auth = { login: 'invalid-login', password: 'invalid-password' };
});

When("j'envoie la demande de paiement", async function () {
  this.response = await orderApi.sendPaymentRequest(this.payload, this.auth);
  // Journalise les preuves d'exécution (curl, payload, statut, réponse,
  // request ID) : visibles en console (I.say) et attachées au rapport
  // mochawesome (addDiagnosticLine -> reporting/mochawesomeContextPlugin.js)
  // pour granularité et corrélation avec les logs serveur.
  orderApi.describeResponse(this.response).forEach((line) => {
    I.say(line);
    addDiagnosticLine(line);
  });
});

Then('le code de statut de la réponse doit être {int}', function (code) {
  assert.strictEqual(this.response.status, code);
});

Then('le statut du paiement doit être {string}', function (status) {
  assert.strictEqual(this.response.data.paymentStatus, status);
});

Then("le code d'erreur doit être {string}", function (code) {
  assert.strictEqual(this.response.data.error.code, code);
});

Then("le chemin de l'erreur doit être {string}", function (path) {
  assert.strictEqual(this.response.data.error.details.path, path);
});

// Assertions de cohérence de contrat : les données échomatiquement renvoyées
// par l'API doivent correspondre exactement à ce qui a été envoyé. Grâce aux
// payloads générés dynamiquement (voir orderApi.js), ces comparaisons sont
// réellement probantes et ne reposent pas sur deux constantes coïncidentes.

Then('les données de la commande dans la réponse doivent correspondre à la demande', function () {
  assert.deepStrictEqual(this.response.data.order, this.payload.order);
});

Then('les données client dans la réponse doivent correspondre à la demande', function () {
  assert.deepStrictEqual(this.response.data.customer, this.payload.customer || null);
});

Then('les informations techniques du terminal dans la réponse doivent correspondre à la demande', function () {
  assert.deepStrictEqual(this.response.data.technical_pos_info, this.payload.pos_technical_info);
});
