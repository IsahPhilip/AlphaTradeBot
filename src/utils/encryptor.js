'use strict';

const crypto = require('crypto');

function getKey() {
  const base = process.env.ENCRYPTION_KEY || '';
  if (!base) {
    throw new Error('ENCRYPTION_KEY is required for encryption operations.');
  }
  return crypto.createHash('sha256').update(base).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(payload) {
  const [ivHex, encrypted] = String(payload).split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted payload format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
