import { save } from './save.js';
import { store, bus } from './store.js';
import { tutorial } from './tutorial.js';
import { touch } from './touch.js';
import { FISH, PLUSHIES } from '../config/collectibles.js';
import { ITEMS, CATEGORIES } from '../config/items.js';
import { TUTORIALS, TUTORIAL_ORDER } from '../config/tutorials.js';

// HTML 介面層：金幣代幣、HUD 按鈕、活動列（小遊戲內的「？」與離開）、狀態列、提示訊息、視窗
// 視窗規則：
// - 同時只開一個主要視窗（開新的會先關舊的）
// - 開啟時在 window 捕獲階段攔截按鍵，按鍵不會傳到 Phaser（不會移動、落爪、收竿或重複觸發）
// - 遮罩蓋住整個畫面，點擊不會穿透到遊戲
// - 開啟時焦點移入視窗（Tab 只在視窗內循環），關閉後回到原按鈕或遊戲
// - 開關時發出 bus 事件 modal-open / modal-close，小遊戲據此暫停計時

let root;
let statusEl;
let toastWrap;
let walletEl;
let hudButtons;
let activityBar;
let nightBtn;
let current = null; // { overlay, card, onClose, primary, opener, returnFocus }
let textureResolver = () => null;
const imgCache = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function onKeyDownCapture(e) {
  if (!current) return;
  const inCard = e.target instanceof Node && current.card.contains(e.target);
  const onControl = inCard && (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLAnchorElement);
  if (e.key === 'Escape') {
    e.preventDefault();
    ui.closeModal();
  } else if (e.key === 'Enter' || e.key === ' ') {
    // 焦點在視窗內的按鈕／連結上：觸發該按鈕；否則 Enter 觸發主要按鈕。
    // 一律在 keydown 處理並阻止預設行為，避免按鍵放開時又觸發一次。
    const isButton = onControl && !(e.target instanceof HTMLInputElement && e.target.type === 'range');
    if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') {
      // 文字／滑桿輸入：維持原本行為
    } else if (isButton) {
      e.preventDefault();
      if (!e.repeat) e.target.click();
    } else if (e.key === 'Enter' && current.primary && !current.primary.disabled) {
      e.preventDefault();
      if (!e.repeat) current.primary.click();
    } else {
      e.preventDefault();
    }
  } else if (e.key === 'Tab') {
    const list = [...current.card.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (list.length) {
      const i = list.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === -1 || i === list.length - 1 ? 0 : i + 1);
      e.preventDefault();
      list[next].focus();
    }
  } else if (e.key.startsWith('Arrow')) {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  }
  e.stopImmediatePropagation();
}

/** 回到遊戲：移除 DOM 焦點，避免空白鍵／Enter 再次按到介面按鈕 */
function focusGame() {
  const a = document.activeElement;
  if (a && a !== document.body && a.blur) a.blur();
}

/** 按鈕文字：結尾的按鍵提示（「背包 B」的 B、「離開 Esc」的 Esc）放進 .key-hint，觸控模式會隱藏 */
function setButtonLabel(b, label) {
  if (b.classList.contains('btn-help')) {
    b.replaceChildren(el('span', 'help-full', label), el('span', 'help-q', '？'));
    return;
  }
  const m = /^(.*?)\s+(Esc|[A-Z])$/.exec(label);
  if (m) b.replaceChildren(document.createTextNode(m[1]), el('span', 'key-hint', ` ${m[2]}`));
  else b.textContent = label;
}

/** HUD 按鈕：空白鍵不觸發（空白鍵保留給遊戲），點擊後交由 fn 處理 */
function hudButton(label, fn, cls = 'btn') {
  const b = el('button', cls);
  setButtonLabel(b, label);
  b.type = 'button';
  b.addEventListener('keydown', (e) => {
    if (e.key === ' ') e.preventDefault();
  });
  b.addEventListener('click', () => fn(b));
  return b;
}

