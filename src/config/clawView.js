// 古早味夾娃娃機版面（素材\夾娃娃.png 拆件，tools/extract-claw-retro.ps1）
// 位置都以「機台原圖 retro_cabinet.png 的像素座標」描述，ClawScene 依 displayHeight 換算。
// 換素材或調整比例時：先改這裡，不要沿用舊機台的碰撞數值。
export const CLAW_VIEW = {
  displayHeight: 690, // 機台在畫面上的高度
  top: 14, // 機台頂端的畫面 y
  cabinet: { w: 519, h: 988 }, // retro_cabinet.png 尺寸

  // 透明前框（retro_frame.png 498×439）放在機台窗口上：位置與顯示尺寸（原圖像素）
  frame: { x: 12, y: 150, w: 498, h: 417 },

  // 招牌燈（暖黃光）中心與大小
  signLight: { x: 262, y: 135, w: 420, h: 50 },

  // 機台內部
  railY: 207, // 軌道高度
  railX: [62, 462],
  clawRestY: 212, // 爪子待機（爪子圖頂端）
  clawDropY: 372, // 落爪最低點（爪子圖頂端）
  clawH: 104, // 爪子顯示高度
  clawX: [118, 448], // 爪子左右範圍（最左側在出獎口上方）
  floorY: 522, // 玩偶底部（機台內地板，被前框下緣稍微遮住）
  plushX: [208, 440], // 玩偶擺放範圍
  plushH: 86, // 玩偶顯示高度
  chute: { x: 118, y: 528, w: 96 }, // 出獎口（底部中心、寬度）
  prizeDoor: { x: 180, y: 905 }, // 機台下方取物口（玩偶出現的位置，底部）

  // 抓取判定（原圖像素）：holdRange 內一定抓穩；grabRange 內抓得起來但可能滑落
  holdRange: 20,
  grabRange: 44,
  maxSlipChance: 0.75, // 在 grabRange 邊緣時的滑落機率
};
