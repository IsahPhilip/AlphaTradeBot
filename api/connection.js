'use strict';

const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');

module.exports = async function connectionHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  await bootstrap();

  const connectionId = String(req.query?.connectionId || '').trim();
  if (!connectionId) {
    return res.status(400).json({ success: false, error: 'Missing connectionId' });
  }

  try {
    const connection = await walletConnection.getConnection(connectionId);
    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    return res.status(200).json({ success: true, connection });
  } catch (error) {
    console.error('Connection handler error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

