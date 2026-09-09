require('dotenv').config();
const { getConfig } = require('./config/environments');

const env = getConfig();

exports.config = {
  tests: './*_test.js',
  output: './output',
  timeout: 30,
  helpers: {
    // Conservé configuré à des fins de documentation/cohérence, même si
    // l'API Object Order utilise son propre client axios (voir
    // pageobjects/orderApi.js) pour garder un contrôle total sur les
    // réponses non-2xx sans lever d'exception.
    REST: {
      endpoint: env.baseUrl,
      defaultHeaders: {
        Accept: 'application/json',
      },
    },
  },
  gherkin: {
    features: './features/*.feature',
    steps: ['./step_definitions/steps.js'],
  },
  plugins: {
    mochawesomeContext: {
      enabled: true,
      require: './reporting/mochawesomeContextPlugin.js',
    },
  },
  name: 'hipay-order-api-qa',
};
