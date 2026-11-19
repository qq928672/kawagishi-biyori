// 讀取畫面（畫面本身寫在 index.html，網頁一打開就顯示；這裡只更新數字與進度）
//
// 進度規則：
// - set(p)：BootScene 依實際下載量與初始化步驟回報（0～1），只會往前、不會倒退。
// - 畫面上的數字平滑追上回報值，但永遠不超過回報值；在 complete() 之前最多顯示 99%。
// - complete()：所有素材與初始化完成後才呼叫，顯示 100% 後淡出（不為了動畫刻意等待）。
// - error()：關鍵素材下載失敗時顯示簡短訊息與「重試」。
const $ = (sel) => document.querySelector(`#loading ${sel}`);

// 下一格：requestAnimationFrame 與 100ms 計時器取先到者（分頁在背景時瀏覽器會停掉 rAF，讀取仍能完成）
function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 100);
}

let target = 0;
let shown = 0;
let finished = false;
let raf = 0;
let lastPct = -1;

function render() {
  const el = document.getElementById('loading');
  if (!el) return;
  const cap = finished ? 1 : 0.99;
  const goal = Math.min(target, cap);
  // 平滑追上（每格補上差距的 18%，至少 0.4%），但不超過目標
  if (shown < goal) shown = Math.min(goal, shown + Math.max(0.004, (goal - shown) * 0.18));
  el.style.setProperty('--p', shown.toFixed(4));
  const pct = Math.floor(shown * 100);
  if (pct !== lastPct) {
    lastPct = pct;
    const node = $('.ld-pct');
    if (node) node.textContent = `${pct}%`;
  }
  if (shown < goal || (finished && shown < 1)) nextFrame(render);
  else raf = 0;
}

function kick() {
  if (raf) return;
  raf = 1;
  nextFrame(render);
}

export const loading = {
  /** 回報實際進度（0～1）；只會往前 */
  set(p) {
    if (finished || !(p > target)) return;
    target = Math.min(1, p);
    if (import.meta.env.DEV) (window.__loadingLog ||= []).push([Math.round(performance.now()), +target.toFixed(4)]); // 驗證用：實際回報的進度
    kick();
  },

  get progress() {
    return target;
  },

  /** 按下「開始」後顯示讀取畫面（之前一直在背景計算進度，顯示時接著目前的實際進度） */
  open() {
    const el = document.getElementById('loading');
    if (!el || !el.classList.contains('idle')) return;
    el.classList.remove('idle');
    el.classList.add('enter');
    lastPct = -1;
    render();
  },

  /** 全部完成：補到 100% 後淡出；回傳淡出完成的 Promise */
  complete() {
    finished = true;
    target = 1;
    kick();
    return new Promise((resolve) => {
      const wait = () => {
        if (shown < 1) {
          nextFrame(wait);
          return;
        }
        const el = document.getElementById('loading');
        if (!el) { resolve(); return; }
        el.classList.add('done');
        setTimeout(() => {
          el.remove();
          resolve();
        }, 620);
      };
      wait();
    });
  },

  /** 顯示錯誤與「重試」；onSkip 有提供時另外顯示「仍要進入」 */
  error(message, { onRetry, onSkip } = {}) {
    const box = $('.ld-error');
    if (!box) return;
    box.hidden = false;
    box.querySelector('p').textContent = message;
    const retry = box.querySelector('.ld-retry');
    const skip = box.querySelector('.ld-skip');
    retry.onclick = () => { this.clearError(); onRetry?.(); };
    skip.hidden = !onSkip;
    skip.onclick = () => { this.clearError(); onSkip?.(); };
    $('.ld-status').textContent = '素材載入失敗';
    retry.focus({ preventScroll: true });
  },

  clearError() {
    const box = $('.ld-error');
    if (box) box.hidden = true;
    const s = $('.ld-status');
    if (s) s.textContent = '正在前往河岸小村…';
  },
};
