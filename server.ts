import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { upgradeWebSocket, websocket } from "hono/bun";
import { WSContext } from "hono/ws";
import z from "zod";

const trainSchema = z.array(z.string()).length(4);
const playerSchema = z.strictObject({
	username: z.string(),
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
const ROBLOX_TOKEN = process.env.ROBLOX_OTHER_KEY;

if (!ROBLOX_TOKEN) throw new Error(`Token environment variable is missing`);

app.use("*", serveStatic({ root: "./public" }));

let webSockets: WSContext<any>[] = [];

app.get("/status", (context) => {
	return context.text("200 OK");
});

app.get(
	"/ws",
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

app.post("/positions", async (context) => {
	const result = requestSchema.safeParse(await context.req.json());

	if (!result.success) {
		return context.json({ success: false, errors: result.error.issues }, 400);
	}

	const { token: bodyToken, ...dataToSend } = result.data;
	// once all Dovedale servers migrate to version using headers, body token support will be removed
	const authorizationHeader = context.req.header("Authorization");
	if (
		authorizationHeader !== `Bearer ${ROBLOX_TOKEN}` &&
		bodyToken !== ROBLOX_TOKEN
	) {
		return context.text("Invalid token", 401);
	}

	webSockets.forEach((webSocket) => {
		webSocket.send(JSON.stringify(dataToSend));
	});

	return context.json({ success: true });
});

export default {
	fetch: app.fetch,
	port: PORT,
	websocket,
};
