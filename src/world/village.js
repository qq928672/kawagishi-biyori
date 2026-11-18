import { bridgeWidthFactor } from '../config/map.js';
import Phaser from 'phaser';
import { FONT } from '../config/gameConfig.js';
import { TEX_SCALE } from '../config/assets.js';

// 村莊繪製（三層地形）
// 分層：
//   depth 0      地面（Canvas 烘焙：草地、道路、河面、擋土牆、石階、平台、陰影、花草）
//   depth 2-4    水波、反光、魚影、水中石頭
//   depth 5      木橋橋面（地面層）
//   depth = y    物件、角色、橋欄杆條帶（依接觸地面的 y 排序）
//   depth 8000   靠近才出現的地點標籤
//   depth 9000+  落葉、暖光等前景效果
// 互動提示與 HTML 介面在更上層

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inRect = (x, y, r, m = 0) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function inShape(s, x, y, m = 0) {
  if (s.type === 'ellipse') return ((x - s.x) / (s.rx + m)) ** 2 + ((y - s.y) / (s.ry + m)) ** 2 <= 1;
  if (s.type === 'rect') return inRect(x, y, s, m);
  for (let i = 0; i < s.pts.length - 1; i++) {
    if (distToSeg(x, y, s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1]) <= s.w / 2 + m) return true;
  }
  return false;
}

export function objectRect(o, r) {
  return { x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h };
}

/** 圖塊 → 鏡射 2×2 的無縫圖樣（邊緣與自己的鏡像相接，不會出現接縫） */
function seamlessPattern(ctx, src, size, inset = 8, wash = null) {
  const t = document.createElement('canvas');
  t.width = size * 2;
  t.height = size * 2;
  const tc = t.getContext('2d');
  const sw = src.width - inset * 2;
  const sh = src.height - inset * 2;
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    tc.save();
    tc.translate(qx * size + (qx ? size : 0), qy * size + (qy ? size : 0));
    tc.scale(qx ? -1 : 1, qy ? -1 : 1);
    tc.drawImage(src, inset, inset, sw, sh, 0, 0, size, size);
    tc.restore();
  }
  // 降低紋理對比：覆蓋一層同色系的半透明色
  if (wash) {
    tc.fillStyle = wash;
    tc.fillRect(0, 0, t.width, t.height);
  }
  return ctx.createPattern(t, 'repeat');
}

function tracePath(ctx, s) {
  ctx.beginPath();
  if (s.type === 'ellipse') ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
  else if (s.type === 'rect') ctx.rect(s.x, s.y, s.w, s.h);
  else {
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (const p of s.pts.slice(1)) ctx.lineTo(p[0], p[1]);
  }
}

function paintShape(ctx, s, style, grow = 0) {
  tracePath(ctx, s);
  if (s.type === 'ellipse' || s.type === 'rect') {
    if (grow) {
      ctx.lineWidth = grow * 2;
      ctx.strokeStyle = style;
      ctx.stroke();
    }
    ctx.fillStyle = style;
    ctx.fill();
  } else {
    ctx.lineCap = s.cap || 'round'; // cap: 'butt' → 平切口（接到其他路面時不留圓頭）
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.w + grow * 2;
    ctx.strokeStyle = style;
    ctx.stroke();
  }
}

