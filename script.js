const canvas = document.getElementById("arena");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;

const els = {
  app: document.getElementById("app"),
  modeSelector: document.getElementById("mode-selector"),
  startScreen: document.getElementById("start-screen"),
  winnerOverlay: document.getElementById("winnerOverlay"),
  podium1Name: document.getElementById("podium1Name"),
  podium2Name: document.getElementById("podium2Name"),
  podium3Name: document.getElementById("podium3Name"),
  topAppleCount: document.getElementById("topAppleCount"),
  topBestCount: document.getElementById("topBestCount"),
  bgmSelect: document.getElementById("bgmSelect"),
  volumeSlider: document.getElementById("volumeSlider")
};

let viewWidth = 0, viewHeight = 0;
let isPlaying = false;
let selectedDeviceMode = 'mobile';

let SIMULATION_MINUTES = 5;
let simulationTotalSeconds = 5 * 60;
let simulationStartTime = 0;
let totalDeaths = 0;
let sessionTotalFood = 0;
let maxFoodSingleRun = 0;

function setSimulationMinutes(mins, btnElement) {
  SIMULATION_MINUTES = parseInt(mins) || 5;
  simulationTotalSeconds = SIMULATION_MINUTES * 60;
  document.querySelectorAll(".round-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
}

let cols = 17, rows = 15, cellSize = 24;
let offsetX = 0, offsetY = 0;
let snake = [], direction = { x: 1, y: 0 }, food = { x: 12, y: 7 };
let currentRunFood = 0, lastMoveTime = 0, moveSpeedMs = 60;

// 🔊 ROBUST AUDIO SYSTEM FIX
let audioCtx = null;
let masterVolume = 0.85;
const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

// ইউজারের প্রথম ক্লিকে AudioContext তৈরি এবং আনলক করা হবে
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
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.07);
      gain.gain.setValueAtTime(0.18 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else if (type === "die") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
      gain.gain.setValueAtTime(0.26 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    }
    
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    osc.start(now); 
    osc.stop(now + 0.25);
  } catch (e) {}
}

function selectMode(mode) {
  selectedDeviceMode = mode;
  document.body.classList.remove('mobile-mode', 'tablet-mode', 'pc-mode');
  document.body.classList.add(mode + '-mode');
  els.modeSelector.classList.add("hidden");
  els.startScreen.classList.remove("hidden");
}

function beginBattle() {
  initAudioEngine(); // নিশ্চিত সাউন্ড আনলক
  
  els.startScreen.classList.add("hidden");
  els.app.classList.remove("hidden");
  
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  
  totalDeaths = 0;
  sessionTotalFood = 0;
  maxFoodSingleRun = 0;
  simulationStartTime = Date.now();
  
  initSnakeCycle();
  isPlaying = true;
  startBGM();
  requestAnimationFrame(gameLoop);
}

// 📏 Resolution & Grid Logic
function resizeCanvas() {
  if (!canvas) return;
  
  if (selectedDeviceMode === 'mobile') {
    canvas.width = 1080;
    canvas.height = 1920;
    cols = 16; rows = 28; 
  } else if (selectedDeviceMode === 'tablet') {
    canvas.width = 1920;
    canvas.height = 1080;
    cols = 32; rows = 18;
  } else {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 1.5; 
    canvas.height = rect.height * 1.5;
    cols = Math.floor(canvas.width / 60);
    rows = Math.floor(canvas.height / 60);
  }

  viewWidth = canvas.width;
  viewHeight = canvas.height;
  
  cellSize = Math.floor(Math.min(viewWidth / cols, viewHeight / rows));
  offsetX = Math.floor((viewWidth - cols * cellSize) / 2);
  offsetY = Math.floor((viewHeight - rows * cellSize) / 2);
}

function initSnakeCycle() {
  const startX = Math.floor(cols / 2) - 2;
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
      if (!snake.some(seg => seg.x === c && seg.y === r)) emptyCells.push({ x: c, y: r });
    }
  }
  if (emptyCells.length > 0) {
    food = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }
}

