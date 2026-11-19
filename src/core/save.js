import { SAVE_KEY } from '../config/gameConfig.js';
import { MAP_VERSION } from '../config/map.js';
import { START } from '../config/economy.js';
import { GARDEN_PLOTS, GARDEN_DEMO } from '../config/crops.js';

// localStorage 存檔（沿用同一個 key）
// v1：{ version:1, inventory:{ id: 數量 }, player }
// v2：金幣、代幣、背包、圖鑑、菜園、委託、設定
// 讀取失敗或欄位缺漏時使用預設值，不讓遊戲崩潰。
// 教學閱讀狀態另存在 TUTORIAL_KEY（src/core/tutorial.js），方便版本更新時獨立處理。
const SAVE_VERSION = 2;

const emptyPlot = () => ({ crop: null, state: 'empty', readyAt: 0 });
const defaultGarden = () => ({ plots: Array.from({ length: GARDEN_PLOTS }, emptyPlot) });
// 新存檔：套用展示田（見 config/crops.js 的 GARDEN_DEMO）
const demoGarden = (now = Date.now()) => {
  const g = defaultGarden();
  for (const d of GARDEN_DEMO) {
    if (g.plots[d.plot]) g.plots[d.plot] = { crop: d.crop, state: d.state, readyAt: now + d.readyInMs };
  }
  return g;
};

const defaults = () => ({
  version: SAVE_VERSION,
  mapVersion: MAP_VERSION,
  coins: START.coins,
  tokens: START.tokens,
  items: { ...START.items },
  fishLog: {}, // { fishId: { count, maxSize } }
  plushLog: {}, // { plushId: count }
  garden: demoGarden(),
  quests: {}, // { questId: 'accepted' | 'done' }
  settings: { sound: true, volume: 0.6, easy: false, night: false },
  player: null,
  stats: { teaCups: 0 },
});

const num = (v, d) => (Number.isFinite(v) ? v : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function migrate(data) {
  const d = defaults();
  if (!data || typeof data !== 'object') return d;

  if (!data.version || data.version < 2) {
    // v1 → v2：原本的收藏數量轉入背包與圖鑑（尺寸未知記為 0）
    const inv = obj(data.inventory);
    for (const [id, n] of Object.entries(inv)) {
      if (!Number.isFinite(n) || n <= 0) continue;
      d.items[id] = (d.items[id] || 0) + n;
      if (id.startsWith('fish_')) d.fishLog[id] = { count: n, maxSize: 0 };
      if (id.startsWith('plush_')) d.plushLog[id] = n;
    }
    d.player = data.mapVersion === MAP_VERSION ? data.player : null;
    d.garden = defaultGarden(); // 舊存檔不套用展示田
    return d;
  }

  const merged = {
    ...d,
    ...data,
    coins: Math.max(0, num(data.coins, d.coins)),
    tokens: Math.max(0, num(data.tokens, d.tokens)),
    items: { ...obj(data.items) },
    fishLog: { ...obj(data.fishLog) },
    plushLog: { ...obj(data.plushLog) },
    quests: { ...obj(data.quests) },
    settings: { ...d.settings, ...obj(data.settings) },
    stats: { ...d.stats, ...obj(data.stats) },
  };
  const plots = Array.isArray(data.garden?.plots) ? data.garden.plots : [];
  merged.garden = { plots: defaultGarden().plots.map((p, i) => ({ ...p, ...obj(plots[i]) })) };
  if (data.mapVersion !== MAP_VERSION) {
    merged.player = null;
    merged.mapVersion = MAP_VERSION;
  }
  return merged;
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[save] 讀取存檔失敗，使用新存檔', err);
    return defaults();
  }
}

export const save = {
  data: load(),

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[save] 無法寫入 localStorage', err);
    }
  },

  // ---- 物品 ----
  count(id) {
    return this.data.items[id] || 0;
  },
  addItem(id, n = 1) {
    this.data.items[id] = this.count(id) + n;
    this.persist();
    return this.data.items[id];
  },
  /** 扣除物品；不足時不扣、回傳 false */
  removeItem(id, n = 1) {
    if (this.count(id) < n) return false;
    this.data.items[id] = this.count(id) - n;
    if (this.data.items[id] <= 0) delete this.data.items[id];
    this.persist();
    return true;
  },
  hasAll(need) {
    return Object.entries(need).every(([id, n]) => this.count(id) >= n);
  },

  // ---- 金幣與代幣 ----
  get coins() {
    return this.data.coins;
  },
  get tokens() {
    return this.data.tokens;
  },
  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.persist();
    return true;
  },
  addCoins(n) {
    this.data.coins += n;
    this.persist();
  },
  spendToken(n = 1) {
    if (this.data.tokens < n) return false;
    this.data.tokens -= n;
    this.persist();
    return true;
  },
  addTokens(n) {
    this.data.tokens += n;
    this.persist();
  },

  // ---- 圖鑑 ----
  recordFish(id, size) {
    const log = this.data.fishLog[id] || { count: 0, maxSize: 0 };
    const isNewSpecies = log.count === 0;
    const isRecord = size > log.maxSize;
    log.count += 1;
    if (isRecord) log.maxSize = size;
    this.data.fishLog[id] = log;
    this.data.items[id] = this.count(id) + 1;
    this.persist();
    return { isNewSpecies, isRecord, count: log.count };
  },
  recordPlush(id) {
    this.data.plushLog[id] = (this.data.plushLog[id] || 0) + 1;
    this.data.items[id] = this.count(id) + 1;
    this.persist();
    return this.data.plushLog[id];
  },

  // ---- 其他 ----
  setPlayer(x, y, facing) {
    const p = this.data.player;
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (p && p.x === nx && p.y === ny && p.facing === facing) return;
    this.data.player = { x: nx, y: ny, facing };
    this.persist();
  },

  /**
   * 是否有「有效存檔」（首頁顯示「繼續散步」）：存檔可以讀取，且真的玩過
   * （有角色位置、魚或玩偶紀錄、委託、喝過茶）。只改過設定不算。
   */
  hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return false;
      const any = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0;
      return !!d.player || any(d.fishLog) || any(d.plushLog) || any(d.quests) || (d.stats?.teaCups || 0) > 0;
    } catch {
      return false;
    }
  },

  setting(key, value) {
    this.data.settings[key] = value;
    this.persist();
  },

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      /* ignore */
    }
    this.data = defaults();
  },
};
