import { TEX_SCALE } from '../config/assets.js';

// 紋理工具：高品質縮圖、重新上色、程式繪製的替代圖

export function addSprite(scene, x, y, key) {
  return scene.add.image(x, y, key).setScale(1 / TEX_SCALE);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 逐次減半縮圖（比一次縮小更平滑），輸出高度 = targetH（來源較小時會放大，確保顯示尺寸與設定一致） */
export function downscale(src, targetH) {
  const scale = targetH / src.height;
  const tw = Math.round(src.width * scale);
  const th = Math.round(src.height * scale);
  let cur = src;
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const c = makeCanvas(cw / 2, ch / 2);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
    cw = c.width;
    ch = c.height;
  }
  const out = makeCanvas(tw, th);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

/** 縮放到指定寬高（精靈表用，確保每格為整數像素） */
export function resizeTo(src, tw, th) {
  let cur = src;
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const c = makeCanvas(cw / 2, ch / 2);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = makeCanvas(tw, th);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

/** 色相旋轉（保留深色輪廓線不變） */
export function recolor(src, { hue = 0, sat = 1, light = 0 }) {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (l < 0.33) continue; // 輪廓線維持原色
    h = (h + hue / 360 + 1) % 1;
    s = Math.min(1, s * sat);
    l = Math.min(1, Math.max(0, l + light));
    const [r, g, b] = hslToRgb(h, s, l);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- 程式繪製的替代圖（風格對齊素材板：暖棕描邊、柔和配色） ----------
const OUTLINE = '#6e4b3a';

function ell(ctx, x, y, rx, ry, fill, stroke = OUTLINE, lw = 5, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function face(ctx, cx, cy, gap) {
  for (const sx of [-1, 1]) {
    ell(ctx, cx + sx * gap, cy, 6.5, 7.5, '#3a2a22', null);
    ell(ctx, cx + sx * gap + 2, cy - 3, 2.2, 2.2, '#ffffff', null);
    ell(ctx, cx + sx * (gap + 12), cy + 15, 9, 5.5, 'rgba(242,140,150,0.55)', null);
  }
}

function drawPenguin(c) {
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ell(ctx, 58, 178, 18, 9, '#f2a34b');
  ell(ctx, 102, 178, 18, 9, '#f2a34b');
  ell(ctx, 24, 124, 13, 30, '#46617f', OUTLINE, 5, 0.35);
  ell(ctx, 136, 124, 13, 30, '#46617f', OUTLINE, 5, -0.35);
  ell(ctx, 80, 112, 60, 68, '#56769a');
  ell(ctx, 80, 128, 40, 46, '#fbf3e4', null);
  ctx.beginPath();
  ctx.moveTo(64, 74); ctx.quadraticCurveTo(80, 60, 96, 74);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  face(ctx, 80, 98, 18);
  ell(ctx, 80, 113, 10, 6.5, '#f2a34b', OUTLINE, 3);
  ctx.beginPath();
  ctx.moveTo(56, 150); ctx.lineTo(62, 152); ctx.moveTo(98, 152); ctx.lineTo(104, 150);
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(110,75,58,0.5)'; ctx.stroke();
}

function drawBunny(c) {
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  for (const [x, r] of [[56, -0.18], [104, 0.18]]) {
    ell(ctx, x, 46, 16, 42, '#f8d7de', OUTLINE, 5, r);
    ell(ctx, x, 50, 7, 30, '#f2a7b8', null, 0, r);
  }
  ell(ctx, 56, 182, 19, 10, '#fbe6ea');
  ell(ctx, 104, 182, 19, 10, '#fbe6ea');
  ell(ctx, 80, 146, 50, 42, '#f8d7de');
  ell(ctx, 80, 152, 26, 24, '#fff6f2', null);
  ell(ctx, 80, 96, 46, 42, '#f8d7de');
  face(ctx, 80, 94, 17);
  ell(ctx, 80, 108, 4.5, 3.5, '#e57f95', null);
  ctx.beginPath();
  ctx.moveTo(72, 114); ctx.quadraticCurveTo(76, 119, 80, 113); ctx.quadraticCurveTo(84, 119, 88, 114);
  ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  // 小領結
  ctx.fillStyle = '#7fb3d5'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(80, 134); ctx.lineTo(64, 126); ctx.lineTo(64, 142); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(80, 134); ctx.lineTo(96, 126); ctx.lineTo(96, 142); ctx.closePath(); ctx.fill(); ctx.stroke();
  ell(ctx, 80, 134, 5, 5, '#a5cbe6', OUTLINE, 3);
}

function drawStoneLantern(c) {
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5f5a52';
  const rect = (x, y, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();
  };
  rect(26, 168, 48, 18, '#b9b3a6');
  rect(38, 112, 24, 58, '#c8c2b4');
  rect(22, 96, 56, 18, '#b9b3a6');
  rect(28, 58, 44, 40, '#cfc9bb');
  ctx.fillStyle = '#f7d98b';
  ctx.fillRect(40, 66, 20, 24);
  ctx.strokeRect(40, 66, 20, 24);
  ctx.fillStyle = '#a9a294';
  ctx.beginPath();
  ctx.moveTo(10, 60); ctx.lineTo(50, 28); ctx.lineTo(90, 60); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ell(ctx, 50, 22, 8, 8, '#b9b3a6', '#5f5a52', 4);
  // 青苔
  ell(ctx, 30, 172, 8, 4, 'rgba(126,160,90,0.8)', null);
  ell(ctx, 66, 100, 7, 3, 'rgba(126,160,90,0.8)', null);
}

const FALLBACKS = {
  penguin: { w: 160, h: 200, draw: drawPenguin },
  bunny: { w: 160, h: 200, draw: drawBunny },
  stoneLantern: { w: 100, h: 200, draw: drawStoneLantern },
};

export function drawFallback(name) {
  const f = FALLBACKS[name];
  if (!f) return null;
  const c = makeCanvas(f.w, f.h);
  f.draw(c);
  return c;
}

/** 素材載入失敗時的佔位圖（不讓遊戲停止） */
export function drawMissing(label, h) {
  const c = makeCanvas(Math.max(60, h * 0.8), Math.max(60, h));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9d7b8';
  ctx.strokeStyle = '#8a6a4a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, c.width - 4, c.height - 4, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6b4a3a';
  ctx.font = `${Math.max(12, Math.round(c.width / 8))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('缺少素材', c.width / 2, c.height / 2 - 6);
  ctx.fillText(label, c.width / 2, c.height / 2 + 16);
  return c;
}
