// services/solana.js
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
const bs58Module = require('bs58');
const base58 = bs58Module.default || bs58Module;

class SolanaService {
    constructor() {
        this.connection = null;
        this.rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        this.quicknodeUrl = process.env.SOLANA_RPC_QUICKNODE;
        this.heliusUrl = process.env.SOLANA_RPC_HELIUS;
        this.jupiterApiKey = process.env.JUPITER_API_KEY;
        
        // Cache for prices
        this.priceCache = {
            sol: { price: 127.3, change24h: 0, timestamp: Date.now() },
            tokens: new Map()
        };
    }

    /**
     * Connect to Solana RPC
     */
    async connect() {
        try {
            // Try RPCs in order of preference
            const urls = [
                this.heliusUrl,
                this.quicknodeUrl,
                this.rpcUrl
            ].filter(Boolean);
            
            for (const url of urls) {
                try {
                    this.connection = new Connection(url, {
                        commitment: 'confirmed',
                        confirmTransactionInitialTimeout: 60000
                    });
                    
                    // Test connection
                    const version = await this.connection.getVersion();
                    console.log(`✅ Connected to Solana via ${url.split('/')[2]}`);
                    console.log(`📡 Solana version: ${version['solana-core']}`);
                    
                    // Start background jobs
                    this.startBackgroundJobs();
                    
                    return true;
                } catch (error) {
                    console.log(`❌ Failed to connect to ${url}:`, error.message);
                    continue;
                }
            }
            
            throw new Error('All RPC connections failed');
            
        } catch (error) {
            console.error('❌ Solana connection error:', error);
            throw error;
        }
    }

    /**
     * Start background jobs (price updates, etc.)
     */
    startBackgroundJobs() {
        // Update SOL price every 30 seconds
        setInterval(async () => {
            try {
                const data = await this.fetchSOLPrice();
                this.priceCache.sol = {
                    price: data.price,
                    change24h: data.change24h,
                    timestamp: Date.now()
                };
            } catch (error) {
                console.error('Error updating SOL price:', error);
            }
        }, 30000);
    }

    // ============================================
    // PRICE FEEDS
    // ============================================

    /**
     * Fetch SOL price from CoinGecko
     */
    async fetchSOLPrice() {
        try {
            const response = await axios.get(
                'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
                { timeout: 5000 }
            );
            
            return {
                price: response.data.solana.usd,
                change24h: response.data.solana.usd_24h_change
            };
        } catch (error) {
            console.error('Error fetching SOL price:', error);
            return { price: 127.3, change24h: 2.5 }; // Fallback
        }
    }

    /**
     * Get SOL price (with caching)
     */
    async getSOLPrice() {
        const cacheAge = Date.now() - this.priceCache.sol.timestamp;
        
        if (cacheAge < 30000 && this.priceCache.sol.price) {
            return this.priceCache.sol.price;
        }
        
        const data = await this.fetchSOLPrice();
        this.priceCache.sol = {
            price: data.price,
            change24h: data.change24h,
            timestamp: Date.now()
        };
        
        return data.price;
    }

    /**
     * Get SOL 24h change
     */
    async getSOLChange() {
        if (this.priceCache.sol.change24h && 
            (Date.now() - this.priceCache.sol.timestamp) < 30000) {
            return this.priceCache.sol.change24h;
        }
        
        const data = await this.fetchSOLPrice();
        this.priceCache.sol = {
            price: data.price,
            change24h: data.change24h,
            timestamp: Date.now()
        };
        
        return data.change24h;
    }

    /**
     * Get 24h volume
     */
    async get24hVolume() {
        try {
            const response = await axios.get(
                'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=1',
                { timeout: 5000 }
            );
            
            const volumes = response.data.total_volumes;
            return volumes[volumes.length - 1][1]; // Latest volume
        } catch (error) {
            console.error('Error fetching volume:', error);
            return 1500000000; // Fallback: 1.5B
        }
    }

