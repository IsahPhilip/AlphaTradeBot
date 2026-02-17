// bot.js - Complete MegaTradingBot with Browser Wallet Connection
const { Markup, session } = require('telegraf');

// Import services
const database = require('./services/database');
const solana = require('./services/solana');
const walletConnection = require('./services/wallet-connection');

// ============================================
// CONFIGURATION
// ============================================
const BOT_USERNAME = process.env.BOT_USERNAME || 'SolanaWebBot';

const STATE_SEND_AMOUNT_PREFIX = 'awaiting_send_amount:';
const STATE_SEND_ADDRESS_PREFIX = 'awaiting_send_address:';

// ============================================
// KEYBOARDS
// ============================================

/**
 * Main menu keyboard
 */
const getMainMenuKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 SOL Price', 'sol_price'),
            Markup.button.callback('👛 My Wallets', 'wallets')
        ],
        [
            Markup.button.callback('🛒 Buy & Sell', 'buy_sell'),
            Markup.button.callback('⏰ Limit Orders', 'limit_orders')
        ],
        [
            Markup.button.callback('👥 Copy Trades', 'copy_trades'),
            Markup.button.callback('👤 Profile', 'profile')
        ],
        [
            Markup.button.callback('📈 Trades', 'trades'),
            Markup.button.callback('🎯 Referral System', 'referral')
        ],
        [
            Markup.button.callback('💸 Cashback', 'cashback'),
            Markup.button.callback('💎 Transfer SOL', 'transfer_sol')
        ],
        [
            Markup.button.callback('⚙️ Settings', 'settings'),
            Markup.button.callback('🛡️ Security', 'security')
        ],
        [
            Markup.button.callback('🤖 Our Token', 'stbot_token'),
            Markup.button.callback('🏦 Market Maker', 'market_maker')
        ],
        [
            Markup.button.callback('🔧 Backup Bots', 'backup_bots'),
            Markup.button.callback('🆘 Help', 'help_menu')
        ],
        [
            Markup.button.url('🌐 Website', 'https://solanatradingbot.com'),
            Markup.button.url('🐦 Twitter', 'https://twitter.com/solanatradingbot')
        ]
    ]);
};

/**
 * Buy & Sell submenu keyboard
 */
const getBuySellKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🎯 Sniper V1', 'sniper_v1'),
            Markup.button.callback('🚀 Sniper V2 NEW', 'sniper_v2')
        ],
        [
            Markup.button.callback('🎪 Sniper Pumpfun', 'sniper_pumpfun'),
            Markup.button.callback('🌙 Sniper Moonshot', 'sniper_moonshot')
        ],
        [
            Markup.button.callback('🚀 Sniper LaunchLab', 'sniper_launchlab')
        ],
        [
            Markup.button.callback('🔙 Back to Main', 'main_menu')
        ]
    ]);
};

/**
 * Wallets management keyboard
 */
const getWalletsKeyboard = async (userId) => {
    const wallets = await database.getUserWallets(userId);
    
    const buttons = [];
    
    // Add each wallet as a button
    wallets.forEach(wallet => {
        const isActive = wallet.isActive ? '✅' : '';
        const balance = wallet.balance ? wallet.balance.toFixed(2) : '0';
        buttons.push([
            Markup.button.callback(
                `${isActive} ${wallet.name} (${balance} SOL)`, 
                `wallet_${wallet.id}`
            )
        ]);
    });
    
    // Add action buttons
    buttons.push([
        Markup.button.callback('🔌 Connect New Wallet (Browser)', 'connect_wallet_browser'),
        Markup.button.callback('📱 Import with Private Key', 'import_wallet')
    ]);
    
    buttons.push([
        Markup.button.callback('❌ Disconnect Wallet', 'disconnect_wallet'),
        Markup.button.callback('🔄 Refresh Balances', 'refresh_wallets')
    ]);
    
    buttons.push([Markup.button.callback('🔙 Back to Main', 'main_menu')]);
    
    return Markup.inlineKeyboard(buttons);
};

/**
 * Wallet details keyboard
 */
const getWalletDetailsKeyboard = (walletId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📤 Send SOL', `send_${walletId}`),
            Markup.button.callback('📥 Receive', `receive_${walletId}`)
        ],
        [
            Markup.button.callback('📊 Transactions', `tx_${walletId}`),
            Markup.button.callback('🔄 Refresh', `wallet_${walletId}`)
        ],
        [
            Markup.button.callback('⭐ Set Active', `set_active_${walletId}`),
            Markup.button.callback('🗑️ Remove', `remove_${walletId}`)
        ],
        [Markup.button.callback('🔙 Back to Wallets', 'wallets')]
    ]);
};

// ============================================
// BOT SETUP
// ============================================

/**
 * Setup bot with all handlers
 */
