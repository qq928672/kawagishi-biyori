// 首頁封面與遊戲開始流程
//
// 流程：讀取畫面 → 首頁（小鎮已建立但暫停，不能操作地圖）→「開始／繼續散步」→ 小鎮恢復。
// 回到首頁（設定裡的按鈕）只是把小鎮暫停、蓋上首頁，不會重建場景，因此不會重複註冊事件。
//
// 按鈕：
// - 有效存檔 → 「繼續散步」；沒有 → 「開始散步」
// - 「玩法說明」「設定」開啟原本的介面視窗（視窗會疊在首頁上方）
// - 「重新開始」只在有存檔時顯示，執行前確認；只清除遊戲進度，不清除教學閱讀紀錄
import { save } from './save.js';
import { store, bus } from './store.js';
import { ui } from './ui.js';

const el = () => document.getElementById('home');
let town = null;
let started = false;
let bound = false;
let busy = false; // 防止連點重複開始

export const COVER_URL = () => (window.matchMedia('(max-width: 699px)').matches ? 'assets/cover/home-sm.webp' : 'assets/cover/home.webp');

function refreshButtons() {
  const has = save.hasSave();
  const root = el();
  root.querySelector('[data-act="start"]').textContent = has ? '繼續散步' : '開始散步';
  root.querySelector('[data-act="restart"]').hidden = !has;
}

function confirmRestart() {
  const body = ui.el('div');
  body.append(
    ui.el('p', '', '要從頭開始新的散步嗎？'),
    ui.el('p', 'hint', '金幣、背包、圖鑑、菜園、委託與角色位置都會清除，無法復原。玩法教學的閱讀紀錄會保留。'),
  );
  ui.openModal({
    title: '重新開始',
    body,
    buttons: [
      { label: '取消', primary: true },
      {
        label: '確定重新開始',
        danger: true,
        onClick: () => {
          save.reset();
          ui.updateWallet();
          ui.updateNightButton();
          bus.emit('time-changed');
          setTimeout(() => {
            bus.emit('progress-reset');
            refreshButtons();
            ui.toast('已重新開始');
          }, 0);
        },
      },
    ],
  });
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || ui.isModalOpen()) return;
  const act = btn.dataset.act;
  if (act === 'start') home.start();
  else if (act === 'help') ui.openHelp('basic');
  else if (act === 'settings') ui.openSettings();
  else if (act === 'restart') confirmRestart();
}

export const home = {
  get started() {
    return started;
  },

  get visible() {
    return !el().classList.contains('hidden');
  },

  /** 小鎮建立完成（已暫停）後由 TownScene 呼叫 */
  attachTown(scene) {
    town = scene;
  },

  show() {
    const root = el();
    if (!bound) {
      bound = true;
      root.addEventListener('click', onClick);
      bus.on('go-home', () => this.returnHome());
    }
    const art = root.querySelector('.hm-art');
    if (!art.getAttribute('src')) art.src = COVER_URL();
    refreshButtons();
    store.mode = 'home';
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => root.classList.add('show'));
    busy = false;
    root.querySelector('[data-act="start"]').focus({ preventScroll: true });
  },

  hide() {
    const root = el();
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!root.classList.contains('show')) root.classList.add('hidden');
    }, 700);
  },

  /** 開始／繼續散步 */
  start() {
    if (busy || !town) return;
    busy = true;
    this.hide();
    const first = !started;
    started = true;
    store.mode = 'explore';
    town.scene.resume();
    town.onGameStart(first);
  },

  /** 從遊戲回到首頁（只在自由散步、沒有開啟視窗時） */
  returnHome() {
    if (!started || !town || store.mode !== 'explore') {
      ui.toast('請先按「返回」或 Esc 結束目前的活動');
      return;
    }
    town.onGameHold();
    town.scene.pause();
    this.show();
  },
};
