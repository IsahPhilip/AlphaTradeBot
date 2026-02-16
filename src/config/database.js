'use strict';

module.exports = {
  uri: process.env.MONGODB_URI || '',
  dbName: process.env.MONGODB_DB || 'solana-web-bot',
  options: {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  }
};
