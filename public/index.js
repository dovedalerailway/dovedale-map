const WORLD_BOUNDS = {
	TOP_LEFT: { x: -23818, y: -10426 },
	BOTTOM_RIGHT: { x: 20504, y: 11377 },
};

const WORLD_WIDTH = WORLD_BOUNDS.BOTTOM_RIGHT.x - WORLD_BOUNDS.TOP_LEFT.x;
const WORLD_HEIGHT = WORLD_BOUNDS.BOTTOM_RIGHT.y - WORLD_BOUNDS.TOP_LEFT.y;
const WORLD_CENTER = {
	x: (WORLD_BOUNDS.TOP_LEFT.x + WORLD_BOUNDS.BOTTOM_RIGHT.x) / 2,
	y: (WORLD_BOUNDS.TOP_LEFT.y + WORLD_BOUNDS.BOTTOM_RIGHT.y) / 2,
};

const STALE_SERVER_TIMEOUT = 30_000;

const MAP_CONFIG = {
	rows: 1,
	columns: 16,
	totalWidth: 28680,
	totalHeight: 13724,
};

const AREA_MARKERS = {
	"Gleethrop End": {
		x: 1274,
		y: 3563,
	},
	Groenewoud: {
		x: -14658,
		y: -3762,
	},
	"Dovedale East": {
		x: 1231,
		y: 534,
	},
	"Fanory Mill": {
		x: -16821,
		y: -3954,
	},
	Mazewood: {
		x: -4650,
		y: 5798,
	},
	Conby: {
		x: -11688,
		y: -3270,
	},
	"Codsall Castle": {
		x: 9991,
		y: 5236,
	},
	Masonfield: {
		x: 10667,
		y: -881,
	},
	"Benyhone Loop": {
		x: -19532,
		y: -5201,
	},
	Perthtyne: {
		x: -490,
		y: 5268,
	},
	Ashburn: {
		x: -22012,
		y: -6729,
	},
	"Cosdale Harbour": {
		x: 4325,
		y: -2518,
	},
	"Glassbury Junction": {
		x: 11592,
		y: 8663,
	},
	"Dovedale Central": {
		x: 3157,
		y: 805,
	},
	"Wington Mount": {
		x: 2922,
		y: -2830,
	},
	"Marigot Crossing": {
		x: 7692,
		y: 2205,
	},
	Satus: {
		x: -7485,
		y: -3055,
	},
};

const COLORS = [
	"#FD2943",
	"#01A2FF",
	"#02B857",
	"#A75EB8",
	"#F58225",
	"#F5CD30",
	"#E8BAC8",
	"#D7C59A",
];

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");
const elements = {
	players: document.getElementById("players"),
	tooltip: document.getElementById("tooltip"),
	serverSelect: document.getElementById("servers"),
	connectionPopup: document.getElementById("connectionPopup"),
	reconnectBtn: document.getElementById("reconnectBtn"),
	joinBtn: document.getElementById("joinBtn"),
};

// Application State
class AppState {
	constructor() {
		this.serverData = {};
		this.currentServer = "all";
		this.hoveredPlayer = null;
		this.isDragging = false;
		this.dragStart = null;
		this.currentScale = 1;
		this.lastTouchDistance = 0;
		this.ws = null;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 3;
		this.reconnectTimeout = null;
		this.mapImages = [];
		this.loadedImages = 0;
		this.totalImages = MAP_CONFIG.rows * MAP_CONFIG.columns;
		this.staleCheckInterval = null;
	}

	getAllPlayers() {
		if (this.currentServer === "all") {
			return Object.values(this.serverData)
				.map((serverInfo) => serverInfo.players || [])
				.flat();
		}
		return this.serverData[this.currentServer]?.players || [];
	}
}

const state = new AppState();

// Utility Functions
const getCanvasCoordinates = (event) => {
	const rect = canvas.getBoundingClientRect();
	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	};
};

const getDistanceBetweenTouches = (touches) => {
	const distanceX = touches[0].clientX - touches[1].clientX;
	const distanceY = touches[0].clientY - touches[1].clientY;
	return Math.hypot(distanceX, distanceY);
};

const getPlayerColor = (name) => {
	if (!name) return "#00FFFF";

	let value = 0;
	for (let index = 0; index < name.length; index++) {
		const charValue = name.charCodeAt(index);
		let reverseIndex = name.length - index;
		if (name.length % 2 === 1) reverseIndex--;
		value += reverseIndex % 4 >= 2 ? -charValue : charValue;
	}

	const colorIndex = ((value % COLORS.length) + COLORS.length) % COLORS.length;
	return COLORS[colorIndex];
};

