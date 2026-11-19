import { store, bus } from './store.js';
import { ui } from './ui.js';

// 手機觸控操作層（HTML，疊在遊戲畫面上；桌面鍵盤操作完全不受影響）
// - 何時出現：粗指標裝置（手機、平板），或第一次用手指觸碰畫面時自動開啟；網址加 ?touch=1 強制開啟、?touch=0 關閉
// - 虛擬搖桿：左下浮動搖桿，提供類比方向（小鎮移動、夾娃娃左右、故事館切換展品）
// - 按鈕：互動／返回，以及釣魚（拋竿、收竿、收線、換餌）與夾娃娃（落爪）專用按鈕
//   按鈕送出與鍵盤相同的按鍵事件（E、Esc、空白鍵、1／2…），沿用各場景原本的判斷與防連按
// - 多點觸控：每根手指以 pointerId 分開追蹤，可以一邊推搖桿一邊按按鈕
// - 觸控取消：pointercancel、失去捕獲、視窗失焦、切換分頁、開啟視窗、切換模式時，全部放開，角色不會持續移動
// - 直向時顯示可關閉的「建議橫向遊玩」提示

const KEYS = {
  E: { key: 'e', code: 'KeyE', keyCode: 69 },
  ESC: { key: 'Escape', code: 'Escape', keyCode: 27 },
  SPACE: { key: ' ', code: 'Space', keyCode: 32 },
  ONE: { key: '1', code: 'Digit1', keyCode: 49 },
  TWO: { key: '2', code: 'Digit2', keyCode: 50 },
  LEFT: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  RIGHT: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};

const STICK_RADIUS = 52; // 搖桿可推動的半徑（CSS 像素）
const DEADZONE = 0.18;
const MUSEUM_REPEAT_MS = 380;
const ROTATE_DISMISS_KEY = 'kawagishi-biyori/rotate-hint-dismissed';

function sendKey(type, name) {
  const k = KEYS[name];
  if (!k) return;
  const ev = new KeyboardEvent(type, { key: k.key, code: k.code, bubbles: true, cancelable: true });
  // Phaser 依 keyCode 判斷按鍵；KeyboardEvent 建構時無法可靠設定，改以屬性覆寫
  Object.defineProperty(ev, 'keyCode', { get: () => k.keyCode });
  Object.defineProperty(ev, 'which', { get: () => k.keyCode });
  window.dispatchEvent(ev);
}

function tapKey(name) {
  sendKey('keydown', name);
  sendKey('keyup', name);
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function buzz() {
  try { navigator.vibrate?.(8); } catch { /* 不支援震動 */ }
}

let game = null;
let enabled = false;
let rootEl;
let ui$ = {};
const stick = { id: null, cx: 0, cy: 0, x: 0, y: 0, mode: 'off' };
let lastSig = '';
let museumHold = { dir: 0, next: 0 };
let photoTapReadyAt = 0;
let rotateDismissed = false;

function readDismissed() {
  try { return sessionStorage.getItem(ROTATE_DISMISS_KEY) === '1'; } catch { return false; }
}

function writeDismissed() {
  try { sessionStorage.setItem(ROTATE_DISMISS_KEY, '1'); } catch { /* 私密模式等情況：只在這次開啟有效 */ }
}

// ---------- 搖桿 ----------
function resetStick() {
  stick.id = null;
  stick.x = 0;
  stick.y = 0;
  if (ui$.base) {
    ui$.base.classList.remove('active');
    ui$.base.style.left = '';
    ui$.base.style.top = '';
    ui$.knob.style.transform = '';
  }
}

function moveStick(e) {
  let dx = e.clientX - stick.cx;
  let dy = stick.mode === 'horizontal' ? 0 : e.clientY - stick.cy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_RADIUS) {
    dx = (dx / d) * STICK_RADIUS;
    dy = (dy / d) * STICK_RADIUS;
  }
  stick.x = dx / STICK_RADIUS;
  stick.y = dy / STICK_RADIUS;
  ui$.knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function buildStick() {
  const zone = el('div', 'tc-stick-zone');
  const base = el('div', 'tc-stick-base');
  const knob = el('div', 'tc-stick-knob');
  base.append(knob);
  zone.append(base);
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick.id !== null || stick.mode === 'off') return;
    stick.id = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* 部分瀏覽器不支援 */ }
    const r = zone.getBoundingClientRect();
    // 浮動搖桿：以手指按下的位置為中心（離邊緣太近時往內收，避免底座被切掉）
    const half = 62;
    stick.cx = Math.min(Math.max(e.clientX, r.left + half), r.right - half);
    stick.cy = Math.min(Math.max(e.clientY, r.top + half), r.bottom - half);
    base.style.left = `${stick.cx - r.left}px`;
    base.style.top = `${stick.cy - r.top}px`;
    base.classList.add('active');
    moveStick(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) moveStick(e);
  });
  const end = (e) => { if (e.pointerId === stick.id) resetStick(); };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
  ui$.zone = zone;
  ui$.base = base;
  ui$.knob = knob;
  return zone;
}

