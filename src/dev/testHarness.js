// 開發用測試工具（只在 npm run dev 載入，build 不包含）
// 在瀏覽器 console 使用：T.step(60) 推進 60 格、T.hold('d','KeyD',68,60) 按住 D 一秒、T.p() 查看主角狀態
const T = {
  t: performance.now(),
  // 透過 Phaser 的 TimeStep 推進，補間動畫與時鐘會和實際遊玩一樣前進
  step(n = 1, dt = 16.67) {
    const loop = window.__game.loop;
    if (this.t < loop.lastTime) this.t = loop.lastTime;
    for (let i = 0; i < n; i++) {
      this.t += dt;
      loop.step(this.t);
    }
  },
  key(type, key, code, keyCode) {
    window.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true }));
  },
  press(key, code, keyCode) {
    this.key('keydown', key, code, keyCode); this.step(2);
    this.key('keyup', key, code, keyCode); this.step(2);
  },
  hold(key, code, keyCode, frames) {
    this.key('keydown', key, code, keyCode); this.step(frames);
    this.key('keyup', key, code, keyCode); this.step(1);
  },
  // 依真實時間推進 ms 毫秒（補間動畫用的是真實時鐘，需要真的等待）
  async run(ms, until) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 16));
      const now = performance.now();
      this.t = Math.max(this.t, now);
      window.__game.loop.step(this.t);
      if (until && until()) return true;
    }
    return false;
  },
  // 面板隱藏時遊戲迴圈不會自動跑：一路推進到小鎮場景就緒
  async boot() {
    for (let i = 0; i < 80; i++) {
      this.step(5);
      await new Promise((r) => setTimeout(r, 120));
      if (window.__game.scene.isActive('Town') && window.__game.textures.exists('ground')) break;
    }
    this.step(20);
    return window.__game.scene.isActive('Town');
  },
  hideHud(on = true) { document.querySelectorAll('#ui > *').forEach((e) => { if (!e.classList.contains('modal-overlay')) e.style.visibility = on ? 'hidden' : ''; }); },
  scene(k) { return window.__game.scene.getScene(k); },
  town() { return this.scene('Town'); },
  p() {
    const s = this.town();
    return { x: Math.round(s.feet.x), y: Math.round(s.feet.y), facing: s.facing, frame: s.player.frame.name, walking: s.walking, depth: Math.round(s.player.depth) };
  },
  tp(x, y) { const s = this.town(); s.feet.x = x; s.feet.y = y; this.step(1); },
  view(x, y, z = 1) { const c = this.town().cameras.main; c.stopFollow(); c.setZoom(z); c.centerOn(x, y); this.step(2); },
  follow() { const s = this.town(); const c = s.cameras.main; c.setZoom(1); c.startFollow(s.player, false, 0.1, 0.1); this.step(2); },
  // 把目前畫面截成圖片覆蓋在頁面上（面板隱藏時 WebGL 畫面不會更新，用來檢查畫面）
  snap() {
    return new Promise((res) => {
      window.__game.renderer.snapshot((img) => {
        let o = document.getElementById('snapimg');
        if (!o) {
          o = document.createElement('img');
          o.id = 'snapimg';
          o.style.cssText = 'position:fixed;inset:0;width:100%;z-index:99;background:#000;pointer-events:none';
          document.body.append(o);
        }
        o.onload = () => setTimeout(() => res('ok'), 400);
        o.src = img.src;
        o.style.display = 'block';
      });
      this.step(1);
    });
  },
  // 把遊戲畫面（canvas，不含 HTML 介面）存成 screenshots/<name>.png
  save(name) {
    return new Promise((res) => {
      window.__game.renderer.snapshot(async (img) => {
        const blob = await (await fetch(img.src)).blob();
        const r = await fetch(`/__screenshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
        res(await r.text());
      });
      this.step(1);
    });
  },
  unsnap() { const o = document.getElementById('snapimg'); if (o) o.style.display = 'none'; },
};
window.T = T;