    /**
     * Get token price from Jupiter
     */
    async getTokenPrice(tokenAddress) {
        try {
            // Check cache first
            const cacheAge = this.priceCache.tokens.get(tokenAddress)?.timestamp || 0;
            if (Date.now() - cacheAge < 60000) {
                return this.priceCache.tokens.get(tokenAddress).price;
            }
            
            // Use Jupiter API
            const response = await axios.get(
                `https://price.jup.ag/v4/price?ids=${tokenAddress}`,
                { timeout: 5000 }
            );
            
            const price = response.data.data[tokenAddress]?.price || 0;
            
            this.priceCache.tokens.set(tokenAddress, {
                price,
                timestamp: Date.now()
            });
            
            return price;
        } catch (error) {
            console.error('Error fetching token price:', error);
            return 0;
        }
    }

    // ============================================
    // WALLET OPERATIONS
    // ============================================

    /**
     * Create new wallet
     */
    async createWallet() {
        try {
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toString();
            const privateKey = base58.encode(keypair.secretKey);
            
            return {
                publicKey,
                privateKey,
                keypair
            };
        } catch (error) {
            console.error('Error creating wallet:', error);
            throw error;
        }
    }

    /**
     * Import wallet from private key
     */
    async importWallet(privateKey) {
        try {
            const keypair = Keypair.fromSecretKey(base58.decode(privateKey));
            
            return {
                publicKey: keypair.publicKey.toString(),
                privateKey: privateKey,
                keypair
            };
        } catch (error) {
            console.error('Error importing wallet:', error);
            throw error;
        }
    }

    /**
     * Get wallet balance
     */
    async getBalance(publicKey) {
        try {
            if (!this.connection) {
                return 0;
            }
            const pubkey = new PublicKey(publicKey);
            const balance = await this.connection.getBalance(pubkey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('Error getting balance:', error);
            return 0;
        }
    }

    /**
     * Get multiple wallet balances
     */
    async getBalances(publicKeys) {
        try {
            if (!this.connection) {
                return publicKeys.map(pk => ({ publicKey: pk, balance: 0 }));
            }
            const pubkeys = publicKeys.map(pk => new PublicKey(pk));
            const balances = await this.connection.getMultipleAccountsInfo(pubkeys);
            
            return balances.map((account, i) => ({
                publicKey: publicKeys[i],
                balance: account ? account.lamports / LAMPORTS_PER_SOL : 0
            }));
        } catch (error) {
            console.error('Error getting balances:', error);
            return publicKeys.map(pk => ({ publicKey: pk, balance: 0 }));
        }
    }

    /**
     * Transfer SOL
     */
    async transferSOL(fromPrivateKey, toPublicKey, amount) {
        try {
            if (!this.connection) {
                throw new Error('Solana RPC not connected');
            }

            // Validate inputs
            if (!fromPrivateKey || !toPublicKey || !amount || amount <= 0) {
                throw new Error('Invalid transfer parameters');
            }
            
            const fromKeypair = Keypair.fromSecretKey(base58.decode(fromPrivateKey));
            const toPubkey = new PublicKey(toPublicKey);
            
            // Check balance
            const balance = await this.getBalance(fromKeypair.publicKey.toString());
            if (balance < amount + 0.00001) { // Add fee buffer
                throw new Error('Insufficient balance');
            }
            
            // Create transaction
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromKeypair.publicKey,
                    toPubkey,
                    lamports: amount * LAMPORTS_PER_SOL
                })
            );
            
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromKeypair.publicKey;
            
            // Sign and send
            const signature = await this.connection.sendTransaction(transaction, [fromKeypair]);
            
