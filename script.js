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
  fullscreenToggle: document.getElementById("fullscreenToggle"),
  hudSubBtn: document.getElementById("hudSubBtn"),
  hudSubText: document.getElementById("hudSubText"),
  hudBellIcon: document.getElementById("hudBellIcon"),
  hudCursor: document.getElementById("hudCursor"),
  chatUrl: document.getElementById("chatUrl"),
  chatKey: document.getElementById("chatKey"),
  chatInterval: document.getElementById("chatInterval"),
  chatStartStatus: document.getElementById("chatStartStatus"),
  chatDot: document.getElementById("chatDot"),
  voterCount: document.getElementById("voterCount"),
  victoryOverlay: document.getElementById("victoryOverlay"),
  victorySub: document.getElementById("victorySub"),
  voiceToggle: document.getElementById("voiceToggle"),
  mascotPanel: document.getElementById("mascotPanel"),
  mascotImg: document.getElementById("mascotImg"),
  mascotSvg: document.getElementById("mascotSvg")
};

let viewWidth = 0, viewHeight = 0;
let isPlaying = false;
let isRespawning = false;
let selectedDeviceMode = 'mobile';

// ⏱️ ডিউরেশন স্টেট
let SIMULATION_MINUTES = 0; // 0 = ∞ LIVE (no end)
let simulationTotalSeconds = Infinity;
let simulationStartTime = 0;

let currentRunFood = 0;
let maxFoodSingleRun = 0;

// 💡 SCREEN WAKE LOCK SYSTEM (স্ক্রিন সবসময় অন রাখার ফিচার)
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log("Wake Lock status:", err);
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && isPlaying) {
    await requestWakeLock();
  }
});

function setSimulationMinutes(mins, btnElement) {
  const parsedMins = parseInt(mins);
  SIMULATION_MINUTES = isNaN(parsedMins) ? 0 : parsedMins;
  simulationTotalSeconds = SIMULATION_MINUTES > 0 ? SIMULATION_MINUTES * 60 : Infinity;
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
let foods = []; // { x, y, emoji, name }

// 🍎 চ্যাট-ফুড সেটিংস (এখানে নিজের মতো বদলাতে পারবেন)
const AUTO_FOOD_TARGET = 4;      // নামহীন অটো ফুড সবসময় কয়টা বোর্ডে থাকবে (একটা খেলেই সাথে সাথে নতুন আসে)
const VOTE_DRAIN_MS = 800;       // চ্যাটের নামের ফুড কত মিলিসেকেন্ড পর পর পড়বে (লাইনে থাকা ভোট থেকে)
const MAX_WAITING_VOTES = 30;    // লাইনে সর্বোচ্চ কতজনের নাম অপেক্ষায় থাকবে
const MAX_FOODS_ON_BOARD = 10;   // মোট ফুড সর্বোচ্চ
const VICTORY_PAUSE_MS = 6000;   // ১০০% ভরার পর কতক্ষণ জয়ের স্ক্রিন
const MAX_NAME_CHARS = 12;       // বোর্ডে নামের সর্বোচ্চ অক্ষর
let voteTimer = null;
let isVictory = false;
let boardsCompleted = 0;
const roundVoters = new Map();   // এই রাউন্ডে যারা 1 লিখেছে
const popups = [];
let lastMoveTime = 0;
let moveSpeedMs = 160; // সাপের গতি: বেশি = ধীর (আগে 110 ছিল)

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

// 🔊 অডিও ইঞ্জিনের আলাদা অডিও চ্যানেল (BGM Gain & SFX Gain Separated)
let audioCtx = null;
let bgmGainNode = null;
let bgmCompressor = null;
let sfxGainNode = null;
let bgmVolume = 0.85;

const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

const SFX_BASE_GAIN = 2.2; // খাওয়ার/অন্য সাউন্ড ইফেক্টের মূল ভলিউম (আগে 1.0)

function initAudioEngine() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    audioCtx.onstatechange = () => checkAudioHint();
    
    // 🎵 ১. ব্যাকগ্রাউন্ড মিউজিক চ্যানেল (ভলিউম স্লাইডার দ্বারা নিয়ন্ত্রিত)
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.setValueAtTime(bgmVolume, audioCtx.currentTime);
    // কম্প্রেসর: জোরে করলেও আওয়াজ ফাটবে না
    bgmCompressor = audioCtx.createDynamicsCompressor();
    bgmCompressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
    bgmCompressor.knee.setValueAtTime(10, audioCtx.currentTime);
    bgmCompressor.ratio.setValueAtTime(8, audioCtx.currentTime);
    bgmCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    bgmCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);
    bgmGainNode.connect(bgmCompressor);
    bgmCompressor.connect(audioCtx.destination);

    // 🔊 ২. গেম সাউন্ড এফেক্টস চ্যানেল (সম্পূর্ণ স্বাধীন ও উচ্চ ভলিউমে ফিক্সড)
    sfxGainNode = audioCtx.createGain();
    sfxGainNode.gain.setValueAtTime(SFX_BASE_GAIN, audioCtx.currentTime);
    // কম্প্রেসর: ভলিউম বাড়ালেও আওয়াজ ফাটে না, তাই সাউন্ড আরও জোরালো শোনায়
    const sfxCompressor = audioCtx.createDynamicsCompressor();
    sfxCompressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
    sfxCompressor.knee.setValueAtTime(6, audioCtx.currentTime);
    sfxCompressor.ratio.setValueAtTime(10, audioCtx.currentTime);
    sfxCompressor.attack.setValueAtTime(0.002, audioCtx.currentTime);
    sfxCompressor.release.setValueAtTime(0.12, audioCtx.currentTime);
    sfxGainNode.connect(sfxCompressor);
    sfxCompressor.connect(audioCtx.destination);
  }
  // iOS Safari: silent-switch ছাড়াও সাউন্ড বাজানোর জন্য + অডিও আনলক
  try {
    const b = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = b;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch (e) {}
  ensureAudioRunning();
}