const worldToCanvas = (worldX, worldY) => {
	const relativeX = (worldX - WORLD_BOUNDS.TOP_LEFT.x) / WORLD_WIDTH;
	const relativeY = (worldY - WORLD_BOUNDS.TOP_LEFT.y) / WORLD_HEIGHT;

	const mapAspectRatio = MAP_CONFIG.totalWidth / MAP_CONFIG.totalHeight;
	const canvasAspectRatio = canvas.width / canvas.height;

	const scaleFactor =
		mapAspectRatio > canvasAspectRatio
			? canvas.width / MAP_CONFIG.totalWidth
			: canvas.height / MAP_CONFIG.totalHeight;

	const scaledMapWidth = MAP_CONFIG.totalWidth * scaleFactor;
	const scaledMapHeight = MAP_CONFIG.totalHeight * scaleFactor;
	const offsetX = (canvas.width - scaledMapWidth) / 2;
	const offsetY = (canvas.height - scaledMapHeight) / 2;

	return {
		x: offsetX + relativeX * scaledMapWidth,
		y: offsetY + relativeY * scaledMapHeight,
	};
};

function drawRoundedRectangle(context, x, y, width, height, radius) {
	if (width < 2 * radius) radius = width / 2;
	if (height < 2 * radius) radius = height / 2;
	context.beginPath();
	context.moveTo(x + radius, y);
	context.arcTo(x + width, y, x + width, y + height, radius);
	context.arcTo(x + width, y + height, x, y + height, radius);
	context.arcTo(x, y + height, x, y, radius);
	context.arcTo(x, y, x + width, y, radius);
	context.closePath();
}

const trackTransforms = () => {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	let transform = svg.createSVGMatrix();

	context.getTransform = () => transform;

	const savedTransforms = [];
	const original = {
		save: context.save,
		restore: context.restore,
		scale: context.scale,
		translate: context.translate,
	};

	context.save = function () {
		savedTransforms.push(transform.translate(0, 0));
		return original.save.call(context);
	};

	context.restore = function () {
		transform = savedTransforms.pop();
		return original.restore.call(context);
	};

	context.scale = function (scaleX, scaleY) {
		transform = transform.scaleNonUniform(scaleX, scaleY);
		state.currentScale *= scaleX;
		return original.scale.call(context, scaleX, scaleY);
	};

	context.translate = function (distanceX, distanceY) {
		transform = transform.translate(distanceX, distanceY);
		return original.translate.call(context, distanceX, distanceY);
	};

	const point = svg.createSVGPoint();
	context.transformedPoint = function (x, y) {
		point.x = x;
		point.y = y;
		return point.matrixTransform(transform.inverse());
	};
};

const zoomAt = (screenX, screenY, scaleFactor) => {
	const point = context.transformedPoint(screenX, screenY);
	context.translate(point.x, point.y);
	context.scale(scaleFactor, scaleFactor);
	context.translate(-point.x, -point.y);

	state.currentScale *= scaleFactor;
	drawScene();
};

const getPlayerAtPosition = (canvasX, canvasY) => {
	const playersToCheck = state.getAllPlayers();

	for (const player of playersToCheck) {
		const worldX = player.position?.x ?? 0;
		const worldY = player.position?.y ?? 0;

		const baseCanvasPosition = worldToCanvas(worldX, worldY);
		const transform = context.getTransform();

		const screenX =
			baseCanvasPosition.x * transform.a +
			baseCanvasPosition.y * transform.c +
			transform.e;
		const screenY =
			baseCanvasPosition.x * transform.b +
			baseCanvasPosition.y * transform.d +
			transform.f;

		const baseRadius = 3;
		const scaleFactor = Math.max(0.3, 1 / Math.pow(state.currentScale, 0.4));
		const hitRadius = baseRadius * scaleFactor * Math.abs(transform.a);

		const distance = Math.hypot(screenX - canvasX, screenY - canvasY);

		if (distance <= hitRadius) return player;
	}

	return null;
};

