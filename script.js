const canvas = document.getElementById("arena");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;

const els = {
  app: document.getElementById("app"),
  modeSelector: document.getElementById("mode-selector"),
  startScreen: document.getElementById("start-screen"),
  winnerOverlay: document.getElementById("winnerOverlay"),
  podium1Name: document.getElementById("podium1Name"),
  topFoodCount: document.getElementById("topFoodCount"),
  topBestCount: document.getElementById("topBestCount"),
  bgmSelect: document.getElementById("bgmSelect"),
  volumeSlider: document.getElementById("volumeSlider"),
  fullscreenToggle: document.getElementById("fullscreenToggle")
};

let viewWidth = 0, viewHeight = 0;
let isPlaying = false;
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

// 🟩 স্কয়ার গ্রিড কনফিগারেশন (13x13 Grid)
const GRID_SIZE = 13;
let cols = GRID_SIZE, rows = GRID_SIZE;
let cellSize = 24;
let offsetX = 0, offsetY = 0;
let squareArenaSize = 0;

let snake = [];
let direction = { x: 1, y: 0 };
let food = { x: 9, y: 4, emoji: "🌶️" };
let lastMoveTime = 0;
let moveSpeedMs = 70; // পারফেক্ট মুভমেন্ট স্পিড

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
      if (!audioCtx || !isPlaying) return;
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
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.07);
      gain.gain.setValueAtTime(0.18 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else if (type === "die") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
      gain.gain.setValueAtTime(0.25 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    }
    
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    osc.start(now); 
    osc.stop(now + 0.24);
  } catch (e) {}
}

// 🖥️ ফুলস্ক্রিন ফাংশন
async function triggerFullscreen() {
  const docEl = document.documentElement;
  try {
    if (docEl.requestFullscreen) {
      await docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      await docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      await docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      await docEl.msRequestFullscreen();
    }
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
  
  initSnakeCycle();
  isPlaying = true;
  startBGM();
  requestAnimationFrame(gameLoop);
}

// 📏 আপার-মিডল স্কয়ার প্লে-গ্রাউন্ড রিসাইজিং
function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  viewWidth = canvas.width;
  viewHeight = canvas.height;

  const minDim = Math.min(viewWidth, viewHeight);
  cellSize = Math.floor(minDim / GRID_SIZE);
  squareArenaSize = cellSize * GRID_SIZE;

  offsetX = Math.floor((viewWidth - squareArenaSize) / 2);
  offsetY = Math.floor((viewHeight - squareArenaSize) / 2);
}

function initSnakeCycle() {
  // স্ক্রিনশটের মতো সুন্দর দীর্ঘ স্নেক শুরু
  snake = [
    { x: 6, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 },
    { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 },
    { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 },
    { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 }
  ];
  
  direction = { x: 1, y: 0 };
  spawnFood();
  updateHUD();
}

function spawnFood() {
  const foodEmojis = ["🌶️", "🍎", "🍇", "🌟"];
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

// 🤖 স্মার্ট সারভাইভাল ও স্পেস ফিলিং AI (সহজে মারা যাবে না)
function getNextAIMove() {
  const head = snake[0];
  const tail = snake[snake.length - 1];
  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  function findPath(start, target, customSnake) {
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    visited[start.y][start.x] = true;

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.x === target.x && curr.y === target.y) return curr.path;

      for (let d of dirs) {
        const nx = curr.x + d.x, ny = curr.y + d.y;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) {
          if (!customSnake.slice(0, -1).some(s => s.x === nx && s.y === ny)) {
            visited[ny][nx] = true;
            queue.push({ x: nx, y: ny, path: [...curr.path, d] });
          }
        }
      }
    }
    return null;
  }

  // ১. খাবারের পথ খোঁজা এবং নিজেকে ফাঁদে না ফেলার ভার্চুয়াল টেস্ট
  const pathToFood = findPath(head, food, snake);
  if (pathToFood && pathToFood.length > 0) {
    const virtualSnake = [...snake];
    let vHead = { x: head.x, y: head.y };
    
    for (let step of pathToFood) {
      vHead = { x: vHead.x + step.x, y: vHead.y + step.y };
      virtualSnake.unshift(vHead);
      virtualSnake.pop();
    }

    const pathToTailAfterFood = findPath(vHead, virtualSnake[virtualSnake.length - 1], virtualSnake);
    if (pathToTailAfterFood) {
      return pathToFood[0]; // নিরাপদ হলে খাদ্যের দিকে যাবে
    }
  }

  // ২. বড় প্যাটার্ন তৈরি করে বেঁচে থাকার পথ (লেজ অনুসরণ করা)
  const pathToTail = findPath(head, tail, snake);
  if (pathToTail && pathToTail.length > 0) {
    let bestDir = pathToTail[0];
    let maxOpenArea = -1;

    for (let d of dirs) {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
        if (!snake.slice(0, -1).some(s => s.x === nx && s.y === ny)) {
          const area = countFreeSpaces({ x: nx, y: ny });
          if (area > maxOpenArea) {
            maxOpenArea = area;
            bestDir = d;
          }
        }
      }
    }
    return bestDir;
  }

  // ৩. অল্টারনেট নিরাপদ পদক্ষেপ
  for (let d of dirs) {
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      if (!snake.slice(0, -1).some(s => s.x === nx && s.y === ny)) return d;
    }
  }

  return dirs[0];
}

