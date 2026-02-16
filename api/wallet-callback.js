'use strict';

const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');

module.exports = async function walletCallbackHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  await bootstrap({ withSolana: true });

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }
  }

  const result = await walletConnection.handleWalletCallback(payload);
  const status = result.success ? 200 : 400;
  return res.status(status).json(result);
};
