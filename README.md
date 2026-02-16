# AlphaTradeBot

Telegram + Solana wallet connection bot with browser-based wallet linking.

## Quick Start

1. Install dependencies:
   `npm install`
2. Copy env template:
   `cp .env.example .env`
3. Configure required env vars in `.env`.
4. Start locally:
   `npm run dev`

## Production

- Use a real MongoDB URI.
- Set strong `ENCRYPTION_KEY`, `JWT_SECRET`, and `SESSION_SECRET`.
- Set `NODE_ENV=production`.
- Start with `npm start` or PM2 using `ecosystem.config.js`.

## Endpoints

- `GET /health`
- `GET /connect-wallet`
- `POST /api/connect`
- `POST /api/wallet-callback`
- `GET /api/connection/:connectionId`
- `GET /api/connection-status/:userId`
