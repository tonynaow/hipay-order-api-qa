const { event } = require('codeceptjs');
const addContext = require('mochawesome/addContext');
const { setCurrentTest } = require('./context');

/**
 * Plugin CodeceptJS : capture le test Mocha en cours au démarrage de chaque
 * scénario, puis attache au rapport mochawesome (via addContext) toutes les
 * lignes de diagnostic accumulées pendant son exécution (curl, payload,
 * statut, corps de réponse, request ID). Sans effet si le run n'utilise pas
 * le reporter mochawesome.
 */
module.exports = function mochawesomeContextPlugin() {
  event.dispatcher.on(event.test.started, (test) => {
    setCurrentTest(test);
  });

  event.dispatcher.on(event.test.finished, (test) => {
    if (!test || !test.diagnosticsLines) return;
    // addContext attend un objet "contexte de test" au sens Mocha (celui
    // qu'on obtiendrait via `this` dans un `it(function () {...})`), donc
    // avec une propriete `.test` pointant vers le Test - pas le Test lui-meme.
    test.diagnosticsLines.forEach((line) => {
      try {
        addContext({ test }, line);
      } catch {
        // Le reporter actif n'est pas mochawesome (ex: run sans --reporter) :
        // pas de rapport à enrichir, on ignore silencieusement.
      }
    });
  });
};
