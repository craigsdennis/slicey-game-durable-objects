// screen_controller.js

import PhoneMovementDisplay from '/tween_phone_movement.js';

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
const backgroundCanvas = document.getElementById('backgroundCanvas');
const phoneCanvas = document.getElementById('phoneCanvas');
const sentenceCanvas = document.getElementById('sentenceCanvas');

const backgroundCtx = backgroundCanvas.getContext('2d');
const phoneCtx = phoneCanvas.getContext('2d');
const sentenceCtx = sentenceCanvas.getContext('2d');


// State for objects being controlled
let phonesData = {}; // Store data for multiple phones
let phoneDisplays = {}; // Store PhoneMovementDisplay instances for phones
let players = []; // Player data
let obstacles = []; // Bouncing words
let solution = []; // Initialize solution with placeholders
let displaySentence = null; // Sentence to temporarily display
let displayTimeout = null; // Timeout for clearing the sentence display

// Function to draw the solution

function resetCanvases() {
    console.log("Resetting canvases");

    // Clear all layers explicitly
    sentenceCtx.globalCompositeOperation = 'source-over';
    phoneCtx.globalCompositeOperation = 'source-over';
    backgroundCtx.globalCompositeOperation = 'source-over';

    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    phoneCtx.clearRect(0, 0, phoneCanvas.width, phoneCanvas.height);
    sentenceCtx.clearRect(0, 0, sentenceCanvas.width, sentenceCanvas.height);

    // Force transparency fill for debugging
    backgroundCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    backgroundCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

    phoneCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    phoneCtx.fillRect(0, 0, phoneCanvas.width, phoneCanvas.height);

    sentenceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    sentenceCtx.fillRect(0, 0, sentenceCanvas.width, sentenceCanvas.height);

    console.log("All canvases cleared and transparency applied.");
}

function drawSolution() {
    backgroundCtx.fillStyle = 'white';
    backgroundCtx.font = '20px Inter, "SF Pro", Arial, sans-serif';
    backgroundCtx.textAlign = 'center';
    const solutionText = solution.map(word => (word ? word : '_')).join(' ');
    backgroundCtx.fillText(solutionText, backgroundCanvas.width / 2, backgroundCanvas.height - 50);
}

// Function to draw obstacles
function drawObstacles() {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    obstacles.forEach(obstacle => {
        const textWidth = backgroundCtx.measureText(obstacle.word).width;
        const padding = 20;
        const rectWidth = textWidth + padding;
        const rectHeight = 30;

        backgroundCtx.fillStyle = obstacle.color;
        backgroundCtx.fillRect(obstacle.x, obstacle.y, rectWidth, rectHeight);
        backgroundCtx.fillStyle = 'white';
        backgroundCtx.font = '14px Inter, "SF Pro", Arial, sans-serif';
        backgroundCtx.textAlign = 'center';
        backgroundCtx.fillText(obstacle.word, obstacle.x + rectWidth / 2, obstacle.y + rectHeight / 2 + 5);
    });
}


// Function to temporarily display a completed sentence with word wrapping
function drawCompletedSentence() {
    resetCanvases();
	sentenceCtx.fillStyle = 'white';
	sentenceCtx.font = '40px Inter, "SF Pro", Arial, sans-serif';
	sentenceCtx.textAlign = 'center';

	const words = displaySentence.split(' ');
	const lineHeight = 50;
	const maxWidth = sentenceCanvas.width * 0.8;
	let line = '';
	let y = sentenceCanvas.height / 2 - lineHeight;

	for (let i = 0; i < words.length; i++) {
		const testLine = line + words[i] + ' ';
		const testWidth = sentenceCtx.measureText(testLine).width;
		if (testWidth > maxWidth && line) {
			sentenceCtx.fillText(line, sentenceCanvas.width / 2, y);
			line = words[i] + ' ';
			y += lineHeight;
		} else {
			line = testLine;
		}
	}
	sentenceCtx.fillText(line, sentenceCanvas.width / 2, y);
}


function drawPlayers() {
    phoneCtx.clearRect(0, 0, phoneCanvas.width, phoneCanvas.height);

    Object.values(phonesData).forEach(phone => {
        if (!phoneDisplays[phone.id]) {
            phoneDisplays[phone.id] = new PhoneMovementDisplay('phoneCanvas', '📱', phone.color || 'blue');
        }

        const display = phoneDisplays[phone.id];

        // Update target position
        if (phone.acceleration) {
            const { x, y } = phone.acceleration;
            const mappedX = phoneCanvas.width / 2 - x * 50;
            const mappedY = phoneCanvas.height / 2 - y * 50;

            display.updateTargetPosition(mappedX, mappedY);
            display.draw(); // Explicitly draw each phone here

            // Send the player_moved event with x and y coordinates
            socket.send(JSON.stringify({
                event: 'player_moved',
                id: phone.id,
                x: mappedX,
                y: mappedY
            }));
        }
    });
}

function refreshDisplay() {
	if (displaySentence && !displayTimeout) {
		drawCompletedSentence();
		displayTimeout = setTimeout(() => {
			clearTimeout(displayTimeout);
			displayTimeout = null;
			displaySentence = null;
			resetCanvases();
			refreshDisplay();
		}, 3000);
		return;
	}
	drawPlayers();
	drawObstacles();
	drawSolution();
	requestAnimationFrame(refreshDisplay);
}

// Start animation loop
refreshDisplay();

// Handle incoming WebSocket messages
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.event === 'game_updated') {
        players = data.players;
		obstacles = data.obstacles;
        solution = data.solution;
		// Update scoreboard
		updateLeaderBoard();
    }

    if (data.event === 'sentence_completed') {
        displaySentence = data.sentence;
    }

    if (data.id) { // Assume each phone sends a unique ID
        phonesData[data.id] = data;
    }
});

// Notify backend when display connects
socket.addEventListener('open', () => {
    console.log('WebSocket connection established with the server.');
    socket.send(JSON.stringify({ event: 'display_connected' }));
});

socket.addEventListener('close', () => {
    console.log('Display disconnected from server');
});

// Function to update player list
function updateLeaderBoard() {
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