// 🔓 অডিও যেন সবসময় "running" থাকে (suspended / interrupted দুটোই ঠিক করে)
function ensureAudioRunning() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (audioCtx && audioCtx.state !== 'running') {
    try {
      const p = audioCtx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  retryBgm();
}
// 🔔 Autoplay policy: ক্লিক/ট্যাপ ছাড়া ব্রাউজার অডিও আটকে রাখে। তখন "TAP TO ENABLE SOUND" বাটন দেখাবে, আর প্রথম ট্যাপেই অডিও চালু হবে।
let speechUnlockedByTap = false;

function showSoundHint(show) {
  let el = document.getElementById("soundHint");
  if (!show) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement("button");
  el.id = "soundHint";
  el.type = "button";
  el.textContent = "🔊 TAP TO ENABLE SOUND";
  el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;" +
    "background:#3f78fc;color:#fff;border:none;border-radius:999px;padding:12px 22px;font-size:14px;" +
    "font-weight:900;letter-spacing:1px;box-shadow:0 6px 22px rgba(0,0,0,.6);cursor:pointer;";
  el.addEventListener("click", () => { ensureAudioRunning(); unlockSpeech(); });
  document.body.appendChild(el);
}

function checkAudioHint() {
  if (!isPlaying) { showSoundHint(false); return; }
  const ctxBlocked = !!audioCtx && audioCtx.state !== "running";
  const musicBlocked = bgmWanted && customAudioPlayer.paused;
  showSoundHint(ctxBlocked || musicBlocked);
}

// প্রথম ইউজার জেসচার (ক্লিক/ট্যাপ/কী) এলেই অডিও + ভয়েস আনলক
["pointerdown", "pointerup", "mousedown", "touchend", "click", "keydown"].forEach(ev => {
  document.addEventListener(ev, () => {
    if (!isPlaying) return;
    ensureAudioRunning();
    if (!speechUnlockedByTap) { speechUnlockedByTap = true; unlockSpeech(); }
    setTimeout(checkAudioHint, 300);
  }, { passive: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isPlaying) {
    ensureAudioRunning();
    setTimeout(checkAudioHint, 300);
  }
});

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

// 🎛️ শুধুমাত্র ব্যাকগ্রাউন্ড মিউজিকের ভলিউম কমানো/বাড়ানোর ফাংশন
function changeVolume(val) {
  bgmVolume = parseFloat(val);
  if (isNaN(bgmVolume)) bgmVolume = 0.85;
  
  if (els.volumeValueText) {
    els.volumeValueText.innerText = `${Math.round(bgmVolume * 100)}%`;
  }
  
  if (bgmGainNode && audioCtx) {
    bgmGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    bgmGainNode.gain.setValueAtTime(bgmVolume, audioCtx.currentTime);
  }
  
  if (customAudioPlayer) {
    customAudioPlayer.volume = bgmVolume;
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

// 🎵 ব্যাকগ্রাউন্ড মিউজিক: সুরটা JS দিয়ে একটা আসল WAV অডিওতে বানিয়ে সাধারণ <audio> এলিমেন্টে বাজানো হয়।
// (Web Audio oscillator-এর চেয়ে এটা অনেক বেশি নির্ভরযোগ্য: iPhone silent switch, in-app browser, iframe — সব জায়গায় চলে)
const bgmWavCache = {};
let bgmWanted = false;   // মিউজিক এখন চলা উচিত কিনা

function makeWavBlob(data, sampleRate) {
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function renderTrackUrl(key) {
  if (bgmWavCache[key]) return bgmWavCache[key];
  const track = musicTracks[key] || musicTracks.google_original;
  const SR = 22050;
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const bassPeriod = track.bass ? track.bass.length * 2 : 1;
  const steps = (track.notes.length * bassPeriod) / gcd(track.notes.length, bassPeriod);
  const stepSamples = Math.round(SR * track.speed / 1000);
  const loopSamples = steps * stepSamples;
  const reps = Math.max(1, Math.ceil((10 * SR) / loopSamples));   // ~১০ সেকেন্ডের লুপ
  const total = loopSamples * reps;
  const data = new Float32Array(total);

  const addTone = (start, freq, type, vol, dur) => {
    const n = Math.floor(SR * dur * 1.08);
    const k = Math.log(0.0001 / vol) / dur;
    const inc = freq / SR;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const env = vol * Math.exp(k * Math.min(i / SR, dur));
      let x;
      if (type === "sine") x = Math.sin(2 * Math.PI * phase);
      else if (type === "triangle") x = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * phase));
      else x = 2 * (phase - Math.floor(phase + 0.5));        // sawtooth
      phase += inc;
      data[(start + i) % total] += x * env;                  // শেষের টেইল শুরুতে ঘুরে আসে → লুপে কোনো ফাঁক/ক্লিক নেই
    }
  };

  for (let st = 0; st < steps * reps; st++) {
    const start = st * stepSamples;
    addTone(start, track.notes[st % track.notes.length], track.type, track.type === "sawtooth" ? 0.03 : 0.05, 0.12);
    if (track.bass && st % 2 === 0) {
      addTone(start, track.bass[Math.floor(st / 2) % track.bass.length], "sine", 0.08, 0.22);
    }
  }

  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(data[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;                   // জোরালো কিন্তু ফাটবে না
  for (let i = 0; i < total; i++) data[i] *= norm;

  const url = URL.createObjectURL(makeWavBlob(data, SR));
  bgmWavCache[key] = url;
  return url;
}

function retryBgm() {
  if (bgmWanted && customAudioPlayer.paused) {
    try {
      const p = customAudioPlayer.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
}

// 🔗 লিংক ঠিক করে নেওয়া: GitHub (raw/blob), Dropbox — যেন সরাসরি অডিও ফাইলই পাওয়া যায়
function normalizeMusicUrl(input) {
  let u = (input || "").trim().replace(/^["'<]+|["'>]+$/g, "");
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
  try {
    const url = new URL(u);
    if (url.hostname === "github.com" || url.hostname === "www.github.com") {
      // github.com/user/repo/raw/...  বা  /blob/...  →  raw.githubusercontent.com/user/repo/...  (রিডাইরেক্ট ছাড়া সরাসরি)
      const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/);
      if (m) return "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + m[3];
    }
    if (/(^|\.)dropbox\.com$/.test(url.hostname)) {
      url.searchParams.delete("dl");
      url.searchParams.set("raw", "1");
      return url.toString();
    }
    if (location.protocol === "https:" && url.protocol === "http:") url.protocol = "https:"; // mixed-content এড়াতে
    return url.toString();
  } catch (e) { return u; }
}

let bgmToken = 0;          // পুরোনো অ্যাসিঙ্ক কলব্যাক বাতিল করতে
let bgmWatchdog = null;
let bgmPlayingHandler = null;
let musicToastTimer = null;
const CUSTOM_MUSIC_TIMEOUT_MS = 15000;

function showMusicToast(text, ms) {
  let el = document.getElementById("musicToast");
  if (!text) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "musicToast";
    el.style.cssText = "position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:9998;max-width:92vw;" +
      "background:rgba(0,0,0,.82);color:#fff;border:1.5px solid #87c34b;border-radius:12px;padding:9px 14px;" +
      "font-size:12px;font-weight:800;text-align:center;box-shadow:0 6px 22px rgba(0,0,0,.6);pointer-events:none;";
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (musicToastTimer) { clearTimeout(musicToastTimer); musicToastTimer = null; }
  if (ms > 0) musicToastTimer = setTimeout(() => showMusicToast("", 0), ms);
}

function playBuiltinTrack(key) {
  let url = "";
  try { url = renderTrackUrl(key); } catch (e) { console.log("BGM render failed:", e); }
  if (!url) return;
  bgmWanted = true;
  customAudioPlayer.onerror = null;
  customAudioPlayer.loop = true;
  customAudioPlayer.preload = "auto";
  customAudioPlayer.src = url;
  customAudioPlayer.volume = bgmVolume;
  try {
    const p = customAudioPlayer.play();
    if (p && p.catch) p.catch(() => { setTimeout(checkAudioHint, 150); });
  } catch (e) {}
}

function failCustomMusic(token, reason) {
  if (token !== bgmToken) return;
  bgmToken++;                                   // পুরোনো কলব্যাকগুলো আর কাজ করবে না
  if (bgmWatchdog) { clearTimeout(bgmWatchdog); bgmWatchdog = null; }
  if (bgmPlayingHandler) { customAudioPlayer.removeEventListener("playing", bgmPlayingHandler); bgmPlayingHandler = null; }
  console.log("Custom music failed:", reason);
  showMusicToast("⚠️ Custom music failed (" + reason + "). Playing default music instead.", 8000);
  playBuiltinTrack("google_original");
}

// ফাইল ডাউনলোড করে blob হিসেবে বাজানো (ব্রাউজারের সরাসরি লোড আটকে গেলে এটা কাজ করে)
function playCustomViaBlob(url, token) {
  fetch(url, { mode: "cors" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
    .then(buf => {
      if (token !== bgmToken) return;
      const ext = (url.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "mp3";
      const types = { mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", opus: "audio/ogg" };
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: types[ext.toLowerCase()] || "audio/mpeg" }));
      customAudioPlayer.onerror = () => failCustomMusic(token, "unsupported audio format");
      customAudioPlayer.src = blobUrl;
      customAudioPlayer.volume = bgmVolume;
      const p = customAudioPlayer.play();
      if (p && p.catch) p.catch(() => { setTimeout(checkAudioHint, 150); });
    })
    .catch(err => {
      const msg = (err && err.message) ? err.message : "";
      failCustomMusic(token, (!msg || /failed to fetch|networkerror|load failed/i.test(msg)) ? "link not found or blocked" : msg);
    });
}

function startCustomBGM(url, token) {
  bgmWanted = true;
  showMusicToast("⏳ Loading custom music…", 0);

  customAudioPlayer.onerror = () => {
    if (token !== bgmToken) return;
    customAudioPlayer.onerror = null;
    playCustomViaBlob(url, token);         // সরাসরি লোড ব্যর্থ → ডাউনলোড করে চালানোর চেষ্টা
  };
  const onPlaying = () => {
    customAudioPlayer.removeEventListener("playing", onPlaying);
    if (bgmPlayingHandler === onPlaying) bgmPlayingHandler = null;
    if (token !== bgmToken) return;
    if (bgmWatchdog) { clearTimeout(bgmWatchdog); bgmWatchdog = null; }
    showMusicToast("🎵 Custom music playing", 2500);
  };
  if (bgmPlayingHandler) customAudioPlayer.removeEventListener("playing", bgmPlayingHandler);
  bgmPlayingHandler = onPlaying;
  customAudioPlayer.addEventListener("playing", onPlaying);

  customAudioPlayer.loop = true;
  customAudioPlayer.preload = "auto";
  customAudioPlayer.src = url;
  customAudioPlayer.volume = bgmVolume;
  try {
    const p = customAudioPlayer.play();
    if (p && p.catch) p.catch(() => { setTimeout(checkAudioHint, 150); });  // autoplay ব্লক হলে "TAP TO ENABLE SOUND"
  } catch (e) {}

  // অনেকক্ষণেও কিছু লোড না হলে (ব্লক/ধীর নেটওয়ার্ক) ডিফল্ট মিউজিকে ফিরে যাবে
  bgmWatchdog = setTimeout(() => {
    if (token !== bgmToken) return;
    if (customAudioPlayer.readyState < 3) failCustomMusic(token, "no response from the link");
  }, CUSTOM_MUSIC_TIMEOUT_MS);
}

function startBGM() {
  stopBGM();
  const token = ++bgmToken;
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'google_original';

  if (selectedType === 'custom') {
    const input = document.getElementById("customBgmUrl");
    const url = normalizeMusicUrl(input ? input.value : "");
    if (!url) {
      showMusicToast("⚠️ No MP3 link pasted. Playing default music.", 5000);
      playBuiltinTrack("google_original");
      return;
    }
    startCustomBGM(url, token);
  } else {
    playBuiltinTrack(selectedType);
  }
}

function stopBGM() {
  bgmToken++;
  bgmWanted = false;
  if (bgmWatchdog) { clearTimeout(bgmWatchdog); bgmWatchdog = null; }
  try { customAudioPlayer.onerror = null; } catch (e) {}
  if (bgmPlayingHandler) { customAudioPlayer.removeEventListener("playing", bgmPlayingHandler); bgmPlayingHandler = null; }
  try { customAudioPlayer.pause(); } catch (e) {}
  showMusicToast("", 0);
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

customAudioPlayer.addEventListener("pause", () => setTimeout(checkAudioHint, 200));
customAudioPlayer.addEventListener("playing", () => setTimeout(checkAudioHint, 50));

// 🔊 গেমের সাউন্ড এফেক্টস (সাপ ঘোরা ও খাওয়ার শব্দ দ্বিগুণ লাউড ও স্বাধীন)
function playSound(type) {
  if (!audioCtx || !isPlaying) return;
  ensureAudioRunning();
  
  try {
    const now = audioCtx.currentTime;

    if (type === "turn") {
      // ↩️ সাপের মোড় ঘোরা সাউন্ড (Volume boosted: 0.16 -> 0.42)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.04);
      
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      
      osc.connect(gain);
      gain.connect(sfxGainNode || audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (type === "eat") {
      // 🍎 খাবার খাওয়ার সাউন্ড: নরম "পপ" + হালকা মিষ্টি "ডিং" (কানে লাগে না)
      // নরম শুরু (attack), শুধু sine তরঙ্গ, উঁচু ঝিনঝিনে frequency কাটা (low-pass), আর প্রতিবার সামান্য আলাদা সুর
      const pitch = 1 + (Math.random() - 0.5) * 0.12;
      const soft = audioCtx.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.setValueAtTime(2000, now);
      soft.Q.setValueAtTime(0.5, now);
      soft.connect(sfxGainNode || audioCtx.destination);

      // ১) নরম পপ: নিচু থেকে হালকা উঠে যায়
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440 * pitch, now);
      osc1.frequency.exponentialRampToValueAtTime(700 * pitch, now + 0.09);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.012);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(soft);
      osc1.start(now);
      osc1.stop(now + 0.21);

      // ২) হালকা "ডিং": একটু পরে, অনেক আস্তে, লম্বা ফেড
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880 * pitch, now + 0.04);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.setValueAtTime(0.0001, now + 0.04);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc2.connect(gain2);
      gain2.connect(soft);
      osc2.start(now);
      osc2.stop(now + 0.27);
    } else if (type === "die") {
      // 💀 মৃত্যুর সাউন্ড
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.32);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      
      osc.connect(gain);
      gain.connect(sfxGainNode || audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.33);
    } else if (type === "win") {
      // 🏆 বোর্ড ১০০% ভরার জয়ের সুর
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, i) => {
        const t0 = now + i * 0.13;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.6, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        o.connect(g);
        g.connect(sfxGainNode || audioCtx.destination);
        o.start(t0);
        o.stop(t0 + 0.3);
      });
    }
  } catch (e) {}
}

// 🎨 থিম (প্রতিবার বোর্ড ১০০% ভরলে পরের থিমে যাবে)
const THEMES = [
  { name: "Google Green", g1: "#8ad44a", g2: "#7ec841", snake: "#3f78fc", outline: "#2b56bf", bg: "#4a752c", bar: "#3b5f20", body: "#243b14" },
  { name: "Neon Night",   g1: "#1a1a40", g2: "#141433", snake: "#00f5d4", outline: "#00a896", bg: "#0b0b24", bar: "#070716", body: "#05050f" },
  { name: "Sunset",       g1: "#ffb36b", g2: "#ffa557", snake: "#7b2cbf", outline: "#4a1a7a", bg: "#c2410c", bar: "#9a3412", body: "#5a1e08" },
  { name: "Ocean",        g1: "#5fc7e8", g2: "#52bcdf", snake: "#ff6b35", outline: "#c4451a", bg: "#0e6b8f", bar: "#0b5370", body: "#06304a" },
  { name: "Lava",         g1: "#3a1a14", g2: "#2f1510", snake: "#ffb703", outline: "#c77d00", bg: "#6b1d0e", bar: "#4a1409", body: "#250a04" },
  { name: "Ice",          g1: "#e3f4ff", g2: "#d2ebfa", snake: "#1d4ed8", outline: "#1e3a8a", bg: "#7fb7d9", bar: "#5f9cc0", body: "#2b4d63" },
  { name: "Sakura",       g1: "#ffd6e5", g2: "#ffc8dc", snake: "#6a4c93", outline: "#46306a", bg: "#e48aa9", bar: "#c96a8c", body: "#6b2f45" },
  { name: "Phosphor",     g1: "#0f2a0f", g2: "#0b230b", snake: "#39ff14", outline: "#1fa30a", bg: "#062006", bar: "#031403", body: "#010a01" }
];
let themeIndex = 0;
let theme = THEMES[0];

function applyTheme(i) {
  themeIndex = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  theme = THEMES[themeIndex];
  const root = document.documentElement.style;
  root.setProperty("--theme-bar", theme.bar); // স্কোরবোর্ড বার; পেছনের ব্যাকগ্রাউন্ড সবসময় কালো
  buildSnakePalette();
}


// 🐍 সাপের রঙ: প্রতি ৪টা খাবার খেলে রঙ বদলায়; প্রতি রাউন্ডে গায়ের প্যাটার্ন বদলায়
const FOODS_PER_COLOR = 4;
const SNAKE_COLORS = [
  { body: "#3f78fc", line: "#2349a8" }, // নীল
  { body: "#ff7a1a", line: "#b04a05" }, // কমলা
  { body: "#a24bff", line: "#661fb5" }, // বেগুনি
  { body: "#ff4fa3", line: "#b82371" }, // গোলাপি
  { body: "#00c2a8", line: "#007a69" }, // টিল
  { body: "#ff3b3b", line: "#a81818" }, // লাল
  { body: "#ffc400", line: "#a67f00" }, // সোনালি
  { body: "#00b8ff", line: "#0073a6" }, // আকাশি
  { body: "#7d4cff", line: "#4a24b8" }, // ইন্ডিগো
  { body: "#ff6f91", line: "#b83a5c" }  // পিচ-গোলাপ
];
let snakePalette = SNAKE_COLORS.slice();
let roundsPlayed = 0;
let patternIndex = 0;
let snakeColorNow = null; // মসৃণভাবে রঙ বদলানোর জন্য বর্তমান রঙ

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function colorDistance(a, b) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}

// থিমের ঘাসের রঙের সাথে মিলে যায় এমন রঙ বাদ (যাতে সাপ সবসময় স্পষ্ট দেখা যায়)
function buildSnakePalette() {
  const good = SNAKE_COLORS.filter(c => colorDistance(c.body, theme.g1) > 120 && colorDistance(c.body, theme.g2) > 120);
  snakePalette = good.length >= 4 ? good : SNAKE_COLORS.slice();
}

function currentSnakeTarget() {
  const idx = Math.floor(currentRunFood / FOODS_PER_COLOR) + roundsPlayed;
  return snakePalette[idx % snakePalette.length];
}

function advanceRound() {
  roundsPlayed++;
  patternIndex = (patternIndex + 1) % SNAKE_PATTERNS.length;
}

// প্রতি ফ্রেমে লক্ষ্য রঙের দিকে একটু একটু এগোয়, তাই রঙ ঝট করে না বদলে মসৃণভাবে বদলায়
function updateSnakeColor() {
  const t = currentSnakeTarget();
  const tb = hexToRgb(t.body), tl = hexToRgb(t.line);
  if (!snakeColorNow) snakeColorNow = { b: { ...tb }, l: { ...tl } };
  const k = 0.16;
  for (const c of ["r", "g", "b"]) {
    snakeColorNow.b[c] += (tb[c] - snakeColorNow.b[c]) * k;
    snakeColorNow.l[c] += (tl[c] - snakeColorNow.l[c]) * k;
  }
  const B = snakeColorNow.b, L = snakeColorNow.l;
  const lum = (0.299 * B.r + 0.587 * B.g + 0.114 * B.b) / 255;
  return {
    body: `rgb(${B.r | 0},${B.g | 0},${B.b | 0})`,
    line: `rgb(${L.r | 0},${L.g | 0},${L.b | 0})`,
    mark: lum > 0.62 ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.68)"
  };
}

// 🎨 গায়ের প্যাটার্ন: r = সাপের শরীরের অর্ধেক প্রস্থ, (dx,dy) = মাথার দিকের দিক
const SNAKE_PATTERNS = [
  { name: "Dots", step: 1, draw(c, x, y, r) { c.beginPath(); c.arc(x, y, r * 0.38, 0, Math.PI * 2); c.fill(); } },
  { name: "Plus", step: 2, draw(c, x, y, r) {
      c.lineWidth = r * 0.3; c.beginPath();
      c.moveTo(x - r * 0.6, y); c.lineTo(x + r * 0.6, y);
      c.moveTo(x, y - r * 0.6); c.lineTo(x, y + r * 0.6); c.stroke(); } },
  { name: "Minus", step: 1, draw(c, x, y, r, dx, dy) {
      c.lineWidth = r * 0.34; c.beginPath();
      c.moveTo(x - dx * r * 0.6, y - dy * r * 0.6); c.lineTo(x + dx * r * 0.6, y + dy * r * 0.6); c.stroke(); } },
  { name: "Diamonds", step: 2, draw(c, x, y, r) {
      c.beginPath(); c.moveTo(x, y - r * 0.6); c.lineTo(x + r * 0.5, y); c.lineTo(x, y + r * 0.6); c.lineTo(x - r * 0.5, y);
      c.closePath(); c.fill(); } },
  { name: "Stripes", step: 2, draw(c, x, y, r, dx, dy) {
      const px = -dy, py = dx; c.lineWidth = r * 0.4; c.beginPath();
      c.moveTo(x - px * r * 0.72, y - py * r * 0.72); c.lineTo(x + px * r * 0.72, y + py * r * 0.72); c.stroke(); } },
  { name: "Stars", step: 2, draw(c, x, y, r) {
      const o = r * 0.62, n = r * 0.2; c.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (Math.PI / 4) * k - Math.PI / 2, rad = k % 2 === 0 ? o : n;
        const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill(); } },
  { name: "Rings", step: 2, draw(c, x, y, r) { c.lineWidth = r * 0.22; c.beginPath(); c.arc(x, y, r * 0.45, 0, Math.PI * 2); c.stroke(); } },
  { name: "Chevrons", step: 2, draw(c, x, y, r, dx, dy) {
      const px = -dy, py = dx; c.lineWidth = r * 0.28; c.beginPath();
      c.moveTo(x - dx * r * 0.35 + px * r * 0.6, y - dy * r * 0.35 + py * r * 0.6);
      c.lineTo(x + dx * r * 0.35, y + dy * r * 0.35);
      c.lineTo(x - dx * r * 0.35 - px * r * 0.6, y - dy * r * 0.35 - py * r * 0.6); c.stroke(); } },
  { name: "Squares", step: 2, draw(c, x, y, r) { c.fillRect(x - r * 0.35, y - r * 0.35, r * 0.7, r * 0.7); } }
];

function drawSnakePattern(col) {
  if (snake.length < 3) return;
  const pat = SNAKE_PATTERNS[patternIndex % SNAKE_PATTERNS.length];
  ctx.save();
  ctx.fillStyle = col.mark;
  ctx.strokeStyle = col.mark;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < snake.length; i++) {
    if (i % pat.step !== 0) continue;
    const tailProgress = i / snake.length;
    const taper = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
    const r = cellSize * 0.76 * taper * 0.5;
    if (r < 5) continue;
    const x = offsetX + snake[i].x * cellSize + cellSize / 2;
    const y = offsetY + snake[i].y * cellSize + cellSize / 2;
    const dx = snake[i - 1].x - snake[i].x;
    const dy = snake[i - 1].y - snake[i].y;
    pat.draw(ctx, x, y, r * 1.25, dx, dy); // একটু বড় করে আঁকা, যাতে লাইভে স্পষ্ট দেখায়
  }
  ctx.restore();
}

// 💬 YouTube Live Chat — সরাসরি YouTube Data API (ফ্রি কোটা; ফোন/ট্যাবে সার্ভার ছাড়াই চলে)
const YT_API = "https://www.googleapis.com/youtube/v3";
const VOTE_REGEX = /^1{1,3}$/;
const CHAT_STORE_KEY = "aiSnakeChatSettings";
let chatSession = 0;      // নতুন কানেকশন শুরু হলে পুরনো পোলিং বন্ধ হবে
let chatTimer = null;
let chatSignature = "";
let chatState = "idle";

function setChatStatus(state, text) {
  chatState = state;
  if (els.chatDot) {
    els.chatDot.dataset.state = state;
    els.chatDot.title = text;
  }
  if (els.chatStartStatus) els.chatStartStatus.innerText = text;
}

function updateVoterCount() {
  if (els.voterCount) els.voterCount.innerText = roundVoters.size;
}

function addVote(rawName) {
  const name = String(rawName || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
  if (!name) return;
  const key = name.toLowerCase();
  if (foods.some(f => f.name && f.name.toLowerCase() === key)) return; // এই নামের ফুড এখনো বোর্ডে আছে
  if (!roundVoters.has(key) && roundVoters.size >= MAX_WAITING_VOTES) return;
  roundVoters.set(key, name);
  updateVoterCount();
}

function extractVideoId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (/^[\w-]{11}$/.test(id)) return id;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/);
    if (m) return m[1];
  } catch (err) {}
  return null;
}

