// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const connectionId = urlParams.get('connectionId');
const userId = urlParams.get('userId');
const chatId = urlParams.get('chatId');
const callbackUrl = urlParams.get('callback');

// Timer
let timeLeft = 300; // 5 minutes in seconds
const timerElement = document.getElementById('timer');

const timer = setInterval(() => {
    timeLeft--;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
        clearInterval(timer);
        window.location.href = '/expired.html';
    }
}, 1000);

// Wallet connection functions
async function connectPhantom() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            window.open('https://phantom.app/download', '_blank');
            showStatus('Please install Phantom wallet first', 'warning');
            return;
        }
        
        showStatus('Connecting to Phantom...', 'info');
        
        const response = await window.solana.connect();
        const publicKey = response.publicKey.toString();
        
        await sendWalletToBackend(publicKey, 'phantom');
        
    } catch (error) {
        console.error('Phantom connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
    }
}

async function connectSolflare() {
    try {
        const provider = window.solflare;
        if (!provider || typeof provider.connect !== 'function') {
            window.open('https://solflare.com/download', '_blank');
            showStatus('Please install Solflare wallet first', 'warning');
            return;
        }

        showStatus('Connecting to Solflare...', 'info');
        await provider.connect();
        const publicKey = provider.publicKey?.toString();

        if (!publicKey) {
            throw new Error('Solflare did not return a public key');
        }

        await sendWalletToBackend(publicKey, 'solflare');
    } catch (error) {
        console.error('Solflare connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
    }
}

async function connectBackpack() {
    try {
        const provider = window.backpack || window.xnft?.solana;
        if (!provider || typeof provider.connect !== 'function') {
            window.open('https://backpack.app/download', '_blank');
            showStatus('Please install Backpack wallet first', 'warning');
            return;
        }

        showStatus('Connecting to Backpack...', 'info');
        const response = await provider.connect();
        const publicKey = response?.publicKey?.toString() || provider.publicKey?.toString();

        if (!publicKey) {
            throw new Error('Backpack did not return a public key');
        }

        await sendWalletToBackend(publicKey, 'backpack');
    } catch (error) {
        console.error('Backpack connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
    }
}

async function sendWalletToBackend(walletAddress, walletType) {
    showStatus('Verifying connection...', 'info');
    
    try {
        const response = await fetch(callbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connectionId,
                userId: parseInt(userId),
                chatId: parseInt(chatId),
                walletAddress,
                walletType,
                publicKey: walletAddress
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Connected successfully! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = `/success.html?userId=${userId}`;
            }, 2000);
        } else {
            showStatus('❌ ' + data.error, 'error');
        }
        
    } catch (error) {
        console.error('Callback error:', error);
        showStatus('Failed to verify connection', 'error');
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

window.connectPhantom = connectPhantom;
window.connectSolflare = connectSolflare;
window.connectBackpack = connectBackpack;