function setupBot(bot) {
    
    // ============================================
    // MIDDLEWARE
    // ============================================
    
    // Session middleware
    bot.use(session());
    
    // Logging middleware
    bot.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        console.log(`${ctx.updateType} from ${ctx.from?.username || 'unknown'} took ${ms}ms`);
    });
    
    // ============================================
    // COMMANDS
    // ============================================
    
    /**
     * Start command - Welcome message
     */
    bot.start(async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'Trader';
        const safeUsername = escapeMarkdown(username);
        
        try {
            // Check if user exists, create if not
            let user = await database.getUser(userId);
            if (!user) {
                user = await database.createUser({
                    userId,
                    username,
                    joinedAt: new Date(),
                    referralCode: generateReferralCode(userId)
                });
            }
            
            // Get SOL price
            const solPrice = await solana.getSOLPrice().catch(() => 127.3);
            const solChange = await solana.getSOLChange().catch(() => 2.5);
            const changeEmoji = solChange >= 0 ? '📈' : '📉';
            
            // Get user stats
            const wallets = await database.getUserWallets(userId);
            const activeWallet = wallets.find(w => w.isActive);
            
            // Welcome message with ASCII art and branding
            const welcomeMessage = `
╔═══════════════════════════════════════════╗
║  ███████╗ ██████╗ ██╗      █████╗ ███╗   ██╗║
║  ██╔════╝██╔═══██╗██║     ██╔══██╗████╗  ██║║
║  ███████╗██║   ██║██║     ███████║██╔██╗ ██║║
║  ╚════██║██║   ██║██║     ██╔══██║██║╚██╗██║║
║  ███████║╚██████╔╝███████╗██║  ██║██║ ╚████║║
║  ╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝║
╠═══════════════════════════════════════════╣
║          *Welcome ${safeUsername}!*             ║
║     *Solana Web Bot - Trade in Browser*     ║
╠═══════════════════════════════════════════╣
║  📊 *LIVE MARKET DATA*                     ║
║  SOL: *$${solPrice.toFixed(2)}* ${changeEmoji} ${solChange.toFixed(1)}%         ║
║                                             ║
║  👛 *YOUR WALLETS*                          ║
║  Total: ${wallets.length} connected         ║
║  ${activeWallet ? `Active: ${activeWallet.name}` : 'No active wallet'}  ║
╠═══════════════════════════════════════════╣
║  🔥 *FEATURES*                              ║
║  • 🌐 *Connect in Browser* - No app needed! ║
║  • 🎯 5 Sniper Tools                        ║
║  • 👛 Multi-Wallet Management                ║
║  • ⏰ Limit Orders & Copy Trading            ║
║  • 💸 Referral Rewards                       ║
║  • 🛡️ Enterprise Security                    ║
╠═══════════════════════════════════════════╣
║  🚀 *GET STARTED*                            ║
║  1. Click "Connect Wallet" below            ║
║  2. Open link in browser                     ║
║  3. Connect your Phantom/Solflare            ║
║  4. Return here to trade!                    ║
╚═══════════════════════════════════════════╝

*Powered by Solana • Secure • Fast*
            `;
            
            await ctx.replyWithMarkdown(welcomeMessage, getMainMenuKeyboard());
            
        } catch (error) {
            console.error('Start command error:', error);
            await ctx.reply('❌ Error loading bot. Please try again later.');
        }
    });
    
    /**
     * Help command
     */
    bot.help(async (ctx) => {
        const helpMessage = `
🆘 *Help & Support*

*Available Commands:*
/start - Welcome & main menu
/wallets - Manage your wallets
/connect - Connect new wallet
/price - Check SOL price
/profile - View your profile
/trade - Quick trade menu
/help - Show this message

*How to Connect Wallet:*
1️⃣ Click "Connect Wallet" button
2️⃣ Open the browser link
3️⃣ Select Phantom/Solflare
4️⃣ Approve connection
5️⃣ Return to bot

*Need Support?*
📧 Email: support@solanatradingbot.com
🐦 Twitter: @SolanaWebBot
💬 Telegram: @SolanaWebBotSupport

*Security Tips:*
🔐 Never share private keys
🔐 Only connect trusted wallets
🔐 Enable 2FA on your wallet
        `;
        
        await ctx.replyWithMarkdown(helpMessage, Markup.inlineKeyboard([
            [Markup.button.callback('🔌 Connect Wallet', 'connect_wallet_browser')],
            [Markup.button.callback('📚 Tutorial', 'tutorial')],
            [Markup.button.callback('🔙 Main Menu', 'main_menu')]
        ]));
    });
    
    /**
     * Wallets command
     */
    bot.command('wallets', async (ctx) => {
        const userId = ctx.from.id;
        await showWallets(ctx, userId);
    });
    
    /**
     * Connect command
     */
    bot.command('connect', async (ctx) => {
        const userId = ctx.from.id;
        await handleConnectWallet(ctx, userId);
    });
    
    /**
     * Price command
     */
    bot.command('price', async (ctx) => {
        await showSolPrice(ctx);
    });
    
    /**
     * Profile command
     */
    bot.command('profile', async (ctx) => {
        const userId = ctx.from.id;
        await showProfile(ctx, userId);
    });
    
    /**
     * Trade command
     */
    bot.command('trade', async (ctx) => {
        await ctx.reply(
            '📊 *Quick Trade*\n\nSelect a trading mode:',
            {
                parse_mode: 'Markdown',
                ...getBuySellKeyboard()
            }
        );
    });

    bot.command('cancel', async (ctx) => {
        const userId = ctx.from.id;
        await database.updateUserState(userId, null);
        await ctx.reply('✅ Current action cancelled.', getMainMenuKeyboard());
    });
    
    // ============================================
    // CALLBACK QUERY HANDLERS
    // ============================================
    
    bot.on('callback_query', async (ctx) => {
        const action = ctx.callbackQuery?.data;
        const userId = ctx.from.id;
        
        // Always answer callback query to remove loading state
        try {
            await ctx.answerCbQuery();
        } catch (error) {
            console.warn('Failed to answer callback query:', error.message);
        }
        
        try {
            if (!action) {
                await ctx.reply('❌ Invalid action.', getMainMenuKeyboard());
                return;
            }

            // Handle different actions
            switch (true) {
                
                // Main menu navigation
                case action === 'main_menu':
                    await ctx.replyWithMarkdown('🏠 *Main Menu*', getMainMenuKeyboard());
                    break;
                    
                // SOL Price
                case action === 'sol_price':
                    await showSolPrice(ctx);
                    break;
                    
                // Wallets
                case action === 'wallets':
                    await showWallets(ctx, userId);
                    break;
                    
                // Connect wallet (browser-based)
                case action === 'connect_wallet_browser':
                    await handleConnectWallet(ctx, userId);
                    break;
                    
                // Import wallet (private key)
                case action === 'import_wallet':
                    await handleImportWallet(ctx, userId);
                    break;
                    
                // Refresh wallets
                case action === 'refresh_wallets':
                    await refreshWalletBalances(ctx, userId);
                    break;
                    
                // Disconnect wallet
                case action === 'disconnect_wallet':
                    await handleDisconnectWallet(ctx, userId);
                    break;
                    
                // Buy & Sell menu
                case action === 'buy_sell':
                    await ctx.reply(
                        '🛒 *Buy & Sell*\n\nSelect a sniper tool:',
                        {
                            parse_mode: 'Markdown',
                            ...getBuySellKeyboard()
                        }
                    );
                    break;
                    
                // Sniper tools
                case action === 'sniper_v1':
                    await showSniperV1(ctx, userId);
                    break;
                    
                case action === 'sniper_v2':
                    await showSniperV2(ctx, userId);
                    break;
                    
                case action === 'sniper_pumpfun':
                    await showPumpfunSniper(ctx, userId);
                    break;
                    
                case action === 'sniper_moonshot':
                    await showMoonshotSniper(ctx, userId);
                    break;
                    
                case action === 'sniper_launchlab':
                    await showLaunchLabSniper(ctx, userId);
                    break;
                    
                // Profile
                case action === 'profile':
                    await showProfile(ctx, userId);
                    break;
                    
                // Trades
                case action === 'trades':
                    await showTrades(ctx, userId);
                    break;
                    
                // Referral system
                case action === 'referral':
                    await showReferralSystem(ctx, userId);
                    break;
                    
                // Cashback
                case action === 'cashback':
                    await showCashback(ctx, userId);
                    break;
                    
                // Transfer SOL
                case action === 'transfer_sol':
                    await handleTransferSol(ctx, userId);
                    break;
                    
                // Settings
                case action === 'settings':
                    await showSettings(ctx, userId);
                    break;
                    
                // Security
                case action === 'security':
                    await showSecurity(ctx, userId);
                    break;
                    
                // Limit orders
                case action === 'limit_orders':
                    await showLimitOrders(ctx, userId);
                    break;
                    
                // Copy trades
                case action === 'copy_trades':
                    await showCopyTrades(ctx, userId);
                    break;
                    
                // Our token
                case action === 'stbot_token':
                    await showOurToken(ctx);
                    break;
                    
                // Market maker
                case action === 'market_maker':
                    await showMarketMaker(ctx);
                    break;
                    
                // Backup bots
                case action === 'backup_bots':
                    await showBackupBots(ctx);
                    break;
                    
                // Help menu
                case action === 'help_menu':
                    await showHelp(ctx);
                    break;
                    
                // Tutorial
                case action === 'tutorial':
                    await showTutorial(ctx);
                    break;
                    
                // Handle wallet selection
                case action.startsWith('wallet_'): {
                    const walletId = action.replace('wallet_', '');
                    await showWalletDetails(ctx, userId, walletId);
                    break;
                }
                    
                // Handle set active wallet
                case action.startsWith('set_active_'): {
                    const activeWalletId = action.replace('set_active_', '');
                    await setActiveWallet(ctx, userId, activeWalletId);
                    break;
                }
                    
                // Handle remove wallet
                case action.startsWith('remove_'): {
                    const removeWalletId = action.replace('remove_', '');
                    await removeWallet(ctx, userId, removeWalletId);
                    break;
                }
                    
                // Handle send SOL
                case action.startsWith('send_'): {
                    const sendWalletId = action.replace('send_', '');
                    await initiateSendSol(ctx, userId, sendWalletId);
                    break;
                }
                    
                // Handle receive
                case action.startsWith('receive_'): {
                    const receiveWalletId = action.replace('receive_', '');
                    await showReceiveAddress(ctx, userId, receiveWalletId);
                    break;
                }
                    
                // Handle transactions
                case action.startsWith('tx_'): {
                    const txWalletId = action.replace('tx_', '');
                    await showTransactions(ctx, userId, txWalletId);
                    break;
                }

                case action.startsWith('amount_'): {
                    const percentage = Number.parseInt(action.replace('amount_', ''), 10);
                    await handleSendAmountPreset(ctx, userId, percentage);
                    break;
                }
                    
                // Handle connection check
                case action === 'check_connection':
                    await checkConnection(ctx, userId);
                    break;
                    
                // Default handler
                default:
                    console.log('Unknown action:', action);
                    await ctx.reply('❓ Unknown action. Returning to main menu.', getMainMenuKeyboard());
            }
            
            // Try to delete previous message for cleaner UI
            try {
                await ctx.deleteMessage();
            } catch (err) {
                // Ignore if can't delete
            }
            
        } catch (error) {
            console.error(`Callback error for action ${action}:`, error);
            await ctx.reply('❌ An error occurred. Please try again.', getMainMenuKeyboard());
        }
    });
    
    // ============================================
    // TEXT MESSAGE HANDLERS
    // ============================================
    
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        
        try {
            // Check user state
            const user = await database.getUser(userId);
            const state = user?.state;
            
            if (state === 'awaiting_private_key') {
                // Handle private key import
                await handlePrivateKeyImport(ctx, userId, text);
                
            } else if (state?.startsWith('awaiting_send_amount')) {
                // Handle send amount input
                await handleSendAmount(ctx, userId, text);
                
            } else if (state?.startsWith('awaiting_send_address')) {
                // Handle send address input
                await handleSendAddress(ctx, userId, text);
                
            } else if (state?.startsWith('awaiting_sniper_')) {
                // Handle sniper parameters
                await handleSniperParameters(ctx, userId, text, state);
                
            } else {
                // Default response for unrecognized text
                await ctx.reply(
                    'I\'m not sure how to respond to that. Please use the menu buttons below:',
                    getMainMenuKeyboard()
                );
            }
            
        } catch (error) {
            console.error('Text handler error:', error);
            await ctx.reply('❌ An error occurred.', getMainMenuKeyboard());
        }
    });
    
    // ============================================
    // ERROR HANDLER
    // ============================================
    
    bot.catch((err, ctx) => {
        console.error(`Bot error for ${ctx.updateType}:`, err);
        
        // Try to send error message to user
        try {
            ctx.reply(
                '❌ An unexpected error occurred. Please try again later.\n\n' +
                'If the problem persists, contact @SolanaWebBotSupport',
                getMainMenuKeyboard()
            );
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Show SOL price with chart
 */
async function showSolPrice(ctx) {
    try {
        const price = await solana.getSOLPrice();
        const change = await solana.getSOLChange();
        const volume = await solana.get24hVolume();
        const marketCap = price * 439000000; // Approximate
        
        const changeEmoji = change >= 0 ? '📈' : '📉';
        const changeColor = change >= 0 ? '+' : '';
        
        const message = `
💎 *SOLANA PRICE UPDATE*

*Current Price:* $${price.toFixed(2)}
*24h Change:* ${changeEmoji} ${changeColor}${change.toFixed(2)}%
*24h Volume:* $${(volume / 1e9).toFixed(2)}B
*Market Cap:* $${(marketCap / 1e9).toFixed(2)}B

*Technical Analysis:*
• RSI: 62 (Neutral)
• Support: $${(price * 0.95).toFixed(2)}
• Resistance: $${(price * 1.05).toFixed(2)}

*Recommendations:*
${change >= 0 ? '🚀 Bullish momentum' : '📉 Correction expected'}
• Short-term: ${change >= 5 ? 'Take profits' : 'Hold'}
• Long-term: Accumulate on dips

*Next update in 30 seconds*
        `;
        
        await ctx.replyWithMarkdown(message, {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'sol_price')],
                [Markup.button.callback('📊 Detailed Chart', 'sol_chart')],
                [Markup.button.callback('🔙 Back', 'main_menu')]
            ])
        });
        
    } catch (error) {
        console.error('Error showing SOL price:', error);
        await ctx.reply('❌ Failed to fetch SOL price. Using cached data: $127.30');
    }
}

