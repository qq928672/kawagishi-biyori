import { TUTORIAL_KEY } from '../config/gameConfig.js';

// 教學閱讀狀態：獨立的 localStorage key，每種玩法分開記錄。
// localStorage 無法使用（隱私模式、被封鎖）時，改用記憶體，至少本次遊玩不會重複彈出。
let state = {};
let storageOk = true;

try {
  const raw = localStorage.getItem(TUTORIAL_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  state = parsed && typeof parsed === 'object' ? parsed : {};
} catch {
  storageOk = false;
  state = {};
}

function persist() {
  if (!storageOk) return;
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify(state));
  } catch {
    storageOk = false;
  }
}

export const tutorial = {
  isRead(id) {
    return !!state[id];
  },
  markRead(id) {
    if (state[id]) return;
    state[id] = Date.now();
    persist();
  },
  /** 重設進度時一併清除 */
  reset() {
    state = {};
    try {
      localStorage.removeItem(TUTORIAL_KEY);
    } catch {
      /* 記憶體已清空即可 */
    }
  },
  get storageAvailable() {
    return storageOk;
  },
};
