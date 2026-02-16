'use strict';

const database = require('../src/services/database');

(async () => {
  try {
    await database.connect();
    const health = await database.healthCheck();
    console.log('Migration baseline complete:', health);
    await database.disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();
