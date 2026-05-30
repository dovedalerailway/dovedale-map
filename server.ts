import { Context, Hono } from "hono";
import { serveStatic, upgradeWebSocket, websocket } from "hono/bun";
import { WSContext } from "hono/ws";
import z from "zod/v4";

const playersCache: Map<string, number[]> = new Map();
const serverTimeouts: Map<string, NodeJS.Timeout> = new Map();

const trainSchema = z.xor([
	z.array(z.string()).length(4),
	z.strictObject({
		destination: z.string(),
		trainClass: z.string(),
		headcode: z.string(),
		trainType: z.string(),
		trainSpeed: z.number().optional(),
		carriageAmount: z.number().optional(),
	}),
]);

const playerSchema = z.strictObject({
	username: z.string(),
	userId: z.number().optional(),
	trainData: trainSchema.optional(),
	position: z.strictObject({
		x: z.int(),
		y: z.int(),
	}),
	box: z.strictObject({
		name: z.string(),
		fullName: z.string(),
		isHost: z.boolean().optional(),
	}).optional(),
});
const requestSchema = z.strictObject({
	jobId: z.string(),
	players: z.array(playerSchema),
	// deprecated
	token: z.string().optional(),
});

const app = new Hono();
const PORT = process.env.PORT || 3000;
const STALE_SERVER_TIMEOUT = 30_000;

const ROBLOX_TOKEN = process.env.ROBLOX_OTHER_KEY;
if (!ROBLOX_TOKEN) throw new Error(`Token environment variable is missing`);

const GET_PLAYERS_API_KEY = process.env.GET_PLAYERS_API_KEY;
if (!GET_PLAYERS_API_KEY)
	throw new Error(`GET players API key environment variable is missing`);

const staticMiddleware = serveStatic({ root: "./public" });
const cachedStaticMiddleware = serveStatic({
	root: "./public",
	onFound: (_path, c) => {
		c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
	},
});

app.use("*", (c, next) => {
	if (c.req.path.startsWith("/api/")) return next();
	const path = c.req.path;
	if (
		path.endsWith(".png") ||
		path.endsWith(".webp") ||
		path.endsWith(".svg") ||
		path.endsWith(".ico")
	) {
		return cachedStaticMiddleware(c, next);
	}
	return staticMiddleware(c, next);
});

let webSockets: WSContext<any>[] = [];
setInterval(() => {
	webSockets = webSockets.filter((ws) => ws.readyState === 1);
}, 60_000);

app.get("/api/status", (context) => {
	return context.text("200 OK");
});

app.get(
	"/api/ws",
	upgradeWebSocket((context) => {
		return {
			onOpen: (_event, webSocket) => {
				webSockets.push(webSocket);
			},
			onClose: (_event, webSocket) => {
				const index = webSockets.indexOf(webSocket);
				if (index > -1) {
					webSockets.splice(index, 1);
				}
			},
		};
	}),
);

app.get("/api/servers/:jobId/players", async (context) => {
	const authorizationHeader = context.req.header("Authorization");
	if (authorizationHeader !== `Bearer ${ROBLOX_TOKEN}`) {
		return context.text("Invalid token", 401);
	}
	const jobId = context.req.param("jobId");
	return context.json(playersCache.get(jobId));
});

async function positionsApi(context: Context) {
	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return new Response(null, { status: 499 });
	}
	const result = requestSchema.safeParse(body);

	if (!result.success) {
		return context.json(
			{ success: false, errors: z.treeifyError(result.error) },
			400,
		);
	}
	const { token: bodyToken, ...data } = result.data;
	// once all Dovedale servers migrate to version using headers, body token support will be removed
	const authorizationHeader = context.req.header("Authorization");
	if (
		authorizationHeader !== `Bearer ${ROBLOX_TOKEN}` &&
		bodyToken !== ROBLOX_TOKEN
	) {
		return context.text("Invalid token", 401);
	}

	data.players = data.players.map((player) => ({
		username: player.username,
		userId: player.userId,
		position: player.position,
		// will be completely replaced after servers have been migrated to h7
		trainData: Array.isArray(player.trainData)
			? {
					destination: player.trainData[0],
					trainClass: player.trainData[1],
					headcode: player.trainData[2],
					trainType: player.trainData[3],
				}
			: player.trainData,
		box: player.box,
	}));

	if (serverTimeouts.has(data.jobId)) {
		//console.log("Clearing current timeout");
		clearTimeout(serverTimeouts.get(data.jobId)); // ensure we actually cancel the timeout before deleting it, otherwise it will still fire even if deleted from the map
		serverTimeouts.delete(data.jobId);
	}

	serverTimeouts.set(
		data.jobId,
		setTimeout(() => {
			//console.log("Clearing, timeout have passed");
			playersCache.delete(data.jobId);
			serverTimeouts.delete(data.jobId);
		}, STALE_SERVER_TIMEOUT),
	);

	if (data.players[0]?.userId) {
		playersCache.set(
			data.jobId,
			data.players
				.filter((player) => player.userId !== undefined)
				.map((player) => player.userId as number),
		);
	}

	const message = JSON.stringify(data);
	webSockets = webSockets.filter((webSocket) => {
		if (webSocket.readyState !== 1) {
			return false;
		}
		webSocket.send(message);
		return true;
	});

	return context.json({ success: true });
}

app.post("/api/positions", positionsApi);
app.post("/positions", positionsApi);

export default {
	fetch: app.fetch,
	port: PORT,
	websocket,
	idleTimeout: 60,
};
