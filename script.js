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
  fbConfig: document.getElementById("fbConfig"),
  fbStartStatus: document.getElementById("fbStartStatus"),
  fbBadge: document.getElementById("fbBadge"),
  chatStartStatus: document.getElementById("chatStartStatus"),
  chatDot: document.getElementById("chatDot"),
  voterCount: document.getElementById("voterCount"),
  victoryOverlay: document.getElementById("victoryOverlay"),
  victorySub: document.getElementById("victorySub")
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
const DROP_INTERVAL_MS = 5000;   // কত মিলিসেকেন্ড পর পর নতুন ফুড পড়বে (কম = দ্রুত বোর্ড ভরবে)
const AUTO_FOOD_TARGET = 3;      // নামহীন অটো ফুড সর্বোচ্চ কয়টা বোর্ডে থাকবে
const MAX_FOODS_ON_BOARD = 10;   // মোট ফুড সর্বোচ্চ
const VICTORY_PAUSE_MS = 6000;   // ১০০% ভরার পর কতক্ষণ জয়ের স্ক্রিন
const MAX_NAME_CHARS = 12;       // বোর্ডে নামের সর্বোচ্চ অক্ষর
let dropTimer = null;
let isVictory = false;
let boardsCompleted = 0;
const roundVoters = new Map();   // এই রাউন্ডে যারা 1 লিখেছে
const popups = [];
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

// 🔊 অডিও ইঞ্জিনের আলাদা অডিও চ্যানেল (BGM Gain & SFX Gain Separated)
let audioCtx = null;
let bgmGainNode = null;
let sfxGainNode = null;
let bgmVolume = 0.85;

const customAudioPlayer = new Audio();
customAudioPlayer.loop = true;

function initAudioEngine() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    
    // 🎵 ১. ব্যাকগ্রাউন্ড মিউজিক চ্যানেল (ভলিউম স্লাইডার দ্বারা নিয়ন্ত্রিত)
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.setValueAtTime(bgmVolume, audioCtx.currentTime);
    bgmGainNode.connect(audioCtx.destination);

    // 🔊 ২. গেম সাউন্ড এফেক্টস চ্যানেল (সম্পূর্ণ স্বাধীন ও উচ্চ ভলিউমে ফিক্সড)
    sfxGainNode = audioCtx.createGain();
    sfxGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    sfxGainNode.connect(audioCtx.destination);
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