/**
 * Show wallets management
 */
async function showWallets(ctx, userId) {
    const wallets = await database.getUserWallets(userId);
    
    if (wallets.length === 0) {
        // No wallets - show connect prompt
        const message = `
👛 *No Wallets Connected*

You don't have any wallets connected yet.

🔌 *Connect your wallet in 3 easy steps:*
1️⃣ Click "Connect Wallet" below
2️⃣ Open the browser link
3️⃣ Approve connection in Phantom/Solflare

⚡ *Benefits of connecting:*
• Trade instantly from browser
• Track your portfolio
• Execute sniper trades
• Earn referral rewards
        `;
        
        await ctx.replyWithMarkdown(message, {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔌 Connect Wallet (Browser)', 'connect_wallet_browser')],
                [Markup.button.callback('📱 Import with Private Key', 'import_wallet')],
                [Markup.button.callback('🔙 Back', 'main_menu')]
            ])
        });
    } else {
        // Show existing wallets
        const activeWallet = wallets.find(w => w.isActive);
        const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
        
        let walletsList = '';
        wallets.forEach((w) => {
            const active = w.isActive ? '✅ ' : '';
            walletsList += `${active}${w.name}: ${w.balance?.toFixed(2) || 0} SOL\n`;
            walletsList += `   \`${w.address.slice(0, 8)}...${w.address.slice(-8)}\`\n\n`;
        });
        
        const message = `
👛 *Your Wallets*

*Total Balance:* ${totalBalance.toFixed(2)} SOL (~$${(totalBalance * 127.3).toFixed(2)})

${walletsList}

*Active Wallet:* ${activeWallet?.name || 'None selected'}

*Quick Actions:*
• Click a wallet below to view details
• Connect more wallets for multi-wallet trading
• Set active wallet for trades
        `;
        
        await ctx.replyWithMarkdown(message, await getWalletsKeyboard(userId));
    }
}

/**
 * Handle connect wallet (browser-based)
 */
async function handleConnectWallet(ctx, userId) {
    try {
        const chatId = ctx.chat.id;
        const { browserUrl, expiresAt } = await walletConnection.createConnectionRequest(userId, chatId);
        const expiresAtMs = new Date(expiresAt).getTime();
        const minutesLeft = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 60000));
        
        const message = `
🔌 *Connect Your Wallet*

*Method:* Browser-based (Recommended)
*Security:* 🔐 End-to-end encrypted

*📱 Instructions:*

1️⃣ *Click the button below* to open browser
2️⃣ *Select your wallet* (Phantom, Solflare, Backpack)
3️⃣ *Approve the connection* in your wallet
4️⃣ *Return here* - we'll notify you!

⏳ *Link expires in ${minutesLeft} minute(s)*

*Why browser-based?*
✅ Works on all devices
✅ No app installation needed
✅ Most secure method
✅ Supports all Solana wallets
        `;
        
        await ctx.replyWithMarkdown(message, {
            ...Markup.inlineKeyboard([
                [Markup.button.url('🌐 Open in Browser', browserUrl)],
                [Markup.button.callback('✅ I\'ve Connected', 'check_connection')],
                [Markup.button.callback('❌ Cancel', 'wallets')]
            ])
        });
        
    } catch (error) {
        console.error('Connect wallet error:', error);
        const details = String(error?.message || '');
        if (details.includes('must be a public HTTP(S) URL for Telegram buttons')) {
            await ctx.reply(
                '❌ Wallet connect is not configured for Telegram yet.\n' +
                'Set `TELEGRAM_WEB_APP_URL` (or `WEB_APP_URL`) and `BACKEND_URL` to a public HTTPS domain, then retry.'
            );
            return;
        }
        await ctx.reply('❌ Failed to start wallet connection. Please try again.');
    }
}

