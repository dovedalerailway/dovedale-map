const WORLD_BOUNDS = {
    TOP_LEFT: { x: -23818, y: -10426 },
    BOTTOM_RIGHT: { x: 14911, y: 13693 },
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
    totalWidth: 19366,
    totalHeight: 12061,
};

const AREA_MARKERS = {
    "Gleethrop End": {
        x: -1502,
        y: 7910,
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
        x: -6473,
        y: 11481,
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
        x: -2618,
        y: 10055,
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
    "Cosdale Town": {
        x: 5860,
        y: -5155,
    },
    "Westwood Park": {
        x: 1513,
        y: 3414,
    },
    "Wington Quarry": {
        x: 2676,
        y: -3410,
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
    zoomInBtn: document.getElementById("zoom-in"),
    zoomOutBtn: document.getElementById("zoom-out"),
    qualitySelect: document.getElementById("quality"),
    popOutBtn: document.getElementById("pop-out"),
};

const tooltipElements = {
    playerName: elements.tooltip.querySelector("#player div"),
    playerSection: elements.tooltip.querySelector("#player"),
    destination: elements.tooltip.querySelector("#destination"),
    destinationDiv: elements.tooltip.querySelector("#destination div"),
    trainName: elements.tooltip.querySelector("#train-name"),
    headcode: elements.tooltip.querySelector("#headcode"),
    headcodeDiv: elements.tooltip.querySelector("#headcode div"),
    trainClass: elements.tooltip.querySelector("#train-class"),
    trainClassDiv: elements.tooltip.querySelector("#train-class div"),
    speed: elements.tooltip.querySelector("#speed"),
    speedDiv: elements.tooltip.querySelector("#speed div"),
    server: elements.tooltip.querySelector("#server"),
    serverDiv: elements.tooltip.querySelector("#server div"),
};

// Application State
class AppState {
    constructor() {
        this.serverData = {};
        this.currentServer = "all";
        this.currentQuality = localStorage.getItem("mapQuality") || "high";
        this.hoveredPlayer = null;
        this.pinnedPlayer = null;
        this.isDragging = false;
        this.dragStart = null;
        this.dragStartTime = null;
        this.currentScale = 1;
        this.lastTouchDistance = 0;
        this.viewWidth = 0;
        this.viewHeight = 0;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimeout = null;
        this.mapImages = [];
        this.mapLoadId = 0;
        this.mapInitialized = false;
        this.totalImages = MAP_CONFIG.rows * MAP_CONFIG.columns;
        this.staleCheckInterval = null;
        this.previousPlayerPosition = {};
        this.positionBuffer = {};
        this.playerLastUpdateTime = {};
        this.playerTeleport = {};
        this.animationFrameId = null;
        this.followMode = false;
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
const resizeCanvas = (cssWidth, cssHeight) => {
    const dpr = window.devicePixelRatio || 1;

    state.viewWidth = cssWidth;
    state.viewHeight = cssHeight;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    context.setDevicePixelRatio(dpr);
};

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

    const colorIndex =
        ((value % COLORS.length) + COLORS.length) % COLORS.length;
    return COLORS[colorIndex];
};

const worldToCanvas = (worldX, worldY) => {
    const relativeX = (worldX - WORLD_BOUNDS.TOP_LEFT.x) / WORLD_WIDTH;
    const relativeY = (worldY - WORLD_BOUNDS.TOP_LEFT.y) / WORLD_HEIGHT;

    const mapAspectRatio = MAP_CONFIG.totalWidth / MAP_CONFIG.totalHeight;
    const canvasAspectRatio = state.viewWidth / state.viewHeight;

    const scaleFactor =
        mapAspectRatio > canvasAspectRatio
            ? state.viewWidth / MAP_CONFIG.totalWidth
            : state.viewHeight / MAP_CONFIG.totalHeight;

    const scaledMapWidth = MAP_CONFIG.totalWidth * scaleFactor;
    const scaledMapHeight = MAP_CONFIG.totalHeight * scaleFactor;
    const offsetX = (state.viewWidth - scaledMapWidth) / 2;
    const offsetY = (state.viewHeight - scaledMapHeight) / 2;

    return {
        x: offsetX + relativeX * scaledMapWidth,
        y: offsetY + relativeY * scaledMapHeight,
    };
};

const canvasToWorld = (canvasX, canvasY) => {
    const mapAspectRatio = MAP_CONFIG.totalWidth / MAP_CONFIG.totalHeight;
    const canvasAspectRatio = state.viewWidth / state.viewHeight;

    const scaleFactor =
        mapAspectRatio > canvasAspectRatio
            ? state.viewWidth / MAP_CONFIG.totalWidth
            : state.viewHeight / MAP_CONFIG.totalHeight;

    const scaledMapWidth = MAP_CONFIG.totalWidth * scaleFactor;
    const scaledMapHeight = MAP_CONFIG.totalHeight * scaleFactor;
    const offsetX = (state.viewWidth - scaledMapWidth) / 2;
    const offsetY = (state.viewHeight - scaledMapHeight) / 2;

    const relativeX = (canvasX - offsetX) / scaledMapWidth;
    const relativeY = (canvasY - offsetY) / scaledMapHeight;

    return {
        x: WORLD_BOUNDS.TOP_LEFT.x + relativeX * WORLD_WIDTH,
        y: WORLD_BOUNDS.TOP_LEFT.y + relativeY * WORLD_HEIGHT,
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
    let dpr = 1;

    context.getTransform = () => transform;

    const savedTransforms = [];
    const original = {
        save: context.save,
        restore: context.restore,
    };
    const originalSetTransform = context.setTransform.bind(context);

    // The native canvas transform is always dpr * transform, so every
    // pan/zoom op (tracked in CSS-pixel space, DPR-agnostic) still renders
    // crisp on high-DPI screens without the tracked matrix knowing about DPR.
    const applyNativeTransform = () => {
        originalSetTransform(
            dpr * transform.a,
            dpr * transform.b,
            dpr * transform.c,
            dpr * transform.d,
            dpr * transform.e,
            dpr * transform.f,
        );
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
        applyNativeTransform();
    };

    context.translate = function (distanceX, distanceY) {
        transform = transform.translate(distanceX, distanceY);
        applyNativeTransform();
    };

    context.rotate = function (radians) {
        transform = transform.rotate((radians * 180) / Math.PI);
        applyNativeTransform();
    };

    context.resetTransform = function () {
        transform = svg.createSVGMatrix();
        state.currentScale = 1;
        applyNativeTransform();
    };

    context.setDevicePixelRatio = function (newDpr) {
        dpr = newDpr;
        applyNativeTransform();
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
    drawScene();
};

const getPlayerAtPosition = (canvasX, canvasY) => {
    const playersToCheck = state.getAllPlayers();

    for (const player of playersToCheck) {
        const displayPos = getDisplayPosition(
            getPlayerId(player),
            player.position ?? { x: 0, y: 0 },
        );
        const baseCanvasPosition = worldToCanvas(displayPos.x, displayPos.y);
        const transform = context.getTransform();

        const screenX =
            baseCanvasPosition.x * transform.a +
            baseCanvasPosition.y * transform.c +
            transform.e;
        const screenY =
            baseCanvasPosition.x * transform.b +
            baseCanvasPosition.y * transform.d +
            transform.f;

        const scaleFactor = Math.max(
            0.3,
            1 / Math.pow(state.currentScale, 0.4),
        );
        // trains scale with zoom; dots are kept small via scaleFactor
        const hitRadius = player.trainData
            ? Math.max(
                  5,
                  (Math.hypot(12, 6) / 2) * 0.45 * Math.abs(transform.a),
              )
            : 3 * scaleFactor * Math.abs(transform.a);

        const distance = Math.hypot(screenX - canvasX, screenY - canvasY);

        if (distance <= hitRadius) return player;
    }

    return null;
};

const updateTooltip = (player, isPinned = false) => {
    if (!player) {
        elements.tooltip.classList.add("hidden");
        return;
    }

    const name = player.username ?? "Unknown";
    if (tooltipElements.playerName) tooltipElements.playerName.textContent = name;

    if (player.trainData && Object.keys(player.trainData).length > 0) {
        const { destination, trainClass, headcode, trainSpeed } = player.trainData;

        if (destination && destination !== "Unknown") {
            if (tooltipElements.destinationDiv) tooltipElements.destinationDiv.textContent = destination;
            if (tooltipElements.destination) tooltipElements.destination.style.display = "flex";
        } else if (tooltipElements.destination) {
            tooltipElements.destination.style.display = "none";
        }

        if (trainClass && trainClass !== "Unknown") {
            if (tooltipElements.trainClassDiv) tooltipElements.trainClassDiv.textContent = trainClass;
            if (tooltipElements.trainClass) tooltipElements.trainClass.style.display = "flex";
        } else if (tooltipElements.trainClass) {
            tooltipElements.trainClass.style.display = "none";
        }

        if (headcode && headcode !== "----" && headcode !== "") {
            if (tooltipElements.headcodeDiv) tooltipElements.headcodeDiv.textContent = headcode;
            if (tooltipElements.headcode) tooltipElements.headcode.style.display = "flex";
        } else if (tooltipElements.headcode) {
            tooltipElements.headcode.style.display = "none";
        }

        if (typeof trainSpeed === "number") {
            if (tooltipElements.speedDiv) tooltipElements.speedDiv.textContent = `${Math.round(trainSpeed)} mph`;
            if (tooltipElements.speed) tooltipElements.speed.style.display = "flex";
        } else if (tooltipElements.speed) {
            tooltipElements.speed.style.display = "none";
        }

        if (tooltipElements.trainName) tooltipElements.trainName.style.display = "none";
    } else {
        [tooltipElements.destination, tooltipElements.trainName, tooltipElements.headcode, tooltipElements.trainClass, tooltipElements.speed].forEach((el) => {
            if (el) el.style.display = "none";
        });
    }

    if (tooltipElements.playerSection) tooltipElements.playerSection.style.display = "flex";

    if (tooltipElements.server && state.currentServer === "all") {
        if (tooltipElements.serverDiv) {
            let serverName = "Unknown";
            for (const [jobId, serverInfo] of Object.entries(state.serverData)) {
                if (serverInfo.players && serverInfo.players.includes(player)) {
                    serverName = jobId.length > 6 ? jobId.substring(jobId.length - 6) : jobId;
                    break;
                }
            }
            tooltipElements.serverDiv.textContent = serverName;
        }
        tooltipElements.server.style.display = "flex";
    } else if (tooltipElements.server) {
        tooltipElements.server.style.display = "none";
    }

    // Position tooltip at current display (interpolated) position
    const tooltipDisplayPos = getDisplayPosition(
        getPlayerId(player),
        player.position ?? { x: 0, y: 0 },
    );
    const baseCanvasPosition = worldToCanvas(tooltipDisplayPos.x, tooltipDisplayPos.y);
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

    if (isPinned) {
        elements.tooltip.style.boxShadow = "0 0 0 2px rgba(59, 130, 246, 0.5)";
    } else {
        elements.tooltip.style.boxShadow = "";
    }
};

let resizeTimeout = null;
const handleWindowResize = () => {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }

    resizeTimeout = setTimeout(() => {
        if (
            state.viewWidth === window.innerWidth &&
            state.viewHeight === window.innerHeight
        ) {
            return;
        }

        const viewCenterCanvas = context.transformedPoint(
            state.viewWidth / 2,
            state.viewHeight / 2,
        );
        const viewCenterWorld = canvasToWorld(
            viewCenterCanvas.x,
            viewCenterCanvas.y,
        );
        const scale = state.currentScale;

        resizeCanvas(window.innerWidth, window.innerHeight);

        const newViewCenterCanvas = worldToCanvas(
            viewCenterWorld.x,
            viewCenterWorld.y,
        );

        context.resetTransform();
        context.scale(scale, scale);
        context.translate(
            state.viewWidth / 2 / scale - newViewCenterCanvas.x,
            state.viewHeight / 2 / scale - newViewCenterCanvas.y,
        );

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
            const playersArray = Array.isArray(data.players)
                ? data.players
                : [];

            if (playersArray.length === 0 && data.serverShutdown) {
                delete state.serverData[jobId];
            } else {
                const now = Date.now();
                playersArray.forEach((player) => {
                    const uid = getPlayerId(player);
                    const toX = player.position?.x ?? 0;
                    const toY = player.position?.y ?? 0;

                    const oldPlayer = state.serverData[jobId]?.players?.find(
                        (p) => String(p.userId) === uid,
                    );
                    const oldX = oldPlayer?.position?.x ?? toX;
                    const oldY = oldPlayer?.position?.y ?? toY;

                    const ddx = toX - oldX;
                    const ddy = toY - oldY;
                    const isTeleport =
                        ddx * ddx + ddy * ddy >
                        TELEPORT_THRESHOLD * TELEPORT_THRESHOLD;

                    if (!state.positionBuffer[uid])
                        state.positionBuffer[uid] = [];

                    if (isTeleport) {
                        // Clear buffer on teleport so we don't interpolate across the jump
                        state.positionBuffer[uid] = [
                            { x: toX, y: toY, t: now - BUFFER_DELAY },
                        ];
                        state.playerTeleport[uid] = { at: now };
                    } else {
                        state.positionBuffer[uid].push({
                            x: toX,
                            y: toY,
                            t: now,
                        });
                        // Keep only entries within the last 10 seconds
                        const cutoff = now - 10000;
                        state.positionBuffer[uid] = state.positionBuffer[
                            uid
                        ].filter((e) => e.t >= cutoff);
                    }

                    state.playerLastUpdateTime[uid] = now;
                });

                state.serverData[jobId] = {
                    players: playersArray,
                    lastUpdate: Date.now(),
                };
            }
            updateServerList(data);
            startAnimationLoop();
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
    if (data?.players) {
        const playersArray = Array.isArray(data.players) ? data.players : [];
        playersArray.forEach((player) => {
            const td = player.trainData;
            if (!td || typeof td !== "object" || Array.isArray(td)) return;
            player.trainData = {
                destination: td.destination || "Unknown",
                trainClass: td.class || "Unknown",
                headcode: td.headcode || "----",
                trainType: td.headcodeClass || "",
                trainSpeed: typeof td.trainSpeed === "number" ? td.trainSpeed : null,
            };
        });
    }

    const currentServers = Object.keys(state.serverData);
    const totalPlayersCount = Object.values(state.serverData).reduce(
        (count, serverInfo) =>
            count +
            (Array.isArray(serverInfo.players) ? serverInfo.players.length : 0),
        0,
    );

    if (elements.serverSelect.options[0]) {
        const allLabel = `All Servers (${totalPlayersCount} players)`;
        if (elements.serverSelect.options[0].textContent !== allLabel) {
            elements.serverSelect.options[0].textContent = allLabel;
        }
    }

    const getServerLabel = (jobId) => {
        const name =
            jobId.length > 6
                ? `Server ${jobId.substring(jobId.length - 6)}`
                : `Server ${jobId}`;
        const count = Array.isArray(state.serverData[jobId]?.players)
            ? state.serverData[jobId].players.length
            : 0;
        return `${name} (${count} / 40 players)`;
    };

    const selectedValue = elements.serverSelect.value;

    const existingOptions = Array.from(elements.serverSelect.options).slice(1);
    existingOptions.forEach((option) => {
        if (!state.serverData[option.value]) {
            elements.serverSelect.remove(option.index);
        } else {
            const label = getServerLabel(option.value);
            if (option.textContent !== label) option.textContent = label;
        }
    });

    const existingOptionValues = Array.from(elements.serverSelect.options)
        .slice(1)
        .map((o) => o.value);
    currentServers
        .filter((jobId) => !existingOptionValues.includes(jobId))
        .forEach((jobId) => {
            const option = document.createElement("option");
            option.value = jobId;
            option.textContent = getServerLabel(jobId);
            elements.serverSelect.appendChild(option);
        });

    if (selectedValue !== "all" && !currentServers.includes(selectedValue)) {
        elements.serverSelect.value = "all";
        elements.joinBtn.href = "roblox://experiences/start?placeId=12018816388";
        state.currentServer = "all";
    }
};

const TELEPORT_THRESHOLD = 1500;
const BUFFER_DELAY = 2600;

const getPlayerId = (player) => String(player.userId ?? player.username ?? "unknown");

const getDisplayPosition = (userId, fallback) => {
    const buffer = state.positionBuffer[userId];
    if (!buffer || buffer.length === 0) return fallback;

    const renderTime = Date.now() - BUFFER_DELAY;

    if (renderTime <= buffer[0].t) return { x: buffer[0].x, y: buffer[0].y };
    if (renderTime >= buffer[buffer.length - 1].t) {
        const last = buffer[buffer.length - 1];
        return { x: last.x, y: last.y };
    }

    for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i].t <= renderTime && renderTime < buffer[i + 1].t) {
            const t =
                (renderTime - buffer[i].t) / (buffer[i + 1].t - buffer[i].t);
            return {
                x: buffer[i].x + (buffer[i + 1].x - buffer[i].x) * t,
                y: buffer[i].y + (buffer[i + 1].y - buffer[i].y) * t,
            };
        }
    }

    return fallback;
};

const startAnimationLoop = () => {
    if (state.animationFrameId !== null) return;
    const tick = () => {
        drawScene();
        if (state.getAllPlayers().length > 0) {
            state.animationFrameId = requestAnimationFrame(tick);
        } else {
            state.animationFrameId = null;
        }
    };
    state.animationFrameId = requestAnimationFrame(tick);
};

const TRAIN_PATH = {
    body: new Path2D("M1 1 l10 0 l1 2 l-1 2 l-10 0 Z"),
    hood: new Path2D("M8.5 1 l2 0 l1 2 l-1 2 l-2 0 l1,-2Z"),
    window: new Path2D("M8.5 1 l 1,2 l -1,2"),
    outline: new Path2D("M1 1 l10 0 l1 2 l-1 2 l-10 0 Z"),
};

const FOLLOW_LERP = 0.12;

const drawScene = () => {
    if (state.followMode && state.pinnedPlayer) {
        const allPlayers = state.getAllPlayers();
        const pinnedPlayer = allPlayers.find(
            (p) => p.username === state.pinnedPlayer.username,
        );
        if (pinnedPlayer) {
            const displayPos = getDisplayPosition(
                String(pinnedPlayer.userId),
                pinnedPlayer.position ?? { x: 0, y: 0 },
            );
            const canvasPos = worldToCanvas(displayPos.x, displayPos.y);
            const t = context.getTransform();
            const screenX = canvasPos.x * t.a + canvasPos.y * t.c + t.e;
            const screenY = canvasPos.x * t.b + canvasPos.y * t.d + t.f;
            const dx = (state.viewWidth / 2 - screenX) * FOLLOW_LERP;
            const dy = (state.viewHeight / 2 - screenY) * FOLLOW_LERP;
            if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
                const pt0 = context.transformedPoint(0, 0);
                const pt1 = context.transformedPoint(dx, dy);
                context.translate(pt1.x - pt0.x, pt1.y - pt0.y);
            }
        }
    }

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();

    const mapAspectRatio = MAP_CONFIG.totalWidth / MAP_CONFIG.totalHeight;
    const canvasAspectRatio = state.viewWidth / state.viewHeight;

    const scaleFactor =
        mapAspectRatio > canvasAspectRatio
            ? state.viewWidth / MAP_CONFIG.totalWidth
            : state.viewHeight / MAP_CONFIG.totalHeight;

    const scaledMapWidth = MAP_CONFIG.totalWidth * scaleFactor;
    const scaledMapHeight = MAP_CONFIG.totalHeight * scaleFactor;
    const offsetX = (state.viewWidth - scaledMapWidth) / 2;
    const offsetY = (state.viewHeight - scaledMapHeight) / 2;

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
                    scaledChunkWidth +
                    (column < MAP_CONFIG.columns - 1 ? overlap : 0);
                const drawHeight =
                    scaledChunkHeight +
                    (row < MAP_CONFIG.rows - 1 ? overlap : 0);

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
    elements.players.textContent = `Players: ${playersToShow.length}`;

    const dotScaleFactor = Math.max(0.3, 1 / Math.pow(state.currentScale, 0.4));

    let activePlayerIds = [];
    playersToShow.forEach((player) => {
        const uid = getPlayerId(player);
        activePlayerIds.push(uid);

        const targetPosition = player.position ?? { x: 0, y: 0 };
        const displayPos = getDisplayPosition(uid, targetPosition);
        const worldX = displayPos.x;
        const worldY = displayPos.y;
        const name = player.username ?? "Unknown";

        const canvasPosition = worldToCanvas(worldX, worldY);
        const isPinned = state.pinnedPlayer?.username === name;
        const isHovered = state.hoveredPlayer?.username === name;
        const baseRadius = isPinned || isHovered ? 2.5 : 2;
        const radius = baseRadius * dotScaleFactor;

        if (player.trainData) {
            // derive angle from the buffer segment currently being rendered
            let markerAngle =
                state.previousPlayerPosition[uid]?.angle ?? 0;
            const buf = state.positionBuffer[uid];
            if (buf && buf.length >= 2) {
                const renderTime = Date.now() - BUFFER_DELAY;
                for (let i = 0; i < buf.length - 1; i++) {
                    if (buf[i].t <= renderTime && renderTime < buf[i + 1].t) {
                        const dx = buf[i + 1].x - buf[i].x;
                        const dy = buf[i + 1].y - buf[i].y;
                        // take care of "disco trains" require minimum distance to change angle
                        if (dx * dx + dy * dy > 1) {
                            markerAngle = Math.atan2(dy, dx);
                            if (state.previousPlayerPosition[uid]) {
                                state.previousPlayerPosition[uid].angle = markerAngle;
                            }
                        }
                        break;
                    }
                }
            }

            // DRAW TRAIN
            //  check train.svg. can't access the DOM of a svg within a <img>, but want to be able to dynamically color.
            //  draw the train by hand!
            const trainMarkerDim = { x: 12, y: 6 };
            const trainScale = isPinned || isHovered ? 0.5 : 0.4;
            context.translate(canvasPosition.x, canvasPosition.y);
            context.rotate(markerAngle);
            context.scale(trainScale, trainScale);
            context.translate(-trainMarkerDim.x / 2, -trainMarkerDim.y / 2);
            context.fillStyle = getPlayerColor(name);
            context.fill(TRAIN_PATH.body); // BODY
            context.fillStyle = "#00000020";
            context.fill(TRAIN_PATH.hood); // HOOD
            context.strokeStyle = "#000080";
            context.lineWidth = 1;
            context.stroke(TRAIN_PATH.window); // WINDOW
            context.strokeStyle = isPinned || isHovered ? "white" : "black";
            context.lineWidth = 1;
            context.stroke(TRAIN_PATH.outline); // OUTLINE
            context.translate(trainMarkerDim.x / 2, trainMarkerDim.y / 2);
            context.scale(1 / trainScale, 1 / trainScale);
            context.rotate(-markerAngle);
            context.translate(-canvasPosition.x, -canvasPosition.y);

            state.previousPlayerPosition[uid] = { angle: markerAngle };
        } else {
            context.fillStyle = getPlayerColor(name);
            context.beginPath();
            context.arc(
                canvasPosition.x,
                canvasPosition.y,
                radius,
                0,
                Math.PI * 2,
            );
            context.fill();

            context.strokeStyle = isPinned || isHovered ? "white" : "black";
            context.lineWidth = Math.max(
                (isPinned || isHovered ? 0.7 : 0.4) * scaleFactor,
                0.25,
            );
            context.stroke();
        }

        const teleport = state.playerTeleport[uid];
        if (teleport) {
            const RIPPLE_DURATION = 700;
            const elapsed = Date.now() - teleport.at;
            if (elapsed < RIPPLE_DURATION) {
                const progress = elapsed / RIPPLE_DURATION;
                const rippleRadius = radius * (1 + progress * 5);
                const alpha = (1 - progress) * 0.7;
                context.beginPath();
                context.arc(
                    canvasPosition.x,
                    canvasPosition.y,
                    rippleRadius,
                    0,
                    Math.PI * 2,
                );
                context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                context.lineWidth = Math.max(0.8 * dotScaleFactor, 0.3);
                context.stroke();
            } else {
                delete state.playerTeleport[uid];
            }
        }
    });

    const activeSet = new Set(activePlayerIds);
    Object.keys(state.positionBuffer).forEach((id) => {
        if (!activeSet.has(id)) {
            delete state.previousPlayerPosition[id];
            delete state.positionBuffer[id];
            delete state.playerLastUpdateTime[id];
            delete state.playerTeleport[id];
        }
    });

    // Update tooltip position if a player is pinned
    if (state.pinnedPlayer) {
        const pinnedStillExists = playersToShow.find(
            (p) => p.username === state.pinnedPlayer.username,
        );

        if (pinnedStillExists) {
            updateTooltip(pinnedStillExists, true);
        } else {
            state.pinnedPlayer = null;
            elements.tooltip.classList.add("hidden");
        }
    }

    if (state.currentScale > 300) return;
    const markerFontSize = Math.max(
        0.2,
        10 / Math.pow(state.currentScale, 0.3),
    );
    Object.entries(AREA_MARKERS).forEach(([name, { x, y }]) => {
        const position = worldToCanvas(x, y);
        context.font = `${markerFontSize}px Inter`;

        const metrics = context.measureText(name);
        const textWidth = metrics.width;
        const ascent = metrics.actualBoundingBoxAscent || markerFontSize * 0.8;
        const descent =
            metrics.actualBoundingBoxDescent || markerFontSize * 0.2;
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
        context.fillText(
            name,
            position.x - textWidth / 2,
            boxY + padY + ascent,
        );
    });
};

const getTileUrl = (row, column, quality) => {
    const tileName = `row-${row + 1}-column-${column + 1}`;
    if (quality === "high") return `/images/${tileName}.png?v=1`;
    return `/images/generated/${tileName}-${quality}.webp`;
};

const loadMapImages = () => {
    const loadId = ++state.mapLoadId;
    const needsInit = state.mapImages.length === 0;
    if (needsInit) state.mapImages = [];

    for (let row = 0; row < MAP_CONFIG.rows; row++) {
        if (!state.mapImages[row]) state.mapImages[row] = [];

        for (let column = 0; column < MAP_CONFIG.columns; column++) {
            const image = new Image();
            image.src = getTileUrl(row, column, state.currentQuality);

            image.onload = () => {
                if (loadId !== state.mapLoadId) return;
                state.mapImages[row][column] = image;
                if (needsInit && !state.mapInitialized) {
                    state.mapInitialized = true;
                    initializeMap();
                } else {
                    drawScene();
                }
            };

            image.onerror = () => {
                const highQualityUrl = getTileUrl(row, column, "high");
                if (image.src.endsWith(highQualityUrl)) {
                    console.error(`Failed to load image: ${image.src}`);
                    return;
                }
                console.warn(
                    `Falling back to high quality for row ${row + 1} column ${column + 1}: ${image.src} not ready`,
                );
                image.src = highQualityUrl;
            };
        }
    }
};

const initializeMap = () => {
    resizeCanvas(window.innerWidth, window.innerHeight);

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
        state.dragStartTime = Date.now();
        state.isDragging = true;
        return false;
    });

    canvas.addEventListener("mousemove", (event) => {
        if (state.isDragging) {
            state.followMode = false;
            if (state.hoveredPlayer && !state.pinnedPlayer) {
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
            if (!state.pinnedPlayer) {
                const mousePosition = getCanvasCoordinates(event);
                const player = getPlayerAtPosition(
                    mousePosition.x,
                    mousePosition.y,
                );

                if (player !== state.hoveredPlayer) {
                    state.hoveredPlayer = player;
                    updateTooltip(player, false);
                    drawScene();
                }
            }
        }
    });

    canvas.addEventListener("mouseleave", () => {
        state.isDragging = false;
        state.dragStart = null;

        if (state.hoveredPlayer && !state.pinnedPlayer) {
            state.hoveredPlayer = null;
            elements.tooltip.classList.add("hidden");
            drawScene();
        }
    });

    canvas.addEventListener("mouseup", (event) => {
        const clickDuration = Date.now() - state.dragStartTime;
        const mousePosition = getCanvasCoordinates(event);

        if (clickDuration < 200) {
            const player = getPlayerAtPosition(
                mousePosition.x,
                mousePosition.y,
            );

            if (player) {
                if (state.pinnedPlayer?.username === player.username) {
                    state.pinnedPlayer = null;
                    state.hoveredPlayer = null;
                    state.followMode = false;
                    elements.tooltip.classList.add("hidden");
                } else {
                    state.pinnedPlayer = player;
                    state.hoveredPlayer = null;
                    state.followMode = true;
                    updateTooltip(player, true);
                }
                drawScene();
            } else if (state.pinnedPlayer) {
                // Clicked empty space, unpin
                state.pinnedPlayer = null;
                state.followMode = false;
                elements.tooltip.classList.add("hidden");
                drawScene();
            }
        }

        state.isDragging = false;
        state.dragStart = null;
        state.dragStartTime = null;
    });

    canvas.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const zoomIntensity = 0.1;
            const scale =
                event.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
            const mousePosition = getCanvasCoordinates(event);
            zoomAt(mousePosition.x, mousePosition.y, scale);
        },
        { passive: false },
    );
};