// 💾 এই ডিভাইসে লিংক/কী মনে রাখা (প্রতিবার আবার লিখতে হবে না)
function readChatInputs() {
  return {
    url: els.chatUrl ? els.chatUrl.value.trim() : "",
    key: els.chatKey ? els.chatKey.value.trim() : "",
    interval: els.chatInterval ? parseInt(els.chatInterval.value) || 10000 : 10000
  };
}

function saveChatSettings() {
  try { localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(readChatInputs())); } catch (err) {}
}

function restoreChatSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || "{}");
    if (saved.url && els.chatUrl) els.chatUrl.value = saved.url;
    if (saved.key && els.chatKey) els.chatKey.value = saved.key;
    if (saved.interval && els.chatInterval) els.chatInterval.value = String(saved.interval);
  } catch (err) {}
}

async function ytFetch(path, params, apiKey) {
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${YT_API}/${path}?${qs}`);
  let data = null;
  try { data = await res.json(); } catch (err) {}
  if (!res.ok) {
    const e = new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
    e.status = res.status;
    e.reason = (data && data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason) || "";
    throw e;
  }
  return data;
}

// ❗ এরর → বন্ধুসুলভ বার্তা + আবার চেষ্টা করবে কিনা
function classifyChatError(e) {
  const r = e.reason || "";
  if (e.status === undefined) return { text: "No internet — retrying in 10s", retryMs: 10000, state: "offline" };
  if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(r))
    return { text: "Today's free quota is used up — auto food only. Resets at midnight Pacific Time; retrying every 10 min", retryMs: 600000, state: "error" };
  if (r === "keyInvalid" || /API key not valid/i.test(e.message))
    return { text: "API key is not valid — check the key", retryMs: null, state: "error" };
  if (r === "ipRefererBlocked" || /referer/i.test(e.message))
    return { text: "API key blocks this website — add this site's address in the key's referrer list", retryMs: null, state: "error" };
  if (r === "accessNotConfigured" || (r === "forbidden" && /not been used|disabled/i.test(e.message)))
    return { text: "Turn on 'YouTube Data API v3' for this key's project", retryMs: null, state: "error" };
  if (["liveChatEnded", "liveChatNotFound", "liveChatDisabled"].includes(r))
    return { text: "Live chat has ended or is turned off", retryMs: null, state: "error" };
  return { text: `Chat error: ${e.message}. Retrying in 15s`, retryMs: 15000, state: "error" };
}

function stopChat() {
  chatSession++;
  if (chatTimer) { clearTimeout(chatTimer); chatTimer = null; }
  chatSignature = "";
}

function scheduleChat(session, fn, ms) {
  if (chatTimer) clearTimeout(chatTimer);
  chatTimer = setTimeout(() => { if (session === chatSession) fn(); }, ms);
}

async function connectChat(rawUrl, rawKey, intervalMs) {
  const url = String(rawUrl || "").trim();
  const apiKey = String(rawKey || "").trim();
  const interval = intervalMs || 10000;

  if (!url) { stopChat(); setChatStatus("idle", "No live link — playing with auto food only"); return; }

  const videoId = extractVideoId(url);
  if (!videoId) { stopChat(); setChatStatus("error", "Could not read a video ID from that link"); return; }
  if (!apiKey) { stopChat(); setChatStatus("error", "Paste your YouTube Data API key"); return; }

  // একই সেটিংসে ইতোমধ্যে চললে আবার শুরু করবে না
  const sig = `${videoId}|${apiKey}|${interval}`;
  if (sig === chatSignature && (chatState === "connected" || chatState === "connecting")) return;

  stopChat();
  chatSignature = sig;
  const session = chatSession;
  setChatStatus("connecting", "Connecting…");

  const start = async () => {
    try {
      const data = await ytFetch("videos", { part: "liveStreamingDetails", id: videoId }, apiKey);
      if (session !== chatSession) return;
      const item = data.items && data.items[0];
      if (!item) { setChatStatus("error", "Video not found — check the link"); return; }
      const liveChatId = item.liveStreamingDetails && item.liveStreamingDetails.activeLiveChatId;
      if (!liveChatId) {
        setChatStatus("connecting", "Live not started yet — checking again in 20s");
        scheduleChat(session, start, 20000);
        return;
      }
      pollChat(session, { liveChatId, apiKey, interval, pageToken: null, primed: false });
    } catch (e) {
      if (session !== chatSession) return;
      const c = classifyChatError(e);
      setChatStatus(c.state, c.text);
      if (c.retryMs) scheduleChat(session, start, c.retryMs);
    }
  };
  start();
}

async function pollChat(session, ctx) {
  if (session !== chatSession) return;
  let delay = ctx.interval;
  try {
    const params = { liveChatId: ctx.liveChatId, part: "snippet,authorDetails", maxResults: "200" };
    if (ctx.pageToken) params.pageToken = ctx.pageToken;
    const data = await ytFetch("liveChat/messages", params, ctx.apiKey);
    if (session !== chatSession) return;

    ctx.pageToken = data.nextPageToken || ctx.pageToken;

    // প্রথম ব্যাচ = পুরনো মেসেজ, তাই বাদ; এরপর থেকে শুধু নতুন মেসেজ
    if (ctx.primed) {
      for (const it of (data.items || [])) {
        if (!it.snippet || it.snippet.type !== "textMessageEvent") continue;
        const text = String(
          (it.snippet.textMessageDetails && it.snippet.textMessageDetails.messageText) || it.snippet.displayMessage || ""
        ).trim();
        if (VOTE_REGEX.test(text) && it.authorDetails) addVote(it.authorDetails.displayName);
      }
    }
    ctx.primed = true;

    setChatStatus("connected", "Live chat connected");
    delay = Math.max(ctx.interval, data.pollingIntervalMillis || 0);
  } catch (e) {
    if (session !== chatSession) return;
    const c = classifyChatError(e);
    setChatStatus(c.state, c.text);
    if (!c.retryMs) return;
    delay = c.retryMs;
  }
  scheduleChat(session, () => pollChat(session, ctx), delay);
}

function testChatConnection() {
  const s = readChatInputs();
  saveChatSettings();
  connectChat(s.url, s.key, s.interval);
}

// 🍎 নামহীন অটো ফুড: সবসময় AUTO_FOOD_TARGET টা থাকবে — একটা খেলেই সাথে সাথে নতুন একটা আসে
function refillAutoFoods() {
  let autoCount = foods.filter(f => !f.name).length;
  while (autoCount < AUTO_FOOD_TARGET) {
    if (!spawnFood()) break;
    autoCount++;
  }
}

// 💬 চ্যাটে 1 লিখলেই লাইনের সামনের জনের নামে সাথে সাথে ফুড (প্রতি ~১ সেকেন্ডে একটা)
function drainVotes() {
  if (!isPlaying || isRespawning || isVictory) return;
  refillAutoFoods(); // নিরাপত্তা: কোনো কারণে কম পড়লে পূরণ
  if (roundVoters.size === 0 || foods.length >= MAX_FOODS_ON_BOARD) return;
  const [key, name] = roundVoters.entries().next().value;
  roundVoters.delete(key);
  updateVoterCount();
  spawnFood(name);
}

function startDropTimer() {
  stopDropTimer();
  voteTimer = setInterval(drainVotes, VOTE_DRAIN_MS);
}

function stopDropTimer() {
  if (voteTimer) { clearInterval(voteTimer); voteTimer = null; }
}

function addPopup(text, gx, gy) {
  popups.push({ text, gx, gy, born: performance.now() });
}

// 🗣️ মেয়েলি ভয়েস রিমাইন্ডার + রাউন্ড শেষে মাসকট
// ভয়েস: ফোনের নিজের মেয়েলি TTS ভয়েস। চাইলে নিজের রেকর্ড করা ফাইল voice-like.mp3 / voice-subscribe.mp3 দিলে সেটাই বাজবে।
const LIKE_REMINDER_MS = 3 * 60 * 1000; // প্রতি ৩ মিনিটে "Hit the like button"
const OUTRO_MAX_MS = 10000;
const VOICE_LINES = {
  like: { text: "Hit the like button!", file: "voice-like.mp3" },
  subscribe: { text: "Please subscribe to the channel and like the stream!", file: "voice-subscribe.mp3" }
};
let voiceEnabled = true;
let likeTimer = null;
let outroActive = false;
let outroFailsafe = null;
let voiceAudio = null;

// নিজের ছবি দিতে চাইলে mascot.png ফাইল রাখুন, নইলে বিল্ট-ইন কার্টুন মাসকট দেখাবে
function initMascotImage() {
  if (!els.mascotImg) return;
  const probe = new Image();
  probe.onload = () => {
    els.mascotImg.src = "mascot.png";
    els.mascotImg.classList.remove("hidden");
    if (els.mascotSvg) els.mascotSvg.classList.add("hidden");
  };
  probe.src = "mascot.png";
}

function duckMusic(on) {
  const factor = on ? 0.08 : 1;   // ভয়েসের সময় মিউজিক প্রায় নিঃশব্দ, ফলে ভয়েস অনেক স্পষ্ট ও জোরালো
  try {
    if (bgmGainNode && audioCtx) {
      bgmGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      bgmGainNode.gain.setTargetAtTime(bgmVolume * factor, audioCtx.currentTime, 0.1);
    }
    if (sfxGainNode && audioCtx) {
      sfxGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      sfxGainNode.gain.setTargetAtTime(SFX_BASE_GAIN * (on ? 0.25 : 1), audioCtx.currentTime, 0.1);
    }
  } catch (e) {}
  try { customAudioPlayer.volume = bgmVolume * factor; } catch (e) {}
}

// নিজের রেকর্ড করা mp3 ভয়েসকে ~২ গুণ জোরালো করা (ব্রাউজারের TTS ভয়েস ইতিমধ্যে সর্বোচ্চ ভলিউমে)
let voiceBoostGain = null;
function boostVoiceElement(a) {
  try {
    if (!audioCtx) return;
    if (!voiceBoostGain) {
      voiceBoostGain = audioCtx.createGain();
      voiceBoostGain.gain.value = 2.2;
      const comp = audioCtx.createDynamicsCompressor();
      voiceBoostGain.connect(comp);
      comp.connect(audioCtx.destination);
    }
    audioCtx.createMediaElementSource(a).connect(voiceBoostGain);
  } catch (e) {}
}

function pickFemaleVoice() {
  if (!("speechSynthesis" in window)) return null;
  const en = (window.speechSynthesis.getVoices() || []).filter(v => /^en/i.test(v.lang));
  const femaleRe = /zira|aria|jenny|samantha|susan|hazel|heera|neerja|karen|moira|tessa|fiona|victoria|allison|joanna|salli|kendra|kimberly|google us english|google uk english female/i;
  return en.find(v => /female/i.test(v.name)) || en.find(v => femaleRe.test(v.name)) || en[0] || null;
}

let lastUtterance = null; // ব্রাউজার যেন utterance মুছে না ফেলে (garbage-collect bug)

// 🔓 Safari/Firefox/Edge: প্রথমবার ভয়েস চালাতে ইউজারের ক্লিকের ভেতরেই speak() ডাকতে হয়। START চাপার সময় নিঃশব্দ ভয়েস দিয়ে আনলক করা হচ্ছে।
function unlockSpeech() {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function speakText(text, done) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { if (done) done(); return; }
  try {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickFemaleVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
    u.pitch = 1.3;   // হালকা মিষ্টি সুর
    u.rate = 0.9;    // একটু ধীরে, নরম
    u.volume = 1;
    u.onend = () => { if (done) done(); };
    u.onerror = () => { if (done) done(); };
    lastUtterance = u;

    const go = () => {
      try {
        if (synth.paused) synth.resume();
        synth.speak(u);
      } catch (e) { if (done) done(); }
    };
    // cancel() এর সাথে সাথে speak() ডাকলে অনেক ব্রাউজারে ভয়েস হারিয়ে যায়, তাই একটু দেরি
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(go, 120);
    } else {
      go();
    }
  } catch (e) { if (done) done(); }
}

function setTalking(on) {
  if (els.mascotPanel) els.mascotPanel.classList.toggle("talking", on);
}

function playVoiceLine(kind, onDone) {
  const line = VOICE_LINES[kind];
  let finished = false;
  let fellBack = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    duckMusic(false);
    setTalking(false);
    if (onDone) onDone();
  };
  const fallback = () => {
    if (fellBack || finished) return;
    fellBack = true;
    speakText(line.text, finish);
  };

  duckMusic(true);
  setTalking(true);
  setTimeout(finish, 12000); // নিরাপত্তা: আটকে গেলেও ছাড়বে

  try {
    const a = new Audio(line.file);
    boostVoiceElement(a);
    voiceAudio = a;
    a.onended = finish;
    a.onerror = fallback; // ফাইল না থাকলে ব্রাউজারের ভয়েস
    const p = a.play && a.play();
    if (p && p.catch) p.catch(fallback);
    else if (!p) fallback();
  } catch (e) { fallback(); }
}

function startReminderTimer() {
  stopReminderTimer();
  likeTimer = setInterval(() => {
    if (!isPlaying || !voiceEnabled || outroActive) return;
    playVoiceLine("like");
  }, LIKE_REMINDER_MS);
}

function stopReminderTimer() {
  if (likeTimer) { clearInterval(likeTimer); likeTimer = null; }
}

// 🎀 রাউন্ড শেষ (বোর্ড ১০০% / সাপ মারা গেলে / সময় শেষ): মাসকট + "Please subscribe..." ভয়েস
function showRoundOutro() {
  if (!voiceEnabled || outroActive || !els.mascotPanel) return;
  outroActive = true;
  els.mascotPanel.classList.remove("hidden");
  outroFailsafe = setTimeout(() => hideOutro(), OUTRO_MAX_MS);
  playVoiceLine("subscribe", () => setTimeout(() => hideOutro(), 1200));
}

function hideOutro() {
  if (outroFailsafe) { clearTimeout(outroFailsafe); outroFailsafe = null; }
  outroActive = false;
  setTalking(false);
  if (els.mascotPanel) els.mascotPanel.classList.add("hidden");
}

function stopAllVoice() {
  try { if (voiceAudio) voiceAudio.pause(); } catch (e) {}
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) {}
  duckMusic(false);
}

// 🏆 বোর্ড ১০০% ভরে গেলে
function handleVictory() {
  if (isVictory) return;
  isVictory = true;
  boardsCompleted++;
  playSound("win");
  setTimeout(showRoundOutro, 1200); // জয়ের সুরের পর মাসকট

  const nextName = THEMES[(themeIndex + 1) % THEMES.length].name;
  if (els.victorySub) els.victorySub.innerText = `Board #${boardsCompleted} complete · next theme: ${nextName}`;
  if (els.victoryOverlay) els.victoryOverlay.classList.remove("hidden");

  setTimeout(() => {
    if (els.victoryOverlay) els.victoryOverlay.classList.add("hidden");
    if (isPlaying) {
      applyTheme(themeIndex + 1);
      advanceRound();
      initSnakeCycle();
    }
    isVictory = false;
  }, VICTORY_PAUSE_MS);
}

