// 收藏品資料：魚、玩偶
// 魚種暫時共用 fish.png，以 recolor（色相/飽和/亮度）產生不同顏色；之後有個別魚圖時，
// 在 assets.js 新增素材並把 baseTexture 改成新 key、recolor 設為 null。

// 節奏判定難度（第一版起始值，可依實際遊玩調整）
// period：指標完整來回一次的秒數；good / perfect：判定區寬度（佔判定條比例）
export const FISH_TIERS = {
  common: { label: '常見', period: 2.4, good: 0.3, perfect: 0.1, center: 0.55 },
  uncommon: { label: '少見', period: 2.0, good: 0.24, perfect: 0.08, center: 0.58 },
  rare: { label: '稀有', period: 1.7, good: 0.2, perfect: 0.06, center: 0.6 },
};

// 輕鬆模式：放慢指標、放寬判定區
export const EASY_MODE = { periodScale: 1.4, zoneScale: 1.45 };

export const FISH = [
  {
    id: 'fish_crucian', name: '金色小鯽魚', tier: 'common', size: [12, 22], price: 12,
    texture: 'fish_crucian', baseTexture: 'fish', recolor: null,
    description: '河岸邊最常見的小魚，金黃色的鱗片在陽光下閃閃發亮。',
  },
  {
    id: 'fish_minnow', name: '溪哥', tier: 'common', size: [8, 15], price: 10,
    texture: 'fish_minnow', baseTexture: 'fish', recolor: { hue: 165, sat: 0.35, light: 0.1 },
    description: '成群在淺灘游動的小魚，身上帶著淡淡的銀藍色。',
  },
  {
    id: 'fish_ayu', name: '香魚', tier: 'uncommon', size: [18, 28], price: 28,
    texture: 'fish_ayu', baseTexture: 'fish', recolor: { hue: 140, sat: 0.45, light: 0.04 },
    description: '喜歡清澈流水的魚，身上帶著淡淡的青灰色。',
  },
  {
    id: 'fish_carp', name: '紅白鯉', tier: 'uncommon', size: [30, 55], price: 34,
    texture: 'fish_carp', baseTexture: 'fish', recolor: { hue: -38, sat: 1.15, light: 0.02 },
    description: '不知道從哪戶人家的池塘游出來的鯉魚，顏色很喜氣。',
  },
  {
    id: 'fish_sakura', name: '櫻鱒', tier: 'rare', size: [30, 50], price: 70,
    texture: 'fish_sakura', baseTexture: 'fish', recolor: { hue: -58, sat: 0.75, light: 0.06 },
    description: '櫻花季節才比較容易遇到的魚，身體透著淺淺的粉紅。',
  },
];

// 魚餌：每種魚餌對各稀有度的權重
export const BAITS = [
  { id: 'bait_basic', name: '基礎魚餌', free: true, weights: { common: 72, uncommon: 24, rare: 4 }, description: '免費、用不完的麵糰魚餌。' },
  { id: 'bait_premium', name: '進階魚餌', free: false, weights: { common: 40, uncommon: 42, rare: 18 }, description: '香氣濃的蝦餌，比較容易遇到少見與稀有的魚。' },
];

// 玩偶：id 是存檔的鍵，不可更改。
// 機台換成昭和風後，以「同 id 換新圖」對應舊收藏（貓咪→招財三花、小熊、兔兔），並新增兩隻；
// 舊機台獨有的青蛙、綿羊、企鵝標記 retired：不再出現在機台裡，但舊收藏數量照常保留、照常顯示。
export const PLUSHIES = [
  { id: 'plush_cat', name: '招財三花貓', texture: 'plush_r_calico', description: '掛著小鈴鐺的三花貓，瞇著眼睛笑。（舊收藏的貓咪玩偶也算在這裡）' },
  { id: 'plush_bear', name: '小熊玩偶', texture: 'plush_r_bear', description: '繫著藍色領結的小熊，是夾娃娃機的人氣角色。' },
  { id: 'plush_bunny', name: '兔兔玩偶', texture: 'plush_r_bunny', description: '長耳朵的兔子，抱著就覺得很安心。' },
  { id: 'plush_graycat', name: '灰貓玩偶', texture: 'plush_r_graycat', description: '毛色像雨天的灰貓，摸起來暖呼呼的。' },
  { id: 'plush_honeybear', name: '蜂蜜熊', texture: 'plush_r_honeybear', description: '蜂蜜色的小熊，比其他熊更圓一點。' },
  { id: 'plush_frog', name: '青蛙玩偶', texture: 'plush_frog', retired: true, description: '笑咪咪的青蛙。初代粉色機台的玩偶，現在已經夾不到了。' },
  { id: 'plush_sheep', name: '綿羊玩偶', texture: 'plush_sheep', retired: true, description: '毛茸茸的綿羊。初代粉色機台的玩偶，現在已經夾不到了。' },
  { id: 'plush_penguin', name: '企鵝玩偶', texture: 'plush_penguin', retired: true, description: '圓滾滾的企鵝。初代粉色機台的玩偶，現在已經夾不到了。' },
];

/** 目前機台裡會出現的玩偶 */
export const MACHINE_PLUSHIES = PLUSHIES.filter((p) => !p.retired);

export function pickWeighted(list, weightOf = (it) => it.weight) {
  const total = list.reduce((s, it) => s + weightOf(it), 0);
  let r = Math.random() * total;
  for (const it of list) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return list[list.length - 1];
}

/** 依魚餌抽一條魚：先抽稀有度，再在該稀有度中平均抽 */
export function rollFish(baitId) {
  const bait = BAITS.find((b) => b.id === baitId) || BAITS[0];
  const tiers = Object.entries(bait.weights).map(([tier, weight]) => ({ tier, weight }));
  const { tier } = pickWeighted(tiers);
  const pool = FISH.filter((f) => f.tier === tier);
  const fish = pool[Math.floor(Math.random() * pool.length)];
  const [a, b] = fish.size;
  const size = Math.round((a + Math.random() * (b - a)) * 10) / 10;
  return { fish, size };
}
