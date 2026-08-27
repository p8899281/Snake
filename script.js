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
  podiumContainer: document.getElementById("podiumContainer"),
  podium1Name: document.getElementById("podium1Name"),
  podium2Name: document.getElementById("podium2Name"),
  podium3Name: document.getElementById("podium3Name"),
  topAppleCount: document.getElementById("topAppleCount"),
  topBestCount: document.getElementById("topBestCount"),
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

// ⏱️ ব্যাকগ্রাউন্ড টাইমার ও সেশন ডাটা
let SIMULATION_MINUTES = 5;
let simulationTotalSeconds = 5 * 60;
let simulationStartTime = 0;
let currentCycle = 1;
let totalDeaths = 0;
let sessionTotalFood = 0;
let maxFoodSingleRun = 0;

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 5;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

// 🐍 গুগল স্নেক কনফিগারেশন
let cols = 17, rows = 15;
let cellSize = 24;
let offsetX = 0, offsetY = 0;

let snake = [];
let direction = { x: 1, y: 0 };
let food = { x: 12, y: 7 };
let currentRunFood = 0;
let lastMoveTime = 0;
let moveSpeedMs = 60;

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
  const selected = els.bgmSelect ? els.bgmSelect.value : 'google';
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
const googleMelody = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];

function startBGM() {
  stopBGM();
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'google';

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
        osc.type = "sine";
        osc.frequency.setValueAtTime(googleMelody[bgmStep % googleMelody.length], now);
        gain.gain.setValueAtTime(0.04 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
        bgmStep++;
      } catch (e) {}
    }, 150);
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
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.07);
      gain.gain.setValueAtTime(0.18 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === "die") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
      gain.gain.setValueAtTime(0.26 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.23);
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
  maxFoodSingleRun = 0;
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

  cols = 17;
  rows = 15;
  cellSize = Math.floor(Math.min((viewWidth - 10) / cols, (viewHeight - 10) / rows));
  
  offsetX = Math.floor((viewWidth - cols * cellSize) / 2);
  offsetY = Math.floor((viewHeight - rows * cellSize) / 2);
}

function initSnakeCycle() {
  const startX = 4;
  const startY = Math.floor(rows / 2);
  
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  
  direction = { x: 1, y: 0 };
  currentRunFood = 0;
  spawnFood();
  updateTopBar();
}

function spawnFood() {
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
  food = { x: randPos.x, y: randPos.y };
}

// 🤖 AI BFS PATHFINDING
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

function handleSnakeDeath() {
  playSound("die");
  totalDeaths++;
  currentCycle++;
  
  if (currentRunFood > maxFoodSingleRun) {
    maxFoodSingleRun = currentRunFood;
  }
  updateTopBar();

  setTimeout(() => {
    if (isPlaying) initSnakeCycle();
  }, 500);
}

function updateSnakePhysics() {
  direction = getNextAIMove();
  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
    handleSnakeDeath();
    return;
  }

  if (snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
    handleSnakeDeath();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    currentRunFood++;
    sessionTotalFood++;
    playSound("eat");
    spawnFood();
  } else {
    snake.pop();
  }

  if (currentRunFood > maxFoodSingleRun) {
    maxFoodSingleRun = currentRunFood;
  }

  updateTopBar();
}

function updateTopBar() {
  if (els.topAppleCount) els.topAppleCount.innerText = currentRunFood;
  if (els.topBestCount) els.topBestCount.innerText = maxFoodSingleRun;
}

function endTournament() {
  isPlaying = false;
  stopBGM();

  if (els.podium1Name) els.podium1Name.innerText = `${maxFoodSingleRun} Apples`;
  if (els.podium2Name) els.podium2Name.innerText = `${totalDeaths} Total Deaths`;
  if (els.podium3Name) els.podium3Name.innerText = `${sessionTotalFood} Apples`;

  if (els.winnerOverlay) els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  if (els.winnerOverlay) els.winnerOverlay.classList.add("hidden");
  if (els.app) els.app.classList.add("hidden");
  if (els.startScreen) els.startScreen.classList.remove("hidden");
  isPlaying = false;
}

// 🎨 GOOGLE SNAKE CANVAS RENDERER
function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  // ব্যাকগ্রাউন্ডে টাইমার ট্র্যাকিং (স্ক্রিনে প্রদর্শিত হবে না)
  const elapsed = (Date.now() - simulationStartTime) / 1000;
  const timeLeft = simulationTotalSeconds - elapsed;

  if (timeLeft <= 0) {
    endTournament();
    return;
  }

  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  // ক্যানভাস ক্লিয়ার
  ctx.fillStyle = "#4a752c";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // ১. ডুয়াল-গ্রিন চেকারবোর্ড ফিল্ড
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#aad751" : "#a2d149";
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }

  // ২. লাল আপেল 🍎
  const appleX = offsetX + food.x * cellSize + cellSize / 2;
  const appleY = offsetY + food.y * cellSize + cellSize / 2;
  ctx.font = `${Math.floor(cellSize * 0.9)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🍎", appleX, appleY);

  // ৩. গুগল ব্লু স্নেক বডি
  snake.forEach((seg, i) => {
    const px = offsetX + seg.x * cellSize;
    const py = offsetY + seg.y * cellSize;
    
    ctx.fillStyle = "#487ff7";

    if (i === 0) {
      // স্নেক হেড
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(px + 1, py + 1, cellSize - 2, cellSize - 2, 8);
      } else {
        ctx.rect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      }
      ctx.fill();

      // আই-ট্র্যাকিং (চোখের দৃষ্টি)
      const eyeRadius = cellSize * 0.18;
      const pupilRadius = cellSize * 0.09;
      
      let leftEyeX = px + cellSize * 0.32;
      let leftEyeY = py + cellSize * 0.32;
      let rightEyeX = px + cellSize * 0.68;
      let rightEyeY = py + cellSize * 0.32;

      if (direction.x === 1) { // Right
        leftEyeX = px + cellSize * 0.68; leftEyeY = py + cellSize * 0.32;
        rightEyeX = px + cellSize * 0.68; rightEyeY = py + cellSize * 0.68;
      } else if (direction.x === -1) { // Left
        leftEyeX = px + cellSize * 0.32; leftEyeY = py + cellSize * 0.32;
        rightEyeX = px + cellSize * 0.32; rightEyeY = py + cellSize * 0.68;
      } else if (direction.y === 1) { // Down
        leftEyeX = px + cellSize * 0.32; leftEyeY = py + cellSize * 0.68;
        rightEyeX = px + cellSize * 0.68; rightEyeY = py + cellSize * 0.68;
      }

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#000000";
      const pOffX = direction.x * 1.5;
      const pOffY = direction.y * 1.5;
      ctx.beginPath();
      ctx.arc(leftEyeX + pOffX, leftEyeY + pOffY, pupilRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX + pOffX, rightEyeY + pOffY, pupilRadius, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // বডি সেগমেন্ট
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3, 5);
      } else {
        ctx.rect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
      }
      ctx.fill();
    }
  });

  requestAnimationFrame(gameLoop);
}

// উইন্ডো ফাংশন
window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;

document.addEventListener("click", unlockAudio);
document.addEventListener("touchstart", unlockAudio);
