// 素材板裁切（開發用，只在 npm run dev 載入；在瀏覽器 console 執行 await T.slice()）
//
// 來源（原始素材保留不動）：
//   素材/讀取條.png   → public/assets/ui/ld_*.webp、btn_*.webp
//   素材/地板素材.png → public/assets/ground/grass_*.webp、stone_*.webp、deco_*.webp
//   素材/新封面.png   → public/assets/cover/home.webp、home-sm.webp
//
// 實際檢查素材板的結果（2026-11-19）：
// - 背景是透明的，但物件內部 alpha 只有 250～253（不是完全不透明）→ 實心區提高為 255，避免鋪地面時透出底色。
// - 物件邊緣的低透明度像素帶有明顯的黃色／紅色雜邊（去背殘留）→ 保留水彩邊緣的透明度，只把邊緣顏色換成附近實心像素的顏色。
// - 物件不是等距排列，大小也不同 → 每個物件先給大致範圍，再以實際輪廓（連通區塊）找出邊界；零星的小雜點不納入。
// - 草地方塊外圍有不規則的毛邊 → 往內裁切，再做成可無縫鋪設的圖塊。

const SRC = { loading: '/素材/讀取條.png', ground: '/素材/地板素材.png', cover: '/素材/新封面.png' };

// 大致範圍（素材板像素）；實際邊界由輪廓決定。scale：同類素材使用相同縮放倍率
const LOADING_PARTS = [
  { name: 'ld_frame', rect: [32, 20, 1712, 144], scale: 1 },
  { name: 'ld_water', rect: [68, 200, 1636, 92], scale: 1, solidify: true },
  { name: 'ld_village', rect: [868, 296, 844, 416], scale: 0.75 },
  { name: 'ld_cat', rect: [64, 324, 284, 360], scale: 0.75 },
  { name: 'ld_plants', rect: [400, 328, 436, 348], scale: 0.75 },
  { name: 'ld_branch', rect: [1304, 700, 452, 172], scale: 0.75 },
  { name: 'btn_wood', rect: [32, 728, 576, 144], scale: 0.75 },
  { name: 'btn_green', rect: [640, 728, 584, 144], scale: 0.75 },
];
const STONE_SCALE = 0.5;
const DECO_SCALE = 0.5;
const GROUND_PARTS = [
  { name: 'stone_1', rect: [28, 520, 300, 176], scale: STONE_SCALE },
  { name: 'stone_2', rect: [360, 540, 204, 140], scale: STONE_SCALE },
  { name: 'stone_3', rect: [596, 520, 284, 176], scale: STONE_SCALE },
  { name: 'stone_4', rect: [916, 532, 224, 160], scale: STONE_SCALE },
  { name: 'stone_5', rect: [1172, 540, 276, 144], scale: STONE_SCALE },
  { name: 'stone_6', rect: [1480, 508, 268, 188], scale: STONE_SCALE },
  { name: 'deco_tuft_1', rect: [80, 756, 132, 84], scale: DECO_SCALE },
  { name: 'deco_tuft_2', rect: [312, 744, 144, 104], scale: DECO_SCALE },
  { name: 'deco_tuft_3', rect: [552, 776, 128, 64], scale: DECO_SCALE },
  { name: 'deco_daisy', rect: [788, 728, 128, 128], scale: DECO_SCALE },
  { name: 'deco_flowers', rect: [1032, 740, 156, 116], scale: DECO_SCALE },
  { name: 'deco_moss_1', rect: [1288, 768, 168, 84], scale: DECO_SCALE },
  { name: 'deco_moss_2', rect: [1548, 776, 116, 60], scale: DECO_SCALE },
];
// 草地方塊：只取實心區（alpha ≥ 192）往內 12px，避開毛邊
const GRASS_TILES = [
  { name: 'grass_a', box: [160, 22, 610, 460] },
  { name: 'grass_b', box: [678, 22, 1127, 460] },
  { name: 'grass_c', box: [1195, 22, 1645, 459] },
];
const GRASS_SIZE = 400;

