'use strict';

const database = require('../src/services/database');
const { bootstrap } = require('./_lib/bootstrap');

module.exports = async function healthHandler(_req, res) {
  await bootstrap();
  const dbHealth = await database.healthCheck();
  const status = dbHealth.status === 'healthy' ? 200 : 503;

  res.status(status).json({
    status: dbHealth.status,
    timestamp: new Date().toISOString(),
    database: dbHealth
  });
};
