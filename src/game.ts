import { DurableObject } from 'cloudflare:workers';

export class GameDurableObject extends DurableObject {
	phones: Map<string, WebSocket>;
	displays: Set<WebSocket>;
	sql: SqlStorage;
	obstacles: any[];
	solution: string[];
	sentences: string[];
	currentSentenceIndex: number;
	obstacleInterval: NodeJS.Timeout | null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.phones = new Map();
		this.displays = new Set();
		this.sql = ctx.storage.sql;
		this.obstacles = [];
		this.solution = [];
		this.sentences = [
			"This is built with Durable Objects",
			"Each game is an instance",
			"Every instance has its own SQLite storage",
			"We are using WebSockets connections",
			"The display is connected",
			"And the phone is connected",
		];
		this.currentSentenceIndex = 0;
		this.obstacleInterval = null;

		console.log('Creating players...');
		this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			score INTEGER NOT NULL
		);`);
		console.log('Creating colors...');
		this.sql.exec(`CREATE TABLE IF NOT EXISTS colors (
			hex_code TEXT PRIMARY KEY,
			is_available BOOLEAN NOT NULL DEFAULT TRUE
		);`);
		console.log('Inserting colors...');
		const { num_colors } = this.sql.exec(`SELECT count(*) as num_colors from colors`).one();
		if (num_colors === 0) {
			this.sql.exec(`INSERT INTO colors (hex_code) VALUES
				('#FF5733'),
				('#33FF57'),
				('#3357FF'),
				('#FFFF33'),
				('#FF33FF'),
				('#33FFFF'),
				('#FF9966'),
				('#66FF99'),
				('#9966FF'),
				('#FF6699');
			`);
		}
		console.log('Completed');
		this.initializeObstacles();
		this.startObstacleMovement();
	}

	initializeObstacles() {
		const currentSentence = this.sentences[this.currentSentenceIndex].split(" ");
		this.solution = Array(currentSentence.length).fill(null);
		this.obstacles = currentSentence.map((word, index) => ({
			word,
			x: Math.random() * 800, // Assume a canvas width of 800
			y: Math.random() * 600, // Assume a canvas height of 600
			dx: (Math.random() - 0.5) * 4,
			dy: (Math.random() - 0.5) * 4,
			index,
			color: `hsl(${Math.random() * 360}, 70%, 70%)`
		}));
		this.updateObstacles();
	}

	startObstacleMovement() {
		if (this.obstacleInterval) {
			clearInterval(this.obstacleInterval);
		}
		this.obstacleInterval = setInterval(() => {
			this.updateObstacles();
		}, 100); // Update every 100ms
	}

	updateObstacles() {
		this.obstacles.forEach(obstacle => {
			obstacle.x += obstacle.dx;
			obstacle.y += obstacle.dy;

			// Bounce off walls
			if (obstacle.x < 0 || obstacle.x > 800 - 100) obstacle.dx *= -1;
			if (obstacle.y < 0 || obstacle.y > 600 - 30) obstacle.dy *= -1;
		});

		const data = {
			event: 'update_obstacles',
			obstacles: this.obstacles,
			solution: this.solution,
		};
		this.broadcast(data);
	}

	checkCollisions(phoneId: string, x: number, y: number): void {
		this.obstacles = this.obstacles.filter(obstacle => {
			const distX = Math.abs(x - obstacle.x - 50);
			const distY = Math.abs(y - obstacle.y - 15);

			if (distX > 70 || distY > 35) {
				return true; // Keep obstacle if no collision
			}

			if (distX <= 50 || distY <= 15 || (distX - 50) ** 2 + (distY - 15) ** 2 <= 400) {
				this.solution[obstacle.index] = obstacle.word;
				this.updatePlayerScore(phoneId, obstacle.word);
				this.sendPointsEarned(phoneId, obstacle.word.length);
				return false; // Remove obstacle on collision
			}

			return true;
		});

		if (this.obstacles.length === 0) {
			this.currentSentenceIndex = (this.currentSentenceIndex + 1) % this.sentences.length;
			this.initializeObstacles();
		}

		this.updateObstacles();
	}

	sendPointsEarned(phoneId: string, points: number): void {
		const phoneSocket = this.phones.get(phoneId);
		if (phoneSocket) {
			phoneSocket.send(JSON.stringify({
				event: 'points_earned',
				points
			}));
		}
	}

	async addPlayer(data) {
		console.log('Adding player', data);
		const { hex_code } = this.sql.exec('SELECT hex_code FROM colors WHERE is_available=true LIMIT 1;').one();
		console.log({ hex_code });
		const player = this.sql
			.exec('INSERT INTO players (id, name, color, score) VALUES (?, ?, ?, ?) RETURNING *;', data.id, data.playerName, hex_code, 0)
			.one();
		console.log({ player });
		this.sql.exec(`UPDATE colors SET is_available=false WHERE hex_code=?;`, hex_code);
		return player;
	}

	async updatePlayerName(id: string, name: string) {
		this.sql.exec('UPDATE players SET name=? WHERE id=?', name, id);
	}

	async updatePlayerScore(playerId: string, word: string) {
		const points = word.length; // Points based on word length
		this.sql.exec('UPDATE players SET score = score + ? WHERE id = ?', points, playerId);
		this.broadcastUpdate();
	}

	async broadcastUpdate() {
		const cursor = this.sql.exec(`SELECT * FROM players ORDER BY score DESC;`);
		const players = [];
		for (const row of cursor) {
			players.push({
				id: row.id,
				name: row.name,
				color: row.color,
				score: row.score,
			});
		}
		const data = {
			event: 'game_updated',
			players,
			solution: this.solution,
		};
		this.broadcast(data);
	}

	async fetch(request: Request): Promise<Response> {
		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();

		server.addEventListener('message', async (event: MessageEvent) => {
			const data = JSON.parse(event.data as string);

			switch (data.event) {
				case 'phone_connected':
					this.phones.set(data.id, server);
					const player = await this.addPlayer(data);
					server.send(JSON.stringify({ event: 'assign_color', color: player.color }));
					this.broadcastUpdate();
					break;
				case 'update_name':
					this.updatePlayerName(data.id, data.playerName);
					this.broadcastUpdate();
					break;
				case 'display_connected':
					this.displays.add(server);
					this.updateObstacles();
					break;
				case 'player_moved':
					this.checkCollisions(data.id, data.x, data.y);
					break;
				default:
					this.broadcast(data, server);
					break;
			}
		});

		server.addEventListener('close', () => {
			this.phones.forEach((socket, id) => {
				if (socket === server) {
					this.phones.delete(id);
				}
			});
			this.displays.delete(server);
			console.log('Connection closed.');
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	private broadcast(data: any, sender?: WebSocket): void {
		for (const connection of [...this.phones.values(), ...this.displays]) {
			if (connection !== sender) {
				connection.send(JSON.stringify(data));
			}
		}
	}
}
