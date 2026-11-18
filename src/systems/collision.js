// 矩形碰撞
// - terrain（地形：河水、堤壁、樹林邊界）：可被 walkAreas（橋面、石階、平台）覆蓋
// - solids（物件：建築牆體、樹幹、圍籬、長椅…）：永遠不可穿越
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * @param map  地圖設定
 * @param extraSolids  執行期產生的碰撞（例如圍籬分段）
 */
export function buildColliders(map, extraSolids = []) {
  const terrain = map.blockers.map((b) => ({ ...b }));
  const walkables = (map.walkAreas || []).map((w) => ({ ...w }));
  const solids = [];
  for (const o of map.objects) {
    if (o.collider) {
      solids.push({ id: o.id, x: o.x + o.collider.x, y: o.y + o.collider.y, w: o.collider.w, h: o.collider.h });
    }
  }
  for (const b of extraSolids) solids.push({ ...b });
  return { terrain, solids, walkables, world: map.world };
}

export function isPointBlocked(col, x, y) {
  if (x < 0 || y < 0 || x > col.world.width || y > col.world.height) return true;
  if (col.solids.some((r) => inRect(x, y, r))) return true;
  if (col.walkables.some((r) => inRect(x, y, r))) return false;
  return col.terrain.some((r) => inRect(x, y, r));
}

/** 以腳底 (fx, fy) 為底邊中心的碰撞框是否被擋住 */
export function isBoxBlocked(col, fx, fy, hitbox) {
  const hw = hitbox.w / 2;
  const top = fy - hitbox.h;
  const pts = [
    [fx - hw, top], [fx + hw, top], [fx - hw, fy], [fx + hw, fy],
    [fx, top], [fx, fy], [fx - hw, fy - hitbox.h / 2], [fx + hw, fy - hitbox.h / 2],
  ];
  return pts.some(([x, y]) => isPointBlocked(col, x, y));
}

export function isInside(rect, x, y) {
  return inRect(x, y, rect);
}