const updateTooltip = (player) => {
	if (!player) {
		elements.tooltip.classList.add("hidden");
		return;
	}

	const name = player.username ?? "Unknown";

	const playerElement = elements.tooltip.querySelector("#player div");
	if (playerElement) playerElement.textContent = name;

	const destinationSection = elements.tooltip.querySelector("#destination");
	const trainNameSection = elements.tooltip.querySelector("#train-name");
	const headcodeSection = elements.tooltip.querySelector("#headcode");
	const trainClassSection = elements.tooltip.querySelector("#train-class");

	if (player.trainData && Object.keys(player.trainData).length > 0) {
		const { destination, trainClass, headcode, trainType } = player.trainData;

		if (destination && destination !== "Unknown" && destinationSection) {
			const destinationDiv = destinationSection.querySelector("div");
			if (destinationDiv) destinationDiv.textContent = destination;
			destinationSection.style.display = "flex";
		} else if (destinationSection) {
			destinationSection.style.display = "none";
		}

		if (trainClass && trainClass !== "Unknown" && trainClassSection) {
			const classDiv = trainClassSection.querySelector("div");
			if (classDiv) classDiv.textContent = trainClass;
			trainClassSection.style.display = "flex";
		} else if (trainClassSection) {
			trainClassSection.style.display = "none";
		}

		if (headcode && headcode !== "----" && headcode !== "" && headcodeSection) {
			const headDiv = headcodeSection.querySelector("div");
			if (headDiv) headDiv.textContent = headcode;
			headcodeSection.style.display = "flex";
		} else if (headcodeSection) {
			headcodeSection.style.display = "none";
		}

		if (trainNameSection) trainNameSection.style.display = "none";
	} else {
		[
			destinationSection,
			trainNameSection,
			headcodeSection,
			trainClassSection,
		].forEach((section) => {
			if (section) section.style.display = "none";
		});
	}

	const playerSection = elements.tooltip.querySelector("#player");
	if (playerSection) playerSection.style.display = "flex";

	const serverSection = elements.tooltip.querySelector("#server");
	if (serverSection && state.currentServer === "all") {
		const serverDiv = serverSection.querySelector("div");
		if (serverDiv) {
			let serverName = "Unknown";
			for (const [jobId, serverInfo] of Object.entries(state.serverData)) {
				if (serverInfo.players && serverInfo.players.includes(player)) {
					serverName =
						jobId.length > 6 ? jobId.substring(jobId.length - 6) : jobId;
					break;
				}
			}
			serverDiv.textContent = serverName;
		}
		serverSection.style.display = "flex";
	} else if (serverSection) {
		serverSection.style.display = "none";
	}

	// Position tooltip
	const worldX = player.position?.x ?? 0;
	const worldY = player.position?.y ?? 0;
	const baseCanvasPosition = worldToCanvas(worldX, worldY);
	const transform = context.getTransform();

	const screenX =
		baseCanvasPosition.x * transform.a +
		baseCanvasPosition.y * transform.c +
		transform.e;
	const screenY =
		baseCanvasPosition.x * transform.b +
		baseCanvasPosition.y * transform.d +
		transform.f;

	const canvasRect = canvas.getBoundingClientRect();
	const tooltipX = canvasRect.left + screenX;
	const tooltipY = canvasRect.top + screenY;

	let finalX = tooltipX + 15;
	let finalY = tooltipY - 40;

	elements.tooltip.classList.remove("hidden");
	elements.tooltip.style.visibility = "hidden";

	const tooltipRect = elements.tooltip.getBoundingClientRect();

	if (finalX + tooltipRect.width > window.innerWidth) {
		finalX = tooltipX - tooltipRect.width - 15;
	}
	if (finalY < 0) {
		finalY = tooltipY + 20;
	}
	if (finalY + tooltipRect.height > window.innerHeight) {
		finalY = tooltipY - tooltipRect.height - 20;
	}
	if (finalX < 0) {
		finalX = tooltipX + 15;
	}

	elements.tooltip.style.left = `${finalX}px`;
	elements.tooltip.style.top = `${finalY}px`;
	elements.tooltip.style.visibility = "visible";
};

let resizeTimeout = null;
const handleWindowResize = () => {
	if (resizeTimeout) {
		clearTimeout(resizeTimeout);
	}

	resizeTimeout = setTimeout(() => {
		const currentTransform = context.getTransform();
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		context.setTransform(currentTransform);
		drawScene();
	}, 16);

	drawScene();
};