            // Confirm transaction
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error('Transaction failed');
            }
            
            return {
                success: true,
                signature,
                amount,
                from: fromKeypair.publicKey.toString(),
                to: toPublicKey,
                fee: 0.000005, // Approximate fee
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Transfer error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============================================
    // TRANSACTION HISTORY
    // ============================================

    /**
     * Get recent transactions for address
     */
    async getRecentTransactions(address, limit = 10) {
        try {
            if (!this.connection) {
                return [];
            }
            const pubkey = new PublicKey(address);
            
            const signatures = await this.connection.getSignaturesForAddress(
                pubkey,
                { limit }
            );
            
            const transactions = [];
            
            for (const sig of signatures) {
                try {
                    const tx = await this.connection.getTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });
                    
                    if (tx) {
                        // Parse transaction type
                        let type = 'unknown';
                        let amount = 0;
                        
                        // Check if it's a transfer
                        if (tx.transaction.message.instructions.length === 1) {
                            const programId = tx.transaction.message.instructions[0].programId.toString();
                            
                            if (programId === '11111111111111111111111111111111') {
                                type = 'transfer';
                                // Parse amount from post balances
                                const preBalance = tx.meta.preBalances[1] / LAMPORTS_PER_SOL;
                                const postBalance = tx.meta.postBalances[1] / LAMPORTS_PER_SOL;
                                amount = Math.abs(postBalance - preBalance);
                            }
                        }
                        
                        transactions.push({
                            signature: sig.signature,
                            timestamp: new Date(sig.blockTime * 1000),
                            status: sig.err ? 'failed' : 'success',
                            type,
                            amount,
                            fee: tx.meta?.fee / LAMPORTS_PER_SOL || 0,
                            slot: tx.slot
                        });
                    }
                } catch (err) {
                    console.error('Error parsing transaction:', err);
                }
            }
            
            return transactions;
            
        } catch (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }
    }

    /**
     * Get transaction details
     */
    async getTransactionDetails(signature) {
        try {
            if (!this.connection) {
                return null;
            }
            const tx = await this.connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });
            
            if (!tx) return null;
            
            return {
                signature,
                timestamp: new Date(tx.blockTime * 1000),
                slot: tx.slot,
                status: tx.meta.err ? 'failed' : 'success',
                fee: tx.meta.fee / LAMPORTS_PER_SOL,
                logs: tx.meta.logMessages,
                preBalances: tx.meta.preBalances.map(b => b / LAMPORTS_PER_SOL),
                postBalances: tx.meta.postBalances.map(b => b / LAMPORTS_PER_SOL)
            };
            
        } catch (error) {
            console.error('Error getting transaction details:', error);
            return null;
        }
    }

    // ============================================
    // SNIPER FUNCTIONS
    // ============================================

    /**
     * Execute a snipe (simulated for now)
     */
    async executeSnipe(tokenAddress, amountSOL, slippage = 10, wallet) {
        try {
            // This would integrate with Jupiter or Raydium for actual swapping
            // For now, simulate a successful snipe
            
            const tokenPrice = await this.getTokenPrice(tokenAddress);
            const tokenAmount = amountSOL / tokenPrice;
            
            // Simulate slippage calculation
            const estimatedPrice = tokenPrice * (1 + (Math.random() * slippage/100));
            
            return {
                success: true,
                tokenAddress,
                tokenAmount,
                solSpent: amountSOL,
                estimatedPrice,
                actualPrice: tokenPrice,
                slippage: ((estimatedPrice - tokenPrice) / tokenPrice) * 100,
                timestamp: new Date(),
                signature: `simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                explorerUrl: `https://solscan.io/tx/simulated_${Date.now()}`
            };
            
        } catch (error) {
            console.error('Snipe error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============================================
    // MARKET DATA
    // ============================================

    /**
     * Get trending tokens from DexScreener
     */
    async getTrendingTokens() {
        try {
            const response = await axios.get(
                'https://api.dexscreener.com/latest/dex/search?q=solana',
                { timeout: 5000 }
            );
            
            return response.data.pairs
                .filter(p => p.chainId === 'solana')
                .sort((a, b) => b.volume.h24 - a.volume.h24)
                .slice(0, 10)
                .map(p => ({
                    symbol: p.baseToken.symbol,
                    name: p.baseToken.name,
                    address: p.baseToken.address,
                    price: p.priceUsd,
                    change24h: p.priceChange.h24,
                    volume24h: p.volume.h24,
                    liquidity: p.liquidity?.usd || 0,
                    pairAddress: p.pairAddress
                }));
                
        } catch (error) {
            console.error('Error fetching trending tokens:', error);
            
            // Return mock data
            return [
                { symbol: 'BONK', name: 'Bonk', price: 0.000023, change24h: 156, address: 'mock1' },
                { symbol: 'WIF', name: 'dogwifhat', price: 0.045, change24h: 89, address: 'mock2' },
                { symbol: 'PYTH', name: 'Pyth Network', price: 0.32, change24h: 45, address: 'mock3' }
            ];
        }
    }

    /**
     * Get new tokens from Pump.fun
     */
    async getNewPumpFunTokens() {
        try {
            // Pump.fun API endpoint (example)
            const response = await axios.get(
                'https://api.pump.fun/tokens/recent',
                { timeout: 5000 }
            );
            
            return response.data.slice(0, 10);
            
        } catch (error) {
            console.error('Error fetching Pump.fun tokens:', error);
            
            // Return mock data
            return [
                { name: 'PEPE', marketCap: 50000, age: '2m' },
                { name: 'DOGE', marketCap: 75000, age: '5m' },
                { name: 'SHIB', marketCap: 120000, age: '10m' }
            ];
        }
    }

    /**
     * Get token metadata
     */
    async getTokenMetadata(tokenAddress) {
        try {
            // This would use Metaplex or other metadata providers
            const response = await axios.get(
                `https://api.solscan.io/token/meta?token=${tokenAddress}`,
                { timeout: 5000 }
            );
            
            return response.data;
            
        } catch (error) {
            console.error('Error fetching token metadata:', error);
            return null;
        }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Validate Solana address
     */
    isValidAddress(address) {
        try {
            new PublicKey(address);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Format address for display
     */
    formatAddress(address, chars = 4) {
        if (!address) return '';
        if (address.length <= chars * 2) return address;
        
        return `${address.slice(0, chars)}...${address.slice(-chars)}`;
    }

    /**
     * Get explorer URL for transaction
     */
    getExplorerUrl(signature, type = 'tx') {
        return `https://solscan.io/${type}/${signature}`;
    }

    /**
     * Estimate transaction fee
     */
    async estimateFee() {
        try {
            if (!this.connection) {
                return 0.000005;
            }
            const { feeCalculator } = await this.connection.getRecentBlockhash();
            return feeCalculator.lamportsPerSignature / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('Error estimating fee:', error);
            return 0.000005; // Default fee
        }
    }

    /**
     * Get network status
     */
    async getNetworkStatus() {
        try {
            if (!this.connection) {
                return { status: 'unhealthy', error: 'No Solana RPC connection' };
            }
            const [version, slot, epochInfo] = await Promise.all([
                this.connection.getVersion(),
                this.connection.getSlot(),
                this.connection.getEpochInfo()
            ]);
            
            return {
                version: version['solana-core'],
                currentSlot: slot,
                epoch: epochInfo.epoch,
                slotIndex: epochInfo.slotIndex,
                slotsInEpoch: epochInfo.slotsInEpoch,
                transactionCount: await this.getTransactionCount(),
                status: 'healthy'
            };
        } catch (error) {
            console.error('Error getting network status:', error);
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Get approximate transaction count
     */
    async getTransactionCount() {
        try {
            const slot = await this.connection.getSlot();
            return slot * 2000; // Rough estimate
        } catch {
            return 0;
        }
    }
}

module.exports = new SolanaService();
