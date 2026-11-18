import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// 開發用：接收遊戲畫面截圖（POST /__screenshot?name=xxx），存到 screenshots/xxx.png
// 只在 npm run dev 生效，build 不包含
function screenshotSaver() {
  return {
    name: 'screenshot-saver',
    apply: 'serve',
    configureServer(server) {
      // 素材最佳化（開發用）：POST /__asset?name=xxx.webp → 存到 public/assets/opt/xxx.webp（見 src/dev/optimizeAssets.js）
      server.middlewares.use('/__asset', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const url = new URL(req.url, 'http://x');
        const name = url.searchParams.get('name') || '';
        if (!/^[\w-]+\.webp$/.test(name)) { res.statusCode = 400; return res.end('bad name'); }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = path.resolve(__dirname, 'public/assets/opt');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
      server.middlewares.use('/__screenshot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const url = new URL(req.url, 'http://x');
        const name = (url.searchParams.get('name') || 'shot').replace(/[^\p{L}\p{N}_-]/gu, '_');
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = path.resolve(__dirname, 'screenshots');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${name}.png`);
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  // 相對路徑：build 後的 dist/ 可放在任何子資料夾或靜態主機
  base: './',
  server: {
    port: 5173,
    // 素材原檔、簡報資料夾、截圖不需要監看（檔案被其他程式開啟時監看會失敗）
    watch: { ignored: ['**/素材/**', '**/承翰_自我介紹簡報/**', '**/screenshots/**', '**/.tools/**', '**/dist/**', '**/tools/**'] },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  plugins: [screenshotSaver()],
});
