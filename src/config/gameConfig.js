// 全域遊戲參數：數值調整集中在這裡
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';

export const PLAYER = {
  scale: 1.18, // 主角放大倍率（相對原本約 91px 高 → 約 108px；以門、長椅、機台比例校正）
  speed: 215, // 每秒像素；斜向會正規化，速度與水平一致（配合放大後的步幅略加快）
  hitbox: { w: 30, h: 12 }, // 腳底碰撞框（以腳底為中心）
};

export const CAMERA = {
  zoom: 1.15, // 一般遊玩鏡頭（全村俯瞰改由 M 鍵的地圖查看）
  lerp: 0.1,
};

export const FISHING = {
  waitMin: 1500, // 拋竿後最短等待（毫秒）
  waitMax: 4500, // 最長等待
};

export const CLAW = {
  moveSpeed: 230, // 左右移動速度（畫面像素/秒）
};

export const SAVE_KEY = 'kawagishi-biyori/save/v1';
export const TUTORIAL_KEY = 'kawagishi-biyori/tutorial/v1';