// ⌨️ টেস্ট: কিবোর্ডে T চাপলে ফেক ভোট পড়বে (লাইভ ছাড়া চেক করার জন্য)
document.addEventListener("keydown", (e) => {
  if (e.key === "t" || e.key === "T") {
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    addVote("Viewer" + Math.floor(Math.random() * 90 + 10));
  }
});

// 🖱️ প্রতি ৩০ সেকেন্ড পর পর মাউস এসে SUBSCRIBE ক্লিক করবে
function initSubscribeAnimation() {
  if (!els.hudSubBtn || !els.hudCursor) return;

  function performAutoSubscribeClick() {
    if (!isPlaying) return;

    els.hudCursor.classList.add("cursor-active");

    setTimeout(() => {
      els.hudCursor.classList.add("cursor-click");
      els.hudSubBtn.classList.add("clicked");

      setTimeout(() => {
        els.hudSubBtn.classList.add("subscribed");
        if (els.hudSubText) els.hudSubText.innerText = "SUBSCRIBED";
        if (els.hudBellIcon) els.hudBellIcon.classList.add("bell-ring");
        els.hudCursor.classList.remove("cursor-click");
      }, 220);

      setTimeout(() => {
        els.hudCursor.classList.remove("cursor-active");
      }, 1200);

      setTimeout(() => {
        els.hudSubBtn.classList.remove("subscribed", "clicked");
        if (els.hudSubText) els.hudSubText.innerText = "SUBSCRIBE";
        if (els.hudBellIcon) els.hudBellIcon.classList.remove("bell-ring");
      }, 14000);

    }, 600);
  }

  setTimeout(performAutoSubscribeClick, 7000);
  setInterval(performAutoSubscribeClick, 30000);
}

