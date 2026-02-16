'use strict';

const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');

module.exports = async function connectHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  await bootstrap();

  const { userId, chatId } = req.body || {};

  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(chatId) || chatId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid userId/chatId' });
  }

  try {
    const payload = await walletConnection.createConnectionRequest(userId, chatId);
    return res.status(201).json({ success: true, ...payload });
  } catch (error) {
    if (String(error?.message || '').includes('public HTTP(S) URL')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    console.error('Connect handler error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

