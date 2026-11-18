// 經濟設定：起始資源、雜貨店價格、出售價格、夾娃娃費用
// 防套利原則：雜貨店不回收種子、魚餌、代幣；只收購魚與蔬菜。
// 蔬菜賣價 > 種子價，利潤來自等待成長時間，不會形成瞬間無限套利。

export const START = {
  coins: 100,
  tokens: 3, // 首次免費 3 枚夾娃娃代幣
  items: { seed_cabbage: 2, seed_daikon: 1, seed_bokchoy: 2, bait_premium: 1 },
};

export const CLAW_COST_TOKENS = 1;

// 雜貨店販售
export const SHOP_BUY = [
  { id: 'token', name: '夾娃娃代幣', price: 20, kind: 'token' },
  { id: 'seed_cabbage', name: '高麗菜種子', price: 20, kind: 'item' },
  { id: 'seed_daikon', name: '白蘿蔔種子', price: 25, kind: 'item' },
  { id: 'seed_bokchoy', name: '青江菜種子', price: 15, kind: 'item' },
  { id: 'bait_premium', name: '進階魚餌', price: 15, kind: 'item' },
];

// 雜貨店收購（魚的價格在 collectibles.js，依尺寸加成）
export const SELL_VEG = {
  veg_cabbage: 42,
  veg_daikon: 50,
  veg_bokchoy: 30,
};

// 魚的收購價：每種魚固定（collectibles.js 的 price）

export const TEA = { price: 10 };
