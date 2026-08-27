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
  winnerName: document.getElementById("winnerName"),
  winnerFlagBox: document.getElementById("winnerFlagBox"),
  podiumContainer: document.getElementById("podiumContainer"),
  podium1Name: document.getElementById("podium1Name"),
  podium2Name: document.getElementById("podium2Name"),
  podium3Name: document.getElementById("podium3Name"),
  qualifiedList: document.getElementById("qualifiedList"),
  eliminatedList: document.getElementById("eliminatedList"),
  roundProgressText: document.getElementById("roundProgressText"),
  finalCountdownText: document.getElementById("finalCountdownText"),
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

// ⏱️ মিনিট ও টাইমিং ভেরিয়েবল
let SIMULATION_MINUTES = 5;
let simulationTotalSeconds = 5 * 60;
let simulationStartTime = 0;
let currentCycle = 1;
let cycleHistory = [];
let totalFoodEatenAllCycles = 0;

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 5;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

// 🐍 স্নেক ও গ্রিড লজিক
const GRID_SIZE = 22; // গ্রিড কলাম ও রো সাইজ
let cols = 20, rows = 20;
let cellSize = 16;
let offsetX = 0, offsetY = 0;

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 5, y: 5, emoji: "🍎", type: "normal", points: 1 };
let score = 0;
let cycleFoodCount = 0;
let lastMoveTime = 0;
let moveSpeedMs = 60; // AI স্নেকের চলাচলের স্পিড (ms)
let currentThemeColor = "#00ff66";
let snakePalette = ["#00ff66", "#00d2ff", "#ffd23f", "#ff007f", "#9d4edd"];

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
        gain.gain.setValueAtTime(0.04 * masterVolume, now);
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
      osc.frequency.setValueAtTime(587, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.09);
    } else if (type === "die") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.26);
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
  cycleHistory = [];
  totalFoodEatenAllCycles = 0;
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

  // গ্রিড স্কেলিং হিসাব
  const padding = 16;
  const availW = viewWidth - padding * 2;
  const availH = viewHeight - padding * 2;
  
  cols = 20;
  rows = 24;
  cellSize = Math.floor(Math.min(availW / cols, availH / rows));
  
  offsetX = Math.floor((viewWidth - cols * cellSize) / 2);
  offsetY = Math.floor((viewHeight - rows * cellSize) / 2);
}

// 🐍 নতুন সাইকেল শুরু
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
  nextDirection = { x: 1, y: 0 };
  score = 0;
  cycleFoodCount = 0;
  spawnFood();
  updateUI();
}

function spawnFood() {
  const foodItems = [
    { emoji: "🍎", type: "normal", points: 1 },
    { emoji: "⚡", type: "energy", points: 2 },
    { emoji: "💎", type: "diamond", points: 3 },
    { emoji: "🌟", type: "star", points: 5 }
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

// 🤖 AUTONOMOUS AI (Breadth-First Search + Tail Tracking)
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
        // লেজ ব্যতীত দেহের সাথে সংঘর্ষ এড়িয়ে চলবে
        const isBody = snake.slice(0, -1).some(seg => seg.x === nx && seg.y === ny);
        if (!isBody) {
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny, path: [...curr.path, d] });
        }
      }
    }
  }

  // খাবার পাওয়ার সোজা পথ থাকলে
  if (pathToFood && pathToFood.length > 0) {
    return pathToFood[0];
  }

  // যদি সরাসরি খাবার পৌঁছানো অসম্ভব হয়, তবে নিজের লেজের দিকে এগিয়ে টিকে থাকার চেষ্টা করবে
  const tail = snake[snake.length - 1];
  for (let d of dirs) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      const isBody = snake.slice(0, -1).some(seg => seg.x === nx && seg.y === ny);
      if (!isBody) {
        return d;
      }
    }
  }

  return dirs[0];
}

function logEvent(text) {
  if (!els.eliminatedList) return;
  const row = document.createElement("div");
  row.className = "elim-row";
  row.innerText = text;
  els.eliminatedList.prepend(row);
  if (els.eliminatedList.children.length > 20) {
    els.eliminatedList.removeChild(els.eliminatedList.lastChild);
  }
}

function handleSnakeDeath(reason = "Self Trap") {
  playSound("die");
  logEvent(`💀 Cycle #${currentCycle} End: Length ${snake.length} (${reason})`);
  
  cycleHistory.push({
    cycle: currentCycle,
    score: score,
    length: snake.length,
    food: cycleFoodCount
  });

  currentCycle++;
  renderLeaderboard();

  // রিস্পন ফ্ল্যাশ ও রিস্টার্ট
  setTimeout(() => {
    if (isPlaying) initSnakeCycle();
  }, 800);
}

