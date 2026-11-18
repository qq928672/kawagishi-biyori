import Phaser from 'phaser';
import './style.css';
import { GAME_WIDTH, GAME_HEIGHT } from './config/gameConfig.js';
import { ui } from './core/ui.js';
import { audio } from './core/audio.js';
import { bus } from './core/store.js';
import { touch } from './core/touch.js';
import { BootScene } from './scenes/BootScene.js';
import { TownScene } from './scenes/TownScene.js';
import { MuseumScene } from './scenes/MuseumScene.js';
import { FishingScene } from './scenes/FishingScene.js';
import { ClawScene } from './scenes/ClawScene.js';
import { WalkPreviewScene } from './scenes/WalkPreviewScene.js';

audio.init(); // 需在 ui.init 之前：第一次按鍵／點擊時啟用聲音
ui.init();
bus.on('settings-changed', () => audio.refreshVolume());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#2b2420',
  scale: {
    mode: Phaser.Scale.FIT, // 隨視窗等比縮放
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true },
  // 場景順序 = 繪製順序：Claw 疊在 Town 之上
  scene: [BootScene, TownScene, MuseumScene, FishingScene, ClawScene, WalkPreviewScene],
});

touch.init(game); // 手機觸控操作（桌面維持鍵盤操作）

if (import.meta.env.DEV) {
  window.__game = game;
  window.__audio = audio;
  window.__ui = ui;
  import('./core/save.js').then((m) => { window.__save = m.save; });
  import('./dev/testHarness.js');
}