export const ui = {
  el,

  init() {
    root = document.getElementById('ui');

    const right = el('div', 'hud-right');
    walletEl = el('div', 'wallet');
    hudButtons = el('div', 'hud-buttons');
    hudButtons.append(
      hudButton('背包 B', () => this.guardExplore() && this.openInventory()),
      hudButton('圖鑑', () => this.guardExplore() && this.openDex()),
      hudButton('地圖 M', () => this.guardExplore() && bus.emit('open-map')),
      (nightBtn = hudButton('', () => this.toggleNight(), 'btn btn-ghost')),
      hudButton('設定', () => this.guardExplore() && this.openSettings(), 'btn btn-ghost'),
      hudButton('玩法', () => this.openHelp(), 'btn btn-help'),
    );
    right.append(walletEl, hudButtons);

    activityBar = el('div', 'activity-bar hidden');
    statusEl = el('div', 'status hidden');
    statusEl.setAttribute('role', 'status');
    toastWrap = el('div', 'toast-wrap');
    root.append(right, activityBar, statusEl, toastWrap);
    this.updateWallet();
    this.updateNightButton();

    window.addEventListener('keydown', onKeyDownCapture, true);
    window.addEventListener('keypress', (e) => current && e.stopImmediatePropagation(), true);
  },

  guardExplore() {
    if (store.mode !== 'explore') {
      this.toast('請先按 Esc 結束目前的活動');
      return false;
    }
    return true;
  },

  /** 白天／夜晚切換（N 鍵或 HUD 按鈕）；狀態存在設定裡 */
  toggleNight() {
    save.setting('night', !save.data.settings.night);
    this.updateNightButton();
    bus.emit('time-changed');
  },

  updateNightButton() {
    if (!nightBtn) return;
    const night = !!save.data.settings.night;
    setButtonLabel(nightBtn, night ? '☀ 白天 N' : '☾ 夜晚 N');
    nightBtn.title = night ? '切換成白天' : '切換成夜晚';
  },

  updateWallet() {
    if (!walletEl) return;
    walletEl.replaceChildren(
      el('span', 'coin-badge', `金幣 ${save.coins}`),
      el('span', 'token-badge', `代幣 ${save.tokens}`),
    );
  },

  /**
   * 小遊戲內的活動列（左上）：小型「？」說明 + 離開按鈕 + 其他按鈕。傳 null 回到一般 HUD。
   * cfg: { help: 'fishing', exit: { label, onClick }, extra: [{ label, onClick }] }
   */
  setActivity(cfg) {
    if (!activityBar) return;
    activityBar.replaceChildren();
    if (!cfg) {
      activityBar.classList.add('hidden');
      hudButtons.classList.remove('hidden');
      return;
    }
    hudButtons.classList.add('hidden');
    const wrap = (fn) => (b) => {
      if (current) return;
      focusGame();
      fn(b);
    };
    if (cfg.help) {
      const h = hudButton('玩法', wrap(() => this.openHelp(cfg.help, { returnFocus: 'game' })), 'btn btn-help');
      h.title = '玩法說明';
      h.setAttribute('aria-label', '玩法說明');
      activityBar.append(h);
    }
    for (const x of cfg.extra || []) activityBar.append(hudButton(x.label, wrap(x.onClick), 'btn btn-ghost'));
    if (cfg.exit) activityBar.append(hudButton(cfg.exit.label, wrap(cfg.exit.onClick), 'btn'));
    activityBar.classList.remove('hidden');
  },

  setTextureResolver(fn) {
    textureResolver = fn;
  },

  textureUrl(key) {
    if (!imgCache.has(key)) imgCache.set(key, textureResolver(key));
    return imgCache.get(key);
  },

  img(key, alt = '') {
    const i = el('img');
    const src = this.textureUrl(key);
    if (src) i.src = src;
    i.alt = alt;
    return i;
  },

  isModalOpen() {
    return !!current;
  },

  /**
   * 開啟視窗（若已有視窗會先關閉，確保同時只有一個）
   * buttons: [{ label, primary, danger, disabled, onClick }]；onClick 回傳 false 可保持視窗開啟
   * returnFocus: 'opener'（預設，回到開啟它的按鈕）| 'game'（回到遊戲，不留焦點）
   * 回傳 { body, setTitle }，可在視窗開著時重新渲染內容
   */
  openModal({ title, body, buttons = [{ label: '關閉', primary: true }], className = '', onClose, returnFocus = 'opener' } = {}) {
    let opener = document.activeElement;
    const replacing = !!current;
    if (current) {
      opener = current.opener; // 視窗換視窗：沿用最初的開啟者
      this.closeModal({ silent: true });
    }

    const overlay = el('div', 'modal-overlay');
    const card = el('div', `modal-card ${className}`.trim());
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const titleId = `modal-title-${Date.now()}`;
    card.setAttribute('aria-labelledby', titleId);

    const header = el('div', 'modal-header');
    const h = el('h2', 'modal-title', title);
    h.id = titleId;
    header.append(h);
    const closeBtn = el('button', 'modal-close', '×');
    closeBtn.type = 'button';
    closeBtn.title = '關閉 (Esc)';
    closeBtn.setAttribute('aria-label', '關閉');
    closeBtn.addEventListener('click', () => this.closeModal());
    header.append(closeBtn);
    card.append(header);

    const bodyWrap = el('div', 'modal-body');
    if (body) bodyWrap.append(body);
    card.append(bodyWrap);

    let primary = null;
    if (buttons.length) {
      const footer = el('div', 'modal-footer');
      for (const b of buttons) {
        const btn = el('button', `btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}`, b.label);
        btn.type = 'button';
        btn.disabled = !!b.disabled;
        btn.addEventListener('click', () => {
          const keep = b.onClick ? b.onClick() === false : false;
          if (!keep) this.closeModal();
        });
        if (b.primary && !primary) primary = btn;
        footer.append(btn);
      }
      card.append(footer);
    }

    // 點擊遮罩關閉；所有指標事件都停在遮罩，不穿透到遊戲
    overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === overlay) this.closeModal();
    });
    overlay.append(card);
    root.append(overlay);
    current = { overlay, card, onClose, primary, opener, returnFocus };
    (primary || closeBtn).focus({ preventScroll: true });
    if (!replacing) bus.emit('modal-open');
    return { body: bodyWrap, setTitle: (t) => { h.textContent = t; } };
  },

  closeModal({ silent = false } = {}) {
    if (!current) return;
    const c = current;
    current = null;
    c.overlay.remove();
    if (!silent) {
      // 焦點：回到原按鈕（仍在畫面上且可見）或回到遊戲
      const o = c.opener;
      if (c.returnFocus === 'opener' && o && o !== document.body && o.isConnected && o.offsetParent !== null) o.focus({ preventScroll: true });
      else focusGame();
      bus.emit('modal-close');
    }
    if (c.onClose) c.onClose();
  },

  setPhotoSeat(active) {
    root.classList.toggle('photo-seat', active);
  },

  setStatus(text) {
    if (!statusEl) return;
    if (!text) {
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
    } else {
      statusEl.textContent = text;
      statusEl.classList.remove('hidden');
    }
  },

  toast(text, ms = 2200) {
    const t = el('div', 'toast', text);
    toastWrap.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, ms);
  },

  itemCard(id, count, { locked = false, sub = null } = {}) {
    const item = ITEMS[id] || { name: id, texture: null };
    const card = el('div', `item-card${locked ? ' locked' : ''}`);
    card.append(this.img(item.texture, item.name), el('div', 'item-name', locked ? '？？？' : item.name));
    card.append(el('div', 'item-count', sub ?? (item.infinite ? '∞' : `× ${count}`)));
    if (!locked && item.description) card.title = item.description;
    return card;
  },

  // ---------- 玩法說明 ----------
  renderTutorial(id) {
    const t = TUTORIALS[id];
    // 觸控模式顯示觸控按鈕的說明；桌面維持鍵盤說明
    const tc = touch.enabled;
    const intro = (tc && t.touchIntro) || t.intro;
    const keys = (tc && t.touchKeys) || t.keys;
    const tips = (tc && t.touchTips) || t.tips;
    const box = el('div', 'tutorial');
    if (intro) box.append(el('p', 'tutorial-intro', intro));
    const list = el('dl', 'key-list');
    for (const [k, v] of keys || []) {
      const dt = el('dt');
      dt.append(el('kbd', '', k));
      list.append(dt, el('dd', '', v));
    }
    box.append(list);
    if (tips?.length) {
      const ul = el('ul', 'tutorial-tips');
      for (const tip of tips) ul.append(el('li', '', tip));
      box.append(ul);
    }
    return box;
  },

  /** 「玩法」手冊：分頁切換基本操作、釣魚、夾娃娃、菜園、故事館 */
  openHelp(tab, { returnFocus = 'opener' } = {}) {
    const active = TUTORIALS[tab] ? tab : this.helpTabForMode();
    const wrap = el('div', 'help');
    const tabBar = el('div', 'tab-bar');
    tabBar.setAttribute('role', 'tablist');
    const content = el('div', 'tab-content');
    const render = (id) => {
      tabBar.replaceChildren(...TUTORIAL_ORDER.map((k) => {
        const b = el('button', `tab${k === id ? ' active' : ''}`, TUTORIALS[k].tab);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(k === id));
        b.addEventListener('click', () => render(k));
        return b;
      }));
      content.replaceChildren(this.renderTutorial(id));
    };
    render(active);
    wrap.append(tabBar, content);
    this.openModal({ title: '玩法手冊', body: wrap, className: 'modal-help', returnFocus });
  },

  helpTabForMode() {
    return { fishing: 'fishing', claw: 'claw', museum: 'museum' }[store.mode] || 'basic';
  },

  /**
   * 首次教學：尚未讀過才顯示（每種玩法分開記錄）。關閉時記為已讀。
   * 回傳是否有顯示。
   */
  showTutorialOnce(id, { onClose, returnFocus = 'game' } = {}) {
    if (tutorial.isRead(id) || !TUTORIALS[id]) return false;
    const t = TUTORIALS[id];
    tutorial.markRead(id); // 開啟即記錄：即使用 Esc 關閉也不會重複彈出
    this.openModal({
      title: t.title,
      body: this.renderTutorial(id),
      className: 'modal-tutorial',
      buttons: [{ label: t.button || '知道了', primary: true }],
      returnFocus,
      onClose,
    });
    return true;
  },

  // ---------- 背包與圖鑑 ----------
  openInventory(tab = 'fish') {
    const tabs = [...CATEGORIES, { id: 'dex', name: '圖鑑' }];
    const wrap = el('div', 'inventory');
    const tabBar = el('div', 'tab-bar');
    const content = el('div', 'tab-content');
    const render = (active) => {
      tabBar.replaceChildren(...tabs.map((t) => {
        const b = el('button', `tab${t.id === active ? ' active' : ''}`, t.name);
        b.type = 'button';
        b.addEventListener('click', () => render(t.id));
        return b;
      }));
      content.replaceChildren(active === 'dex' ? this.renderDex() : this.renderCategory(active));
    };
    wrap.append(el('div', 'wallet-line', `金幣 ${save.coins}　｜　夾娃娃代幣 ${save.tokens}`), tabBar, content);
    render(tab);
    this.openModal({ title: '背包', body: wrap, className: 'modal-inventory' });
  },

  renderCategory(cat) {
    const box = el('div');
    const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].category === cat && (save.count(id) > 0 || ITEMS[id].infinite));
    if (!ids.length) {
      box.append(el('p', 'hint', '目前沒有這類物品。'));
      return box;
    }
    const grid = el('div', 'item-grid');
    for (const id of ids) grid.append(this.itemCard(id, save.count(id)));
    box.append(grid);
    return box;
  },

  openDex() {
    const body = el('div', 'field-guide');
    const bar = el('div', 'tab-bar');
    const page = el('div', 'tab-content');
    const tabs = [
      ['魚類', () => this.renderFishGrid()],
      ['玩偶', () => this.renderPlushGrid()],
    ];
    const show = (selected) => {
      page.replaceChildren(tabs[selected][1]());
      [...bar.children].forEach((button, i) => {
        button.classList.toggle('active', i === selected);
        button.setAttribute('aria-pressed', String(i === selected));
      });
    };
    tabs.forEach(([name], i) => {
      const button = el('button', 'tab', name);
      button.onclick = () => show(i);
      bar.append(button);
    });
    body.append(bar, page);
    show(0);
    this.openModal({ title: '河岸圖鑑', body, className: 'modal-inventory' });
  },

  renderDex() {
    const box = this.renderFishGrid();
    box.append(this.renderPlushGrid());
    return box;
  },

  renderFishGrid() {
    const box = el('div');
    const fishCaught = FISH.filter((f) => save.data.fishLog[f.id]?.count > 0).length;
    box.append(el('h3', 'inv-title', `魚類圖鑑　${fishCaught} / ${FISH.length}`));
    const fg = el('div', 'item-grid');
    for (const f of FISH) {
      const log = save.data.fishLog[f.id];
      const has = log?.count > 0;
      const sub = has ? `${log.count} 次・最大 ${log.maxSize ? `${log.maxSize} cm` : '—'}` : '未發現';
      fg.append(this.itemCard(f.id, 0, { locked: !has, sub }));
    }
    box.append(fg);
    return box;
  },

  /** 玩偶收藏（圖鑑與夾娃娃機共用）；初代玩偶只在有收藏時顯示 */
  renderPlushGrid() {
    const box = el('div');
    const shown = PLUSHIES.filter((p) => !p.retired || save.data.plushLog[p.id] > 0);
    const current = PLUSHIES.filter((p) => !p.retired);
    const have = current.filter((p) => save.data.plushLog[p.id] > 0).length;
    box.append(el('h3', 'inv-title', `玩偶收藏　${have} / ${current.length}`));
    const pg = el('div', 'item-grid');
    for (const p of shown) {
      const n = save.data.plushLog[p.id] || 0;
      pg.append(this.itemCard(p.id, n, { locked: !n, sub: n ? `收藏 ${n} 個${p.retired ? '・初代' : ''}` : '未收藏' }));
    }
    box.append(pg);
    return box;
  },

  // ---------- 設定 ----------
  openSettings() {
    const s = save.data.settings;
    const body = el('div', 'settings');
    const row = (label, input) => {
      const r = el('label', 'setting-row');
      r.append(el('span', '', label), input);
      return r;
    };
    const sound = el('input'); sound.type = 'checkbox'; sound.checked = s.sound;
    sound.addEventListener('change', () => { save.setting('sound', sound.checked); bus.emit('settings-changed'); });
    const vol = el('input'); vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(s.volume);
    vol.addEventListener('input', () => { save.setting('volume', Number(vol.value)); bus.emit('settings-changed'); });
    const easy = el('input'); easy.type = 'checkbox'; easy.checked = s.easy;
    easy.addEventListener('change', () => { save.setting('easy', easy.checked); bus.emit('settings-changed'); });
    const debug = el('input'); debug.type = 'checkbox'; debug.checked = !!store.debug;
    debug.addEventListener('change', () => { store.debug = debug.checked; bus.emit('debug-changed'); });
    body.append(
      row('音效', sound),
      row('音量', vol),
      row('釣魚輕鬆模式（指標變慢、判定區變寬）', easy),
      row('顯示碰撞／通行區（除錯用，F2）', debug),
      el('p', 'hint', '聲音需要在按下任一鍵或點擊畫面後才會開始播放。'),
    );
    this.openModal({
      title: '設定',
      body,
      buttons: [
        { label: '重設進度…', danger: true, onClick: () => { this.openResetConfirm(); return false; } },
        { label: '關閉', primary: true },
      ],
    });
  },

  openResetConfirm() {
    const body = el('div');
    body.append(
      el('p', '', '確定要重設所有進度嗎？'),
      el('p', 'hint', '金幣、代幣、背包、圖鑑、菜園、委託、主角位置與教學紀錄都會清除，無法復原。'),
    );
    this.openModal({
      title: '重設進度',
      body,
      buttons: [
        { label: '取消', primary: true },
        {
          label: '確定重設',
          danger: true,
          onClick: () => {
            save.reset();
            tutorial.reset();
            this.updateWallet();
            this.updateNightButton();
            bus.emit('time-changed');
            this.toast('進度已重設');
            // 等這個視窗關閉後再通知（小鎮可能會重新顯示歡迎教學）
            setTimeout(() => bus.emit('progress-reset'), 0);
          },
        },
      ],
    });
  },
};
