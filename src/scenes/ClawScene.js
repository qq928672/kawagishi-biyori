import Phaser from 'phaser';
import { CLAW, FONT } from '../config/gameConfig.js';
import { MACHINE_PLUSHIES } from '../config/collectibles.js';
import { CLAW_COST_TOKENS, SHOP_BUY } from '../config/economy.js';
import { CLAW_VIEW as CV } from '../config/clawView.js';
import { save } from '../core/save.js';
import { store, bus } from '../core/store.js';
import { ui } from '../core/ui.js';
import { audio } from '../core/audio.js';
import { touch } from '../core/touch.js';

// 古早味（昭和風）夾娃娃機操作畫面，疊在小鎮之上
// 分層：機台（含內部背板）→ 出獎口 → 玩偶 → 吊線與爪子 → 前框（中間透明）→ 介面
// 座標：src(x, y) 以「機台原圖像素」描述機台內部位置（config/clawView.js），換算成畫面座標。
// 抓取：落爪後，爪子與玩偶中心距離 ≤ hold 一定抓穩；≤ grab 抓得起來，但提升時可能滑落（越偏越容易滑）。
// 發獎：玩偶確實落入出獎口、從下方取物口出現後才加入收藏（不會憑空發獎、不會重複領取）。
// 費用：每次落爪扣 1 枚代幣（按下空白鍵、扣款成功才開始動作）；動作中不能離開。

const k = CV.displayHeight / CV.cabinet.h; // 原圖像素 → 畫面像素
const CAB_X = 640 - (CV.cabinet.w * k) / 2;
const CAB_Y = CV.top;
const src = (x, y) => ({ x: CAB_X + x * k, y: CAB_Y + y * k });
const L = {
  railY: src(0, CV.railY).y,
  restY: src(0, CV.clawRestY).y,
  dropY: src(0, CV.clawDropY).y,
  floorY: src(0, CV.floorY).y,
  clawMin: src(CV.clawX[0], 0).x,
  clawMax: src(CV.clawX[1], 0).x,
  plushMin: src(CV.plushX[0], 0).x,
  plushMax: src(CV.plushX[1], 0).x,
  chuteX: src(CV.chute.x, 0).x,
  chuteY: src(0, CV.chute.y).y,
  doorX: src(CV.prizeDoor.x, 0).x,
  doorY: src(0, CV.prizeDoor.y).y,
  railX1: src(CV.railX[0], 0).x,
  railX2: src(CV.railX[1], 0).x,
};

export class ClawScene extends Phaser.Scene {
  constructor() {
    super('Claw');
  }

