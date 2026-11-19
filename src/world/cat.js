import Phaser from 'phaser';
import { FONT } from '../config/gameConfig.js';
import { SHEETS, TEX_SCALE } from '../config/assets.js';
import { CAT_LINES } from '../config/dialogue.js';
import { CAT_FRAMES } from '../scenes/BootScene.js';
import { isBoxBlocked } from '../systems/collision.js';
import { audio } from '../core/audio.js';

// 三花貓：大部分時間睡覺、趴坐或站著；偶爾在有限範圍內左右散步
// 素材只有「向右走」四格，向左以水平翻轉呈現；不做上下方向的走路。
// 不與主角碰撞（不堵路），自己則不穿過建築、圍籬與河水；走不過去就重新選點。
const HITBOX = { w: 30, h: 8 };
const SPEED = 36;

export class Cat {
  constructor(scene, map, colliders) {
    this.scene = scene;
    this.map = map;
    this.colliders = colliders;
    this.homeIndex = 0;
    const home = map.catHomes[0];
    this.sprite = scene.add.sprite(home.rest.x, home.rest.y, 'cat', CAT_FRAMES.sleep)
      .setOrigin(0.5, SHEETS.cat.footY / SHEETS.cat.frameHeight).setScale(1 / TEX_SCALE).setDepth(home.rest.y);
    this.state = 'sleep';
    this.stateUntil = 0;
    this.cooldownUntil = 0;
    this.nextRelocate = 90000;
    this.elapsed = 0;
    this.enter('sleep', 12000);
  }

  get home() {
    return this.map.catHomes[this.homeIndex];
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  enter(state, ms) {
    this.state = state;
    this.stateUntil = this.elapsed + ms;
    const s = this.sprite;
    if (state === 'walk') {
      s.anims.play('cat-walk', true);
      return;
    }
    s.anims.stop();
    const frame = {
      sleep: CAT_FRAMES.sleep, loaf: CAT_FRAMES.loaf, stand: Phaser.Utils.Array.GetRandom([CAT_FRAMES.front, CAT_FRAMES.left, CAT_FRAMES.right]),
      stretch: CAT_FRAMES.stretch, lookUp: CAT_FRAMES.lookUp,
    }[state];
    s.setFrame(frame);
    if (state === 'stand') s.setFlipX(false);
  }

  think() {
    const r = Math.random();
    if (this.state === 'sleep') return this.enter('stretch', 1400);
    if (r < 0.35) return this.enter('sleep', Phaser.Math.Between(12000, 24000));
    if (r < 0.6) return this.enter('loaf', Phaser.Math.Between(6000, 12000));
    if (r < 0.75) return this.enter('stand', Phaser.Math.Between(2500, 5000));
    // 散步：在家附近左右選一個點
    const h = this.home;
    this.target = Phaser.Math.Between(h.x1, h.x2);
    if (Math.abs(this.target - this.x) < 30) return this.enter('loaf', 5000);
    this.sprite.setFlipX(this.target < this.x);
    return this.enter('walk', 12000);
  }

  update(delta, camView) {
    this.elapsed += delta;
    if (this.state === 'walk') {
      const dir = Math.sign(this.target - this.x);
      const nx = this.x + dir * SPEED * (delta / 1000);
      if (isBoxBlocked(this.colliders, nx, this.y, HITBOX)) {
        this.enter('stand', 2500); // 走不過去：停下，之後重新選點
      } else {
        this.sprite.x = nx;
        if (Math.abs(this.target - nx) < 2) this.enter('loaf', Phaser.Math.Between(5000, 9000));
      }
    }
    if (this.elapsed >= this.stateUntil) this.think();

    // 偶爾換到另一個活動範圍（只在不在畫面內時移動，避免瞬移被看到）
    if (this.elapsed > this.nextRelocate && camView && !camView.contains(this.x, this.y - 20)) {
      this.nextRelocate = this.elapsed + Phaser.Math.Between(80000, 140000);
      this.homeIndex = (this.homeIndex + 1 + Math.floor(Math.random() * (this.map.catHomes.length - 1))) % this.map.catHomes.length;
      const h = this.home;
      this.sprite.setPosition(h.rest.x, h.rest.y);
      this.enter('sleep', 15000);
    }
    this.sprite.setDepth(this.y);
  }

  showSpeechBubble(line) {
    const { scene } = this;
    const text = scene.add.text(0, 0, line, {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#513726', resolution: 2,
    }).setOrigin(0.5);
    const width = text.width + 26;
    const height = text.height + 12;
    const left = -width / 2;
    const top = -height - 8;
    text.y = top + height / 2;

    const frame = scene.add.graphics();
    frame.fillStyle(0x38261a, 0.26);
    frame.fillRoundedRect(left + 1, top + 3, width, height, 9);
    frame.fillStyle(0x694831);
    frame.fillRoundedRect(left, top, width, height, 9);
    frame.fillTriangle(-7, -10, 7, -10, 0, 0);
    frame.fillStyle(0xe4bb7e);
    frame.fillRoundedRect(left + 2, top + 2, width - 4, height - 4, 7);
    frame.fillStyle(0xffefd3);
    frame.fillTriangle(-4, -12, 4, -12, 0, -4);
    frame.fillRoundedRect(left + 3, top + 3, width - 6, height - 6, 6);

    const bubble = scene.add.container(this.x, this.y - 52, [frame, text])
      .setDepth(9200).setScale(0.8).setAlpha(0);
    scene.tweens.add({ targets: bubble, scale: 1, alpha: 1, duration: 200, ease: 'Back.Out' });
    scene.tweens.add({
      targets: bubble, y: bubble.y - 10, alpha: 0, delay: 1450, duration: 350,
      ease: 'Sine.In', onComplete: () => bubble.destroy(),
    });
  }

  /** 玩家按 E：抬頭、喵一聲、愛心；有冷卻避免連按 */
  interact() {
    if (this.elapsed < this.cooldownUntil) return false;
    this.cooldownUntil = this.elapsed + 4000;
    this.sprite.anims.stop();
    this.enter('lookUp', 2600);
    audio.play('meow');
    const line = Phaser.Utils.Array.GetRandom(CAT_LINES);
    this.showSpeechBubble(line);
    for (let i = 0; i < 3; i++) {
      const h = this.scene.add.image(this.x + (i - 1) * 14, this.y - 40, 'heart').setScale(0.5 / TEX_SCALE * 1.4).setDepth(9150).setAlpha(0);
      this.scene.tweens.add({ targets: h, y: h.y - 34 - i * 6, alpha: { from: 1, to: 0 }, delay: i * 140, duration: 1100, onComplete: () => h.destroy() });
    }
    return true;
  }
}
