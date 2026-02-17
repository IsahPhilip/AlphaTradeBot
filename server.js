'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { z } = require('zod');
const { Telegraf } = require('telegraf');

const { setupBot } = require('./bot');
const database = require('./src/services/database');
const solana = require('./src/services/solana');
const walletConnection = require('./src/services/wallet-connection');

const app = express();

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_LAUNCH_TIMEOUT_MS = Number.parseInt(process.env.BOT_LAUNCH_TIMEOUT_MS || '60000', 10);
const BOT_LAUNCH_RETRY_MS = Number.parseInt(process.env.BOT_LAUNCH_RETRY_MS || '15000', 10);
const TELEGRAM_WEBHOOK_URL = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
const ALLOW_LOCAL_POLLING = String(process.env.ALLOW_LOCAL_POLLING || '').toLowerCase() === 'true';

const connectionCallbackSchema = z.object({
  connectionId: z.string().min(8),
  walletAddress: z.string().min(32),
  walletType: z.string().optional(),
  publicKey: z.string().optional(),
  userId: z.number().int().positive(),
  chatId: z.number().int().positive(),
  connToken: z.string().min(16),
  signature: z.string().min(16)
});

const createConnectionSchema = z.object({
  userId: z.number().int().positive(),
  chatId: z.number().int().positive()
});

const webPublicDir = path.join(__dirname, 'src', 'web', 'public');
const webJsDir = path.join(__dirname, 'src', 'web', 'js');
const publicDir = path.join(__dirname, 'public');
const logsDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/images', express.static(path.join(publicDir, 'images')));
app.use('/css', express.static(path.join(publicDir, 'css')));
app.use('/web-css', express.static(path.join(__dirname, 'src', 'web', 'css')));
app.use('/js', express.static(webJsDir));
app.use(express.static(webPublicDir));

let bot = null;
let httpServer = null;
let isShuttingDown = false;
let isBotRunning = false;
let botLaunchPromise = null;
let isBotLaunching = false;
let botLaunchRetryTimer = null;

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function clearBotLaunchRetry() {
  if (botLaunchRetryTimer) {
    clearTimeout(botLaunchRetryTimer);
    botLaunchRetryTimer = null;
  }
}

function scheduleBotLaunchRetry() {
  if (isShuttingDown || !bot || isBotRunning || botLaunchRetryTimer) {
    return;
  }

  botLaunchRetryTimer = setTimeout(() => {
    botLaunchRetryTimer = null;
    botLaunchPromise = launchBotWithRetry();
  }, BOT_LAUNCH_RETRY_MS);
}

function isBotConfigured() {
  return Boolean(BOT_TOKEN && BOT_TOKEN.includes(':') && !BOT_TOKEN.includes('your_'));
}

function createBot() {
  if (!isBotConfigured()) {
    console.warn('BOT_TOKEN is not configured, Telegram bot launch skipped.');
    return null;
  }

  const telegramBot = new Telegraf(BOT_TOKEN);
  setupBot(telegramBot);
  return telegramBot;
}

function shouldUsePolling() {
  if (!TELEGRAM_WEBHOOK_URL) {
    return true;
  }

  if (ALLOW_LOCAL_POLLING) {
    return true;
  }

  console.warn(
    'TELEGRAM_WEBHOOK_URL is configured; skipping local polling to avoid overriding webhook mode. ' +
      'Set ALLOW_LOCAL_POLLING=true to force polling.'
  );
  return false;
}

