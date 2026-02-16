'use strict';

const crypto = require('crypto');

const bytes = Number.parseInt(process.argv[2] || '32', 10);
if (!Number.isInteger(bytes) || bytes <= 0) {
  console.error('Usage: node scripts/generate-random-hex.js [bytes]');
  process.exit(1);
}

console.log(crypto.randomBytes(bytes).toString('hex'));
