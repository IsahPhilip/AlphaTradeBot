'use strict';

const solana = require('./solana');

class PriceService {
  async getSOLSnapshot() {
    const [price, change24h, volume24h] = await Promise.all([
      solana.getSOLPrice(),
      solana.getSOLChange(),
      solana.get24hVolume()
    ]);

    return {
      symbol: 'SOL',
      price,
      change24h,
      volume24h,
      timestamp: new Date().toISOString()
    };
  }

  async getTokenPrice(tokenAddress) {
    return solana.getTokenPrice(tokenAddress);
  }
}

module.exports = new PriceService();
