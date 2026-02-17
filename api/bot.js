'use strict';

const { getBot } = require('./_lib/telegram');

module.exports = async function botHandler(req, res) {
  const webhookUrl = (process.env.TELEGRAM_WEBHOOK_URL || '').trim() || null;

  if (req.method === 'POST') {
    const secret = process.env.WEBHOOK_ADMIN_SECRET;
    const provided = req.headers['x-webhook-admin-secret'];

    if (!secret || provided !== secret) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'TELEGRAM_WEBHOOK_URL is not configured'
      });
    }

    try {
      const bot = getBot();
      const result = await bot.telegram.setWebhook(webhookUrl);
      return res.status(200).json({ success: true, result, webhookUrl });
    } catch (error) {
      console.error('Set webhook error:', error);
      return res.status(500).json({ success: false, error: 'Failed to set webhook' });
    }
  }

  try {
    const bot = getBot();
    const info = await bot.telegram.getWebhookInfo();
    return res.status(200).json({
      success: true,
      webhookInfo: info,
      expectedWebhookUrl: webhookUrl || null
    });
  } catch (error) {
    console.error('Get webhook info error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get webhook info' });
  }
};