  create() {
    store.mode = 'claw';
    ui.setStatus(null);
    this.state = 'idle';
    this.held = null;
    this.exiting = false;

    // 背景遮罩（擋住點擊穿透到小鎮）
    this.add.rectangle(640, 360, 1280, 720, 0x1c1410, 0.66).setInteractive();
    // 機台落地陰影
    this.add.ellipse(640, CAB_Y + CV.displayHeight - 4, CV.cabinet.w * k * 0.95, 26, 0x000000, 0.35);
    this.add.image(CAB_X, CAB_Y, 'retro_cabinet').setOrigin(0, 0).setDisplaySize(CV.cabinet.w * k, CV.cabinet.h * k).setDepth(0);
    // 招牌燈：暖黃微光呼吸
    const sign = src(CV.signLight.x, CV.signLight.y);
    const glow = this.add.image(sign.x, sign.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(CV.signLight.w * k * 1.3, CV.signLight.h * k * 3).setAlpha(0.35).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 機台內部：出獎口（左下）
    this.chute = this.add.image(L.chuteX, L.chuteY, 'retro_chute').setOrigin(0.5, 1).setDepth(8);
    this.chute.setScale((CV.chute.w * k) / this.chute.width);

    this.plushLayer = this.add.layer().setDepth(10);
    this.slots = [0, 1, 2].map(() => this.makePlush());
    this.layoutPlushes(this.slots);

    this.rope = this.add.graphics().setDepth(14);
    this.guide = this.add.graphics().setDepth(9);
    this.claw = this.add.image(L.clawMin, L.restY, 'retro_claw_open').setOrigin(0.5, 0).setDepth(15);
    this.setClaw('open');

    // 前框（中間透明）蓋在最上層
    const f = src(CV.frame.x, CV.frame.y);
    this.add.image(f.x, f.y, 'retro_frame').setOrigin(0, 0).setDisplaySize(CV.frame.w * k, CV.frame.h * k).setDepth(20);
    // 取物口（下方）出現玩偶用
    this.doorPlush = this.add.image(L.doorX, L.doorY, 'plush_r_bear').setOrigin(0.5, 1).setDepth(21).setVisible(false);

    this.buildInfo();

    this.keys = this.input.keyboard.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' });
    this.input.keyboard.on('keydown-SPACE', (e) => {
      if (e.repeat || ui.isModalOpen()) return;
      if (this.state === 'idle') this.tryDrop();
    });
    this.input.keyboard.on('keydown-ESC', (e) => {
      if (e.repeat || ui.isModalOpen()) return;
      this.requestExit();
    });

    // 彈窗開啟時暫停所有計時與補間（爪子停在原處），關閉後從原狀態繼續
    this.onModalOpen = () => { this.time.paused = true; this.tweens.pauseAll(); };
    this.onModalClose = () => { this.time.paused = false; this.tweens.resumeAll(); };
    bus.on('modal-open', this.onModalOpen);
    bus.on('modal-close', this.onModalClose);
    this.events.once('shutdown', () => {
      this.input.keyboard.removeAllListeners();
      bus.off('modal-open', this.onModalOpen);
      bus.off('modal-close', this.onModalClose);
      ui.setStatus(null);
    });

    ui.setActivity({
      help: 'claw',
      extra: [{ label: '收藏', onClick: () => this.openCollection() }],
      exit: { label: '← 離開 Esc', onClick: () => this.requestExit() },
    });
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.setMessage(touch.pick('對準玩偶後按空白鍵落爪', '用搖桿對準玩偶後按「落爪」'));
    ui.showTutorialOnce('claw');
  }

  makePlush() {
    const s = this.add.image(0, L.floorY, 'plush_r_bear').setOrigin(0.5, 1);
    this.plushLayer.add(s);
    return s;
  }

  randomPlushItem(exclude = []) {
    const pool = MACHINE_PLUSHIES.filter((p) => !exclude.includes(p.id));
    return Phaser.Utils.Array.GetRandom(pool.length ? pool : MACHINE_PLUSHIES);
  }

  plushHeight() {
    return CV.plushH * k;
  }

  layoutPlushes(list) {
    const others = this.slots.filter((p) => !list.includes(p) && p.visible);
    for (const p of list) {
      const item = this.randomPlushItem(others.map((o) => o.item?.id));
      p.item = item;
      p.setTexture(item.texture).setScale(this.plushHeight() / this.textures.get(item.texture).getSourceImage().height);
      let x = 0;
      for (let tries = 0; tries < 80; tries++) {
        x = Phaser.Math.Between(L.plushMin, L.plushMax);
        if (others.every((o) => Math.abs(o.x - x) >= p.displayWidth * 0.9)) break;
      }
      p.setPosition(x, L.floorY).setRotation(Phaser.Math.FloatBetween(-0.05, 0.05)).setVisible(true).setAlpha(1);
      others.push(p);
    }
  }

  setClaw(mode) {
    this.claw.setTexture(mode === 'open' ? 'retro_claw_open' : 'retro_claw_closed');
    this.claw.setScale((CV.clawH * k) / this.claw.height);
  }

  // ---------- 介面：只保留代幣、目前狀態（說明在「？」） ----------
  buildInfo() {
    const x = CAB_X + CV.cabinet.w * k + 24;
    const y = 300;
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(0x3a2a1e, 0.88).fillRoundedRect(x, y, 170, 92, 14);
    g.lineStyle(2, 0xf6d58c, 0.6).strokeRoundedRect(x, y, 170, 92, 14);
    this.tokenText = this.add.text(x + 85, y + 16, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffe9a8', resolution: 2 }).setOrigin(0.5, 0).setDepth(41);
    this.add.text(x + 85, y + 56, `每次 ${CLAW_COST_TOKENS} 枚代幣`, { fontFamily: FONT, fontSize: '13px', color: '#e8dcc6', resolution: 2 }).setOrigin(0.5, 0).setDepth(41);
    this.refreshTokens();
  }

  refreshTokens() {
    this.tokenText.setText(`◆ 代幣 ${save.tokens}`);
    ui.updateWallet();
  }

  setMessage(text) {
    ui.setStatus(text);
  }

  openCollection() {
    const body = ui.el('div', 'collection');
    body.append(ui.renderPlushGrid());
    ui.openModal({ title: '玩偶收藏', body, className: 'modal-inventory', returnFocus: 'game' });
  }

  // ---------- 主迴圈 ----------
  update(time, delta) {
    if (this.state === 'idle' && !ui.isModalOpen()) {
      const kk = this.keys;
      // 鍵盤優先；沒有按鍵時用手機搖桿（類比，推得越遠越快）
      const dir = (kk.right.isDown || kk.d.isDown ? 1 : 0) - (kk.left.isDown || kk.a.isDown ? 1 : 0) || touch.axisX();
      if (dir) this.claw.x = Phaser.Math.Clamp(this.claw.x + dir * CLAW.moveSpeed * (Math.min(delta, 50) / 1000), L.clawMin, L.clawMax);
    }
    if (this.held) {
      this.held.x = this.claw.x;
      this.held.y = this.claw.y + this.heldOffset;
    }
    // 軌道、滑車與吊線
    const r = this.rope;
    r.clear();
    r.fillStyle(0x7d7f80, 1).fillRect(L.railX1, L.railY - 4, L.railX2 - L.railX1, 6);
    r.fillStyle(0xb9b3a4, 0.6).fillRect(L.railX1, L.railY - 4, L.railX2 - L.railX1, 2);
    r.fillStyle(0x6b6d6e, 1).fillRoundedRect(this.claw.x - 13, L.railY - 8, 26, 12, 4);
    r.lineStyle(2.5, 0x55575a, 1).lineBetween(this.claw.x, L.railY + 3, this.claw.x, this.claw.y + 4);
    // 落點參考虛線
    const g = this.guide;
    g.clear();
    if (this.state === 'idle') {
      g.lineStyle(2, 0x8a4a3c, 0.35);
      for (let y = this.claw.y + this.claw.displayHeight; y < L.floorY - 4; y += 12) g.lineBetween(this.claw.x, y, this.claw.x, y + 6);
    }
  }

  // ---------- 玩法流程 ----------
  tryDrop() {
    if (!save.spendToken(CLAW_COST_TOKENS)) {
      const price = SHOP_BUY.find((s) => s.kind === 'token')?.price ?? 20;
      this.setMessage(`代幣不足！可以到雜貨店用 ${price} 金幣購買。`);
      audio.play('miss');
      return;
    }
    audio.play('insert');
    this.refreshTokens();
    this.state = 'dropping';
    this.setMessage('落爪中…');
    audio.play('claw');
    this.tweens.add({ targets: this.claw, y: L.dropY, duration: 1000, ease: 'Sine.easeIn', onComplete: () => this.grab() });
  }

  grab() {
    this.state = 'grabbing';
    const target = this.slots
      .filter((p) => p.visible && Math.abs(p.x - this.claw.x) <= CV.grabRange * k)
      .sort((a, b) => Math.abs(a.x - this.claw.x) - Math.abs(b.x - this.claw.x))[0];
    this.time.delayedCall(250, () => {
      this.setClaw('closed');
      let slip = false;
      if (target) {
        // 越接近中心越穩：hold 內一定抓穩；之外依距離提高滑落機率
        const d = Math.abs(target.x - this.claw.x) / k;
        const t = Phaser.Math.Clamp((d - CV.holdRange) / (CV.grabRange - CV.holdRange), 0, 1);
        slip = d > CV.holdRange && Math.random() < t * CV.maxSlipChance;
        this.held = target;
        this.heldOffset = this.claw.displayHeight * 0.62 + target.displayHeight * 0.55;
        this.tweens.add({ targets: target, rotation: (target.x - this.claw.x) * 0.004, duration: 150 });
      }
      this.time.delayedCall(200, () => this.rise(target, slip));
    });
  }

  rise(target, slip) {
    this.state = 'rising';
    this.setMessage(target ? '抓住了…' : '好像沒抓到…');
    audio.play('claw');
    if (target && slip) {
      // 提升到一半時滑落，掉回機台底部
      this.time.delayedCall(420, () => {
        if (this.held !== target) return;
        this.held = null;
        this.slipped = true;
        this.setClaw('open');
        this.setMessage('滑掉了！再對準一點中心試試');
        this.tweens.add({
          targets: target, y: L.floorY, rotation: Phaser.Math.FloatBetween(-0.12, 0.12), duration: 380, ease: 'Bounce.easeOut',
          onComplete: () => this.tweens.add({ targets: target, rotation: Phaser.Math.FloatBetween(-0.05, 0.05), duration: 200 }),
        });
      });
    }
    this.tweens.add({
      targets: this.claw, y: L.restY, duration: 900, ease: 'Sine.easeInOut',
      onComplete: () => {
        const success = !!this.held;
        if (!success) this.setClaw('open');
        this.tweens.add({
          targets: this.claw, x: L.clawMin, duration: Math.max(300, Math.abs(this.claw.x - L.clawMin) * 3), ease: 'Sine.easeInOut',
          onComplete: () => (success ? this.release() : this.resetRound(false)),
        });
      },
    });
  }

  release() {
    this.state = 'releasing';
    this.setClaw('open');
    const plush = this.held;
    this.held = null;
    // 玩偶落進出獎口（在出獎口位置淡出）
    this.tweens.add({
      targets: plush, y: L.chuteY - 4, duration: 420, ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.add({
          targets: plush, alpha: 0, scale: plush.scale * 0.8, duration: 200,
          onComplete: () => {
            plush.setVisible(false).setAlpha(1);
            this.dispense(plush.item);
          },
        });
      },
    });
  }

  /** 玩偶從機台下方的取物口出現，之後才發獎 */
  dispense(item) {
    const d = this.doorPlush;
    d.setTexture(item.texture).setScale((this.plushHeight() * 0.85) / this.textures.get(item.texture).getSourceImage().height).setPosition(L.doorX, L.doorY - 30).setAlpha(0).setVisible(true);
    audio.play('splash');
    this.tweens.add({
      targets: d, y: L.doorY, alpha: 1, duration: 360, ease: 'Bounce.easeOut',
      onComplete: () => this.time.delayedCall(250, () => this.win(item)),
    });
  }

  win(item) {
    // 玩偶確實落入出獎口才發獎（只執行一次）
    const n = save.recordPlush(item.id);
    audio.play('prize');
    this.refreshTokens();
    this.setMessage(`夾到了：${item.name}！`);
    const body = ui.el('div', 'reward');
    body.append(
      ui.img(item.texture, item.name),
      ui.el('div', 'reward-name', item.name),
      ui.el('p', '', item.description),
      ui.el('p', 'hint', n === 1 ? '新收藏！已加入背包與圖鑑。' : `已加入背包（共收藏 ${n} 個）`),
    );
    this.state = 'result';
    ui.openModal({
      title: '夾到了！',
      body,
      buttons: [{ label: '再玩一次', primary: true }],
      returnFocus: 'game',
      onClose: () => {
        if (!this.sys.isActive()) return;
        this.doorPlush.setVisible(false);
        const p = this.slots.find((s) => !s.visible);
        if (p) {
          this.layoutPlushes([p]);
          p.setAlpha(0);
          this.tweens.add({ targets: p, alpha: 1, duration: 300 });
        }
        this.resetRound(true);
      },
    });
  }

  resetRound(won) {
    this.setClaw('open');
    this.state = 'idle';
    const msg = won ? touch.pick('再挑戰一次吧！按空白鍵落爪', '再挑戰一次吧！按「落爪」') : this.slipped ? '滑掉了！越接近玩偶中心越容易抓穩' : '沒夾到…對準玩偶正上方再試一次';
    this.slipped = false;
    this.setMessage(msg);
  }

  requestExit() {
    if (ui.isModalOpen()) return;
    if (this.state !== 'idle') {
      this.setMessage('夾取中，請等爪子回來再離開。');
      return;
    }
    this.exit();
  }

  exit() {
    if (this.exiting) return;
    this.exiting = true;
    this.tweens.killAll();
    ui.setActivity(null);
    this.scene.stop();
    bus.emit('activity-ended');
  }
}