function updateSnakePhysics() {
  nextDirection = getNextAIMove();
  direction = nextDirection;

  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  // দেয়ালের সাথে বা নিজের দেহে ধাক্কা লাগলে
  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
    handleSnakeDeath("Wall Collision");
    return;
  }

  if (snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
    handleSnakeDeath("Body Collision");
    return;
  }

  snake.unshift(newHead);

  // খাবার খেলে
  if (newHead.x === food.x && newHead.y === food.y) {
    score += food.points * 10;
    cycleFoodCount++;
    totalFoodEatenAllCycles++;
    playSound("eat");
    logEvent(`🍎 Ate ${food.emoji} (+${food.points * 10} pts)`);
    spawnFood();
  } else {
    snake.pop();
  }

  updateUI();
}

function updateUI() {
  if (els.cycleText) els.cycleText.innerText = `#${currentCycle}`;
  if (els.roundProgressText) els.roundProgressText.innerText = `LENGTH: ${snake.length}`;
  if (els.finalCountdownText) els.finalCountdownText.innerText = `TOTAL FOOD: ${totalFoodEatenAllCycles}`;
}

function renderLeaderboard() {
  if (!els.qualifiedList) return;
  const sorted = [...cycleHistory].sort((a, b) => b.score - a.score).slice(0, 5);
  
  let html = sorted.map((run, i) => `
    <div class="board-row">
      <span class="rank">#${i + 1}</span>
      <span class="country-name">Cycle #${run.cycle} (Len: ${run.length})</span>
      <span class="win-count">${run.score} pts</span>
    </div>
  `).join("");

  for (let k = sorted.length; k < 5; k++) {
    html += `<div class="board-row empty-row" style="visibility:hidden;">&nbsp;</div>`;
  }
  els.qualifiedList.innerHTML = html;
}

// 🏁 পুরো টুর্নামেন্ট বা সময় শেষ হলে পোডিয়াম
function endTournament() {
  isPlaying = false;
  stopBGM();

  const sorted = [...cycleHistory].sort((a, b) => b.score - a.score);
  const best = sorted[0] || { score: score, length: snake.length };
  const second = sorted[1] || { score: 0 };
  const third = sorted[2] || { score: 0 };

  if (els.podium1Name) els.podium1Name.innerText = `Score: ${best.score} (Len: ${best.length})`;
  if (els.podium2Name) els.podium2Name.innerText = `Score: ${second.score}`;
  if (els.podium3Name) els.podium3Name.innerText = `Score: ${third.score}`;

  if (els.winnerHeading) els.winnerHeading.innerText = "🏆 SIMULATION FINISHED 🏆";
  if (els.winnerFlagBox) els.winnerFlagBox.classList.add("hidden");
  if (els.winnerName) els.winnerName.classList.add("hidden");
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

// 🎨 প্রধান গেম লুপ
function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  // টাইমার হ্যান্ডলিং
  const elapsed = (Date.now() - simulationStartTime) / 1000;
  const timeLeft = Math.max(0, simulationTotalSeconds - elapsed);
  
  const m = Math.floor(timeLeft / 60);
  const s = Math.floor(timeLeft % 60);
  if (els.timerText) els.timerText.innerText = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

  if (timeLeft <= 0) {
    endTournament();
    return;
  }

  // ফিজিক্স আপডেট
  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  // রেন্ডারিং
  ctx.fillStyle = "#020c06";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // ১. গ্রিড বোর্ড ব্যাকগ্রাউন্ড
  ctx.fillStyle = "rgba(6, 32, 20, 0.4)";
  ctx.fillRect(offsetX, offsetY, cols * cellSize, rows * cellSize);
  ctx.strokeStyle = "rgba(0, 255, 102, 0.15)";
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

  // ২. খাবার রেন্ডার
  ctx.font = `${cellSize - 2}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    food.emoji,
    offsetX + food.x * cellSize + cellSize / 2,
    offsetY + food.y * cellSize + cellSize / 2
  );

  // ৩. স্নেক বডি রেন্ডার (গ্লো ইফেক্ট সহ)
  snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#ffffff" : currentThemeColor;
    const px = offsetX + seg.x * cellSize + 2;
    const py = offsetY + seg.y * cellSize + 2;
    const sz = cellSize - 4;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px, py, sz, sz, i === 0 ? 6 : 4);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, sz, sz);
    }
  });

  requestAnimationFrame(gameLoop);
}

// গ্লোবাল ফাংশন
window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;

document.addEventListener("click", unlockAudio);
document.addEventListener("touchstart", unlockAudio);