const syncTouchState = (touches) => {
    if (touches.length === 1) {
        const touchPosition = getCanvasCoordinates(touches[0]);
        state.dragStart = context.transformedPoint(
            touchPosition.x,
            touchPosition.y,
        );
        state.isDragging = true;
        state.lastTouchDistance = 0;
    } else if (touches.length === 2) {
        state.isDragging = false;
        state.dragStart = null;
        state.lastTouchDistance = getDistanceBetweenTouches(touches);
    } else {
        state.isDragging = false;
        state.dragStart = null;
        state.lastTouchDistance = 0;
    }
};

const handleZoomButtons = () => {
    const zoomStepIntensity = 1.2;

    elements.zoomInBtn.addEventListener("click", () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(rect.width / 2, rect.height / 2, zoomStepIntensity);
    });

    elements.zoomOutBtn.addEventListener("click", () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(rect.width / 2, rect.height / 2, 1 / zoomStepIntensity);
    });
};

const handleTouchEvents = () => {
    let touchStartTime = null;

    canvas.addEventListener(
        "touchstart",
        (event) => {
            touchStartTime = Date.now();
            syncTouchState(event.touches);
        },
        { passive: false },
    );

    canvas.addEventListener(
        "touchmove",
        (event) => {
            event.preventDefault();

            if (event.touches.length === 1 && state.isDragging) {
                state.followMode = false;
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
        const touchDuration = Date.now() - touchStartTime;

        if (event.touches.length === 0) {
            if (touchDuration < 200 && event.changedTouches.length === 1) {
                const touchPosition = getCanvasCoordinates(
                    event.changedTouches[0],
                );
                const player = getPlayerAtPosition(
                    touchPosition.x,
                    touchPosition.y,
                );

                if (player) {
                    if (state.pinnedPlayer?.username === player.username) {
                        state.pinnedPlayer = null;
                        state.hoveredPlayer = null;
                        state.followMode = false;
                        elements.tooltip.classList.add("hidden");
                    } else {
                        state.pinnedPlayer = player;
                        state.hoveredPlayer = null;
                        state.followMode = true;
                        updateTooltip(player, true);
                    }
                    drawScene();
                } else if (state.pinnedPlayer) {
                    state.pinnedPlayer = null;
                    state.followMode = false;
                    elements.tooltip.classList.add("hidden");
                    drawScene();
                }
            }

            touchStartTime = null;
        }

        syncTouchState(event.touches);
    });
};

elements.serverSelect.addEventListener("change", () => {
    state.currentServer = elements.serverSelect.value;
    drawScene();

    if (elements.serverSelect.value === "all") {
        elements.joinBtn.href =
            "roblox://experiences/start?placeId=12018816388";
    } else {
        elements.joinBtn.href =
            "roblox://experiences/start?placeId=12018816388&gameInstanceId=" +
            encodeURIComponent(elements.serverSelect.value);
    }
});

elements.qualitySelect.value = state.currentQuality;
elements.qualitySelect.addEventListener("change", () => {
    state.currentQuality = elements.qualitySelect.value;
    localStorage.setItem("mapQuality", state.currentQuality);
    loadMapImages();
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
    handleZoomButtons();
    window.addEventListener("resize", handleWindowResize);

    resizeCanvas(window.innerWidth, window.innerHeight);

    drawScene();
    elements.serverSelect.innerHTML =
        '<option value="all">All Servers (0 players)</option>';
    createWebSocket();
    if (window.location !== window.parent.location) {
        // iframe ie wiki main page
        elements.popOutBtn.classList.remove("hidden");
    }
};

start();
