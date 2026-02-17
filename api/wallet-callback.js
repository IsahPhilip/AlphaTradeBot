'use strict';

const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');
const { sendTelegramMessage } = require('./_lib/telegram');

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

  if (result.success && payload.chatId) {
    try {
      const walletName = result.wallet?.name || 'Wallet';
      const walletAddress = result.wallet?.address || payload.walletAddress;
      const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`;

      await sendTelegramMessage(
        payload.chatId,
        `✅ Wallet connected: ${walletName}\nAddress: ${shortAddress}`
      );
    } catch (error) {
      console.warn('Failed to send Telegram wallet confirmation:', error.message);
    }
  }

  const status = result.success ? 200 : 400;
  return res.status(status).json(result);
};
