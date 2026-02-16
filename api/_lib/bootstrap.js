'use strict';

const database = require('../../src/services/database');
const solana = require('../../src/services/solana');

async function bootstrap(options = {}) {
  const { withSolana = false } = options;

  if (!database.db && !database.memoryMode) {
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

