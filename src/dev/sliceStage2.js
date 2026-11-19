// 第二批素材處理（開發用；瀏覽器 console 執行 await T.slice2()）
//
// 來源（原圖保留於 素材/，依實際內容辨識，不依檔名）：
//   素材/下坡.png  → 實際是「背面」六格 → 上樓動畫  public/assets/anim/stairs_up.webp
//   素材/上坡.png  → 實際是「正面」六格 → 下樓動畫  public/assets/anim/stairs_down.webp
//   素材/草地.png  → 細草紋理               public/assets/ground/grass_fine.webp
//   素材/植物素材.png → 單株草叢、草叢條     public/assets/ground/plant_*.webp
//   素材/柵欄.png  → 圓木柱、雙橫桿         public/assets/props/fence_post.webp、fence_rail.webp
//   素材/石階.png  → 四階石階、石板平台     public/assets/props/stairs_east.webp、stone_platform.webp
//
// 實際檢查（2026-11-19）：
// - 動畫、柵欄、石階、植物都是透明背景；外圍只有 alpha 1～3 的極淡光暈（輪廓邊緣直接從 252 掉到 3），可乾淨去除。
// - 物件內部 alpha 250～254 → 補成 255。植物素材的花朵邊緣有紅／黃／綠色雜邊 → 邊緣去色。
// - 動畫格不是等距排列（每格 216～244 寬、436～468 高），逐格依輪廓裁切。
// - 草地.png 是不透明的細草紋理，顏色是高彩度黃綠 → 轉成柔和鼠尾草綠、保留草葉明暗。
import { loadSheet, extract, scaled, upload } from './sliceSheets.js';

const CHAR = {
  // 素材板上每格的大致範圍（輪廓實測；extract 會再找精確邊界）
  up: { src: '/素材/下坡.png', rects: [[192, 16, 244, 468], [644, 16, 240, 464], [1092, 16, 244, 460], [196, 528, 240, 468], [644, 528, 240, 468], [1096, 528, 236, 452]], refRow: 3, out: 'stairs_up' },
  down: { src: '/素材/上坡.png', rects: [[244, 16, 220, 444], [660, 16, 220, 444], [1080, 16, 216, 440], [244, 532, 220, 444], [660, 532, 220, 444], [1076, 532, 224, 436]], refRow: 0, out: 'stairs_down' },
};
// 動畫格畫布：比原本走路格（168×292）寬、高一些，避免抬腳或下踩的腳被裁掉；接地基準同樣在 y=288
export const STAIR_FRAME = { w: 200, h: 330, footY: 288 };

function alphaBox(ctx, w, h, thr = 128) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { d, x0, y0, x1, y1 };
}

/** 角色量測：頭寬（上方 40% 範圍內最寬的一列）、上半身（頭＋軀幹，上方 58%）重心、腳底 */
function measureChar(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { d, x0, y0, x1, y1 } = alphaBox(ctx, canvas.width, canvas.height);
  const W = canvas.width;
  const H = y1 - y0 + 1;
  let headW = 0;
  for (let y = y0; y < y0 + H * 0.4; y++) {
    let a = -1; let b = -1;
    for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 128) { if (a < 0) a = x; b = x; }
    if (a >= 0) headW = Math.max(headW, b - a + 1);
  }
  let sx = 0; let sy = 0; let n = 0;
  for (let y = y0; y < y0 + H * 0.58; y++) for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 128) { sx += x; sy += y; n++; }
  return { headW, cx: sx / n, cy: sy / n, top: y0, bottom: y1, left: x0, right: x1, height: H };
}

function cropCanvas(img, x, y, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return c;
}