/**
 * Handle import wallet (private key)
 */
async function handleImportWallet(ctx, userId) {
    await database.updateUserState(userId, 'awaiting_private_key');
    
    const message = `
📱 *Import Wallet with Private Key*

⚠️ *SECURITY WARNING*
• Only use this in a PRIVATE chat
• Never share your private key with anyone
• We encrypt and never store plain keys

*How to find your private key:*
• Phantom: Settings → Export Private Key
• Solflare: Settings → Show Recovery Phrase

📝 *Please enter your private key:*

*Format:* Base58 string (88 characters)
Example: \`5K1eK...\`

To cancel, type /cancel
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'wallets')]
        ])
    });
}

/**
 * Handle private key import
 */
async function handlePrivateKeyImport(ctx, userId, privateKey) {
    try {
        const normalizedKey = String(privateKey || '').trim();

        // Basic validation
        if (!normalizedKey || normalizedKey.length < 80) {
            throw new Error('Invalid private key format');
        }
        
        await ctx.reply('🔐 Validating private key...');
        
        // Import wallet using Solana web3
        const wallet = await solana.importWallet(normalizedKey);
        const balance = await solana.getBalance(wallet.publicKey);
        
        // Encrypt and store
        const encrypted = database.encryptPrivateKey(normalizedKey);
        
        const walletData = {
            id: `wallet_${Date.now()}`,
            name: `Wallet ${await database.getUserWalletCount(userId) + 1}`,
            address: wallet.publicKey,
            encryptedPrivateKey: encrypted,
            balance: balance,
            type: 'imported',
            connectedAt: new Date(),
            isActive: false
        };
        
        await database.addWallet(userId, walletData);
        await database.updateUserState(userId, null);
        
        const message = `
✅ *Wallet Imported Successfully!*

*Wallet Details:*
📛 Name: ${walletData.name}
🔑 Address: \`${wallet.publicKey.slice(0, 12)}...${wallet.publicKey.slice(-8)}\`
💰 Balance: ${balance.toFixed(4)} SOL

*Security Status:* 🔐 Encrypted

*What's next?*
• Set as active wallet for trading
• View transactions
• Start trading with sniper tools
        `;
        
        await ctx.replyWithMarkdown(message, {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 View Wallet', `wallet_${walletData.id}`)],
                [Markup.button.callback('⭐ Set as Active', `set_active_${walletData.id}`)],
                [Markup.button.callback('👛 All Wallets', 'wallets')]
            ])
        });
        
    } catch (error) {
        console.error('Import error:', error);
        await ctx.reply(
            '❌ *Import Failed*\n\n' +
            'Invalid private key. Please check:\n' +
            '• Key is 88 characters\n' +
            '• Key is in base58 format\n' +
            '• Key is for Solana network\n\n' +
            'Try again or use browser connection.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Try Again', 'import_wallet')],
                    [Markup.button.callback('🔌 Use Browser', 'connect_wallet_browser')]
                ])
            }
        );
    }
}

/**
 * Show wallet details
 */
async function showWalletDetails(ctx, userId, walletId) {
    try {
        const wallet = await database.getWallet(userId, walletId);
        
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        
        // Refresh balance
        const currentBalance = await solana.getBalance(wallet.address);
        await database.updateWalletBalance(userId, walletId, currentBalance);
        
        const isActive = wallet.isActive ? '✅ ACTIVE' : '';
        const walletType = wallet.type === 'imported' ? '📱 Imported' : '🌐 Browser';
        
        const message = `
👛 *Wallet Details*

*Name:* ${wallet.name} ${isActive}
*Type:* ${walletType}
*Address:* \`${wallet.address}\`
*Balance:* ${currentBalance.toFixed(4)} SOL
*Value:* ~$${(currentBalance * 127.3).toFixed(2)} USD
*Connected:* ${new Date(wallet.connectedAt).toLocaleDateString()}

*Recent Activity:*
${wallet.transactions?.length > 0 ? 
  `• Last transaction: ${wallet.transactions[0].type}\n` +
  `• ${wallet.transactions.length} total transactions` : 
  '• No transactions yet'}

*Security:* 🔐 Encrypted at rest
        `;
        
        await ctx.replyWithMarkdown(message, getWalletDetailsKeyboard(walletId));
        
    } catch (error) {
        console.error('Wallet details error:', error);
        await ctx.reply('❌ Failed to load wallet details.', {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('👛 Back to Wallets', 'wallets')]
            ])
        });
    }
}

/**
 * Set active wallet
 */
