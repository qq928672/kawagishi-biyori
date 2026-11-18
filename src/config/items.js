// 物品目錄：背包、商店、委託共用的名稱、圖示與分類
import { FISH, PLUSHIES, BAITS } from './collectibles.js';
import { CROPS } from './crops.js';

export const CATEGORIES = [
  { id: 'fish', name: '魚類' },
  { id: 'veg', name: '蔬菜' },
  { id: 'supply', name: '種子與魚餌' },
  { id: 'plush', name: '玩偶' },
];

const catalog = {};
for (const f of FISH) catalog[f.id] = { id: f.id, name: f.name, texture: f.texture, category: 'fish', description: f.description };
for (const p of PLUSHIES) catalog[p.id] = { id: p.id, name: p.name, texture: p.texture, category: 'plush', description: p.description };
for (const c of CROPS) {
  catalog[c.item] = { id: c.item, name: c.name, texture: c.texture, category: 'veg', description: `菜園收成的${c.name}。` };
  catalog[c.seed] = { id: c.seed, name: `${c.name}種子`, texture: 'crop_sprout', category: 'supply', description: `種在菜園空地，澆水後約 ${c.growMinutes} 分鐘可採收。` };
}
for (const b of BAITS) {
  catalog[b.id] = { id: b.id, name: b.name, texture: 'bobber', category: 'supply', description: b.description, infinite: !!b.free };
}

export const ITEMS = catalog;
export const itemName = (id) => catalog[id]?.name || id;