async function loadSheet(url) {
  const img = new Image();
  img.src = `${url}?v=${Date.now()}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { img, W: c.width, H: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

/** 從素材板取出一個物件：輪廓遮罩 → 去雜點 → 邊緣去色 → 實心化 → 裁到最小範圍 */
function extract(sheet, [rx, ry, rw, rh], { solidify = false } = {}) {
  const pad = 14;
  const x0 = Math.max(0, rx - pad);
  const y0 = Math.max(0, ry - pad);
  const x1 = Math.min(sheet.W, rx + rw + pad);
  const y1 = Math.min(sheet.H, ry + rh + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * sheet.W + x0) * 4;
    px.set(sheet.data.subarray(s, s + w * 4), y * w * 4);
  }
  const A = (i) => px[i * 4 + 3];

  // 1) 連通區塊（alpha > 16）
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (A(i) <= 16 || label[i] >= 0) continue;
    const id = comps.length;
    const stack = [i];
    label[i] = id;
    let n = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const k = stack.pop();
      n++;
      const kx = k % w;
      const ky = (k / w) | 0;
      sx += kx;
      sy += ky;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + dx;
        const ny = ky + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] < 0 && A(j) > 16) { label[j] = id; stack.push(j); }
      }
    }
    comps.push({ n, cx: sx / n + x0, cy: sy / n + y0 });
  }
  const biggest = Math.max(...comps.map((c) => c.n));
  // 主體 + 落在大致範圍內、面積夠大的部分（例如分開的花朵、葉片）；其餘零星雜點捨棄
  const keep = new Set(comps.map((c, i) => (c.n === biggest || (c.n >= biggest * 0.004 && c.n >= 30 && c.cx >= rx && c.cx <= rx + rw && c.cy >= ry && c.cy <= ry + rh) ? i : -1)).filter((i) => i >= 0));
  const dropped = comps.length - keep.size;

  // 2) 遮罩外擴 2px（保留極淡的水彩邊緣）
  const inMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && keep.has(label[i])) inMask[i] = 1;
  for (let pass = 0; pass < 2; pass++) {
    const prev = inMask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (prev[i]) continue;
      if ((x > 0 && prev[i - 1]) || (x < w - 1 && prev[i + 1]) || (y > 0 && prev[i - w]) || (y < h - 1 && prev[i + w])) inMask[i] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) if (!inMask[i]) px[i * 4 + 3] = 0;

  // 3) 邊緣去色：實心像素（alpha ≥ 200）的顏色向外擴散，取代半透明邊緣上殘留的黃／紅底色
  const solid = new Uint8Array(w * h);
  const col = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (A(i) >= 200) { solid[i] = 1; col[i * 3] = px[i * 4]; col[i * 3 + 1] = px[i * 4 + 1]; col[i * 3 + 2] = px[i * 4 + 2]; }
  }
  const done = solid.slice();
  for (let pass = 0; pass < 10; pass++) {
    const prev = done.slice();
    let changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (prev[i] || A(i) === 0) continue;
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (prev[j]) { r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; n++; }
      }
      if (n) { col[i * 3] = r / n; col[i * 3 + 1] = g / n; col[i * 3 + 2] = b / n; done[i] = 1; changed++; }
    }
    if (!changed) break;
  }
  let recolored = 0;
  for (let i = 0; i < w * h; i++) {
    const a = A(i);
    if (!a || solid[i] || !done[i]) continue;
    // 越透明越接近實心色；較不透明的水彩暈染保留一半原色
    const t = a < 140 ? 1 : 0.5;
    px[i * 4] = px[i * 4] * (1 - t) + col[i * 3] * t;
    px[i * 4 + 1] = px[i * 4 + 1] * (1 - t) + col[i * 3 + 1] * t;
    px[i * 4 + 2] = px[i * 4 + 2] * (1 - t) + col[i * 3 + 2] * t;
    recolored++;
  }
  // 遠離實心區、找不到乾淨顏色的極淡像素（多半是雜邊）直接移除
  for (let i = 0; i < w * h; i++) if (A(i) && A(i) < 40 && !done[i]) px[i * 4 + 3] = 0;

  // 4) 實心化：內部 alpha 250～254 → 255；solidify 時整個主體不透明（水色填充條）
  for (let i = 0; i < w * h; i++) {
    const a = A(i);
    if (a >= 240 || (solidify && a >= 160)) px[i * 4 + 3] = 255;
  }

  // 5) 裁到最小範圍（alpha > 6）＋ 2px 留白
  let bx0 = w; let by0 = h; let bx1 = -1; let by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(y * w + x) > 6) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  bx0 = Math.max(0, bx0 - 2); by0 = Math.max(0, by0 - 2); bx1 = Math.min(w - 1, bx1 + 2); by1 = Math.min(h - 1, by1 + 2);
  const out = document.createElement('canvas');
  out.width = bx1 - bx0 + 1;
  out.height = by1 - by0 + 1;
  const full = new ImageData(px, w, h);
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d').putImageData(full, 0, 0);
  out.getContext('2d').drawImage(tmp, bx0, by0, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, origin: [x0 + bx0, y0 + by0], dropped, recolored };
}

function scaled(src, s) {
  if (s === 1) return src;
  let cur = src;
  let cw = src.width;
  let ch = src.height;
  const tw = Math.round(src.width * s);
  const th = Math.round(src.height * s);
  while (cw / 2 >= tw) {
    const c = document.createElement('canvas');
    c.width = Math.round(cw / 2); c.height = Math.round(ch / 2);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, tw, th);
  return c;
}

/** 草地：裁掉毛邊 → 完全不透明 → 降低對比 → 半格位移混合，做成可無縫鋪設的圖塊 */
function grassTile(sheet, [bx0, by0, bx1, by1]) {
  const inset = 12;
  const side = Math.min(bx1 - bx0, by1 - by0) - inset * 2;
  const sx = Math.round((bx0 + bx1) / 2 - side / 2);
  const sy = Math.round((by0 + by1) / 2 - side / 2);
  const N = GRASS_SIZE;
  const base = document.createElement('canvas');
  base.width = N; base.height = N;
  const bctx = base.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(sheet.img, sx, sy, side, side, 0, 0, N, N);
  const src = bctx.getImageData(0, 0, N, N);
  const d = src.data;
  // 平均色（用來降低對比）
  let mr = 0; let mg = 0; let mb = 0;
  for (let i = 0; i < d.length; i += 4) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; }
  const n = d.length / 4;
  mr /= n; mg /= n; mb /= n;
  const k = 0.82; // 對比降到 82%
  const lowc = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    lowc[i] = mr + (d[i] - mr) * k;
    lowc[i + 1] = mg + (d[i + 1] - mg) * k;
    lowc[i + 2] = mb + (d[i + 2] - mb) * k;
    lowc[i + 3] = 255;
  }
  // 半格位移版本：四邊來自原圖中央，彼此連續
  const out = new Uint8ClampedArray(d.length);
  const half = N / 2;
  const band = N * 0.22; // 邊緣混合帶寬
  const seamBefore = edgeDiff(lowc, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const j = (((y + half) % N) * N + ((x + half) % N)) * 4;
    // w：中央取原圖、接近邊緣取位移版本（平滑過渡）
    const ex = Math.min(x, N - 1 - x) / band;
    const ey = Math.min(y, N - 1 - y) / band;
    const t = Math.min(1, Math.min(ex, ey));
    const w = t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) out[i + c] = lowc[i + c] * w + lowc[j + c] * (1 - w);
    out[i + 3] = 255;
  }
  const seamAfter = edgeDiff(out, N);
  const can = document.createElement('canvas');
  can.width = N; can.height = N;
  can.getContext('2d').putImageData(new ImageData(out, N, N), 0, 0);
  return { canvas: can, seamBefore, seamAfter, mean: [mr, mg, mb].map(Math.round), crop: [sx, sy, side] };
}

/** 左右邊、上下邊相接處的平均色差（越小越無縫） */
function edgeDiff(d, N) {
  let s = 0; let n = 0;
  for (let y = 0; y < N; y++) {
    const a = (y * N) * 4; const b = (y * N + N - 1) * 4;
    s += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]); n++;
  }
  for (let x = 0; x < N; x++) {
    const a = x * 4; const b = ((N - 1) * N + x) * 4;
    s += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]); n++;
  }
  return +(s / n / 3).toFixed(2);
}

async function upload(canvas, dir, name, q = 0.86) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', q));
  const res = await fetch(`/__asset?dir=${dir}&name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`${dir}/${name} 儲存失敗`);
  return Math.round(blob.size / 1024);
}

