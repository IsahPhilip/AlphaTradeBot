'use strict';

const solana = require('./solana');

class SniperService {
  async execute({ tokenAddress, amountSOL, slippage, wallet }) {
    return solana.executeSnipe(tokenAddress, amountSOL, slippage, wallet);
  }
}

module.exports = new SniperService();
