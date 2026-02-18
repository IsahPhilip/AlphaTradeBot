// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const connectionId = urlParams.get('connectionId');
const userId = urlParams.get('userId');
const chatId = urlParams.get('chatId');
const callbackUrl = urlParams.get('callback');
const connToken = urlParams.get('connToken');
const expiresAtParam = urlParams.get('expiresAt');
const challengeParam = urlParams.get('challenge');
const parsedUserId = Number.parseInt(userId, 10);
const parsedChatId = Number.parseInt(chatId, 10);
const challengeMessage = decodeBase64UrlToUtf8(challengeParam);
const parsedExpiresAtMs = Date.parse(expiresAtParam || '');
const hasValidExpiresAt = !Number.isNaN(parsedExpiresAtMs);

function decodeBase64UrlToUtf8(value) {
    try {
        if (!value) return '';
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = (4 - (normalized.length % 4)) % 4;
        const padded = normalized + '='.repeat(padLength);
        return decodeURIComponent(escape(window.atob(padded)));
    } catch {
        return '';
    }
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function normalizeSignatureBytes(result) {
    if (!result) return null;

    if (result.signature instanceof Uint8Array) return result.signature;
    if (result instanceof Uint8Array) return result;
    if (Array.isArray(result)) return Uint8Array.from(result);

    return null;
}

async function signChallenge(provider, walletType) {
    if (!challengeMessage) {
        throw new Error('Missing signing challenge');
    }

    if (!provider || typeof provider.signMessage !== 'function') {
        throw new Error(`${walletType} does not support message signing in this environment`);
    }

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(challengeMessage);
    const attempts = [
        () => provider.signMessage(messageBytes),
        () => provider.signMessage(messageBytes, 'utf8'),
        () => provider.signMessage(messageBytes, { display: 'utf8' })
    ];

    let lastError = null;
    let signatureBytes = null;

    for (const attempt of attempts) {
        try {
            const signatureResult = await attempt();
            signatureBytes = normalizeSignatureBytes(signatureResult);
            if (signatureBytes && signatureBytes.length > 0) {
                break;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (!signatureBytes || signatureBytes.length === 0) {
        if (lastError) {
            throw lastError;
        }
        throw new Error('Wallet did not return a signature');
    }

    return bytesToBase64(signatureBytes);
}

function isValidCallbackUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function hasValidConnectionParams() {
    return Boolean(
        connectionId &&
        Number.isInteger(parsedUserId) &&
        parsedUserId > 0 &&
        Number.isInteger(parsedChatId) &&
        parsedChatId > 0 &&
        challengeMessage &&
        connToken &&
        isValidCallbackUrl(callbackUrl)
    );
}

function getInitialTimeLeft() {
    if (hasValidExpiresAt) {
        const seconds = Math.floor((parsedExpiresAtMs - Date.now()) / 1000);
        // Avoid instant false-expired redirects from client clock skew.
        if (seconds <= 0) {
            return 300;
        }
        return seconds;
    }

    return 300;
}

// Timer
let timeLeft = getInitialTimeLeft();
const timerElement = document.getElementById('timer');

if (!hasValidConnectionParams()) {
    showStatus('❌ Invalid or incomplete wallet link. Please reopen the latest link from Telegram.', 'error');
}

const timer = setInterval(() => {
    timeLeft--;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
        clearInterval(timer);
        // Redirect to expired page only when an explicit server expiry was supplied.
        if (hasValidExpiresAt) {
            window.location.href = '/expired.html';
            return;
        }
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
        const signature = await signChallenge(window.solana, 'Phantom');

        await sendWalletToBackend(publicKey, 'phantom', signature);
        
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

        const signature = await signChallenge(provider, 'Solflare');

        await sendWalletToBackend(publicKey, 'solflare', signature);
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

        const signature = await signChallenge(provider, 'Backpack');

        await sendWalletToBackend(publicKey, 'backpack', signature);
    } catch (error) {
        console.error('Backpack connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
    }
}

async function sendWalletToBackend(walletAddress, walletType, signature) {
    if (!hasValidConnectionParams()) {
        showStatus('❌ Invalid or incomplete wallet link. Please reopen the latest link from Telegram.', 'error');
        return;
    }

    showStatus('Verifying connection...', 'info');
    
    try {
        const response = await fetch(callbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connectionId,
                userId: parsedUserId,
                chatId: parsedChatId,
                connToken,
                walletAddress,
                walletType,
                publicKey: walletAddress,
                signature
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Connected successfully!', 'success');
            
            setTimeout(() => {
                window.location.href = `/success.html?userId=${userId}`;
            }, 2000);
        } else {
            const normalizedError = String(data.error || '');
            if (normalizedError.includes('Connection not found or expired') || normalizedError.includes('Connection link expired')) {
                showStatus('❌ Link expired. Please reopen the latest wallet link from Telegram.', 'error');
                return;
            }

            showStatus('❌ ' + normalizedError, 'error');
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
