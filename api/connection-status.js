'use strict';

const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');

module.exports = async function connectionStatusHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  await bootstrap();

  const userId = Number.parseInt(req.query?.userId, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid userId' });
  }

  try {
    const status = await walletConnection.checkConnectionStatus(userId);
    return res.status(200).json({ success: true, ...status });
  } catch (error) {
    console.error('Connection status handler error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

