import { save } from './save.js';

// 合成音效（Web Audio，無外部音檔）
// 瀏覽器規定：需在玩家主動按鍵或點擊後才能啟用聲音。
let ctx = null;
let master = null;
let ambience = null; // { river, wind }
let ambienceMode = 'town';

// 背景音樂（BGM 資料夾 → public/assets/bgm/）：取代原本合成的環境風聲；
// 第一次按鍵或點擊後開始循環播放，音量跟著設定，切換分頁時暫停。
export const BGM = { file: 'assets/bgm/fjordnosundakaze.mp3', level: 0.55 };
let bgm = null;

function bgmVolume() {
  const s = settings();
  return s.sound ? Math.min(1, s.volume * BGM.level) : 0;
}

function startBgm() {
  if (!bgm) {
    bgm = new Audio(BGM.file);
    bgm.loop = true;
    bgm.preload = 'auto';
    document.addEventListener('visibilitychange', () => {
      if (!bgm) return;
      if (document.hidden) bgm.pause();
      else if (bgmVolume() > 0) bgm.play().catch(() => {});
    });
  }
  bgm.volume = bgmVolume();
  if (bgm.volume > 0 && bgm.paused) bgm.play().catch(() => {});
}

function settings() {
  return save.data.settings;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  applyVolume();
  startAmbience();
  return ctx;
}

function applyVolume() {
  if (!master) return;
  const s = settings();
  master.gain.setTargetAtTime(s.sound ? s.volume : 0, ctx.currentTime, 0.05);
  if (bgm) {
    bgm.volume = bgmVolume();
    if (bgm.volume === 0) bgm.pause();
    else if (bgm.paused && !document.hidden) bgm.play().catch(() => {});
  }
}

function noiseBuffer(seconds = 2, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function startAmbience() {
  // 河水：低通的布朗噪音
  const river = ctx.createBufferSource();
  river.buffer = noiseBuffer(4, true);
  river.loop = true;
  const rf = ctx.createBiquadFilter();
  rf.type = 'lowpass';
  rf.frequency.value = 600;
  const rg = ctx.createGain();
  rg.gain.value = 0;
  river.connect(rf).connect(rg).connect(master);
  river.start();
  // 風：帶通白噪音 + 緩慢起伏
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(4);
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 500;
  wf.Q.value = 0.6;
  const wg = ctx.createGain();
  wg.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain).connect(wg.gain);
  lfo.start();
  wind.connect(wf).connect(wg).connect(master);
  wind.start();
  ambience = { rg, wg };
  setAmbience(ambienceMode);
}

function envTone({ type = 'sine', freq = 440, to = null, dur = 0.2, vol = 0.2, delay = 0, attack = 0.005 }) {
  if (!ctx || !settings().sound) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseHit({ dur = 0.3, vol = 0.2, freq = 1200, type = 'lowpass', delay = 0 }) {
  if (!ctx || !settings().sound) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const SFX = {
  click: () => envTone({ freq: 880, dur: 0.06, vol: 0.06 }),
  coin: () => { envTone({ freq: 988, dur: 0.12, vol: 0.12 }); envTone({ freq: 1319, dur: 0.25, vol: 0.12, delay: 0.08 }); },
  insert: () => { envTone({ type: 'triangle', freq: 660, dur: 0.08, vol: 0.12 }); envTone({ type: 'triangle', freq: 990, dur: 0.18, vol: 0.12, delay: 0.07 }); },
  meow: () => { envTone({ type: 'sawtooth', freq: 620, to: 900, dur: 0.18, vol: 0.05 }); envTone({ type: 'sawtooth', freq: 900, to: 520, dur: 0.32, vol: 0.05, delay: 0.16 }); },
  cast: () => noiseHit({ dur: 0.35, vol: 0.12, freq: 2400, type: 'bandpass' }),
  splash: () => noiseHit({ dur: 0.45, vol: 0.18, freq: 900 }),
  bite: () => { envTone({ freq: 740, dur: 0.09, vol: 0.14 }); envTone({ freq: 740, dur: 0.09, vol: 0.14, delay: 0.12 }); },
  perfect: () => { envTone({ type: 'triangle', freq: 1046, dur: 0.12, vol: 0.16 }); envTone({ type: 'triangle', freq: 1568, dur: 0.22, vol: 0.14, delay: 0.06 }); },
  good: () => envTone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.14 }),
  miss: () => envTone({ type: 'square', freq: 196, to: 140, dur: 0.22, vol: 0.06 }),
  success: () => [523, 659, 784, 1046].forEach((f, i) => envTone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.13, delay: i * 0.09 })),
  fail: () => [392, 330, 262].forEach((f, i) => envTone({ type: 'triangle', freq: f, dur: 0.25, vol: 0.1, delay: i * 0.12 })),
  claw: () => envTone({ type: 'sawtooth', freq: 140, to: 180, dur: 0.5, vol: 0.03 }),
  prize: () => [784, 988, 1175, 1568].forEach((f, i) => envTone({ freq: f, dur: 0.2, vol: 0.12, delay: i * 0.08 })),
  water: () => noiseHit({ dur: 0.6, vol: 0.12, freq: 3000, type: 'highpass' }),
  harvest: () => { envTone({ freq: 523, to: 784, dur: 0.15, vol: 0.12 }); envTone({ freq: 1046, dur: 0.2, vol: 0.1, delay: 0.12 }); },
  plant: () => envTone({ type: 'triangle', freq: 392, to: 523, dur: 0.18, vol: 0.12 }),
  sip: () => noiseHit({ dur: 0.25, vol: 0.06, freq: 1800, type: 'bandpass' }),
};

export function setAmbience(mode) {
  ambienceMode = mode;
  if (!ambience) return;
  const t = ctx.currentTime;
  // 背景音樂取代環境風聲；只在釣魚近景保留一點河水聲
  const river = mode === 'fishing' ? 0.07 : 0;
  const wind = 0;
  ambience.rg.gain.setTargetAtTime(river, t, 0.6);
  ambience.wg.gain.setTargetAtTime(wind, t, 0.6);
}

export const audio = {
  // 第一次使用者操作後才建立 AudioContext
  init() {
    const unlock = () => {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      startBgm();
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
  },
  play(name) {
    if (!ctx || !SFX[name]) return;
    SFX[name]();
  },
  setAmbience,
  refreshVolume() {
    applyVolume();
  },
  /** 'off'（尚未啟用）、'running'、'suspended' */
  state() {
    return ctx ? ctx.state : 'off';
  },
  /** 背景音樂狀態（除錯用） */
  bgmState() {
    return bgm ? { playing: !bgm.paused, volume: bgm.volume, src: bgm.src } : null;
  },
};
