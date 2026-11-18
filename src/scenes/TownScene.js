import Phaser from 'phaser';
import { MAP, FISHING_SPOTS, GARDEN as GARDEN_BOX } from '../config/map.js';
import { createNight } from '../world/night.js';
import { PLAYER, CAMERA, FONT } from '../config/gameConfig.js';
import { SHEETS, TEX_SCALE } from '../config/assets.js';
import { save } from '../core/save.js';
import { store, bus } from '../core/store.js';
import { ui } from '../core/ui.js';
import { audio } from '../core/audio.js';
import { touch } from '../core/touch.js';
import { loading } from '../core/loading.js';
import { buildVillage, startFallingLeaves } from '../world/village.js';
import { Garden, plotState } from '../world/garden.js';
import { Cat } from '../world/cat.js';
import { buildColliders, isBoxBlocked } from '../systems/collision.js';
import { openBusStop, openShop, openTeaHouse, openNoticeBoard, openVillageMap } from '../ui/panels.js';
import { idleFrame } from './BootScene.js';

const FACINGS = ['down', 'up', 'left', 'right'];
const LAMP_RAMP_MS = 150000; // 暖燈在約 2.5 分鐘內逐漸亮起
const PLOT_LABEL = { empty: '播種', planted: '澆水', growing: '看看作物', ripe: '採收' };

export class TownScene extends Phaser.Scene {
  constructor() {
    super('Town');
  }

  create() {
    store.mode = 'explore';
    ui.setActivity(null);
    this.activeTime = 0;
    this.lockUntil = 0;
    this.returnPoint = null;
    this.sitting = null;
    const { width: W, height: H } = MAP.world;

    const village = buildVillage(this, MAP);
    this.colliders = buildColliders(MAP, village.solids);
    this.glows = village.glows;
    this.occluders = village.occluders;
    this.nearLabels = village.nearLabels;

    // 主角
    let start = MAP.spawn;
    const saved = save.data.player;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && !isBoxBlocked(this.colliders, saved.x, saved.y, PLAYER.hitbox)) start = saved;
    this.facing = FACINGS.includes(start.facing) ? start.facing : 'down';
    this.feet = { x: start.x, y: start.y };
    // 腳底陰影（柔和橢圓）
    this.footShadow = this.add.ellipse(start.x, start.y, 40, 12, 0x2c2a14, 0.26);
    this.player = this.add.sprite(start.x, start.y, 'player', idleFrame(this.facing))
      .setOrigin(0.5, SHEETS.player.footY / SHEETS.player.frameHeight)
      .setScale(PLAYER.scale / TEX_SCALE);
    // 被樹冠、屋頂完全遮住時的低調輪廓
    this.silhouette = this.add.sprite(start.x, start.y, 'player', idleFrame(this.facing))
      .setOrigin(0.5, SHEETS.player.footY / SHEETS.player.frameHeight)
      .setScale(PLAYER.scale / TEX_SCALE).setTintFill(0x5a3e2c).setAlpha(0).setDepth(8500);
    this.walking = false;
    this.syncPlayerSprite();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setZoom(CAMERA.zoom);
    cam.startFollow(this.player, false, CAMERA.lerp, CAMERA.lerp);
    cam.centerOn(this.feet.x, this.feet.y);

    this.garden = new Garden(this);
    this.cat = new Cat(this, MAP, this.colliders);
    this.prompt = this.createPrompt();
    startFallingLeaves(this, village.leafSources);
    this.createWarmLight();
    this.createNightLayer();
    this.debugGfx = this.add.graphics().setDepth(9700);
    this.drawDebug();

