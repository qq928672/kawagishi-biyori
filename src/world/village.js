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

// ---------- 地板素材（細草、踏石、草叢） ----------
// 細草紋理（素材/草地.png → ground/grass_fine.webp，768×768、已處理接縫）
// 以「草葉約 6～8px」的世界尺寸鋪設：一塊圖塊 = 460 世界像素（不把小圖放大蓋滿整張地圖，也沒有模糊或綠色遮罩）
const GRASS_WORLD = 460;

function grassPattern(ctx, img) {
  const p = ctx.createPattern(img, 'repeat');
  p.setTransform(new DOMMatrix().scale(GRASS_WORLD / img.width));
  return p;
}

/**
 * 草地：細草紋理鋪滿；色調變化只用「大範圍、極低透明度」的暖／冷色暈（不疊不同紋理、不形成色塊或棋盤格）。
 */
function paintSoftGrass(ctx, W, H, rnd, base) {
  ctx.fillStyle = grassPattern(ctx, base);
  ctx.fillRect(0, 0, W, H);
  const tones = ['rgba(232,226,170,0.07)', 'rgba(118,146,96,0.07)', 'rgba(196,204,150,0.06)'];
  for (let i = 0; i < 36; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 260 + rnd() * 320;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, tones[i % tones.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** 踏石小徑：沿折線等距放置；左右交錯一點點（像腳步），大小一致、方向自然，石頭之間保留草地 */
function paintSteppingPath(ctx, path, stones, rnd, edgeGrass = []) {
  const pts = path.pts;
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, dx: (x2 - x1) / len, dy: (y2 - y1) / len, len, at: total });
    total += len;
  }
  const n = Math.max(2, Math.round(total / path.spacing) + 1);
  let last = -1;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    const s = segs.find((g) => d <= g.at + g.len + 0.01) || segs[segs.length - 1];
    const u = d - s.at;
    const side = (k % 2 ? 1 : -1) * (3 + rnd() * 3); // 左右交錯
    const x = s.x1 + s.dx * u - s.dy * side;
    const y = s.y1 + s.dy * u + s.dx * side;
    let idx = Math.floor(rnd() * stones.length);
    if (idx === last) idx = (idx + 1) % stones.length; // 相鄰兩塊不用同一種
    last = idx;
    const img = stones[idx];
    const w = 44 + rnd() * 8; // 石頭寬 44～52px（主角腳底碰撞寬 30px，一步一塊、不像巨石）
    const h = (w * img.height) / img.width * 0.82; // 稍微壓扁，配合俯視角度
    const rot = Math.atan2(s.dy, s.dx) * 0.15 + (rnd() - 0.5) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // 接觸陰影：貼著石頭下緣、範圍小而略深，讓石頭嵌進草地（不是浮在上面的淡影）
    ctx.fillStyle = 'rgba(48,46,24,0.24)';
    ctx.beginPath(); ctx.ellipse(0.5, 2, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(48,46,24,0.12)';
    ctx.beginPath(); ctx.ellipse(1, 3.5, w * 0.53, h * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    // 少量邊緣草：約三分之一的石頭，下緣蓋上一小撮草葉
    if (edgeGrass.length && rnd() < 0.34) {
      const g = edgeGrass[Math.floor(rnd() * edgeGrass.length)];
      const side = rnd() > 0.5 ? 1 : -1;
      drawDeco(ctx, g, x + side * w * 0.36, y + h * 0.42, 0.2, side < 0);
    }
  }
}

/** 草叢／花／苔蘚：以底部為錨點放在地面上 */
function drawDeco(ctx, img, x, y, scale, flip) {
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
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
  // 草頂：原圖的草比新的柔和草地鮮豔，染一層鼠尾草綠讓兩者接得起來
  if (cap) {
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = 'rgba(150,170,120,0.85)';
    ctx.fillRect(x1, edge - cap - 4, x2 - x1, cap + 10);
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

  const dirt = seamlessPattern(ctx, tex('tile_dirt'), 160, 28, 'rgba(206,170,120,0.18)');
  const cobble = seamlessPattern(ctx, tex('tile_cobble'), 100, 14, 'rgba(206,190,163,0.38)');
  const street = seamlessPattern(ctx, tex('tile_old_street'), 140, 0, 'rgba(206,191,164,0.18)');
  const walkway = seamlessPattern(ctx, tex('tile_dirt'), 112, 28, 'rgba(198,184,158,0.52)');

  // 草地：細草紋理（素材/草地.png，已處理接縫、轉成柔和鼠尾草綠）以合理世界尺寸鋪滿，
  // 色調變化只用極淡的大範圍色暈，不以方格交替鋪設。整片地面只烘焙一次（這張畫布）。
  paintSoftGrass(ctx, W, H, rnd, tex('ground_grass_fine'));
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

  // 踏石小徑（地板素材的六種踏石；只是地面裝飾，不影響碰撞）
  const stones = [1, 2, 3, 4, 5, 6].map((n) => tex(`ground_stone_${n}`));
  const edgeGrass = ['tuft_1', 'tuft_2', 'tuft_3', 'tuft_4'].map((k) => tex(`plant_${k}`));
  for (const path of map.stepPaths) paintSteppingPath(ctx, path, stones, rnd, edgeGrass);


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
  // 上層擋土牆：在東側石階處斷開，兩段牆的端點各伸進石階的側牆底下一點（不留縫、不突然截斷）
  const ES = map.eastStairs;
  const esL = ES.x - ES.width / 2;
  const esR = ES.x + ES.width / 2;
  drawWall(ctx, wall, T.upper.wallX[0], esL + 12, T.upper.edge, T.upper.face);
  drawWall(ctx, wall, esR - 12, T.upper.wallX[1], T.upper.edge, T.upper.face);
  drawWall(ctx, wall, T.middle.wallX[0], T.middle.wallX[1], T.middle.edge, T.middle.face);
  drawWall(ctx, wall, 0, W, T.lower.edge, T.lower.face, { stoneOnly: true });
  // 河堤石壁在水中的陰影
  ctx.fillStyle = 'rgba(30,80,84,0.32)';
  ctx.fillRect(0, R.y, W, 14);

  // ---- 石階（從牆頂延伸到下一層地面） ----
  const st = tex('stairs_stone');
  for (const s of map.stairs) {
    if (s.module) continue; // 東側石階另外繪製（含平台與側牆的完整模組）
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

  // ---- 東側石階：石階模組（上平台＋四階＋下平台＋兩側石牆）；上層小路直接接到上平台 ----
  {
    const mod = tex('stairs_east');
    const foot = ES.top + ES.height;
    // 下平台接到泥路，兩側在前幾步內平順收窄。
    ctx.fillStyle = dirt;
    ctx.beginPath();
    ctx.moveTo(ES.x - 57, foot - 4);
    ctx.lineTo(ES.x + 57, foot - 4);
    ctx.quadraticCurveTo(ES.x + 38, foot + 12, ES.x + 29, foot + 46);
    ctx.lineTo(ES.x - 43, foot + 46);
    ctx.quadraticCurveTo(ES.x - 42, foot + 12, ES.x - 57, foot - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,40,20,0.24)';
    ctx.beginPath(); ctx.ellipse(ES.x + 4, ES.top + ES.height - 3, ES.width / 2 + 6, 9, 0, 0, Math.PI * 2); ctx.fill();
    // 兩側石牆貼著擋土牆：牆腳投影延伸到石階邊
    ctx.drawImage(mod, ES.x - ES.width / 2, ES.top, ES.width, ES.height);
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
  const canDecorate = (x, y) =>
    x > 34 && x < W - 34 && y > T.upper.top + 10 && y < H - 40 && !inRect(x, y, R, 6) && !onRoad(x, y, 3) && !nearObject(x, y, 6) && !onWall(x, y) && !onStairs(x, y) &&
    !inRect(x, y, { x: map.garden.x1, y: map.garden.y1, w: map.garden.x2 - map.garden.x1, h: map.garden.y2 - map.garden.y1 }, 10);
  // 地板素材的草叢、花、苔蘚：集中在邊緣、牆角、樹根與入口，不平均撒滿整片草地
  // 草叢：植物素材的單株草叢；原本的苔蘚改為低矮的草叢條（位置、數量都和之前相同，不另外增加）
  const deco = {
    tuft: ['tuft_1', 'tuft_2', 'tuft_3', 'tuft_4'].map((k) => tex(`plant_${k}`)),
    flower: ['daisy', 'flowers'].map((k) => tex(`ground_${k}`)),
    moss: ['strip_1', 'strip_2', 'strip_3', 'strip_4'].map((k) => tex(`plant_${k}`)),
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const okDeco = (x, y) => canDecorate(x, y) || (!onRoad(x, y, -8) && !onWall(x, y) && !onStairs(x, y) && !inRect(x, y, R, 4) && !nearObject(x, y, 2) && y > T.upper.top + 10);
  const place = (img, x, y, s) => { if (okDeco(x, y)) drawDeco(ctx, img, x, y, s, rnd() > 0.5); };
  // 花壇位置（牆角、入口、路邊）：一叢花＋旁邊一兩撮草
  for (const b of map.flowerBeds) {
    place(pick(deco.flower), b.x + (rnd() - 0.5) * 16, b.y, 0.44);
    place(pick(deco.tuft), b.x - 22 - rnd() * 10, b.y + 4, 0.4);
    if (b.n >= 3) place(pick(rnd() > 0.5 ? deco.tuft : deco.moss), b.x + 24 + rnd() * 10, b.y + 3, 0.38);
  }
  // 樹根：苔蘚或草叢
  for (const o of map.objects) {
    if (!o.leaves) continue;
    place(pick(deco.moss), o.x - 26 - rnd() * 14, o.y + 8, 0.42);
    if (rnd() > 0.4) place(pick(deco.tuft), o.x + 24 + rnd() * 14, o.y + 10, 0.38);
  }
  // 石階兩側的牆腳：苔蘚與草叢（入口處）
  for (const s of map.stairs) {
    const foot = s.top + s.height + 8;
    place(pick(deco.moss), s.x - s.width / 2 - 14, foot, 0.4);
    place(pick(deco.tuft), s.x + s.width / 2 + 16, foot + 2, 0.38);
  }
  // 上層擋土牆腳：稀疏、間隔不一
  for (let x = 120; x < T.upper.wallX[1] - 80; x += 300 + rnd() * 260) {
    place(pick(rnd() > 0.5 ? deco.moss : deco.tuft), x, T.upper.edge + T.upper.face + 12, 0.38);
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
    const img = scene.add.image(o.x, o.y, o.texture).setOrigin(o.origin[0], o.origin[1]).setScale((o.scaleX ?? 1) / TEX_SCALE, 1 / TEX_SCALE);
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

  // 擋土牆沿線的木柵欄（柵欄.png 的圓木柱＋雙橫桿；位置、開口與碰撞沿用原本的設定）
  const fenceSolids = buildRoundLogFences(scene, map.fences);
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
// ---------- 圓木柵欄 ----------
const FENCE_H = 44; // 柵欄在世界中的高度（柱頂到地面），和原本的木欄相近
const FENCE_KEY_SEQ = { n: 0 };

/**
 * 每一列柵欄：先扣掉開口（橋頭、石階、釣魚入口），剩下的每一段各自鋪設。
 * 柱子只在「分隔點」放一根（相鄰兩段不會疊出雙柱）；柱距 = 段長平均分成 ceil(段長 / spacing) 份，
 * 所以柱距一致、不超過 spacing；橫桿依柱距裁切，不拉伸木紋。
 * 每一段畫成一張圖，深度 = 柵欄的 y（角色走到柵欄後方時被柵欄正確遮住）。
 * 碰撞：沿用原本的細長條（柵欄線上 14px 高），不把透明畫布當成碰撞。
 */
function buildRoundLogFences(scene, fences) {
  const post = scene.textures.get('fence_post').getSourceImage();
  const rail = scene.textures.get('fence_rail').getSourceImage();
  const k = FENCE_H / post.height; // 圖片像素 → 世界像素
  const postW = post.width * k;
  const railMax = rail.width * k; // 一段橫桿的原長
  const solids = [];
  for (const F of fences) {
    // 扣掉開口後的連續區段
    const segs = [];
    let cur = F.x1;
    for (const [a, b] of [...F.gaps].sort((p, q) => p[0] - q[0])) {
      if (a > cur) segs.push([cur, Math.min(a, F.x2)]);
      cur = Math.max(cur, b);
    }
    if (cur < F.x2) segs.push([cur, F.x2]);
    for (const [a, b] of segs) {
      const len = b - a;
      if (len < 24) continue;
      const spacing = Math.min(F.spacing, railMax + postW * 0.6);
      const n = Math.max(1, Math.ceil(len / spacing));
      const step = len / n;
      // 畫成一張（2 倍解析度）
      const S = 2;
      const c = document.createElement('canvas');
      c.width = Math.ceil((len + postW) * S);
      c.height = Math.ceil(FENCE_H * S) + 2;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const pw = postW * S;
      const ph = FENCE_H * S;
      // 橫桿（在柱子後面）：每一跨從左柱中心畫到右柱中心，裁切原圖寬度，不拉伸
      for (let i = 0; i < n; i++) {
        const x0 = (i * step + postW / 2) * S;
        const wWorld = step;
        const srcW = Math.min(rail.width, wWorld / k);
        const offset = ((i * 37) % Math.max(1, rail.width - srcW)) | 0; // 每跨取不同位置的木紋，避免完全重複
        ctx.drawImage(rail, offset, 0, srcW, rail.height, x0, 0, srcW * k * S, ph);
      }
      // 柱子
      for (let i = 0; i <= n; i++) ctx.drawImage(post, i * step * S, 0, pw, ph);
      const key = `fence_seg_${FENCE_KEY_SEQ.n++}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, c);
      scene.add.image(a - postW / 2, F.y, key).setOrigin(0, 1).setScale(1 / S).setDepth(F.y);
      solids.push({ x: a - 4, y: F.y - 10, w: len + 8, h: 14 });
    }
  }
  return solids;
}

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