// ---------- 按鈕 ----------
// 每個按鈕記錄「按下時」送出的按鍵，放開時送出同一個按鍵的 keyup（標籤中途改變也不會卡住）
const buttons = [];

function makeButton(className) {
  const b = el('button', `tc-btn ${className}`);
  b.type = 'button';
  b.tabIndex = -1; // 觸控專用，不搶鍵盤焦點
  const label = el('span', 'tc-label');
  b.append(label);
  const st = { el: b, label, id: null, sentKey: null, cfg: null };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (st.id !== null || !st.cfg || st.cfg.disabled) return;
    const key = typeof st.cfg.key === 'function' ? st.cfg.key() : st.cfg.key;
    if (!key) return;
    st.id = e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch { /* 部分瀏覽器不支援 */ }
    st.sentKey = key;
    b.classList.add('pressed');
    buzz();
    sendKey('keydown', key);
  });
  const end = (e) => { if (e.pointerId === st.id) releaseButton(st); };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('lostpointercapture', end);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  // 鍵盤或輔助技術「點擊」時也能使用
  b.addEventListener('click', (e) => {
    if (e.detail !== 0 || !st.cfg || st.cfg.disabled) return;
    const key = typeof st.cfg.key === 'function' ? st.cfg.key() : st.cfg.key;
    if (key) tapKey(key);
  });
  buttons.push(st);
  return st;
}

function releaseButton(st) {
  if (st.id === null) return;
  st.id = null;
  st.el.classList.remove('pressed');
  if (st.sentKey) sendKey('keyup', st.sentKey);
  st.sentKey = null;
}

function applyButton(st, cfg) {
  st.cfg = cfg;
  if (!cfg) {
    releaseButton(st);
    st.el.classList.add('hidden');
    return;
  }
  st.el.classList.remove('hidden');
  if (st.label.textContent !== cfg.label) st.label.textContent = cfg.label;
  st.el.setAttribute('aria-label', cfg.label);
  st.el.classList.toggle('disabled', !!cfg.disabled);
  st.el.classList.toggle('ready', !!cfg.ready);
  st.el.classList.toggle('urgent', !!cfg.urgent);
  st.el.classList.toggle('long', cfg.label.length > 3);
  st.el.classList.toggle('xlong', cfg.label.length > 5); // 較長的互動名稱（例：進入我的故事館）縮小並換行
}

/** 放開所有手指：搖桿歸零、按住的按鍵送出 keyup */
function releaseAll() {
  resetStick();
  for (const st of buttons) releaseButton(st);
  if (museumHold.dir) museumHold = { dir: 0, next: 0 };
}

// ---------- 依目前模式決定要顯示哪些控制 ----------
function scene(key) {
  if (!game) return null;
  const s = game.scene.getScene(key);
  return s && game.scene.isActive(key) ? s : null;
}

