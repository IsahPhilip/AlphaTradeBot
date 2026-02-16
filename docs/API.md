# API Reference

## POST /api/connect
Create a temporary wallet connection request.

Request JSON:
- `userId` (number)
- `chatId` (number)

## POST /api/wallet-callback
Wallet web callback endpoint.

Request JSON:
- `connectionId` (string)
- `walletAddress` (string)
- `walletType` (string, optional)
- `publicKey` (string, optional)
- `userId` (number)
- `chatId` (number, optional)

## GET /api/connection/:connectionId
Fetch one pending/complete connection record.

## GET /api/connection-status/:userId
Fetch wallet connection status for a user.

## GET /health
Service health and dependency status.
