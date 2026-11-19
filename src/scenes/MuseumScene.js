import Phaser from 'phaser';
import { FONT, PLAYER } from '../config/gameConfig.js';
import { EXHIBITS, ZONES, MUSEUM_TITLE } from '../data/museumExhibits.js';
import { store } from '../core/store.js';
import { ui } from '../core/ui.js';
import { SHEETS, TEX_SCALE } from '../config/assets.js';
import { audio } from '../core/audio.js';
import { touch } from '../core/touch.js';
import { rng } from '../world/village.js';
import { idleFrame } from './BootScene.js';

// 我的故事館室內：三個主題展區，每件展品是館內的一件擺設（書桌、筆記、照片、地圖、陶器、電腦…）
// 操作：← → 選擇、E／Enter 查看詳細（HTML 視窗），也可以滑鼠點擊；Esc 回到室外。
// 展品文字與圖片對應在 src/data/museumExhibits.js。

const WALL_BOTTOM = 440;
const ZONE_X = { learning: [40, 420], education: [440, 840], digital: [860, 1240] };
// 每件擺設在館內的位置與點擊範圍（中心 x、底部 y、寬、高）
const LAYOUT = {
  hobbies: { x: 130, y: 268, w: 170, h: 150 },
  profile: { x: 232, y: 350, w: 120, h: 70 },
  growth: { x: 352, y: 262, w: 110, h: 140 },
  chiayi: { x: 545, y: 272, w: 170, h: 150 },
  yingge: { x: 640, y: 412, w: 170, h: 110 },
  camp: { x: 740, y: 272, w: 160, h: 150 },
  platform: { x: 965, y: 412, w: 170, h: 150 },
  entry: { x: 1060, y: 220, w: 150, h: 70 },
  add: { x: 1162, y: 412, w: 110, h: 150 },
};
const PALETTE = { wood: 0x8a5a3c, woodDark: 0x6e4b3a, woodLight: 0xb5845a, plaster: 0xf1e3c8, cream: 0xfbf4e6, ink: 0x4a3426 };

export class MuseumScene extends Phaser.Scene {
  constructor() {
    super('Museum');
  }

  preload() {
    // 展品縮圖（館內擺設上的照片、螢幕畫面）
    for (const ex of EXHIBITS) {
      for (const f of [ex.thumb, ex.thumb2]) if (f && !this.textures.exists(`mus:${f}`)) this.load.image(`mus:${f}`, f);
    }
  }

