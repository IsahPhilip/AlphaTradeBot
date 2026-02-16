'use strict';

const crypto = require('crypto');

function maskSecret(secret, visible = 4) {
  if (!secret) return '';
  if (secret.length <= visible * 2) return '*'.repeat(secret.length);
  return `${secret.slice(0, visible)}${'*'.repeat(secret.length - visible * 2)}${secret.slice(-visible)}`;
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

module.exports = {
  maskSecret,
  sha256
};
