'use strict';

const { Telegraf } = require('telegraf');
const { setupBot } = require('../../bot');

let botInstance = null;

function getBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN is not configured');
  }

  if (!botInstance) {
    const bot = new Telegraf(token);
    setupBot(bot);
    botInstance = bot;
  }

  return botInstance;
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  const bot = getBot();
  return bot.telegram.sendMessage(chatId, text, extra);
}

module.exports = {
  getBot,
  sendTelegramMessage
};

