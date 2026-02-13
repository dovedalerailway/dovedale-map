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
if (!ROBLOX_TOKEN && process.env.NODE_ENV === "production") throw new Error(`Token environment variable is missing`);

const GET_PLAYERS_API_KEY = process.env.GET_PLAYERS_API_KEY;
if (!GET_PLAYERS_API_KEY && process.env.NODE_ENV === "production")
	throw new Error(`GET players API key environment variable is missing`);

app.use("*", serveStatic({ root: "./public" }));

let webSockets: WSContext<any>[] = [];

app.get("/api/status", (context) => {
	return context.text("200 OK");
});

if (process.env.NODE_ENV == "development"){
	// Forward from production server
	app.get(
	"/api/ws",
	upgradeWebSocket((context) => {
		return {
		onOpen: (_event, client) => {
			console.log("Client connected");
			webSockets.push(client);
			const upstream = new WebSocket("wss://map.dovedale.wiki/ws");

			upstream.onopen = () => {
			console.log("Connected to production server");
			};

			upstream.onmessage = (event) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(event.data);
			}
			};

			client.onmessage = (event) => {
			if (upstream.readyState === WebSocket.OPEN) {
				upstream.send(event.data);
			}
			};

			client.onclose = () => {
			upstream.close();
			const idx = webSockets.indexOf(client);
			if (idx > -1) webSockets.splice(idx, 1);
			};
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
	const result = requestSchema.safeParse(await context.req.json());

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
	}));

	if (serverTimeouts.has(data.jobId)) {
		console.log("Clearing current timeout");
		serverTimeouts.delete(data.jobId);
	}

	serverTimeouts.set(
		data.jobId,
		setTimeout(() => {
			console.log("Clearing, timeout have passed");
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

	webSockets.forEach((webSocket) => {
		webSocket.send(JSON.stringify(data));
	});

	return context.json({ success: true });
}

app.post("/api/positions", positionsApi);
app.post("/positions", positionsApi);

export default {
	fetch: app.fetch,
	port: PORT,
	websocket,
};
