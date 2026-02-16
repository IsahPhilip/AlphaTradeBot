'use strict';

class NotificationService {
  constructor() {
    this.telegramBot = null;
  }

  attachBot(bot) {
    this.telegramBot = bot;
  }

  async sendTelegram(chatId, message) {
    if (!this.telegramBot) {
      return { success: false, error: 'Telegram bot not attached' };
    }

    try {
      await this.telegramBot.telegram.sendMessage(chatId, message);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationService();
