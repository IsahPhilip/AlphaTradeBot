'use strict';

module.exports = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  quicknodeUrl: process.env.SOLANA_RPC_QUICKNODE || '',
  heliusUrl: process.env.SOLANA_RPC_HELIUS || '',
  commitment: 'confirmed'
};