function flower(ctx, x, y, color, rnd, n = 3) {
  for (let k = 0; k < n; k++) {
    const fx = x + (rnd() - 0.5) * 26;
    const fy = y + (rnd() - 0.5) * 10;
    ctx.fillStyle = '#6f9650';
    ctx.beginPath(); ctx.ellipse(fx + 2, fy + 4, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(fx + Math.cos(ang) * 2.6, fy + Math.sin(ang) * 2.6, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f2c45a';
    ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

function tuft(ctx, x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7);
  ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 9);
  ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 6);
  ctx.stroke();
}

/** 橫向木板（橋頭接岸用；顏色接近 bridge_ns 的木色） */
function plankH(ctx, x, y, w, h) {
  ctx.fillStyle = '#6e4a2c'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a57a4e'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2.5);
  ctx.fillStyle = 'rgba(255,236,200,0.22)'; ctx.fillRect(x + 2, y + 1, w - 4, 1.5);
}

/** 擋土牆：草頂＋石面的圖塊左右翻轉交錯拼接；stoneOnly 時只取石面（河堤） */
function drawWall(ctx, wall, x1, x2, edge, face, { stoneOnly = false, noShadow = false } = {}) {
  const capSrc = stoneOnly ? Math.round(wall.height * 0.32) : 0;
  const srcH = wall.height - capSrc;
  const cap = stoneOnly ? 0 : 26; // 草頂往上覆蓋上一層地面的邊緣
  const drawH = face + cap;
  const tw = (wall.width * drawH) / srcH;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x1, edge - cap - 4, x2 - x1, drawH + 8);
  ctx.clip();
  for (let x = x1 - 10, i = 0; x < x2 + tw; x += tw - 22, i++) {
    ctx.save();
    if (i % 2) {
      ctx.translate(x + tw, edge - cap);
      ctx.scale(-1, 1);
      ctx.drawImage(wall, 0, capSrc, wall.width, srcH, 0, 0, tw, drawH);
    } else {
      ctx.drawImage(wall, 0, capSrc, wall.width, srcH, x, edge - cap, tw, drawH);
    }
    ctx.restore();
  }
  ctx.restore();
  if (noShadow) return;
  // 牆腳投影（落在下一層地面上）
  const bottom = edge + face;
  const g = ctx.createLinearGradient(0, bottom, 0, bottom + 34);
  g.addColorStop(0, 'rgba(40,42,22,0.30)');
  g.addColorStop(1, 'rgba(40,42,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x1, bottom, x2 - x1, 34);
}

export function buildVillage(scene, map) {
  const { width: W, height: H } = map.world;
  const rnd = rng(20261118);
  const R = map.river;
  const T = map.tiers;
  const tex = (k) => scene.textures.get(k).getSourceImage();

  const roadList = [...map.roads.plaza, ...map.roads.street, ...map.roads.walkway, ...map.roads.dirt];
  const onRoad = (x, y, m = 0) => roadList.some((s) => inShape(s, x, y, m));
  const nearObject = (x, y, m) => map.objects.some((o) => o.collider && inRect(x, y, objectRect(o, o.collider), m));
  const onWall = (x, y) => Object.values(T).some((t) => y > t.edge - 30 && y < t.edge + t.face + 6 && x >= t.wallX[0] && x <= t.wallX[1]);
  const onStairs = (x, y) => map.stairs.some((s) => x > s.x - s.width / 2 - 6 && x < s.x + s.width / 2 + 6 && y > s.top - 6 && y < s.top + s.height + 6);

  // ================= 地面 Canvas =================
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // 草地：降低對比（覆蓋一層同色系淡色），避免整片畫面過度繁雜
  const grass = seamlessPattern(ctx, tex('tile_grass'), 170, 30, 'rgba(150,178,96,0.38)');
  const dirt = seamlessPattern(ctx, tex('tile_dirt'), 160, 28, 'rgba(206,170,120,0.18)');
  const cobble = seamlessPattern(ctx, tex('tile_cobble'), 100, 14, 'rgba(206,190,163,0.38)');
  const street = seamlessPattern(ctx, tex('tile_old_street'), 140, 0, 'rgba(206,191,164,0.18)');
  const walkway = seamlessPattern(ctx, tex('tile_dirt'), 112, 28, 'rgba(198,184,158,0.52)');

  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, W, H);
  // 大面積、低對比的明暗變化，打散圖樣的重複感
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 120 + rnd() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    g.addColorStop(0, light ? 'rgba(255,240,180,0.07)' : 'rgba(40,70,20,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 上層台地受光較多（略亮、略暖）
  ctx.fillStyle = 'rgba(255,236,190,0.06)';
  ctx.fillRect(0, T.upper.top, W, T.upper.edge - T.upper.top);
  // 北側樹林陰影
  const fg = ctx.createLinearGradient(0, 0, 0, 280);
  fg.addColorStop(0, 'rgba(35,55,25,0.55)');
  fg.addColorStop(1, 'rgba(35,55,25,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, W, 280);

  // 道路：先畫邊框（草邊），再填圖樣
  for (const s of map.roads.dirt) paintShape(ctx, s, 'rgba(120,96,58,0.35)', 4);
  for (const s of map.roads.dirt) paintShape(ctx, s, dirt);
  for (const s of map.roads.walkway) paintShape(ctx, s, walkway);
  for (const s of map.roads.street) paintShape(ctx, s, 'rgba(120,100,72,0.55)', 3);
  for (const s of map.roads.street) paintShape(ctx, s, street);
  for (const s of map.roads.plaza) paintShape(ctx, s, '#bdac90', 3);
  for (const s of map.roads.plaza) paintShape(ctx, s, cobble);

  // 踏石
  for (const [x, y] of map.stepping) {
    ctx.fillStyle = 'rgba(70,60,40,0.25)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8b0a0';
    ctx.beginPath(); ctx.ellipse(x, y, 16, 8.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.35)';
    ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // 緩坡：上亮下暗的漸層，表現由高到低；坡道兩側的小石緣
  const RP = map.ramp;
  // 只沿坡道路面上色（不畫成方塊）：上段亮、下段暗
  const rg = ctx.createLinearGradient(0, RP.top, 0, RP.bottom);
  rg.addColorStop(0, 'rgba(255,240,200,0.12)');
  rg.addColorStop(1, 'rgba(50,40,20,0.14)');
  paintShape(ctx, { type: 'seg', pts: RP.path, w: 76 }, rg);
  // 坡面上踩實的橫向階痕（淡淡的明暗條紋，表現坡度），只畫在坡道路面上
  const rampRoad = map.roads.dirt.find((s) => s.pts === RP.path);
  for (let y = T.upper.edge - 4; y < RP.bottom; y += 15) {
    for (let x = RP.x1; x < RP.x2; x += 3) {
      if (!rampRoad || !inShape(rampRoad, x, y, -8)) continue;
      ctx.fillStyle = 'rgba(90,62,32,0.16)';
      ctx.fillRect(x, y, 3, 2);
      ctx.fillStyle = 'rgba(255,236,200,0.14)';
      ctx.fillRect(x, y - 2, 3, 2);
    }
  }

  // 大樹花壇
  for (const o of map.objects) {
    if (!o.planter) continue;
    const { rx, ry } = o.planter;
    ctx.fillStyle = '#7d5f42';
    ctx.beginPath(); ctx.ellipse(o.x, o.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const x = o.x + Math.cos(a) * rx;
      const y = o.y + Math.sin(a) * ry;
      ctx.fillStyle = '#857e72';
      ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = Math.round(a * 5) % 2 ? '#bdb6a8' : '#a9a294';
      ctx.beginPath(); ctx.ellipse(x, y - 1, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.45 + rnd() * 0.4;
      flower(ctx, o.x + Math.cos(a) * rx * d, o.y + Math.sin(a) * ry * d, ['#f6b8c6', '#ffffff', '#f7dc84', '#c9b6e8'][i % 4], rnd, 2);
    }
  }

  // 河面（低對比的水紋）
  const wg = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
  wg.addColorStop(0, '#4f9e9b');
  wg.addColorStop(0.3, '#3f9496');
  wg.addColorStop(1, '#4fa39f');
  ctx.fillStyle = wg;
  ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 36; i++) { ctx.beginPath(); ctx.ellipse(rnd() * W, R.y + 50 + rnd() * (R.h - 70), 60 + rnd() * 120, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,214,140,0.08)';
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.ellipse(rnd() * W, R.y + 40 + rnd() * (R.h - 60), 30 + rnd() * 50, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
  // 對岸岸邊（沙地 + 石頭）
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(0, R.y + R.h - 6, W, 14);
  for (let x = 0; x < W; x += 30 + rnd() * 30) {
    ctx.fillStyle = '#857e72';
    ctx.beginPath(); ctx.ellipse(x, R.y + R.h + 2, 12 + rnd() * 8, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5afa2';
    ctx.beginPath(); ctx.ellipse(x - 1, R.y + R.h, 9 + rnd() * 5, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(227,243,241,0.55)';
  for (let x = 0; x < W; x += 18) { ctx.beginPath(); ctx.ellipse(x + rnd() * 6, R.y + R.h - 8, 10, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }

  // ---- 擋土牆（三層） ----
  const wall = tex('wall_straight');
  const drawEnd = T.upper.drawEnd ?? T.upper.wallX[1];
  drawWall(ctx, wall, T.upper.wallX[0], drawEnd, T.upper.edge, T.upper.face);
  // 上層牆的東端：牆面高度沿著緩坡逐漸變矮（斜切收尾），牆腳的草坡跟著往上，接到坡道
  {
    const x1 = drawEnd - 4;
    const x2 = T.upper.wallX[1];
    const E = T.upper.edge;
    const bottomL = E + T.upper.face;
    const bottomR = E + 14; // 東端只剩一點點石面
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, E - 30);
    ctx.lineTo(x2 + 2, E - 30);
    ctx.lineTo(x2 + 2, bottomR);
    ctx.quadraticCurveTo((x1 + x2) / 2 + 10, (bottomL + bottomR) / 2 + 22, x1, bottomL + 2);
    ctx.closePath();
    ctx.clip();
    drawWall(ctx, wall, x1 - 40, x2 + 2, E, T.upper.face, { noShadow: true });
    ctx.restore();
    // 斜切處的草邊與投影
    ctx.strokeStyle = 'rgba(40,46,22,0.28)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x2 + 2, bottomR + 4);
    ctx.quadraticCurveTo((x1 + x2) / 2 + 10, (bottomL + bottomR) / 2 + 26, x1, bottomL + 6);
    ctx.stroke();
    ctx.strokeStyle = '#7fa65a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x2 + 2, bottomR);
    ctx.quadraticCurveTo((x1 + x2) / 2 + 10, (bottomL + bottomR) / 2 + 22, x1, bottomL + 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      tuft(ctx, x2 - (x2 - x1) * t, bottomR + (bottomL - bottomR) * t + 4, '#6f9650');
    }
  }
  drawWall(ctx, wall, T.middle.wallX[0], T.middle.wallX[1], T.middle.edge, T.middle.face);
  drawWall(ctx, wall, 0, W, T.lower.edge, T.lower.face, { stoneOnly: true });
  // 河堤石壁在水中的陰影
  ctx.fillStyle = 'rgba(30,80,84,0.32)';
  ctx.fillRect(0, R.y, W, 14);

  // ---- 石階（從牆頂延伸到下一層地面） ----
  const st = tex('stairs_stone');
  for (const s of map.stairs) {
    // 牆頂草皮會覆蓋道路。先鋪漸寬的入口，再讓踏面壓住鋪面末端。
    const fromUpper = s.id === 'stairs-upper';
    const fromBank = s.id === 'stairs-pier';
    const approachHalf = fromUpper ? 35 : fromBank ? s.walk.w / 2 : 46;
    const mouthHalf = s.width * 0.37;
    const startY = s.top - (fromUpper ? 20 : 30);
    ctx.fillStyle = fromUpper ? dirt : fromBank ? walkway : street;
    ctx.beginPath();
    ctx.moveTo(s.x - approachHalf, startY);
    ctx.lineTo(s.x + approachHalf, startY);
    ctx.lineTo(s.x + mouthHalf, s.top + 6);
    ctx.lineTo(s.x - mouthHalf, s.top + 6);
    ctx.closePath();
    ctx.fill();

    // 中央石階下端比廣場支路寬，沿石階底緣收束回原路寬。
    if (fromUpper) {
      const foot = s.top + s.height;
      ctx.fillStyle = cobble;
      ctx.beginPath();
      ctx.moveTo(s.x - s.width * 0.47, foot - 9);
      ctx.lineTo(s.x + s.width * 0.47, foot - 9);
      ctx.lineTo(s.x + 56, foot + 24);
      ctx.lineTo(s.x - 56, foot + 24);
      ctx.closePath();
      ctx.fill();
    }
    // 石階兩側的落地陰影
    ctx.fillStyle = 'rgba(40,40,20,0.22)';
    ctx.beginPath(); ctx.ellipse(s.x + 6, s.top + s.height - 2, s.width / 2 + 6, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(st, s.x - s.width / 2, s.top, s.width, s.height);
  }

  // ---- 釣魚平台（比步道低一階，貼近水面） ----
  const P = map.platform;
  const plat = tex('fish_platform');
  const ph = (P.width * plat.height) / plat.width;
  ctx.fillStyle = 'rgba(25,70,74,0.38)';
  ctx.beginPath(); ctx.ellipse(P.x + 10, P.top + ph - 4, P.width / 2 + 10, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(plat, P.x - P.width / 2, P.top, P.width, ph);
  // 平台石階最後畫（蓋在平台後緣上，下端接平台頂面）
  const sp = map.stairs.find((s) => s.id === 'stairs-pier');
  if (sp) ctx.drawImage(st, sp.x - sp.width / 2, sp.top, sp.width, sp.height);

  // ---- 木橋在水面的陰影 ----
  const B = map.bridge;
  ctx.fillStyle = 'rgba(20,60,64,0.28)';
    ctx.beginPath();
  for (const [side, y] of [[-1, R.y], [1, R.y], [1, R.y + R.h], [-1, R.y + R.h]]) {
    const t = (y - B.top) / B.height;
    const half = (210 + 155 * t) * B.height / B.src.h * bridgeWidthFactor(t);
    const x = B.x + 12 + side * half;
    if (side === -1 && y === R.y) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // ---- 橋頭接岸木板：從步道前緣接到橋面第一片木板，蓋住中間露出的堤壁 ----
  {
    const s = B.height / B.src.h;
    const sx = s * bridgeWidthFactor(B.src.top[0] / B.src.h);
    const left = B.x - (B.src.w * sx) / 2;
    const deckTop = B.top + B.src.top[0] * s + 4;
    const x1 = left + B.src.top[1] * sx - 2;
    const x2 = left + B.src.top[2] * sx + 2;
    for (let y = T.lower.edge - 8; y < deckTop; y += 8) plankH(ctx, x1, y, x2 - x1, 8);
  }

  // ---- 物件落地陰影（光從左上方來，陰影略偏右下） ----
  for (const o of map.objects) {
    if (o.eave) {
      // 屋簷陰影：建築正面地面的一條柔和暗帶
      const g = ctx.createLinearGradient(0, o.y - 10, 0, o.y + 26);
      g.addColorStop(0, 'rgba(40,40,20,0.32)');
      g.addColorStop(1, 'rgba(40,40,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(o.x - o.eave / 2 + 6, o.y - 10, o.eave + 10, 36, 12);
      ctx.fill();
    }
    if (!o.shadow) continue;
    const dx = o.leaves ? 14 : 6;
    ctx.fillStyle = o.leaves ? 'rgba(40,60,25,0.24)' : 'rgba(50,60,30,0.2)';
    ctx.beginPath(); ctx.ellipse(o.x + dx, o.y + (o.shadow.dy || 0) + 2, o.shadow.w / 2, o.shadow.h / 2, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- 花草：只在指定的花壇位置（牆角、入口、樹根、路邊） ----
  const flowerColors = ['#f6b8c6', '#ffffff', '#f7dc84', '#f1a1b5', '#c9b6e8', '#9db4e6'];
  const canDecorate = (x, y) =>
    x > 34 && x < W - 34 && y > T.upper.top + 10 && y < H - 40 && !inRect(x, y, R, 6) && !onRoad(x, y, 3) && !nearObject(x, y, 6) && !onWall(x, y) && !onStairs(x, y) &&
    !inRect(x, y, { x: map.garden.x1, y: map.garden.y1, w: map.garden.x2 - map.garden.x1, h: map.garden.y2 - map.garden.y1 }, 10);
  for (const b of map.flowerBeds) {
    for (let i = 0; i < b.n; i++) {
      const x = b.x + (rnd() - 0.5) * 60;
      const y = b.y + (rnd() - 0.5) * 18;
      if (!onWall(x, y) && !onStairs(x, y) && !inRect(x, y, R, 4)) flower(ctx, x, y, flowerColors[Math.floor(rnd() * flowerColors.length)], rnd, 3);
    }
  }
  for (const o of map.objects) {
    if (!o.leaves) continue;
    for (let i = 0; i < 3; i++) {
      const x = o.x + (rnd() - 0.5) * 80;
      const y = o.y + 6 + rnd() * 14;
      if (canDecorate(x, y)) tuft(ctx, x, y, '#6f9650');
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (canDecorate(x, y)) tuft(ctx, x, y, ['#86a862', '#7a9d58', '#8fb26a'][i % 3]);
  }

  if (scene.textures.exists('ground')) scene.textures.remove('ground');
  scene.textures.addCanvas('ground', c);
  scene.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);

  // ================= 水面動態（低透明度、緩慢） =================
  const inWater = () => [R.x + 20 + rnd() * (R.w - 40), R.y + 34 + rnd() * (R.h - 60)];
  for (let i = 0; i < 46; i++) {
    const [x, y] = inWater();
    if (Math.abs(x - B.x) < 150 || Math.abs(x - P.x) < 190) continue;
    const w = scene.add.image(x, y, 'soft_wave').setDepth(2).setAlpha(0).setScale(0.6 + rnd() * 0.9, 0.8);
    scene.tweens.add({
      targets: w, alpha: { from: 0, to: 0.32 }, x: x + 16 + rnd() * 18,
      duration: 2600 + rnd() * 2000, delay: rnd() * 3000, yoyo: true, repeat: -1, repeatDelay: rnd() * 2000, ease: 'Sine.easeInOut',
    });
  }
  for (let i = 0; i < 30; i++) {
    const [x, y] = inWater();
    const s = scene.add.image(x, y, 'sparkle').setDepth(3).setAlpha(0).setScale(0.35 + rnd() * 0.35);
    scene.tweens.add({ targets: s, alpha: { from: 0, to: 0.75 }, duration: 420, delay: rnd() * 6000, yoyo: true, repeat: -1, repeatDelay: 3000 + rnd() * 5000 });
  }
  for (let i = 0; i < 5; i++) {
    const f = scene.add.image(R.x + rnd() * R.w, R.y + 60 + rnd() * (R.h - 100), 'fish_shadow').setDepth(2).setAlpha(0.5).setScale(1 / TEX_SCALE);
    const swim = () => {
      const tx = Phaser.Math.Clamp(f.x + (rnd() - 0.5) * 500, 40, W - 40);
      f.setFlipX(tx > f.x);
      scene.tweens.add({
        targets: f, x: tx, y: Phaser.Math.Clamp(f.y + (rnd() - 0.5) * 60, R.y + 50, R.y + R.h - 30),
        duration: 4000 + rnd() * 4000, ease: 'Sine.easeInOut', delay: 600 + rnd() * 2500, onComplete: swim,
      });
    };
    swim();
  }
  for (const r of map.waterRocks) {
    scene.add.image(r.x, r.y, r.texture).setOrigin(0.5, 0.75).setScale(r.scale / TEX_SCALE).setDepth(4);
    const ring = scene.add.ellipse(r.x, r.y + 4, 120 * r.scale, 22 * r.scale).setStrokeStyle(2, 0xe3f3f1, 0.5).setDepth(3);
    scene.tweens.add({ targets: ring, scaleX: 1.3, scaleY: 1.3, alpha: 0, duration: 2600, repeat: -1, delay: rnd() * 2000 });
  }

  // ================= 木橋：橋面在地面層，欄杆切成水平條帶依 y 排序 =================
  buildBridge(scene, B);

  // ================= 物件 =================
  const sprites = new Map();
  const leafSources = [];
  const glows = [];
  const occluders = [];
  for (const o of map.objects) {
    const img = scene.add.image(o.x, o.y, o.texture).setOrigin(o.origin[0], o.origin[1]).setScale(1 / TEX_SCALE);
    if (o.flipX) img.setFlipX(true);
    img.setDepth(o.depth ?? o.y);
    sprites.set(o.id, img);
    if (o.leaves) leafSources.push(o);
    if (o.occlude) occluders.push({ obj: o, img });
    if (o.glow) {
      const glow = scene.add.image(o.x, o.y + o.glow.dy, 'glow').setScale(1.4 / TEX_SCALE).setBlendMode(Phaser.BlendModes.ADD).setDepth(img.depth + 1).setAlpha(0.2);
      glows.push(glow);
    }
  }

  // 擋土牆沿線的木柵欄
  const fenceSolids = [];
  const fenceTex = scene.textures.get('fence').getSourceImage();
  for (const F of map.fences) {
    for (let x = F.x1; x < F.x2; x += F.spacing) {
      const x2 = Math.min(x + F.spacing, F.x2);
      if (F.gaps.some(([a, b]) => x2 > a && x < b)) continue;
      scene.add.image(x, F.y, 'fence').setOrigin(0, 1).setScale((x2 - x + 8) / fenceTex.width, (F.spacing + 8) / fenceTex.width).setDepth(F.y);
      fenceSolids.push({ x, y: F.y - 10, w: x2 - x + 8, h: 14 });
    }
  }
  // 菜園籬笆的碰撞
  const G = map.garden;
  const gardenSolids = [
    { x: G.x1, y: G.y1 - 12, w: G.x2 - G.x1, h: 14 },
    { x: G.x1 - 8, y: G.y1, w: 16, h: G.y2 - G.y1 },
    { x: G.x2 - 8, y: G.y1, w: 16, h: G.y2 - G.y1 },
    { x: G.x1, y: G.y2 - 12, w: G.gate[0] - G.x1, h: 14 },
    { x: G.gate[1], y: G.y2 - 12, w: G.x2 - G.gate[1], h: 14 },
  ];

  // 招牌與地點標籤
  const nearLabels = [];
  for (const l of map.labels) {
    if (l.style === 'sign') {
      const o = map.objects.find((ob) => ob.id.startsWith(l.on));
      if (!o) continue;
      const t = scene.add.text(o.x + l.dx, o.y + l.dy, l.text, {
        fontFamily: FONT, fontSize: `${l.size || 17}px`, fontStyle: 'bold', color: '#5a3a22', resolution: 2,
      }).setOrigin(0.5).setDepth(o.y + 1);
      // 招牌跟著建築一起淡化
      const occ = occluders.find((x) => x.obj === o);
      if (occ) (occ.extras ||= []).push(t);
    } else {
      const t = scene.add.text(l.x, l.y, l.text, {
        fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#fff8ea', resolution: 2,
        backgroundColor: 'rgba(110,75,58,0.78)', padding: { x: 9, y: 3 },
      }).setOrigin(0.5).setDepth(8000).setAlpha(0);
      nearLabels.push({ text: t, x: l.x, y: l.y, radius: l.radius || 200 });
    }
  }

  return { sprites, leafSources, glows, occluders, nearLabels, solids: [...fenceSolids, ...gardenSolids, ...(map.solids || [])] };
}

/** 木橋：依原圖的橋面輪廓拆成「橋面」（地面層）與「欄杆」（條帶），處理角色前後遮擋 */
function buildBridge(scene, B) {
  const srcTex = scene.textures.get('bridge_ns').getSourceImage();
  const k = srcTex.height / B.src.h; // 原圖座標 → 紋理座標
  const [ty0, l0, r0] = B.src.top;
  const [ty1, l1, r1] = B.src.bottom;
  const poly = [[l0, 0], [r0, 0], [r0, ty0], [r1, ty1], [r1 + 10, B.src.h], [l1 - 10, B.src.h], [l1, ty1], [l0, ty0]].map(([x, y]) => [x * k, y * k]);
  const mk = (key, inside) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const cv = document.createElement('canvas');
    cv.width = srcTex.width;
    cv.height = srcTex.height;
    const cx = cv.getContext('2d');
    cx.drawImage(srcTex, 0, 0);
    cx.globalCompositeOperation = inside ? 'destination-in' : 'destination-out';
    cx.beginPath();
    poly.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
    cx.closePath();
    cx.fill();
    const tapered = document.createElement('canvas');
    tapered.width = cv.width;
    tapered.height = cv.height;
    const dst = tapered.getContext('2d');
    for (let y = 0; y < cv.height; y++) {
      const width = cv.width * bridgeWidthFactor(y / cv.height);
      dst.drawImage(cv, 0, y, cv.width, 1, (cv.width - width) / 2, y, width, 1);
    }
    scene.textures.addCanvas(key, tapered);
  };
  mk('bridge_deck', true);
  mk('bridge_rails', false);
  const s = B.height / srcTex.height; // 紋理 → 畫面
  const left = B.x - (srcTex.width * s) / 2;
  scene.add.image(left, B.top, 'bridge_deck').setOrigin(0, 0).setScale(s).setDepth(5);
  // 欄杆條帶：每條的 depth = 該條在畫面上的底部 y
  const strip = 22 / s;
  for (let y = 0; y < srcTex.height; y += strip) {
    const h = Math.min(strip, srcTex.height - y);
    const img = scene.add.image(left, B.top, 'bridge_rails').setOrigin(0, 0).setScale(s);
    img.setCrop(0, y, srcTex.width, h);
    img.setDepth(B.top + (y + h) * s - 4);
  }
}

// ================= 落葉（少量、只在鏡頭附近） =================
export function startFallingLeaves(scene, leafSources, count = 7) {
  const cam = scene.cameras.main;
  const colors = [0x9cc06a, 0xc9d36a, 0xe2b35a, 0xb7cf77];
  const respawn = (leaf, first) => {
    const view = cam.worldView;
    const near = leafSources.filter((t) => t.x > view.x - 100 && t.x < view.right + 100 && t.y > view.y - 100 && t.y < view.bottom + 300);
    const src = near.length ? Phaser.Utils.Array.GetRandom(near) : null;
    const x = src ? src.x + Phaser.Math.Between(-90, 90) : view.x + Math.random() * view.width;
    const y = src ? src.y - Phaser.Math.Between(150, 230) : view.y - 20;
    leaf.setPosition(x, y).setAlpha(0).setTint(Phaser.Utils.Array.GetRandom(colors)).setAngle(Math.random() * 360);
    const drift = Phaser.Math.Between(60, 160) * (Math.random() < 0.5 ? -1 : 1);
    const fall = Phaser.Math.Between(170, 260);
    const dur = Phaser.Math.Between(5000, 8000);
    scene.tweens.add({
      targets: leaf, alpha: { from: 0, to: 0.95 }, duration: 600, delay: first ? Math.random() * 6000 : Math.random() * 2500,
      onStart: () => {
        scene.tweens.add({ targets: leaf, x: x + drift, y: y + fall, angle: leaf.angle + Phaser.Math.Between(180, 400), duration: dur, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: leaf, alpha: 0, delay: dur - 900, duration: 900, onComplete: () => respawn(leaf, false) });
      },
    });
  };
  for (let i = 0; i < count; i++) {
    const leaf = scene.add.image(0, 0, 'leaf').setDepth(9000).setScale(1 / TEX_SCALE);
    respawn(leaf, true);
  }
}