async function buildStairAnim(key, report) {
  const cfg = CHAR[key];
  // 基準：原本角色表（player_sheet）同方向的站姿格（第 5 欄）；原始 PNG 每格 168×292
  const ref = await loadSheet('/assets/sprites/player_sheet.png');
  const refFrame = cropCanvas(ref.img, 4 * 168, cfg.refRow * 292, 168, 292);
  const R = measureChar(refFrame);
  const sheet = await loadSheet(cfg.src);
  const frames = cfg.rects.map((r) => extract(sheet, r).canvas);
  const raw = frames.map(measureChar);
  // 縮放：以「身高」對齊原本走路格（同方向第 1～4 欄的平均身高），同一組動畫用同一個倍率。
  // 新圖的身體比原角色表短一些；若只對齊頭寬，切換到上下樓時角色會突然變矮、看起來縮小。
  const walkRef = [0, 1, 2, 3].map((col) => measureChar(cropCanvas(ref.img, col * 168, cfg.refRow * 292, 168, 292)));
  const refWalkH = walkRef.reduce((a, m) => a + m.height, 0) / walkRef.length;
  const s = refWalkH / (raw.reduce((a, m) => a + m.height, 0) / raw.length);
  const F = STAIR_FRAME;
  const out = document.createElement('canvas');
  out.width = F.w * frames.length;
  out.height = F.h;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  const offX = (F.w - 168) / 2; // 原本 168 寬的格子置中放進 200 寬
  // 1) 各格以上半身重心對齊原角色站姿（不以每格不同的最低腳掌對齊，避免身體錯誤晃動）
  const placed = frames.map((f) => {
    const c = scaled(f, s);
    const m = measureChar(c);
    return { c, m, dx: Math.round(R.cx + offX - m.cx), dy: Math.round(R.cy - m.cy) };
  });
  // 2) 新圖的身體與腿比原角色表短（頭寬相同時，腳底高了十幾像素）。不拉長人物，
  //    改把整組一起往下移，讓「支撐腳」的高度和原本走路格的腳底一致，不會浮空。
  const walkBottoms = walkRef.map((m) => m.bottom);
  const refWalkFoot = walkBottoms.reduce((a, b) => a + b, 0) / walkBottoms.length;
  const bottoms = placed.map((p) => p.dy + p.m.bottom).sort((a, b) => a - b);
  const median = (bottoms[2] + bottoms[3]) / 2;
  const shift = Math.round(refWalkFoot - median);
  const info = [];
  placed.forEach((p, i) => {
    const dy = p.dy + shift;
    octx.drawImage(p.c, i * F.w + p.dx, dy);
    info.push({ frame: i + 1, footBottom: dy + p.m.bottom, top: dy + p.m.top, left: p.dx + p.m.left, right: p.dx + p.m.right, headW: p.m.headW });
  });
  report.push({ note: `${cfg.out}：整組下移 ${shift}px（原走路格腳底平均 ${refWalkFoot.toFixed(1)}）` });
  const kb = await upload(out, 'anim', `${cfg.out}.webp`, 0.9);
  report.push({ file: `anim/${cfg.out}.webp`, size: `${out.width}×${out.height}`, kb, scale: +s.toFixed(4), ref: `走路格平均身高 ${refWalkH.toFixed(1)}px、站姿頭寬 ${R.headW}px` });
  return { key, refFootBottom: R.bottom, refHeadW: R.headW, frames: info };
}

/** 細草：檢查接縫 → 轉成鼠尾草綠（保留草葉明暗、降低一點對比） */
function grassFine(sheet, report) {
  const N = 768;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scaled(sheet.img.width ? (() => { const k = document.createElement('canvas'); k.width = sheet.W; k.height = sheet.H; k.getContext('2d').drawImage(sheet.img, 0, 0); return k; })() : sheet.img, N / sheet.W), 0, 0);
  const img = ctx.getImageData(0, 0, N, N);
  const d = img.data;
  const lum = (i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  // 接縫：左右邊、上下邊相接的亮度差，和相鄰欄的一般差異比較
  const seam = () => {
    let e = 0; let inner = 0;
    for (let y = 0; y < N; y++) {
      e += Math.abs(lum((y * N) * 4) - lum((y * N + N - 1) * 4));
      inner += Math.abs(lum((y * N + 200) * 4) - lum((y * N + 201) * 4));
    }
    for (let x = 0; x < N; x++) {
      e += Math.abs(lum(x * 4) - lum(((N - 1) * N + x) * 4));
      inner += Math.abs(lum((200 * N + x) * 4) - lum((201 * N + x) * 4));
    }
    return { edge: +(e / (2 * N)).toFixed(2), neighbor: +(inner / (2 * N)).toFixed(2) };
  };
  const seamBefore = seam();
  // 平均亮度與顏色
  let mL = 0;
  for (let i = 0; i < d.length; i += 4) mL += lum(i);
  mL /= d.length / 4;
  // 目標：柔和鼠尾草綠（與目前村莊色調一致），草葉明暗保留 72%
  const target = [150, 168, 118];
  const k = 0.82;
  for (let i = 0; i < d.length; i += 4) {
    const dl = (lum(i) - mL) * k;
    // 原圖草葉較暗處偏深綠、亮處偏黃：保留一點冷暖差
    const warm = (d[i] - d[i + 2] - (lum(i) - mL) * 0.2) * 0.04;
    d[i] = target[0] + dl + warm;
    d[i + 1] = target[1] + dl;
    d[i + 2] = target[2] + dl * 0.8 - warm;
    d[i + 3] = 255;
  }
  // 接縫處理：原圖不是無縫素材（邊緣差異比相鄰像素大）。
  // 只在靠近四邊的 10% 帶狀區，混入「位移半格」的版本（它的四邊來自原圖中央，彼此連續）；
  // 中央保持原圖，避免整張變糊或草葉重影。不使用垂直鏡射（草葉會倒過來）。
  const src = new Uint8ClampedArray(d);
  const half = N / 2;
  const band = N * 0.1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ex = Math.min(x, N - 1 - x) / band;
    const ey = Math.min(y, N - 1 - y) / band;
    const t = Math.min(1, ex, ey);
    if (t >= 1) continue;
    const w = t * t * (3 - 2 * t);
    const i = (y * N + x) * 4;
    const j = (((y + half) % N) * N + ((x + half) % N)) * 4;
    for (let k2 = 0; k2 < 3; k2++) d[i + k2] = src[i + k2] * w + src[j + k2] * (1 - w);
  }
  ctx.putImageData(img, 0, 0);
  const seamAfter = seam();
  report.push({ file: 'ground/grass_fine.webp', size: `${N}×${N}`, seamBefore: JSON.stringify(seamBefore), seamAfter: JSON.stringify(seamAfter) });
  return { canvas: c, seamBefore, seamAfter };
}