const cleanupStaleServers = () => {
	const now = Date.now();
	let hasStaleServers = false;

	for (const [jobId, serverInfo] of Object.entries(state.serverData)) {
		if (now - serverInfo.lastUpdate > STALE_SERVER_TIMEOUT) {
			console.log(`Removing stale server: ${jobId}`);
			delete state.serverData[jobId];
			hasStaleServers = true;
		}
	}

	if (hasStaleServers) {
		updateServerList();
		drawScene();
	}
};

const startStaleServerCleanup = () => {
	if (state.staleCheckInterval) {
		clearInterval(state.staleCheckInterval);
	}
	console.log("Starting stale server cleanup loop");
	state.staleCheckInterval = setInterval(cleanupStaleServers, 5000); // every 5s
};

const stopStaleServerCleanup = () => {
	if (state.staleCheckInterval) {
		console.log("Stopping stale server cleanup loop");
		clearInterval(state.staleCheckInterval);
		state.staleCheckInterval = null;
	}
};

const createWebSocket = () => {
	if (state.reconnectTimeout) {
		clearTimeout(state.reconnectTimeout);
		state.reconnectTimeout = null;
	}

	if (state.ws) {
		state.ws.close();
		state.ws = null;
	}

	state.ws = new WebSocket(
		(location.protocol == "http:" ? "ws://" : "wss://") +
			`${window.location.host}/api/ws`,
	);

	state.ws.addEventListener("open", () => {
		console.log("WebSocket connected");
		state.reconnectAttempts = 0;
		hideConnectionPopup();
		startStaleServerCleanup();
	});

	state.ws.addEventListener("message", (event) => {
		try {
			const data = JSON.parse(event.data);
			const jobId = data.jobId;
			const playersArray = Array.isArray(data.players) ? data.players : [];

			if (playersArray.length === 0 && data.serverShutdown) {
				delete state.serverData[jobId];
			} else {
				state.serverData[jobId] = {
					players: playersArray,
					lastUpdate: Date.now(),
				};
			}
			updateServerList(data);
			drawScene();
		} catch (err) {
			console.error("Error parsing data", err);
		}
	});

	state.ws.addEventListener("error", (err) => {
		console.warn("WebSocket error:", err);
	});

	state.ws.addEventListener("close", (event) => {
		console.warn("WebSocket closed:", event.code, event.reason);
		showConnectionPopup();
		stopStaleServerCleanup();

		if (
			state.reconnectAttempts < state.maxReconnectAttempts &&
			!state.reconnectTimeout
		) {
			state.reconnectTimeout = setTimeout(() => {
				state.reconnectTimeout = null;
				attemptReconnect();
			}, 1000);
		}
	});

	return state.ws;
};

const showConnectionPopup = () => {
	elements.connectionPopup.classList.remove(
		"opacity-0",
		"-translate-y-5",
		"pointer-events-none",
	);
	elements.connectionPopup.classList.add("opacity-100", "translate-y-0");
	updateReconnectButton();
};

const hideConnectionPopup = () => {
	elements.connectionPopup.classList.add(
		"opacity-0",
		"-translate-y-5",
		"pointer-events-none",
	);
	elements.connectionPopup.classList.remove("opacity-100", "translate-y-0");

	elements.reconnectBtn.disabled = false;
	elements.reconnectBtn.classList.remove("bg-zinc-600");
	elements.reconnectBtn.classList.add("bg-blue-600", "hover:bg-blue-700");

	const reconnectIcon = document.getElementById("reconnectIcon");
	if (reconnectIcon) {
		reconnectIcon.classList.remove("animate-spin");
	}

	elements.reconnectBtn.innerHTML = `
    <i id="reconnectIcon" class="material-symbols-outlined text-4">refresh</i>
    Reconnect
  `;
};

const updateReconnectButton = () => {
	if (state.reconnectAttempts >= state.maxReconnectAttempts) {
		elements.reconnectBtn.innerHTML = `
      <i id="reconnectIcon" class="material-symbols-outlined text-4">refresh</i>
      Reconnect
    `;
		elements.reconnectBtn.disabled = false;
		elements.reconnectBtn.classList.remove("bg-zinc-600");
		elements.reconnectBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
	}
};