function layout() {
  if (!game || ui.isModalOpen()) return { hidden: true };
  const mode = store.mode;
  if (mode === 'explore') {
    const town = scene('Town');
    if (!town) return { hidden: true };
    if (town.sitting?.photoSeat) return { hidden: true, photoTap: true };
    if (town.sitting) {
      return { stick: 'off', main: { label: '起身', key: 'E' }, back: { label: '返回', key: 'ESC' } };
    }
    const near = town.current && town.promptLabel;
    return {
      stick: 'full',
      main: { label: near ? town.promptLabel : '互動', key: 'E', ready: !!near, disabled: !near },
    };
  }
  if (mode === 'fishing') {
    const f = scene('Fishing');
    if (!f) return { hidden: true };
    const back = { label: '返回', key: 'ESC' };
    if (f.pause?.blur) return { stick: 'off', main: { label: '繼續', key: 'SPACE', ready: true }, back };
    const main = {
      select: { label: '拋竿', key: 'E', ready: true },
      waiting: { label: '收竿', key: 'SPACE' },
      bite: { label: '收竿！', key: 'SPACE', urgent: true },
      reeling: { label: '收線', key: 'SPACE', ready: true },
    }[f.state] || { label: '收竿', key: 'SPACE', disabled: true };
    const alt = f.state === 'select'
      ? { label: '換餌', key: () => (f.baitId === 'bait_basic' ? 'TWO' : 'ONE') }
      : null;
    return { stick: 'off', main, alt, back };
  }
  if (mode === 'claw') {
    const c = scene('Claw');
    if (!c) return { hidden: true };
    const idle = c.state === 'idle';
    return {
      stick: idle ? 'horizontal' : 'horizontal-idle',
      main: { label: '落爪', key: 'SPACE', disabled: !idle, ready: idle },
      back: { label: '返回', key: 'ESC', disabled: !idle },
    };
  }
  if (mode === 'museum') {
    if (!scene('Museum')) return { hidden: true };
    return { stick: 'horizontal', main: { label: '查看', key: 'E', ready: true }, back: { label: '返回', key: 'ESC' } };
  }
  return { hidden: true };
}

function signature(l) {
  const b = (c) => (c ? `${c.label}|${c.disabled ? 1 : 0}|${c.ready ? 1 : 0}|${c.urgent ? 1 : 0}` : '-');
  return [l.hidden ? 'H' : 'V', l.photoTap ? 'P' : '', l.stick, b(l.main), b(l.alt), b(l.back), store.mode].join('/');
}

function refresh() {
  const l = layout();
  const sig = signature(l);
  if (sig === lastSig) return;
  const prevMode = lastSig.split('/').pop();
  lastSig = sig;
  // 切換模式（進出活動）時放開所有手指，避免延續到下一個畫面
  if (prevMode !== store.mode) releaseAll();

  rootEl.classList.toggle('hidden', !!l.hidden);
  const showPhoto = !!l.photoTap;
  if (showPhoto && ui$.photoTap.classList.contains('hidden')) photoTapReadyAt = performance.now() + 400;
  ui$.photoTap.classList.toggle('hidden', !showPhoto);
  if (l.hidden) {
    releaseAll();
    return;
  }
  const sMode = l.stick || 'off';
  const active = sMode === 'full' || sMode === 'horizontal';
  if (!active && stick.id !== null) resetStick();
  stick.mode = active ? sMode : 'off';
  ui$.zone.classList.toggle('hidden', sMode === 'off');
  ui$.zone.classList.toggle('horizontal', sMode.startsWith('horizontal'));
  ui$.zone.classList.toggle('disabled', !active);
  applyButton(ui$.main, l.main);
  applyButton(ui$.alt, l.alt || null);
  applyButton(ui$.back, l.back || null);
}

function tick(now) {
  if (enabled) {
    refresh();
    // 故事館：搖桿左右推到底切換展品，按住時每隔一段時間再切換一次
    if (store.mode === 'museum' && stick.id !== null) {
      const dir = stick.x > 0.6 ? 1 : stick.x < -0.6 ? -1 : 0;
      if (dir !== museumHold.dir) museumHold = { dir, next: now };
      if (dir && now >= museumHold.next) {
        tapKey(dir > 0 ? 'RIGHT' : 'LEFT');
        museumHold.next = now + MUSEUM_REPEAT_MS;
      }
    } else if (museumHold.dir) museumHold = { dir: 0, next: 0 };
  }
  requestAnimationFrame(tick);
}

// ---------- 直向提示 ----------
const portraitMq = window.matchMedia('(orientation: portrait)');

function updateRotateHint() {
  if (!ui$.rotate) return;
  const show = enabled && portraitMq.matches && !rotateDismissed;
  ui$.rotate.classList.toggle('hidden', !show);
}