// 🤖 AI LOGIC
function getNextAIMove() {
  const head = snake[0];
  const queue = [{ x: head.x, y: head.y, path: [] }];
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  visited[head.y][head.x] = true;
  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  
  let pathToFood = null;
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.x === food.x && curr.y === food.y) {
      pathToFood = curr.path;
      break;
    }
    for (let d of dirs) {
      const nx = curr.x + d.x, ny = curr.y + d.y;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) {
        if (!snake.slice(0, -1).some(s => s.x === nx && s.y === ny)) {
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny, path: [...curr.path, d] });
        }
      }
    }
  }
  
  if (pathToFood && pathToFood.length > 0) return pathToFood[0];

  for (let d of dirs) {
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      if (!snake.slice(0, -1).some(s => s.x === nx && s.y === ny)) return d;
    }
  }
  return dirs[0];
}

function handleSnakeDeath() {
  playSound("die");
  totalDeaths++;
  if (currentRunFood > maxFoodSingleRun) maxFoodSingleRun = currentRunFood;
  updateTopBar();
  setTimeout(() => { if (isPlaying) initSnakeCycle(); }, 500);
}

function updateSnakePhysics() {
  direction = getNextAIMove();
  const newHead = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows || snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
    handleSnakeDeath();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    currentRunFood++; sessionTotalFood++;
    playSound("eat"); spawnFood();
  } else {
    snake.pop();
  }

  if (currentRunFood > maxFoodSingleRun) maxFoodSingleRun = currentRunFood;
  updateTopBar();
}

function updateTopBar() {
  els.topAppleCount.innerText = currentRunFood;
  els.topBestCount.innerText = maxFoodSingleRun;
}

function endTournament() {
  isPlaying = false;
  stopBGM();
  els.podium1Name.innerText = `${maxFoodSingleRun} Apples`;
  els.podium2Name.innerText = `${totalDeaths} Total Deaths`;
  els.podium3Name.innerText = `${sessionTotalFood} Apples`;
  els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  els.winnerOverlay.classList.add("hidden");
  els.app.classList.add("hidden");
  els.startScreen.classList.remove("hidden");
  isPlaying = false;
}

// 🎨 RENDERER
function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  const elapsed = (Date.now() - simulationStartTime) / 1000;
  if (simulationTotalSeconds - elapsed <= 0) { endTournament(); return; }

  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  ctx.fillStyle = "#4a752c";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // Grass Background
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#aad751" : "#a2d149";
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }

  // Apple
  ctx.font = `${Math.floor(cellSize * 0.9)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🍎", offsetX + food.x * cellSize + cellSize / 2, offsetY + food.y * cellSize + cellSize / 2);

  // Snake
  snake.forEach((seg, i) => {
    const px = offsetX + seg.x * cellSize, py = offsetY + seg.y * cellSize;
    ctx.fillStyle = "#487ff7";

    if (i === 0) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px + 1, py + 1, cellSize - 2, cellSize - 2, cellSize * 0.3);
      else ctx.rect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      ctx.fill();

      // Eye Tracking
      const eyeR = cellSize * 0.18, pupR = cellSize * 0.09;
      let lX = px + cellSize * 0.32, lY = py + cellSize * 0.32, rX = px + cellSize * 0.68, rY = py + cellSize * 0.32;
      
      if (direction.x === 1) { lX = px + cellSize * 0.68; rX = px + cellSize * 0.68; rY = py + cellSize * 0.68; }
      else if (direction.x === -1) { rY = py + cellSize * 0.68; }
      else if (direction.y === 1) { lY = py + cellSize * 0.68; rY = py + cellSize * 0.68; }

      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(lX, lY, eyeR, 0, Math.PI * 2); ctx.arc(rX, rY, eyeR, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#000000";
      const pOffX = direction.x * 1.5, pOffY = direction.y * 1.5;
      ctx.beginPath(); ctx.arc(lX + pOffX, lY + pOffY, pupR, 0, Math.PI * 2); ctx.arc(rX + pOffX, rY + pOffY, pupR, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3, cellSize * 0.2);
      else ctx.rect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
      ctx.fill();
    }
  });

  requestAnimationFrame(gameLoop);
}

window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;
