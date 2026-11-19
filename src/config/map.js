// 村莊地圖設定（v4：三層地形，依「新的佈景參考圖」配置）
// 座標單位為世界像素；y 越大越靠近畫面下方。
//
//   ┌──────────────────────────── 樹林 ────────────────────────────┐
//   │【上層：住宅台地】 緣側民宅   ║中央石階║   農舍(柴房)   菜園(4 塊)   ╲緩坡 │
//   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 石砌擋土牆（只能走石階或右側緩坡）▓▓▓▓▓▓▓▓▓    │ │
//   │【中層：生活區】 故事館  公告欄   大樹廣場   雜貨店 自販機 茶屋  │
//   │  村口(地圖)        ══ 商店街步道 ══                          │
//   │▓▓▓▓▓▓▓ 石階A ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 石階B ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//   │【下層：河岸步道】 木橋頭   柳樹  碼頭        柳樹       石階→釣魚平台 │
//   │～～～║～～～～～～～～～～ 河 ～～～～～～～～～～～～～～～～[平台]～～ │
//   │   ║ 對岸小徑、蘆葦、對岸釣點（踩實的土地與釣具）                      │
//   └──────────────────────────────────────────────────────────────┘
//
// 規則：
// - 物件 collider 以物件錨點（x, y = 接觸地面的位置）為原點；只框牆體、樹幹、機台底座等實體部分。
// - 地形碰撞 blockers（擋土牆、河、樹林邊界）可被 walkAreas（石階、緩坡、橋面、碼頭、平台）覆蓋；
//   物件 collider 與圍籬永遠阻擋。因此跨層只能經過 walkAreas。
// - 遮擋：depth = 接觸地面的 y；地形（牆面、石階、平台）烘焙在地面層；
//   橋欄杆切成水平條帶各自排序；高大物件（樹冠、屋頂）在主角走到後方時局部淡化。

export const MAP_VERSION = 4;

const W = 2560;
const H = 1980;

// ---------------- 三層地形 ----------------
// edge：該層地面的前緣（牆頂）；face：牆面高度（畫面像素）；牆底 = edge + face = 下一層地面的開始
export const TIERS = {
  // drawEnd：直牆畫到這裡，之後接轉角石牆（側面朝東，旁邊就是緩坡）
  upper: { name: '住宅台地', top: 175, edge: 540, face: 120, wallX: [0, 2300], drawEnd: 2236 },
  middle: { name: '生活區', top: 660, edge: 1170, face: 90, wallX: [0, W] },
  lower: { name: '河岸步道', top: 1260, edge: 1360, face: 65, wallX: [0, W] }, // 下層前緣是河堤石壁（無草頂）
};
const U = TIERS.upper;
const M = TIERS.middle;
const L = TIERS.lower;

const RIVER = { x: 0, y: L.edge + L.face, w: W, h: 240 }; // 1425 ~ 1665
const FAR_TOP = RIVER.y + RIVER.h; // 對岸地面開始

// ---------------- 連接通道 ----------------
// 石階：sprite 寬高為畫面像素；walk 為可行走範圍（比石階窄，兩側石塊不可走）
const stairs = (id, x, top, height, walkHalf) => {
  const w = Math.round((453 / 279) * height); // stairs_stone 原圖比例
  return { id, x, top, height, width: w, walk: { x: x - walkHalf, y: top - 6, w: walkHalf * 2, h: height + 12 } };
};
export const STAIRS = [
  stairs('stairs-upper', 720, 512, 172, 78), // 中層 ↔ 上層（中央石階）
  stairs('stairs-a', 560, 1150, 128, 58), // 中層 ↔ 河岸（橋頭旁）
  stairs('stairs-b', 1700, 1150, 128, 58), // 中層 ↔ 河岸
  stairs('stairs-pier', 2232, 1338, 76, 30), // 河岸步道 ↔ 釣魚平台（平台較低；整座石階落在平台頂面上）
];

