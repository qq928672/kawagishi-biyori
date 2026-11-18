import Phaser from 'phaser';
import { FONT } from '../config/gameConfig.js';
import { SHEETS, PLAYER_ANIM, TEX_SCALE } from '../config/assets.js';
import { idleFrame } from './BootScene.js';

// 走路動畫預覽：網址加上 ?preview=walk 開啟
// ↑↓ 調整每秒格數；空白鍵切換「走路／站立」；格線顯示腳底基準
export class WalkPreviewScene extends Phaser.Scene {
  constructor() {
    super('WalkPreview');
  }

  create() {
    this.cameras.main.setBackgroundColor('#cdbb98');
    this.fps = PLAYER_ANIM.frameRate;
    this.walking = true;
    const dirs = ['down', 'left', 'right', 'up'];
    const origin = SHEETS.player.footY / SHEETS.player.frameHeight;
    const scale = 2 / TEX_SCALE; // 放大 2 倍檢查細節
    const g = this.add.graphics();
    this.sprites = dirs.map((dir, i) => {
      const x = 200 + i * 260;
      const y = 470;
      g.lineStyle(2, 0x4a3426, 0.6).lineBetween(x - 90, y, x + 90, y);
      g.lineStyle(1, 0x4a3426, 0.3).lineBetween(x, y - 220, x, y + 10);
      this.add.text(x, y + 30, dir, { fontFamily: FONT, fontSize: '20px', color: '#4a3426' }).setOrigin(0.5, 0);
      const s = this.add.sprite(x, y, 'player', idleFrame(dir)).setOrigin(0.5, origin).setScale(scale);
      s.dir = dir;
      // 每格縮圖
      for (let f = 0; f < 4; f++) {
        const fr = PLAYER_ANIM.rows[dir] * SHEETS.player.cols + f;
        this.add.image(x - 78 + f * 52, 640, 'player', fr).setOrigin(0.5, 1).setScale(0.45);
      }
      return s;
    });
    this.info = this.add.text(640, 40, '', { fontFamily: FONT, fontSize: '20px', color: '#4a3426', align: 'center' }).setOrigin(0.5, 0);
    this.input.keyboard.on('keydown-UP', () => this.setFps(this.fps + 1));
    this.input.keyboard.on('keydown-DOWN', () => this.setFps(this.fps - 1));
    this.input.keyboard.on('keydown-SPACE', () => { this.walking = !this.walking; this.apply(); });
    this.apply();
  }

  setFps(v) {
    this.fps = Phaser.Math.Clamp(v, 2, 14);
    for (const dir of ['down', 'left', 'right', 'up']) this.anims.get(`walk-${dir}`).frameRate = this.fps;
    this.apply();
  }

  apply() {
    for (const s of this.sprites) {
      if (this.walking) {
        s.anims.stop();
        s.anims.play(`walk-${s.dir}`);
      } else {
        s.anims.stop().setFrame(idleFrame(s.dir));
      }
    }
    this.info.setText(`走路動畫預覽　${this.walking ? '走路' : '站立'}　${this.fps} 格/秒\n↑↓ 調整速度　空白鍵 切換走路／站立`);
  }
}
