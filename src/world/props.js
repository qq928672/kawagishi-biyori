// 程式繪製的道具素材（素材板沒有的物件：住宅、夾夾屋店面、圍籬、蘆葦、石頭、灌木、水桶、貓、菜園、晾衣架…）
// 每個函式在 canvas 上以「顯示尺寸的 2 倍」繪製，風格對齊素材：暖棕描邊、柔和配色。
// 有正式素材後，在 assets.js 把對應項目的 file 填上即可取代。

const OL = '#5a3b2a';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return [c, ctx];
}

function rr(ctx, x, y, w, h, r, fill, stroke = OL, lw = 5) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function poly(ctx, pts, fill, stroke = OL, lw = 5) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function ell(ctx, x, y, rx, ry, fill, stroke = OL, lw = 4, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx, pts, color, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---------- 瓦片屋頂 ----------
function tiledRoof(ctx, x0, x1, top, bottom, overhang, color, dark, light) {
  const pts = [[x0 - overhang, bottom], [x0 + 30, top], [x1 - 30, top], [x1 + overhang, bottom]];
  poly(ctx, pts, color);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.clip();
  for (let y = top + 16; y < bottom; y += 17) {
    ctx.fillStyle = dark;
    ctx.fillRect(x0 - overhang, y, x1 - x0 + overhang * 2, 3);
    for (let x = x0 - overhang; x < x1 + overhang; x += 22) {
      ctx.beginPath();
      ctx.arc(x + ((y / 17) % 2) * 11, y + 1, 9, 0, Math.PI);
      ctx.strokeStyle = light;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.restore();
  poly(ctx, pts, null);
  // 屋脊
  rr(ctx, x0 + 18, top - 14, x1 - x0 - 36, 20, 8, dark);
  ell(ctx, x0 + 22, top - 6, 11, 11, dark);
  ell(ctx, x1 - 22, top - 6, 11, 11, dark);
}

function lattice(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 3, '#f7d98b', OL, 5);
  ctx.strokeStyle = 'rgba(138,90,60,0.85)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + (w * i) / 3, y); ctx.lineTo(x + (w * i) / 3, y + h); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 6, y + 6, w / 3 - 8, 8);
}

function noren(ctx, x, y, w, h, color) {
  const n = 3;
  for (let i = 0; i < n; i++) {
    rr(ctx, x + (w / n) * i + 1, y, w / n - 2, h, 3, color, OL, 3);
  }
}

function potPlant(ctx, x, y, s = 1, flower = '#f2a7b8') {
  ell(ctx, x, y - 30 * s, 24 * s, 20 * s, '#7fa35a', OL, 4);
  ell(ctx, x - 10 * s, y - 36 * s, 7 * s, 7 * s, flower, null);
  ell(ctx, x + 9 * s, y - 32 * s, 6 * s, 6 * s, flower, null);
  poly(ctx, [[x - 16 * s, y - 16 * s], [x + 16 * s, y - 16 * s], [x + 12 * s, y], [x - 12 * s, y]], '#b9764d', OL, 4);
}

// ---------- 住宅 ----------
const HOUSE_VARIANTS = {
  a: { roof: '#4f7f7a', dark: '#3e6460', light: '#6f9c95', noren: '#e98c8c', doorLeft: false, awning: '#f4a6b0' },
  b: { roof: '#5a8a86', dark: '#456d6a', light: '#79a9a2', noren: '#6b7fae', doorLeft: true, awning: null },
  c: { roof: '#4a7570', dark: '#3a5c58', light: '#699790', noren: '#d9a441', doorLeft: false, awning: '#9fc3a0' },
};

function drawHouse(v) {
  const [c, ctx] = canvas(380, 350);
  const doorX = v.doorLeft ? 70 : 228;
  const winX = v.doorLeft ? 196 : 70;
  // 石基
  rr(ctx, 26, 296, 328, 46, 8, '#b9b0a0');
  const rnd = seeded(v.doorLeft ? 7 : 3);
  for (let i = 0; i < 16; i++) ell(ctx, 40 + i * 20, 316 + (i % 2) * 10, 9, 6, rnd() > 0.5 ? '#a49b8b' : '#c8c0b0', null);
  // 牆
  rr(ctx, 38, 168, 304, 134, 4, '#f4e8cf');
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(38, 168, 304, 13);
  for (const x of [38, 183, 328]) ctx.fillRect(x, 168, 14, 134);
  ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.strokeRect(38, 168, 304, 134);
  // 窗
  lattice(ctx, winX + 12, 202, 96, 62);
  if (v.awning) {
    for (let i = 0; i < 6; i++) {
      poly(ctx, [[winX + i * 20, 188], [winX + 20 + i * 20, 188], [winX + 20 + i * 20, 204], [winX + i * 20, 204]], i % 2 ? '#fffaf2' : v.awning, null);
    }
    rr(ctx, winX, 186, 120, 20, 3, null, OL, 4);
  }
  // 門
  rr(ctx, doorX, 206, 84, 96, 4, '#9b6a44');
  ctx.fillStyle = '#7a4f33';
  ctx.fillRect(doorX + 40, 206, 4, 96);
  noren(ctx, doorX, 206, 84, 34, v.noren);
  rr(ctx, doorX - 6, 296, 96, 12, 3, '#c8c0b0', OL, 3);
  // 屋頂
  tiledRoof(ctx, 38, 342, 70, 182, 28, v.roof, v.dark, v.light);
  // 燈籠
  rr(ctx, (v.doorLeft ? doorX + 96 : doorX - 26), 214, 18, 26, 6, '#f6d58c', OL, 3);
  // 盆栽
  potPlant(ctx, v.doorLeft ? 300 : 60, 300, 1, v.noren);
  return c;
}

// ---------- 夾夾屋店面 ----------
function drawClawShop() {
  const [c, ctx] = canvas(660, 480);
  rr(ctx, 30, 430, 600, 44, 8, '#b9b0a0');
  rr(ctx, 44, 214, 572, 222, 4, '#f4e8cf');
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(44, 214, 572, 14);
  for (const x of [44, 600]) ctx.fillRect(x, 214, 16, 222);
  // 店內（粉色機台剪影）
  rr(ctx, 90, 262, 420, 168, 6, '#f6dfe3');
  for (let i = 0; i < 3; i++) {
    const x = 112 + i * 132;
    rr(ctx, x, 280, 104, 146, 10, '#f3b7c3');
    rr(ctx, x + 10, 296, 84, 64, 4, '#dff0f4', OL, 3);
    ell(ctx, x + 30, 346, 11, 10, '#f8d7de', OL, 2);
    ell(ctx, x + 56, 344, 11, 11, '#56769a', OL, 2);
    ell(ctx, x + 76, 348, 10, 9, '#fbe6c8', OL, 2);
    rr(ctx, x + 18, 372, 68, 22, 4, '#fbe7ea', OL, 3);
  }
  // 側窗
  lattice(ctx, 532, 270, 60, 80);
  // 屋頂與招牌
  tiledRoof(ctx, 44, 616, 70, 226, 30, '#4f7f7a', '#3e6460', '#6f9c95');
  rr(ctx, 210, 108, 240, 70, 14, '#e2b97a', OL, 6);
  ctx.fillStyle = '#5a3a22';
  ctx.font = 'bold 46px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('夾夾屋', 330, 145);
  for (const x of [232, 428]) {
    ell(ctx, x, 128, 8, 8, '#f4a6b0', null);
    ell(ctx, x, 160, 6, 6, '#f4a6b0', null);
  }
  // 遮雨棚
  const aw = 238;
  for (let i = 0; i < 14; i++) {
    const x = 70 + i * 37;
    poly(ctx, [[x, aw], [x + 37, aw], [x + 37, aw + 34], [x, aw + 34]], i % 2 ? '#fffaf2' : '#f4a6b0', null);
    ctx.beginPath();
    ctx.arc(x + 18.5, aw + 34, 18.5, 0, Math.PI);
    ctx.fillStyle = i % 2 ? '#fffaf2' : '#f4a6b0';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
  }
  rr(ctx, 66, aw - 6, 526, 12, 4, '#e98c8c', OL, 4);
  // 燈籠
  for (const x of [72, 572]) {
    rr(ctx, x, 290, 22, 34, 8, '#f6d58c', OL, 3);
  }
  return c;
}

// ---------- 圍籬（可水平重複） ----------
function drawFence() {
  const [c, ctx] = canvas(192, 84);
  for (const y of [24, 50]) rr(ctx, 6, y, 180, 13, 4, '#b0835a', OL, 4);
  for (const x of [8, 168]) {
    rr(ctx, x, 6, 18, 74, 4, '#a0754e', OL, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 4, 10, 4, 64);
  }
  return c;
}

// ---------- 蘆葦 / 芒草 ----------
function drawReeds(seed) {
  const [c, ctx] = canvas(120, 170);
  const rnd = seeded(seed);
  for (let i = 0; i < 9; i++) {
    const x = 30 + rnd() * 60;
    const top = 30 + rnd() * 50;
    const bend = (rnd() - 0.5) * 30;
    ctx.beginPath();
    ctx.moveTo(60 + (x - 60) * 0.3, 166);
    ctx.quadraticCurveTo(x, 100, x + bend, top);
    ctx.strokeStyle = i % 2 ? '#8fa860' : '#7d9850';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (i % 2 === 0) {
      ell(ctx, x + bend, top - 8, 7, 20, '#eadfc4', '#b9a77d', 2, bend * 0.02);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = 40 + rnd() * 40;
    ctx.beginPath();
    ctx.moveTo(60, 166);
    ctx.quadraticCurveTo(x, 120, x + (rnd() - 0.5) * 60, 90 + rnd() * 30);
    ctx.strokeStyle = '#6f9650';
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  return c;
}

// ---------- 石頭 ----------
function drawRock(seed) {
  const [c, ctx] = canvas(140, 96);
  const rnd = seeded(seed);
  ell(ctx, 70, 62, 60, 30, '#9d978b', OL, 5);
  ell(ctx, 58, 50, 34, 16, '#b9b3a6', null);
  ell(ctx, 52, 44, 16, 6, '#d6d0c3', null);
  if (rnd() > 0.3) {
    ell(ctx, 88, 42, 18, 8, '#88a35a', null);
    ell(ctx, 100, 46, 10, 6, '#7a9850', null);
  }
  ctx.beginPath();
  ctx.moveTo(84, 60); ctx.lineTo(96, 72);
  ctx.strokeStyle = 'rgba(90,59,42,0.45)'; ctx.lineWidth = 3; ctx.stroke();
  return c;
}

// ---------- 灌木 ----------
function drawBush(flowers, seed) {
  const [c, ctx] = canvas(160, 120);
  const rnd = seeded(seed);
  const blobs = [[50, 76, 34], [86, 66, 40], [118, 80, 30], [76, 92, 34], [110, 96, 26]];
  for (const [x, y, r] of blobs) ell(ctx, x, y, r, r * 0.85, '#6f9650', OL, 5);
  for (const [x, y, r] of blobs) ell(ctx, x - 4, y - 6, r * 0.75, r * 0.6, '#86ad5e', null);
  for (const [x, y, r] of blobs) ell(ctx, x - 8, y - 12, r * 0.35, r * 0.25, '#a3c776', null);
  if (flowers) {
    for (let i = 0; i < 9; i++) {
      const x = 34 + rnd() * 96;
      const y = 50 + rnd() * 50;
      ell(ctx, x, y, 9, 8, flowers, 'rgba(90,59,42,0.5)', 2);
      ell(ctx, x - 2, y - 2, 3, 3, 'rgba(255,255,255,0.6)', null);
    }
  }
  return c;
}

// ---------- 水桶 ----------
function drawBucket() {
  const [c, ctx] = canvas(70, 70);
  ctx.beginPath();
  ctx.arc(35, 26, 24, Math.PI, 0);
  ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.stroke();
  poly(ctx, [[10, 26], [60, 26], [54, 64], [16, 64]], '#9fb3bf', OL, 4);
  ell(ctx, 35, 26, 25, 7, '#7d93a0', OL, 4);
  ell(ctx, 35, 27, 19, 4, '#6aa7b8', null);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(18, 32, 5, 26);
  line(ctx, [[14, 44], [56, 44]], 'rgba(90,59,42,0.4)', 3);
  return c;
}

// ---------- 貓（睡覺） ----------
function drawCat() {
  const [c, ctx] = canvas(110, 72);
  ell(ctx, 56, 46, 38, 20, '#fbf6ee', OL, 4);
  ctx.beginPath();
  ctx.moveTo(90, 50); ctx.quadraticCurveTo(100, 66, 70, 64); ctx.quadraticCurveTo(46, 64, 40, 58);
  ctx.strokeStyle = OL; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = '#f2e3cf'; ctx.lineWidth = 5; ctx.stroke();
  // 頭
  poly(ctx, [[18, 30], [22, 12], [32, 24]], '#fbf6ee', OL, 3);
  poly(ctx, [[34, 22], [44, 10], [46, 28]], '#fbf6ee', OL, 3);
  poly(ctx, [[22, 17], [24, 24], [29, 23]], '#f2a7b8', null);
  ell(ctx, 32, 38, 20, 16, '#fbf6ee', OL, 4);
  ell(ctx, 70, 36, 12, 7, '#e8c79a', null);
  for (const x of [25, 37]) {
    ctx.beginPath(); ctx.arc(x, 37, 4, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ell(ctx, 31, 44, 2.5, 2, '#e57f95', null);
  return c;
}

// ---------- 菜園 ----------
function drawGarden() {
  const [c, ctx] = canvas(330, 170);
  rr(ctx, 10, 70, 310, 92, 12, '#8b6a4a');
  for (let r = 0; r < 3; r++) {
    const y = 88 + r * 26;
    rr(ctx, 22, y, 286, 16, 8, '#7a5b3e', null);
    for (let i = 0; i < 9; i++) {
      const x = 36 + i * 32;
      if (r === 0) {
        line(ctx, [[x, y + 8], [x, y - 44]], '#a07a4f', 4);
        ell(ctx, x, y - 24, 14, 22, '#6f9650', OL, 3);
        ell(ctx, x - 6, y - 18, 5, 5, '#e0524f', null);
        ell(ctx, x + 5, y - 30, 4.5, 4.5, '#e0524f', null);
      } else {
        ell(ctx, x, y + 2, 13, 10, r === 1 ? '#93b86a' : '#7fa35a', OL, 3);
        ell(ctx, x - 3, y - 1, 6, 4, '#b7d68a', null);
      }
    }
  }
  // 竹籬
  for (let x = 6; x < 326; x += 16) rr(ctx, x, 128, 10, 40, 4, '#c8b07a', OL, 3);
  rr(ctx, 4, 138, 322, 8, 3, '#b39a64', OL, 3);
  return c;
}

// ---------- 晾衣架 ----------
function drawLaundry() {
  const [c, ctx] = canvas(300, 230);
  for (const x of [14, 278]) {
    rr(ctx, x, 20, 12, 206, 4, '#a0754e', OL, 4);
  }
  ctx.beginPath();
  ctx.moveTo(22, 40);
  ctx.quadraticCurveTo(150, 64, 282, 40);
  ctx.strokeStyle = '#e8dcc6'; ctx.lineWidth = 4; ctx.stroke();
  const cloths = [[60, 44, 54, 70, '#ffffff'], [130, 52, 46, 84, '#cfe3ef'], [196, 48, 58, 60, '#f8d7de']];
  for (const [x, y, w, h, col] of cloths) {
    rr(ctx, x, y, w, h, 4, col, OL, 4);
    ctx.fillStyle = 'rgba(90,59,42,0.08)';
    ctx.fillRect(x + w * 0.6, y + 4, w * 0.3, h - 8);
    ell(ctx, x + 6, y + 2, 4, 6, '#d9a441', OL, 2);
    ell(ctx, x + w - 6, y + 2, 4, 6, '#d9a441', OL, 2);
  }
  return c;
}

// ---------- 木箱、繩圈 ----------
function drawCrate() {
  const [c, ctx] = canvas(80, 70);
  rr(ctx, 6, 18, 68, 48, 4, '#b0835a');
  rr(ctx, 6, 8, 68, 14, 3, '#c79a6a');
  line(ctx, [[8, 42], [72, 42]], 'rgba(90,59,42,0.6)', 3);
  line(ctx, [[10, 22], [70, 62]], 'rgba(90,59,42,0.5)', 4);
  return c;
}

function drawRopeCoil() {
  const [c, ctx] = canvas(70, 44);
  for (let i = 0; i < 3; i++) ell(ctx, 35, 24, 30 - i * 8, 15 - i * 4, i === 0 ? '#d9c08a' : null, '#8a6a3a', 4);
  return c;
}

// ---------- 效果用小圖 ----------
function drawLeaf() {
  const [c, ctx] = canvas(24, 14);
  ell(ctx, 12, 7, 10, 5, '#ffffff', null);
  line(ctx, [[3, 7], [21, 7]], 'rgba(0,0,0,0.2)', 1.5);
  return c;
}

function drawGlow() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,226,150,0.85)');
  g.addColorStop(0.35, 'rgba(255,210,130,0.35)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function drawSparkle() {
  const [c, ctx] = canvas(16, 16);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(9.5, 6.5); ctx.lineTo(16, 8); ctx.lineTo(9.5, 9.5);
  ctx.lineTo(8, 16); ctx.lineTo(6.5, 9.5); ctx.lineTo(0, 8); ctx.lineTo(6.5, 6.5);
  ctx.closePath();
  ctx.fill();
  return c;
}

function drawFishShadow() {
  const [c, ctx] = canvas(60, 24);
  ell(ctx, 26, 12, 20, 8, 'rgba(30,60,70,0.55)', null);
  poly(ctx, [[44, 12], [58, 3], [58, 21]], 'rgba(30,60,70,0.55)', null);
  return c;
}

// ---------- 灰青瓦屋頂（配合建築物.png 的色調） ----------
const TILE = { base: '#5f6b6c', dark: '#4a5455', light: '#7d8a8a' };

// ---------- 候車亭 ----------
function drawBusStop() {
  const [c, ctx] = canvas(360, 300);
  rr(ctx, 40, 120, 280, 150, 4, '#b98b5e'); // 後牆
  for (let x = 52; x < 320; x += 22) line(ctx, [[x, 124], [x, 266]], 'rgba(90,59,42,0.35)', 3);
  for (const x of [44, 302]) rr(ctx, x, 104, 16, 176, 4, '#8a5a3c');
  // 長椅
  rr(ctx, 80, 210, 200, 16, 4, '#c79a6a'); rr(ctx, 92, 226, 12, 40, 3, '#8a5a3c'); rr(ctx, 256, 226, 12, 40, 3, '#8a5a3c');
  // 屋頂
  poly(ctx, [[10, 130], [60, 40], [300, 40], [350, 130]], TILE.base);
  for (let y = 56; y < 130; y += 16) line(ctx, [[22 + (130 - y) * 0.4, y], [338 - (130 - y) * 0.4, y]], TILE.dark, 3);
  rr(ctx, 50, 30, 260, 16, 6, TILE.dark);
  // 站牌
  rr(ctx, 330, 120, 8, 170, 3, '#8a8f96');
  ell(ctx, 334, 112, 22, 22, '#4a7fc1', OL, 4);
  rr(ctx, 322, 104, 24, 14, 3, '#ffffff', null);
  rr(ctx, 318, 150, 32, 56, 4, '#fbf4e6', OL, 3);
  for (let i = 0; i < 4; i++) line(ctx, [[324, 162 + i * 11], [344, 162 + i * 11]], 'rgba(90,59,42,0.4)', 2);
  return c;
}

// ---------- 村莊地圖看板 ----------
function drawVillageMap() {
  const [c, ctx] = canvas(260, 220);
  for (const x of [40, 210]) rr(ctx, x, 110, 14, 106, 3, '#8a5a3c');
  rr(ctx, 10, 20, 240, 124, 8, '#9b6a44');
  rr(ctx, 22, 32, 216, 100, 4, '#e9e2c6', OL, 3);
  ctx.fillStyle = '#a9c97a'; ctx.fillRect(24, 34, 212, 64);
  ctx.fillStyle = '#6fb9b4'; ctx.fillRect(24, 98, 212, 20);
  ctx.fillStyle = '#d8c39c';
  ctx.fillRect(24, 88, 212, 8); ctx.fillRect(70, 40, 8, 56); ctx.fillRect(70, 56, 150, 8);
  ctx.fillStyle = '#b98b5e'; ctx.fillRect(54, 110, 12, 30);
  for (const [x, y, col] of [[64, 46, '#e98c8c'], [120, 46, '#7d8a8a'], [170, 46, '#7d8a8a'], [208, 70, '#9fc3a0']]) rr(ctx, x, y, 18, 12, 2, col, null);
  ell(ctx, 120, 76, 10, 10, '#6f9650', null);
  rr(ctx, 70, 0, 120, 26, 6, '#c79a6a', OL, 3);
  ctx.fillStyle = '#4a3426'; ctx.font = 'bold 18px "Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('村莊地圖', 130, 19);
  return c;
}

// ---------- 夾娃娃機的木造側屋（屋簷下放機台） ----------
function drawClawShed() {
  const [c, ctx] = canvas(420, 420);
  rr(ctx, 30, 160, 360, 230, 4, '#a77a52'); // 後牆
  for (let x = 44; x < 390; x += 26) line(ctx, [[x, 164], [x, 386]], 'rgba(90,59,42,0.3)', 3);
  rr(ctx, 30, 380, 360, 30, 6, '#b9b0a0'); // 石基
  for (const x of [28, 374]) rr(ctx, x, 120, 18, 290, 4, '#8a5a3c');
  // 小招牌
  rr(ctx, 140, 186, 140, 40, 8, '#e2b97a', OL, 4);
  ctx.fillStyle = '#5a3a22'; ctx.font = 'bold 24px "Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('夾娃娃', 210, 207);
  // 單斜屋頂（灰青瓦）
  poly(ctx, [[0, 168], [36, 40], [384, 40], [420, 168]], TILE.base);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, 168); ctx.lineTo(36, 40); ctx.lineTo(384, 40); ctx.lineTo(420, 168); ctx.closePath(); ctx.clip();
  for (let y = 56; y < 170; y += 18) {
    ctx.fillStyle = TILE.dark; ctx.fillRect(0, y, 420, 3);
    for (let x = 0; x < 420; x += 24) { ctx.beginPath(); ctx.arc(x + ((y / 18) % 2) * 12, y + 1, 10, 0, Math.PI); ctx.strokeStyle = TILE.light; ctx.lineWidth = 3; ctx.stroke(); }
  }
  ctx.restore();
  poly(ctx, [[0, 168], [36, 40], [384, 40], [420, 168]], null);
  rr(ctx, 24, 28, 372, 20, 8, TILE.dark);
  // 燈籠
  rr(ctx, 60, 176, 22, 32, 8, '#f6d58c', OL, 3);
  return c;
}

// ---------- 茶屋外的小桌（紅布） ----------
function drawTeaTable() {
  const [c, ctx] = canvas(170, 84);
  rr(ctx, 20, 40, 10, 40, 3, '#8a5a3c'); rr(ctx, 140, 40, 10, 40, 3, '#8a5a3c');
  rr(ctx, 6, 18, 158, 30, 6, '#c0504d');
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(12, 22, 146, 6);
  ell(ctx, 60, 16, 12, 8, '#e9e2c6', OL, 3); ell(ctx, 104, 16, 12, 8, '#e9e2c6', OL, 3);
  return c;
}

function drawHeart() {
  const [c, ctx] = canvas(28, 28);
  ctx.fillStyle = '#f08aa0';
  ctx.beginPath();
  ctx.moveTo(14, 25);
  ctx.bezierCurveTo(-4, 12, 4, -2, 14, 8);
  ctx.bezierCurveTo(24, -2, 32, 12, 14, 25);
  ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.stroke();
  return c;
}

export const PROP_DRAWERS = {
  bus_stop: drawBusStop,
  village_map: drawVillageMap,
  claw_shed: drawClawShed,
  tea_table: drawTeaTable,
  heart: drawHeart,
  house_a: () => drawHouse(HOUSE_VARIANTS.a),
  house_b: () => drawHouse(HOUSE_VARIANTS.b),
  house_c: () => drawHouse(HOUSE_VARIANTS.c),
  claw_shop: drawClawShop,
  fence: drawFence,
  reeds_a: () => drawReeds(11),
  reeds_b: () => drawReeds(29),
  rock_a: () => drawRock(5),
  rock_b: () => drawRock(17),
  bush: () => drawBush(null, 3),
  bush_pink: () => drawBush('#f4a6b8', 8),
  bush_blue: () => drawBush('#9db4e6', 13),
  bucket: drawBucket,
  cat: drawCat,
  garden: drawGarden,
  laundry: drawLaundry,
  crate: drawCrate,
  rope_coil: drawRopeCoil,
  leaf: drawLeaf,
  glow: drawGlow,
  sparkle: drawSparkle,
  fish_shadow: drawFishShadow,
};
