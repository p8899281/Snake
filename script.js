const canvas = document.getElementById("arena");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;

const els = {
  app: document.getElementById("app"),
  modeSelector: document.getElementById("mode-selector"),
  startScreen: document.getElementById("start-screen"),
  winnerOverlay: document.getElementById("winnerOverlay"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  goScoreVal: document.getElementById("goScoreVal"),
  podium1Name: document.getElementById("podium1Name"),
  topFoodCount: document.getElementById("topFoodCount"),
  topBestCount: document.getElementById("topBestCount"),
  bgmSelect: document.getElementById("bgmSelect"),
  volumeSlider: document.getElementById("volumeSlider"),
  fullscreenToggle: document.getElementById("fullscreenToggle")
};

let viewWidth = 0, viewHeight = 0;
let isPlaying = false;
let isRespawning = false;
let selectedDeviceMode = 'mobile';

let SIMULATION_MINUTES = 5;
let simulationTotalSeconds = 5 * 60;
let simulationStartTime = 0;

let currentRunFood = 0;
let maxFoodSingleRun = 0;

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 5;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

// 🟩 পারফেক্ট গ্রিড কনফিগারেশন (12x12 Layout)
const GRID_SIZE = 12;
let cols = GRID_SIZE, rows = GRID_SIZE;
let cellSize = 24;
let offsetX = 0, offsetY = 0;
let squareArenaSize = 0;

let snake = [];
let direction = { x: 1, y: 0 };
let food = { x: 8, y: 4, emoji: "🍎" };
let lastMoveTime = 0;
let moveSpeedMs = 110;

// -------------------------------------------------------------
// 🧠 HAMILTONIAN CYCLE LOOKUP TABLE (100% UNBEATABLE SAFETY)
// -------------------------------------------------------------
const H_GRID = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

function buildHamiltonianCycle() {
  let idx = 0;
  // Row 0: (0,0) -> (11,0)
  for (let x = 0; x < GRID_SIZE; x++) {
    H_GRID[0][x] = idx++;
  }
  // Rows 1 to 11
  for (let y = 1; y < GRID_SIZE; y++) {
    if (y % 2 === 1) {
      for (let x = GRID_SIZE - 1; x >= 1; x--) {
        H_GRID[y][x] = idx++;
      }
      if (y === GRID_SIZE - 1) {
        H_GRID[GRID_SIZE - 1][0] = idx++;
      }
    } else {
      for (let x = 1; x < GRID_SIZE; x++) {
        H_GRID[y][x] = idx++;
      }
    }
  }
  // Left column return path
  for (let y = GRID_SIZE - 2; y >= 1; y--) {
    H_GRID[y][0] = idx++;
  }
}
buildHamiltonianCycle();

// 🔊 অডিও সিস্টেম
let audioCtx = null;
let masterVolume = 0.85;
const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

function initAudioEngine() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function handleBgmSelectChange() {
  if (isPlaying) startBGM();
}

function changeVolume(val) {
  masterVolume = parseFloat(val) || 0.85;
  customAudioPlayer.volume = masterVolume;
}

let bgmInterval = null;
let bgmStep = 0;
const googleMelody = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];

function startBGM() {
  stopBGM();
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'google';

  if (selectedType === 'custom') {
    let url = document.getElementById("customBgmUrl").value.trim();
    if (url) {
      customAudioPlayer.src = url;
      customAudioPlayer.volume = masterVolume;
      customAudioPlayer.play().catch(() => {});
    }
  } else {
    bgmStep = 0;
    bgmInterval = setInterval(() => {
      if (!audioCtx || !isPlaying || isRespawning) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(googleMelody[bgmStep % googleMelody.length], now);
        gain.gain.setValueAtTime(0.035 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
        bgmStep++;
      } catch (e) {}
    }, 180);
  }
}

function stopBGM() {
  customAudioPlayer.pause();
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

function playSound(type) {
  if (!audioCtx || audioCtx.state !== 'running' || !isPlaying) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === "eat") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.07);
      gain.gain.setValueAtTime(0.18 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else if (type === "die") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
      gain.gain.setValueAtTime(0.26 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    }
    
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    osc.start(now); 
    osc.stop(now + 0.36);
  } catch (e) {}
}

async function triggerFullscreen() {
  const docEl = document.documentElement;
  try {
    if (docEl.requestFullscreen) await docEl.requestFullscreen();
    else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
    else if (docEl.mozRequestFullScreen) await docEl.mozRequestFullScreen();
    else if (docEl.msRequestFullscreen) await docEl.msRequestFullscreen();
  } catch (err) {}
}

