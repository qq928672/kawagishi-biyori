import { ui } from '../core/ui.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { SHOP_BUY, SELL_VEG, TEA } from '../config/economy.js';
import { FISH } from '../config/collectibles.js';
import { CROPS } from '../config/crops.js';
import { QUESTS } from '../config/quests.js';
import { ITEMS, itemName } from '../config/items.js';
import { TEA_LINES, TEA_DRINK_LINES, VILLAGE_MAP_TIPS, VILLAGE_MAP_TIPS_TOUCH } from '../config/dialogue.js';
import { touch } from '../core/touch.js';
import { MAP } from '../config/map.js';
import { TEX_SCALE } from '../config/assets.js';

const el = ui.el;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function openBusStop() {
  const body = el('div');
  body.append(el('p', '', '想搭車前往哪一站？'));
  const message = el('p', 'shop-msg');
  message.setAttribute('role', 'status');
  for (const destination of ['山間溫泉站', '海邊漁港站', '鄰町車站']) {
    const button = el('button', 'btn', destination);
    button.type = 'button';
    button.addEventListener('click', () => {
      message.textContent = `前往「${destination}」的路線尚未開發。`;
    });
    body.append(button);
  }
  body.append(message);
  ui.openModal({ title: '河岸橋頭站', body, buttons: [{ label: '離開站牌', primary: true }] });
}

// ================= 雜貨店 =================
// 每次點擊只執行一筆交易；餘額不足時按鈕停用；交易後立即存檔並重新顯示
// 背包內的魚不分個別尺寸，以魚種固定收購價計價（價格在 collectibles.js）；最大尺寸只記在圖鑑
export function fishSellPrice(fish) {
  return fish.price;
}

export function openShop(tab = 'buy') {
  const wrap = el('div', 'shop');
  const msg = el('div', 'shop-msg', '');
  const tabBar = el('div', 'tab-bar');
  const content = el('div', 'tab-content');
  let busy = false;

  const flash = (text, ok = true) => {
    msg.textContent = text;
    msg.className = `shop-msg ${ok ? 'ok' : 'warn'}`;
  };

  const render = (active) => {
    tabBar.replaceChildren(...[['buy', '購買'], ['sell', '出售']].map(([id, name]) => {
      const b = el('button', `tab${id === active ? ' active' : ''}`, name);
      b.addEventListener('click', () => render(id));
      return b;
    }));
    const head = el('div', 'wallet-line', `持有金幣 ${save.coins}　｜　夾娃娃代幣 ${save.tokens}`);
    const list = el('div', 'shop-list');
    if (active === 'buy') {
      for (const it of SHOP_BUY) {
        const owned = it.kind === 'token' ? save.tokens : save.count(it.id);
        const row = el('div', 'shop-row');
        row.append(
          ui.img(it.kind === 'token' ? 'claw_cabinet_town' : ITEMS[it.id]?.texture, it.name),
          el('div', 'shop-name', it.name),
          el('div', 'shop-own', `持有 ${owned}`),
          el('div', 'shop-price', `${it.price} 金幣`),
        );
        const btn = el('button', 'btn btn-primary', '買 1 個');
        btn.disabled = save.coins < it.price;
        btn.addEventListener('click', () => {
          if (busy) return;
          busy = true;
          if (!save.spendCoins(it.price)) flash('金幣不足。', false);
          else {
            if (it.kind === 'token') save.addTokens(1);
            else save.addItem(it.id, 1);
            audio.play('coin');
            flash(`買了 1 個${it.name}，花費 ${it.price} 金幣。`);
          }
          ui.updateWallet();
          render('buy');
          busy = false;
        });
        row.append(btn);
        list.append(row);
      }
    } else {
      const sellables = [
        ...FISH.map((f) => ({ id: f.id, price: fishSellPrice(f) })),
        ...Object.entries(SELL_VEG).map(([id, price]) => ({ id, price })),
      ].filter((s) => save.count(s.id) > 0);
      if (!sellables.length) list.append(el('p', 'hint', '沒有可以出售的魚或蔬菜。去河邊釣魚、在菜園種菜吧！'));
      for (const s of sellables) {
        const n = save.count(s.id);
        const row = el('div', 'shop-row');
        row.append(ui.img(ITEMS[s.id]?.texture, itemName(s.id)), el('div', 'shop-name', itemName(s.id)), el('div', 'shop-own', `持有 ${n}`), el('div', 'shop-price', `${s.price} 金幣`));
        const one = el('button', 'btn btn-primary', '賣 1 個');
        const all = el('button', 'btn', `全部（${n}）`);
        const doSell = (count) => {
          if (busy) return;
          busy = true;
          const c = Math.min(count, save.count(s.id));
          if (c > 0 && save.removeItem(s.id, c)) {
            save.addCoins(c * s.price);
            audio.play('coin');
            flash(`賣出 ${c} 個${itemName(s.id)}，得到 ${c * s.price} 金幣。`);
          }
          ui.updateWallet();
          render('sell');
          busy = false;
        };
        one.addEventListener('click', () => doSell(1));
        all.addEventListener('click', () => doSell(n));
        row.append(one, all);
        list.append(row);
      }
      list.append(el('p', 'hint', '圖鑑裡的捕獲紀錄不會因為出售而消失。'));
    }
    content.replaceChildren(head, list);
  };

  wrap.append(tabBar, content, msg);
  render(tab);
  ui.openModal({ title: '鄉村雜貨店', body: wrap, className: 'modal-shop' });
}

