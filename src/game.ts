import { DurableObject } from 'cloudflare:workers';
import { randomHexColorWithWhiteText } from './utils';

export class GameDurableObject extends DurableObject {
	phones: Map<string, WebSocket>;
	displays: Set<WebSocket>;
	sql: SqlStorage;
	obstacles: any[];
	solution: string[];
	displaySentence: string | null;
	obstacleInterval: ReturnType<typeof setInterval> | null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.phones = new Map();
		this.displays = new Set();
		this.sql = ctx.storage.sql;
		this.obstacles = [];
		this.solution = [];
		this.displaySentence = null;
		this.obstacleInterval = null;

		this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			received_name_change_bonus BOOLEAN NOT NULL DEFAULT FALSE,
			score INTEGER NOT NULL
		);`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS sentences (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sentence TEXT NOT NULL,
			is_completed BOOLEAN NOT NULL DEFAULT FALSE
		);`);
		// Durable Objects run the constructor when the wake up
		// So if the data is already populated we don't need to do more
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
				('🤔 If you change your name on your 📱 phone from the default...'),
				('...you will get an extra one thousand points'),
				('👀 Did you see how fast that leaderboard updated with your new name?'),
				('All of this code 👨‍💻 🧑‍💻 is available on this page, and your phone 📱'),
				('⚡ THE NETWORK IS THE COMPUTER ® ⚡');
			`);
		}
		console.log('Completed');
		this.initializeObstacles();
	}

	async getCurrentSentence(): Promise<string | null> {
		const { sentence } = this.sql.exec(`SELECT sentence FROM sentences WHERE is_completed=false ORDER BY id LIMIT 1;`).one() || {};
		return sentence as string;
	}

	async completeCurrentSentence() {
		const { id, sentence } = this.sql.exec(`SELECT id, sentence FROM sentences WHERE is_completed=false ORDER BY id LIMIT 1;`).one() || {};
		if (id) {
			this.sql.exec(`UPDATE sentences SET is_completed=true WHERE id=? ORDER BY id LIMIT 1`, id);
			this.broadcast({ event: 'sentence_completed', sentence });
		}
	}

	async addSentence(sentence: string) {
		this.sql.exec(`INSERT INTO sentences (sentence) VALUES (?)`, sentence);
		this.broadcast({ event: 'sentence_added', sentence });
		if (!this.obstacleInterval) {
			this.initializeObstacles();
		}
	}

	async initializeObstacles() {
		const currentSentence = await this.getCurrentSentence();
		if (!currentSentence) {
			this.stopObstacleMovement();
			return;
		}
		const words = currentSentence.split(' ');
		this.solution = Array(words.length).fill(null);
		this.obstacles = words.map((word, index) => ({
			word,
			x: Math.random() * (800 - 100), // Adjusted to ensure obstacles spawn within bounds
			y: Math.random() * (600 - 30), // Adjusted to ensure obstacles spawn within bounds
			dx: (Math.random() - 0.5) * 4,
			dy: (Math.random() - 0.5) * 4,
			index,
			color: `hsl(${Math.random() * 360}, 70%, 70%)`,
		}));
		this.startObstacleMovement();
	}

	startObstacleMovement() {
		if (this.obstacleInterval) {
			clearInterval(this.obstacleInterval);
		}
		this.obstacleInterval = setInterval(() => {
			this.updateObstacles();
		}, 100); // Update every 100ms
	}

	stopObstacleMovement() {
		if (this.obstacleInterval) {
			clearInterval(this.obstacleInterval);
			this.obstacleInterval = null;
		}
	}

	updateObstacles() {
		this.obstacles.forEach((obstacle) => {
			obstacle.x += obstacle.dx;
			obstacle.y += obstacle.dy;

			// Bounce off walls
			if (obstacle.x < 0 || obstacle.x > 800 - 100) obstacle.dx *= -1;
			if (obstacle.y < 0 || obstacle.y > 600 - 30) obstacle.dy *= -1;
		});
		this.broadcastUpdate();
	}

	async handleCollisions(phoneId: string, x: number, y: number) {
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
		const hex_code = randomHexColorWithWhiteText();
		const player = this.sql
			.exec('INSERT INTO players (id, name, color, score) VALUES (?, ?, ?, ?) RETURNING *;', data.id, data.playerName, hex_code, 0)
			.one();
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

	async getLeaderBoard() {
		const cursor = this.sql.exec(`SELECT name, score FROM players ORDER BY score DESC;`);
		const results = [];
		for (const row of cursor) {
			results.push({ name: row.name as string, score: row.score as number });
		}
		return results;
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
			obstacles: this.obstacles
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
					break;
				case 'player_moved':
					this.handleCollisions(data.id, data.x, data.y);
					break;
				case 'sentence_added':
					this.initializeObstacles();
					break;
				default:
					console.log('Unhandled event', data);
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
			if (this.displays.size === 0 && this.phones.size === 0) {
				this.stopObstacleMovement();
				console.log('Game over');
			}
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