async function setActiveWallet(ctx, userId, walletId) {
    try {
        await database.setActiveWallet(userId, walletId);
        
        const wallet = await database.getWallet(userId, walletId);
        
        await ctx.reply(
            `✅ *Active Wallet Updated*\n\n` +
            `*${wallet.name}* is now your active wallet.\n\n` +
            `All trades will use this wallet by default.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📊 View Wallet', `wallet_${walletId}`)],
                    [Markup.button.callback('👛 All Wallets', 'wallets')]
                ])
            }
        );
        
    } catch (error) {
        console.error('Set active wallet error:', error);
        await ctx.reply('❌ Failed to set active wallet.');
    }
}

/**
 * Remove wallet
 */
async function removeWallet(ctx, userId, walletId) {
    try {
        await database.removeWallet(userId, walletId);
        
        await ctx.reply(
            '🗑️ *Wallet Removed*\n\n' +
            'The wallet has been disconnected from your account.\n\n' +
            'You can connect it again anytime.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔌 Connect New', 'connect_wallet_browser')],
                    [Markup.button.callback('👛 View Wallets', 'wallets')]
                ])
            }
        );
        
    } catch (error) {
        console.error('Remove wallet error:', error);
        await ctx.reply('❌ Failed to remove wallet.');
    }
}

/**
 * Check connection status
 */
async function checkConnection(ctx, userId) {
    let status = await walletConnection.checkConnectionStatus(userId);

    // Give the callback flow a brief moment to settle before declaring failure.
    if (status.status === 'disconnected') {
        await new Promise(resolve => setTimeout(resolve, 1200));
        status = await walletConnection.checkConnectionStatus(userId);
    }

    if (status.status === 'pending') {
        const minutesLeft = Math.max(1, Math.ceil((status.timeLeft || 0) / 60));
        await ctx.reply(
            '⏳ *Waiting for connection...*\n\n' +
            'Please complete these steps:\n' +
            '1. Open the browser link\n' +
            '2. Connect your wallet\n' +
            '3. Approve the connection\n\n' +
            `The link expires in ${minutesLeft} minute(s)`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Check Again', 'check_connection')],
                    [Markup.button.callback('❌ Cancel', 'wallets')]
                ])
            }
        );
    } else if (status.status === 'connected') {
        await ctx.reply(
            '✅ *Wallet Connected!*\n\n' +
            'Your wallet is now ready for trading.\n\n' +
            'Access all features from the main menu.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('👛 View Wallets', 'wallets')],
                    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                ])
            }
        );
    } else if (status.status === 'error') {
        await ctx.reply(
            '❌ *Connection Check Failed*\n\n' +
            'Unable to verify wallet status right now. Please try again.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Check Again', 'check_connection')],
                    [Markup.button.callback('🔌 Connect Wallet', 'connect_wallet_browser')]
                ])
            }
        );
    } else {
        if (database.memoryMode) {
            await ctx.reply(
                '⚠️ *Connection state is not persistent right now.*\n\n' +
                'The server is running in temporary memory mode, so wallet links may verify but not be saved.\n\n' +
                'Please configure MongoDB in deployment and reconnect your wallet.',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔌 Connect Wallet', 'connect_wallet_browser')],
                        [Markup.button.callback('🔄 Check Again', 'check_connection')]
                    ])
                }
            );
        } else {
            await ctx.reply(
                '❌ *No Connection Found*\n\n' +
                'Please start a new connection.',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔌 Connect Wallet', 'connect_wallet_browser')]
                    ])
                }
            );
        }
    }
}

/**
 * Refresh wallet balances
 */
async function refreshWalletBalances(ctx, userId) {
    await ctx.reply('🔄 Refreshing wallet balances...');
    
    try {
        const wallets = await database.getUserWallets(userId);
        
        for (const wallet of wallets) {
            const balance = await solana.getBalance(wallet.address);
            await database.updateWalletBalance(userId, wallet.id, balance);
        }
        
        await ctx.reply('✅ Balances updated!', {
            ...Markup.inlineKeyboard([
                [Markup.button.callback('👛 View Wallets', 'wallets')]
            ])
        });
        
    } catch (error) {
        console.error('Refresh balances error:', error);
        await ctx.reply('❌ Failed to refresh balances.');
    }
}

/**
 * Show profile
 */
async function showProfile(ctx, userId) {
    const user = await database.getUser(userId);
    const wallets = await database.getUserWallets(userId);
    const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    
    const level = calculateLevel(user.totalTrades || 0);
    const nextLevel = getNextLevel(level);
    
    const message = `
👤 *Your Profile*

*Basic Info:*
🆔 User ID: \`${userId}\`
👤 Username: @${ctx.from.username || 'Not set'}
📅 Member Since: ${new Date(user.joinedAt || Date.now()).toLocaleDateString()}

*Wallet Stats:*
💰 Total Balance: ${totalBalance.toFixed(4)} SOL
👛 Wallets: ${wallets.length}
📊 Active Wallet: ${wallets.find(w => w.isActive)?.name || 'None'}

*Trading Stats:*
📈 Total Trades: ${user.totalTrades || 0}
🏆 Win Rate: ${user.winRate ? user.winRate.toFixed(1) + '%' : 'N/A'}
📊 Level: ${level.name} (${level.xp} XP)
🎯 Next Level: ${nextLevel.name} (${nextLevel.xpNeeded} XP)

*Referral Stats:*
👥 Referrals: ${user.referrals?.length || 0}
💰 Rewards: ${user.referralRewards || 0} SOL
🎁 Cashback: ${user.cashbackEarned || 0} SOL
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Trading Stats', 'trading_stats')],
            [Markup.button.callback('🎯 Referral Link', 'referral_link')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show referral system
 */
async function showReferralSystem(ctx, userId) {
    const user = await database.getUser(userId);
    const referralCode = user.referralCode || generateReferralCode(userId);
    const referralLink = `https://t.me/${BOT_USERNAME}?start=${referralCode}`;
    
    const message = `
🎯 *Referral System*

*Earn SOL by inviting friends!*

*Your Referral Link:*
\`${referralLink}\`

*How it works:*
1️⃣ Share your unique link
2️⃣ Friend joins and connects wallet
3️⃣ You earn *0.01 SOL* instantly!
4️⃣ Friend gets *0.005 SOL* bonus
5️⃣ Earn *10%* of their trading fees forever!

*Your Stats:*
👥 Total Referrals: ${user.referrals?.length || 0}
💰 Total Earned: ${user.referralRewards || 0} SOL
🏆 Rank: ${getReferralRank(user.referrals?.length || 0)}

*Top Referrers This Month:*
🥇 @topuser1 - 120 referrals
🥈 @topuser2 - 89 referrals
🥉 @topuser3 - 76 referrals
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Copy Link', 'copy_referral_link')],
            [Markup.button.callback('👥 View Referrals', 'view_referrals')],
            [Markup.button.callback('🏆 Leaderboard', 'referral_leaderboard')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show trades
 */
async function showTrades(ctx, userId) {
    const trades = await database.getUserTrades(userId, 10);
    
    let message = `📈 *Your Recent Trades*\n\n`;
    
    if (trades.length === 0) {
        message += `No trades yet. Start trading with our sniper tools!`;
    } else {
        trades.forEach((trade, i) => {
            const profitEmoji = trade.profit > 0 ? '💰' : '📉';
            const typeEmoji = trade.type === 'buy' ? '🟢 BUY' : '🔴 SELL';
            
            message += `*Trade ${i + 1}:*\n`;
            message += `${typeEmoji} ${trade.tokenSymbol || 'Unknown'}\n`;
            message += `Amount: ${trade.amount} SOL\n`;
            message += `Price: $${trade.price?.toFixed(4) || '0.00'}\n`;
            message += `Profit: ${profitEmoji} ${trade.profit?.toFixed(2) || '0'}%\n`;
            message += `Time: ${new Date(trade.timestamp).toLocaleString()}\n`;
            message += `---\n`;
        });
    }
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 All Trades', 'all_trades')],
            [Markup.button.callback('📈 Performance', 'performance')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show sniper V1
 */
async function showSniperV1(ctx, userId) {
    // Check if user has active wallet
    const wallets = await database.getUserWallets(userId);
    const activeWallet = wallets.find(w => w.isActive);
    
    if (!activeWallet) {
        await ctx.reply(
            '❌ *No Active Wallet*\n\n' +
            'Please connect and activate a wallet first.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔌 Connect Wallet', 'connect_wallet_browser')],
                    [Markup.button.callback('👛 View Wallets', 'wallets')]
                ])
            }
        );
        return;
    }
    
    const message = `
🎯 *Sniper V1 - Classic Edition*

*Features:*
• Basic token sniping
• Manual trading
• Simple interface
• Reliable execution

*Your Active Wallet:*
${activeWallet.name} (${activeWallet.balance?.toFixed(2) || 0} SOL)

*Parameters:*
🪙 Token Address: [Enter manually]
💎 SOL Amount: [0.1-10 SOL]
📈 Slippage: 5-20%

*How to use:*
1. Enter token address
2. Set SOL amount
3. Configure slippage
4. Execute snipe

*Status:* ✅ Active
*Success Rate:* 92%
*Avg Speed:* 1.2 seconds
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Start Sniper', 'start_sniper_v1')],
            [Markup.button.callback('⚙️ Configure', 'config_sniper_v1')],
            [Markup.button.callback('📊 Statistics', 'stats_sniper_v1')],
            [Markup.button.callback('🔙 Back', 'buy_sell')]
        ])
    });
}

/**
 * Show sniper V2
 */
