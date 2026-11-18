// 素材最佳化（開發用，只在 npm run dev 載入）
// 把 public/assets/sprites/ 的原始 PNG 事先縮到遊戲實際需要的尺寸（顯示高度 × TEX_SCALE），
// 再轉成 WebP 存到 public/assets/opt/。遊戲啟動時載入 WebP，首次下載量大幅減少。
// 原始 PNG 保留為母檔；替換或新增素材後，在瀏覽器 console 執行 await T.optimize() 重新產生。
import { SPRITES, SHEETS, TEX_SCALE, optName } from '../config/assets.js';
import { downscale, resizeTo } from '../core/textures.js';

const QUALITY = 0.9;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`載入失敗：${src}`));
    img.src = src;
  });
}

function toWebp(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
}

/** 每個 PNG 需要的輸出尺寸：同一張圖被多個素材使用時取最大高度；精靈表用確切寬高 */
function targets() {
  const map = new Map();
  for (const s of Object.values(SPRITES)) {
    if (!s.file || s.raw || !s.file.endsWith('.png')) continue;
    const t = map.get(s.file) || { file: s.file, height: 0 };
    t.height = Math.max(t.height, s.height * TEX_SCALE);
    map.set(s.file, t);
  }
  for (const s of Object.values(SHEETS)) {
    const fw = Math.round(s.frameWidth * s.scale);
    const fh = Math.round(s.frameHeight * s.scale);
    map.set(s.file, { file: s.file, w: fw * s.cols, h: fh * s.rows });
  }
  return [...map.values()];
}

export async function optimizeAssets() {
  const report = [];
  let before = 0;
  let after = 0;
  for (const t of targets()) {
    const img = await loadImage(`${t.file}?v=${Date.now()}`);
    let canvas;
    if (t.w) canvas = resizeTo(img, t.w, t.h);
    // 來源比需要的小時不放大（遊戲啟動時才放大），避免檔案變大
    else canvas = downscale(img, Math.min(t.height, img.height));
    const blob = await toWebp(canvas);
    const png = (await (await fetch(t.file)).blob()).size;
    const name = optName(t.file);
    const r = await fetch(`/__asset?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    if (!r.ok) throw new Error(`${name} 儲存失敗`);
    before += png;
    after += blob.size;
    report.push({ file: name, size: `${img.width}×${img.height} → ${canvas.width}×${canvas.height}`, kb: `${Math.round(png / 1024)} → ${Math.round(blob.size / 1024)}` });
  }
  console.table(report);
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`共 ${report.length} 張：${mb(before)} MB → ${mb(after)} MB`);
  return { count: report.length, beforeMB: mb(before), afterMB: mb(after) };
}
