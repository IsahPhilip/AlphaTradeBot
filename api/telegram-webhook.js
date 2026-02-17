'use strict';

const { bootstrap } = require('./_lib/bootstrap');
const { getBot } = require('./_lib/telegram');

module.exports = async function telegramWebhookHandler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Telegram webhook endpoint is active'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Keep webhook handling fast on serverless to avoid Telegram retries/timeouts.
    await bootstrap({ withSolana: false });

    let update = req.body || {};
    if (typeof update === 'string') {
      update = JSON.parse(update);
    }

    const bot = getBot();
    await bot.handleUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
};
