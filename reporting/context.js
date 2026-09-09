// Pont léger entre les step definitions Gherkin (qui n'ont accès qu'au
// contexte "World" du scénario) et l'objet Test Mocha réel que CodeceptJS
// crée en interne pour chaque scénario. Nécessaire pour pouvoir attacher des
// informations (curl, payload, requestId...) au rapport mochawesome via son
// API addContext, qui attend un objet Test Mocha, pas un World Cucumber.

let currentTest = null;

function setCurrentTest(test) {
  currentTest = test;
  if (currentTest) {
    currentTest.diagnosticsLines = [];
  }
}

function addDiagnosticLine(line) {
  if (currentTest) {
    currentTest.diagnosticsLines = currentTest.diagnosticsLines || [];
    currentTest.diagnosticsLines.push(line);
  }
}

function getCurrentTest() {
  return currentTest;
}

module.exports = { setCurrentTest, addDiagnosticLine, getCurrentTest };
