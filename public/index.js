// Constants
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

const STALE_SERVER_TIMEOUT = 30000;

const MAP_CONFIG = {
	rows: 1,
	cols: 16,
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

// DOM Elements
const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");
const elements = {
	players: document.getElementById("players"),
	tooltip: document.getElementById("tooltip"),
	serverSelect: document.getElementById("servers"),
	connectionPopup: document.getElementById("connectionPopup"),
	reconnectBtn: document.getElementById("reconnectBtn"),
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
		this.totalImages = MAP_CONFIG.rows * MAP_CONFIG.cols;
		this.staleCheckInterval = null; // ADD THIS LINE
	}

	getAllPlayers() {
		if (this.currentServer === "all") {
			return Object.values(this.serverData)
				.map(serverInfo => serverInfo.players || [])
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
	const dx = touches[0].clientX - touches[1].clientX;
	const dy = touches[0].clientY - touches[1].clientY;
	return Math.hypot(dx, dy);
};

const getPlayerColor = (name) => {
	if (!name) return "#00FFFF";

	let value = 0;
	for (let i = 0; i < name.length; i++) {
		const charValue = name.charCodeAt(i);
		let reverseIndex = name.length - i;
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

function drawRoundedRect(context, x, y, width, height, radius) {
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

// Transform Tracking
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

	context.scale = function (sx, sy) {
		transform = transform.scaleNonUniform(sx, sy);
		state.currentScale *= sx;
		return original.scale.call(context, sx, sy);
	};

	context.translate = function (dx, dy) {
		transform = transform.translate(dx, dy);
		return original.translate.call(context, dx, dy);
	};

	const point = svg.createSVGPoint();
	context.transformedPoint = function (x, y) {
		point.x = x;
		point.y = y;
		return point.matrixTransform(transform.inverse());
	};
};

// Zoom and Pan Functions
const zoomAt = (screenX, screenY, scaleFactor) => {
	const point = context.transformedPoint(screenX, screenY);
	context.translate(point.x, point.y);
	context.scale(scaleFactor, scaleFactor);
	context.translate(-point.x, -point.y);

	state.currentScale *= scaleFactor;
	drawScene();
};

// Player Detection
const getPlayerAtPosition = (canvasX, canvasY) => {
    const playersToShow = state.getAllPlayers();
    const groups = groupPlayers(playersToShow);
    const transform = context.getTransform();
    for (const group of groups) {
	    const worldX = group[0].position?.x ?? 0;
        const worldY = group[0].position?.y ?? 0;
        const baseCanvasPos = worldToCanvas(worldX, worldY);
        const screenX =
	        baseCanvasPos.x * transform.a +
	        baseCanvasPos.y * transform.c +
	        transform.e;
        const screenY =
	        baseCanvasPos.x * transform.b +
	        baseCanvasPos.y * transform.d +
	        transform.f;
        // Use the same radius as drawScene
        const dotScaleFactor = Math.max(0.3, 1 / Math.pow(state.currentScale, 0.4));
        const baseRadius = group.length > 1 ? 4 : 2;
        const hitRadius = baseRadius * dotScaleFactor * Math.abs(transform.a);
        const distance = Math.hypot(screenX - canvasX, screenY - canvasY);
        if (distance <= hitRadius) {
	        if (group.length > 1) return group;
		        return group[0];
	        }
    }
    return null;
};

// Tooltip Management
const updateTooltip = (playerOrGroup, mouseX, mouseY) => {
    if (!playerOrGroup) {
	    elements.tooltip.classList.add("hidden");
	    return;
    }

	const group = Array.isArray(playerOrGroup) ? playerOrGroup : [playerOrGroup];
    const isGroup = group.length > 1;

    let name = isGroup ? group.map(p => p.username ?? "Unknown").join(", ") : (group[0].username ?? "Unknown");

    const playerElement = elements.tooltip.querySelector("#player div");
    if (playerElement) playerElement.textContent = name;

    const destinationSection = elements.tooltip.querySelector("#destination");
    const trainNameSection = elements.tooltip.querySelector("#train-name");
    const headcodeSection = elements.tooltip.querySelector("#headcode");
    const trainClassSection = elements.tooltip.querySelector("#train-class");

    if (!isGroup && group[0].trainData && Array.isArray(group[0].trainData)) {
	    const [destination, trainClass, headcode, trainType] = group[0].trainData;

	    if (destination && destination !== "Unknown" && destinationSection) {
		    const destDiv = destinationSection.querySelector("div");

		    if (destDiv) destDiv.textContent = destination;
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
	    if (
		    headcode &&
		    headcode !== "----" &&
		    headcode !== "" &&
		    headcodeSection
	    ) {
		    const headDiv = headcodeSection.querySelector("div");

		    if (headDiv) headDiv.textContent = headcode;
		    headcodeSection.style.display = "flex";
	    } else if (headcodeSection) {
		    headcodeSection.style.display = "none";
	    }
	    if (trainNameSection) trainNameSection.style.display = "none";
        } else if (isGroup) {
	        let destinations = {}, classes = {}, headcodes = {};
	        let withTrainData = 0;
	        group.forEach(p => {
		        if (p.trainData && Array.isArray(p.trainData)) {
			        withTrainData++;
			        const [destination, trainClass, headcode] = p.trainData;
			        if (destination && destination !== "Unknown") destinations[destination] = (destinations[destination] || 0) + 1;
			        if (trainClass && trainClass !== "Unknown") classes[trainClass] = (classes[trainClass] || 0) + 1;
			        if (headcode && headcode !== "----" && headcode !== "") headcodes[headcode] = (headcodes[headcode] || 0) + 1;
		        }
	        });
			
			function summaryList(arr) {
				return arr.length ? arr.join(", ") : "-";
			}
			
			const destList = group.map(p => (p.trainData && Array.isArray(p.trainData)) ? p.trainData[0] : null).filter(v => v && v !== "Unknown");
			const classList = group.map(p => (p.trainData && Array.isArray(p.trainData)) ? p.trainData[1] : null).filter(v => v && v !== "Unknown");
			const headcodeList = group.map(p => (p.trainData && Array.isArray(p.trainData)) ? p.trainData[2] : null).filter(v => v && v !== "----" && v !== "");
			const destSummary = summaryList(destList);
	        const classSummary = summaryList(classList);
		    const headcodeSummary = summaryList(headcodeList);

	        if (destinationSection) {
		        const destDiv = destinationSection.querySelector("div");
		        if (destDiv) destDiv.textContent = destSummary;
		        destinationSection.style.display = "flex";
	        }
	        if (trainClassSection) {
		        const classDiv = trainClassSection.querySelector("div");
		        if (classDiv) classDiv.textContent = classSummary;
		        trainClassSection.style.display = "flex";
	        }
	        if (headcodeSection) {
		        const headDiv = headcodeSection.querySelector("div");
		        if (headDiv) headDiv.textContent = headcodeSummary;
		        headcodeSection.style.display = "flex";
	        }
	        if (trainNameSection) trainNameSection.style.display = "none";
        } else {
	        [destinationSection, trainNameSection, headcodeSection, trainClassSection].forEach((section) => {
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
		        // For group, just show the first's server
		        const firstPlayer = group[0];
		        for (const [jobId, serverInfo] of Object.entries(state.serverData)) {
			        if (serverInfo.players && serverInfo.players.includes(firstPlayer)) {
				        serverName = jobId.length > 6 ? jobId.substring(jobId.length - 6) : jobId;
				        break;
			        }
		        }
		        serverDiv.textContent = serverName;
	        }
	        serverSection.style.display = "flex";
        } else if (serverSection) {
	        serverSection.style.display = "none";
        }

        // Position tooltip at the group spot
        const worldX = group[0].position?.x ?? 0;
        const worldY = group[0].position?.y ?? 0;
        const baseCanvasPos = worldToCanvas(worldX, worldY);
        const transform = context.getTransform();
       	const screenX = baseCanvasPos.x * transform.a + baseCanvasPos.y * transform.c + transform.e;
       	const screenY = baseCanvasPos.x * transform.b + baseCanvasPos.y * transform.d + transform.f;
       	const canvasRect = canvas.getBoundingClientRect();
       	const tooltipX = canvasRect.left + screenX;
       	const tooltipY = canvasRect.top + screenY;
       	let finalX = tooltipX + 15;
       	let finalY = tooltipY - 40;
       	elements.tooltip.classList.remove("hidden");
       	elements.tooltip.style.visibility = "hidden";
       	const tooltipRect = elements.tooltip.getBoundingClientRect();
       	// Boundary checks
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

	state.ws = new WebSocket((location.protocol == "http:" ? "ws://" : "wss://") + `${window.location.host}/ws`);

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
					lastUpdate: Date.now() // UPDATE TIMESTAMP
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
		stopStaleServerCleanup(); // STOP CLEANUP WHEN DISCONNECTED

		if (state.reconnectAttempts < state.maxReconnectAttempts && !state.reconnectTimeout) {
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

	// Reset reconnect button to normal state
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
	// Prevent multiple simultaneous reconnection attempts
	if (state.reconnectTimeout) {
		return;
	}

	if (state.reconnectAttempts >= state.maxReconnectAttempts) {
		updateReconnectButton();
		return;
	}

	state.reconnectAttempts++;

	// Update UI to show connecting state
	elements.reconnectBtn.disabled = true;
	elements.reconnectBtn.classList.add("bg-zinc-600");
	elements.reconnectBtn.classList.remove("bg-blue-600", "hover:bg-blue-700");

	elements.reconnectBtn.innerHTML = `
		<i id="reconnectIcon" class="material-symbols-outlined text-4 animate-spin">refresh</i>
		Connecting...
	`;

	// Close existing WebSocket before creating new one
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

	// Only process player data if data is provided
	if (data?.players) {
		const playersArray = Array.isArray(data.players) ? data.players : [];

		// Normalize train data
		playersArray.forEach((player) => {
			if (player.trainData && !Array.isArray(player.trainData)) {
				const td = player.trainData;
				if (typeof td === "object" && td !== null) {
					player.trainData = [
						td.destination || "Unknown",
						td.class || "Unknown",
						td.headcode || "----",
						td.headcodeClass || "",
					];
				} else {
					player.trainData = null;
				}
			}
		});
	}

	// Always rebuild the server list to ensure player counts are current
	const selectedValue = elements.serverSelect.value;
	const totalPlayersCount = Object.values(state.serverData).reduce(
		(count, serverInfo) =>
			count + (Array.isArray(serverInfo.players) ? serverInfo.players.length : 0),
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

	// Handle server selection if current server no longer exists
	if (selectedValue !== "all" && !currentServers.includes(selectedValue)) {
		elements.serverSelect.value = "all";
		state.currentServer = "all";
	} else {
		elements.serverSelect.value = selectedValue;
	}
};

// --- Player Grouping Helper ---
function groupPlayers(players, groupDistance = 2) {
    // groupDistance is in canvas pixels (smaller for tighter grouping)
    const groups = [];
    const used = new Set();
    for (let i = 0; i < players.length; i++) {
	    if (used.has(i)) continue;
	    const group = [players[i]];
	    const posA = worldToCanvas(players[i].position?.x ?? 0, players[i].position?.y ?? 0);
	    for (let j = i + 1; j < players.length; j++) {
		    if (used.has(j)) continue;
		    const posB = worldToCanvas(players[j].position?.x ?? 0, players[j].position?.y ?? 0);
		    const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y);
		    if (dist < groupDistance) {
			    group.push(players[j]);
			    used.add(j);
		    }
	    }
	    used.add(i);
	    groups.push(group);
    }
    return groups;
}

// --- Persistent group color map for session ---
const persistentGroupColorMap = new Map();
function getPersistentGroupColor(group) {
	// Use sorted usernames as key for group
	const key = group.map(p => p.username ?? '').sort().join(',');
	if (persistentGroupColorMap.has(key)) return persistentGroupColorMap.get(key);
	// Pick a random color from COLORS not already in use for visible groups
	const usedColors = new Set(Array.from(persistentGroupColorMap.values()));
	const availableColors = COLORS.filter(c => !usedColors.has(c));
	let color;
	if (availableColors.length > 0) {
		color = availableColors[Math.floor(Math.random() * availableColors.length)];
	} else {
		color = COLORS[Math.floor(Math.random() * COLORS.length)];
	}
	persistentGroupColorMap.set(key, color);
	return color;
}

// Rendering
const drawScene = () => {
    const transformedP1 = context.transformedPoint(0, 0);
    const transformedP2 = context.transformedPoint(canvas.width, canvas.height);
    context.clearRect(
	    transformedP1.x,
	    transformedP1.y,
	    transformedP2.x - transformedP1.x,
	    transformedP2.y - transformedP1.y,
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

    const chunkWidth = MAP_CONFIG.totalWidth / MAP_CONFIG.cols;
    const chunkHeight = MAP_CONFIG.totalHeight / MAP_CONFIG.rows;
    const scaledChunkWidth = chunkWidth * scaleFactor;
    const scaledChunkHeight = chunkHeight * scaleFactor;

    context.imageSmoothingEnabled = false;
    // Draw map tiles
    for (let row = 0; row < MAP_CONFIG.rows; row++) {
	    for (let col = 0; col < MAP_CONFIG.cols; col++) {
		    const img = state.mapImages[row]?.[col];
		    if (img?.complete) {
			    const destX = offsetX + col * scaledChunkWidth;
			    const destY = offsetY + row * scaledChunkHeight;

			    const overlap = Math.max(0.5, 2 / state.currentScale);
			    const drawWidth = scaledChunkWidth + (col < MAP_CONFIG.cols - 1 ? overlap : 0);
			    const drawHeight = scaledChunkHeight + (row < MAP_CONFIG.rows - 1 ? overlap : 0);
			    context.drawImage(
				    img,
				    0,
				    0,
				    img.width,
				    img.height,
				    destX,
				    destY,
				    drawWidth,
				    drawHeight,
			    );
		    }
	    }
    }
    context.imageSmoothingEnabled = true;

    // Draw grouped players
    const playersToShow = state.getAllPlayers();
    elements.players.innerHTML = `Players: ${playersToShow.length}`;

    const dotScaleFactor = Math.max(0.3, 1 / Math.pow(state.currentScale, 0.4));

	// Group players that are close together
	const groups = groupPlayers(playersToShow);
	// Assign a persistent color to each group for the session

	groups.forEach((group) => {
		// Use the first player's position for the group
		const worldX = group[0].position?.x ?? 0;
		const worldY = group[0].position?.y ?? 0;
		const name = group[0].username ?? "Unknown";
		const canvasPos = worldToCanvas(worldX, worldY);
		const isHovered = Array.isArray(state.hoveredPlayer) ? state.hoveredPlayer.includes(group[0]) : (state.hoveredPlayer?.username === name && group.length === 1);
		// Grouped spot is slightly bigger than single spot
		const baseRadius = group.length > 1 ? 3 : (isHovered ? 2.5 : 2);
		const radius = baseRadius * dotScaleFactor;


		// Use a blended color for groups, or just the first player's color
		// Assign a random color from COLORS for each group dot (with >1 player)
		let fillColor;
		if (group.length > 1) {
			fillColor = getPersistentGroupColor(group);
		} else {
			fillColor = getPlayerColor(name);
		}
		context.fillStyle = fillColor;
		context.beginPath();
		context.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
		context.fill();

		// Draw border
		context.strokeStyle = group.length > 1 ? "#fff" : (isHovered ? "white" : "black");
		context.lineWidth = Math.max((group.length > 1 ? 0.7 : (isHovered ? 0.7 : 0.4)) * scaleFactor, 0.18);
		context.stroke();

	   // Draw group count if > 1
	    if (group.length > 1) {
			context.fillStyle = "#fff";
			// Dynamically scale font size to fit the spot
			let fontSize = radius * 1.7;
			context.font = `${fontSize}px Inter`;
			let text = group.length.toString();
			let metrics = context.measureText(text);
			// Shrink font if text is too wide for the spot
			while (metrics.width > radius * 1.6 && fontSize > 6) {
				fontSize -= 1;
				context.font = `${fontSize}px Inter`;
				metrics = context.measureText(text);
			}
			context.textAlign = "center";
			context.textBaseline = "middle";
			// Center the number exactly in the spot
			context.fillText(text, canvasPos.x, canvasPos.y);
		}
	});

    if (state.currentScale > 300) return;
    const markerFontSize = Math.max(0.2, 10 / Math.pow(state.currentScale, 0.3));
		Object.entries(AREA_MARKERS).forEach(([name, { x, y }]) => {
			const pos = worldToCanvas(x, y);
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

			// Center the label above the marker
			const boxX = pos.x - boxWidth / 2;
			const boxY = pos.y - boxHeight - 6; // 6px gap above marker
			const radius = Math.min(boxHeight / 2, markerFontSize * 0.5);
			context.fillStyle = "#00000078";
			context.strokeStyle = "transparent";
			context.lineWidth = Math.max(0.5 * (markerFontSize / 10), 0.4);
			drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, radius);
			context.fill();
			context.stroke();
			context.fillStyle = "#fff";
			context.textAlign = "center";
			context.fillText(name, pos.x, boxY + padY + ascent);
		});
};

// Map Loading
const loadMapImages = () => {
	for (let row = 0; row < MAP_CONFIG.rows; row++) {
		state.mapImages[row] = [];
		for (let col = 0; col < MAP_CONFIG.cols; col++) {
			const img = new Image();
			img.src = `/images/row-${row + 1}-column-${col + 1}.png`;

			img.onload = () => {
				state.loadedImages++;
				if (state.loadedImages === 1) {
					initializeMap();
				} else {
					drawScene();
				}
			};

			img.onerror = () => {
				console.error(`Failed to load image: ${img.src}`);
				state.loadedImages++;
				drawScene();
			};

			state.mapImages[row][col] = img;
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

// Event Handlers
const handleMouseEvents = () => {
	canvas.addEventListener("mousedown", (event) => {
		const mousePos = getCanvasCoordinates(event);
		state.dragStart = context.transformedPoint(mousePos.x, mousePos.y);
		state.isDragging = true;
		return false
	});

	canvas.addEventListener("mousemove", (event) => {
	    if (state.isDragging) {
		    if (state.hoveredPlayer) {
			    state.hoveredPlayer = null;
			    elements.tooltip.classList.add("hidden");
		    }

		    const mousePos = getCanvasCoordinates(event);
		    const currentPoint = context.transformedPoint(mousePos.x, mousePos.y);
		    const dx = currentPoint.x - state.dragStart.x;
		    const dy = currentPoint.y - state.dragStart.y;

		    context.translate(dx, dy);
		    drawScene();
	    } else {
		    const mousePos = getCanvasCoordinates(event);
		    const playerOrGroup = getPlayerAtPosition(mousePos.x, mousePos.y);
		    // Use shallow array compare for group hover
		    let sameHover = false;
		    if (Array.isArray(playerOrGroup) && Array.isArray(state.hoveredPlayer)) {
			    sameHover = playerOrGroup.length === state.hoveredPlayer.length && playerOrGroup.every((p, i) => p === state.hoveredPlayer[i]);
		    } else {
			    sameHover = playerOrGroup === state.hoveredPlayer;
		    }

		    if (!sameHover) {
			    state.hoveredPlayer = playerOrGroup;
			    updateTooltip(playerOrGroup, event.clientX, event.clientY);
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
			const mousePos = getCanvasCoordinates(event);
			zoomAt(mousePos.x, mousePos.y, scale);
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
				const touchPos = getCanvasCoordinates(event.touches[0]);
				state.dragStart = context.transformedPoint(touchPos.x, touchPos.y);
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
				const touchPos = getCanvasCoordinates(event.touches[0]);
				const currentPoint = context.transformedPoint(
					touchPos.x,
					touchPos.y,
				);
				const dx = currentPoint.x - state.dragStart.x;
				const dy = currentPoint.y - state.dragStart.y;

				context.translate(dx, dy);
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

// Event Listeners
elements.serverSelect.addEventListener("change", () => {
	state.currentServer = elements.serverSelect.value;
	drawScene();
});

elements.reconnectBtn.addEventListener("click", () => {
	if (state.reconnectTimeout) {
		clearTimeout(state.reconnectTimeout);
		state.reconnectTimeout = null;
	}

	state.reconnectAttempts = 0;
	attemptReconnect();
});

// Initialize Application
const init = () => {
	trackTransforms();
	loadMapImages();
	handleMouseEvents();
	handleTouchEvents();
	window.addEventListener('resize', handleWindowResize);

	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	drawScene();
	elements.serverSelect.innerHTML =
		'<option value="all">All Servers (0 players)</option>';
	createWebSocket();
};

init();
