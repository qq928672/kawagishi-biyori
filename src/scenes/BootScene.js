import Phaser from 'phaser';
import { SPRITES, SHEETS, PLAYER_ANIM, TEX_SCALE } from '../config/assets.js';
import { FISH } from '../config/collectibles.js';
import { FONT } from '../config/gameConfig.js';
import { downscale, resizeTo, recolor, drawFallback, drawMissing } from '../core/textures.js';
import { PROP_DRAWERS } from '../world/props.js';
import { ui } from '../core/ui.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2 - 30, '河岸日和', {
      fontFamily: FONT, fontSize: '36px', color: '#fbf4e6', resolution: 2,
    }).setOrigin(0.5);
    const barBg = this.add.rectangle(width / 2, height / 2 + 24, 320, 12, 0x5a463a).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 160, height / 2 + 24, 0, 12, 0xf6d58c).setOrigin(0, 0.5);
    this.load.on('progress', (p) => { bar.width = 320 * p; });
    this.load.once('complete', () => { label.destroy(); barBg.destroy(); bar.destroy(); });

    this.failed = new Set();
    this.load.on('loaderror', (file) => {
      this.failed.add(file.key);
      console.warn('[boot] 素材載入失敗：', file.src);
    });

    // 同一個檔案只載入一次
    const files = new Map();
    for (const s of Object.values(SPRITES)) if (s.file) files.set(s.file, `raw:${s.file}`);
    for (const s of Object.values(SHEETS)) files.set(s.file, `raw:${s.file}`);
    for (const [file, key] of files) this.load.image(key, file);
  }

  rawSource(file) {
    const k = `raw:${file}`;
    if (this.failed.has(k) || !this.textures.exists(k)) return null;
    return this.textures.get(k).getSourceImage();
  }

  create() {
    const missing = [];
    for (const [key, s] of Object.entries(SPRITES)) {
      if (s.raw) {
        const src = this.rawSource(s.file);
        if (src) this.textures.addImage(key, src);
        else {
          missing.push(key);
          this.textures.addCanvas(key, drawMissing(key, 200));
        }
        continue;
      }
      const target = s.height * TEX_SCALE;
      let src = s.file ? this.rawSource(s.file) : null;
      if (!src && s.prop && PROP_DRAWERS[s.prop]) src = PROP_DRAWERS[s.prop]();
      if (!src && s.fallback) src = drawFallback(s.fallback);
      if (!src) {
        missing.push(key);
        src = drawMissing(key, target);
      }
      this.textures.addCanvas(key, downscale(src, target));
    }

    // 精靈表：整張縮放到整數格尺寸後再切格
    for (const [key, s] of Object.entries(SHEETS)) {
      const fw = Math.round(s.frameWidth * s.scale);
      const fh = Math.round(s.frameHeight * s.scale);
      const src = this.rawSource(s.file);
      let canvas;
      if (src) canvas = resizeTo(src, fw * s.cols, fh * s.rows);
      else {
        missing.push(key);
        canvas = document.createElement('canvas');
        canvas.width = fw * s.cols;
        canvas.height = fh * s.rows;
        const one = drawMissing(key, fh);
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < s.cols * s.rows; i++) ctx.drawImage(one, (i % s.cols) * fw, Math.floor(i / s.cols) * fh, fw, fh);
      }
      const tex = this.textures.addCanvas(key, canvas);
      for (let i = 0; i < s.cols * s.rows; i++) tex.add(i, 0, (i % s.cols) * fw, Math.floor(i / s.cols) * fh, fw, fh);
    }

    // 釋放原始大圖（raw 類型的背景仍在使用，保留）
    const keep = new Set(Object.values(SPRITES).filter((s) => s.raw).map((s) => `raw:${s.file}`));
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('raw:') && !keep.has(key)) this.textures.remove(key);
    }

    // 主角走路動畫（全域）
    const cols = SHEETS.player.cols;
    for (const [dir, row] of Object.entries(PLAYER_ANIM.rows)) {
      if (this.anims.exists(`walk-${dir}`)) continue;
      this.anims.create({
        key: `walk-${dir}`,
        frames: PLAYER_ANIM.walkColumns.map((c) => ({ key: 'player', frame: row * cols + c })),
        frameRate: PLAYER_ANIM.frameRate,
        repeat: -1,
      });
    }
    // 貓咪走路（向右；向左用水平翻轉）
    if (!this.anims.exists('cat-walk')) {
      this.anims.create({ key: 'cat-walk', frames: [4, 5, 6, 7].map((f) => ({ key: 'cat', frame: f })), frameRate: 7, repeat: -1 });
    }

    // 魚：同一張魚圖重新上色
    for (const fish of FISH) {
      const base = this.textures.get(fish.baseTexture).getSourceImage();
      this.textures.addCanvas(fish.texture, fish.recolor ? recolor(base, fish.recolor) : downscale(base, base.height));
    }

    // 水波紋理
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath();
    g.arc(16, 14, 12, Math.PI * 1.15, Math.PI * 1.85);
    g.strokePath();
    g.generateTexture('wave', 32, 12);
    g.destroy();
    // 柔和水紋：細長、低透明度的弧線（取代白色弧形水波）
    const sw = this.make.graphics({ x: 0, y: 0 }, false);
    sw.lineStyle(2, 0xf2fbf8, 0.55);
    sw.beginPath();
    sw.arc(28, 22, 24, Math.PI * 1.2, Math.PI * 1.8);
    sw.strokePath();
    sw.lineStyle(1.5, 0xf2fbf8, 0.3);
    sw.beginPath();
    sw.arc(40, 26, 18, Math.PI * 1.25, Math.PI * 1.75);
    sw.strokePath();
    sw.generateTexture('soft_wave', 64, 16);
    sw.destroy();

    ui.setTextureResolver((key) => (this.textures.exists(key) ? this.textures.getBase64(key) : null));
    if (missing.length) ui.toast(`有 ${missing.length} 個素材載入失敗，已用佔位圖代替：${missing.join(', ')}`, 6000);

    const preview = new URLSearchParams(window.location.search).get('preview');
    this.scene.start(preview === 'walk' ? 'WalkPreview' : 'Town');
  }
}

/** 主角某方向的原始站姿格 */
export function idleFrame(dir) {
  return PLAYER_ANIM.rows[dir] * SHEETS.player.cols + PLAYER_ANIM.standColumn;
}

export const CAT_FRAMES = { front: 0, back: 1, left: 2, right: 3, sleep: 8, loaf: 9, lookUp: 10, stretch: 11 };
