// screen_controller.js

// Set the game code based on the current URL
const urlParts = window.location.pathname.split('/');
const gameCode = urlParts[urlParts.length - 1];
document.getElementById('gameCode').textContent = gameCode;

// Generate WebSocket URL
const isLocalhost = window.location.hostname === 'localhost';
const protocol = isLocalhost ? 'ws' : 'wss';
const socketUrl = `${protocol}://${window.location.host}/game/${gameCode}/ws`;
const socket = new WebSocket(socketUrl);

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// State for objects being controlled
let phonesData = {}; // Store data for multiple phones
let players = []; // Player data
let obstacles = []; // Obstacles to bounce
let solution = []; // Initialize solution with placeholders

// Function to draw the solution
function drawSolution() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(solution.map(word => (word ? word : '_')).join(' '), 10, 30);
}

// Function to draw obstacles
function drawObstacles() {
    obstacles.forEach(obstacle => {
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(obstacle.x, obstacle.y, 100, 30);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(obstacle.word, obstacle.x + 10, obstacle.y + 20);
    });
}

// Function to update the display
function updateDisplay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw obstacles
    drawObstacles();

    // Draw circles for each phone controlled by motion data
    Object.values(phonesData).forEach(phone => {
        if (phone.acceleration) {
            const { x, y } = phone.acceleration;
            const mappedX = -x * 50;
            const mappedY = -y * 50;
            ctx.beginPath();
            ctx.arc(canvas.width / 2 + mappedX, canvas.height / 2 + mappedY, 20, 0, 2 * Math.PI);
            ctx.fillStyle = phone.color || 'blue';
            ctx.fill();

            // Send the player_moved event with x and y coordinates
            socket.send(JSON.stringify({
                event: 'player_moved',
                id: phone.id,
                x: canvas.width / 2 + mappedX,
                y: canvas.height / 2 + mappedY
            }));
        }
    });

    // Draw solution
    drawSolution();

    requestAnimationFrame(updateDisplay);
}

// Start animation loop
updateDisplay();

// Handle incoming WebSocket messages
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.event === 'update_obstacles') {
        obstacles = data.obstacles;
        solution = data.solution;
    }

    if (data.event === 'game_updated') {
        players = data.players;
        solution = data.solution;
        updatePlayers();
    }

    if (data.id) { // Assume each phone sends a unique ID
        phonesData[data.id] = data;
    }
});

// Notify backend when display connects
socket.addEventListener('open', () => {
    console.log('Display connected to server');
    socket.send(JSON.stringify({ event: 'display_connected' }));
});

socket.addEventListener('close', () => {
    console.log('Display disconnected from server');
});

// Function to update player list
function updatePlayers() {
    const playersDiv = document.getElementById('players');
    playersDiv.innerHTML = '';
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player';
        playerDiv.innerHTML = `<span>${player.name}</span><span>${player.score}</span>`;
        playersDiv.appendChild(playerDiv);
    });
}