// 右側緩坡：上層東端到中層的泥土坡道（沒有擋土牆）
// 坡道兩側有竹欄杆（posts），坡面由上而下逐漸變暗、並有踩實的橫向階痕
export const RAMP = {
  x1: 2300, x2: 2440, top: 470, bottom: 720,
  // 坡道沿著擋土牆斜切的東端往下，最後鑽到商店街步道底下（步道以平切口收在泥土路上）
  path: [[2200, 510], [2290, 518], [2352, 556], [2366, 636], [2336, 716], [2290, 790], [2236, 880]],
};

// 南北向木橋：上端接河岸步道，下端接對岸
// bridge_ns 原圖 772×1263；橋面左右緣（原圖座標）：上端 x 232~520（y 90），下端 x 122~650（y 1150）
// 橋頭放在步道前緣（不佔用步道，人可以從橋頭前方走過）
// rail：欄杆外緣（原圖座標）上端 x 165／585、下端 x 20／752 —— 欄杆與柱子不可站
export const BRIDGE = {
  x: 300, top: 1338, height: 395,
  src: { w: 772, h: 1263, top: [90, 232, 520], bottom: [1150, 122, 650], railTop: [165, 585], railBottom: [20, 752] },
};
const bridgeScale = (B) => B.height / B.src.h;
export function bridgeWidthFactor(t) {
  return 1.10 - 0.32 * Math.max(0, Math.min(1, t));
}
/** 每一條水平帶：橋面左右緣與欄杆外緣（畫面座標） */
function bridgeRows(B, step) {
  const s = bridgeScale(B);

  const [y0, l0, r0] = B.src.top;
  const [y1, l1, r1] = B.src.bottom;
  const rows = [];
  for (let ty = 0; ty < B.src.h; ty += step / s) {
    const t = Math.max(0, Math.min(1, (ty - y0) / (y1 - y0)));
    const tr = Math.max(0, Math.min(1, ty / B.src.h));
    const sx = s * bridgeWidthFactor(tr);
    const left = B.x - B.src.w * sx / 2;
    rows.push({
      y: B.top + ty * s,
      deckL: left + (l0 + (l1 - l0) * t) * sx,
      deckR: left + (r0 + (r1 - r0) * t) * sx,
      railL: left + (B.src.railTop[0] + (B.src.railBottom[0] - B.src.railTop[0]) * tr) * sx,
      railR: left + (B.src.railTop[1] + (B.src.railBottom[1] - B.src.railTop[1]) * tr) * sx,
    });
  }
  return rows;
}
function bridgeDeckRects(B, step = 24, inset = 9) {
  return bridgeRows(B, step).map((r) => ({ id: 'bridge-deck', x: r.deckL + inset, y: r.y, w: r.deckR - r.deckL - inset * 2, h: step + 1 }));
}
function bridgeRailSolids(B, step = 24) {
  const out = [];
  for (const r of bridgeRows(B, step)) {
    out.push({ id: 'bridge-rail-l', x: r.railL - 4, y: r.y, w: r.deckL - r.railL + 4, h: step + 1 });
    out.push({ id: 'bridge-rail-r', x: r.deckR, y: r.y, w: r.railR - r.deckR + 4, h: step + 1 });
  }
  return out;
}


// 釣魚平台：比河岸步道低一階、貼近水面；由石階 stairs-pier 下去
export const PLATFORM = { x: 2300, top: 1392, width: 330, walk: { x: 2150, y: 1398, w: 300, h: 56 } };

export const FISHING_SPOTS = {
  embankment: { x: 2330, y: 1446 }, // 平台上（面向河）
  farBank: { x: 1500, y: 1712 },
};

// ---------------- 道路 ----------------
// style：plaza 廣場石板／street 商店街整齊步道／walkway 河岸步道（低對比）／dirt 泥土路
const BUS_STOP = { x: BRIDGE.x - 119, y: L.top + 27 };