let fullscreenWanted = false;

function isFullscreenNow() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// 🖥️ ফুলস্ক্রিন থেকে বেরিয়ে গেলে (যেমন Back চাপলে) স্ক্রিনের যেকোনো জায়গায় ট্যাপ করলেই আবার ফুলস্ক্রিন
document.addEventListener("click", () => {
  if (isPlaying && fullscreenWanted && !isFullscreenNow()) triggerFullscreen();
});

// ⬅️ Back চাপলে যেন পেজ ছেড়ে চলে না যায় (গেম হারিয়ে নতুন করে শুরু করতে না হয়)
window.addEventListener("popstate", () => {
  if (isPlaying) {
    try { history.pushState({ snake: 1 }, ""); } catch (err) {}
  }
});

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
  unlockSpeech();
  requestWakeLock();
  
  fullscreenWanted = !!(els.fullscreenToggle && els.fullscreenToggle.checked);
  if (fullscreenWanted) {
    triggerFullscreen();
  }
  try { history.pushState({ snake: 1 }, ""); } catch (err) {}

  els.startScreen.classList.add("hidden");
  els.app.classList.remove("hidden");
  
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  
  simulationStartTime = Date.now();
  currentRunFood = 0;
  maxFoodSingleRun = 0;
  isRespawning = false;
  isVictory = false;
  boardsCompleted = 0;
  roundsPlayed = 0;
  patternIndex = 0;
  snakeColorNow = null;
  roundVoters.clear();
  updateVoterCount();
  applyTheme(0);
  if (els.victoryOverlay) els.victoryOverlay.classList.add("hidden");

  saveChatSettings();
  { const cs = readChatInputs(); connectChat(cs.url, cs.key, cs.interval); }
  startDropTimer();
  voiceEnabled = !els.voiceToggle || els.voiceToggle.checked;
  hideOutro();
  startReminderTimer();

  initSnakeCycle();
  initSubscribeAnimation();
  isPlaying = true;
  startBGM();
  setTimeout(checkAudioHint, 500);
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
  foods = [];
  popups.length = 0;
  refillAutoFoods();
  updateHUD();
}

