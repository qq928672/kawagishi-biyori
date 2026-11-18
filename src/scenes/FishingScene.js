import Phaser from 'phaser';
import { FISHING, FONT } from '../config/gameConfig.js';
import { FISH_TIERS, EASY_MODE, BAITS, rollFish } from '../config/collectibles.js';
import { FISHING_VIEW as V } from '../config/fishingView.js';
import { TEX_SCALE } from '../config/assets.js';
import { save } from '../core/save.js';
import { store, bus } from '../core/store.js';
import { ui } from '../core/ui.js';
import { audio } from '../core/audio.js';
import { touch } from '../core/touch.js';

import { MAP } from '../config/map.js';

// 河堤釣魚近景：坐在石堤邊，雙腳垂在石壁前
// 流程：選擇魚餌 → 拋竿 → 等待咬鉤 → 按空白鍵開始收竿 → 節奏挑戰 → 魚獲或逃脫
// 畫面上只顯示「當前必要操作」；完整說明在首次教學與「？」按鈕。
// 暫停：視窗失焦／切換分頁（需按空白鍵繼續）與任何彈窗開啟（關閉後自動繼續）分開記錄，
// 兩者都會停止計時器、補間動畫與節奏判定，恢復後從原狀態繼續。
const STATE_HINT_KEYS = {
  select: 'E 拋竿　｜　1／2 換魚餌',
  casting: '拋竿中…',
  waiting: '等待咬鉤…',
  bite: '上鉤了！按 Space 收竿',
  reeling: 'Space 判定',
};
// 手機觸控：對應右下角的按鈕名稱
const STATE_HINT_TOUCH = {
  select: '按「拋竿」　｜　「換餌」切換魚餌',
  casting: '拋竿中…',
  waiting: '等待咬鉤…',
  bite: '上鉤了！按「收竿！」',
  reeling: '「收線」判定',
};
const STATE_HINT = new Proxy({}, { get: (_, k) => (touch.enabled ? STATE_HINT_TOUCH : STATE_HINT_KEYS)[k] });

const C = {
  panel: 0x3a2a1e,
  cream: 0xfbf4e6,
  good: 0x9fc36a,
  goodLine: 0x7fa65a,
  perfect: 0xf2c45a,
  perfectEdge: 0x8a5a1a,
  progress: 0x537f61,
  risk: 0xc88050,
  danger: 0xe0524f,
  ink: 0x2f2219,
};

export class FishingScene extends Phaser.Scene {
  constructor() {
    super('Fishing');
  }