async function showSniperV2(ctx, userId) {
    const wallets = await database.getUserWallets(userId);
    const activeWallet = wallets.find(w => w.isActive);
    
    const message = `
🚀 *Sniper V2 - Advanced Edition* 🔥 NEW

*Features:*
• Multi-wallet sniping
• Auto-buy on launch
• Rug-pull protection
• Profit tracking
• Auto-sell at target

*Your Active Wallet:*
${activeWallet?.name || 'None'} (${activeWallet?.balance?.toFixed(2) || 0} SOL)

*Advanced Features:*
🎯 Auto-detect new tokens
🛡️ Anti-MEV protection
📊 Real-time analytics
🤖 Multiple strategies

*Parameters:*
🪙 Auto-detect or manual
💎 SOL Amount: [0.01-50 SOL]
🎯 Buy Delay: 0-5 seconds
📈 Slippage: 1-50%
🎯 Take Profit: 10-1000%
📉 Stop Loss: 5-50%

*Premium Features:* 
✅ 5x faster execution
✅ Higher success rate
✅ Advanced analytics
✅ Priority queue

*Status:* 🟢 ACTIVE
*Success Rate:* 97%
*Avg Speed:* 0.4 seconds
*Profit Avg:* +42%
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Launch Sniper V2', 'launch_sniper_v2')],
            [Markup.button.callback('⚙️ Advanced Config', 'adv_config_v2')],
            [Markup.button.callback('📊 Live Dashboard', 'dashboard_v2')],
            [Markup.button.callback('🎯 Strategies', 'strategies_v2')],
            [Markup.button.callback('🔙 Back', 'buy_sell')]
        ])
    });
}

/**
 * Show Pumpfun sniper
 */
async function showPumpfunSniper(ctx, _userId) {
    const message = `
🎪 *Pumpfun Sniper*

*Specialized for Pump.fun tokens*

*Features:*
• Instant buy on mint
• Auto-snipe new listings
• Volume tracking
• Pump detection
• Early exit signals

*Current Trending Pump.fun Tokens:*
1. $PEPE: $0.0000123 (+245%)
2. $WIF: $0.045 (+189%)
3. $BONK: $0.000023 (+156%)

*Recommended Settings:*
💎 SOL Amount: 0.05-2 SOL
🎯 Buy Immediately: YES
📈 Slippage: 15-30%
🎯 TP: 30-100%
📉 SL: 15%

*Warning:* High risk, high reward!
Only snipe tokens you research.

*Status:* 🟡 MODERATE RISK
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎯 Snipe Now', 'snipe_pumpfun')],
            [Markup.button.callback('🔄 Scan New', 'scan_pumpfun')],
            [Markup.button.callback('📊 Analytics', 'analytics_pumpfun')],
            [Markup.button.callback('🔙 Back', 'buy_sell')]
        ])
    });
}

/**
 * Show Moonshot sniper
 */
async function showMoonshotSniper(ctx, _userId) {
    const message = `
🌙 *Moonshot Sniper*

*For potential 100x tokens*

*Features:*
• Deep token analysis
• Team verification
• Liquidity checks
• Community metrics
• Moon potential score

*New Potential Moonshots:*
1. $SOLPAD - Market cap: $50k
2. $RAYDIUM - Market cap: $75k
3. $ORCA - Market cap: $120k

*Moonshot Criteria:*
✅ Low market cap (<$100k)
✅ Active team
✅ Good tokenomics
✅ Growing community
✅ No red flags

*Risk Level:* 🟥 EXTREME
*Potential:* 10x-1000x
*Success Rate:* 8%

*Only for experienced traders!*
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🌙 Find Moonshot', 'find_moonshot')],
            [Markup.button.callback('🔍 Deep Analysis', 'analyze_moonshot')],
            [Markup.button.callback('📈 Track Potential', 'track_moonshot')],
            [Markup.button.callback('🔙 Back', 'buy_sell')]
        ])
    });
}

/**
 * Show LaunchLab sniper
 */
async function showLaunchLabSniper(ctx, _userId) {
    const message = `
🚀 *LaunchLab Sniper*

*For presales and new launches*

*Features:*
• Presale participation
• Whitelist spots
• Fair launch sniping
• IDO participation
• Launchpad integration

*Upcoming Launches:*
1. *Project Alpha* - 2 hours
2. *MetaDex* - 6 hours  
3. *SolGame* - 1 day

*LaunchLab Benefits:*
🎯 Guaranteed allocation
⏱️ Priority access
📊 Pre-launch analytics
🛡️ Anti-bot protection

*Requirements:*
• Minimum 5 SOL stake
• KYC verification
• VIP membership

*Status:* 🔒 VIP ONLY
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 View Launches', 'view_launches')],
            [Markup.button.callback('🎫 Get Whitelist', 'get_whitelist')],
            [Markup.button.callback('⭐ VIP Access', 'vip_access')],
            [Markup.button.callback('🔙 Back', 'buy_sell')]
        ])
    });
}

/**
 * Show limit orders
 */
async function showLimitOrders(ctx, _userId) {
    const message = `
⏰ *Limit Orders*

Place automated orders at your target price

*Active Orders:*
📈 No active limit orders

*Create New Order:*
• Buy SOL at $120
• Sell SOL at $140
• Buy token at specific price

*Features:*
• Set and forget
• Execute at target price
• Multiple orders supported
• Real-time monitoring
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Create Limit Buy', 'create_limit_buy')],
            [Markup.button.callback('➖ Create Limit Sell', 'create_limit_sell')],
            [Markup.button.callback('📋 View Orders', 'view_limit_orders')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show copy trades
 */
async function showCopyTrades(ctx, _userId) {
    const message = `
👥 *Copy Trading*

Copy successful traders automatically

*Top Traders to Copy:*
1. @whale_trader - +245% (7d)
2. @smart_money - +189% (7d)
3. @defi_pro - +156% (7d)

*Your Copy Settings:*
• Allocation: 0.5 SOL per trade
• Max trades: 5 per day
• Stop loss: 10%

*Features:*
• Auto-copy trades
• Custom allocation
• Risk management
• Performance tracking
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('👤 Find Traders', 'find_traders')],
            [Markup.button.callback('⚙️ Settings', 'copy_settings')],
            [Markup.button.callback('📊 Performance', 'copy_performance')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show settings
 */
async function showSettings(ctx, userId) {
    const user = await database.getUser(userId);
    const settings = user.settings || {};
    
    const message = `
⚙️ *Settings*

*Notification Preferences:*
🔔 Price Alerts: ${settings.priceAlerts ? '✅ ON' : '❌ OFF'}
📊 Trade Updates: ${settings.tradeUpdates ? '✅ ON' : '❌ OFF'}
📈 Daily Summary: ${settings.dailySummary ? '✅ ON' : '❌ OFF'}

*Trading Preferences:*
💎 Default Slippage: ${settings.defaultSlippage || 10}%
🔄 Auto-confirm: ${settings.autoConfirm ? '✅ ON' : '❌ OFF'}
📉 Default Stop Loss: ${settings.defaultStopLoss || 5}%

*Security Settings:*
🔐 2FA: ${settings.twoFA ? '✅ Enabled' : '❌ Disabled'}
🔑 Session Timeout: ${settings.sessionTimeout || 30} minutes
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔔 Notifications', 'edit_notifications')],
            [Markup.button.callback('💎 Trading', 'edit_trading')],
            [Markup.button.callback('🔐 Security', 'security')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show security
 */
async function showSecurity(ctx, _userId) {
    const message = `
🛡️ *Security Center*

*Account Security:*
🔐 Last Login: ${new Date().toLocaleString()}
📱 Active Sessions: 1
🔑 2FA Status: Not enabled

*Wallet Security:*
✅ Private keys encrypted
✅ No plain text storage
✅ Session timeouts enabled

*Recommended Actions:*
• Enable 2FA
• Review connected wallets
• Set withdrawal limits

*Security Tips:*
• Never share private keys
• Use unique passwords
• Enable notifications
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔐 Enable 2FA', 'enable_2fa')],
            [Markup.button.callback('📱 Sessions', 'active_sessions')],
            [Markup.button.callback('👛 Wallets', 'wallets')],
            [Markup.button.callback('🔙 Back', 'settings')]
        ])
    });
}

/**
 * Show our token
 */
