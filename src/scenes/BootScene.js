import Phaser from 'phaser';
import { SPRITES, SHEETS, PLAYER_ANIM, TEX_SCALE, optPath } from '../config/assets.js';
import { FISH } from '../config/collectibles.js';
import { downscale, resizeTo, recolor, drawFallback, drawMissing } from '../core/textures.js';
import { PROP_DRAWERS } from '../world/props.js';
import { ui } from '../core/ui.js';
import { loading } from '../core/loading.js';
import { home, COVER_URL } from '../core/home.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // 讀取畫面（index.html）已經顯示；這裡依實際下載量回報進度（src/core/loading.js）
    // 進度分配：下載素材 2%～86% → 建立紋理 86%～92% → 建立村莊 92%～97% → 畫好第一格才 100%
    loading.set(0.02);
    this.trackDownload(0.02, 0.86);

    this.failed = new Set();
    // 最佳化 WebP 找不到時，在 create() 以第二輪載入改用原始 PNG
    this.pngFallback = new Map();
    this.load.on('loaderror', (file) => {
      if (this.pngFallback.has(file.key)) return; // create() 會改載入 PNG
      this.failed.add(file.key);
      console.warn('[boot] 素材載入失敗：', file.src);
    });

    // 同一個檔案只載入一次；PNG 改載入 public/assets/opt/ 的 WebP（已縮到需要的尺寸）
    // 網址加 ?png=1 可強制載入原始 PNG（比對畫質用）
    const params = new URLSearchParams(window.location.search);
    const forcePng = params.has('png');
    // 開發測試：?failtest=1 讓第一次下載某個素材失敗，用來檢查「重試」
    const failTest = import.meta.env.DEV && params.has('failtest');
    this.urls = new Map(); // key → 正確網址（重試用）
    const files = new Map();
    for (const s of Object.values(SPRITES)) if (s.file) files.set(s.file, `raw:${s.file}`);
    for (const s of Object.values(SHEETS)) files.set(s.file, `raw:${s.file}`);
    for (const [file, key] of files) {
      const path = forcePng ? file : optPath(file);
      if (path !== file) this.pngFallback.set(key, file);
      this.urls.set(key, path);
      this.load.image(key, failTest && key.includes('stone_1') ? 'assets/ground/__missing__.webp' : path);
    }
    // 首頁封面也算在進度裡（下載後瀏覽器會快取，首頁的 <img> 直接使用；紋理用完即移除）
    this.load.image('cover:home', COVER_URL());
  }

  /**
   * 依實際下載的位元組計算進度（不是計時器）。
   * 還沒開始下載的檔案以已知檔案的平均大小估計；讀取失敗的檔案視為完成，交給 create() 處理。
   */
  trackDownload(from, to) {
    const bytes = new Map(); // key → { l: 已下載, t: 總量（未知為 0） }
    const report = () => {
      const known = [...bytes.values()].filter((b) => b.t > 0);
      const avg = known.length ? known.reduce((s, b) => s + b.t, 0) / known.length : 40000;
      let L = 0;
      let T = 0;
      for (const b of bytes.values()) {
        const t = b.t > 0 ? b.t : avg;
        T += t;
        L += b.done ? t : Math.min(b.l, t);
      }
      T += Math.max(0, this.load.totalToLoad - bytes.size) * avg;
      if (T > 0) loading.set(from + (to - from) * (L / T));
    };
    this.load.on('fileprogress', (file) => {
      bytes.set(file.key, { l: file.bytesLoaded || 0, t: file.bytesTotal || 0, done: false });
      report();
    });
    const done = (key) => {
      const b = bytes.get(key) || { l: 0, t: 0 };
      b.done = true;
      bytes.set(key, b);
      report();
    };
    this.load.on('filecomplete', (key) => done(key));
    this.load.on('loaderror', (file) => done(file.key));
  }

  rawSource(file) {
    const k = `raw:${file}`;
    if (this.failed.has(k) || !this.textures.exists(k)) return null;
    return this.textures.get(k).getSourceImage();
  }

  create() {
    // 有 WebP 沒載入成功（缺檔回 404，或開發伺服器回傳網頁而無法解碼）：補載原始 PNG，完成後再檢查
    const list = [...this.pngFallback].filter(([key]) => !this.textures.exists(key));
    this.pngFallback.clear();
    if (list.length) {
      for (const [key, png] of list) {
        console.warn('[boot] 找不到最佳化素材，改用原圖：', png);
        this.urls.set(key, png);
        this.load.image(key, png);
      }
      this.load.once('complete', () => this.checkMissing());
      this.load.start();
      return;
    }
    this.checkMissing();
  }

  /** 還有素材沒下載成功：顯示簡短錯誤與「重試」（不自動進入遊戲） */
  checkMissing(attempt = 0) {
    const missing = [...this.urls.keys()].filter((key) => !this.textures.exists(key));
    if (!missing.length) {
      this.buildTextures();
      return;
    }
    console.warn('[boot] 下載失敗的素材：', missing);
    loading.error(`有 ${missing.length} 個素材下載失敗，請檢查網路後重試。`, {
      onRetry: () => {
        for (const key of missing) {
          this.failed.delete(key);
          this.load.image(key, `${this.urls.get(key)}?retry=${attempt + 1}`);
        }
        this.load.once('complete', () => this.checkMissing(attempt + 1));
        this.load.start();
      },
      // 仍要進入：缺少的素材以替代圖顯示
      onSkip: () => this.buildTextures(),
    });
  }

  buildTextures() {
    loading.set(0.88);
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

    // 封面已在瀏覽器快取中，首頁 <img> 直接使用；不需要留著 GPU 紋理
    if (this.textures.exists('cover:home')) this.textures.remove('cover:home');

    const preview = new URLSearchParams(window.location.search).get('preview');
    if (preview === 'walk') {
      loading.complete();
      this.scene.start('WalkPreview');
      return;
    }
    // 建立村莊（地面烘焙、物件、碰撞）。建好後立刻暫停：讀取與首頁期間不能操作地圖
    loading.set(0.92);
    const town = this.scene.get('Town');
    town.events.once(Phaser.Scenes.Events.CREATE, () => {
      town.scene.pause();
      home.attachTown(town);
      loading.set(0.97);
      // 暫停中的場景仍會繪製；等村莊畫好第一格，讀取才算完成
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        loading.complete().then(() => home.show());
      });
    });
    this.scene.start('Town');
  }
}

/** 主角某方向的原始站姿格 */
export function idleFrame(dir) {
  return PLAYER_ANIM.rows[dir] * SHEETS.player.cols + PLAYER_ANIM.standColumn;
}

export const CAT_FRAMES = { front: 0, back: 1, left: 2, right: 3, sleep: 8, loaf: 9, lookUp: 10, stretch: 11 };
