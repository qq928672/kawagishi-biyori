import Phaser from 'phaser';

// 目前的遊戲模式：explore（自由移動）| fishing | claw | museum
// 只有 explore 且沒有開啟視窗時，主角才能移動
export const store = {
  mode: 'explore',
  // 碰撞／通行區除錯顯示：預設隱藏；網址加 ?debug=1、按 F2 或在設定中切換
  debug: new URLSearchParams(window.location.search).has('debug'),
};

// 跨場景 / UI 的事件匯流排
export const bus = new Phaser.Events.EventEmitter();