  create() {
    store.mode = 'museum';
    ui.setStatus(null);
    audio.setAmbience('indoor');
    this.leaving = false;
    this.rnd = rng(77);
    // 依館內左到右排序
    this.items = EXHIBITS.filter((e) => LAYOUT[e.id]).sort((a, b) => LAYOUT[a.id].x - LAYOUT[b.id].x);
    this.selected = 0;

    this.drawRoom();
    this.drawZones();
    for (const ex of this.items) this.drawExhibit(ex);
    this.drawLights();

    this.highlight = this.add.graphics().setDepth(30);
    this.arrow = this.add.text(0, 0, '▼', { fontFamily: FONT, fontSize: '20px', color: '#e98c8c', resolution: 2 }).setOrigin(0.5).setDepth(31);
    this.tweens.add({ targets: this.arrow, y: '+=5', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 主角站在展間中（背向鏡頭），會走到目前選擇的展品前
    this.add.ellipse(640, 650, 46, 13, 0x2c2214, 0.28).setDepth(19).setName('playerShadow');
    this.player = this.add.sprite(640, 652, 'player', idleFrame('up'))
      .setOrigin(0.5, SHEETS.player.footY / SHEETS.player.frameHeight)
      .setScale((PLAYER.scale * 1.15) / TEX_SCALE)
      .setDepth(20);
    this.select(0, true);

    const kb = this.input.keyboard;
    const guard = (fn) => (e) => {
      if (e.repeat || ui.isModalOpen() || this.leaving) return;
      fn();
    };
    const prev = () => this.select((this.selected + this.items.length - 1) % this.items.length);
    const next = () => this.select((this.selected + 1) % this.items.length);
    kb.on('keydown-LEFT', guard(prev));
    kb.on('keydown-A', guard(prev));
    kb.on('keydown-RIGHT', guard(next));
    kb.on('keydown-D', guard(next));
    kb.on('keydown-ENTER', guard(() => this.open(this.selected)));
    kb.on('keydown-E', guard(() => this.open(this.selected)));
    kb.on('keydown-SPACE', guard(() => this.open(this.selected)));
    kb.on('keydown-ESC', guard(() => this.leave()));
    this.events.once('shutdown', () => kb.removeAllListeners());

    ui.setActivity({ help: 'museum', exit: { label: '← 返回室外 Esc', onClick: () => this.leave() } });
    this.cameras.main.fadeIn(350, 0, 0, 0);
    ui.showTutorialOnce('museum');
  }

  // ---------- 室內：牆面、腰板、木地板（程式繪製的手繪風紋理） ----------
  drawRoom() {
    const g = this.add.graphics().setDepth(0);
    const r = this.rnd;
    // 牆：灰泥 + 淡淡的直向刷痕
    g.fillStyle(PALETTE.plaster, 1).fillRect(0, 0, 1280, WALL_BOTTOM);
    for (let i = 0; i < 260; i++) {
      g.fillStyle(r() > 0.5 ? 0xffffff : 0xd9c6a2, 0.12 + r() * 0.1);
      g.fillRect(r() * 1280, 40 + r() * 330, 1 + r() * 2, 8 + r() * 30);
    }
    // 天花樑
    g.fillStyle(PALETTE.wood, 1).fillRect(0, 0, 1280, 36);
    g.fillStyle(PALETTE.woodLight, 1).fillRect(0, 32, 1280, 6);
    for (let x = 0; x < 1280; x += 160) g.fillStyle(PALETTE.woodDark, 1).fillRect(x, 0, 6, 36);
    // 腰板：直向木條
    g.fillStyle(0xb98c60, 1).fillRect(0, 372, 1280, WALL_BOTTOM - 372);
    for (let x = 0; x < 1280; x += 32) {
      g.fillStyle(0xa77a50, 1).fillRect(x, 372, 2, WALL_BOTTOM - 372);
      g.fillStyle(0xd0a578, 0.4).fillRect(x + 3, 374, 2, WALL_BOTTOM - 376);
    }
    g.fillStyle(PALETTE.woodDark, 1).fillRect(0, 366, 1280, 8);
    // 地板：長條木板，交錯接縫與木紋
    const plankH = 30;
    for (let row = 0; WALL_BOTTOM + row * plankH < 720; row++) {
      const y = WALL_BOTTOM + row * plankH;
      const off = (row * 97) % 220;
      for (let x = -off; x < 1280; x += 220) {
        const tone = [0xc89566, 0xc08c5c, 0xcc9b6c, 0xbd8858][Math.floor(r() * 4)];
        g.fillStyle(tone, 1).fillRect(x, y, 218, plankH - 2);
        g.fillStyle(0x000000, 0.05).fillRect(x, y + plankH - 6, 218, 4);
        g.lineStyle(1, 0x9c6c42, 0.35);
        for (let k = 0; k < 2; k++) {
          const gy = y + 6 + r() * (plankH - 12);
          g.beginPath(); g.moveTo(x + 10, gy);
          g.lineTo(x + 80 + r() * 40, gy + (r() - 0.5) * 3);
          g.lineTo(x + 200, gy + (r() - 0.5) * 3); g.strokePath();
        }
      }
      g.fillStyle(0x8a5e3a, 1).fillRect(0, y + plankH - 2, 1280, 2);
    }
    // 地板受光（暖色）與牆角陰影
    g.fillStyle(0xfff0c8, 0.08).fillEllipse(640, 590, 1100, 200);
    g.fillStyle(0x3a2616, 0.18).fillRect(0, WALL_BOTTOM, 1280, 10);
    // 地毯（走道）
    g.fillStyle(0xb85e52, 1).fillRoundedRect(200, 560, 880, 120, 12);
    g.lineStyle(3, 0xe9b65a, 1).strokeRoundedRect(212, 570, 856, 100, 9);
    g.fillStyle(0x9e4c42, 0.35).fillRoundedRect(200, 650, 880, 30, 12);

    // 館名：刻在天花樑中央的木牌
    g.fillStyle(PALETTE.woodDark, 1).fillRoundedRect(548, 3, 184, 30, 6);
    g.fillStyle(0xe2b97a, 1).fillRoundedRect(552, 6, 176, 24, 5);
    this.add.text(640, 18, MUSEUM_TITLE, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#5a3a22', resolution: 2 }).setOrigin(0.5).setDepth(1);
  }

  // ---------- 三個展區：木柱分隔、展區名牌 ----------
  drawZones() {
    const g = this.add.graphics().setDepth(1);
    for (const x of [430, 850]) {
      g.fillStyle(0x000000, 0.12).fillRect(x + 6, 36, 10, WALL_BOTTOM - 36);
      g.fillStyle(PALETTE.wood, 1).fillRect(x - 6, 36, 14, WALL_BOTTOM - 36);
      g.fillStyle(PALETTE.woodLight, 0.6).fillRect(x - 4, 36, 3, WALL_BOTTOM - 36);
    }
    ZONES.forEach((z, i) => {
      const [a, b] = ZONE_X[z.id];
      const cx = (a + b) / 2;
      // 手機畫面縮小約一半：展區牌改用大字與較寬的木牌
      const big = touch.enabled;
      const hw = big ? 150 : 96;
      g.fillStyle(PALETTE.woodDark, 1).fillRect(cx - 60, 36, 2, 18).fillRect(cx + 58, 36, 2, 18);
      g.fillStyle(PALETTE.woodDark, 1).fillRoundedRect(cx - hw, 52, hw * 2, big ? 36 : 30, 7);
      g.fillStyle(0xf3dfb2, 1).fillRoundedRect(cx - hw + 4, 55, hw * 2 - 8, big ? 30 : 24, 6);
      this.add.text(cx, big ? 70 : 67, `${i + 1}．${z.title}`, { fontFamily: FONT, fontSize: big ? '20px' : '15px', fontStyle: 'bold', color: '#5a3a22', resolution: 2 }).setOrigin(0.5).setDepth(2);
    });
  }

  // ---------- 暖燈 ----------
  drawLights() {
    const g = this.add.graphics().setDepth(25);
    for (const z of ZONES) {
      const [a, b] = ZONE_X[z.id];
      const cx = (a + b) / 2 + 130; // 燈掛在展區名牌右側
      g.fillStyle(0xfff1c2, 0.09);
      g.fillTriangle(cx - 24, 40, cx + 24, 40, cx + 190, WALL_BOTTOM);
      g.fillTriangle(cx - 24, 40, cx - 190, WALL_BOTTOM, cx + 190, WALL_BOTTOM);
      g.fillStyle(PALETTE.woodDark, 1).fillRect(cx - 1, 36, 2, 14);
      g.fillStyle(0xd9a74a, 1).fillTriangle(cx - 16, 58, cx + 16, 58, cx, 46);
      const glow = this.add.image(cx, 62, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.2 / TEX_SCALE).setAlpha(0.6).setDepth(26);
      this.tweens.add({ targets: glow, alpha: 0.8, duration: 2200 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ---------- 展品擺設 ----------
  thumb(key, x, y, w, h, depth = 6) {
    const k = `mus:${key}`;
    if (!key || !this.textures.exists(k)) return null;
    const img = this.add.image(x, y, k).setDepth(depth);
    const s = Math.max(w / img.width, h / img.height);
    img.setScale(s);
    img.setCrop((img.width - w / s) / 2, (img.height - h / s) / 2, w / s, h / s);
    return img;
  }

  frame(g, x, y, w, h, border = 7) {
    g.fillStyle(0x000000, 0.18).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 5, w, h, 4);
    g.fillStyle(PALETTE.wood, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    g.fillStyle(PALETTE.cream, 1).fillRect(x - w / 2 + border, y - h / 2 + border, w - border * 2, h - border * 2);
  }

  table(g, cx, top, w, legs = 66) {
    g.fillStyle(0x000000, 0.16).fillEllipse(cx + 6, top + legs + 6, w + 20, 18);
    g.fillStyle(PALETTE.woodDark, 1).fillRect(cx - w / 2 + 10, top + 10, 10, legs).fillRect(cx + w / 2 - 20, top + 10, 10, legs);
    g.fillStyle(PALETTE.wood, 1).fillRoundedRect(cx - w / 2, top, w, 14, 4);
    g.fillStyle(PALETTE.woodLight, 1).fillRect(cx - w / 2 + 4, top + 2, w - 8, 3);
  }

  drawExhibit(ex) {
    const L = LAYOUT[ex.id];
    const g = this.add.graphics().setDepth(5);
    const top = L.y - L.h;
    switch (ex.prop) {
      case 'photos': {
        this.frame(g, L.x - 34, top + 62, 86, 108);
        this.thumb(ex.thumb, L.x - 34, top + 62, 72, 94);
        this.frame(g, L.x + 50, top + 52, 78, 62);
        this.thumb(ex.thumb2, L.x + 50, top + 52, 64, 48);
        // 小書架（三本書）
        g.fillStyle(PALETTE.wood, 1).fillRect(L.x + 12, top + 118, 86, 6);
        [[0x6b8fb3, 14], [0xd9a74a, 12], [0xc96a5a, 16]].forEach(([c, w], i) => {
          g.fillStyle(c, 1).fillRect(L.x + 18 + i * 22, top + 92, w, 26);
          g.fillStyle(0xffffff, 0.3).fillRect(L.x + 20 + i * 22, top + 96, 2, 18);
        });
        break;
      }
      case 'notebook': {
        this.table(g, L.x - 10, L.y - 18, 230);
        // 攤開的筆記本與筆
        g.fillStyle(0x000000, 0.12).fillRoundedRect(L.x - 48, L.y - 38, 100, 22, 3);
        g.fillStyle(0xfdf8ec, 1).fillRect(L.x - 50, L.y - 42, 48, 22).fillRect(L.x - 1, L.y - 42, 48, 22);
        g.lineStyle(1, 0xb9c6d9, 1);
        for (let i = 0; i < 4; i++) { g.lineBetween(L.x - 46, L.y - 37 + i * 5, L.x - 6, L.y - 37 + i * 5); g.lineBetween(L.x + 3, L.y - 37 + i * 5, L.x + 43, L.y - 37 + i * 5); }
        g.fillStyle(0xc96a5a, 1).fillRect(L.x + 52, L.y - 34, 26, 4);
        // 檯燈
        g.fillStyle(PALETTE.woodDark, 1).fillRect(L.x - 100, L.y - 64, 4, 46).fillEllipse(L.x - 98, L.y - 18, 22, 6);
        g.fillStyle(0xe2b13c, 1).fillTriangle(L.x - 116, L.y - 60, L.x - 80, L.y - 60, L.x - 98, L.y - 78);
        break;
      }
      case 'notes': {
        // 軟木板 + 便利貼
        g.fillStyle(0x000000, 0.15).fillRoundedRect(L.x - 50, top + 6, 108, 128, 6);
        g.fillStyle(PALETTE.wood, 1).fillRoundedRect(L.x - 54, top, 108, 128, 6);
        g.fillStyle(0xcfa070, 1).fillRect(L.x - 47, top + 7, 94, 114);
        const colors = [0xf7e08a, 0xb9e0a5, 0xf4b8c4, 0xa9d0ee, 0xf7e08a, 0xf4c99a];
        colors.forEach((c, i) => {
          const nx = L.x - 40 + (i % 2) * 44 + (this.rnd() - 0.5) * 6;
          const ny = top + 14 + Math.floor(i / 2) * 34 + (this.rnd() - 0.5) * 6;
          g.fillStyle(c, 1).fillRect(nx, ny, 36, 28);
          g.lineStyle(1, 0x8a6a4a, 0.5).lineBetween(nx + 5, ny + 10, nx + 30, ny + 10).lineBetween(nx + 5, ny + 17, nx + 24, ny + 17);
          g.fillStyle(0xd0503f, 1).fillCircle(nx + 18, ny + 2, 2.5);
        });
        break;
      }
      case 'map': {
        // 地圖（羊皮紙、河流、路線、圖釘）＋ 一張活動海報
        g.fillStyle(0x000000, 0.15).fillRect(L.x - 76, top + 8, 156, 108);
        g.fillStyle(0xe9d6a8, 1).fillRect(L.x - 80, top + 2, 156, 108);
        g.lineStyle(2, 0xb99b64, 1).strokeRect(L.x - 80, top + 2, 156, 108);
        g.lineStyle(6, 0x8fc0c8, 1);
        g.beginPath(); g.moveTo(L.x - 80, top + 70); g.lineTo(L.x - 30, top + 60); g.lineTo(L.x + 20, top + 80); g.lineTo(L.x + 76, top + 66); g.strokePath();
        g.lineStyle(2, 0xa0603c, 0.9);
        const route = [[-60, 30], [-30, 42], [0, 28], [26, 46], [50, 34], [40, 92], [-10, 96], [-50, 88]];
        g.beginPath(); route.forEach(([dx, dy], i) => (i ? g.lineTo(L.x + dx, top + dy) : g.moveTo(L.x + dx, top + dy))); g.strokePath();
        for (const [dx, dy] of route) { g.fillStyle(0xd0503f, 1).fillCircle(L.x + dx, top + dy, 3.5); g.fillStyle(0xffffff, 0.8).fillCircle(L.x + dx - 1, top + dy - 1, 1.2); }
        this.frame(g, L.x + 66, top + 118, 52, 66, 4);
        this.thumb(ex.thumb, L.x + 66, top + 118, 44, 58, 7);
        break;
      }
      case 'pottery': {
        this.table(g, L.x, L.y - 70, 170);
        // 陶器（鶯歌）
        const vase = (x, h, w, c) => {
          const base = L.y - 70;
          g.fillStyle(0x000000, 0.15).fillEllipse(x + 4, base - 1, w + 6, 6);
          g.fillStyle(c, 1).fillEllipse(x, base - h * 0.45, w, h * 0.8);
          g.fillRect(x - w * 0.18, base - h, w * 0.36, h * 0.3);
          g.fillStyle(0xffffff, 0.25).fillEllipse(x - w * 0.18, base - h * 0.5, w * 0.18, h * 0.4);
          g.lineStyle(2, 0xffffff, 0.35).lineBetween(x - w * 0.4, base - h * 0.45, x + w * 0.4, base - h * 0.45);
        };
        vase(L.x - 52, 46, 34, 0x6a8fa8);
        vase(L.x - 8, 60, 42, 0xc9875a);
        vase(L.x + 46, 40, 36, 0x7aa07a);
        // 小海報立牌
        this.frame(g, L.x + 70, L.y - 108, 46, 34, 3);
        this.thumb(ex.thumb, L.x + 70, L.y - 108, 40, 28, 7);
        break;
      }
      case 'board': {
        // 活動紀錄板（照片 + 圖釘）
        g.fillStyle(0x000000, 0.15).fillRoundedRect(L.x - 74, top + 8, 152, 124, 6);
        g.fillStyle(PALETTE.wood, 1).fillRoundedRect(L.x - 78, top + 2, 152, 124, 6);
        g.fillStyle(0xcfa070, 1).fillRect(L.x - 71, top + 9, 138, 110);
        g.fillStyle(0xffffff, 1).fillRect(L.x - 66, top + 16, 66, 52).fillRect(L.x + 2, top + 40, 60, 74);
        this.thumb(ex.thumb, L.x - 33, top + 42, 60, 46, 7);
        this.thumb(ex.thumb2, L.x + 32, top + 75, 54, 66, 7);
        g.fillStyle(0xd0503f, 1).fillCircle(L.x - 33, top + 18, 3).fillCircle(L.x + 32, top + 42, 3);
        break;
      }
      case 'computer': {
        this.table(g, L.x, L.y - 70, 180);
        // 螢幕
        g.fillStyle(0x000000, 0.18).fillRoundedRect(L.x - 58, L.y - 168, 124, 92, 8);
        g.fillStyle(0xe8dcc0, 1).fillRoundedRect(L.x - 62, L.y - 172, 124, 92, 8);
        g.fillStyle(0x2f3a3a, 1).fillRect(L.x - 54, L.y - 164, 108, 70);
        this.thumb(ex.thumb, L.x, L.y - 129, 104, 66, 7);
        g.fillStyle(0xd8cbb0, 1).fillRect(L.x - 10, L.y - 80, 20, 8).fillRoundedRect(L.x - 30, L.y - 74, 60, 6, 3);
        // 鍵盤
        g.fillStyle(0xe8dcc0, 1).fillRoundedRect(L.x - 46, L.y - 76, 70, 8, 3);
        g.fillStyle(0x6b8fb3, 1).fillCircle(L.x + 46, L.y - 74, 5);
        break;
      }
      case 'tablet': {
        // 立架上的平板
        g.fillStyle(0x000000, 0.16).fillEllipse(L.x + 4, L.y - 2, 70, 12);
        g.fillStyle(PALETTE.woodDark, 1).fillRect(L.x - 4, L.y - 70, 8, 68).fillRoundedRect(L.x - 26, L.y - 8, 52, 8, 3);
        g.fillStyle(0x3a3a3a, 1).fillRoundedRect(L.x - 46, L.y - 150, 92, 76, 8);
        g.fillStyle(0xffffff, 1).fillRect(L.x - 40, L.y - 144, 80, 62);
        this.thumb(ex.thumb, L.x, L.y - 113, 80, 62, 7);
        break;
      }
      case 'sign': {
        // 木製「作品入口」指示牌
        g.fillStyle(0x000000, 0.15).fillRoundedRect(L.x - 66, top + 8, 136, 54, 8);
        g.fillStyle(PALETTE.wood, 1).fillRoundedRect(L.x - 70, top + 2, 136, 54, 8);
        g.fillStyle(0xf3dfb2, 1).fillRoundedRect(L.x - 64, top + 8, 124, 42, 6);
        g.fillStyle(PALETTE.woodDark, 1).fillTriangle(L.x + 40, top + 18, L.x + 40, top + 40, L.x + 54, top + 29);
        this.add.text(L.x - 8, top + 29, '作品入口', { fontFamily: FONT, fontSize: touch.enabled ? '21px' : '16px', fontStyle: 'bold', color: '#5a3a22', resolution: 2 }).setOrigin(0.5).setDepth(6);
        break;
      }
      default:
        break;
    }
    // 展品標題（簡短；指示牌本身已有文字就不重複）
    const plateY = L.y + 14;
    // 手機：展品名稱改用大字（畫面縮小後約 12px，仍看得清楚）
    const big = touch.enabled;
    const t = ex.prop === 'sign' ? null : this.add.text(L.x, plateY, ex.title, { fontFamily: FONT, fontSize: big ? '20px' : '13px', fontStyle: 'bold', color: '#fff8ea', resolution: 2, backgroundColor: 'rgba(110,75,58,0.9)', padding: big ? { x: 9, y: 3 } : { x: 7, y: 2 } }).setOrigin(0.5, 0).setDepth(8);
    ex._label = t;

    const zone = this.add.zone(L.x, L.y - L.h / 2 + 10, L.w + 10, L.h + 30).setInteractive({ useHandCursor: true }).setDepth(40);
    const idx = this.items.indexOf(ex);
    zone.on('pointerover', () => { if (!ui.isModalOpen() && !this.leaving) this.select(idx); });
    zone.on('pointerdown', () => {
      if (!ui.isModalOpen() && !this.leaving) {
        this.select(idx);
        this.open(idx);
      }
    });
  }

  select(i, instant = false) {
    if (i === this.selected && !instant && this.highlight.visible) return;
    this.selected = i;
    const ex = this.items[i];
    const L = LAYOUT[ex.id];
    const h = this.highlight;
    h.clear();
    h.lineStyle(4, 0xf6d58c, 1);
    h.strokeRoundedRect(L.x - L.w / 2 - 8, L.y - L.h - 8, L.w + 16, L.h + 40, 10);
    this.arrow.setPosition(L.x, L.y - L.h - 22);
    // 手機：目前選擇的展品以 HTML 大字顯示在畫面下方
    if (touch.enabled) {
      const zone = ZONES.find((z) => z.id === ex.zone);
      ui.setStatus(`${zone ? `${zone.title}｜` : ''}${ex.title}　按「查看」看介紹`);
    }
    // 主角走到展品前
    const tx = Phaser.Math.Clamp(L.x, 120, 1160);
    const shadow = this.children.getByName('playerShadow');
    if (instant) {
      this.player.x = tx;
      shadow.x = tx;
      return;
    }
    const dir = tx < this.player.x ? 'left' : 'right';
    this.tweens.killTweensOf([this.player, shadow]);
    if (Math.abs(tx - this.player.x) > 4) this.player.anims.play(`walk-${dir}`, true);
    this.tweens.add({
      targets: [this.player, shadow], x: tx, duration: Math.min(600, Math.abs(tx - this.player.x) * 2.2 + 120), ease: 'Sine.easeInOut',
      onComplete: () => this.player.anims.stop().setFrame(idleFrame('up')),
    });
    audio.play('click');
  }

  open(i) {
    const ex = this.items[i];
    const zone = ZONES.find((z) => z.id === ex.zone);
    const el = ui.el;
    const body = el('div', 'exhibit');
    body.append(el('div', 'exhibit-zone', zone ? `展區：${zone.title}` : ''));
    if (ex.subtitle) body.append(el('p', 'exhibit-subtitle', ex.subtitle));
    for (const para of ex.paragraphs || []) body.append(el('p', '', para));

    if (ex.role) {
      const dl = el('dl', 'exhibit-role');
      // 沒有資料的欄位不顯示
      const row = (k, v) => {
        if (!v || (Array.isArray(v) && !v.length)) return;
        dl.append(el('dt', '', k));
        const dd = el('dd');
        if (Array.isArray(v)) {
          const ul = el('ul');
          for (const it of v) ul.append(el('li', '', it));
          dd.append(ul);
        } else dd.textContent = v;
        dl.append(dd);
      };
      row('背景', ex.role.context);
      row('我的角色', ex.role.me);
      row('負責內容', ex.role.did);
      row('成果', ex.role.result);
      body.append(dl);
    }

    for (const s of ex.sections || []) {
      body.append(el('h3', 'exhibit-h', s.heading));
      const ul = el('ul', 'exhibit-list');
      for (const it of s.items) ul.append(el('li', '', it));
      body.append(ul);
    }

    if (ex.video) {
      const fig = el('figure', 'exhibit-figure exhibit-video');
      const v = el('video');
      v.src = ex.video.src;
      v.controls = true;
      v.preload = 'metadata';
      v.playsInline = true;
      fig.append(v);
      if (ex.video.caption) fig.append(el('figcaption', '', ex.video.caption));
      body.append(fig);
    }

    if (ex.images?.length) {
      const grid = el('div', 'exhibit-images');
      for (const im of ex.images) {
        if (!im.src) continue; // 沒有照片的項目不顯示
        const fig = el('figure', 'exhibit-figure');
        const img = el('img');
        img.src = im.src;
        img.alt = im.caption || ex.title;
        img.onerror = () => img.replaceWith(el('div', 'photo-placeholder', '圖片載入失敗'));
        fig.append(img);
        const cap = [im.caption, im.credit].filter(Boolean).join('　');
        if (cap) fig.append(el('figcaption', '', cap));
        grid.append(fig);
      }
      body.append(grid);
    }

    if (ex.links?.length) {
      const links = el('div', 'exhibit-links');
      for (const l of ex.links) {
        const a = el('a', '', l.label);
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        links.append(a, document.createTextNode('　'));
      }
      body.append(links);
    }

    body.append(el('p', 'hint exhibit-source', '資料來源：承翰_自我介紹簡報'));

    ui.openModal({
      title: ex.title,
      body,
      className: 'modal-exhibit',
      returnFocus: 'game',
      onClose: () => body.querySelectorAll('video').forEach((v) => v.pause()),
    });
  }

  leave() {
    if (this.leaving || ui.isModalOpen()) return;
    this.leaving = true;
    ui.setActivity(null);
    ui.setStatus(null);
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.wake('Town');
      this.scene.stop();
    });
  }
}
