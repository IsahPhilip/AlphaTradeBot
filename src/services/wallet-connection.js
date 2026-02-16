// services/wallet-connection.js
const crypto = require('crypto');
const database = require('./database');
const solana = require('./solana');

class WalletConnectionService {
    constructor() {
        this.pendingConnections = new Map(); // For memory mode
        this.WEB_APP_URL = process.env.WEB_APP_URL || 'https://yourdomain.com/connect-wallet';
        this.TELEGRAM_WEB_APP_URL = process.env.TELEGRAM_WEB_APP_URL || this.WEB_APP_URL;
        this.BACKEND_URL = process.env.BACKEND_URL || '';
        this.BOT_USERNAME = process.env.BOT_USERNAME || 'SolanaWebBot';
        
        // Start cleanup job
        this.startCleanupJob();
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
        browserUrl.searchParams.set('returnTo', `https://t.me/${this.BOT_USERNAME}`);

        return browserUrl.toString();
    }

    /**
     * Generate unique connection ID and return browser link
     */
    async initiateWalletConnection(userId, chatId) {
        try {
            // Generate unique connection ID
            const connectionId = crypto.randomBytes(16).toString('hex');
            
            // Create connection data
            const connectionData = {
                connectionId,
                userId: parseInt(userId),
                chatId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (5 * 60 * 1000)), // 5 minutes
                status: 'pending'
            };

            const browserUrl = this.buildBrowserUrl(connectionId, userId, chatId);
            
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
     * Handle callback from web page with wallet address
     */
    async handleWalletCallback(data) {
        try {
            const { connectionId, walletAddress, walletType, publicKey, userId, chatId } = data;
            
            // Validate connection exists and is pending
            const connection = await database.getPendingConnection(connectionId);
            
            if (!connection) {
                throw new Error('Connection not found or expired');
            }
            
            if (connection.status !== 'pending') {
                throw new Error('Connection already used');
            }
            
            if (new Date() > new Date(connection.expiresAt)) {
                throw new Error('Connection link expired');
            }
            
            // Validate wallet address
            if (!solana.isValidAddress(walletAddress)) {
                throw new Error('Invalid wallet address');
            }
            
            // Check if wallet already exists for this user
            const existingWallets = await database.getUserWallets(userId);
            const existingWallet = existingWallets.find(w => w.address === walletAddress);
            
            if (existingWallet) {
                // Wallet already connected, just activate it
                await database.setActiveWallet(userId, existingWallet.id);
                
                // Complete connection
                await database.completeConnection(connectionId, walletAddress);
                
                return {
                    success: true,
                    wallet: existingWallet,
                    message: 'Wallet already connected and activated',
                    isNew: false
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
            
            const wallet = await database.addWallet(userId, walletData);
            
            // Complete connection
            await database.completeConnection(connectionId, walletAddress);
            
            // Fetch recent transactions
            const recentTxs = await solana.getRecentTransactions(walletAddress, 5);
            if (recentTxs.length > 0) {
                for (const tx of recentTxs) {
                    await database.addTransaction(userId, wallet.id, {
                        type: tx.type,
                        amount: tx.amount,
                        signature: tx.signature,
                        status: tx.status,
                        timestamp: tx.timestamp
                    });
                }
            }
            
            return {
                success: true,
                wallet,
                balance,
                isNew: true
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
            // Check if user already has pending connection
            const existing = await database.getPendingConnectionByUser(userId);
            
            if (existing) {
                // Return existing connection
                return {
                    connectionId: existing.connectionId,
                    browserUrl: this.buildBrowserUrl(existing.connectionId, userId, chatId),
                    expiresAt: existing.expiresAt,
                    isNew: false
                };
            }
            
            // Create new connection
            return await this.initiateWalletConnection(userId, chatId);
            
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
        // Browser wallet providers perform ownership checks before exposing public keys.
        return {
            verified: true,
            method: 'browser_connection'
        };
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