function selectMode(mode) {
  selectedDeviceMode = mode;
  document.body.classList.remove('mobile-mode', 'tablet-mode', 'pc-mode');
  document.body.classList.add(mode + '-mode');
  els.modeSelector.classList.add("hidden");
  els.startScreen.classList.remove("hidden");
}

function beginBattle() {
  initAudioEngine();
  
  if (els.fullscreenToggle && els.fullscreenToggle.checked) {
    triggerFullscreen();
  }

  els.startScreen.classList.add("hidden");
  els.app.classList.remove("hidden");
  
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  
  simulationStartTime = Date.now();
  currentRunFood = 0;
  maxFoodSingleRun = 0;
  isRespawning = false;
  
  initSnakeCycle();
  isPlaying = true;
  startBGM();
  requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  
  if (selectedDeviceMode === 'mobile' || selectedDeviceMode === 'tablet') {
    canvas.width = 1080;
    canvas.height = 1080;
  } else {
    const minD = Math.min(rect.width, rect.height) * (window.devicePixelRatio || 1.5);
    canvas.width = minD;
    canvas.height = minD;
  }

  viewWidth = canvas.width;
  viewHeight = canvas.height;

  cellSize = Math.floor(viewWidth / GRID_SIZE);
  squareArenaSize = cellSize * GRID_SIZE;

  offsetX = Math.floor((viewWidth - squareArenaSize) / 2);
  offsetY = Math.floor((viewHeight - squareArenaSize) / 2);
}

// 🔄 ছোট সাইজ দিয়ে নতুন শুরু
function initSnakeCycle() {
  const startX = 3;
  const startY = 0;
  
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  
  direction = { x: 1, y: 0 };
  currentRunFood = 0;
  spawnFood();
  updateHUD();
}

function spawnFood() {
  const foodEmojis = ["🍎", "🌶️", "🍇", "🌟"];
  const chosenEmoji = foodEmojis[Math.floor(Math.random() * foodEmojis.length)];
  
  let emptyCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!snake.some(seg => seg.x === c && seg.y === r)) emptyCells.push({ x: c, y: r });
    }
  }
  if (emptyCells.length > 0) {
    const pos = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    food = { x: pos.x, y: pos.y, emoji: chosenEmoji };
  }
}

// 🤖 SMART HAMILTONIAN CYCLE + SHORTCUT HUNTING AI
const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

function cycleDist(a, b) {
  return (b - a + TOTAL_CELLS) % TOTAL_CELLS;
}

function getNextAIMove() {
  const head = snake[0];
  const tail = snake[snake.length - 1];
  const headIdx = H_GRID[head.y][head.x];
  const tailIdx = H_GRID[tail.y][tail.x];
  const foodIdx = H_GRID[food.y][food.x];

  const distHeadToTail = cycleDist(headIdx, tailIdx);
  const distHeadToFood = cycleDist(headIdx, foodIdx);

  // বৈধ মুভ খুঁজে বের করা
  const candidates = [];
  for (const d of DIRS) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      if (!snake.slice(0, -1).some(seg => seg.x === nx && seg.y === ny)) {
        candidates.push({ dir: d, nextPos: { x: nx, y: ny }, nextIdx: H_GRID[ny][nx] });
      }
    }
  }

  if (candidates.length === 0) return direction;

  // মূল হ্যামিল্টোনিয়ান চাল
  const hamiltonianNextIdx = (headIdx + 1) % TOTAL_CELLS;
  let hamiltonianStep = candidates.find(c => c.nextIdx === hamiltonianNextIdx);

  // সাপ বড় হয়ে গেলে (৭০% গ্রিড পূর্ণ হলে) ১০০% সুরক্ষার জন্য শুধু সাইকেল অনুসরণ করবে
  if (snake.length > TOTAL_CELLS * 0.70 && hamiltonianStep) {
    return hamiltonianStep.dir;
  }

  // নিরাপদ শর্টকাট পরীক্ষা (যা লেজকে ওভারটেক না করে খাবারের পথ কমাবে)
  let bestShortcut = null;
  let minFoodDist = distHeadToFood;
  const safetyBuffer = Math.max(3, Math.floor(snake.length * 0.2));

  for (const cand of candidates) {
    const distHeadToNext = cycleDist(headIdx, cand.nextIdx);
    const distNextToFood = cycleDist(cand.nextIdx, foodIdx);

    if (distHeadToNext > 0 && distHeadToNext < distHeadToTail - safetyBuffer) {
      if (distNextToFood < minFoodDist) {
        minFoodDist = distNextToFood;
        bestShortcut = cand;
      }
    }
  }

  if (bestShortcut) {
    return bestShortcut.dir;
  }

  if (hamiltonianStep) {
    return hamiltonianStep.dir;
  }

  return candidates[0].dir;
}