function countFreeSpaces(startPos) {
  let count = 0;
  const q = [startPos];
  const vis = Array.from({ length: rows }, () => Array(cols).fill(false));
  vis[startPos.y][startPos.x] = true;

  while (q.length > 0 && count < 30) {
    const c = q.shift();
    count++;
    const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    for (let d of dirs) {
      const nx = c.x + d.x, ny = c.y + d.y;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !vis[ny][nx]) {
        if (!snake.some(s => s.x === nx && s.y === ny)) {
          vis[ny][nx] = true;
          q.push({ x: nx, y: ny });
        }
      }
    }
  }
  return count;
}

function handleSnakeDeath() {
  playSound("die");
  if (currentRunFood > maxFoodSingleRun) maxFoodSingleRun = currentRunFood;
  updateHUD();
  setTimeout(() => { if (isPlaying) initSnakeCycle(); }, 400);
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
    currentRunFood++;
    if (currentRunFood > maxFoodSingleRun) maxFoodSingleRun = currentRunFood;
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
  els.podium1Name.innerText = `${maxFoodSingleRun} Foods Collected`;
  els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  els.winnerOverlay.classList.add("hidden");
  els.app.classList.add("hidden");
  els.startScreen.classList.remove("hidden");
  isPlaying = false;
}

// 🎨 রেন্ডারিং (স্ক্রিনশটের মতো স্মুথ রিবন ব্লু স্নেক)
function gameLoop(time) {
  if (!isPlaying || !ctx) return;

  const elapsed = (Date.now() - simulationStartTime) / 1000;
  if (simulationTotalSeconds - elapsed <= 0) { endTournament(); return; }

  if (time - lastMoveTime > moveSpeedMs) {
    updateSnakePhysics();
    lastMoveTime = time;
  }

  // ১. বাইরের ব্যাকগ্রাউন্ড
  ctx.fillStyle = "#4a752c";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // ২. ডুয়াল গ্রিন চেকারবোর্ড গ্রাস ফিল্ড
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#8ad44a" : "#7ec841";
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }

  // ৩. খাদ্য (মরিচ/ফল)
  const fx = offsetX + food.x * cellSize + cellSize / 2;
  const fy = offsetY + food.y * cellSize + cellSize / 2;
  ctx.font = `${Math.floor(cellSize * 0.85)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(food.emoji, fx, fy);

  // ৪. ব্লু রিবন স্নেক বডি (স্মুথ রাউন্ডেড ও বর্ডার শ্যাডো সহ)
  if (snake.length > 1) {
    const strokeW = cellSize * 0.76;

    // গাঢ় নীল বর্ডার শ্যাডো
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

    // মেইন ব্রাইট ব্লু পাইপ বডি
    ctx.beginPath();
    ctx.strokeStyle = "#3f78fc";
    ctx.lineWidth = strokeW;
    ctx.stroke();
  }

  // ৫. স্নেক হেড ও কার্টুন চোখ
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

  if (direction.x === 1) { // Right
    lx = hx + 4; ly = hy - 6; rx = hx + 4; ry = hy + 6;
  } else if (direction.x === -1) { // Left
    lx = hx - 4; ly = hy - 6; rx = hx - 4; ry = hy + 6;
  } else if (direction.y === 1) { // Down
    lx = hx - 6; ly = hy + 4; rx = hx + 6; ry = hy + 4;
  } else { // Up
    lx = hx - 6; ly = hy - 4; rx = hx + 6; ry = hy - 4;
  }

  // সাদা চোখ
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(lx, ly, eyeR, 0, Math.PI * 2);
  ctx.arc(rx, ry, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // কালো মণি
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