// 地面只是繪製用（碰撞由下方 blockers／walkAreas 決定），調整路面不影響可通行範圍。
const ROADS = {
  plaza: [
    { type: 'ellipse', x: 990, y: 1000, rx: 270, ry: 132 }, // 大樹廣場
    { type: 'seg', pts: [[720, 700], [760, 860], [880, 930]], w: 112 }, // 中央石階下 → 廣場
    { type: 'ellipse', x: 330, y: 934, rx: 132, ry: 40 }, // 故事館前的小石板平台（往外接踏石小路）
  ],
  street: [
    { type: 'seg', pts: [[440, 955], [700, 940], [1240, 930], [2090, 930]], w: 92 }, // 故事館平台 → 商店街
    { type: 'seg', pts: [[2090, 930], [2200, 898], [2262, 846]], w: 84, cap: 'butt' }, // 商店街 → 緩坡下（平切口接泥土坡道）
    { type: 'seg', pts: [[560, 960], [560, 1150]], w: 92 }, // → 石階 A
    { type: 'seg', pts: [[1240, 1060], [1700, 1100], [1700, 1150]], w: 92 }, // 廣場 → 石階 B
  ],
  walkway: [
    { type: 'rect', x: 0, y: L.top + 2, w: W, h: L.edge - L.top - 2 }, // 河岸步道
  ],
  dirt: [
    { type: 'seg', pts: [[700, 502], [1560, 505], [2240, 512]], w: 70 }, // 上層小路（中央石階 → 農舍、菜園）；西側民宅庭院改為草地＋踏石
    { type: 'seg', pts: RAMP.path, w: 84 }, // 緩坡
    { type: 'seg', pts: [[1250, 505], [1250, 470]], w: 70 }, // 農舍門口
    { type: 'seg', pts: [[1845, 505], [1845, 250]], w: 52 }, // 菜園中間
    { type: 'seg', pts: [[BRIDGE.x, BRIDGE.top + BRIDGE.height - 8], [360, 1778], [520, 1810], [1000, 1810], [1500, 1760], [2000, 1820], [W, 1820]], w: 64 }, // 對岸小徑
    { type: 'ellipse', x: 1500, y: 1712, rx: 120, ry: 34 }, // 對岸釣點：踩實的土地
  ],
};

// 踏石小徑：沿折線每隔 spacing 放一塊（石頭寬約 40px，配合主角步幅；石頭之間留草地縫隙）
// 只是地面裝飾，不是障礙物；石頭之間的草地同樣可以走。
const STEP_PATHS = [
  // 住宅庭院：中央石階上端 → 緣側民宅（緩緩轉彎；走在屋前與柵欄之間，不被柵欄蓋住）
  { pts: [[684, 504], [622, 503], [562, 499], [502, 493], [448, 489]], spacing: 50 },
  // 故事館平台 → 村口出生點（往左下，避開地圖看板）
  { pts: [[212, 962], [176, 992], [156, 1030], [160, 1070]], spacing: 44 },
  // 商店街 → 茶屋旁的長椅（繞過長椅左側，停在椅子前方）
  { pts: [[1818, 984], [1804, 1022], [1822, 1058], [1862, 1068]], spacing: 44 },
];

// 花草：集中在牆角、樹根、入口與路邊（不平均撒滿）
const FLOWER_BEDS = [
  { x: 150, y: 905, n: 4 }, { x: 520, y: 900, n: 3 }, // 故事館兩側
  { x: 1110, y: 892, n: 3 }, { x: 1530, y: 898, n: 2 }, { x: 2070, y: 895, n: 3 }, // 商店入口
  { x: 860, y: 700, n: 3 }, { x: 590, y: 700, n: 3 }, // 中央石階兩側（牆角）
  { x: 1500, y: 700, n: 3 }, { x: 2200, y: 690, n: 2 }, { x: 120, y: 700, n: 2 }, // 擋土牆牆角
  { x: 470, y: 1300, n: 2 }, { x: 1600, y: 1296, n: 3 }, { x: 1830, y: 1296, n: 2 }, // 河岸步道牆角
  { x: 260, y: 480, n: 2 }, { x: 1600, y: 470, n: 2 }, // 上層屋前
  { x: 1680, y: 1760, n: 2 }, { x: 1290, y: 1765, n: 2 }, // 對岸
];

