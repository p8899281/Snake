const canvas = document.getElementById("arena");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;

const confettiCanvas = document.getElementById("confettiCanvas");
const confettiCtx = confettiCanvas ? confettiCanvas.getContext("2d") : null;

const els = {
  app: document.getElementById("app"),
  modeSelector: document.getElementById("mode-selector"),
  startScreen: document.getElementById("start-screen"),
  winnerOverlay: document.getElementById("winnerOverlay"),
  winnerHeading: document.getElementById("winnerHeading"),
  winnerFlagBox: document.getElementById("winnerFlagBox"),
  podiumContainer: document.getElementById("podiumContainer"),
  podium1Name: document.getElementById("podium1Name"),
  podium2Name: document.getElementById("podium2Name"),
  podium3Name: document.getElementById("podium3Name"),
  liveLength: document.getElementById("liveLength"),
  liveFood: document.getElementById("liveFood"),
  prevLength: document.getElementById("prevLength"),
  prevFood: document.getElementById("prevFood"),
  prevDeathReason: document.getElementById("prevDeathReason"),
  bestLength: document.getElementById("bestLength"),
  bestFood: document.getElementById("bestFood"),
  totalDeathsText: document.getElementById("totalDeathsText"),
  totalFoodEatenText: document.getElementById("totalFoodEatenText"),
  timerText: document.getElementById("timerText"),
  cycleText: document.getElementById("cycleText"),
  bgmSelect: document.getElementById("bgmSelect"),
  customMusicInputWrapper: document.getElementById("customMusicInputWrapper"),
  customBgmUrl: document.getElementById("customBgmUrl"),
  volumeSlider: document.getElementById("volumeSlider"),
  volumeValueText: document.getElementById("volumeValueText")
};

let viewWidth = 0, viewHeight = 0, dpr = 1;
let isPlaying = false;
let selectedDeviceMode = 'mobile';
let resizeListenerAttached = false;

// ⏱️ টাইমিং ভেরিয়েবল
let SIMULATION_MINUTES = 5;
let simulationTotalSeconds = 5 * 60;
let simulationStartTime = 0;
let currentCycle = 1;
let totalDeaths = 0;
let sessionTotalFood = 0;

// 📊 রেকর্ড ট্র্যাকিং স্টেট
let bestStats = { length: 3, food: 0 };
let lastDeathStats = { length: null, food: null, cycle: null, reason: "" };

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 5;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

// 🐍 স্নেক ও গ্রিড কনফিগারেশন
let cols = 20, rows = 24;
let cellSize = 16;
let offsetX = 0, offsetY = 0;

let snake = [];
let direction = { x: 1, y: 0 };
let food = { x: 5, y: 5, emoji: "🍎", points: 1 };
let currentRunFood = 0;
let lastMoveTime = 0;
let moveSpeedMs = 55; // স্মুথ ও ফাস্ট AI মুভমেন্ট
let currentThemeColor = "#00ff66";
const snakePalette = ["#00ff66", "#00d2ff", "#ffd23f", "#ff007f", "#9d4edd", "#ff8800"];

// 🎵 AUDIO SYSTEM
let audioCtx = null;
let masterVolume = 0.85;
const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

function handleBgmSelectChange() {
  const selected = els.bgmSelect ? els.bgmSelect.value : 'cyber';
  if (els.customMusicInputWrapper) {
    if (selected === 'custom') els.customMusicInputWrapper.classList.remove('hidden');
    else els.customMusicInputWrapper.classList.add('hidden');
  }
  if (isPlaying) startBGM();
}

function changeVolume(val) {
  masterVolume = parseFloat(val) || 0.85;
  customAudioPlayer.volume = masterVolume;
  if (els.volumeValueText) els.volumeValueText.innerText = `${Math.round(masterVolume * 100)}%`;
}

let bgmInterval = null;
let bgmStep = 0;
const musicNotes = [220, 261.63, 293.66, 349.23, 440, 349.23, 293.66, 261.63];

function startBGM() {
  stopBGM();
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'cyber';

  if (selectedType === 'custom') {
    let url = els.customBgmUrl ? els.customBgmUrl.value.trim() : '';
    if (url) {
      customAudioPlayer.src = url;
      customAudioPlayer.volume = masterVolume;
      customAudioPlayer.play().catch(() => {});
    }
  } else {
    bgmStep = 0;
    bgmInterval = setInterval(() => {
      if (!audioCtx || !isPlaying) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(musicNotes[bgmStep % musicNotes.length], now);
        gain.gain.setValueAtTime(0.035 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
        bgmStep++;
      } catch (e) {}
    }, 120);
  }
}

function stopBGM() {
  try { customAudioPlayer.pause(); } catch (e) {}
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

function playSound(type) {
  if (!audioCtx || !isPlaying) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === "eat") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);
      gain.gain.setValueAtTime(0.12 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.09);
    } else if (type === "die") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.28);
      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.29);
    }
  } catch (e) {}
}