export async function sliceSheets() {
  const report = [];
  const loading = await loadSheet(SRC.loading);
  for (const p of LOADING_PARTS) {
    const r = extract(loading, p.rect, p);
    const c = scaled(r.canvas, p.scale);
    const kb = await upload(c, 'ui', `${p.name}.webp`, 0.88);
    report.push({ file: `ui/${p.name}.webp`, size: `${c.width}×${c.height}`, kb, from: `${r.origin}`, dropped: r.dropped, recolored: r.recolored });
  }
  const ground = await loadSheet(SRC.ground);
  for (const p of GROUND_PARTS) {
    const r = extract(ground, p.rect, p);
    const c = scaled(r.canvas, p.scale);
    const kb = await upload(c, 'ground', `${p.name}.webp`, 0.88);
    report.push({ file: `ground/${p.name}.webp`, size: `${c.width}×${c.height}`, kb, from: `${r.origin}`, dropped: r.dropped, recolored: r.recolored });
  }
  for (const t of GRASS_TILES) {
    const r = grassTile(ground, t.box);
    const kb = await upload(r.canvas, 'ground', `${t.name}.webp`, 0.9);
    report.push({ file: `ground/${t.name}.webp`, size: `${GRASS_SIZE}×${GRASS_SIZE}`, kb, from: `${r.crop}`, seam: `${r.seamBefore} → ${r.seamAfter}`, mean: `${r.mean}` });
  }
  // 封面：保留原比例，只轉 WebP（不裁切、不拉伸）
  const cover = await loadSheet(SRC.cover);
  for (const [w, q, name] of [[cover.W, 0.86, 'home.webp'], [960, 0.84, 'home-sm.webp']]) {
    const c = scaled(cover.img.width ? (() => { const k = document.createElement('canvas'); k.width = cover.W; k.height = cover.H; k.getContext('2d').drawImage(cover.img, 0, 0); return k; })() : cover.img, w / cover.W);
    const kb = await upload(c, 'cover', name, q);
    report.push({ file: `cover/${name}`, size: `${c.width}×${c.height}`, kb });
  }
  console.table(report);
  return report;
}