function getEmptyCells() {
  const blocked = new Set();
  snake.forEach(seg => blocked.add(seg.y * cols + seg.x));
  foods.forEach(f => blocked.add(f.y * cols + f.x));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!blocked.has(r * cols + c)) cells.push({ x: c, y: r });
    }
  }
  return cells;
}

// name দিলে সেটা চ্যাট-ভিউয়ারের নামের ফুড হবে
function spawnFood(name) {
  if (foods.length >= MAX_FOODS_ON_BOARD) return null;
  const emptyCells = getEmptyCells();
  if (emptyCells.length === 0) return null;

  const foodEmojis = ["🍎", "🌶️", "🍇", "🌟"];
  const chosenEmoji = foodEmojis[Math.floor(Math.random() * foodEmojis.length)];
  const pos = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const f = { x: pos.x, y: pos.y, emoji: chosenEmoji, name: name || null };
  foods.push(f);
  return f;
}

// 🤖 HAMILTONIAN CYCLE + SHORTCUT AI
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
  const foodIdxs = foods.map(f => H_GRID[f.y][f.x]);
  const nearestFoodDist = (fromIdx) =>
    foodIdxs.length ? Math.min(...foodIdxs.map(i => cycleDist(fromIdx, i))) : TOTAL_CELLS;

  const distHeadToTail = cycleDist(headIdx, tailIdx);
  const distHeadToFood = nearestFoodDist(headIdx);

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
    const distNextToFood = nearestFoodDist(cand.nextIdx);

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
  setTimeout(showRoundOutro, 1200);
  
  if (currentRunFood > maxFoodSingleRun) {
    maxFoodSingleRun = currentRunFood;
  }
  updateHUD();

  if (els.goScoreVal) els.goScoreVal.innerText = currentRunFood;
  if (els.gameOverOverlay) els.gameOverOverlay.classList.remove("hidden");

  setTimeout(() => {
    if (els.gameOverOverlay) els.gameOverOverlay.classList.add("hidden");
    if (isPlaying) {
      advanceRound();
      initSnakeCycle();
      isRespawning = false;
    }
  }, 2500);
}

