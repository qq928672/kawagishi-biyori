import Phaser from 'phaser';
import { TEX_SCALE } from '../config/assets.js';

// 白天／夜晚：
// - 夜晚＝畫面蓋一層藍色「相乘」濾色（MULTIPLY），整體變暗偏藍，但人物與道路仍看得清楚
// - 路燈、窗戶的暖光放在濾色之上（ADD），夜晚才亮
// - 少量螢火蟲在指定區域緩慢飄動
// 小鎮與釣魚近景共用；切換時 0.8 秒漸變。
export const NIGHT = {
  tint: 0x4a5784, // 夜色（越暗越藍）
  overlayAlpha: 1,
  lightAlpha: 0.85,
  fadeMs: 800,
};

/**
 * @param scene Phaser 場景
 * @param opts.depth 濾色的 depth（光與螢火蟲會在它上面）
 * @param opts.lights [{ x, y, scale }] 夜晚亮起的暖光（世界座標）
 * @param opts.fireflies [{ x, y, w, h, n }] 螢火蟲範圍
 * @param opts.fixed true 表示濾色固定在畫面上（會隨鏡頭縮放調整大小）
 */
export function createNight(scene, { depth = 9300, lights = [], fireflies = [], fixed = true } = {}) {
  const cam = scene.cameras.main;
  const overlay = scene.add.rectangle(640, 360, 1280, 720, NIGHT.tint, 1).setDepth(depth).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0);
  if (fixed) overlay.setScrollFactor(0);
  const lightImgs = lights.map((l) => scene.add.image(l.x, l.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale((l.scale || 1.6) / TEX_SCALE).setDepth(depth + 1).setAlpha(0).setTint(0xffc878));
  const flies = [];
  for (const a of fireflies) {
    for (let i = 0; i < a.n; i++) {
      const f = scene.add.circle(a.x + Math.random() * a.w, a.y + Math.random() * a.h, 2.2, 0xfff3a0, 1).setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      f.area = a;
      flies.push(f);
      const drift = () => {
        scene.tweens.add({
          targets: f, x: a.x + Math.random() * a.w, y: a.y + Math.random() * a.h,
          duration: 3000 + Math.random() * 3000, ease: 'Sine.easeInOut', onComplete: drift,
        });
      };
      drift();
    }
  }
  let on = false;
  let level = 0; // 0 白天 ~ 1 夜晚
  const state = { level: 0 };

  const fit = () => {
    if (!fixed) return;
    const z = cam.zoom || 1;
    overlay.setDisplaySize(1280 / z + 8, 720 / z + 8);
  };
  fit();

  const apply = () => {
    overlay.setAlpha(level * NIGHT.overlayAlpha);
    for (const g of lightImgs) g.setAlpha(level * NIGHT.lightAlpha);
  };

  return {
    get isNight() { return on; },
    set(value, instant = false) {
      on = !!value;
      scene.tweens.killTweensOf(state);
      if (instant) {
        state.level = on ? 1 : 0;
        level = state.level;
        apply();
      } else {
        scene.tweens.add({ targets: state, level: on ? 1 : 0, duration: NIGHT.fadeMs, onUpdate: () => { level = state.level; apply(); } });
      }
    },
    update(time) {
      fit();
      if (level > 0) {
        for (const f of flies) f.setAlpha(level * (0.35 + 0.55 * (0.5 + 0.5 * Math.sin(time / 380 + f.x))));
      } else if (flies.length && flies[0].alpha) for (const f of flies) f.setAlpha(0);
    },
  };
}

