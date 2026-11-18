// 圖片素材設定
// - file：相對於 public/ 的路徑（不使用外部網址）
// - prop：沒有 file 時，使用 src/world/props.js 的程式繪製版本（素材缺口）
// - fallback：src/core/textures.js 的程式繪製替代圖
// - height：顯示高度（像素）。載入時以 2 倍高度預先高品質縮放，顯示時縮小一半。
// - raw：true 表示不做縮放處理，直接當作原尺寸圖片使用（例如全畫面背景）
// 替換素材：把新 PNG 放進 public/assets/sprites/，修改 file 即可；比例不同時請同步調整 map.js 的碰撞框。
// 載入最佳化：遊戲實際下載的是 public/assets/opt/<名稱>.webp（已縮到需要的尺寸），PNG 是母檔。
// 替換或新增 PNG 後，執行 npm run dev，在瀏覽器 console 輸入 await T.optimize() 重新產生 WebP；
// 若找不到對應的 WebP，遊戲會自動改載入 PNG。
const S = (name) => `assets/sprites/${name}.png`;

/** 母檔 PNG 路徑 → 最佳化 WebP 的檔名 */
export const optName = (file) => `${file.split('/').pop().replace(/\.png$/i, '')}.webp`;
/** 母檔 PNG 路徑 → 遊戲載入用的路徑 */
export const optPath = (file) => (/\.png$/i.test(file) ? `assets/opt/${optName(file)}` : file);

