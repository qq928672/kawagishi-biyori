import { FONT } from '../config/gameConfig.js';
import { GARDEN_PLOTS } from '../config/map.js';
import { cropById } from '../config/crops.js';
import { TEX_SCALE } from '../config/assets.js';
import { save } from '../core/save.js';
import { ui } from '../core/ui.js';
import { audio } from '../core/audio.js';
import { touch } from '../core/touch.js';
import { openSeedPicker } from '../ui/panels.js';

// 菜園：4 塊田地
// 存檔只記錄 { crop, state, readyAt }；成熟與否依「現在時間 ≥ readyAt」判斷，
// 重新整理後依時間戳恢復，不依賴單一倒數計時器。
// 狀態：empty（空地）→ planted（待澆水）→ growing（成長中）→ 時間到即為 ripe（可採收）
const CROP_SPOTS = [[-26, -64], [26, -64], [-26, -30], [26, -30]];

export function plotState(p, now = Date.now()) {
  if (!p.crop) return 'empty';
  if (p.state === 'growing' && now >= p.readyAt) return 'ripe';
  return p.state;
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Garden {
  constructor(scene) {
    this.scene = scene;
    this.views = GARDEN_PLOTS.map((p) => {
      const base = scene.add.image(p.x, p.y, 'plot_empty').setOrigin(0.5, 0.95).setScale(1 / TEX_SCALE).setDepth(p.y - 110);
      const crops = CROP_SPOTS.map(([dx, dy]) => scene.add.image(p.x + dx, p.y + dy, 'crop_sprout').setOrigin(0.5, 0.9).setScale(1 / TEX_SCALE).setDepth(p.y - 105 + dy * 0.01).setVisible(false));
      // 狀態標籤：平常隱藏，主角靠近時才淡入（不常駐「空地」等文字）
      const label = scene.add.text(p.x, p.y - 112, '', {
        fontFamily: FONT, fontSize: '13px', color: '#fff8ea', resolution: 2, backgroundColor: 'rgba(74,52,38,0.78)', padding: { x: 7, y: 2 },
      }).setOrigin(0.5).setDepth(7900).setAlpha(0);
      return { base, crops, label, last: null };
    });
    this.refresh();
    this.timer = scene.time.addEvent({ delay: 500, loop: true, callback: () => this.refresh() });
  }

  /** 每格呼叫：只有最靠近主角、且在範圍內的田地顯示狀態 */
  updateNear(feet, range = 120) {
    let best = -1;
    let bestD = range;
    GARDEN_PLOTS.forEach((p, i) => {
      const d = Math.hypot(feet.x - p.x, feet.y - (p.y - 20));
      if (d < bestD) { bestD = d; best = i; }
    });
    this.views.forEach((v, i) => {
      const target = i === best ? 1 : 0;
      v.label.setAlpha(v.label.alpha + (target - v.label.alpha) * 0.2);
    });
  }

  get plots() {
    return save.data.garden.plots;
  }

  refresh() {
    const now = Date.now();
    this.plots.forEach((p, i) => {
      const v = this.views[i];
      const st = plotState(p, now);
      const crop = cropById(p.crop);
      const key = `${st}:${p.crop}`;
      if (v.last !== key) {
        v.last = key;
        v.base.setTint(st === 'growing' || st === 'ripe' ? 0xc9b09a : 0xffffff);
        v.crops.forEach((c) => {
          c.setVisible(st !== 'empty');
          c.setTexture(st === 'ripe' && crop ? crop.texture : 'crop_sprout');
        });
      }
      let text = '空地';
      if (st === 'planted') text = `${crop?.name}・待澆水`;
      if (st === 'growing') text = `${crop?.name}・成長中 ${fmt(p.readyAt - now)}`;
      if (st === 'ripe') text = `${crop?.name}・可採收！`;
      if (v.label.text !== text) v.label.setText(text);
      v.label.setBackgroundColor(st === 'ripe' ? 'rgba(127,166,90,0.92)' : st === 'planted' ? 'rgba(74,120,170,0.9)' : 'rgba(74,52,38,0.78)');
    });
  }

  interact(i) {
    const p = this.plots[i];
    const st = plotState(p);
    if (st === 'empty') {
      openSeedPicker((crop) => {
        if (plotState(this.plots[i]) !== 'empty') return; // 已被種下，避免重複
        if (!save.removeItem(crop.seed, 1)) {
          ui.toast('種子不足，可以到雜貨店購買。');
          return;
        }
        this.plots[i] = { crop: crop.id, state: 'planted', readyAt: 0 };
        save.persist();
        audio.play('plant');
        ui.toast(`種下了${crop.name}。${touch.pick('按 E 澆水', '按「澆水」')}，作物才會開始成長。`);
        this.refresh();
      });
    } else if (st === 'planted') {
      const crop = cropById(p.crop);
      p.state = 'growing';
      p.readyAt = Date.now() + crop.growMinutes * 60 * 1000;
      save.persist();
      audio.play('water');
      this.splash(i);
      ui.toast(`澆好水了！約 ${crop.growMinutes} 分鐘後可以採收。`);
      this.refresh();
    } else if (st === 'growing') {
      ui.toast(`還要 ${fmt(p.readyAt - Date.now())} 才能採收。`);
    } else if (st === 'ripe') {
      const crop = cropById(p.crop);
      // 先清空田地再加入背包，避免重複領取
      this.plots[i] = { crop: null, state: 'empty', readyAt: 0 };
      save.persist();
      save.addItem(crop.item, 1);
      audio.play('harvest');
      this.harvestPop(i, crop);
      ui.toast(`採收了 1 顆${crop.name}！已放進背包。`);
      this.refresh();
    }
  }

  splash(i) {
    const p = GARDEN_PLOTS[i];
    for (let k = 0; k < 14; k++) {
      const d = this.scene.add.ellipse(p.x + (Math.random() - 0.5) * 80, p.y - 96, 4, 7, 0x8fd0e8, 0.9).setDepth(9000);
      this.scene.tweens.add({ targets: d, y: p.y - 30 - Math.random() * 30, alpha: 0, duration: 500 + Math.random() * 300, delay: k * 35, onComplete: () => d.destroy() });
    }
    // 澆過水的土色變深一下再恢復
    const v = this.views[i];
    v.base.setTint(0x9c8670);
    this.scene.time.delayedCall(900, () => { v.last = null; this.refresh(); });
  }

  /** 採收：蔬菜圖示往上彈出、閃一下 */
  harvestPop(i, crop) {
    const p = GARDEN_PLOTS[i];
    const icon = this.scene.add.image(p.x, p.y - 50, crop.texture).setScale(0.8 / TEX_SCALE).setDepth(9100);
    this.scene.tweens.add({ targets: icon, y: p.y - 120, scale: 1.1 / TEX_SCALE, duration: 420, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: icon, alpha: 0, delay: 700, duration: 400, onComplete: () => icon.destroy() });
    for (let k = 0; k < 6; k++) {
      const s = this.scene.add.image(p.x + (Math.random() - 0.5) * 70, p.y - 60 - Math.random() * 40, 'sparkle').setDepth(9101).setScale(0.8);
      this.scene.tweens.add({ targets: s, alpha: { from: 1, to: 0 }, scale: 0.3, duration: 600, delay: k * 50, onComplete: () => s.destroy() });
    }
  }

  destroy() {
    this.timer?.remove(false);
  }
}
