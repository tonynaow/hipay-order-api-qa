require('dotenv').config();

const environments = {
  mock: {
    baseUrl: process.env.MOCK_BASE_URL || 'http://localhost:3000',
    login: process.env.MOCK_API_LOGIN || 'test-login',
    password: process.env.MOCK_API_PASSWORD || 'test-password',
  },
  stage: {
    baseUrl: process.env.HIPAY_STAGE_BASE_URL || 'https://cloudrun-api-yugcnet4yq-ew.a.run.app',
    login: process.env.HIPAY_API_LOGIN,
    password: process.env.HIPAY_API_PASSWORD,
  },
};

/**
 * Résout la configuration de l'environnement de test actif à partir de TEST_ENV.
 * Échoue rapidement (fail-fast) si TEST_ENV=stage est demandé sans credentials
 * réelles, plutôt que de laisser chaque scénario échouer un par un avec un
 * 401 peu explicite.
 */
function getConfig() {
  const envName = process.env.TEST_ENV || 'mock';
  const envConfig = environments[envName];

  if (!envConfig) {
    throw new Error(
      `Environnement TEST_ENV "${envName}" inconnu. Valeurs attendues : ${Object.keys(environments).join(', ')}`,
    );
  }

  if (envName === 'stage' && (!envConfig.login || !envConfig.password)) {
    throw new Error(
      "Variables d'environnement HIPAY_API_LOGIN / HIPAY_API_PASSWORD manquantes, requises pour TEST_ENV=stage. "
      + 'Elles doivent être fournies via des secrets CI ou des variables d\'environnement locales, jamais committées dans le dépôt.',
    );
  }

  return { ...envConfig, name: envName };
}

module.exports = { getConfig, environments };
