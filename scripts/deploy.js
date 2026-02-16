'use strict';

const requiredVars = [
  'BOT_TOKEN',
  'ENCRYPTION_KEY',
  'SESSION_SECRET',
  'JWT_SECRET'
];

const missing = requiredVars.filter((name) => !process.env[name]);

if (missing.length) {
  console.error('Deployment check failed. Missing env vars:', missing.join(', '));
  process.exit(1);
}

console.log('Deployment check passed.');
