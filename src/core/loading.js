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
    el.querySelector('.ld-fill').style.width = `${pct}%`;
    el.querySelector('.ld-pct').textContent = `${pct}%`;
    const label = el.querySelector('.ld-text');
    if (label.firstChild?.nodeValue !== text) label.firstChild.nodeValue = text;
  },

  /** 素材都下載完、正在準備畫面 */
  preparing() {
    this.progress(1, '準備村莊中');
  },

  /** 淡出並移除 */
  hide() {
    const el = root();
    if (!el || el.classList.contains('done')) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 700);
  },
};