// ---- 物件產生小工具 ----
const tree = (x, y, kind = 'tree_round', flipX = false) => ({
  texture: kind, x, y, origin: kind === 'willow' ? [0.5, 0.93] : [0.5, 0.94], flipX,
  collider: { x: -14, y: -10, w: 28, h: 14 }, shadow: { w: kind === 'tree_plaza' ? 220 : 140, h: 34 }, leaves: true, occlude: true,
});
const bench = (x, y, extra = {}) => ({ texture: 'bench_wood', x, y, origin: [0.5, 0.96], collider: { x: -42, y: -20, w: 84, h: 20 }, shadow: { w: 96, h: 14 }, ...extra });
const lamp = (x, y) => ({ texture: 'lamp', x, y, origin: [0.5, 0.97], collider: { x: -9, y: -10, w: 18, h: 10 }, glow: { dy: -98 }, shadow: { w: 36, h: 10 } });
const prop = (texture, x, y, collider, extra = {}) => ({ texture, x, y, origin: [0.5, 0.95], collider, ...extra });
const deco = (texture, x, y, extra = {}) => ({ texture, x, y, origin: [0.5, 0.95], ...extra });
// 建築：collider 只框牆體；eave = 屋簷陰影的寬度
const building = (texture, x, y, hw, depthBack, extra = {}) => ({
  texture, x, y, origin: [0.5, 0.98], collider: { x: -hw, y: -depthBack, w: hw * 2, h: depthBack - 10 },
  shadow: { w: hw * 2 + 40, h: 30, dy: -4 }, eave: hw * 2, occlude: true, ...extra,
});

// 菜園（上層東側）：竹籬笆，門口朝南
// 往後（北）退，南側籬笆不壓到上層小路
export const GARDEN = { x1: 1640, x2: 2060, y1: 196, y2: 462, gate: [1810, 1880] };
const gardenFence = () => {
  const G = GARDEN;
  const out = [];
  for (let x = G.x1; x < G.x2 - 20; x += 100) out.push({ texture: 'fence_bamboo', x: x + 52, y: G.y1, origin: [0.5, 1], noShadow: true });
  for (let x = G.x1; x < G.x2 - 20; x += 100) {
    if (x + 100 > G.gate[0] && x < G.gate[1]) continue;
    out.push({ texture: 'fence_bamboo', x: x + 52, y: G.y2, origin: [0.5, 1] });
  }
  for (let y = G.y1 + 40; y <= G.y2; y += 42) {
    out.push({ texture: 'fence_post', x: G.x1, y, origin: [0.5, 1] });
    out.push({ texture: 'fence_post', x: G.x2, y, origin: [0.5, 1] });
  }
  out.push({ texture: 'garden_gate', x: G.gate[0] - 8, y: G.y2 + 2, origin: [0.5, 1], flipX: true });
  return out;
};

// 菜園田地（互動點與圖片位置）
export const GARDEN_PLOTS = [
  { x: 1740, y: 318 }, { x: 1950, y: 318 }, { x: 1740, y: 440 }, { x: 1950, y: 440 },
];

// 樹林邊界（群聚）
const FOREST = [
  [40, 160], [160, 130], [560, 150], [640, 110], [980, 140], [1500, 130], [1580, 170],
  [2150, 150], [2300, 120], [2420, 170], [2520, 150], [2510, 380], [2500, 600], [2520, 760],
  [40, 360], [30, 640], [2520, 1080],
  [120, 1960], [700, 1965], [1150, 1975], [2000, 1965], [2480, 1960],
].map(([x, y], i) => tree(x, y, i % 3 === 1 ? 'tree_old' : 'tree_round', i % 2 === 0));