// ================= 茶屋 =================
export function openTeaHouse() {
  const body = el('div', 'tea');
  const line = el('p', 'tea-line', pick(TEA_LINES));
  body.append(el('div', 'npc-name', '茶屋老闆'), line, el('p', 'hint', `焙茶一杯 ${TEA.price} 金幣（純粹日常享受，沒有能力加成）。`));
  ui.openModal({
    title: '茶屋',
    body,
    buttons: [
      { label: '再聊聊', onClick: () => { line.textContent = pick(TEA_LINES); audio.play('click'); return false; } },
      {
        label: `點一杯茶（${TEA.price}）`,
        primary: true,
        onClick: () => {
          if (!save.spendCoins(TEA.price)) {
            line.textContent = '「金幣好像不太夠呢，下次再來喝吧。」';
            return false;
          }
          save.data.stats.teaCups = (save.data.stats.teaCups || 0) + 1;
          save.persist();
          ui.updateWallet();
          audio.play('sip');
          line.textContent = `${pick(TEA_DRINK_LINES)}（已喝 ${save.data.stats.teaCups} 杯）`;
          return false;
        },
      },
      { label: '離開' },
    ],
  });
}

// ================= 公告欄：操作說明 + 委託 =================
function rewardText(r) {
  const parts = [];
  if (r.coins) parts.push(`${r.coins} 金幣`);
  if (r.tokens) parts.push(`代幣 ×${r.tokens}`);
  for (const [id, n] of Object.entries(r.items || {})) parts.push(`${itemName(id)} ×${n}`);
  return parts.join('、');
}

export function openNoticeBoard() {
  const body = el('div', 'notice');
  const render = () => {
    body.replaceChildren();
    const help = el('div', 'notice-help');
    help.append(el('h3', 'inv-title', '村民須知'));
    for (const t of touch.enabled ? VILLAGE_MAP_TIPS_TOUCH : VILLAGE_MAP_TIPS) help.append(el('p', 'hint', t));
    body.append(help, el('h3', 'inv-title', '委託'));
    for (const q of QUESTS) {
      const state = save.data.quests[q.id] || 'available';
      const card = el('div', `quest quest-${state}`);
      const requirements = Object.entries(q.need);
      const ready = save.hasAll(q.need);
      const needText = requirements.map(([id, n]) => state === 'done'
        ? `${itemName(id)} ×${n}`
        : `${itemName(id)} ${Math.min(save.count(id), n)}/${n}`).join('、');
      card.append(
        el('div', 'quest-title', q.title),
        el('p', '', q.text),
        el('div', 'quest-meta', `${state === 'done' ? '已交付' : '需要'}：${needText}`),
        el('div', 'quest-meta', `報酬：${rewardText(q.reward)}`),
      );
      const status = { available: '可接受', accepted: ready ? '可交付' : '進行中', done: '已完成' }[state];
      const badge = el('span', `badge ${state === 'done' ? '' : 'todo'}`, status);
      card.prepend(badge);
      if (state === 'available') {
        const b = el('button', 'btn btn-primary', '接受委託');
        b.addEventListener('click', () => {
          if ((save.data.quests[q.id] || 'available') !== 'available') return;
          save.data.quests[q.id] = 'accepted';
          save.persist();
          audio.play('click');
          render();
        });
        card.append(b);
      } else if (state === 'accepted' && !ready) {
        const missing = requirements.filter(([id, n]) => save.count(id) < n)
          .map(([id, n]) => `${itemName(id)} ×${n - save.count(id)}`).join('、');
        card.append(el('p', 'hint', `還缺：${missing}`));
      } else if (state === 'accepted') {
        const b = el('button', 'btn btn-primary', '提交並領取報酬');

        b.addEventListener('click', () => {
          // 只能領一次：狀態先檢查、物品全部足夠才扣
          if (save.data.quests[q.id] !== 'accepted' || !save.hasAll(q.need)) return;
          for (const [id, n] of Object.entries(q.need)) save.removeItem(id, n);
          if (q.reward.coins) save.addCoins(q.reward.coins);
          if (q.reward.tokens) save.addTokens(q.reward.tokens);
          for (const [id, n] of Object.entries(q.reward.items || {})) save.addItem(id, n);
          save.data.quests[q.id] = 'done';
          save.persist();
          ui.updateWallet();
          audio.play('success');
          ui.toast(`委託完成！獲得 ${rewardText(q.reward)}`);
          render();
        });
        card.append(b);
      }
      body.append(card);
    }
  };
  render();
  ui.openModal({ title: '公告欄', body, className: 'modal-notice' });
}