    // 輸入
    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D', up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT', e: 'E', b: 'B', esc: 'ESC',
    });
    this.input.keyboard.on('keydown-E', this.onInteractKey, this);
    this.input.keyboard.on('keydown-B', this.onBagKey, this);
    this.input.keyboard.on('keydown-M', this.onMapKey, this);
    this.input.keyboard.on('keydown-N', (e) => {
      if (!e.repeat && store.mode === 'explore' && !ui.isModalOpen()) ui.toggleNight();
    });
    this.input.keyboard.on('keydown-ESC', this.onEscKey, this);
    this.input.keyboard.on('keydown-F2', (e) => {
      e.preventDefault?.();
      store.debug = !store.debug;
      bus.emit('debug-changed');
    });

    // 事件
    const onModalOpen = () => {
      this.input.keyboard.resetKeys();
      this.setWalking(false);
    };
    const onActivityEnded = () => {
      this.cameras.main.startFollow(this.player, false, CAMERA.lerp, CAMERA.lerp);
      store.mode = 'explore';
      ui.setActivity(null);
      this.input.keyboard.resetKeys();
      this.lockInput(250);
      ui.updateWallet();
      audio.setAmbience('town');
    };
    const onReset = () => this.onProgressReset();
    const onMap = () => this.openMap();
    const onDebug = () => this.drawDebug();
    const onTime = () => this.applyTimeOfDay();
    bus.on('time-changed', onTime);
    this.events.once('shutdown', () => bus.off('time-changed', onTime));
    bus.on('modal-open', onModalOpen);
    bus.on('activity-ended', onActivityEnded);
    bus.on('progress-reset', onReset);
    bus.on('open-map', onMap);
    bus.on('debug-changed', onDebug);
    this.events.on('wake', this.onWake, this);

    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.savePosition() });
    const onUnload = () => this.savePosition();
    const onBlur = () => {
      this.input.keyboard.resetKeys();
      this.setWalking(false);
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    this.events.once('shutdown', () => {
      bus.off('modal-open', onModalOpen);
      bus.off('activity-ended', onActivityEnded);
      bus.off('progress-reset', onReset);
      bus.off('open-map', onMap);
      bus.off('debug-changed', onDebug);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      ui.setPhotoSeat(false);
      this.garden.destroy();
    });

    audio.setAmbience('town');
    cam.fadeIn(500, 0, 0, 0);
    // 小鎮畫好第一格後，封面載入畫面淡出
    this.events.once('postupdate', () => loading.hide());
    // 首次進入：歡迎教學（只自動出現一次）
    this.time.delayedCall(450, () => this.showWelcome());
  }

  showWelcome() {
    if (store.mode === 'explore' && !ui.isModalOpen()) ui.showTutorialOnce('basic');
  }

  // ---------- 氣氛：夕陽暖光、路燈逐漸亮起 ----------
  createWarmLight() {
    const key = 'warm-light';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 320, 180);
      g.addColorStop(0, 'rgba(255,200,130,0.14)');
      g.addColorStop(0.6, 'rgba(255,180,110,0.04)');
      g.addColorStop(1, 'rgba(120,70,40,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 320, 180);
      const v = ctx.createRadialGradient(160, 90, 70, 160, 90, 200);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(60,35,15,0.13)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 320, 180);
      this.textures.addCanvas(key, c);
    }
    // 不受鏡頭縮放影響：以畫面尺寸除以縮放倍率
    this.warmLight = this.add.image(640, 360, key).setScrollFactor(0).setDepth(9400);
    this.fitWarmLight();
  }

  fitWarmLight() {
    const z = this.cameras.main.zoom || 1;
    if (this.warmLight.zoomFor === z) return;
    this.warmLight.zoomFor = z;
    this.warmLight.setDisplaySize(1280 / z + 4, 720 / z + 4);
  }

  // ---------- 白天／夜晚 ----------
  createNightLayer() {
    const lights = [];
    for (const o of MAP.objects) {
      if (o.glow) lights.push({ x: o.x, y: o.y + o.glow.dy, scale: 2.4 });
      if (o.eave) lights.push({ x: o.x, y: o.y - 70, scale: 3.2 }); // 建築門窗透出的燈光
    }
    this.night = createNight(this, {
      depth: 9300,
      lights,
      fireflies: [
        { x: 600, y: 1280, w: 1500, h: 80, n: 10 }, // 河岸步道
        { x: 760, y: 1000, w: 500, h: 140, n: 5 }, // 大樹廣場
        { x: GARDEN_BOX.x1, y: GARDEN_BOX.y1 + 40, w: GARDEN_BOX.x2 - GARDEN_BOX.x1, h: 200, n: 5 }, // 菜園
        { x: 200, y: 1700, w: 2000, h: 100, n: 8 }, // 對岸
      ],
    });
    this.applyTimeOfDay(true);
  }

  applyTimeOfDay(instant = false) {
    const night = !!save.data.settings.night;
    this.night.set(night, instant);
    this.tweens.killTweensOf(this.warmLight);
    if (instant) this.warmLight.setAlpha(night ? 0.35 : 1);
    else this.tweens.add({ targets: this.warmLight, alpha: night ? 0.35 : 1, duration: 800 });
  }

  updateLamps() {
    const t = Math.min(1, this.activeTime / LAMP_RAMP_MS);
    const pulse = 0.05 * Math.sin(this.activeTime / 900);
    for (const g of this.glows) g.setAlpha(0.18 + t * 0.5 + pulse);
  }

  // ---------- 主迴圈 ----------
  update(time, delta) {
    this.activeTime += delta;
    const canMove = store.mode === 'explore' && !ui.isModalOpen() && !this.sitting;
    let moving = false;
    if (canMove) moving = this.handleMovement(Math.min(delta, 50) / 1000);
    this.setWalking(moving);
    this.syncPlayerSprite();
    this.cat.update(Math.min(delta, 50), this.cameras.main.worldView);
    this.updateLamps();
    this.fitWarmLight();
    this.night.update(time);
    this.updateOcclusion();
    this.updateNearLabels();
    this.garden.updateNear(this.feet);
    this.updatePrompt(canMove);
    if (canMove) this.checkTutorialZones();
    if (store.debug) this.drawDebugPlayer();
  }

  handleMovement(dt) {
    const k = this.keys;
    let vx = (k.right.isDown || k.right2.isDown ? 1 : 0) - (k.left.isDown || k.left2.isDown ? 1 : 0);
    let vy = (k.down.isDown || k.down2.isDown ? 1 : 0) - (k.up.isDown || k.up2.isDown ? 1 : 0);
    let speedScale = 1;
    if (!vx && !vy) {
      // 手機虛擬搖桿：8 方向，推得越遠走得越快（輕推約 4 成速度）
      const t = touch.vector();
      if (t.mag > 0) {
        vx = t.x;
        vy = t.y;
        speedScale = Math.min(1, 0.4 + t.mag * 0.85);
      }
    }
    if (!vx && !vy) return false;
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;
    const step = PLAYER.speed * dt * speedScale;
    const f = this.feet;
    const nx = f.x + vx * step;
    if (!isBoxBlocked(this.colliders, nx, f.y, PLAYER.hitbox)) f.x = nx;
    const ny = f.y + vy * step;
    if (!isBoxBlocked(this.colliders, f.x, ny, PLAYER.hitbox)) f.y = ny;
    else if (vy && !vx) this.slideAround(0, ny, step, 'x');
    if (vx && !vy && nx !== f.x && isBoxBlocked(this.colliders, nx, f.y, PLAYER.hitbox)) this.slideAround(nx, 0, step, 'y');

    const dirs = [];
    if (vx < 0) dirs.push('left');
    if (vx > 0) dirs.push('right');
    if (vy < 0) dirs.push('up');
    if (vy > 0) dirs.push('down');
    if (!dirs.includes(this.facing)) this.setFacing(dirs[0]);
    return true;
  }

  /** 轉角輔助：直走被擋住時，若旁邊 24px 內有空隙（石階、門口、橋頭），自動往空隙方向微調 */
  slideAround(nx, ny, step, axis) {
    const f = this.feet;
    for (let d = 2; d <= 24; d += 2) {
      for (const s of [-1, 1]) {
        const tx = axis === 'x' ? f.x + s * d : nx;
        const ty = axis === 'y' ? f.y + s * d : ny;
        if (!isBoxBlocked(this.colliders, tx, ty, PLAYER.hitbox)) {
          const mx = axis === 'x' ? f.x + s * Math.min(step, d) : f.x;
          const my = axis === 'y' ? f.y + s * Math.min(step, d) : f.y;
          if (!isBoxBlocked(this.colliders, mx, my, PLAYER.hitbox)) {
            f.x = mx;
            f.y = my;
          }
          return;
        }
      }
    }
  }

  setFacing(dir) {
    this.facing = dir;
    if (this.walking) this.player.anims.play(`walk-${dir}`, true);
    else this.player.anims.stop().setFrame(idleFrame(dir));
  }

  setWalking(on) {
    if (on === this.walking) return;
    this.walking = on;
    if (on) this.player.anims.play(`walk-${this.facing}`, true);
    else this.player.anims.stop().setFrame(idleFrame(this.facing));
  }

  syncPlayerSprite() {
    this.player.setPosition(this.feet.x, this.feet.y);
    this.player.setDepth(this.feet.y + (this.sitting ? 8 : 0));
    this.footShadow.setPosition(this.feet.x + 2, this.feet.y - 1).setDepth(this.player.depth - 0.5).setVisible(!this.sitting);
    this.silhouette.setPosition(this.player.x, this.player.y).setFrame(this.player.frame.name);
  }

  /**
   * 遮擋處理：主角走到樹冠或屋頂後方時，遮住主角的物件局部淡化；
   * 若主角大部分被遮住，再顯示低調的角色輪廓。
   */
  updateOcclusion() {
    const p = this.player;
    const body = new Phaser.Geom.Rectangle(p.x - p.displayWidth * 0.3, p.y - p.displayHeight * 0.95, p.displayWidth * 0.6, p.displayHeight * 0.9);
    let covered = false;
    for (const { obj, img, extras } of this.occluders) {
      let target = 1;
      if (img.depth > p.depth && obj.y - this.feet.y < 420) {
        const b = img.getBounds();
        if (Phaser.Geom.Rectangle.Overlaps(b, body)) {
          const inter = Phaser.Geom.Rectangle.Intersection(b, body);
          const ratio = (inter.width * inter.height) / (body.width * body.height);
          if (ratio > 0.25) {
            target = 0.5;
            if (ratio > 0.7) covered = true;
          }
        }
      }
      if (Math.abs(img.alpha - target) > 0.01) {
        img.setAlpha(img.alpha + (target - img.alpha) * 0.18);
        if (extras) for (const e of extras) e.setAlpha(img.alpha);
      }
    }
    const sTarget = covered ? 0.35 : 0;
    this.silhouette.setAlpha(this.silhouette.alpha + (sTarget - this.silhouette.alpha) * 0.2);
  }

  /** 地點標籤：靠近才淡入 */
  updateNearLabels() {
    for (const l of this.nearLabels) {
      const d = Math.hypot(this.feet.x - l.x, this.feet.y - l.y);
      const target = d < l.radius ? 1 : 0;
      if (Math.abs(l.text.alpha - target) > 0.01) l.text.setAlpha(l.text.alpha + (target - l.text.alpha) * 0.15);
    }
  }

  checkTutorialZones() {
    if (ui.isModalOpen() || this.inputLocked()) return;
    for (const z of MAP.tutorialZones) {
      if (this.feet.x > z.x && this.feet.x < z.x + z.w && this.feet.y > z.y && this.feet.y < z.y + z.h) {
        if (ui.showTutorialOnce(z.id)) {
          this.setWalking(false);
          return;
        }
      }
    }
  }

  // 輸入鎖：以小鎮實際運作的時間計算（睡眠期間不累計）
  lockInput(ms) {
    this.lockUntil = this.activeTime + ms;
  }

  inputLocked() {
    return ui.isModalOpen() || this.activeTime < this.lockUntil;
  }

  // ---------- 互動提示：「E ○○」 ----------
  createPrompt() {
    const c = this.add.container(0, 0).setDepth(9500).setVisible(false);
    const bg = this.add.graphics();
    const key = this.add.text(0, 0, 'E', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#4a3426', resolution: 2 }).setOrigin(0.5);
    const label = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#fff8ea', resolution: 2 }).setOrigin(0, 0.5);
    c.add([bg, key, label]);
    c.setLabel = (text) => {
      // 觸控模式不畫「E」鍵帽（改由右下「互動」按鈕顯示同樣文字）
      const showKey = !touch.enabled;
      const sig = `${showKey ? 'k' : 't'}|${text}`;
      if (c.currentText === sig) return;
      c.currentText = sig;
      label.setText(text);
      key.setVisible(showKey);
      const pad = showKey ? 32 : 14;
      const w = pad + label.width + 14;
      bg.clear();
      bg.fillStyle(0x4a3426, 0.88);
      bg.fillRoundedRect(-w / 2, -14, w, 28, 14);
      if (showKey) {
        bg.fillStyle(0xf6d58c, 1);
        bg.fillRoundedRect(-w / 2 + 5, -10, 20, 20, 6);
      }
      key.setPosition(-w / 2 + 15, 0);
      label.setPosition(-w / 2 + pad, 0);
    };
    return c;
  }

  findInteractable() {
    const f = this.feet;
    let best = null;
    let bestD = Infinity;
    for (const it of MAP.interactables) {
      const d = Phaser.Math.Distance.Between(f.x, f.y, it.x, it.y);
      if (it.bankZone && Math.abs(f.y - it.y) > 20) continue;
      if (d <= it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    // 貓咪是會移動的互動對象
    const cd = Phaser.Math.Distance.Between(f.x, f.y, this.cat.x, this.cat.y);
    if (cd <= 60 && cd < bestD) best = { id: 'cat', label: '摸摸貓咪', action: 'cat' };
    return best;
  }

  promptY() {
    return this.player.y - this.player.displayHeight - 16;
  }

  updatePrompt(canShow) {
    if (this.sitting?.photoSeat) {
      this.prompt.setVisible(false);
      return;
    }
    if (this.sitting && !ui.isModalOpen()) {
      this.prompt.setLabel(touch.pick('起身（E／Esc）', '休息中'));
      this.prompt.setPosition(this.player.x, this.promptY()).setVisible(true);
      return;
    }
    this.current = canShow && !this.inputLocked() ? this.findInteractable() : null;
    if (!this.current) {
      this.promptLabel = null;
      this.prompt.setVisible(false);
      return;
    }
    let label = this.current.label;
    if (this.current.action === 'plot') label = PLOT_LABEL[plotState(save.data.garden.plots[this.current.plot])] || '菜園';
    this.promptLabel = label; // 觸控「互動」按鈕顯示同樣文字
    this.prompt.setLabel(label);
    this.prompt.setPosition(this.player.x, this.promptY()).setVisible(true);
  }

  // ---------- 按鍵 ----------
  onInteractKey(event) {
    if (event?.repeat || this.inputLocked()) return;
    if (this.sitting) {
      this.standUp();
      return;
    }
    if (store.mode !== 'explore') return;
    const it = this.findInteractable();
    if (!it) return;
    this.lockInput(250);
    this.setWalking(false);
    switch (it.action) {
      case 'fishing': this.enterFishing(it.id === 'fish-farbank' ? 'farBank' : 'embankment'); break;
      case 'claw': this.enterClaw(); break;
      case 'museum': this.leaveTo('Museum', 'museum', { ...MAP.museumExit }); break;
      case 'bus': openBusStop(); break;
      case 'shop': openShop(); break;
      case 'tea': openTeaHouse(); break;
      case 'notice': openNoticeBoard(); break;
      case 'map': this.openMap(); break;
      case 'plot':
        // 第一次使用菜園：先看教學，不直接執行動作
        if (!ui.showTutorialOnce('garden')) this.garden.interact(it.plot);
        break;
      case 'cat': this.cat.interact(); break;
      case 'sit': this.sitDown(it); break;
      default: break;
    }
  }

  onEscKey(event) {
    if (event?.repeat || ui.isModalOpen()) return;
    if (this.sitting) this.standUp();
  }

  onBagKey(event) {
    if (event?.repeat || this.inputLocked()) return;
    if (store.mode === 'explore' && !this.sitting) ui.openInventory();
  }

  onMapKey(event) {
    if (event?.repeat || this.inputLocked()) return;
    if (store.mode === 'explore') this.openMap();
  }

  openMap() {
    if (store.mode !== 'explore') return;
    this.setWalking(false);
    openVillageMap(this, this.feet);
  }

  // ---------- 長椅坐下 ----------
  sitDown(it) {
    this.sitting = { photoSeat: !!it.photoSeat, back: { x: this.feet.x, y: this.feet.y, facing: this.facing } };
    this.feet.x = it.seat.x;
    this.feet.y = it.seat.y;
    this.facing = 'down';
    for (const sprite of [this.player, this.silhouette]) sprite.setTexture('player_bench');
    this.syncPlayerSprite();
    if (it.photoSeat) {
      ui.setPhotoSeat(true);
      ui.toast(touch.pick('按 E 或 Esc 起身', '輕觸畫面起身'), 1800);
    } else {
      ui.setStatus(touch.pick('坐在長椅上休息中…　E 或 Esc 起身', '坐在長椅上休息中…　按「起身」離開'));
    }
  }

  standUp() {
    const b = this.sitting.back;
    if (this.sitting.photoSeat) ui.setPhotoSeat(false);
    this.sitting = null;
    this.feet.x = b.x;
    this.feet.y = b.y;
    for (const sprite of [this.player, this.silhouette]) sprite.setTexture('player', idleFrame(b.facing));
    this.setFacing(b.facing);
    this.syncPlayerSprite();
    ui.setStatus(null);
    this.lockInput(250);
  }

  // ---------- 場景切換 ----------
  enterClaw() {
    store.mode = 'claw';
    this.prompt.setVisible(false);
    this.scene.launch('Claw');
  }

  leaveTo(sceneKey, mode, returnPoint, data) {
    store.mode = mode;
    this.setWalking(false);
    this.prompt.setVisible(false);
    this.returnPoint = returnPoint;
    this.savePosition();
    this.cameras.main.fadeOut(320, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.launch(sceneKey, data);
      this.scene.sleep();
    });
  }

  enterFishing(spot) {
    store.mode = 'fishing';
    this.setWalking(false);
    this.setFacing(spot === 'farBank' ? 'up' : 'down');
    this.syncPlayerSprite();
    this.prompt.setVisible(false);
    this.cameras.main.stopFollow();
    this.scene.launch('Fishing', { spot });
  }

  onWake() {
    const r = this.returnPoint || MAP.spawn;
    this.returnPoint = null;
    this.feet.x = r.x;
    this.feet.y = r.y;
    this.input.keyboard.resetKeys();
    this.walking = false;
    this.facing = r.facing || 'down';
    this.player.anims.stop().setFrame(idleFrame(this.facing));
    this.syncPlayerSprite();
    this.cameras.main.centerOn(r.x, r.y);
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    store.mode = 'explore';
    ui.setActivity(null);
    this.lockInput(300); // 避免同一次按鍵立刻再次觸發互動
    ui.updateWallet();
    audio.setAmbience('town');
    this.savePosition();
  }

  onProgressReset() {
    if (this.sitting) this.standUp();
    const s = MAP.spawn;
    this.feet.x = s.x;
    this.feet.y = s.y;
    this.walking = false;
    this.facing = s.facing;
    this.player.anims.stop().setFrame(idleFrame(s.facing));
    this.syncPlayerSprite();
    this.cameras.main.centerOn(s.x, s.y);
    this.garden.refresh();
    this.savePosition();
    this.time.delayedCall(300, () => this.showWelcome());
  }

  savePosition() {
    if (!this.feet || this.sitting) return;
    save.setPlayer(this.feet.x, this.feet.y, this.facing);
  }

  // ---------- 除錯：碰撞／通行區顯示（F2 或設定切換；預設隱藏） ----------
  drawDebug() {
    const g = this.debugGfx;
    g.clear();
    g.setVisible(!!store.debug);
    if (!store.debug) {
      this.debugText?.setVisible(false);
      this.debugPlayer?.clear();
      return;
    }
    const c = this.colliders;
    g.fillStyle(0xe0524f, 0.22);
    for (const r of c.terrain) g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(0x6fd06f, 0.3);
    for (const r of c.walkables) g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(0xf0a030, 0.45);
    for (const r of c.solids) g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(2, 0x4a7fd0, 0.8);
    for (const it of MAP.interactables) g.strokeCircle(it.x, it.y, it.radius);
    g.lineStyle(2, 0xffffff, 0.6);
    for (const t of Object.values(MAP.tiers)) g.lineBetween(t.wallX[0], t.edge, t.wallX[1], t.edge);
    g.lineStyle(2, 0xc070e0, 0.8);
    for (const z of MAP.tutorialZones) g.strokeRect(z.x, z.y, z.w, z.h);
    if (!this.debugText) {
      this.debugText = this.add.text(8, 8, '', { fontFamily: FONT, fontSize: '13px', color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 6, y: 3 }, resolution: 2 })
        .setScrollFactor(0).setDepth(9800);
    }
  }

  drawDebugPlayer() {
    const g = this.debugGfx;
    if (!g.visible) return;
    if (!this.debugPlayer) this.debugPlayer = this.add.graphics().setDepth(9701);
    const p = this.debugPlayer;
    p.clear();
    p.lineStyle(2, 0xffffff, 1).strokeRect(this.feet.x - PLAYER.hitbox.w / 2, this.feet.y - PLAYER.hitbox.h, PLAYER.hitbox.w, PLAYER.hitbox.h);
    const tier = Object.entries(MAP.tiers).find(([, t]) => this.feet.y <= t.edge + t.face && this.feet.y >= t.top - 10);
    this.debugText.setVisible(true).setText(`F2 除錯　x ${Math.round(this.feet.x)}  y ${Math.round(this.feet.y)}　層：${tier ? tier[1].name : '其他'}　紅=地形 綠=通行 橘=實體`);
  }
}

export { FISHING_SPOTS };