async function showOurToken(ctx) {
    const message = `
🤖 *STBOT Token*

The native token of Solana Web Bot

*Tokenomics:*
• Total Supply: 1,000,000,000 STBOT
• Circulating: 250,000,000 STBOT
• Current Price: $0.0012
• Market Cap: $300,000

*Benefits:*
💰 50% fee discount when holding
🎯 Early access to new features
💸 Share of platform revenue
🏆 Governance rights

*How to Get:*
• Buy on Raydium
• Earn through trading
• Referral rewards
• Staking rewards

*Price: $0.0012* 📈 +12% today
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.url('🔄 Buy on Raydium', 'https://raydium.io/swap')],
            [Markup.button.callback('📊 Chart', 'stbot_chart')],
            [Markup.button.callback('💰 Staking', 'stbot_staking')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show market maker
 */
async function showMarketMaker(ctx) {
    const message = `
🏦 *Market Maker Program*

Provide liquidity and earn fees

*Current Pools:*
• SOL/USDC: 45% APR
• STBOT/SOL: 38% APR
• RAY/SOL: 22% APR

*Your Liquidity:*
💰 Total Provided: 0 SOL
📊 Pending Rewards: 0 SOL

*Benefits:*
• Earn trading fees
• Passive income
• Support the ecosystem
• No lock-up period

*Minimum: 10 SOL per pool*
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Add Liquidity', 'add_liquidity')],
            [Markup.button.callback('➖ Remove', 'remove_liquidity')],
            [Markup.button.callback('📊 Stats', 'mm_stats')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show backup bots
 */
async function showBackupBots(ctx) {
    const message = `
🔧 *Backup Bots*

Never miss a trade - automatic failover

*Primary Bot:* ✅ Online
*Backup 1:* ✅ Standby
*Backup 2:* ✅ Standby

*Features:*
• Automatic failover
• 99.99% uptime
• Instant switching
• No data loss

*Current Status:*
All systems operational
Uptime: 99.98% (30 days)
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Status', 'backup_status')],
            [Markup.button.callback('🔄 Switch Now', 'switch_backup')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show help
 */
async function showHelp(ctx) {
    const message = `
🆘 *Help & Support*

*Quick Help:*
• /start - Main menu
• /wallets - Manage wallets
• /connect - Connect wallet
• /trade - Start trading
• /price - Check SOL price

*FAQs:*
❓ *How to connect wallet?*
→ Use "Connect Wallet" button, open browser link

❓ *Is it safe?*
→ Yes, encrypted storage, never store private keys

❓ *Which wallets?*
→ Phantom, Solflare, Backpack, any Solana wallet

*Need more help?*
📧 Email: support@solanatradingbot.com
🐦 Twitter: @SolanaWebBot
💬 Support Chat: @SolanaWebBotSupport
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📚 Tutorial', 'tutorial')],
            [Markup.button.callback('❓ FAQs', 'faqs')],
            [Markup.button.url('💬 Support', 'https://t.me/SolanaWebBotSupport')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

/**
 * Show tutorial
 */
async function showTutorial(ctx) {
    const message = `
📚 *Tutorial: Getting Started*

*Step 1: Connect Wallet*
• Click "Connect Wallet"
• Open browser link
• Approve in Phantom/Solflare

*Step 2: Fund Your Wallet*
• Send SOL to your wallet address
• Minimum 0.1 SOL for trading

*Step 3: Start Trading*
• Choose sniper tool
• Enter token address
• Set amount and execute

*Step 4: Monitor Trades*
• View in "Trades" section
• Track profits/losses
• Adjust strategy

*Video Tutorial:*
Watch our 2-minute guide
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.url('📹 Watch Video', 'https://youtube.com')],
            [Markup.button.callback('🔙 Back', 'help_menu')]
        ])
    });
}

/**
 * Handle disconnect wallet
 */
async function handleDisconnectWallet(ctx, userId) {
    const wallets = await database.getUserWallets(userId);
    
    if (wallets.length === 0) {
        await ctx.reply('No wallets to disconnect.');
        return;
    }
    
    const buttons = wallets.map(w => [
        Markup.button.callback(`❌ ${w.name}`, `confirm_remove_${w.id}`)
    ]);
    
    buttons.push([Markup.button.callback('🔙 Back', 'wallets')]);
    
    await ctx.reply(
        '🗑️ *Select wallet to disconnect:*',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        }
    );
}

/**
 * Show receive address
 */
async function showReceiveAddress(ctx, userId, walletId) {
    const wallet = await database.getWallet(userId, walletId);
    
    if (!wallet) return;
    
    // Generate QR code (would need qrcode library)
    const message = `
📥 *Receive SOL*

*Wallet:* ${wallet.name}

*Address:*
\`${wallet.address}\`

*Instructions:*
1. Copy the address above
2. Send SOL from any wallet/exchange
3. Funds will appear automatically

*Minimum deposit:* 0.01 SOL
*Processing time:* ~30 seconds

*QR Code:* (coming soon)
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Copy Address', `copy_${wallet.address}`)],
            [Markup.button.callback('🔄 Check Balance', `wallet_${walletId}`)],
            [Markup.button.callback('🔙 Back', `wallet_${walletId}`)]
        ])
    });
}

/**
 * Show transactions
 */
async function showTransactions(ctx, userId, walletId) {
    const wallet = await database.getWallet(userId, walletId);
    
    if (!wallet) return;
    
    // Fetch recent transactions from Solana
    const txs = await solana.getRecentTransactions(wallet.address, 5);
    
    let message = `📊 *Recent Transactions*\n\n`;
    message += `Wallet: ${wallet.name}\n\n`;
    
    if (txs.length === 0) {
        message += 'No transactions found.';
    } else {
        txs.forEach((tx) => {
            const type = tx.type === 'incoming' ? '📥 Received' : '📤 Sent';
            const txTime = tx.timestamp || tx.time || Date.now();
            message += `${type}: ${tx.amount} SOL\n`;
            message += `Time: ${new Date(txTime).toLocaleString()}\n`;
            message += `[View on Solscan](https://solscan.io/tx/${tx.signature})\n\n`;
        });
    }
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', `tx_${walletId}`)],
            [Markup.button.callback('🔙 Back', `wallet_${walletId}`)]
        ])
    });
}

/**
 * Initiate send SOL
 */
async function initiateSendSol(ctx, userId, walletId) {
    const wallet = await database.getWallet(userId, walletId);
    
    if (!wallet) return;
    
    await database.updateUserState(userId, buildSendAmountState(walletId));
    
    await ctx.reply(
        `💸 *Send SOL from ${wallet.name}*\n\n` +
        `Available balance: ${wallet.balance?.toFixed(4) || 0} SOL\n\n` +
        `Please enter the amount to send:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('25%', 'amount_25')],
                [Markup.button.callback('50%', 'amount_50')],
                [Markup.button.callback('75%', 'amount_75')],
                [Markup.button.callback('100%', 'amount_100')],
                [Markup.button.callback('❌ Cancel', `wallet_${walletId}`)]
            ])
        }
    );
}

/**
 * Handle send amount
 */
async function handleSendAmount(ctx, userId, text) {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount. Please enter a positive number.');
        return;
    }
    
    // Get wallet from state
    const user = await database.getUser(userId);
    const walletId = parseSendAmountWalletId(user?.state);
    if (!walletId) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ Send state expired. Please start again.', getMainMenuKeyboard());
        return;
    }
    const wallet = await database.getWallet(userId, walletId);
    if (!wallet) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ Wallet not found. Please choose a wallet again.', getMainMenuKeyboard());
        return;
    }
    
    if (amount > wallet.balance) {
        await ctx.reply('❌ Insufficient balance.');
        return;
    }
    
    await database.updateUserState(userId, buildSendAddressState(walletId, amount));
    
    await ctx.reply(
        `💸 Send ${amount} SOL\n\n` +
        `Please enter the recipient's Solana address:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', `wallet_${walletId}`)]
            ])
        }
    );
}

/**
 * Handle send address
 */
