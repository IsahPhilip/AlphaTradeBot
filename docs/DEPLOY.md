# Deployment

## Docker

1. Build: `docker build -t alpha-trade-bot .`
2. Run: `docker run --env-file .env -p 3000:3000 alpha-trade-bot`

## Railway

- Uses `railway.json` with `npm start`.

## Vercel

- API handlers exist in `api/*.js`.
- Full long-running Telegram process is best deployed on Railway/VM, not Vercel serverless.

## PM2

- Start: `pm2 start ecosystem.config.js --env production`