// 擋土牆沿線的木柵欄（石階、橋頭、碼頭、平台石階處留缺口）
export const FENCES = [
  { y: U.edge + 4, x1: 0, x2: U.drawEnd, gaps: [[600, 840]], spacing: 88 },
  { y: M.edge + 2, x1: 0, x2: W, gaps: [[480, 640], [1620, 1780]], spacing: 88 },
  { y: L.edge + 4, x1: 0, x2: W, gaps: [[200, 400], [2186, 2280]], spacing: 88 },
];

// ---------------- 匯出 ----------------
const benches = [
  bench(1880, 1030, { id: 'tea-bench' }),
  bench(1180, 1310), bench(1600, 1312),
];

export const MAP = {
  version: MAP_VERSION,
  world: { width: W, height: H },
  tiers: TIERS,

  spawn: { x: 200, y: 1060, facing: 'right' },
  museumExit: { x: 330, y: 930, facing: 'down' },

  river: RIVER,
  farTop: FAR_TOP,
  bridge: BRIDGE,
  stairs: STAIRS,
  ramp: RAMP,
  platform: PLATFORM,
  roads: ROADS,
  stepPaths: STEP_PATHS,
  flowerBeds: FLOWER_BEDS,
  garden: GARDEN,
  fences: FENCES,

  // 地形碰撞（可被 walkAreas 覆蓋）
  blockers: [
    { id: 'wall-upper', x: U.wallX[0], y: U.edge - 12, w: U.drawEnd - U.wallX[0], h: U.face + 22 },
    // 斜切收尾段：牆面越往東越矮，碰撞也跟著變短
    { id: 'wall-upper-taper-1', x: U.drawEnd, y: U.edge - 12, w: 32, h: U.face + 2 },
    { id: 'wall-upper-taper-2', x: U.drawEnd + 32, y: U.edge - 12, w: U.wallX[1] - U.drawEnd - 32, h: U.face - 50 },
    { id: 'wall-middle', x: 0, y: M.edge - 8, w: W, h: M.face + 12 },
    { id: 'embankment', x: 0, y: L.edge - 4, w: W, h: L.face + 4 },
    { id: 'river', ...RIVER },
    { id: 'forest-top', x: 0, y: 0, w: W, h: U.top },
    { id: 'edge-left', x: 0, y: 0, w: 30, h: H },
    { id: 'edge-right', x: W - 30, y: 0, w: 30, h: H },
    { id: 'far-bank-bottom', x: 0, y: H - 50, w: W, h: 50 },
    { id: 'ramp-bank-east', x: RAMP.x2, y: U.top, w: W - RAMP.x2, h: RAMP.bottom - U.top + 40 }, // 緩坡東側樹林
  ],

  walkAreas: [
    ...STAIRS.map((s) => ({ id: s.id, ...s.walk })),
    { id: 'ramp', x: RAMP.x1, y: RAMP.top, w: RAMP.x2 - RAMP.x1, h: RAMP.bottom - RAMP.top },
    ...bridgeDeckRects(BRIDGE),
    { id: 'platform', ...PLATFORM.walk },
  ],

  // 永遠阻擋的實體：橋的欄杆與柱子（依橋的輪廓自動產生）
  solids: bridgeRailSolids(BRIDGE),

  objects: [
    // ================= 上層：住宅台地 =================
    building('bld_engawa', 380, 470, 230, 120),
    deco('flower_pots', 600, 488),
    deco('laundry', 130, 470),
    building('bld_farm', 1250, 470, 240, 110),
    deco('firewood', 1540, 470),
    ...gardenFence(),
    tree(870, 380, 'tree_old'), tree(2150, 380, 'tree_round', true),

    // ================= 中層：生活區 =================
    // 村口
    prop('bus_stop', BUS_STOP.x, BUS_STOP.y, { x: -135, y: -35, w: 251, h: 34 }, { shadow: { w: 280, h: 20 } }),
    prop('village_map', 260, 1120, { x: -50, y: -12, w: 100, h: 12 }, { shadow: { w: 110, h: 12 } }),
    // 承翰故事館
    building('museum', 330, 880, 190, 150, { origin: [0.5, 1] }),
    prop('flower_pots', 200, 912, { x: -26, y: -14, w: 52, h: 14 }),
    prop('notice_board', 590, 905, { x: -46, y: -14, w: 92, h: 14 }, { shadow: { w: 100, h: 14 } }),
    // 商店街
    building('bld_store', 1330, 870, 165, 125),
    prop('claw_cabinet_town', 1586, 865, { x: -40, y: -17, w: 82, h: 19 }, { id: 'claw', origin: [0.5, 0.98], shadow: { w: 89, h: 13 } }),
    // 自動販賣機：放在村口地圖旁
    prop('vending', 410, 1104, { x: -38, y: -26, w: 76, h: 26 }, { shadow: { w: 88, h: 14 } }),
    building('bld_tea', 1880, 870, 165, 125),
    ...benches,
    prop('bicycle', 2190, 915, { x: -38, y: -12, w: 76, h: 12 }, { shadow: { w: 88, h: 12 } }),
    // 大樹廣場
    { ...tree(990, 960, 'tree_plaza'), collider: { x: -90, y: -26, w: 180, h: 50 }, planter: { rx: 100, ry: 44 } },
    lamp(640, 980), lamp(1150, 880), lamp(1760, 905), lamp(2140, 1000),
    tree(130, 800, 'tree_old'), tree(2300, 1080, 'tree_round', true), tree(1420, 1120, 'tree_old', true),

    // ================= 下層：河岸步道 =================
    lamp(470, 1356), lamp(1000, 1356), lamp(1480, 1356), lamp(1900, 1356), lamp(2440, 1356),
    tree(820, 1320, 'willow'), tree(1330, 1322, 'willow', true), tree(2010, 1318, 'willow'),
    // 釣魚平台上的水桶
    prop('bucket_wood', 2430, 1440, { x: -14, y: -6, w: 28, h: 6 }),

    // ================= 對岸 =================
    ...[160, 640, 980, 1250, 1760, 2080, 2400].map((x, i) => deco('reeds', x, FAR_TOP + 18 + (i % 2) * 8, { flipX: i % 2 === 1 })),
    prop('rocks', 760, 1730, { x: -50, y: -14, w: 100, h: 14 }),
    prop('rocks', 2200, 1730, { x: -50, y: -14, w: 100, h: 14 }, { flipX: true }),
    // 對岸釣點：可停留的位置（釣具、魚簍、小木箱）
    prop('bucket_wood', 1600, 1716, { x: -14, y: -6, w: 28, h: 6 }),
    deco('basket', 1395, 1720),
    deco('rod', 1585, 1700, { origin: [0.5, 1] }),

    // 樹林
    ...FOREST,
  ].map((o, i) => ({ id: o.id || `${o.texture}-${i}`, ...o })),

  waterRocks: [
    { texture: 'rocks', x: 1300, y: 1560, scale: 0.8 },
    { texture: 'rocks', x: 1850, y: 1610, scale: 0.6 },
  ],

  interactables: [
    { id: 'bus', action: 'bus', label: '查看公車路線', x: BUS_STOP.x + 132, y: BUS_STOP.y + 24, radius: 54 },
    { id: 'museum', label: '進入承翰故事館', action: 'museum', x: 330, y: 905, radius: 62 },
    { id: 'notice', label: '看公告欄', action: 'notice', x: 590, y: 930, radius: 54 },
    { id: 'map', label: '看村莊地圖', action: 'map', x: 260, y: 1142, radius: 52 },
    { id: 'store', label: '逛雜貨店', action: 'shop', x: 1330, y: 896, radius: 62 },
    { id: 'claw', label: '玩夾娃娃機', action: 'claw', x: 1586, y: 889, radius: 46 },
    { id: 'home-veranda', label: '坐在緣側', action: 'sit', x: 404, y: 490, radius: 43, seat: { x: 404, y: 478 }, photoSeat: true },
    { id: 'tea-veranda', label: '坐在紅墊上', action: 'sit', x: 1803, y: 895, radius: 41, seat: { x: 1803, y: 878 }, photoSeat: true },
    { id: 'tea', label: '茶屋聊天', action: 'tea', x: 1880, y: 896, radius: 58 },
    ...benches.map(({ id, x, y }) => ({
      id: id || `bench-${x}-${y}`, label: '坐下休息', action: 'sit',
      x, y: y + 20, radius: 42, seat: { x, y: y + 7 },
    })),
    ...GARDEN_PLOTS.map((p, i) => ({ id: `plot-${i}`, label: '菜園', action: 'plot', plot: i, x: p.x, y: p.y - 20, radius: 60 })),
    ...[560, 1100, 1700].map(x => ({ id: 'shore-' + x, action: 'fishing', label: '準備拋竿', x, y: L.edge - 22, radius: 60, bankZone: true })),
    { id: 'fish-embankment', label: '準備拋竿', action: 'fishing', x: FISHING_SPOTS.embankment.x, y: FISHING_SPOTS.embankment.y - 4, radius: 56 },
    { id: 'fish-farbank', label: '準備拋竿', action: 'fishing', x: FISHING_SPOTS.farBank.x, y: FISHING_SPOTS.farBank.y, radius: 56 },
  ],

  labels: [
    // 招牌文字（疊在建築圖的空白招牌上，文字不嵌進圖片）；dx/dy 相對建築錨點
    { text: '承翰故事館', on: 'museum-', dx: 0, dy: -172, style: 'sign' },
    { text: '雜貨店', on: 'bld_store-', dx: 16, dy: -163, style: 'sign', size: 19 },
    { text: '茶屋', on: 'bld_tea-', dx: 18, dy: -167, style: 'sign', size: 19 },
    // 地點標籤：只在靠近時淡入
    // 地點標籤放在釣點腳邊（不擋住角色與互動提示）
    { text: '河堤釣點', x: 2240, y: 1478, style: 'near', radius: 230 },
    { text: '對岸釣點', x: 1500, y: 1752, style: 'near', radius: 230 },
    { text: '往住宅台地', x: 720, y: 700, style: 'near', radius: 150 },
  ],

  // 首次走進某區域時顯示的玩法教學
  tutorialZones: [
    { id: 'garden', x: GARDEN.x1 - 30, y: GARDEN.y2 - 10, w: GARDEN.x2 - GARDEN.x1 + 60, h: 70 },
  ],

  // 全村地圖上的地名
  places: [
    ['河岸橋頭站', BUS_STOP.x, BUS_STOP.y],
    ['承翰故事館', 330, 760], ['雜貨店', 1330, 720], ['茶屋', 1880, 720], ['菜園', 1850, 360],
    ['農舍', 1250, 330], ['民宅', 380, 330], ['大樹廣場', 990, 1000], ['河岸步道', 1500, 1310],
    ['釣魚平台', 2300, 1450], ['對岸釣點', 1500, 1760], ['木橋', 300, 1520], ['緩坡', 2370, 620],
  ],

  // 三花貓活動範圍：在草地或步道邊左右散步，不擋入口與石階
  catHomes: [
    { id: 'plaza', x1: 1240, x2: 1370, y: 1150, rest: { x: 1280, y: 1150 } },
    { id: 'river', x1: 1700, x2: 1860, y: 1300, rest: { x: 1760, y: 1300 } },
    { id: 'porch', x1: 470, x2: 560, y: 495, rest: { x: 500, y: 495 } },
  ],
};