/** 柵欄：從完整的長柵欄裁出「一根柱子」與「一段雙橫桿」，鋪設時柱與橫桿分開放置，不會疊出雙柱 */
function fencePieces(sheet) {
  const fence = extract(sheet, [256, 12, 1024, 184]).canvas;
  const ctx = fence.getContext('2d', { willReadFrequently: true });
  const W = fence.width; const H = fence.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  // 每欄不透明高度：柱子幾乎整欄不透明，橫桿只有兩條
  const colH = [];
  for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 128) n++; colH.push(n); }
  const isPost = colH.map((n) => n > H * 0.6);
  const posts = [];
  for (let x = 0; x < W; x++) {
    if (isPost[x] && (x === 0 || !isPost[x - 1])) posts.push({ x0: x, x1: x });
    if (isPost[x] && posts.length) posts[posts.length - 1].x1 = x;
  }
  // 第一根柱子（含繩結）與第一、二根柱子之間的橫桿
  const p = posts[0];
  const pad = 4;
  const post = cropCanvas(fence, Math.max(0, p.x0 - pad), 0, p.x1 - p.x0 + 1 + pad * 2, H);
  const q = posts[1];
  const rail = cropCanvas(fence, p.x1 + 6, 0, q.x0 - p.x1 - 12, H);
  return { post, rail, posts, H };
}

export async function sliceStage2() {
  const report = [];
  const anims = [];
  for (const k of ['up', 'down']) anims.push(await buildStairAnim(k, report));

  // 草地
  const grass = await loadSheet('/素材/草地.png');
  const g = grassFine(grass, report);
  report[report.length - 1].kb = await upload(g.canvas, 'ground', 'grass_fine.webp', 0.86);

  // 植物素材：四株單株草叢、四條草叢條（花、幸運草本輪不使用）
  const plants = await loadSheet('/素材/植物素材.png');
  const PL = [
    ['plant_tuft_1', [120, 175, 140, 125]], ['plant_tuft_2', [470, 150, 150, 145]], ['plant_tuft_3', [820, 160, 140, 135]], ['plant_tuft_4', [1150, 165, 170, 130]],
    ['plant_strip_1', [40, 455, 310, 135]], ['plant_strip_2', [390, 450, 310, 145]], ['plant_strip_3', [725, 495, 330, 75]], ['plant_strip_4', [1090, 485, 325, 85]],
  ];
  for (const [name, rect] of PL) {
    const r = extract(plants, rect);
    const c = scaled(r.canvas, 0.5);
    report.push({ file: `ground/${name}.webp`, size: `${c.width}×${c.height}`, kb: await upload(c, 'ground', `${name}.webp`, 0.88), dropped: r.dropped });
  }

  // 柵欄
  const fenceSheet = await loadSheet('/素材/柵欄.png');
  const fp = fencePieces(fenceSheet);
  const post = scaled(fp.post, 0.5);
  const rail = scaled(fp.rail, 0.5);
  report.push({ file: 'props/fence_post.webp', size: `${post.width}×${post.height}`, kb: await upload(post, 'props', 'fence_post.webp', 0.88), posts: JSON.stringify(fp.posts) });
  report.push({ file: 'props/fence_rail.webp', size: `${rail.width}×${rail.height}`, kb: await upload(rail, 'props', 'fence_rail.webp', 0.88) });

  // 石階（四階，含上下平台與兩側石牆）與石板平台
  const stairSheet = await loadSheet('/素材/石階.png');
  for (const [name, rect] of [['stairs_east', [864, 124, 520, 420]]]) {
    const r = extract(stairSheet, rect);
    const c = scaled(r.canvas, 0.5);
    report.push({ file: `props/${name}.webp`, size: `${c.width}×${c.height}`, kb: await upload(c, 'props', `${name}.webp`, 0.88), from: `${r.origin}`, srcSize: `${r.canvas.width}×${r.canvas.height}` });
  }

  console.table(report);
  return { report, anims };
}
