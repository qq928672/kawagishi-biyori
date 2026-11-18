// 河堤釣魚近景版面（畫面 1280×720；背景為 釣魚近景背景.png 等比縮放鋪滿）
// 調整角色坐點、竿尖、浮標落點、節奏判定條位置都在這裡。
export const FISHING_VIEW = {
  // 坐姿角色（player_sit_fishing.png）
  sit: {
    x: 430, // 臀部坐點的畫面位置 → 對齊石堤上緣（雙腳垂在下方石壁前）
    y: 428,
    height: 236, // 顯示高度
    origin: [0.245, 0.865], // 坐點在圖片中的比例位置（臀部底部）
    rodTip: [0.995, 0.086], // 竿尖在圖片中的比例位置（tools/extract-village.ps1 量出）
    tint: 0xf6eee2, // 輕微暖色，融入夕陽背景（不過度變色）
    contactShadow: { dx: 14, dy: 2, w: 120, h: 16 }, // 臀部與石堤上緣的接觸陰影
    legShadow: { dx: 26, dy: 40, w: 70, h: 22 }, // 雙腳在石壁上的淡影
  },

  // 浮標落點範圍（河面；在判定面板上方，收竿時仍看得到浮標）
  bobber: { xMin: 900, xMax: 1130, yMin: 440, yMax: 492 },

  // 河面動態效果範圍
  water: { x: 0, y: 450, w: 1280, h: 270 },

  // 背景路燈位置（加上柔光）
  lamp: { x: 922, y: 118 },
  // 夜晚亮起的屋內燈光（背景中的窗戶）
  nightLights: [{ x: 515, y: 115, scale: 3.6 }, { x: 1100, y: 110, scale: 2 }],

  // 節奏判定 UI（判定條本體；面板會往上下延伸）
  rhythm: { x: 356, y: 600, w: 568, h: 24 },

  // 上鉤後按空白鍵開始收竿的時間
  biteWindow: 1200,
  // 判定冷卻（毫秒），忽略鍵盤自動重複
  hitCooldown: 200,
  // 每次判定的數值
  scoring: {
    perfect: { progress: 35, tension: -5 },
    good: { progress: 25, tension: 0 },
    miss: { progress: -5, tension: 30 },
    idleCycleTension: 5, // 指標完整來回一次都沒按，斷線風險 +5
  },
};
