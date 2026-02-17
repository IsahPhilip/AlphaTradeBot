'use strict';

const database = require('../../src/services/database');
const solana = require('../../src/services/solana');

async function bootstrap(options = {}) {
  const { withSolana = false } = options;

  // Always attempt to connect to database on API calls to ensure we're not in memory mode
  if (!database.db) {
    await database.connect();
  }

  if (withSolana && !solana.connection) {
    try {
      await solana.connect();
    } catch (error) {
      console.warn('Solana bootstrap warning:', error.message);
    }
  }
}

module.exports = {
  bootstrap
};