const attemptReconnect = () => {
	if (state.reconnectTimeout) {
		return;
	}

	if (state.reconnectAttempts >= state.maxReconnectAttempts) {
		updateReconnectButton();
		return;
	}

	state.reconnectAttempts++;

	elements.reconnectBtn.disabled = true;
	elements.reconnectBtn.classList.add("bg-zinc-600");
	elements.reconnectBtn.classList.remove("bg-blue-600", "hover:bg-blue-700");

	elements.reconnectBtn.innerHTML = `
		<i id="reconnectIcon" class="material-symbols-outlined text-4 animate-spin">refresh</i>
		Connecting...
	`;

	if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
		state.ws.close();
	}

	createWebSocket();
};

const resetReconnection = () => {
	state.reconnectAttempts = 0;
	if (state.reconnectTimeout) {
		clearTimeout(state.reconnectTimeout);
		state.reconnectTimeout = null;
	}
};

const updateServerList = (data = null) => {
	const currentServers = Object.keys(state.serverData);
	const existingServers = Array.from(elements.serverSelect.options)
		.slice(1)
		.map((opt) => opt.value);

	if (data?.players) {
		const playersArray = Array.isArray(data.players) ? data.players : [];

		playersArray.forEach((player) => {
			if (!player.trainData || !Array.isArray(player.trainData)) return;
			const trainData = player.trainData;

			if (typeof trainData !== "object" || trainData === null) {
				player.trainData = null;
				return;
			}

			player.trainData = [
				trainData.destination || "Unknown",
				trainData.class || "Unknown",
				trainData.headcode || "----",
				trainData.headcodeClass || "",
			];
		});
	}

	// this will constantly recreate the options which can
	//  make selecting an option difficult on certain browsers
	// TODO: only update when required
	const selectedValue = elements.serverSelect.value;
	const totalPlayersCount = Object.values(state.serverData).reduce(
		(count, serverInfo) =>
			count +
			(Array.isArray(serverInfo.players) ? serverInfo.players.length : 0),
		0,
	);

	let html = `<option value="all">All Servers (${totalPlayersCount} players)</option>`;

	currentServers.forEach((jobId) => {
		const serverName =
			jobId.length > 6
				? `Server ${jobId.substring(jobId.length - 6)}`
				: `Server ${jobId}`;
		const playerCount = Array.isArray(state.serverData[jobId]?.players)
			? state.serverData[jobId].players.length
			: 0;
		const selected = selectedValue === jobId ? " selected" : "";
		html += `<option value="${jobId}"${selected}>${serverName} (${playerCount} / 50 players)</option>`;
	});

	elements.serverSelect.innerHTML = html;

	if (selectedValue !== "all" && !currentServers.includes(selectedValue)) {
		elements.serverSelect.value = "all";
		elements.joinBtn.href = "roblox://experiences/start?placeId=12018816388";
		state.currentServer = "all";
	} else {
		elements.serverSelect.value = selectedValue;
	}
};