  create(data) {
    store.mode = 'fishing';
    this.spot = data?.spot || 'embankment';
    this.state = 'idle';
    this.timers = [];
    this.tweensList = [];
    this.leaving = false;
    this.pause = { blur: false, modal: ui.isModalOpen() };
    this.baitId = save.count('bait_premium') > 0 && this.lastBait === 'bait_premium' ? 'bait_premium' : 'bait_basic';
    this.town = this.scene.get('Town');
    const feet = this.town.feet;
    this.anchor = this.screenPoint(feet.x, feet.y);
    this.hand = this.screenPoint(feet.x + 17, feet.y - 36);
    this.rod = this.add.graphics().setDepth(58);
    const pose = this.spot === 'farBank' ? 'angler_back' : 'angler_front';
    const actors = [this.town.player, this.town.silhouette];
    const originalFrame = this.town.player.frame.name;
    for (const actor of actors) actor.setTexture(pose);
    this.events.once('shutdown', () => {
      for (const actor of actors) actor.setTexture('player', originalFrame).setRotation(0);
    });
    this.motion = { angle: 32, lean: 0, bend: 0 };
    this.poseTime = 0;
    this.line = this.add.graphics().setDepth(60);
    this.bobber = this.add.image(0, 0, 'bobber').setOrigin(0.5, 0.75).setScale(1.1 / TEX_SCALE).setDepth(55).setVisible(false);
    this.bubble = this.buildBiteBubble();

    this.add.text(24, 64, this.spot === 'farBank' ? '對岸釣點' : '河堤釣點', {
      fontFamily: FONT, fontSize: '14px', color: '#fff8ea', resolution: 2, backgroundColor: 'rgba(74,52,38,0.7)', padding: { x: 10, y: 4 },
    }).setDepth(100);

    this.buildBaitPanel();
    this.buildRhythmUI();
    this.pauseText = this.add.text(640, 300, '已暫停\n按空白鍵繼續', {
      fontFamily: FONT, fontSize: '26px', color: '#fff8ea', align: 'center', resolution: 2, backgroundColor: 'rgba(40,28,20,0.85)', padding: { x: 30, y: 18 },
    }).setOrigin(0.5).setDepth(200).setVisible(false);

    // 按鍵（只在此場景；關閉時全部移除）。彈窗開啟時 ui 會在捕獲階段攔下按鍵，這裡再多一層保護。
    const kb = this.input.keyboard;
    const ok = (e) => !e.repeat && !ui.isModalOpen() && !this.leaving;
    kb.on('keydown-SPACE', (e) => { if (ok(e)) this.onSpace(); });
    kb.on('keydown-E', (e) => { if (ok(e) && !this.isPaused() && this.state === 'select') this.cast(); });
    kb.on('keydown-ENTER', (e) => { if (ok(e) && !this.isPaused() && this.state === 'select') this.cast(); });
    kb.on('keydown-ONE', (e) => { if (ok(e)) this.chooseBait('bait_basic'); });
    kb.on('keydown-TWO', (e) => { if (ok(e)) this.chooseBait('bait_premium'); });
    kb.on('keydown-ESC', (e) => { if (ok(e)) this.standUp(); });

    // 失焦／切換分頁：暫停判定與計時，回來後按空白鍵繼續
    this.onBlur = () => {
      if (['casting', 'waiting', 'bite', 'reeling'].includes(this.state)) this.setPause('blur', true);
    };
    this.onVisibility = () => { if (document.hidden) this.onBlur(); };
    this.onModalOpen = () => this.setPause('modal', true);
    this.onModalClose = () => this.setPause('modal', false);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    bus.on('modal-open', this.onModalOpen);
    bus.on('modal-close', this.onModalClose);
    this.events.once('shutdown', () => {
      this.clearAsync();
      kb.removeAllListeners();
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('blur', this.onBlur);
      bus.off('modal-open', this.onModalOpen);
      bus.off('modal-close', this.onModalClose);
      ui.setStatus(null);
    });

    ui.setActivity({ help: 'fishing', extra: [{ label: '圖鑑', onClick: () => ui.openDex() }], exit: { label: '← 收起魚竿 Esc', onClick: () => this.standUp() } });
    audio.setAmbience('fishing');

    this.toSelect();
    this.addTween({ targets: this.motion, angle: -48, duration: 480, ease: 'Sine.easeInOut' });
    this.applyPause();
    // 第一次釣魚：顯示釣魚教學（只出現一次）
    ui.showTutorialOnce('fishing');
  }

