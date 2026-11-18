// 開場載入畫面（封面 + 讀取進度）：畫面本身寫在 index.html，網頁一打開就顯示；
// 這裡依 Phaser 素材載入的實際進度更新文字與進度條，進入小鎮後淡出。
const root = () => document.getElementById('loading');

let shown = -1;

export const loading = {
  /** p：0～1；text：進度條上方的文字 */
  progress(p, text = '載入中') {
    const el = root();
    if (!el) return;
    el.classList.remove('waiting');
    const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
    if (pct < shown) return; // 第二輪補載（缺 WebP 改用 PNG）時不讓進度倒退
    shown = pct;
    const panel = el.querySelector('.ld-panel');
    if (!panel || !el.querySelector('.ld-track')) return; // 已切換成「輕觸開始」
    panel.style.setProperty('--p', `${pct}%`); // 進度線與浮標的位置
    el.querySelector('.ld-pct').textContent = `${pct}%`;
    const label = el.querySelector('.ld-text');
    if (label.textContent !== text) label.textContent = text;
  },

  /** 素材都下載完、正在準備畫面 */
  preparing() {
    this.progress(1, '準備村莊中');
  },

  /**
   * 載入完成：封面停在畫面上，提示「輕觸畫面開始」。
   * 瀏覽器規定聲音要在玩家點擊或按鍵後才能播放，這一下同時讓背景音樂開始（audio.js 在同一個點擊啟用聲音）。
   * text：主要提示；note：小字說明（例如背景音樂將會播放）
   */
  ready({ text, note } = {}) {
    const el = root();
    if (!el) {
      finish();
      return;
    }
    if (el.classList.contains('ready')) return;
    el.classList.remove('waiting');
    el.classList.add('ready');
    const panel = el.querySelector('.ld-panel');
    const start = document.createElement('div');
    start.className = 'ld-start';
    const t = document.createElement('div');
    t.className = 'ld-start-text';
    t.textContent = text || '輕觸畫面開始';
    start.append(t);
    if (note) {
      const n = document.createElement('div');
      n.className = 'ld-start-note';
      n.textContent = note;
      start.append(n);
    }
    panel.replaceChildren(start);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', t.textContent);
    el.tabIndex = 0;
    el.focus({ preventScroll: true });

    const go = () => {
      window.removeEventListener('keydown', onKey, true);
      el.removeEventListener('pointerup', onTap);
      this.hide();
    };
    const onTap = () => go();
    // 開始用的按鍵不要傳到遊戲（避免同時觸發互動或關掉教學）；聲音的啟用在 audio.js 更早的監聽中處理
    const onKey = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      go();
    };
    el.addEventListener('pointerup', onTap);
    window.addEventListener('keydown', onKey, true);
  },

  /** 是否還停在封面（尚未開始） */
  get waiting() {
    return !!root() && !root().classList.contains('done');
  },

  /** 封面關閉後執行（已關閉則立刻執行） */
  onDone(fn) {
    if (!this.waiting) fn();
    else doneCallbacks.push(fn);
  },

  /** 淡出並移除 */
  hide() {
    const el = root();
    if (!el || el.classList.contains('done')) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 700);
    finish();
  },
};

const doneCallbacks = [];
function finish() {
  while (doneCallbacks.length) doneCallbacks.shift()();
}
