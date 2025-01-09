// phone_controller.js

// Generate WebSocket URL
const urlParts = window.location.pathname.split('/');
const gameCode = urlParts[urlParts.length - 1];
const isLocalhost = window.location.hostname === 'localhost';
const protocol = isLocalhost ? 'ws' : 'wss';
const socketUrl = `${protocol}://${window.location.host}/game/${gameCode}/ws`;
const socket = new WebSocket(socketUrl);

// Unique ID for the phone
const phoneId = `phone-${Math.random().toString(36).substr(2, 9)}`;

// Update the code display
const codeElement = document.getElementById('code');
if (codeElement) {
    codeElement.textContent = gameCode;
}

let isConnected = false;
let assignedColor = '#ffffff';
let lastMotionSentTime = 0;
const motionThrottleInterval = 50; // 50ms

// Prevent phone from sleeping
let wakeLock = null;
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake lock is active');

            wakeLock.addEventListener('release', () => {
                console.log('Wake lock was released');
            });
        } catch (err) {
            console.error('Failed to acquire wake lock:', err);
        }
    } else {
        console.log('Wake Lock API not supported');
    }
}

// Re-request wake lock on visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null) {
        requestWakeLock();
    }
});

requestWakeLock();

// Audio element for points earned
let audio;
function initializeAudio() {
    audio = new Audio('/coin.mp3');
    document.body.addEventListener('click', () => {
        // Trigger user interaction to enable audio playback
        audio.play().catch(() => {});
    }, { once: true });
}
initializeAudio();

// Request motion sensor permissions on iOS
async function requestMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            if (permissionState !== 'granted') {
                alert('Motion sensor access denied. The app may not function correctly.');
            }
        } catch (error) {
            console.error('Error requesting motion permission:', error);
        }
    }
}

// Prompt for motion permission on page load
requestMotionPermission();

// Notify backend when phone connects and send initial data
socket.addEventListener('open', () => {
    console.log('Phone connected to server');
    isConnected = true;
    socket.send(JSON.stringify({ event: 'phone_connected', id: phoneId, playerName: 'New Player', color: assignedColor }));
});

// Handle incoming messages (e.g., assign a color to the phone)
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'assign_color') {
        assignedColor = data.color;
        document.body.style.backgroundColor = assignedColor;
        if (isConnected) {
            socket.send(JSON.stringify({ event: 'update_color', id: phoneId, color: assignedColor }));
        }
    }

    if (data.event === 'points_earned') {
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.play().catch(() => {
                console.log('Audio play failed. Possibly due to user interaction restrictions.');
            });
        }
    }
});

// Handle input changes for player name
const playerNameInput = document.getElementById('playerName');
playerNameInput.value = 'New Player';
playerNameInput.addEventListener('input', (e) => {
    const playerName = e.target.value;
    socket.send(JSON.stringify({ event: 'update_name', id: phoneId, playerName, color: assignedColor }));
});

// Handle device motion events with throttling
window.addEventListener('devicemotion', (event) => {
    const currentTime = Date.now();
    if (currentTime - lastMotionSentTime >= motionThrottleInterval) {
        lastMotionSentTime = currentTime;

        const { accelerationIncludingGravity, rotationRate } = event;
        if (accelerationIncludingGravity && rotationRate) {
            const data = {
                id: phoneId,
                playerName: playerNameInput.value,
                color: assignedColor,
                acceleration: {
                    x: accelerationIncludingGravity.x,
                    y: accelerationIncludingGravity.y,
                    z: accelerationIncludingGravity.z
                },
                rotation: {
                    alpha: rotationRate.alpha,
                    beta: rotationRate.beta,
                    gamma: rotationRate.gamma
                }
            };
            if (isConnected) {
                socket.send(JSON.stringify(data));
            }
        }
    }
});

// Notify backend when the phone disconnects
socket.addEventListener('close', () => {
    console.log('Phone disconnected from server');
});
