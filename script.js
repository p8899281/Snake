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
  volumeValueText: document.getElementById("volumeValueText"),
  fullscreenToggle: document.getElementById("fullscreenToggle")
};

let viewWidth = 0, viewHeight = 0;
let isPlaying = false;
let isRespawning = false;
let selectedDeviceMode = 'mobile';

// ⏱️ ডিউরেশন স্টেট
let SIMULATION_MINUTES = 15;
let simulationTotalSeconds = 15 * 60;
let simulationStartTime = 0;

let currentRunFood = 0;
let maxFoodSingleRun = 0;

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 15;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

// 🟩 গ্রিড কনফিগারেশন (12x12 Layout)
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

// 🧠 HAMILTONIAN CYCLE LOOKUP TABLE
const H_GRID = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

function buildHamiltonianCycle() {
  let idx = 0;
  for (let x = 0; x < GRID_SIZE; x++) {
    H_GRID[0][x] = idx++;
  }
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
  for (let y = GRID_SIZE - 2; y >= 1; y--) {
    H_GRID[y][0] = idx++;
  }
}
buildHamiltonianCycle();

// 🔊 অডিও সিস্টেম
let audioCtx = null;
let masterGainNode = null;
let masterVolume = 0.85;
const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

function initAudioEngine() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
    masterGainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function handleBgmSelectChange() {
  const selected = els.bgmSelect ? els.bgmSelect.value : 'google_original';
  const customWrapper = document.getElementById("customMusicInputWrapper");
  if (customWrapper) {
    if (selected === 'custom') {
      customWrapper.classList.remove('hidden');
    } else {
      customWrapper.classList.add('hidden');
    }
  }
  if (isPlaying) {
    startBGM();
  }
}

function changeVolume(val) {
  masterVolume = parseFloat(val);
  if (isNaN(masterVolume)) masterVolume = 0.85;
  
  if (els.volumeValueText) {
    els.volumeValueText.innerText = `${Math.round(masterVolume * 100)}%`;
  }
  
  if (masterGainNode && audioCtx) {
    masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
  }
  
  if (customAudioPlayer) {
    customAudioPlayer.volume = masterVolume;
  }
}

let bgmInterval = null;
let bgmStep = 0;

const musicTracks = {
  google_original: {
    notes: [523.25, 659.25, 783.99, 1046.50, 880.00, 783.99, 659.25, 587.33, 523.25, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 493.88],
    bass: [130.81, 130.81, 164.81, 164.81, 174.61, 174.61, 196.00, 196.00],
    speed: 130,
    type: "triangle"
  },
  google: {
    notes: [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25],
    bass: [261.63, 261.63, 196.00, 196.00],
    speed: 160,
    type: "sine"
  },
  cyber: {
    notes: [220, 261.63, 293.66, 349.23, 440, 349.23, 293.66, 261.63],
    bass: [55, 55, 65.41, 73.42],
    speed: 130,
    type: "sawtooth"
  },
  synth: {
    notes: [440, 523.25, 659.25, 587.33, 523.25, 392, 440, 659.25],
    bass: [110, 110, 130.81, 98],
    speed: 150,
    type: "sine"
  }
};

function startBGM() {
  stopBGM();
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'google_original';

  if (selectedType === 'custom') {
    let url = document.getElementById("customBgmUrl").value.trim();
    if (url) {
      customAudioPlayer.src = url;
      customAudioPlayer.volume = masterVolume;
      customAudioPlayer.play().catch(() => {});
    }
  } else {
    const track = musicTracks[selectedType] || musicTracks.google_original;
    bgmStep = 0;
    
    bgmInterval = setInterval(() => {
      if (!audioCtx || !isPlaying || isRespawning) return;
      try {
        const now = audioCtx.currentTime;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const freq = track.notes[bgmStep % track.notes.length];

        osc.type = track.type;
        osc.frequency.setValueAtTime(freq, now);

        const vol = (track.type === "sawtooth") ? 0.03 : 0.05;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(gain);
        gain.connect(masterGainNode);
        osc.start(now);
        osc.stop(now + 0.13);

        if (track.bass && bgmStep % 2 === 0) {
          const bassOsc = audioCtx.createOscillator();
          const bassGain = audioCtx.createGain();
          const bFreq = track.bass[Math.floor(bgmStep / 2) % track.bass.length];

          bassOsc.type = "sine";
          bassOsc.frequency.setValueAtTime(bFreq, now);
          bassGain.gain.setValueAtTime(0.08, now);
          bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

          bassOsc.connect(bassGain);
          bassGain.connect(masterGainNode);
          bassOsc.start(now);
          bassOsc.stop(now + 0.24);
        }

        bgmStep++;
      } catch (e) {}
    }, track.speed);
  }
}