// 💀 ২.৫ সেকেন্ড 'GAME OVER' পজ ও রিস্টার্ট
function handleSnakeDeath() {
  if (isRespawning) return;
  isRespawning = true;
  
  playSound("die");
  
  if (currentRunFood > maxFoodSingleRun) {
    maxFoodSingleRun = currentRunFood;
  }
  updateHUD();

  if (els.goScoreVal) els.goScoreVal.innerText = currentRunFood;
  if (els.gameOverOverlay) els.gameOverOverlay.classList.remove("hidden");

  setTimeout(() => {
    if (els.gameOverOverlay) els.gameOverOverlay.classList.add("hidden");
    if (isPlaying) {
      initSnakeCycle();
      isRespawning = false;
    }
  }, 2500);
}

function updateSnakePhysics() {
  if (isRespawning) return;

  direction = getNextAIMove();
  const newHead = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows || snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
    handleSnakeDeath();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    currentRunFood++;
    if (currentRunFood > maxFoodSingleRun) {
      maxFoodSingleRun = currentRunFood;
    }
    playSound("eat");
    spawnFood();
  } else {
    snake.pop();
  }

  updateHUD();
}

function updateHUD() {
  els.topFoodCount.innerText = currentRunFood;
  els.topBestCount.innerText = maxFoodSingleRun;
}

function endTournament() {
  isPlaying = false;
  stopBGM();
  if (els.podium1Name) els.podium1Name.innerText = `${maxFoodSingleRun} Foods Collected`;
  if (els.winnerOverlay) els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  if (els.winnerOverlay) els.winnerOverlay.classList.add("hidden");
  if (els.app) els.app.classList.add("hidden");
  if (els.startScreen) els.startScreen.classList.remove("hidden");
  isPlaying = false;
  isRespawning = false;
}

// 🎨 রেন্ডারিং
function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  const elapsed = (Date.now() - simulationStartTime) / 1000;
  if (simulationTotalSeconds - elapsed <= 0) { 
    endTournament(); 
    return; 
  }

  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  ctx.fillStyle = "#4a752c";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // ১. ডুয়াল গ্রিন গ্রাস
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#8ad44a" : "#7ec841";
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }

  // ২. খাদ্য
  const fx = offsetX + food.x * cellSize + cellSize / 2;
  const fy = offsetY + food.y * cellSize + cellSize / 2;
  ctx.font = `${Math.floor(cellSize * 0.85)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(food.emoji, fx, fy);

  // ৩. ব্লু রিবন স্নেক বডি
  if (snake.length > 1) {
    const strokeW = cellSize * 0.76;

    ctx.beginPath();
    ctx.strokeStyle = "#2b56bf";
    ctx.lineWidth = strokeW + 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < snake.length; i++) {
      const px = offsetX + snake[i].x * cellSize + cellSize / 2;
      const py = offsetY + snake[i].y * cellSize + cellSize / 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#3f78fc";
    ctx.lineWidth = strokeW;
    ctx.stroke();
  }

  // ৪. হেড ও চোখ
  const head = snake[0];
  const hx = offsetX + head.x * cellSize + cellSize / 2;
  const hy = offsetY + head.y * cellSize + cellSize / 2;

  ctx.fillStyle = "#3f78fc";
  ctx.beginPath();
  ctx.arc(hx, hy, cellSize * 0.42, 0, Math.PI * 2);
  ctx.fill();

  const eyeR = cellSize * 0.16;
  const pupilR = cellSize * 0.08;
  let lx = hx, ly = hy, rx = hx, ry = hy;

  if (direction.x === 1) {
    lx = hx + 4; ly = hy - 6; rx = hx + 4; ry = hy + 6;
  } else if (direction.x === -1) {
    lx = hx - 4; ly = hy - 6; rx = hx - 4; ry = hy + 6;
  } else if (direction.y === 1) {
    lx = hx - 6; ly = hy + 4; rx = hx + 6; ry = hy + 4;
  } else {
    lx = hx - 6; ly = hy - 4; rx = hx + 6; ry = hy - 4;
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(lx, ly, eyeR, 0, Math.PI * 2);
  ctx.arc(rx, ry, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a1944";
  ctx.beginPath();
  ctx.arc(lx + direction.x * 1.5, ly + direction.y * 1.5, pupilR, 0, Math.PI * 2);
  ctx.arc(rx + direction.x * 1.5, ry + direction.y * 1.5, pupilR, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(gameLoop);
}

window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;
