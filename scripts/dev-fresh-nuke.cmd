@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

echo.
echo === MasterBooks: hard reset Next dev (.next locked / "missing error components") ===
echo This stops ALL Node.js on this PC. Save other Node work first.
echo.
pause

echo Stopping Node.js...
taskkill /F /IM node.exe /T 2>nul
echo Waiting 5s for Windows to release file locks...
timeout /t 5 /nobreak >nul

if exist .next (
  attrib -r -h -s .next\*.* /s 2>nul
  rmdir /s /q .next
)

if exist .next (
  echo.
  echo FAILED: .next is still there. Quit Cursor completely, then delete this folder by hand:
  echo   %cd%\.next
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Next.js dev server. Wait until you see "Ready".
echo.
call npx next dev
pause