async function launchBotWithRetry() {
  if (!bot || isShuttingDown || isBotRunning || isBotLaunching) {
    return;
  }

  isBotLaunching = true;

  try {
    await withTimeout(bot.telegram.getMe(), 30000, 'Telegram getMe');
    await withTimeout(bot.launch({ dropPendingUpdates: true }), BOT_LAUNCH_TIMEOUT_MS, 'Telegram bot launch');
    isBotRunning = true;
    console.log('Telegram bot launched.');
  } catch (error) {
    isBotRunning = false;
    const message = error?.message || String(error);

    if (message.includes('409')) {
      console.warn('Telegram polling conflict (409). Another bot instance may already be running.');
    } else {
      console.warn(`Telegram bot launch failed: ${message}`);
    }

    try {
      await withTimeout(Promise.resolve(bot.stop('launch-failed')), 5000, 'Telegram bot stop');
    } catch (_stopError) {
      // Ignore stop failures; launch retry still needs to continue.
    }

    scheduleBotLaunchRetry();
  } finally {
    isBotLaunching = false;
  }
}

async function initializeServices() {
  await database.connect();

  try {
    await solana.connect();
  } catch (error) {
    console.error('Solana initialization failed:', error.message);
    console.warn('Continuing startup with degraded Solana connectivity.');
  }

  bot = createBot();

  if (bot && shouldUsePolling()) {
    botLaunchPromise = launchBotWithRetry();
    await Promise.resolve(botLaunchPromise);
  }
}

app.get('/', (_req, res) => {
  res.json({
    name: 'AlphaTradeBot',
    status: 'ok',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (_req, res) => {
  const dbHealth = await database.healthCheck();
  const response = {
    status: dbHealth.status === 'healthy' ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    bot: { running: isBotRunning },
    database: dbHealth,
    solana: { connected: Boolean(solana.connection) }
  };

  const statusCode = response.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(response);
});

app.get('/connect-wallet', (_req, res) => {
  res.sendFile(path.join(webPublicDir, 'index.html'));
});

app.post('/api/connect', async (req, res, next) => {
  try {
    const input = createConnectionSchema.parse(req.body);
    const payload = await walletConnection.createConnectionRequest(input.userId, input.chatId);
    res.status(201).json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
});

app.get('/api/connection/:connectionId', async (req, res, next) => {
  try {
    const connection = await walletConnection.getConnection(req.params.connectionId);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }

    return res.json({ success: true, connection });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/connection-status/:userId', async (req, res, next) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }

    const status = await walletConnection.checkConnectionStatus(userId);
    return res.json({ success: true, ...status });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/wallet-callback', async (req, res, next) => {
  try {
    const payload = connectionCallbackSchema.parse(req.body);
    const result = await walletConnection.handleWalletCallback(payload);

    if (!result.success) {
      return res.status(400).json(result);
    }

    if (bot && payload.chatId) {
      const walletName = result.wallet?.name || 'Wallet';
      const walletAddress = result.wallet?.address || payload.walletAddress;
      const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`;

      await bot.telegram.sendMessage(
        payload.chatId,
        `✅ Wallet connected: ${walletName}\nAddress: ${shortAddress}`
      );
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request payload',
      details: error.issues
    });
  }

  if (String(error?.message || '').includes('public HTTP(S) URL')) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  console.error('Unhandled server error:', error);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

async function startServer() {
  await initializeServices();

  await new Promise((resolve) => {
    httpServer = app.listen(PORT, HOST, () => {
      console.log(`Server listening on http://${HOST}:${PORT}`);
      resolve();
    });
  });

  return { app, bot, httpServer };
}

async function stopServer(signal = 'shutdown') {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  clearBotLaunchRetry();

  if (bot) {
    try {
      await withTimeout(Promise.resolve(bot.stop(signal)), 5000, 'Telegram bot stop');
    } catch (error) {
      console.warn('Telegram bot stop failed:', error.message);
    }
    isBotRunning = false;
    botLaunchPromise = null;
  }

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await database.disconnect();
}

// Export Express app directly so platforms like Vercel can treat this file
// as a valid function/server entrypoint. Keep lifecycle helpers as properties
// for local runtime (`index.js`) compatibility.
app.startServer = startServer;
app.stopServer = stopServer;

module.exports = app;
module.exports.app = app;
module.exports.startServer = startServer;
module.exports.stopServer = stopServer;
