# Troubleshooting

## Bot not starting

- Verify `BOT_TOKEN` is valid.
- Ensure dependencies are installed with `npm install`.

## Wallet connect callback failing

- Verify `BACKEND_URL` and `WEB_APP_URL` are reachable.
- Ensure `/api/wallet-callback` accepts POST from browser app.

## MongoDB errors

- Verify `MONGODB_URI`.
- If unavailable, app falls back to memory mode (non-persistent).

## Solana RPC errors

- Provide `SOLANA_RPC_HELIUS` or `SOLANA_RPC_QUICKNODE` for better reliability.
