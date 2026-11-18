# 河岸日和：部署到 GitHub Pages

建置產物在 `dist/`（約 36 MB、125 個檔案）。`vite.config.js` 的 `base: './'` 讓所有路徑都是相對路徑，
所以放在 `https://<帳號>.github.io/<儲存庫名稱>/` 這種子路徑下也能直接執行。

## 方法 A：自動部署（建議）

專案已附 `.github/workflows/deploy-pages.yml`。之後每次推送到 `main`，GitHub 會自動建置並更新網站。

1. 在 GitHub 建立新的儲存庫（例如 `kawagishi-biyori`），可以設為 Public。
2. 在 `game` 資料夾開啟 PowerShell，執行：

   ```powershell
   git init
   git add .
   git commit -m "河岸日和：加入手機觸控操作"
   git branch -M main
   git remote add origin https://github.com/<帳號>/<儲存庫名稱>.git
   git push -u origin main
   ```

   `.gitignore` 已排除 `node_modules/`、`dist/`、`.tools/`，不會上傳隨附的 Node 與套件。
3. 到儲存庫的 **Settings → Pages → Build and deployment → Source**，選 **GitHub Actions**。
4. 到 **Actions** 分頁，等「Deploy to GitHub Pages」完成（約 1～2 分鐘）。
   網址會顯示在工作結果中：`https://<帳號>.github.io/<儲存庫名稱>/`。

## 方法 B：只上傳建置好的 dist

1. 在本機重新建置（隨附的 npm 不完整，直接用 node 執行 vite）：

   ```powershell
   .\.tools\node-v26.13.1-win-x64\node.exe node_modules\vite\bin\vite.js build
   ```

2. 建立一個新的儲存庫，把 `dist/` 裡面的**所有檔案**（含 `.nojekyll`）放在儲存庫根目錄並推送到 `main`。
3. **Settings → Pages → Source** 選 **Deploy from a branch**，分支選 `main`、資料夾選 `/ (root)`。

## 上線後檢查

- 用手機開網址：應出現左下搖桿、右下「互動」按鈕；直向時出現「建議橫向遊玩」提示，可按「直向繼續」關閉。
- 用電腦開網址：不顯示觸控按鈕，鍵盤操作與原本相同。
- 想在電腦上預覽手機介面：網址加 `?touch=1`；在觸控裝置上強制關閉：`?touch=0`。

## 注意

- 存檔放在瀏覽器的 localStorage，依網址區分：GitHub Pages 上的進度和本機 `localhost` 的進度是分開的。
- 「加到主畫面」後以全螢幕開啟，畫面會更大（iOS Safari：分享 → 加入主畫面）。
