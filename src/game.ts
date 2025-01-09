import { DurableObject } from 'cloudflare:workers';

export class GameDurableObject extends DurableObject {
	phones: Map<string, WebSocket>;
	displays: Set<WebSocket>;
	sql: SqlStorage;
	obstacles: any[];
	solution: string[];
	obstacleInterval: NodeJS.Timeout | null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.phones = new Map();
		this.displays = new Set();
		this.sql = ctx.storage.sql;
		this.obstacles = [];
		this.solution = [];
		this.obstacleInterval = null;

		this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			received_name_change_bonus BOOLEAN NOT NULL DEFAULT FALSE,
			score INTEGER NOT NULL
		);`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS colors (
			hex_code TEXT PRIMARY KEY,
			is_available BOOLEAN NOT NULL DEFAULT TRUE
		);`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS sentences (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sentence TEXT NOT NULL,
			is_completed BOOLEAN NOT NULL DEFAULT FALSE
		);`);
		// Durable Objects run the constructor when the wake up
		// So if the data is already populated we don't need to do more
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
		const { num_sentences } = this.sql.exec(`SELECT count(*) as num_sentences from sentences`).one();
		if (num_sentences === 0) {
			this.sql.exec(`INSERT INTO sentences (sentence) VALUES
				('This is built with 🧡 using Durable Objects'),
				('Points are based on the length of these words 💯'),
				('Each Game is its own separate instance'),
				('Every instance has its own local SQLite instance for storage'),
				('🏃‍♂️ It is super fast, like instantaneous 🏃‍♀️‍➡️'),
				('You can have tons of these instances of your Durable Object running all at once'),
				('🧡 And they are all running on Cloudflare''s global network, or like we like to call it, Region: Earth 🌍'),
				('Durable Objects are an excellent solution for realtime apps, like this one 🎮'),
				('Your phone 📱 and the display 🖥️  are connected to this Durable Object instance via WebSockets'),
				('If you change your name on your 📱 phone from the default...'),
				('...you will get an extra one thousand points'),
				('Did you see how fast that leaderboard updated with your new name?'),
				('All of this code 👨‍💻 🧑‍💻 is available on this page, and your phone 📱'),
				('⚡ THE NETWORK IS THE COMPUTER ® ⚡');
			`);
		}
		console.log('Completed');
		this.initializeObstacles();
		this.startObstacleMovement();
	}

	async getCurrentSentence(): Promise<string> {
		const { sentence } = this.sql.exec(`SELECT sentence FROM sentences WHERE is_completed=false ORDER BY id LIMIT 1;`).one();
		return sentence as string;
	}

	async completeCurrentSentence() {
		const { id, sentence } = this.sql.exec(`SELECT id, sentence FROM sentences WHERE is_completed=false ORDER BY id LIMIT 1;`).one();
		this.sql.exec(`UPDATE sentences SET is_completed=true WHERE id=? ORDER BY id LIMIT 1`, id);
		this.broadcast({ event: 'sentence_completed', sentence });
	}

	async initializeObstacles() {
		const currentSentence = await this.getCurrentSentence();
		const words = currentSentence.split(' ');
		this.solution = Array(words.length).fill(null);
		this.obstacles = words.map((word, index) => ({
			word,
			x: Math.random() * 800, // Assume a canvas width of 800
			y: Math.random() * 600, // Assume a canvas height of 600
			dx: (Math.random() - 0.5) * 4,
			dy: (Math.random() - 0.5) * 4,
			index,
			color: `hsl(${Math.random() * 360}, 70%, 70%)`,
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
		this.obstacles.forEach((obstacle) => {
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

	async checkCollisions(phoneId: string, x: number, y: number): void {
		this.obstacles = this.obstacles.filter((obstacle) => {
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
			await this.completeCurrentSentence();
			await this.initializeObstacles();
		}

		this.updateObstacles();
	}

	sendPointsEarned(phoneId: string, points: number): void {
		const phoneSocket = this.phones.get(phoneId);
		if (phoneSocket) {
			phoneSocket.send(
				JSON.stringify({
					event: 'points_earned',
					points,
				})
			);
		}
	}

	async addPlayer(data: { id: string; playerName: string }) {
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
		const { received_name_change_bonus, score } = this.sql.exec('UPDATE players SET name=? WHERE id=? RETURNING *', name, id).one();
		if (!received_name_change_bonus) {
			this.sql.exec('UPDATE players SET score=?, received_name_change_bonus=true WHERE id=?', (score as number) + 1000, id);
		}
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
