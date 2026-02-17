// services/database.js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.memoryMode = false;
        this.connectPromise = null;
        this.lastConnectionError = null;
        this.lastConnectionAttemptAt = null;
        this.lastConnectionSuccessAt = null;
        this.lastConnectionTarget = null;
        
        // In-memory storage for development
        this.users = new Map();
        this.wallets = new Map();
        this.trades = new Map();
        this.connections = new Map();
        this.settings = new Map();
    }

    /**
     * Connect to MongoDB or use in-memory mode
     */
    async connect() {
        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = this._connectInternal();

        try {
            await this.connectPromise;
        } finally {
            this.connectPromise = null;
        }
    }

    _normalizeMongoUri(rawUri) {
        if (typeof rawUri !== 'string') {
            return '';
        }

        let uri = rawUri.trim();

        // Vercel/env dashboards are often pasted with wrapping quotes.
        if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
            uri = uri.slice(1, -1).trim();
        }

        return uri;
    }

    _formatMongoTarget(uri) {
        try {
            const parsed = new URL(uri);
            return `${parsed.protocol}//${parsed.hostname}`;
        } catch (_error) {
            return 'invalid-uri';
        }
    }

    _getMongoOptions() {
        const family = parseInt(process.env.MONGODB_IP_FAMILY || '4', 10);

        return {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            tls: true,
            appName: process.env.MONGODB_APP_NAME || 'AlphaTradeBot',
            ...(family === 4 || family === 6 ? { family } : {})
        };
    }

    async _connectInternal() {
        try {
            if (this.db && !this.memoryMode) {
                return;
            }

            const rawUri = process.env.MONGODB_URI;
            const uri = this._normalizeMongoUri(rawUri);
            const dbName = process.env.MONGODB_DB || 'solana-web-bot';
            this.lastConnectionAttemptAt = new Date().toISOString();
            
            console.log('🔍 MongoDB connection attempt - URI:', uri ? 'Found' : 'Not found');
            
            if (!uri) {
                console.log('⚠️  No MONGODB_URI found - using in-memory database');
                console.log('📝 Data will be lost when bot restarts');
                this.memoryMode = true;
                return;
            }

            if (/\r|\n/.test(uri)) {
                throw new Error('MONGODB_URI contains newline characters. Remove line breaks in Vercel env.');
            }

            const target = this._formatMongoTarget(uri);
            const options = this._getMongoOptions();
            this.lastConnectionTarget = target;
            console.log(`🔌 MongoDB target: ${target} (db=${dbName}, tls=true, family=${options.family || 'auto'})`);

            this.client = new MongoClient(uri, options);

            await this.client.connect();
            this.db = this.client.db(dbName);
            
            // Create indexes for better performance
            await this.createIndexes();
            
            console.log('✅ Connected to MongoDB');
            
            // Test connection
            await this.db.admin().ping();
            console.log('✅ Database ping successful');
            this.memoryMode = false;
            this.lastConnectionError = null;
            this.lastConnectionSuccessAt = new Date().toISOString();

        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            if (error?.cause?.message) {
                console.error('❌ MongoDB root cause:', error.cause.message);
            }
            console.log('⚠️  Falling back to in-memory database');
            this.memoryMode = true;
            this.db = null;
            this.client = null;
            this.lastConnectionError = error?.cause?.message || error.message || 'Unknown MongoDB connection error';
        }
    }

    /**
     * Create database indexes
     */
    async createIndexes() {
        if (this.memoryMode || !this.db) return;

        try {
            const users = this.db.collection('users');
            await users.createIndex({ userId: 1 }, { unique: true });
            await users.createIndex({ referralCode: 1 }, { unique: true, sparse: true });
            await users.createIndex({ username: 1 });

            const wallets = this.db.collection('wallets');
            await wallets.createIndex({ userId: 1 });
            await wallets.createIndex({ address: 1 }, { unique: true });
            await wallets.createIndex({ 'userId': 1, 'isActive': 1 });

            const trades = this.db.collection('trades');
            await trades.createIndex({ userId: 1 });
            await trades.createIndex({ timestamp: -1 });
            await trades.createIndex({ walletId: 1 });

            const connections = this.db.collection('connections');
            await connections.createIndex({ connectionId: 1 }, { unique: true });
            await connections.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

            console.log('✅ Database indexes created');
        } catch (error) {
            console.error('Error creating indexes:', error);
        }
    }

    /**
     * Disconnect from database
     */
    async disconnect() {
        if (this.client && !this.memoryMode) {
            await this.client.close();
            console.log('✅ Disconnected from MongoDB');
        }
    }

    // ============================================
    // USER OPERATIONS
    // ============================================

    /**
     * Get user by userId
     */
    async getUser(userId) {
        if (this.memoryMode) {
            return this.users.get(userId) || null;
        }

        try {
            return await this.db.collection('users').findOne({ userId: parseInt(userId) });
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }

    /**
     * Create new user
     */
    async createUser(userData) {
        const user = {
            userId: parseInt(userData.userId),
            username: userData.username || '',
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            referralCode: userData.referralCode || this.generateReferralCode(userData.userId),
            referredBy: userData.referredBy || null,
            referrals: [],
            joinedAt: userData.joinedAt || new Date(),
            lastActive: new Date(),
            
            // Trading stats
            totalTrades: 0,
            totalVolume: 0,
            winRate: 0,
            profitLoss: 0,
            
            // Wallet stats
            totalWallets: 0,
            activeWalletId: null,
            
            // Reward stats
            referralRewards: 0,
            cashbackEarned: 0,
            pendingCashback: 0,
            cashbackTier: 'Bronze',
            
            // User level
            level: 'Beginner',
            xp: 0,
            
            // Settings
            settings: {
                priceAlerts: true,
                tradeUpdates: true,
                dailySummary: true,
                defaultSlippage: 10,
                autoConfirm: false,
                defaultStopLoss: 5,
                twoFA: false,
                sessionTimeout: 30,
                language: 'en'
            },
            
            // State for conversations
            state: null,
            
            // Timestamps
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (this.memoryMode) {
            this.users.set(parseInt(userData.userId), user);
            return user;
        }

        try {
            await this.db.collection('users').insertOne(user);
            return user;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Update user
     */
    async updateUser(userId, updates) {
        const updateData = {
            ...updates,
            updatedAt: new Date()
        };

        if (this.memoryMode) {
            const user = this.users.get(parseInt(userId));
            if (user) {
                const updated = { ...user, ...updateData };
                this.users.set(parseInt(userId), updated);
                return updated;
            }
            return null;
        }

        try {
            const result = await this.db.collection('users').findOneAndUpdate(
                { userId: parseInt(userId) },
                { $set: updateData },
                { returnDocument: 'after', upsert: true }
            );
            return result.value;
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    /**
     * Update user state
     */
    async updateUserState(userId, state) {
        return await this.updateUser(userId, { state });
    }

    /**
     * Get user by referral code
     */
    async getUserByReferralCode(referralCode) {
        if (this.memoryMode) {
            for (const user of this.users.values()) {
                if (user.referralCode === referralCode) return user;
            }
            return null;
        }

        try {
            return await this.db.collection('users').findOne({ referralCode });
        } catch (error) {
            console.error('Error getting user by referral:', error);
            return null;
        }
    }

    /**
     * Add referral to user
     */
    async addReferral(userId, referredUserId) {
        if (this.memoryMode) {
            const user = this.users.get(parseInt(userId));
            if (user) {
                user.referrals = user.referrals || [];
                user.referrals.push(referredUserId);
                user.referralRewards = (user.referralRewards || 0) + parseFloat(process.env.REFERRAL_REWARD || 0.01);
            }
            return;
        }

        try {
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { 
                    $push: { referrals: referredUserId },
                    $inc: { referralRewards: parseFloat(process.env.REFERRAL_REWARD || 0.01) }
                }
            );
        } catch (error) {
            console.error('Error adding referral:', error);
        }
    }

    // ============================================
    // WALLET OPERATIONS
    // ============================================

    /**
     * Add wallet to user
     */
    async addWallet(userId, walletData) {
        const wallet = {
            id: walletData.id || `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: parseInt(userId),
            name: walletData.name || `Wallet ${await this.getUserWalletCount(userId) + 1}`,
            address: walletData.address,
            encryptedPrivateKey: walletData.encryptedPrivateKey || null,
            publicKey: walletData.publicKey || walletData.address,
            balance: walletData.balance || 0,
            type: walletData.type || 'browser', // 'browser' or 'imported'
            isActive: walletData.isActive || false,
            connectedAt: walletData.connectedAt || new Date(),
            lastUsed: new Date(),
            transactions: walletData.transactions || [],
            tags: walletData.tags || [],
            notes: walletData.notes || ''
        };

        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId)) || [];
            wallets.push(wallet);
            this.wallets.set(parseInt(userId), wallets);
            
            // Update user wallet count
            const user = this.users.get(parseInt(userId));
            if (user) {
                user.totalWallets = wallets.length;
                if (wallet.isActive) {
                    user.activeWalletId = wallet.id;
                }
            }
            
            return wallet;
        }

        try {
            await this.db.collection('wallets').insertOne(wallet);
            
            // Update user wallet count
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { 
                    $inc: { totalWallets: 1 },
                    $set: wallet.isActive ? { activeWalletId: wallet.id } : {}
                }
            );
            
            return wallet;
        } catch (error) {
            console.error('Error adding wallet:', error);
            throw error;
        }
    }

    /**
     * Get user wallets
     */
    async getUserWallets(userId) {
        if (this.memoryMode) {
            return this.wallets.get(parseInt(userId)) || [];
        }

        try {
            return await this.db.collection('wallets')
                .find({ userId: parseInt(userId) })
                .sort({ isActive: -1, connectedAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting user wallets:', error);
            return [];
        }
    }

    /**
     * Get specific wallet
     */
    async getWallet(userId, walletId) {
        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId)) || [];
            return wallets.find(w => w.id === walletId) || null;
        }

        try {
            return await this.db.collection('wallets').findOne({ 
                userId: parseInt(userId), 
                id: walletId 
            });
        } catch (error) {
            console.error('Error getting wallet:', error);
            return null;
        }
    }

    /**
     * Get wallet by address
     */
    async getWalletByAddress(address) {
        if (this.memoryMode) {
            for (const wallets of this.wallets.values()) {
                const wallet = wallets.find(w => w.address === address);
                if (wallet) return wallet;
            }
            return null;
        }

        try {
            return await this.db.collection('wallets').findOne({ address });
        } catch (error) {
            console.error('Error getting wallet by address:', error);
            return null;
        }
    }

    /**
     * Update wallet balance
     */
    async updateWalletBalance(userId, walletId, newBalance) {
        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId));
            if (wallets) {
                const wallet = wallets.find(w => w.id === walletId);
                if (wallet) {
                    wallet.balance = newBalance;
                    wallet.lastUpdated = new Date();
                }
            }
            return;
        }

        try {
            await this.db.collection('wallets').updateOne(
                { userId: parseInt(userId), id: walletId },
                { $set: { balance: newBalance, lastUpdated: new Date() } }
            );
        } catch (error) {
            console.error('Error updating wallet balance:', error);
        }
    }

    /**
     * Set active wallet
     */
    async setActiveWallet(userId, walletId) {
        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId));
            if (wallets) {
                wallets.forEach(w => w.isActive = (w.id === walletId));
            }
            const user = this.users.get(parseInt(userId));
            if (user) user.activeWalletId = walletId;
            return;
        }

        try {
            // Deactivate all wallets
            await this.db.collection('wallets').updateMany(
                { userId: parseInt(userId) },
                { $set: { isActive: false } }
            );
            
            // Activate selected wallet
            await this.db.collection('wallets').updateOne(
                { userId: parseInt(userId), id: walletId },
                { $set: { isActive: true } }
            );
            
            // Update user
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { $set: { activeWalletId: walletId } }
            );
        } catch (error) {
            console.error('Error setting active wallet:', error);
        }
    }

    /**
     * Remove wallet
     */
    async removeWallet(userId, walletId) {
        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId));
            if (wallets) {
                const filtered = wallets.filter(w => w.id !== walletId);
                this.wallets.set(parseInt(userId), filtered);
            }
            return;
        }

        try {
            const wallet = await this.getWallet(userId, walletId);
            
            await this.db.collection('wallets').deleteOne({ 
                userId: parseInt(userId), 
                id: walletId 
            });
            
            // Update user wallet count
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { $inc: { totalWallets: -1 } }
            );
            
            // If this was active wallet, set another as active
            if (wallet && wallet.isActive) {
                const anotherWallet = await this.db.collection('wallets')
                    .findOne({ userId: parseInt(userId) });
                
                if (anotherWallet) {
                    await this.setActiveWallet(userId, anotherWallet.id);
                }
            }
        } catch (error) {
            console.error('Error removing wallet:', error);
        }
    }

    /**
     * Get user wallet count
     */
    async getUserWalletCount(userId) {
        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId));
            return wallets ? wallets.length : 0;
        }

        try {
            return await this.db.collection('wallets').countDocuments({ 
                userId: parseInt(userId) 
            });
        } catch (error) {
            console.error('Error counting wallets:', error);
            return 0;
        }
    }

    /**
     * Add transaction to wallet
     */
    async addTransaction(userId, walletId, transaction) {
        const tx = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            walletId,
            type: transaction.type, // 'send', 'receive', 'swap', 'snipe'
            amount: transaction.amount,
            token: transaction.token || 'SOL',
            price: transaction.price,
            signature: transaction.signature,
            status: transaction.status || 'completed',
            timestamp: new Date(),
            notes: transaction.notes || ''
        };

        if (this.memoryMode) {
            const wallets = this.wallets.get(parseInt(userId));
            if (wallets) {
                const wallet = wallets.find(w => w.id === walletId);
                if (wallet) {
                    wallet.transactions = wallet.transactions || [];
                    wallet.transactions.unshift(tx);
                }
            }
            return tx;
        }

        try {
            await this.db.collection('wallets').updateOne(
                { userId: parseInt(userId), id: walletId },
                { $push: { transactions: { $each: [tx], $position: 0 } } }
            );
            
            // Also add to trades collection
            await this.addTrade(userId, {
                ...tx,
                walletId,
                walletAddress: (await this.getWallet(userId, walletId)).address
            });
            
            return tx;
        } catch (error) {
            console.error('Error adding transaction:', error);
        }
    }

    // ============================================
    // TRADE OPERATIONS
    // ============================================

    /**
     * Add trade
     */
    async addTrade(userId, tradeData) {
        const trade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: parseInt(userId),
            walletId: tradeData.walletId,
            walletAddress: tradeData.walletAddress,
            type: tradeData.type, // 'buy', 'sell', 'snipe'
            tokenSymbol: tradeData.tokenSymbol,
            tokenAddress: tradeData.tokenAddress,
            amount: tradeData.amount,
            price: tradeData.price,
            totalValue: tradeData.amount * tradeData.price,
            profit: tradeData.profit || 0,
            signature: tradeData.signature,
            status: tradeData.status || 'completed',
            timestamp: tradeData.timestamp || new Date()
        };

        if (this.memoryMode) {
            const trades = this.trades.get(parseInt(userId)) || [];
            trades.unshift(trade);
            this.trades.set(parseInt(userId), trades);
            
            // Update user stats
            const user = this.users.get(parseInt(userId));
            if (user) {
                user.totalTrades = (user.totalTrades || 0) + 1;
                user.totalVolume = (user.totalVolume || 0) + trade.totalValue;
                // Update win rate, profit/loss etc.
            }
            
            return trade;
        }

        try {
            await this.db.collection('trades').insertOne(trade);
            
            // Update user stats
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                {
                    $inc: { 
                        totalTrades: 1,
                        totalVolume: trade.totalValue,
                        profitLoss: trade.profit || 0
                    }
                }
            );
            
            return trade;
        } catch (error) {
            console.error('Error adding trade:', error);
        }
    }

    /**
     * Get user trades
     */
    async getUserTrades(userId, limit = 10) {
        if (this.memoryMode) {
            const trades = this.trades.get(parseInt(userId)) || [];
            return trades.slice(0, limit);
        }

        try {
            return await this.db.collection('trades')
                .find({ userId: parseInt(userId) })
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting trades:', error);
            return [];
        }
    }

    /**
     * Get trade statistics
     */
    async getTradeStats(userId) {
        if (this.memoryMode) {
            const trades = this.trades.get(parseInt(userId)) || [];
            const total = trades.length;
            const profitable = trades.filter(t => t.profit > 0).length;
            const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
            const totalVolume = trades.reduce((sum, t) => sum + (t.totalValue || 0), 0);
            
            return {
                totalTrades: total,
                profitableTrades: profitable,
                winRate: total > 0 ? (profitable / total) * 100 : 0,
                totalProfit,
                totalVolume,
                averageProfit: total > 0 ? totalProfit / total : 0
            };
        }

        try {
            const pipeline = [
                { $match: { userId: parseInt(userId) } },
                { $group: {
                    _id: null,
                    totalTrades: { $sum: 1 },
                    profitableTrades: { $sum: { $cond: [{ $gt: ["$profit", 0] }, 1, 0] } },
                    totalProfit: { $sum: "$profit" },
                    totalVolume: { $sum: "$totalValue" }
                }}
            ];
            
            const result = await this.db.collection('trades').aggregate(pipeline).toArray();
            const stats = result[0] || { totalTrades: 0, profitableTrades: 0, totalProfit: 0, totalVolume: 0 };
            
            return {
                ...stats,
                winRate: stats.totalTrades > 0 ? (stats.profitableTrades / stats.totalTrades) * 100 : 0,
                averageProfit: stats.totalTrades > 0 ? stats.totalProfit / stats.totalTrades : 0
            };
        } catch (error) {
            console.error('Error getting trade stats:', error);
            return {
                totalTrades: 0,
                profitableTrades: 0,
                winRate: 0,
                totalProfit: 0,
                totalVolume: 0,
                averageProfit: 0
            };
        }
    }

    // ============================================
    // CONNECTION OPERATIONS (for browser wallet)
    // ============================================

    /**
     * Create pending connection
     */
    async createPendingConnection(connectionId, data) {
        const connection = {
            connectionId,
            userId: data.userId,
            chatId: data.chatId,
            createdAt: new Date(),
            expiresAt: data.expiresAt || new Date(Date.now() + 5 * 60 * 1000),
            status: 'pending'
        };

        if (this.memoryMode) {
            this.connections.set(connectionId, connection);
            return connection;
        }

        try {
            await this.db.collection('connections').insertOne(connection);
            return connection;
        } catch (error) {
            console.error('Error creating connection:', error);
            throw error;
        }
    }

    /**
     * Get pending connection
     */
    async getPendingConnection(connectionId) {
        if (this.memoryMode) {
            return this.connections.get(connectionId);
        }

        try {
            return await this.db.collection('connections').findOne({ 
                connectionId,
                status: 'pending',
                expiresAt: { $gt: new Date() }
            });
        } catch (error) {
            console.error('Error getting connection:', error);
            return null;
        }
    }

    /**
     * Get pending connection by user
     */
    async getPendingConnectionByUser(userId) {
        if (this.memoryMode) {
            for (const conn of this.connections.values()) {
                if (conn.userId === parseInt(userId) && 
                    conn.status === 'pending' && 
                    conn.expiresAt > new Date()) {
                    return conn;
                }
            }
            return null;
        }

        try {
            return await this.db.collection('connections').findOne({ 
                userId: parseInt(userId),
                status: 'pending',
                expiresAt: { $gt: new Date() }
            });
        } catch (error) {
            console.error('Error getting user connection:', error);
            return null;
        }
    }

    /**
     * Complete connection
     */
    async completeConnection(connectionId, walletAddress) {
        if (this.memoryMode) {
            const conn = this.connections.get(connectionId);
            if (conn) {
                conn.status = 'completed';
                conn.walletAddress = walletAddress;
                conn.completedAt = new Date();
            }
            return conn;
        }

        try {
            const result = await this.db.collection('connections').findOneAndUpdate(
                { connectionId },
                { 
                    $set: { 
                        status: 'completed',
                        walletAddress,
                        completedAt: new Date()
                    }
                },
                { returnDocument: 'after' }
            );
            return result.value;
        } catch (error) {
            console.error('Error completing connection:', error);
            return null;
        }
    }

    /**
     * Delete expired connections (called by cleanup job)
     */
    async deleteExpiredConnections() {
        if (!this.db && !this.memoryMode) {
            return;
        }

        if (this.memoryMode) {
            const now = new Date();
            for (const [id, conn] of this.connections.entries()) {
                if (conn.expiresAt < now) {
                    this.connections.delete(id);
                }
            }
            return;
        }

        try {
            await this.db.collection('connections').deleteMany({
                expiresAt: { $lt: new Date() }
            });
        } catch (error) {
            console.error('Error deleting expired connections:', error);
        }
    }

    // ============================================
    // CASHBACK OPERATIONS
    // ============================================

    /**
     * Add cashback
     */
    async addCashback(userId, amount, tradeId) {
        if (this.memoryMode) {
            const user = this.users.get(parseInt(userId));
            if (user) {
                user.pendingCashback = (user.pendingCashback || 0) + amount;
            }
            return;
        }

        try {
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { 
                    $inc: { pendingCashback: amount },
                    $push: { 
                        cashbackHistory: {
                            amount,
                            tradeId,
                            timestamp: new Date(),
                            status: 'pending'
                        }
                    }
                }
            );
        } catch (error) {
            console.error('Error adding cashback:', error);
        }
    }

    /**
     * Process cashback payout
     */
    async processCashbackPayout(userId) {
        if (this.memoryMode) {
            const user = this.users.get(parseInt(userId));
            if (user) {
                user.cashbackEarned = (user.cashbackEarned || 0) + (user.pendingCashback || 0);
                user.pendingCashback = 0;
            }
            return;
        }

        try {
            const user = await this.getUser(userId);
            const pending = user.pendingCashback || 0;
            
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                {
                    $inc: { cashbackEarned: pending },
                    $set: { pendingCashback: 0 }
                }
            );
        } catch (error) {
            console.error('Error processing cashback:', error);
        }
    }

    /**
     * Update cashback tier
     */
    async updateCashbackTier(userId, volume) {
        let tier = 'Bronze';
        
        if (volume >= 2000) tier = 'Platinum';
        else if (volume >= 500) tier = 'Gold';
        else if (volume >= 100) tier = 'Silver';
        
        if (this.memoryMode) {
            const user = this.users.get(parseInt(userId));
            if (user) user.cashbackTier = tier;
            return;
        }

        try {
            await this.db.collection('users').updateOne(
                { userId: parseInt(userId) },
                { $set: { cashbackTier: tier } }
            );
        } catch (error) {
            console.error('Error updating cashback tier:', error);
        }
    }

    // ============================================
    // SETTINGS OPERATIONS
    // ============================================

    /**
     * Get user settings
     */
    async getUserSettings(userId) {
        const user = await this.getUser(userId);
        return user?.settings || {
            priceAlerts: true,
            tradeUpdates: true,
            dailySummary: true,
            defaultSlippage: 10,
            autoConfirm: false,
            defaultStopLoss: 5,
            twoFA: false,
            sessionTimeout: 30,
            language: 'en'
        };
    }

    /**
     * Update user settings
     */
    async updateUserSettings(userId, settings) {
        const current = await this.getUserSettings(userId);
        const updated = { ...current, ...settings };
        
        await this.updateUser(userId, { settings: updated });
        return updated;
    }

    // ============================================
    // STATISTICS
    // ============================================

    /**
     * Get user count
     */
    async getUserCount() {
        if (this.memoryMode) return this.users.size;
        
        try {
            return await this.db.collection('users').countDocuments();
        } catch (error) {
            console.error('Error counting users:', error);
            return 0;
        }
    }

    /**
     * Get active wallet count
     */
    async getActiveWalletCount() {
        if (this.memoryMode) {
            let count = 0;
            for (const wallets of this.wallets.values()) {
                count += wallets.filter(w => w.isActive).length;
            }
            return count;
        }

        try {
            return await this.db.collection('wallets').countDocuments({ isActive: true });
        } catch (error) {
            console.error('Error counting active wallets:', error);
            return 0;
        }
    }

    /**
     * Get total volume
     */
    async getTotalVolume() {
        if (this.memoryMode) {
            let total = 0;
            for (const trades of this.trades.values()) {
                total += trades.reduce((sum, t) => sum + (t.totalValue || 0), 0);
            }
            return total;
        }

        try {
            const result = await this.db.collection('trades').aggregate([
                { $group: { _id: null, total: { $sum: "$totalValue" } } }
            ]).toArray();
            
            return result[0]?.total || 0;
        } catch (error) {
            console.error('Error calculating total volume:', error);
            return 0;
        }
    }

    // ============================================
    // SECURITY
    // ============================================

    /**
     * Encrypt private key
     */
    encryptPrivateKey(privateKey) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.createHash('sha256')
            .update(process.env.ENCRYPTION_KEY || 'default-key-change-this')
            .digest();
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            iv: iv.toString('hex'),
            encrypted: encrypted,
            algorithm: algorithm
        };
    }

    /**
     * Decrypt private key
     */
    decryptPrivateKey(encryptedData) {
        try {
            const algorithm = encryptedData.algorithm || 'aes-256-cbc';
            const key = crypto.createHash('sha256')
                .update(process.env.ENCRYPTION_KEY || 'default-key-change-this')
                .digest();
            const iv = Buffer.from(encryptedData.iv, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt private key');
        }
    }

    /**
     * Generate referral code
     */
    generateReferralCode(userId) {
        return `ref_${userId}_${Date.now().toString(36).toUpperCase()}`;
    }

    /**
     * Health check
     */
    async healthCheck() {
        if (this.memoryMode) {
            const hasMongoUri = Boolean(this._normalizeMongoUri(process.env.MONGODB_URI));
            const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
            const status = hasMongoUri && isProduction ? 'degraded' : 'healthy';

            return {
                status,
                mode: 'memory',
                users: this.users.size,
                wallets: this.wallets.size,
                trades: this.trades.size,
                mongodbConfigured: hasMongoUri,
                lastConnectionTarget: this.lastConnectionTarget,
                lastConnectionAttemptAt: this.lastConnectionAttemptAt,
                lastConnectionSuccessAt: this.lastConnectionSuccessAt,
                lastMongoError: this.lastConnectionError
            };
        }

        try {
            await this.db.admin().ping();
            
            const userCount = await this.getUserCount();
            const walletCount = await this.getActiveWalletCount();
            const totalVolume = await this.getTotalVolume();
            
            return {
                status: 'healthy',
                mode: 'mongodb',
                users: userCount,
                wallets: walletCount,
                volume: totalVolume,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                mode: 'mongodb'
            };
        }
    }
}

module.exports = new Database();
