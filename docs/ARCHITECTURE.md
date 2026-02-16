# Architecture

- `index.js`: process bootstrap and signal handling.
- `server.js`: Express app, Telegram startup, and runtime wiring.
- `bot.js`: primary Telegram command/callback implementation.
- `src/services/database.js`: MongoDB + in-memory data abstraction.
- `src/services/solana.js`: RPC operations, balances, transfers, and market data.
- `src/services/wallet-connection.js`: browser wallet linking lifecycle.
- `src/web`: wallet connection frontend.