function selectMode(mode) {
  selectedDeviceMode = mode;
  document.body.classList.remove('mobile-mode', 'tablet-mode', 'pc-mode');
  document.body.classList.add(mode + '-mode');
  if (els.modeSelector) els.modeSelector.classList.add("hidden");
  if (els.startScreen) els.startScreen.classList.remove("hidden");
}

function beginBattle() {
  unlockAudio();
  if (els.startScreen) els.startScreen.classList.add("hidden");
  if (els.app) els.app.classList.remove("hidden");
  
  resizeCanvas();
  if (!resizeListenerAttached) {
    window.addEventListener("resize", resizeCanvas);
    resizeListenerAttached = true;
  }
  
  currentCycle = 1;
  totalDeaths = 0;
  sessionTotalFood = 0;
  bestStats = { length: 3, food: 0 };
  lastDeathStats = { length: null, food: null, cycle: null, reason: "" };
  simulationStartTime = Date.now();
  
  initSnakeCycle();
  isPlaying = true;
  startBGM();
  requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  viewWidth = rect.width;
  viewHeight = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  if (confettiCanvas) {
    confettiCanvas.width = Math.floor(viewWidth * dpr);
    confettiCanvas.height = Math.floor(viewHeight * dpr);
  }
  
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  if (confettiCtx) {
    confettiCtx.resetTransform();
    confettiCtx.scale(dpr, dpr);
  }

  const padding = 12;
  const availW = viewWidth - padding * 2;
  const availH = viewHeight - padding * 2;
  
  cols = 20;
  rows = 24;
  cellSize = Math.floor(Math.min(availW / cols, availH / rows));
  
  offsetX = Math.floor((viewWidth - cols * cellSize) / 2);
  offsetY = Math.floor((viewHeight - rows * cellSize) / 2);
}

function initSnakeCycle() {
  currentThemeColor = snakePalette[(currentCycle - 1) % snakePalette.length];
  const startX = Math.floor(cols / 2);
  const startY = Math.floor(rows / 2);
  
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  
  direction = { x: 1, y: 0 };
  currentRunFood = 0;
  spawnFood();
  updateUI();
}

function spawnFood() {
  const foodItems = [
    { emoji: "🍎", points: 1 },
    { emoji: "🍇", points: 1 },
    { emoji: "⚡", points: 1 },
    { emoji: "💎", points: 1 },
    { emoji: "🌟", points: 1 }
  ];
  
  const chosen = foodItems[Math.floor(Math.random() * foodItems.length)];
  let emptyCells = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!snake.some(seg => seg.x === c && seg.y === r)) {
        emptyCells.push({ x: c, y: r });
      }
    }
  }

  if (emptyCells.length === 0) return;
  const randPos = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  food = { x: randPos.x, y: randPos.y, ...chosen };
}

// 🤖 AUTONOMOUS AI (Smart BFS Pathfinding + Self-Trap Avoidance)
function getNextAIMove() {
  const head = snake[0];
  const queue = [{ x: head.x, y: head.y, path: [] }];
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  visited[head.y][head.x] = true;

  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  let pathToFood = null;

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.x === food.x && curr.y === food.y) {
      pathToFood = curr.path;
      break;
    }

    for (let d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;

      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) {
        const isBody = snake.slice(0, -1).some(seg => seg.x === nx && seg.y === ny);
        if (!isBody) {
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny, path: [...curr.path, d] });
        }
      }
    }
  }

  if (pathToFood && pathToFood.length > 0) {
    return pathToFood[0];
  }

  // যদি সরাসরি খাদ্য না পায়, তবে লেজ অনুসরন করে দীর্ঘক্ষণ বেঁচে থাকার চেষ্টা করবে
  for (let d of dirs) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      const isBody = snake.slice(0, -1).some(seg => seg.x === nx && seg.y === ny);
      if (!isBody) return d;
    }
  }

  return dirs[0];
}

function handleSnakeDeath(reason = "Self Trap") {
  playSound("die");
  totalDeaths++;

  // 🔴 আগের রাউন্ডের ডাটা বড় বড় করে দেখানোর জন্য সেভ করা
  lastDeathStats = {
    length: snake.length,
    food: currentRunFood,
    cycle: currentCycle,
    reason: reason
  };

  // 👑 বেস্ট রেকর্ড আপডেট
  if (snake.length > bestStats.length) bestStats.length = snake.length;
  if (currentRunFood > bestStats.food) bestStats.food = currentRunFood;

  currentCycle++;
  updateUI();

  // রিস্পন ফ্ল্যাশ
  setTimeout(() => {
    if (isPlaying) initSnakeCycle();
  }, 700);
}

