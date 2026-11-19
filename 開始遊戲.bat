@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0" || goto failed

rem Prefer the project's Node runtime when it is present.
set "NODE_EXE=node.exe"
if exist ".tools\node-v26.13.1-win-x64\node.exe" (
  set "PATH=%~dp0.tools\node-v26.13.1-win-x64;%PATH%"
) else (
  where.exe node.exe >nul 2>&1
  if errorlevel 1 set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
"%NODE_EXE%" --version >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or later and reopen this file.
  goto failed
)

if not exist "node_modules\vite\bin\vite.js" (
  where.exe npm.cmd >nul 2>&1
  if errorlevel 1 (
    echo Game dependencies are missing. Install Node.js with npm and reopen this file.
    goto failed
  )
  echo Installing packages...
  call npm.cmd ci --no-fund --no-audit
  if errorlevel 1 goto failed
)

echo Starting game server... close this window to stop.
"%NODE_EXE%" "node_modules\vite\bin\vite.js" --open %*
if errorlevel 1 goto failed
exit /b 0

:failed
pause
exit /b 1