function stopBGM() {
  try { customAudioPlayer.pause(); } catch (e) {}
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// 🔊 সাউন্ড এফেক্টস (খাবার খাওয়া, বাঁক নেওয়া ও মৃত্যু)
function playSound(type) {
  if (!audioCtx || audioCtx.state !== 'running' || !isPlaying) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === "turn") {
      // 🔄 বাঁক নেওয়ার সময় হালকা সুইশ/ক্লিক সাউন্ড
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.028);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      
      osc.connect(gain);
      gain.connect(masterGainNode);
      osc.start(now);
      osc.stop(now + 0.03);
    } else if (type === "eat") {
      // 🍎 খাবার খাওয়ার পপ সাউন্ড
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08);
      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(gain);
      gain.connect(masterGainNode);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === "die") {
      // 💀 মৃত্যুর থাড সাউন্ড
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.32);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      
      osc.connect(gain);
      gain.connect(masterGainNode);
      osc.start(now);
      osc.stop(now + 0.33);
    }
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

  const hamiltonianNextIdx = (headIdx + 1) % TOTAL_CELLS;
  let hamiltonianStep = candidates.find(c => c.nextIdx === hamiltonianNextIdx);

  if (snake.length > TOTAL_CELLS * 0.70 && hamiltonianStep) {
    return hamiltonianStep.dir;
  }

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

  const nextDir = getNextAIMove();

  // 🔄 দিক পরিবর্তন করলে টার্নিং সাউন্ড বাজবে
  if (nextDir.x !== direction.x || nextDir.y !== direction.y) {
    playSound("turn");
  }
  direction = nextDir;

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

// 🎨 রেন্ডারিং (পেছনের দিকে ক্রমশ সরু হওয়া পাতলা লেজ সহ)
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

  // ৩. ব্লু রিবন স্নেক বডি (লেজের দিকে ক্রমশ পাতলা ও টেপার্ড)
  if (snake.length > 1) {
    // লেয়ার ১: ডার্ক ব্লু শ্যাডো বর্ডার (লেজের দিকে সরু)
    for (let i = snake.length - 2; i >= 0; i--) {
      const p1 = { x: offsetX + snake[i].x * cellSize + cellSize / 2, y: offsetY + snake[i].y * cellSize + cellSize / 2 };
      const p2 = { x: offsetX + snake[i + 1].x * cellSize + cellSize / 2, y: offsetY + snake[i + 1].y * cellSize + cellSize / 2 };
      
      const tailProgress = (i + 1) / snake.length; // ০ (মাথা) থেকে ১ (লেজ)
      const taperFactor = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
      const strokeW = cellSize * 0.74 * taperFactor;

      ctx.beginPath();
      ctx.strokeStyle = "#2b56bf";
      ctx.lineWidth = strokeW + 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // লেয়ার ২: মেইন ব্রাইট ব্লু বডি (লেজের দিকে সরু)
    for (let i = snake.length - 2; i >= 0; i--) {
      const p1 = { x: offsetX + snake[i].x * cellSize + cellSize / 2, y: offsetY + snake[i].y * cellSize + cellSize / 2 };
      const p2 = { x: offsetX + snake[i + 1].x * cellSize + cellSize / 2, y: offsetY + snake[i + 1].y * cellSize + cellSize / 2 };
      
      const tailProgress = (i + 1) / snake.length;
      const taperFactor = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
      const strokeW = cellSize * 0.74 * taperFactor;

      ctx.beginPath();
      ctx.strokeStyle = "#3f78fc";
      ctx.lineWidth = strokeW;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
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
