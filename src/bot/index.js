'use strict';

const { Telegraf } = require('telegraf');
const { setupBot } = require('../../bot');

function createBot(token) {
  const bot = new Telegraf(token);
  setupBot(bot);
  return bot;
}

module.exports = {
  createBot
};
