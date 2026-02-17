const { Telegraf } = require('telegraf');

const BOT_TOKEN = '8525460066:AAHx2Il6d7rSNkfN4RFzsWXLvfLIooyErek';

async function testBotConnection() {
    console.log('Testing Telegram bot connection...');
    
    try {
        const bot = new Telegraf(BOT_TOKEN);
        
        console.log('1. Testing getMe...');
        const user = await bot.telegram.getMe({ timeout: 30000 });
        console.log('✅ Bot information:', user);
        
        console.log('\n2. Testing launch (with very short timeout)...');
        // Try to launch with polling to test connection
        const launchPromise = bot.launch({ dropPendingUpdates: true });
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Bot launch timeout (this is expected for test purposes)'));
            }, 5000);
        });
        
        await Promise.race([launchPromise, timeoutPromise]);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        if (error.request) {
            console.error('No response received');
        }
    }
}

testBotConnection().then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});