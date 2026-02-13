# Dovedale Live Map

> [!WARNING]
> For contributors, update your testing workflows to provide the token in the `Authorization` header with "Bearer TOKEN" instead of the body.
> The `token` field in the body will no longer be supported soon.

Hosted at [map.dovedale.wiki](https://map.dovedale.wiki), this project aims to provide a near-realtime view of players in [Dovedale Railway](https://play.dovedale.wiki).

Uses Express to host a web server, with Bun as the preferred package manager.

Feel free to have a look through the code or contribute - just make sure you follow general style and document PRs and code changes properly.

## WebSocket Usage
You are free to use the data provided by the Live Map for your own projects.
You can connect to the WebSocket at `https://map.dovedale.wiki/ws` and you will receive a message every time a Roblox server sends a request to the web server, messages look like this:
```json
{
	"jobId": "0cf6c9f0-36be-4b98-8878-0e4a88913ea1",
	"players": [
		{
			"username": "cl0vermead0w",
			"userId": 92133828,
			"position": { "y": -1193, "x": 11813 }
		},
		{
			"username": "MrTortoise_guy",
			"userId": 361635687,
			// This was changed from an array in 2.0.1h7
			"trainData": {
				"destination": "Gleethrop End",
				"trainClass": "Class 150/2",
				"headcode": "2G81",
				"trainType": "Passenger"
			},
			"position": { "y": -1099, "x": 3173 }
		}
	]
}
```

## Development

```
bun install
bun dev
```

## Production
The [website](https://map.dovedale.wiki) will be automatically updated and restarted when commits are pushed to `main`.
```
bun install
bun install pm2 -g
pm2 save
pm2 startup
pm2 start pm2.config.js
```
