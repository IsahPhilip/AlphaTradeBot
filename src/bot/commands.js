'use strict';

function registerCommands(bot) {
  bot.command('ping', async (ctx) => ctx.reply('pong'));
}

module.exports = {
  registerCommands
};