function buildRotateHint() {
  const wrap = el('div', 'rotate-hint hidden');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', '建議橫向遊玩');
  const card = el('div', 'rotate-card');
  const icon = el('div', 'rotate-icon');
  icon.setAttribute('aria-hidden', 'true');
  const close = el('button', 'btn btn-primary', '直向繼續');
  close.type = 'button';
  close.addEventListener('click', () => {
    rotateDismissed = true;
    writeDismissed();
    updateRotateHint();
  });
  card.append(
    icon,
    el('h2', 'rotate-title', '建議橫向遊玩'),
    el('p', '', '把手機轉成橫向，畫面比較大，搖桿和按鈕也比較好按。'),
    close,
  );
  wrap.append(card);
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  return wrap;
}

// ---------- 啟用 ----------
function enable() {
  if (enabled) return;
  enabled = true;
  document.documentElement.classList.add('touch-mode');
  rootEl.classList.remove('off');
  lastSig = '';
  updateRotateHint();
  bus.emit('touch-changed');
}

export const touch = {
  get enabled() {
    return enabled;
  },

  /** 小鎮移動用：8 方向（斜向與鍵盤一致），mag 為推動程度 0～1 */
  vector() {
    if (!enabled || stick.id === null || stick.mode !== 'full') return { x: 0, y: 0, mag: 0 };
    const raw = Math.hypot(stick.x, stick.y);
    if (raw < DEADZONE) return { x: 0, y: 0, mag: 0 };
    const ang = Math.round(Math.atan2(stick.y, stick.x) / (Math.PI / 4)) * (Math.PI / 4);
    const x = Math.round(Math.cos(ang) * 1000) / 1000;
    const y = Math.round(Math.sin(ang) * 1000) / 1000;
    return { x, y, mag: Math.min(1, (raw - DEADZONE) / (1 - DEADZONE)) };
  },

  /** 夾娃娃左右：-1～1（含無效區） */
  axisX() {
    if (!enabled || stick.id === null || stick.mode !== 'horizontal') return 0;
    const v = stick.x;
    if (Math.abs(v) < DEADZONE) return 0;
    return Math.sign(v) * Math.min(1, (Math.abs(v) - DEADZONE) / (0.75 - DEADZONE));
  },

  /** 依目前操作方式挑選提示文字 */
  pick(keyboardText, touchText) {
    return enabled ? touchText : keyboardText;
  },

  releaseAll,

  init(g) {
    game = g;
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('touch');
    rotateDismissed = readDismissed();

    rootEl = el('div', 'touch-ui off hidden');
    const actions = el('div', 'tc-actions');
    ui$.main = makeButton('tc-main');
    ui$.alt = makeButton('tc-alt');
    ui$.back = makeButton('tc-back');
    actions.append(ui$.back.el, ui$.alt.el, ui$.main.el);
    rootEl.append(buildStick(), actions);

    // 坐著拍照時介面全部收起：輕觸畫面任一處起身
    ui$.photoTap = el('div', 'tc-photo-tap hidden');
    ui$.photoTap.addEventListener('pointerdown', (e) => e.preventDefault());
    ui$.photoTap.addEventListener('pointerup', () => {
      if (performance.now() >= photoTapReadyAt) tapKey('ESC');
    });

    ui$.rotate = buildRotateHint();
    const uiRoot = document.getElementById('ui');
    uiRoot.prepend(rootEl, ui$.photoTap);
    uiRoot.append(ui$.rotate);

    // 觸控取消的保險：任何可能「漏掉放開」的情況都全部放開
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    window.addEventListener('pagehide', releaseAll);
    window.addEventListener('orientationchange', releaseAll);
    bus.on('modal-open', releaseAll);
    portraitMq.addEventListener?.('change', () => { releaseAll(); updateRotateHint(); });

    // 防止手機瀏覽器的雙指縮放、雙擊放大、長按選單
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => { if (enabled) e.preventDefault(); });
    document.addEventListener('contextmenu', (e) => { if (enabled && !(e.target instanceof HTMLInputElement)) e.preventDefault(); });
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 || !(e.target instanceof Element) || !e.target.closest('.modal-body')) e.preventDefault();
    }, { passive: false });

    if (forced !== '0') {
      const coarse = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none) and (any-pointer: coarse)').matches;
      if (forced === '1' || coarse) enable();
      else {
        // 觸控筆電等：第一次用手指觸碰時才開啟
        const onFirstTouch = (e) => {
          if (e.pointerType !== 'touch') return;
          window.removeEventListener('pointerdown', onFirstTouch, true);
          enable();
        };
        window.addEventListener('pointerdown', onFirstTouch, true);
      }
    }
    requestAnimationFrame(tick);
  },
};
