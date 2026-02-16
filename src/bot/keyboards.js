'use strict';

const { Markup } = require('telegraf');

function getBackToMainKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Back', 'main_menu')]]);
}

module.exports = {
  getBackToMainKeyboard
};