function updateSnakePhysics() {
  if (isRespawning || isVictory) return;

  const nextDir = getNextAIMove();

  direction = nextDir; // (মোড় ঘোরার সাউন্ড বন্ধ করা হয়েছে)

  const newHead = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  // লেজ সরে যাবে (খাবার না খেলে), তাই লেজের ঘরে ঢোকা মৃত্যু নয়
  const willEat = foods.some(f => f.x === newHead.x && f.y === newHead.y);
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);

  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows || bodyToCheck.some(s => s.x === newHead.x && s.y === newHead.y)) {
    handleSnakeDeath();
    return;
  }

  snake.unshift(newHead);

  const eatenIdx = foods.findIndex(f => f.x === newHead.x && f.y === newHead.y);
  if (eatenIdx !== -1) {
    const eaten = foods.splice(eatenIdx, 1)[0];
    currentRunFood++;
    if (currentRunFood > maxFoodSingleRun) {
      maxFoodSingleRun = currentRunFood;
    }
    playSound("eat");
    if (eaten.name) addPopup(`${eaten.name} 😋`, newHead.x, newHead.y);
    refillAutoFoods(); // একটা খেলেই সাথে সাথে নতুন ফুড
  } else {
    snake.pop();
  }

  updateHUD();

  if (snake.length >= TOTAL_CELLS) handleVictory();
}

function updateHUD() {
  els.topFoodCount.innerText = currentRunFood;
  els.topBestCount.innerText = maxFoodSingleRun;
}

