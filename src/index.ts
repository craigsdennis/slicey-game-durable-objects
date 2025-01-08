import { Context, Hono } from 'hono';
import { GameDurableObject } from './game';

export { GameDurableObject };

const app = new Hono<{ Bindings: Env }>();

// Helper function to generate a 4-character Game ID
function generateGameId(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return id;
}

// Endpoint to create a new game and redirect to it
app.get('/create', (c) => {
    const gameId = generateGameId();
    return c.redirect(`/game/${gameId}`);
});

app.get('/game/:id/ws', async (c) => {
    const gameId = c.req.param('id');

    // Ensure this is a WebSocket upgrade request
    if (c.req.header('Upgrade') !== 'websocket') {
        return c.text('Expected WebSocket request', 400);
    }

    // Get Durable Object stub
    const id = c.env.GAME.idFromName(gameId);
    const stub = c.env.GAME.get(id);

    // Forward the request to the Durable Object
    return await stub.fetch(c.req.raw);
});

async function getHtmlTemplate(c: Context, name: string) {
	const asset = await c.env.ASSETS.unstable_getByPathname(name);
	if (!asset) {
		throw new Error(`Missing template: ${name}`);
	}

	return new Response(asset.readableStream, { headers: { 'Content-Type': asset.contentType } });
}


// Placeholder for game room logic
app.get('/game/:id', (c) => {
    const gameId = c.req.param('id');
	const faked = c.req.query("faked");
	const userAgent = c.req.header('User-Agent') || '';

    // Basic check for mobile devices
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);

	// Return the template
	if (isMobile || faked) {
		return getHtmlTemplate(c, "/templates/phone.html");
	} else {
		return getHtmlTemplate(c, "/templates/screen.html");
	}
});

export default app;