// ================= 村莊地圖 =================
/**
 * 全村俯瞰地圖（獨立功能，不是主要遊玩視角）：
 * 直接用小鎮烘焙好的地面與物件圖片縮小繪製，標上地名與目前位置。
 */
export function openVillageMap(scene, playerPos) {
  const body = el('div', 'village-map');
  const canvas = el('canvas');
  const scale = 0.32;
  canvas.width = Math.round(MAP.world.width * scale);
  canvas.height = Math.round(MAP.world.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  const src = (k) => (scene.textures.exists(k) ? scene.textures.get(k).getSourceImage() : null);
  const ground = src('ground');
  if (ground) ctx.drawImage(ground, 0, 0);
  // 木橋
  for (const key of ['bridge_deck', 'bridge_rails']) {
    const deck = src(key);
    if (!deck) continue;
    const s = MAP.bridge.height / deck.height;
    ctx.drawImage(deck, MAP.bridge.x - (deck.width * s) / 2, MAP.bridge.top, deck.width * s, MAP.bridge.height);
  }
  // 物件（依 y 排序）
  const objs = [...MAP.objects].sort((a, b) => (a.depth ?? a.y) - (b.depth ?? b.y));
  for (const o of objs) {
    const img = src(o.texture);
    if (!img) continue;
    const w = img.width / TEX_SCALE;
    const h = img.height / TEX_SCALE;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, -o.origin[0] * w, -o.origin[1] * h, w, h);
    ctx.restore();
  }
  ctx.font = 'bold 40px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [name, x, y] of MAP.places) {
    const w = ctx.measureText(name).width + 32;
    ctx.fillStyle = 'rgba(74,52,38,0.82)';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 30, w, 58, 16); ctx.fill();
    ctx.fillStyle = '#fff8ea';
    ctx.fillText(name, x, y);
  }
  if (playerPos) {
    ctx.fillStyle = '#e0524f';
    ctx.beginPath(); ctx.arc(playerPos.x, playerPos.y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.stroke();
  }
  body.append(canvas, el('p', 'hint', '紅點是你現在的位置。上層住宅台地走中央石階或右側緩坡；河岸步道走石階 A、B；木橋通往對岸。'));
  ui.openModal({ title: '村莊地圖（M）', body, className: 'modal-map' });
}

// ================= 菜園：選種子 =================
export function openSeedPicker(onPick) {
  const body = el('div', 'seed-picker');
  body.append(el('p', 'hint', `選一種種子種下。種下後記得${touch.pick('按 E 澆水', '按「澆水」')}，作物才會開始成長。`));
  const grid = el('div', 'item-grid');
  for (const c of CROPS) {
    const n = save.count(c.seed);
    const card = ui.itemCard(c.seed, n, { sub: `${n} 包・約 ${c.growMinutes} 分鐘` });
    card.querySelector('img').src = ui.textureUrl(c.texture) || '';
    card.querySelector('.item-name').textContent = `${c.name}種子`;
    const btn = el('button', 'btn btn-primary', '種下');
    btn.disabled = n <= 0;
    btn.addEventListener('click', () => {
      ui.closeModal();
      onPick(c);
    });
    card.append(btn);
    grid.append(card);
  }
  body.append(grid);
  if (CROPS.every((c) => save.count(c.seed) <= 0)) body.append(el('p', 'hint', '種子用完了，可以到雜貨店購買。'));
  ui.openModal({ title: '選擇種子', body, buttons: [{ label: '取消', primary: true }] });
}
