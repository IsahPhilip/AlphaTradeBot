'use strict';

const { z } = require('zod');
const walletConnection = require('../src/services/wallet-connection');
const { bootstrap } = require('./_lib/bootstrap');
const { sendTelegramMessage } = require('./_lib/telegram');

const callbackPayloadSchema = z.object({
  connectionId: z.string().min(8),
  walletAddress: z.string().min(32),
  walletType: z.string().optional(),
  publicKey: z.string().optional(),
  userId: z.number().int().positive(),
  chatId: z.number().int().positive(),
  connToken: z.string().min(16),
  signature: z.string().min(16)
});

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

  const parseResult = callbackPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload',
      details: parseResult.error.issues
    });
  }

  const normalizedPayload = parseResult.data;
  const result = await walletConnection.handleWalletCallback(normalizedPayload);

  if (result.success && normalizedPayload.chatId) {
    try {
      const walletName = result.wallet?.name || 'Wallet';
      const walletAddress = result.wallet?.address || normalizedPayload.walletAddress;
      const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`;

      await sendTelegramMessage(
        normalizedPayload.chatId,
        `✅ Wallet connected: ${walletName}\nAddress: ${shortAddress}`
      );
    } catch (error) {
      console.warn('Failed to send Telegram wallet confirmation:', error.message);
    }
  }

  const status = result.success ? 200 : 400;
  return res.status(status).json(result);
};