const drawScene = () => {
	const transformedPoint1 = context.transformedPoint(0, 0);
	const transformedPoint2 = context.transformedPoint(
		canvas.width,
		canvas.height,
	);
	context.clearRect(
		transformedPoint1.x,
		transformedPoint1.y,
		transformedPoint2.x - transformedPoint1.x,
		transformedPoint2.y - transformedPoint1.y,
	);

	const mapAspectRatio = MAP_CONFIG.totalWidth / MAP_CONFIG.totalHeight;
	const canvasAspectRatio = canvas.width / canvas.height;

	const scaleFactor =
		mapAspectRatio > canvasAspectRatio
			? canvas.width / MAP_CONFIG.totalWidth
			: canvas.height / MAP_CONFIG.totalHeight;

	const scaledMapWidth = MAP_CONFIG.totalWidth * scaleFactor;
	const scaledMapHeight = MAP_CONFIG.totalHeight * scaleFactor;
	const offsetX = (canvas.width - scaledMapWidth) / 2;
	const offsetY = (canvas.height - scaledMapHeight) / 2;

	const chunkWidth = MAP_CONFIG.totalWidth / MAP_CONFIG.columns;
	const chunkHeight = MAP_CONFIG.totalHeight / MAP_CONFIG.rows;
	const scaledChunkWidth = chunkWidth * scaleFactor;
	const scaledChunkHeight = chunkHeight * scaleFactor;

	context.imageSmoothingEnabled = false;

	for (let row = 0; row < MAP_CONFIG.rows; row++) {
		for (let column = 0; column < MAP_CONFIG.columns; column++) {
			const image = state.mapImages[row]?.[column];
			if (image?.complete) {
				const destinationX = offsetX + column * scaledChunkWidth;
				const destinationY = offsetY + row * scaledChunkHeight;

				const overlap = Math.max(0.5, 2 / state.currentScale);
				const drawWidth =
					scaledChunkWidth + (column < MAP_CONFIG.columns - 1 ? overlap : 0);
				const drawHeight =
					scaledChunkHeight + (row < MAP_CONFIG.rows - 1 ? overlap : 0);

				context.drawImage(
					image,
					0,
					0,
					image.width,
					image.height,
					destinationX,
					destinationY,
					drawWidth,
					drawHeight,
				);
			}
		}
	}
	context.imageSmoothingEnabled = true;

	const playersToShow = state.getAllPlayers();
	elements.players.innerHTML = `Players: ${playersToShow.length}`;

	const dotScaleFactor = Math.max(0.3, 1 / Math.pow(state.currentScale, 0.4));

	playersToShow.forEach((player) => {
		const worldX = player.position?.x ?? 0;
		const worldY = player.position?.y ?? 0;
		const name = player.username ?? "Unknown";

		const canvasPosition = worldToCanvas(worldX, worldY);
		const isHovered = state.hoveredPlayer?.username === name;
		const baseRadius = isHovered ? 2.5 : 2;
		const radius = baseRadius * dotScaleFactor;

		context.fillStyle = getPlayerColor(name);
		context.beginPath();
		context.arc(canvasPosition.x, canvasPosition.y, radius, 0, Math.PI * 2);
		context.fill();

		context.strokeStyle = isHovered ? "white" : "black";
		context.lineWidth = Math.max((isHovered ? 0.7 : 0.4) * scaleFactor, 0.25);
		context.stroke();
	});

	if (state.currentScale > 300) return;
	const markerFontSize = Math.max(0.2, 10 / Math.pow(state.currentScale, 0.3));
	Object.entries(AREA_MARKERS).forEach(([name, { x, y }]) => {
		const position = worldToCanvas(x, y);
		context.font = `${markerFontSize}px Inter`;

		const metrics = context.measureText(name);
		const textWidth = metrics.width;
		const ascent = metrics.actualBoundingBoxAscent || markerFontSize * 0.8;
		const descent = metrics.actualBoundingBoxDescent || markerFontSize * 0.2;
		const textHeight = ascent + descent;

		const padX = markerFontSize * 0.6;
		const padY = markerFontSize * 0.4;
		const boxWidth = textWidth + padX * 2;
		const boxHeight = textHeight + padY * 2;

		const boxX = position.x - boxWidth / 2;
		const boxY = position.y - boxHeight / 2;

		const radius = Math.min(boxHeight / 2, markerFontSize * 0.5);
		context.fillStyle = "#00000078";
		context.strokeStyle = "transparent";
		context.lineWidth = Math.max(0.5 * (markerFontSize / 10), 0.4);

		drawRoundedRectangle(context, boxX, boxY, boxWidth, boxHeight, radius);
		context.fill();
		context.stroke();

		context.fillStyle = "#fff";
		context.fillText(name, position.x - textWidth / 2, boxY + padY + ascent);
	});
};

const loadMapImages = () => {
	for (let row = 0; row < MAP_CONFIG.rows; row++) {
		state.mapImages[row] = [];
		for (let column = 0; column < MAP_CONFIG.columns; column++) {
			const image = new Image();
			image.src = `/images/row-${row + 1}-column-${column + 1}.png`;

			image.onload = () => {
				state.loadedImages++;
				if (state.loadedImages === 1) {
					initializeMap();
				} else {
					drawScene();
				}
			};

			image.onerror = () => {
				console.error(`Failed to load image: ${image.src}`);
				state.loadedImages++;
				drawScene();
			};

			state.mapImages[row][column] = image;
		}
	}
};

const initializeMap = () => {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	const canvasCenter = worldToCanvas(WORLD_CENTER.x, WORLD_CENTER.y);
	context.translate(
		window.innerWidth / 2 - canvasCenter.x,
		window.innerHeight / 2 - canvasCenter.y,
	);
	drawScene();
};

