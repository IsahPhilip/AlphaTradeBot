'use strict';

module.exports = {
  APP_NAME: process.env.BOT_NAME || 'Alpha Trading Bot',
  BOT_USERNAME: process.env.BOT_USERNAME || 'AlphaTradinBot',
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: (process.env.NODE_ENV || 'development') === 'production',
  PORT: Number.parseInt(process.env.PORT || '3000', 10),
  MAX_WALLETS_PER_USER: Number.parseInt(process.env.MAX_WALLETS_PER_USER || '10', 10),
  CONNECTION_TIMEOUT_SECONDS: Number.parseInt(process.env.CONNECTION_TIMEOUT || '300', 10),
  MIN_SOL_BALANCE: Number.parseFloat(process.env.MIN_SOL_BALANCE || '0.01'),
  MAX_SLIPPAGE: Number.parseFloat(process.env.MAX_SLIPPAGE || '20'),
  SNIPER_DELAY_MS: Number.parseInt(process.env.SNIPER_DELAY_MS || '500', 10)
};
