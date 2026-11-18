// 菜園作物設定（成長時間集中在這裡調整）
// growMinutes：澆水後到可採收的分鐘數（原型 2～5 分鐘）
export const CROPS = [
  { id: 'cabbage', name: '高麗菜', seed: 'seed_cabbage', item: 'veg_cabbage', growMinutes: 3, texture: 'crop_cabbage' },
  { id: 'daikon', name: '白蘿蔔', seed: 'seed_daikon', item: 'veg_daikon', growMinutes: 4, texture: 'crop_daikon' },
  { id: 'bokchoy', name: '青江菜', seed: 'seed_bokchoy', item: 'veg_bokchoy', growMinutes: 2, texture: 'crop_bokchoy' },
];

// 待開放（目前只當裝飾）：紅蘿蔔 crop_carrot、番茄 crop_tomato

export const GARDEN_PLOTS = 4;

// 新存檔（與重設進度）的菜園初始資料：一塊已成熟的展示田、一塊剛發芽的幼苗田，幫助理解流程。
// readyInMs：建立存檔當下起算多久成熟（0 = 已成熟）。既有存檔不會套用，不覆蓋玩家作物。
export const GARDEN_DEMO = [
  { plot: 0, crop: 'cabbage', state: 'growing', readyInMs: 0 },
  { plot: 1, crop: 'bokchoy', state: 'growing', readyInMs: 2 * 60 * 1000 },
];

export const cropById = (id) => CROPS.find((c) => c.id === id);