const handleMouseEvents = () => {
	canvas.addEventListener("mousedown", (event) => {
		const mousePosition = getCanvasCoordinates(event);
		state.dragStart = context.transformedPoint(
			mousePosition.x,
			mousePosition.y,
		);
		state.isDragging = true;
		return false;
	});

	canvas.addEventListener("mousemove", (event) => {
		if (state.isDragging) {
			if (state.hoveredPlayer) {
				state.hoveredPlayer = null;
				elements.tooltip.classList.add("hidden");
			}

			const mousePosition = getCanvasCoordinates(event);
			const currentPoint = context.transformedPoint(
				mousePosition.x,
				mousePosition.y,
			);
			const distanceX = currentPoint.x - state.dragStart.x;
			const distanceY = currentPoint.y - state.dragStart.y;

			context.translate(distanceX, distanceY);
			drawScene();
		} else {
			const mousePosition = getCanvasCoordinates(event);
			const player = getPlayerAtPosition(mousePosition.x, mousePosition.y);

			if (player !== state.hoveredPlayer) {
				state.hoveredPlayer = player;
				updateTooltip(player, event.clientX, event.clientY);
				drawScene();
			}
		}
	});

	canvas.addEventListener("mouseleave", () => {
		state.isDragging = false;
		state.dragStart = null;

		if (state.hoveredPlayer) {
			state.hoveredPlayer = null;
			elements.tooltip.classList.add("hidden");
			drawScene();
		}
	});

	canvas.addEventListener("mouseup", () => {
		state.isDragging = false;
		state.dragStart = null;
	});

	canvas.addEventListener(
		"wheel",
		(event) => {
			event.preventDefault();
			const zoomIntensity = 0.1;
			const scale = event.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
			const mousePosition = getCanvasCoordinates(event);
			zoomAt(mousePosition.x, mousePosition.y, scale);
		},
		{ passive: false },
	);
};

const handleTouchEvents = () => {
	canvas.addEventListener(
		"touchstart",
		(event) => {
			state.hoveredPlayer = null;
			elements.tooltip.classList.add("hidden");

			if (event.touches.length === 1) {
				const touchPosition = getCanvasCoordinates(event.touches[0]);
				state.dragStart = context.transformedPoint(
					touchPosition.x,
					touchPosition.y,
				);
				state.isDragging = true;
			} else if (event.touches.length === 2) {
				state.lastTouchDistance = getDistanceBetweenTouches(event.touches);
			}
		},
		{ passive: false },
	);

	canvas.addEventListener(
		"touchmove",
		(event) => {
			event.preventDefault();

			state.hoveredPlayer = null;
			elements.tooltip.classList.add("hidden");

			if (event.touches.length === 1 && state.isDragging) {
				const touchPosition = getCanvasCoordinates(event.touches[0]);
				const currentPoint = context.transformedPoint(
					touchPosition.x,
					touchPosition.y,
				);
				const distanceX = currentPoint.x - state.dragStart.x;
				const distanceY = currentPoint.y - state.dragStart.y;

				context.translate(distanceX, distanceY);
				drawScene();
			} else if (event.touches.length === 2) {
				const newDistance = getDistanceBetweenTouches(event.touches);
				const scale = newDistance / state.lastTouchDistance;

				const centerX =
					(event.touches[0].clientX + event.touches[1].clientX) / 2;
				const centerY =
					(event.touches[0].clientY + event.touches[1].clientY) / 2;

				zoomAt(centerX, centerY, scale);
				state.lastTouchDistance = newDistance;
			}
		},
		{ passive: false },
	);

	canvas.addEventListener("touchend", (event) => {
		if (event.touches.length < 2) state.lastTouchDistance = 0;
		if (event.touches.length === 0) {
			state.isDragging = false;
			state.dragStart = null;
		}
	});
};

elements.serverSelect.addEventListener("change", () => {
	state.currentServer = elements.serverSelect.value;
	drawScene();

	if (elements.serverSelect.value === "all") {
		elements.joinBtn.href = "roblox://experiences/start?placeId=12018816388";
	} else {
		elements.joinBtn.href =
			"roblox://experiences/start?placeId=12018816388&gameInstanceId=" +
			elements.serverSelect.value;
	}
});

elements.reconnectBtn.addEventListener("click", () => {
	if (state.reconnectTimeout) {
		clearTimeout(state.reconnectTimeout);
		state.reconnectTimeout = null;
	}

	state.reconnectAttempts = 0;
	attemptReconnect();
});

const start = () => {
	trackTransforms();
	loadMapImages();
	handleMouseEvents();
	handleTouchEvents();
	window.addEventListener("resize", handleWindowResize);

	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	drawScene();
	elements.serverSelect.innerHTML =
		'<option value="all">All Servers (0 players)</option>';
	createWebSocket();
};

start();