export const SPRITES = {
  // ---- 建築物.png ----
  bld_store: { file: S('bld_store'), height: 300 }, // 鄉村雜貨店
  bld_engawa: { file: S('bld_engawa'), height: 290 }, // 緣側民宅
  bld_tea: { file: S('bld_tea'), height: 290 }, // 茶屋
  bld_farm: { file: S('bld_farm'), height: 260 }, // 農舍（附柴房）
  museum: { file: S('museum'), height: 280 }, // 承翰故事館（素材.png）

  // ---- 場景素材圖.png ----
  tile_old_street: { file: S('tile_old_street'), height: 256 },
  angler_front: { file: S('angler_front'), height: 91 },
  angler_back: { file: S('angler_back'), height: 91 },
  player_bench: { file: S('player_bench'), height: 92 },
  tile_grass: { file: S('tile_grass'), height: 160 },
  tile_dirt: { file: S('tile_dirt'), height: 160 },
  tile_cobble: { file: S('tile_cobble'), height: 160 },
  wall_straight: { file: S('wall_straight'), height: 130 },
  wall_corner_l: { file: S('wall_corner_l'), height: 163 },
  wall_corner_r: { file: S('wall_corner_r'), height: 163 },
  stairs_stone: { file: S('stairs_stone'), height: 150 },
  fish_platform: { file: S('fish_platform'), height: 120 },
  curb: { file: S('curb'), height: 40 },
  reeds: { file: S('reeds'), height: 72 },
  rocks: { file: S('rocks'), height: 56 },

  // ---- 橋.png（南北向木橋） ----
  bridge_ns: { file: S('bridge_ns'), height: 470 },

  // ---- 物件圖.png ----
  willow: { file: S('willow'), height: 300 },
  tree_round: { file: S('tree_round'), height: 250 },
  tree_plaza: { file: S('tree_round'), height: 360 },
  // 素材.png 的舊樹色調偏灰、與新素材不一致，改用新樹圖的較小尺寸做變化
  tree_old: { file: S('tree_round'), height: 210 },
  bench_wood: { file: S('bench_wood'), height: 62 },
  lamp: { file: S('lamp'), height: 120 },
  flower_pots: { file: S('flower_pots'), height: 66 },
  bicycle: { file: S('bicycle'), height: 70 },
  vending: { file: S('vending'), height: 128 },
  notice_board: { file: S('notice_board'), height: 108 },
  pier: { file: S('pier'), height: 150 },
  rod: { file: S('rod'), height: 70 },

  // ---- 夾娃娃.png（昭和風拆件，tools/extract-claw-retro.ps1） ----
  // 操作畫面的機台與前框以「原圖像素 × CLAW_VIEW.k」顯示，這裡的 height 是預先縮放的解析度
  retro_cabinet: { file: S('retro_cabinet'), height: 700 },
  retro_frame: { file: S('retro_frame'), height: 312 },
  retro_claw_open: { file: S('retro_claw_open'), height: 80 },
  retro_claw_closed: { file: S('retro_claw_closed'), height: 80 },
  retro_chute: { file: S('retro_chute'), height: 70 },
  claw_cabinet_town: { file: S('claw_storefront_wood'), height: 132 }, // 小鎮雜貨店旁
  plush_r_bear: { file: S('plush_r_bear'), height: 80 },
  plush_r_calico: { file: S('plush_r_calico'), height: 80 },
  plush_r_graycat: { file: S('plush_r_graycat'), height: 80 },
  plush_r_bunny: { file: S('plush_r_bunny'), height: 80 },
  plush_r_honeybear: { file: S('plush_r_honeybear'), height: 80 },
  // 初代（粉色機台）玩偶：只用在收藏與圖鑑，保留舊存檔的收藏外觀
  plush_frog: { file: S('plush_frog'), height: 80 },
  plush_sheep: { file: S('plush_sheep'), height: 80 },
  plush_penguin: { file: S('plush_penguin'), height: 80 },

  // ---- 蔬菜.png ----
  plot_empty: { file: S('plot_empty'), height: 104 },
  plot_ridged: { file: S('plot_ridged'), height: 100 },
  garden_path: { file: S('garden_path'), height: 50 },
  crop_cabbage: { file: S('crop_cabbage'), height: 46 },
  crop_daikon: { file: S('crop_daikon'), height: 54 },
  crop_bokchoy: { file: S('crop_bokchoy'), height: 48 },
  crop_carrot: { file: S('crop_carrot'), height: 46 },
  crop_tomato: { file: S('crop_tomato'), height: 60 },
  crop_sprout: { file: S('crop_sprout'), height: 20 },
  fence_bamboo: { file: S('fence_bamboo'), height: 50 },
  fence_post: { file: S('fence_post'), height: 62 },
  garden_gate: { file: S('garden_gate'), height: 62 },
  garden_stakes: { file: S('garden_stakes'), height: 62 },
  watering_can: { file: S('watering_can'), height: 40 },
  hoe: { file: S('hoe'), height: 50 },
  bucket_wood: { file: S('bucket_wood'), height: 44 },
  basket: { file: S('basket'), height: 34 },
  veg_crate: { file: S('veg_crate'), height: 46 },
  firewood: { file: S('firewood'), height: 40 },

  // ---- 素材.png（第一版） ----
  fish: { file: S('fish'), height: 64 },
  bobber: { file: S('bobber'), height: 26 },

  // ---- 釣魚.png ----
  sit_fishing: { file: S('player_sit_fishing'), height: 236 },

  // ---- 釣魚近景背景（不縮放） ----
  fishing_bg: { file: 'assets/bg/fishing_bg.jpg', raw: true },

  // ---- 程式繪製（素材缺口） ----
  bus_stop: { file: S('bus_shelter_tile'), prop: 'bus_stop', height: 150 },
  village_map: { file: S('village_map_notice'), prop: 'village_map', height: 110 },
  tea_table: { prop: 'tea_table', height: 40 },
  fence: { prop: 'fence', height: 42 },
  bush: { prop: 'bush', height: 56 },
  bush_pink: { prop: 'bush_pink', height: 56 },
  bush_blue: { prop: 'bush_blue', height: 56 },
  laundry: { prop: 'laundry', height: 110 },
  crate: { prop: 'crate', height: 32 },
  rope_coil: { prop: 'rope_coil', height: 20 },
  leaf: { prop: 'leaf', height: 7 },
  glow: { prop: 'glow', height: 64 },
  sparkle: { prop: 'sparkle', height: 8 },
  fish_shadow: { prop: 'fish_shadow', height: 12 },
  heart: { prop: 'heart', height: 14 },
};

// 精靈表：整張縮放 scale 倍後切格（2 倍顯示解析度）
export const SHEETS = {
  // 走路.png 16 格 + 素材.png 原始站姿（第 5 欄）；列：下、左、右、上
  player: { file: S('player_sheet'), frameWidth: 168, frameHeight: 292, cols: 5, rows: 4, scale: 0.625, footY: 288 },
  // 貓咪.png 12 格：0 正面 1 背面 2 左前 3 右前｜4-7 向右走｜8 睡覺 9 趴坐 10 抬頭坐 11 伸懶腰
  cat: { file: S('cat_sheet'), frameWidth: 344, frameHeight: 326, cols: 4, rows: 3, scale: 0.3, footY: 322 },
};

export const PLAYER_ANIM = {
  frameRate: 7,
  rows: { down: 0, left: 1, right: 2, up: 3 },
  walkColumns: [0, 1, 2, 3],
  standColumn: 4, // 原始四方向站姿
};

export const TEX_SCALE = 2;
