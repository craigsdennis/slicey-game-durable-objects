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
let displaySentence = null; // Sentence to temporarily display
let displayTimeout = null; // Timeout for clearing the sentence display

// Function to draw the solution
function drawSolution() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    const solutionText = solution.map(word => (word ? word : '_')).join(' ');
    ctx.fillText(solutionText, canvas.width / 2, canvas.height - 50);
}

// Function to draw obstacles
function drawObstacles() {
    obstacles.forEach(obstacle => {
        const textWidth = ctx.measureText(obstacle.word).width;
        const padding = 20;
        const rectWidth = textWidth + padding;
        const rectHeight = 30;

        ctx.fillStyle = obstacle.color;
        ctx.fillRect(obstacle.x, obstacle.y, rectWidth, rectHeight);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(obstacle.word, obstacle.x + rectWidth / 2, obstacle.y + rectHeight / 2 + 5);
    });
}

// Function to temporarily display a completed sentence with word wrapping
function drawCompletedSentence() {
    if (displaySentence) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';

        const words = displaySentence.split(' ');
        const lineHeight = 50;
        const maxWidth = canvas.width * 0.8;
        let line = '';
        let y = canvas.height / 2 - lineHeight;

        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const testWidth = ctx.measureText(testLine).width;
            if (testWidth > maxWidth && line) {
                ctx.fillText(line, canvas.width / 2, y);
                line = words[i] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, canvas.width / 2, y);
    }
}

// Function to update the display
function updateDisplay() {
    if (displaySentence) {
        drawCompletedSentence();
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw obstacles
    drawObstacles();

    // Draw emojis with colored circles for each phone controlled by motion data
    Object.values(phonesData).forEach(phone => {
        if (phone.acceleration) {
            const { x, y } = phone.acceleration;
            const mappedX = -x * 50;
            const mappedY = -y * 50;

            const centerX = canvas.width / 2 + mappedX;
            const centerY = canvas.height / 2 + mappedY;

            // Draw circle background
            ctx.beginPath();
            ctx.arc(centerX, centerY, 25, 0, 2 * Math.PI);
            ctx.fillStyle = phone.color || 'blue';
            ctx.fill();

            // Draw emoji
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.fillText('📱', centerX, centerY + 10);

            // Send the player_moved event with x and y coordinates
            socket.send(JSON.stringify({
                event: 'player_moved',
                id: phone.id,
                x: centerX,
                y: centerY
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

    if (data.event === 'sentence_completed') {
        displaySentence = data.sentence;
        clearTimeout(displayTimeout);
        displayTimeout = setTimeout(() => {
            displaySentence = null;
			requestAnimationFrame(updateDisplay);
        }, 3000); // Display the sentence for 3 seconds
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

    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Name</th><th>Score</th>';
    table.appendChild(headerRow);

    players.forEach(player => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = player.name;
        nameCell.style.backgroundColor = player.color;
        nameCell.style.color = 'white'; // Ensure text is visible

        const scoreCell = document.createElement('td');
        scoreCell.textContent = player.score;

        row.appendChild(nameCell);
        row.appendChild(scoreCell);
        table.appendChild(row);
    });

    playersDiv.appendChild(table);
}
