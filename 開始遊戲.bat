@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_DIR=%~dp0.tools\node-v26.13.1-win-x64"
set "PATH=%NODE_DIR%;%PATH%"

rem Packages are already in node_modules, so vite is started directly with node.
rem This avoids the bundled npm, whose files are incomplete.
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing packages...
  call npm.cmd install --no-fund --no-audit
)
echo Starting game server... close this window to stop.
"%NODE_DIR%\node.exe" "node_modules\vite\bin\vite.js" --open
pause