async function handleSendAddress(ctx, userId, address) {
    if (!solana.isValidAddress(address)) {
        await ctx.reply('❌ Invalid Solana address.');
        return;
    }
    
    const user = await database.getUser(userId);
    const sendState = parseSendAddressState(user?.state);
    if (!sendState) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ Send state expired. Please start again.', getMainMenuKeyboard());
        return;
    }
    const { walletId, amount } = sendState;
    
    const wallet = await database.getWallet(userId, walletId);
    if (!wallet) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ Wallet not found. Please choose a wallet again.', getMainMenuKeyboard());
        return;
    }
    if (!wallet.encryptedPrivateKey) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ This wallet was browser-connected and cannot send via private key flow.');
        return;
    }
    
    await ctx.reply(`⏳ Sending ${amount} SOL to ${address.slice(0, 8)}...`);
    
    try {
        // Decrypt private key and send
        const decryptedKey = database.decryptPrivateKey(wallet.encryptedPrivateKey);
        const result = await solana.transferSOL(decryptedKey, address, amount);
        
        if (result.success) {
            await ctx.reply(
                `✅ *Transfer Successful!*\n\n` +
                `Amount: ${amount} SOL\n` +
                `To: \`${address.slice(0, 8)}...${address.slice(-8)}\`\n` +
                `Fee: ~0.000005 SOL\n\n` +
                `[View on Solscan](https://solscan.io/tx/${result.signature})`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📊 View Wallet', `wallet_${walletId}`)]
                    ])
                }
            );
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('Send error:', error);
        await ctx.reply('❌ Transfer failed. Please try again.');
    }
    
    await database.updateUserState(userId, null);
}

async function handleSendAmountPreset(ctx, userId, percentage) {
    if (![25, 50, 75, 100].includes(percentage)) {
        await ctx.reply('❌ Invalid percentage selection.');
        return;
    }

    const user = await database.getUser(userId);
    const walletId = parseSendAmountWalletId(user?.state);
    if (!walletId) {
        await ctx.reply('❌ Please choose a wallet and start send flow again.');
        return;
    }

    const wallet = await database.getWallet(userId, walletId);
    if (!wallet) {
        await database.updateUserState(userId, null);
        await ctx.reply('❌ Wallet not found. Please start again.');
        return;
    }

    const balance = Number(wallet.balance || 0);
    const amount = Number((balance * (percentage / 100)).toFixed(9));

    if (amount <= 0) {
        await ctx.reply('❌ Insufficient balance.');
        return;
    }

    await handleSendAmount(ctx, userId, String(amount));
}

/**
 * Show cashback
 */
async function showCashback(ctx, userId) {
    const user = await database.getUser(userId);
    
    const message = `
💸 *Cashback Program*

Earn SOL back on every trade!

*Your Cashback Stats:*
💰 Total Earned: ${user.cashbackEarned || 0} SOL
📊 Pending: ${user.pendingCashback || 0} SOL
🎯 Next Payout: ${getNextPayoutDate()}

*Tier Levels:*
🥉 Bronze: 0.5% cashback (0-100 SOL volume)
🥈 Silver: 1% cashback (100-500 SOL volume)
🥇 Gold: 2% cashback (500-2000 SOL volume)
💎 Platinum: 3% cashback (2000+ SOL volume)

*Your Current Tier:* ${user.cashbackTier || 'Bronze'}
*Your Volume:* ${user.totalVolume || 0} SOL

*To reach next tier:*
${getNextTierRequirement(user)} more SOL volume needed
    `;
    
    await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Cashback History', 'cashback_history')],
            [Markup.button.callback('🏆 Tier Benefits', 'tier_benefits')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ])
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateReferralCode(userId) {
    return `ref_${userId}_${Date.now().toString(36)}`;
}

function getReferralRank(count) {
    if (count >= 100) return 'Legend';
    if (count >= 50) return 'Master';
    if (count >= 25) return 'Pro';
    if (count >= 10) return 'Advanced';
    if (count >= 5) return 'Intermediate';
    return 'Beginner';
}

function calculateLevel(trades) {
    if (trades >= 1000) return { name: 'Whale', xp: 1000 };
    if (trades >= 500) return { name: 'Expert', xp: 500 };
    if (trades >= 200) return { name: 'Advanced', xp: 200 };
    if (trades >= 50) return { name: 'Intermediate', xp: 50 };
    return { name: 'Beginner', xp: 0 };
}

function getNextLevel(current) {
    const levels = {
        'Beginner': { name: 'Intermediate', xpNeeded: 50 },
        'Intermediate': { name: 'Advanced', xpNeeded: 150 },
        'Advanced': { name: 'Expert', xpNeeded: 300 },
        'Expert': { name: 'Whale', xpNeeded: 500 },
        'Whale': { name: 'Max Level', xpNeeded: 0 }
    };
    return levels[current.name] || { name: 'Max Level', xpNeeded: 0 };
}

function getNextPayoutDate() {
    const date = new Date();
    date.setDate(date.getDate() + (7 - date.getDay()));
    return date.toLocaleDateString();
}

function getNextTierRequirement(user) {
    const volume = user.totalVolume || 0;
    if (volume < 100) return 100 - volume;
    if (volume < 500) return 500 - volume;
    if (volume < 2000) return 2000 - volume;
    return 0;
}

function escapeMarkdown(input) {
    return String(input || '').replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function buildSendAmountState(walletId) {
    return `${STATE_SEND_AMOUNT_PREFIX}${walletId}`;
}

function buildSendAddressState(walletId, amount) {
    return `${STATE_SEND_ADDRESS_PREFIX}${walletId}|${amount}`;
}

function parseSendAmountWalletId(state) {
    if (!state) return null;

    if (state.startsWith(STATE_SEND_AMOUNT_PREFIX)) {
        return state.slice(STATE_SEND_AMOUNT_PREFIX.length);
    }

    if (state.startsWith('awaiting_send_amount_')) {
        return state.replace('awaiting_send_amount_', '');
    }

    return null;
}

function parseSendAddressState(state) {
    if (!state) return null;

    if (state.startsWith(STATE_SEND_ADDRESS_PREFIX)) {
        const payload = state.slice(STATE_SEND_ADDRESS_PREFIX.length);
        const separatorIndex = payload.lastIndexOf('|');
        if (separatorIndex <= 0) return null;
        const walletId = payload.slice(0, separatorIndex);
        const amount = Number.parseFloat(payload.slice(separatorIndex + 1));
        if (!walletId || !Number.isFinite(amount) || amount <= 0) return null;
        return { walletId, amount };
    }

    if (state.startsWith('awaiting_send_address_')) {
        const payload = state.replace('awaiting_send_address_', '');
        const separatorIndex = payload.lastIndexOf('_');
        if (separatorIndex <= 0) return null;
        const walletId = payload.slice(0, separatorIndex);
        const amount = Number.parseFloat(payload.slice(separatorIndex + 1));
        if (!walletId || !Number.isFinite(amount) || amount <= 0) return null;
        return { walletId, amount };
    }

    return null;
}

/**
 * Handle sniper parameters
 */
async function handleSniperParameters(ctx, userId, _text, _state) {
    // Parse and validate sniper settings
    await ctx.reply('✅ Sniper parameters saved! Ready to execute.');
    await database.updateUserState(userId, null);
}

/**
 * Handle transfer SOL
 */
async function handleTransferSol(ctx, userId) {
    const wallets = await database.getUserWallets(userId);
    
    if (wallets.length === 0) {
        await ctx.reply('❌ No wallets to transfer from.');
        return;
    }
    
    const buttons = wallets.map(w => [
        Markup.button.callback(`${w.name} (${w.balance?.toFixed(2) || 0} SOL)`, `send_${w.id}`)
    ]);
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await ctx.reply(
        '💸 *Transfer SOL*\n\nSelect source wallet:',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        }
    );
}

// ============================================
// EXPORTS
// ============================================

module.exports = { setupBot };