function updateSnakePhysics() {
  direction = getNextAIMove();
  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  // দেয়ালে ধাক্কা লাগলে
  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
    handleSnakeDeath("Wall Collision");
    return;
  }

  // নিজের দেহে আটকে গেলে
  if (snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
    handleSnakeDeath("Body Collision");
    return;
  }

  snake.unshift(newHead);

  // খাবার গ্রহণ
  if (newHead.x === food.x && newHead.y === food.y) {
    currentRunFood++;
    sessionTotalFood++;
    playSound("eat");
    spawnFood();
  } else {
    snake.pop();
  }

  // লাইভ রেকর্ড আপডেট
  if (snake.length > bestStats.length) bestStats.length = snake.length;
  if (currentRunFood > bestStats.food) bestStats.food = currentRunFood;

  updateUI();
}

function updateUI() {
  if (els.cycleText) els.cycleText.innerText = `#${currentCycle}`;
  
  // 🟢 লাইভ রান
  if (els.liveLength) els.liveLength.innerText = snake.length;
  if (els.liveFood) els.liveFood.innerText = currentRunFood;

  // 🔴 আগের রাউন্ডে কত লেন্থ ও খাবার খেয়ে মারা গিয়েছিল (বড় করে)
  if (lastDeathStats.length !== null) {
    if (els.prevLength) els.prevLength.innerText = lastDeathStats.length;
    if (els.prevFood) els.prevFood.innerText = lastDeathStats.food;
    if (els.prevDeathReason) {
      els.prevDeathReason.innerText = `Cycle #${lastDeathStats.cycle} died due to ${lastDeathStats.reason}`;
    }
  }

  // 👑 বেস্ট রান
  if (els.bestLength) els.bestLength.innerText = bestStats.length;
  if (els.bestFood) els.bestFood.innerText = bestStats.food;

  // ফুটার
  if (els.totalDeathsText) els.totalDeathsText.innerText = `RESPAWNS: ${totalDeaths}`;
  if (els.totalFoodEatenText) els.totalFoodEatenText.innerText = `SESSION FOOD: ${sessionTotalFood}`;
}

function endTournament() {
  isPlaying = false;
  stopBGM();

  if (els.podium1Name) els.podium1Name.innerText = `Max Length: ${bestStats.length} | Max Food: ${bestStats.food}`;
  if (els.podium2Name) els.podium2Name.innerText = `${totalDeaths} Total Deaths`;
  if (els.podium3Name) els.podium3Name.innerText = `${sessionTotalFood} Fruits Eaten`;

  if (els.winnerHeading) els.winnerHeading.innerText = "🏆 SIMULATION TIME OVER 🏆";
  if (els.winnerFlagBox) els.winnerFlagBox.innerText = "👑";
  if (els.podiumContainer) els.podiumContainer.classList.remove("hidden");
  if (els.winnerOverlay) els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  if (els.winnerOverlay) els.winnerOverlay.classList.add("hidden");
  if (els.podiumContainer) els.podiumContainer.classList.add("hidden");
  if (els.app) els.app.classList.add("hidden");
  if (els.startScreen) els.startScreen.classList.remove("hidden");
  isPlaying = false;
}

function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  const elapsed = (Date.now() - simulationStartTime) / 1000;
  const timeLeft = Math.max(0, simulationTotalSeconds - elapsed);
  
  const m = Math.floor(timeLeft / 60);
  const s = Math.floor(timeLeft % 60);
  if (els.timerText) els.timerText.innerText = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

  if (timeLeft <= 0) {
    endTournament();
    return;
  }

  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  // ক্যানভাস রেন্ডারিং
  ctx.fillStyle = "#020c06";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // গ্রিড ব্যাকগ্রাউন্ড
  ctx.fillStyle = "rgba(6, 32, 20, 0.4)";
  ctx.fillRect(offsetX, offsetY, cols * cellSize, rows * cellSize);
  ctx.strokeStyle = "rgba(0, 255, 102, 0.12)";
  ctx.lineWidth = 1;

  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + c * cellSize, offsetY);
    ctx.lineTo(offsetX + c * cellSize, offsetY + rows * cellSize);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + r * cellSize);
    ctx.lineTo(offsetX + cols * cellSize, offsetY + r * cellSize);
    ctx.stroke();
  }

  // খাবার রেন্ডার
  ctx.font = `${cellSize - 2}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    food.emoji,
    offsetX + food.x * cellSize + cellSize / 2,
    offsetY + food.y * cellSize + cellSize / 2
  );

  // স্নেক রেন্ডার
  snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#ffffff" : currentThemeColor;
    const px = offsetX + seg.x * cellSize + 2;
    const py = offsetY + seg.y * cellSize + 2;
    const sz = cellSize - 4;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px, py, sz, sz, i === 0 ? 6 : 3);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, sz, sz);
    }
  });

  requestAnimationFrame(gameLoop);
}

// উইন্ডো ফাংশনস
window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;

document.addEventListener("click", unlockAudio);
document.addEventListener("touchstart", unlockAudio);