  /** 咬鉤提示泡泡（取代白色方塊驚嘆號） */
  buildBiteBubble() {
    const c = this.add.container(0, 0).setDepth(100).setVisible(false); // 在夜色濾色之上，保持清楚
    const g = this.add.graphics();
    g.fillStyle(0x2a1f12, 0.18).fillEllipse(3, 4, 54, 46);
    g.fillStyle(0xfff8ea, 1).fillEllipse(0, 0, 52, 44);
    g.fillTriangle(-6, 16, 8, 16, -14, 34);
    g.lineStyle(3, 0x6e4b3a, 1).strokeEllipse(0, 0, 52, 44);
    g.lineBetween(-6, 19, -14, 34).lineBetween(8, 18, -14, 34);
    g.fillStyle(0xfff8ea, 1).fillRect(-7, 14, 14, 6);
    const t = this.add.text(0, -1, '！', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#d0503f', resolution: 2 }).setOrigin(0.5);
    c.add([g, t]);
    return c;
  }

  // ---------- 魚餌選擇（精簡面板） ----------
  buildBaitPanel() {
    const c = this.add.container(28, 592).setDepth(110);
    const bg = this.add.graphics();
    bg.fillStyle(C.panel, 0.84).fillRoundedRect(0, 0, 300, 100, 14);
    bg.lineStyle(2, 0xf6d58c, 0.6).strokeRoundedRect(0, 0, 300, 100, 14);
    const title = this.add.text(16, 10, '魚餌', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#f6d58c', resolution: 2 });
    this.baitRows = BAITS.map((b, i) => {
      const t = this.add.text(16, 36 + i * 28, '', { fontFamily: FONT, fontSize: '15px', color: '#fff8ea', resolution: 2 })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { if (!ui.isModalOpen()) this.chooseBait(b.id); });
      return { bait: b, t };
    });
    c.add([bg, title, ...this.baitRows.map((r) => r.t)]);
    this.baitPanel = c;
    this.refreshBaitPanel();
  }

  refreshBaitPanel() {
    for (const { bait, t } of this.baitRows) {
      const n = bait.free ? '∞' : save.count(bait.id);
      const sel = this.baitId === bait.id;
      const key = bait.id === 'bait_basic' ? '1' : '2';
      t.setText(`${sel ? '▶' : '　'} ${key}　${bait.name}　×${n}`);
      t.setColor(!bait.free && save.count(bait.id) <= 0 ? '#9c8f80' : sel ? '#ffe9a8' : '#fff8ea');
    }
  }

  chooseBait(id) {
    if (this.state !== 'select' || this.isPaused()) return;
    const bait = BAITS.find((b) => b.id === id);
    if (!bait.free && save.count(id) <= 0) {
      ui.toast('沒有進階魚餌了，可以到雜貨店購買。');
      return;
    }
    this.baitId = id;
    audio.play('click');
    this.refreshBaitPanel();
  }

  // ---------- 節奏判定 UI ----------
  // 版面：上排「收竿進度（魚圖示）」與「斷線風險（魚線圖示）」分開；中間判定條；
  // 下排固定的區間圖例與操作提示；判定結果顯示在浮標上方（獨立位置）。
  buildRhythmUI() {
    const R = V.rhythm;
    const c = this.add.container(0, 0).setDepth(120).setVisible(false);
    const panel = this.add.graphics();
    const left = R.x - 26, top = R.y - 90, width = R.w + 52, height = 158;
    panel.fillStyle(0x30271e, 0.25).fillRoundedRect(left + 3, top + 6, width, height, 12);
    panel.fillStyle(0x455e52).fillRoundedRect(left, top, width, height, 12);
    panel.lineStyle(2, 0x493e30).strokeRoundedRect(left, top, width, height, 12);
    panel.fillStyle(0xd9c5a3).fillRoundedRect(left + 10, top + 7, width - 17, height - 12, 8);
    panel.fillStyle(0xffefd0).fillRoundedRect(left + 10, top + 4, width - 17, height - 13, 8);
    for (const dy of [25, 79, 131]) {
      panel.fillStyle(0x634a35).fillCircle(left + 13, top + dy, 3);
      panel.lineStyle(3, 0xd6ad70).lineBetween(left + 2, top + dy, left + 13, top + dy);
    }    this.zoneG = this.add.graphics();
    this.pointer = this.add.graphics();
    const half = R.w / 2 - 24;
    const meterY = R.y - 50;
    const txt = (x, y, s, color, size = 14, bold = false) => this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, resolution: 2 });
    // 收竿進度：魚圖示 + 標題
    const fishIcon = this.add.image(R.x + 10, meterY - 18, 'fish_crucian').setScale(26 / this.textures.get('fish_crucian').getSourceImage().height).setOrigin(0.5);
    const lp = txt(R.x + 28, meterY - 28, '收竿進度', '#3e6551', 14, true);
    // 斷線風險：魚線圖示（手繪）+ 標題
    const lineIcon = this.add.graphics();
    const lx = R.x + R.w / 2 + 34;
    lineIcon.lineStyle(2, 0xa05a3b, 1);
    lineIcon.beginPath();
    lineIcon.moveTo(lx - 10, meterY - 28);
    for (let k = 0; k <= 10; k++) lineIcon.lineTo(lx - 10 + k * 2, meterY - 18 + Math.sin(k * 1.4) * 4);
    lineIcon.strokePath();
    lineIcon.lineBetween(lx + 10, meterY - 18, lx + 12, meterY - 8);
    const lt = txt(lx + 20, meterY - 28, '斷線風險', '#894b34', 14, true);
    this.meters = this.add.graphics();
    this.meterDims = { half, meterY, rightX: R.x + R.w / 2 + 24 };
    this.fishLabel = txt(R.x + R.w, meterY - 27, '', '#725841', 12).setOrigin(1, 0);
    // 下排：固定圖例 + 操作
    const legendY = R.y + R.h + 14;
    const legend = this.add.graphics();
    legend.fillStyle(C.good, 1).fillRect(R.x, legendY + 2, 16, 12);
    legend.lineStyle(2, C.goodLine, 1).lineBetween(R.x + 2, legendY + 14, R.x + 14, legendY + 2);
    legend.fillStyle(C.perfect, 1).fillRect(R.x + 96, legendY + 2, 16, 12);
    legend.lineStyle(2, C.perfectEdge, 1).strokeRect(R.x + 96, legendY + 2, 16, 12);
    const lg = txt(R.x + 22, legendY, 'GOOD', '#446145', 13, true);
    const lpf = txt(R.x + 118, legendY, 'PERFECT', '#815a24', 13, true);
    legend.fillStyle(0x584636).fillRoundedRect(R.x + R.w - 111, legendY - 4, 52, 22, 5);
    const keyCap = txt(R.x + R.w - 85, legendY + 6, 'SPACE', '#fff5dc', 12, true).setOrigin(0.5);
    this.keyCap = keyCap;
    const keyHint = txt(R.x + R.w, legendY, '節奏收竿', '#594535', 13, true).setOrigin(1, 0);
    c.add([panel, this.zoneG, fishIcon, lp, lineIcon, lt, this.meters, this.fishLabel, legend, lg, lpf, keyCap, keyHint, this.pointer]);
    this.rhythmUI = c.setY(-438);
    // 判定結果：顯示在浮標上方（不與區間名稱混在一起）
    this.judgeText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#fff', resolution: 2, stroke: '#2f2219', strokeThickness: 6 }).setOrigin(0.5).setDepth(130).setAlpha(0);
  }

  drawZones() {
    const R = V.rhythm;
    const z = this.rhythm;
    const g = this.zoneG;
    g.clear();
    g.fillStyle(0xb9cec0, 1).fillRoundedRect(R.x, R.y, R.w, R.h, 8);
    // Good 外區：綠色斜線（形狀區分，不只靠顏色）
    const gx = R.x + (z.center - z.good / 2) * R.w;
    const gw = z.good * R.w;
    g.fillStyle(C.good, 1).fillRect(gx, R.y, gw, R.h);
    g.lineStyle(3, C.goodLine, 1);
    for (let x = gx - R.h; x < gx + gw; x += 10) g.lineBetween(Math.max(gx, x), R.y + Math.max(0, gx - x), Math.min(gx + gw, x + R.h), R.y + R.h - Math.max(0, x + R.h - (gx + gw)));
    // Perfect 中心區：實心金色 + 上下菱形標記
    const px = R.x + (z.center - z.perfect / 2) * R.w;
    const pw = z.perfect * R.w;
    g.fillStyle(C.perfect, 1).fillRect(px, R.y, pw, R.h);
    g.lineStyle(2, C.perfectEdge, 1).strokeRect(px, R.y, pw, R.h);
    const cx = px + pw / 2;
    g.fillStyle(C.perfect, 1);
    g.fillTriangle(cx, R.y - 9, cx - 6, R.y - 3, cx + 6, R.y - 3);
    g.fillTriangle(cx, R.y + R.h + 9, cx - 6, R.y + R.h + 3, cx + 6, R.y + R.h + 3);
    g.lineStyle(3, 0x6e4b3a, 1).strokeRoundedRect(R.x, R.y, R.w, R.h, 8);
  }

  drawMeters() {
    const m = this.meters;
    const { half, meterY, rightX } = this.meterDims;
    const R = V.rhythm;
    const r = this.rhythm;
    m.clear();
    // 底槽與刻度
    m.fillStyle(0xc9ba9b, 1).fillRoundedRect(R.x, meterY, half, 14, 7).fillRoundedRect(rightX, meterY, half, 14, 7);
    // 收竿進度（綠）
    const pw = Math.max(0.01, (r.progress / 100) * half);
    m.fillStyle(C.progress, 1).fillRoundedRect(R.x, meterY, pw, 14, 7);
    // 斷線風險：70 以上變紅並加粗外框
    const danger = r.tension > 70;
    const tw = Math.max(0.01, (r.tension / 100) * half);
    m.fillStyle(danger ? C.danger : C.risk, 1).fillRoundedRect(rightX, meterY, tw, 14, 7);
    m.lineStyle(1, 0xfff8ea, 0.35);
    for (let k = 1; k < 4; k++) {
      m.lineBetween(R.x + (half * k) / 4, meterY + 2, R.x + (half * k) / 4, meterY + 12);
      m.lineBetween(rightX + (half * k) / 4, meterY + 2, rightX + (half * k) / 4, meterY + 12);
    }
    if (danger) m.lineStyle(2, C.danger, 1).strokeRoundedRect(rightX - 2, meterY - 2, half + 4, 18, 8);
    // 進度條末端的小魚記號（顏色之外的形狀提示）
    m.fillStyle(0xfff8ea, 1).fillTriangle(R.x + pw - 2, meterY + 7, R.x + pw + 8, meterY + 1, R.x + pw + 8, meterY + 13);
  }

  drawPointer() {
    const R = V.rhythm;
    const x = R.x + this.rhythm.pos * R.w;
    const p = this.pointer;
    p.clear();
    p.lineStyle(2, 0x42392e).lineBetween(x, R.y - 12, x, R.y + R.h + 4);
    const cy = R.y + R.h / 2;
    p.fillStyle(0xfff6dc).fillEllipse(x, cy, 12, R.h + 5);
    p.fillStyle(0xbc5844).fillEllipse(x, cy - 6, 10, 15);
    p.lineStyle(1.7, 0x55412d).strokeEllipse(x, cy, 12, R.h + 5);
  }

  // ---------- 計時器與暫停 ----------
  addTimer(ms, fn) {
    const t = this.time.delayedCall(ms, fn);
    this.timers.push(t);
    return t;
  }

  addTween(cfg) {
    const t = this.tweens.add(cfg);
    this.tweensList.push(t);
    return t;
  }

  clearAsync() {
    for (const t of this.timers) t.remove(false);
    for (const t of this.tweensList) t.stop();
    this.timers = [];
    this.tweensList = [];
  }

  isPaused() {
    return this.pause.blur || this.pause.modal;
  }

  setPause(reason, on) {
    if (this.pause[reason] === on) return;
    this.pause[reason] = on;
    this.applyPause();
  }

  applyPause() {
    const on = this.isPaused();
    if (this.time.paused !== on) {
      this.time.paused = on;
      if (on) this.tweens.pauseAll();
      else this.tweens.resumeAll();
    }
    const showPause = this.pause.blur && !this.pause.modal;
    if (showPause) this.pauseText.setText(touch.pick('已暫停\n按空白鍵繼續', '已暫停\n按「繼續」'));
    this.pauseText.setVisible(showPause);
  }

  screenPoint(x, y) {
    const cam = this.town.cameras.main;
    return cam.matrix.transformPoint(x - cam.scrollX, y - cam.scrollY);
  }

  rodTip() {
    const z = this.town.cameras.main.zoom;
    const a = Phaser.Math.DegToRad(this.motion.angle);
    return { x: this.hand.x + Math.cos(a) * 69 * z,
      y: this.hand.y + (Math.sin(a) * 69 + this.motion.bend) * z };
  }

  updateGrip() {
    const actor = this.town.player;
    const lean = this.motion.lean;
    actor.setRotation(lean);
    this.town.silhouette.setRotation(lean);
    const x = actor.displayWidth * 0.40;
    const y = -actor.displayHeight * 0.49;
    this.hand = this.screenPoint(actor.x + x * Math.cos(lean) - y * Math.sin(lean),
      actor.y + x * Math.sin(lean) + y * Math.cos(lean));
  }
  ripple(x, y, strong = false) {
    const r = this.add.ellipse(x, y, 34, 10).setStrokeStyle(2, 0xffffff, strong ? 0.85 : 0.6).setDepth(50);
    this.tweens.add({ targets: r, scaleX: strong ? 2.8 : 1.9, scaleY: strong ? 2.8 : 1.9, alpha: 0, duration: strong ? 700 : 1100, ease: 'Sine.easeOut', onComplete: () => r.destroy() });
  }

  droplets(x, y, n = 6) {
    for (let k = 0; k < n; k++) {
      const d = this.add.ellipse(x, y, 4, 5, 0xe8f6f4, 0.9).setDepth(56);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const dist = 16 + Math.random() * 16;
      this.tweens.add({ targets: d, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, alpha: 0, duration: 380 + Math.random() * 200, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  }

  // ---------- 流程 ----------
  toSelect(message) {
    this.clearAsync();
    this.state = 'select';
    this.bubble.setVisible(false);
    this.rhythmUI.setVisible(false);
    this.judgeText.setAlpha(0);
    if (this.baitId === 'bait_premium' && save.count('bait_premium') <= 0) this.baitId = 'bait_basic';
    this.refreshBaitPanel();
    this.baitPanel.setVisible(true);
    ui.setStatus(message ? `${message}　${STATE_HINT.select}` : STATE_HINT.select);
  }

  cast() {
    if (this.leaving || this.state !== 'select') return;
    // 進階魚餌在拋竿時消耗一個；基礎魚餌免費
    if (this.baitId === 'bait_premium' && !save.removeItem('bait_premium', 1)) this.baitId = 'bait_basic';
    this.lastBait = this.baitId;
    this.baitPanel.setVisible(false);
    this.clearAsync();
    this.state = 'casting';
    ui.setStatus(STATE_HINT.casting);

    const feet = this.town.feet;
    const far = this.spot === 'farBank';
    const river = MAP.river;
    const landingY = far ? river.y + river.h - 48 : Math.max(river.y + 46, feet.y + 90);
    const { x: tx, y: ty } = this.screenPoint(feet.x + Phaser.Math.Between(36, 64), landingY);
    this.target = { x: tx, y: ty };
    this.bobber.setVisible(false);
    this.addTween({
      targets: this.motion, angle: -110, lean: -0.085, bend: 0, duration: 240, ease: 'Sine.easeInOut',
      onComplete: () => this.addTween({
        targets: this.motion, angle: this.spot === 'farBank' ? -36 : -12,
        lean: 0.10, bend: 7, duration: 145, ease: 'Quad.easeIn',
        onComplete: () => {
          this.updateGrip();
          const tip = this.rodTip();
          audio.play('cast');
          this.bobber.setPosition(tip.x, tip.y).setVisible(true).setAlpha(1);
          this.addTween({ targets: this.motion, lean: 0, bend: 1, angle: -39, duration: 380, ease: 'Sine.easeOut' });
          const flight = { t: 0 };
          this.addTween({ targets: flight, t: 1, duration: 510, ease: 'Linear',
            onUpdate: () => this.bobber.setPosition(Phaser.Math.Linear(tip.x, tx, flight.t),
              Phaser.Math.Linear(tip.y, ty, flight.t) - Math.sin(flight.t * Math.PI) * 65),
            onComplete: () => this.onLanded() });
        }
      })
    });
  }

  onLanded() {
    if (this.state !== 'casting') return;
    this.state = 'waiting';
    ui.setStatus(STATE_HINT.waiting);
    audio.play('splash');
    this.ripple(this.target.x, this.target.y + 2, true);
    this.droplets(this.target.x, this.target.y - 4, 5);
    this.addTween({ targets: this.bobber, y: this.target.y + 3, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const idle = this.time.addEvent({ delay: 1600, loop: true, callback: () => this.ripple(this.target.x, this.target.y + 2) });
    this.timers.push(idle);
    this.addTimer(Phaser.Math.Between(FISHING.waitMin, FISHING.waitMax), () => this.bite());
  }

  bite() {
    if (this.state !== 'waiting') return;
    this.clearAsync();
    this.state = 'bite';
    this.hooked = rollFish(this.lastBait);
    ui.setStatus(STATE_HINT.bite);
    audio.play('bite');
    // 提示泡泡出現在角色頭上
    const s = this.anchor;
    this.bubble.setPosition(s.x + 6, s.y - 118).setVisible(true).setScale(0.4).setAlpha(1);
    this.addTween({ targets: this.bubble, scale: 1, duration: 200, ease: 'Back.easeOut' });
    // 浮標下沉 + 少量水花
    this.bobber.y = this.target.y + 8;
    this.addTween({ targets: this.bobber, y: this.target.y + 18, alpha: 0.5, duration: 140, yoyo: true, repeat: -1 });
    this.ripple(this.target.x, this.target.y + 4, true);
    this.droplets(this.target.x, this.target.y, 8);
    const ring = this.time.addEvent({ delay: 300, loop: true, callback: () => this.ripple(this.target.x, this.target.y + 4, true) });
    this.timers.push(ring);
    this.addTimer(V.biteWindow, () => this.lose('魚跑掉了…'));
  }

  startReeling() {
    this.clearAsync();
    this.state = 'reeling';
    this.bubble.setVisible(false);
    const tier = FISH_TIERS[this.hooked.fish.tier];
    const easy = save.data.settings.easy;
    this.rhythm = {
      center: tier.center,
      good: Math.min(0.9, tier.good * (easy ? EASY_MODE.zoneScale : 1)),
      perfect: Math.min(0.5, tier.perfect * (easy ? EASY_MODE.zoneScale : 1)),
      periodMs: tier.period * 1000 * (easy ? EASY_MODE.periodScale : 1),
      phase: 0,
      pos: 0,
      progress: 20,
      tension: 10,
      lastHitAt: -9999,
      hitThisCycle: false,
      cycle: 0,
      elapsed: 0,
    };
    this.fishLabel.setText(`${tier.label}的魚上鉤了${easy ? '・輕鬆模式' : ''}`);
    this.drawZones();
    this.drawMeters();
    this.drawPointer();
    this.keyCap.setText(touch.pick('SPACE', '收線'));
    this.rhythmUI.setVisible(true);
    this.addTween({ targets: this.bobber, y: this.target.y + 10, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    ui.setStatus(null); // 判定面板內已有「Space」提示，不重複顯示
  }

  onSpace() {
    if (this.pause.blur) {
      this.setPause('blur', false);
      return;
    }
    if (this.isPaused()) return;
    if (this.state === 'bite') this.startReeling();
    else if (this.state === 'waiting') this.lose('太早拉竿，魚被嚇跑了…');
    else if (this.state === 'reeling') this.judge();
  }

  judge() {
    const r = this.rhythm;
    // 冷卻：避免連打取巧
    if (r.elapsed - r.lastHitAt < V.hitCooldown) return;
    r.lastHitAt = r.elapsed;
    r.hitThisCycle = true;
    const d = Math.abs(r.pos - r.center);
    let kind = 'miss';
    if (d <= r.perfect / 2) kind = 'perfect';
    else if (d <= r.good / 2) kind = 'good';
    const sc = V.scoring[kind];
    r.progress = Phaser.Math.Clamp(r.progress + sc.progress, 0, 100);
    r.tension = Phaser.Math.Clamp(r.tension + sc.tension, 0, 100);
    audio.play(kind);
    const text = { perfect: 'PERFECT！', good: 'GOOD', miss: 'MISS' }[kind];
    const color = { perfect: '#815a24', good: '#c9ef9a', miss: '#ff9b8f' }[kind];
    this.judgeText.setText(text).setColor(color).setPosition(this.target.x, this.target.y - 64).setScale(kind === 'miss' ? 1 : 1.25).setAlpha(1);
    this.tweens.killTweensOf(this.judgeText);
    this.tweens.add({ targets: this.judgeText, scale: 1, y: this.target.y - 76, duration: 220 });
    this.tweens.add({ targets: this.judgeText, alpha: 0, delay: 650, duration: 300 });
    if (kind !== 'miss') {
      this.ripple(this.target.x, this.target.y + 4, kind === 'perfect');
      if (kind === 'perfect') this.droplets(this.target.x, this.target.y, 4);
    } else this.cameras.main.shake(120, 0.003);
    this.drawMeters();
    this.checkEnd();
  }

  checkEnd() {
    const r = this.rhythm;
    if (r.progress >= 100) this.success();
    else if (r.tension >= 100) this.lose('魚線太緊，魚掙脫了…');
  }

  reelIn() {
    const from = { x: this.bobber.x, y: this.bobber.y };
    const prog = { t: 0 };
    this.bobber.setAlpha(1);
    this.addTween({
      targets: prog, t: 1, duration: 450, ease: 'Sine.easeIn',
      onUpdate: () => {
        const tip = this.rodTip();
        this.bobber.setPosition(Phaser.Math.Linear(from.x, tip.x, prog.t), Phaser.Math.Linear(from.y, tip.y, prog.t) - Math.sin(prog.t * Math.PI) * 30);
      },
      onComplete: () => this.bobber.setVisible(false),
    });
  }

  success() {
    this.clearAsync();
    this.state = 'result';
    this.rhythmUI.setVisible(false);
    ui.setStatus(null);
    audio.play('success');
    this.ripple(this.target.x, this.target.y, true);
    this.droplets(this.target.x, this.target.y, 10);
    this.reelIn();

    const { fish, size } = this.hooked;
    const res = save.recordFish(fish.id, size);
    const tier = FISH_TIERS[fish.tier];
    const body = ui.el('div', 'reward');
    body.append(ui.img(fish.texture, fish.name), ui.el('div', 'reward-name', fish.name));
    const badges = ui.el('div', 'badges');
    badges.append(ui.el('span', `badge${fish.tier === 'rare' ? ' rare' : ''}`, tier.label));
    if (res.isNewSpecies) badges.append(ui.el('span', 'badge new', '新發現！'));
    else if (res.isRecord) badges.append(ui.el('span', 'badge new', '新紀錄！'));
    body.append(
      badges,
      ui.el('p', 'reward-size', `尺寸 ${size} cm`),
      ui.el('p', '', fish.description),
      ui.el('p', 'hint', `已加入背包與圖鑑（累計捕獲 ${res.count} 條）`),
    );
    ui.openModal({
      title: '釣到魚了！',
      body,
      buttons: [{ label: '繼續釣魚', primary: true }],
      returnFocus: 'game',
      onClose: () => {
        if (this.sys.isActive() && this.state === 'result') this.toSelect();
      },
    });
  }

  lose(message) {
    this.clearAsync();
    this.state = 'lost';
    this.bubble.setVisible(false);
    this.rhythmUI.setVisible(false);
    if (this.bobber.visible) this.reelIn();
    audio.play('fail');
    this.addTimer(500, () => this.toSelect(message));
    ui.setStatus(message);
  }

  standUp() {
    if (this.leaving || ui.isModalOpen()) return;
    this.leaving = true;
    this.pause = { blur: false, modal: false };
    this.applyPause();
    this.clearAsync();
    this.state = 'idle';
    this.bobber.setVisible(false);
    this.bubble.setVisible(false);
    this.rhythmUI.setVisible(false);
    this.baitPanel.setVisible(false);
    ui.setStatus(null);
    ui.setActivity(null);
    this.scene.stop();
    bus.emit('activity-ended');
  }

  update(time, delta) {

    if (this.state === 'reeling' && !this.isPaused()) {
      const r = this.rhythm;
      r.elapsed += delta;
      r.phase += delta / r.periodMs;
      const cycle = Math.floor(r.phase);
      if (cycle !== r.cycle) {
        // 完整來回一次都沒按：斷線風險 +5
        if (!r.hitThisCycle) {
          r.tension = Phaser.Math.Clamp(r.tension + V.scoring.idleCycleTension, 0, 100);
          this.drawMeters();
          this.checkEnd();
        }
        r.cycle = cycle;
        r.hitThisCycle = false;
      }
      const f = r.phase % 1;
      r.pos = f < 0.5 ? f * 2 : 2 - f * 2;
      if (this.state === 'reeling') this.drawPointer();
    }

    if (!this.isPaused() && (this.state === 'reeling' || this.state === 'bite')) {
      this.poseTime += delta / 1000;
      const pull = (1 + Math.sin(this.poseTime * 6)) / 2;
      this.motion.lean = -0.035 - pull * 0.045;
      this.motion.angle = -53 - pull * 10;
      this.motion.bend = 7 + pull * 9;
    }
    this.updateGrip();
    const end = this.rodTip();
    const grip = this.hand;
    const z = this.town.cameras.main.zoom;
    const midX = grip.x + (end.x - grip.x) * 0.60;
    const midY = grip.y + (end.y - grip.y) * 0.60 - this.motion.bend * z * 0.4;
    const rod = this.rod.clear();
    rod.lineStyle(3.6 * z, 0x765235).lineBetween(grip.x, grip.y, midX, midY);
    rod.lineStyle(1.8 * z, 0x9c794e).lineBetween(midX, midY, end.x, end.y);
    this.line.clear();
    if (!this.bobber.visible) return;
    const tip = this.rodTip();
    const b = this.bobber;
    const sag = this.state === 'reeling' || this.state === 'bite' ? 6 : 40;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(tip.x, tip.y),
      new Phaser.Math.Vector2((tip.x + b.x) / 2 + 20, (tip.y + b.y) / 2 + sag),
      new Phaser.Math.Vector2(b.x, b.y - b.displayHeight * 0.7),
    );
    this.line.lineStyle(1.6, 0xfdf7ea, 0.9);
    curve.draw(this.line, 24);
  }
}