function endTournament() {
  isPlaying = false;
  stopDropTimer();
  stopReminderTimer();
  releaseWakeLock();
  stopBGM();
  showSoundHint(false);
  showRoundOutro();
  if (els.podium1Name) els.podium1Name.innerText = `${maxFoodSingleRun} Foods Collected`;
  if (els.winnerOverlay) els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  releaseWakeLock();
  stopDropTimer();
  stopReminderTimer();
  stopAllVoice();
  hideOutro();
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

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  // ১. ডুয়াল গ্রিন গ্রাস
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? theme.g1 : theme.g2;
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
  }

  // ২. খাদ্য
  ctx.font = `${Math.floor(cellSize * 0.85)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of foods) {
    const fx = offsetX + f.x * cellSize + cellSize / 2;
    const fy = offsetY + f.y * cellSize + cellSize / 2;
    if (f.name) {
      // চ্যাটের কারো নামের ফুডে সাদা স্পন্দিত রিং
      ctx.beginPath();
      ctx.arc(fx, fy, cellSize * 0.47 + Math.sin(time / 220) * cellSize * 0.03, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(2, cellSize * 0.05);
      ctx.stroke();
    }
    ctx.fillText(f.emoji, fx, fy);
  }

  // ৩. রিবন স্নেক বডি (রঙ প্রতি ৪ খাবারে বদলায়)
  const snakeCol = updateSnakeColor();
  if (snake.length > 1) {
    for (let i = snake.length - 2; i >= 0; i--) {
      const p1 = { x: offsetX + snake[i].x * cellSize + cellSize / 2, y: offsetY + snake[i].y * cellSize + cellSize / 2 };
      const p2 = { x: offsetX + snake[i + 1].x * cellSize + cellSize / 2, y: offsetY + snake[i + 1].y * cellSize + cellSize / 2 };
      
      const tailProgress = (i + 1) / snake.length;
      const taperFactor = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
      const strokeW = cellSize * 0.76 * taperFactor;

      ctx.beginPath();
      ctx.strokeStyle = snakeCol.line;
      ctx.lineWidth = strokeW + 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let i = snake.length - 2; i >= 0; i--) {
      const p1 = { x: offsetX + snake[i].x * cellSize + cellSize / 2, y: offsetY + snake[i].y * cellSize + cellSize / 2 };
      const p2 = { x: offsetX + snake[i + 1].x * cellSize + cellSize / 2, y: offsetY + snake[i + 1].y * cellSize + cellSize / 2 };
      
      const tailProgress = (i + 1) / snake.length;
      const taperFactor = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
      const strokeW = cellSize * 0.76 * taperFactor;

      ctx.beginPath();
      ctx.strokeStyle = snakeCol.body;
      ctx.lineWidth = strokeW;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  drawSnakePattern(snakeCol);

  // ৪. স্নেক হেড
  const head = snake[0];
  const hx = offsetX + head.x * cellSize + cellSize / 2;
  const hy = offsetY + head.y * cellSize + cellSize / 2;

  // 👅 লাল চেরা জিভ
  const tongueCycle = (Date.now() % 2400);
  if (tongueCycle < 500) {
    const tongueProgress = Math.sin((tongueCycle / 500) * Math.PI);
    const tongueLen = (cellSize * 0.55) * tongueProgress;
    const forkLen = cellSize * 0.18 * tongueProgress;

    const baseTx = hx + direction.x * (cellSize * 0.38);
    const baseTy = hy + direction.y * (cellSize * 0.38);
    const tipTx = baseTx + direction.x * tongueLen;
    const tipTy = baseTy + direction.y * tongueLen;

    ctx.save();
    ctx.strokeStyle = "#ff2244";
    ctx.fillStyle = "#ff2244";
    ctx.lineWidth = Math.max(2, cellSize * 0.08);
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(baseTx, baseTy);
    ctx.lineTo(tipTx, tipTy);
    ctx.stroke();

    const perpX = -direction.y;
    const perpY = direction.x;

    const fork1X = tipTx + (direction.x * forkLen) + (perpX * forkLen);
    const fork1Y = tipTy + (direction.y * forkLen) + (perpY * forkLen);
    const fork2X = tipTx + (direction.x * forkLen) - (perpX * forkLen);
    const fork2Y = tipTy + (direction.y * forkLen) - (perpY * forkLen);

    ctx.beginPath();
    ctx.moveTo(tipTx, tipTy);
    ctx.lineTo(fork1X, fork1Y);
    ctx.moveTo(tipTx, tipTy);
    ctx.lineTo(fork2X, fork2Y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = snakeCol.body;
  ctx.beginPath();
  ctx.arc(hx, hy, cellSize * 0.44, 0, Math.PI * 2);
  ctx.fill();

  // 👀 চোখ
  const eyeR = cellSize * 0.22;
  const pupilR = cellSize * 0.11;
  const highlightR = cellSize * 0.045;
  
  let lx = hx, ly = hy, rx = hx, ry = hy;
  const eyeOffsetSide = cellSize * 0.24;
  const eyeOffsetForward = cellSize * 0.14;

  if (direction.x === 1) {
    lx = hx + eyeOffsetForward; ly = hy - eyeOffsetSide;
    rx = hx + eyeOffsetForward; ry = hy + eyeOffsetSide;
  } else if (direction.x === -1) {
    lx = hx - eyeOffsetForward; ly = hy - eyeOffsetSide;
    rx = hx - eyeOffsetForward; ry = hy + eyeOffsetSide;
  } else if (direction.y === 1) {
    lx = hx - eyeOffsetSide; ly = hy + eyeOffsetForward;
    rx = hx + eyeOffsetSide; ry = hy + eyeOffsetForward;
  } else {
    lx = hx - eyeOffsetSide; ly = hy - eyeOffsetForward;
    rx = hx + eyeOffsetSide; ry = hy - eyeOffsetForward;
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(lx, ly, eyeR, 0, Math.PI * 2);
  ctx.arc(rx, ry, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#081438";
  const pOffX = direction.x * (eyeR * 0.32);
  const pOffY = direction.y * (eyeR * 0.32);
  ctx.beginPath();
  ctx.arc(lx + pOffX, ly + pOffY, pupilR, 0, Math.PI * 2);
  ctx.arc(rx + pOffX, ry + pOffY, pupilR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(lx + pOffX - 1.5, ly + pOffY - 1.5, highlightR, 0, Math.PI * 2);
  ctx.arc(rx + pOffX - 1.5, ry + pOffY - 1.5, highlightR, 0, Math.PI * 2);
  ctx.fill();

  drawFoodLabels();
  drawPopups(time);

  requestAnimationFrame(gameLoop);
}

function drawFoodLabels() {
  const fontSize = Math.max(12, Math.floor(cellSize * 0.27));
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const f of foods) {
    if (!f.name) continue;
    let label = f.name;
    if (label.length > MAX_NAME_CHARS) label = label.slice(0, MAX_NAME_CHARS - 1) + "…";

    const w = ctx.measureText(label).width;
    const fx = offsetX + f.x * cellSize + cellSize / 2;
    const below = f.y < rows - 1;
    const fy = offsetY + f.y * cellSize + cellSize / 2 + (below ? cellSize * 0.66 : -cellSize * 0.66);
    const minX = offsetX + w / 2 + 3;
    const maxX = offsetX + squareArenaSize - w / 2 - 3;
    const x = Math.min(Math.max(fx, minX), Math.max(minX, maxX));

    ctx.lineWidth = fontSize * 0.3;
    ctx.strokeStyle = "rgba(0,0,0,0.78)";
    ctx.strokeText(label, x, fy);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, fy);
  }
}

function drawPopups(now) {
  const life = 1800;
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    const age = now - p.born;
    if (age > life) { popups.splice(i, 1); continue; }
    const t = age / life;
    const fontSize = Math.max(14, Math.floor(cellSize * 0.34));
    const x = Math.min(Math.max(offsetX + p.gx * cellSize + cellSize / 2, offsetX + cellSize), offsetX + squareArenaSize - cellSize);
    const y = offsetY + p.gy * cellSize - t * cellSize * 1.1;
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = fontSize * 0.3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(p.text, x, y);
    ctx.restore();
  }
}



// 👆 টেস্ট: নিচের 🎯 কাউন্টারে ট্যাপ করলে ফেক ভোট পড়বে (ফোন/ট্যাবে চেক করার জন্য)
if (els.voterCount && els.voterCount.parentElement) {
  els.voterCount.parentElement.addEventListener("click", () => addVote("Viewer" + Math.floor(Math.random() * 90 + 10)));
}
restoreChatSettings();
initMascotImage();
// Chrome-এ ভয়েস লিস্ট দেরিতে লোড হয়, তাই আগেভাগে ডাকা
if ("speechSynthesis" in window) { window.speechSynthesis.getVoices(); }

window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;
window.testChatConnection = testChatConnection;
