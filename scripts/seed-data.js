'use strict';

const database = require('../src/services/database');

(async () => {
  try {
    await database.connect();

    await database.createUser({
      userId: 1000001,
      username: 'seed_user',
      firstName: 'Seed',
      lastName: 'User',
      joinedAt: new Date()
    });

    console.log('Seed data inserted.');
    await database.disconnect();
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
})();