function startBGM() {
  stopBGM();
  const selectedType = els.bgmSelect ? els.bgmSelect.value : 'google_original';

  if (selectedType === 'custom') {
    let url = document.getElementById("customBgmUrl").value.trim();
    if (url) {
      customAudioPlayer.src = url;
      customAudioPlayer.volume = bgmVolume;
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
        gain.connect(bgmGainNode); // 🎶 Connected strictly to BGM Node
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
          bassGain.connect(bgmGainNode); // 🎶 Connected strictly to BGM Node
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

// 🔊 গেমের সাউন্ড এফেক্টস (সাপ ঘোরা ও খাওয়ার শব্দ দ্বিগুণ লাউড ও স্বাধীন)
function playSound(type) {
  if (!audioCtx || !isPlaying) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  
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
      // 🍎 খাবার খাওয়ার সাউন্ড (Volume boosted: 0.48 -> 0.88)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(620, now);
      osc1.frequency.exponentialRampToValueAtTime(1250, now + 0.10);
      
      gain1.gain.setValueAtTime(0.88, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
      
      osc1.connect(gain1);
      gain1.connect(sfxGainNode || audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.11);

      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(310, now);
      osc2.frequency.exponentialRampToValueAtTime(625, now + 0.08);

      gain2.gain.setValueAtTime(0.50, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc2.connect(gain2);
      gain2.connect(sfxGainNode || audioCtx.destination);
      osc2.start(now);
      osc2.stop(now + 0.09);
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
  root.setProperty("--theme-bg", theme.bg);
  root.setProperty("--theme-bar", theme.bar);
  root.setProperty("--theme-body", theme.body);
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
  roundVoters.set(name.toLowerCase(), name);
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
        if (VOTE_REGEX.test(text) && it.authorDetails) submitVote(it.authorDetails.displayName);
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

// 🔥 Firebase Realtime Database (ঐচ্ছিক)
// ভোট ফ্লো: YouTube চ্যাট → Firebase (votes/তারিখ) → গেমে নামসহ ফুড
// প্রতিদিনের ডাটা আলাদা তারিখ-নোডে থাকে; গেম চালু হলে ও মধ্যরাতে পুরনো দিনগুলো মুছে ফেলে
const FB_VERSION = "10.14.1";
const FB_STORE_KEY = "aiSnakeFirebaseConfig";
let fb = null;      // { api, db, day, unsub, dayTimer, sig, sessionStart }
let fbToken = 0;

function setFirebaseStatus(state, text) {
  if (els.fbStartStatus) els.fbStartStatus.innerText = text;
  if (els.fbBadge) els.fbBadge.classList.toggle("hidden", state !== "connected");
}

function localDayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// firebaseConfig ব্লক পুরোটা পেস্ট করলেই চলবে (JS অবজেক্ট বা JSON — দুটোই)
function parseFirebaseConfig(text) {
  const raw = String(text || "");
  const cfg = {};
  for (const m of raw.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) cfg[m[1]] = m[2];
  if (!cfg.databaseURL) {
    const u = raw.match(/https:\/\/[\w.-]+\.(?:firebaseio\.com|firebasedatabase\.app)/);
    if (u) cfg.databaseURL = u[0];
  }
  return cfg.apiKey && cfg.databaseURL ? cfg : null;
}

async function loadFirebaseModules() {
  const imp = window.__fbImport || ((u) => import(u));
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const [app, db] = await Promise.all([imp(`${base}/firebase-app.js`), imp(`${base}/firebase-database.js`)]);
  return { app, db };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function friendlyFirebaseError(e) {
  const m = String((e && e.message) || e);
  if (/permission/i.test(m)) return "Firebase rules block access — paste the rules in Realtime Database → Rules";
  if (/timeout|offline/i.test(m)) return "Could not reach Firebase — check databaseURL and internet";
  if (/Failed to fetch|import|module/i.test(m)) return "Could not load Firebase library — check internet";
  return "Firebase error: " + m;
}

function teardownFirebase() {
  if (fb) {
    try { if (fb.unsub) fb.unsub(); } catch (e) {}
    if (fb.dayTimer) clearInterval(fb.dayTimer);
  }
  fb = null;
}

// 🧹 আজকের আগের সব দিনের ভোট মুছে ফেলা
async function cleanupOldDays(f) {
  const { ref, get, remove } = f.api;
  const today = localDayKey();
  const snap = await withTimeout(get(ref(f.db, "days")), 10000);
  const old = [];
  if (snap.exists()) {
    snap.forEach((ch) => { if (ch.key < today) old.push(ch.key); });
  }
  await Promise.all(old.flatMap((d) => [remove(ref(f.db, "votes/" + d)), remove(ref(f.db, "days/" + d))]));
  return old.length;
}

function subscribeToday(f) {
  const { ref, query, orderByChild, startAt, onChildAdded, set } = f.api;
  if (f.unsub) { try { f.unsub(); } catch (e) {} }
  f.day = localDayKey();
  set(ref(f.db, "days/" + f.day), true).catch(() => {});
  const q = query(ref(f.db, "votes/" + f.day), orderByChild("t"), startAt(f.sessionStart));
  f.unsub = onChildAdded(
    q,
    (snap) => {
      const v = snap.val();
      if (v && v.name) addVote(v.name);
    },
    (err) => setFirebaseStatus("error", friendlyFirebaseError(err))
  );
}

async function initFirebase(text) {
  const token = ++fbToken;
  const raw = String(text || "").trim();

  if (!raw) {
    teardownFirebase();
    setFirebaseStatus("idle", "Firebase not used — votes go straight to the game");
    return;
  }
  const cfg = parseFirebaseConfig(raw);
  if (!cfg) {
    teardownFirebase();
    setFirebaseStatus("error", "Config needs apiKey and databaseURL — paste the whole firebaseConfig");
    return;
  }
  const sig = JSON.stringify(cfg);
  if (fb && fb.sig === sig) { setFirebaseStatus("connected", "Firebase connected"); return; }

  teardownFirebase();
  setFirebaseStatus("connecting", "Connecting to Firebase…");

  try {
    const { app, db } = await loadFirebaseModules();
    if (token !== fbToken) return;

    const appName = "snake-" + (cfg.projectId || "app");
    const fbApp = app.getApps().some((a) => a.name === appName) ? app.getApp(appName) : app.initializeApp(cfg, appName);
    const f = { api: db, db: db.getDatabase(fbApp), sig, sessionStart: Date.now() - 3000, day: "", unsub: null, dayTimer: null };

    const removed = await cleanupOldDays(f);
    if (token !== fbToken) return;

    subscribeToday(f);
    f.dayTimer = setInterval(async () => {
      if (localDayKey() === f.day) return;
      subscribeToday(f);
      try { await cleanupOldDays(f); } catch (e) {}
    }, 60000);

    fb = f;
    setFirebaseStatus("connected", removed ? `Firebase connected — deleted ${removed} old day(s)` : "Firebase connected");
  } catch (e) {
    if (token !== fbToken) return;
    teardownFirebase();
    setFirebaseStatus("error", friendlyFirebaseError(e));
  }
}

function testFirebaseConnection() {
  const text = els.fbConfig ? els.fbConfig.value : "";
  try { localStorage.setItem(FB_STORE_KEY, text); } catch (e) {}
  initFirebase(text);
}

function restoreFirebaseSettings() {
  try {
    const saved = localStorage.getItem(FB_STORE_KEY);
    if (saved && els.fbConfig) els.fbConfig.value = saved;
  } catch (e) {}
}

// 🗳️ ভোট জমা: Firebase চালু থাকলে সেখানে লিখবে (গেম সেখান থেকেই পড়বে), না থাকলে সরাসরি গেমে
function submitVote(rawName) {
  const name = String(rawName || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
  if (!name) return;
  if (fb) {
    try {
      fb.api.push(fb.api.ref(fb.db, "votes/" + fb.day), { name, t: Date.now() }).catch(() => addVote(name));
      return;
    } catch (e) {}
  }
  addVote(name);
}

// 🍎 প্রতি কয়েক সেকেন্ডে অটো ফুড + চ্যাটের ভোটারদের মধ্য থেকে একজনের নামে এক্সট্রা ফুড
function dropTick() {
  if (!isPlaying || isRespawning || isVictory) return;

  const autoCount = foods.filter(f => !f.name).length;
  if (autoCount < AUTO_FOOD_TARGET) spawnFood();

  if (roundVoters.size > 0) {
    const names = Array.from(roundVoters.values());
    const winner = names[Math.floor(Math.random() * names.length)];
    roundVoters.clear();
    updateVoterCount();
    spawnFood(winner);
  }
}

function startDropTimer() {
  stopDropTimer();
  dropTimer = setInterval(dropTick, DROP_INTERVAL_MS);
}

function stopDropTimer() {
  if (dropTimer) { clearInterval(dropTimer); dropTimer = null; }
}

function addPopup(text, gx, gy) {
  popups.push({ text, gx, gy, born: performance.now() });
}

// 🏆 বোর্ড ১০০% ভরে গেলে
function handleVictory() {
  if (isVictory) return;
  isVictory = true;
  boardsCompleted++;
  playSound("win");

  const nextName = THEMES[(themeIndex + 1) % THEMES.length].name;
  if (els.victorySub) els.victorySub.innerText = `Board #${boardsCompleted} complete · next theme: ${nextName}`;
  if (els.victoryOverlay) els.victoryOverlay.classList.remove("hidden");

  setTimeout(() => {
    if (els.victoryOverlay) els.victoryOverlay.classList.add("hidden");
    if (isPlaying) {
      applyTheme(themeIndex + 1);
      initSnakeCycle();
    }
    isVictory = false;
  }, VICTORY_PAUSE_MS);
}

// ⌨️ টেস্ট: কিবোর্ডে T চাপলে ফেক ভোট পড়বে (লাইভ ছাড়া চেক করার জন্য)
document.addEventListener("keydown", (e) => {
  if (e.key === "t" || e.key === "T") {
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    submitVote("Viewer" + Math.floor(Math.random() * 90 + 10));
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
  requestWakeLock();
  
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
  isVictory = false;
  boardsCompleted = 0;
  roundVoters.clear();
  updateVoterCount();
  applyTheme(0);
  if (els.victoryOverlay) els.victoryOverlay.classList.add("hidden");

  saveChatSettings();
  { const cs = readChatInputs(); connectChat(cs.url, cs.key, cs.interval); }
  initFirebase(els.fbConfig ? els.fbConfig.value : "");
  startDropTimer();

  initSnakeCycle();
  initSubscribeAnimation();
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
  foods = [];
  popups.length = 0;
  spawnFood();
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
  if (isRespawning || isVictory) return;

  const nextDir = getNextAIMove();

  if (nextDir.x !== direction.x || nextDir.y !== direction.y) {
    playSound("turn");
  }
  direction = nextDir;

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
  releaseWakeLock();
  stopBGM();
  if (els.podium1Name) els.podium1Name.innerText = `${maxFoodSingleRun} Foods Collected`;
  if (els.winnerOverlay) els.winnerOverlay.classList.remove("hidden");
}

function restartTournament() {
  releaseWakeLock();
  stopDropTimer();
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

  // ৩. ব্লু রিবন স্নেক বডি
  if (snake.length > 1) {
    for (let i = snake.length - 2; i >= 0; i--) {
      const p1 = { x: offsetX + snake[i].x * cellSize + cellSize / 2, y: offsetY + snake[i].y * cellSize + cellSize / 2 };
      const p2 = { x: offsetX + snake[i + 1].x * cellSize + cellSize / 2, y: offsetY + snake[i + 1].y * cellSize + cellSize / 2 };
      
      const tailProgress = (i + 1) / snake.length;
      const taperFactor = Math.max(0.32, 1 - Math.pow(tailProgress, 1.4) * 0.68);
      const strokeW = cellSize * 0.76 * taperFactor;

      ctx.beginPath();
      ctx.strokeStyle = theme.outline;
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
      ctx.strokeStyle = theme.snake;
      ctx.lineWidth = strokeW;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

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

  ctx.fillStyle = theme.snake;
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
  els.voterCount.parentElement.addEventListener("click", () => submitVote("Viewer" + Math.floor(Math.random() * 90 + 10)));
}
restoreChatSettings();
restoreFirebaseSettings();

window.selectMode = selectMode;
window.setSimulationMinutes = setSimulationMinutes;
window.handleBgmSelectChange = handleBgmSelectChange;
window.changeVolume = changeVolume;
window.beginBattle = beginBattle;
window.restartTournament = restartTournament;
window.testChatConnection = testChatConnection;
window.testFirebaseConnection = testFirebaseConnection;
