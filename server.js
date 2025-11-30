require('dotenv').config();

const express = require('express');
const app = express();
require('express-ws')(app);
const PORT = process.env.PORT || 3000;
const ROBLOX_SECRET = process.env.ROBLOX_OTHER_KEY || 'TEST';

app.use(express.static('public'));
app.use(express.json());

let webhooks = [];

app.get('/status', (req, res) => {
	res.status(200).send('200 OK');
});

app.ws('/ws', (ws, req) => {
	//console.log('WebSocket client connected');
	webhooks.push(ws);

	ws.on('close', () => {
		//console.log('WebSocket client disconnected');
		// Remove from webhooks array on disconnect
		const index = webhooks.indexOf(ws);
		if (index > -1) {
			webhooks.splice(index, 1);
		}
	});
});

app.post('/positions', (req, res) => {
	const data = req.body;

	//console.log('Received data from Roblox:', data);

	if (!data.token || data.token !== ROBLOX_SECRET) {
		return res.status(401).send('Unauthorized: Invalid key');
	}

	delete data.token;

	webhooks = webhooks.filter((ws) => {
		if (ws.readyState === ws.OPEN) {
			try {
				ws.send(JSON.stringify(data));
				return true;
			} catch (err) { }
		}
		return false;
	});

	res.status(200).send();
});

app.listen(PORT, () => { });
