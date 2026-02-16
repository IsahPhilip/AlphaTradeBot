'use strict';

const { z } = require('zod');

const envSchema = z.object({
  BOT_TOKEN: z.string().min(10).optional(),
  ENCRYPTION_KEY: z.string().min(32),
  SESSION_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16)
});

function validateEnv(env = process.env) {
  const result = envSchema.safeParse(env);
  return {
    valid: result.success,
    errors: result.success ? [] : result.error.issues
  };
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

module.exports = {
  validateEnv,
  isPositiveNumber
};
