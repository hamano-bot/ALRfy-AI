@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

echo.
echo === repair-node-modules (Administrator) ===
echo 対象: %CD%
echo Next の SWC DLL がロックされているとき、所有者と ACL を直してから node_modules を削除します。
echo.

REM まず待ち受けを止める（PATH に npm があれば）
where npx >nul 2>&1 && (npx --yes kill-port 8001 3000 2>nul)

if not exist "node_modules" (
  echo node_modules がありません。npm ci のみ実行します。
  call npm ci
  if errorlevel 1 exit /b 1
  call npm run rebuild
  pause
  exit /b 0
)

echo [1/4] takeown 対象フォルダ（時間がかかることがあります）...
if exist "node_modules\@next\swc-win32-x64-msvc" (
  takeown /f "node_modules\@next\swc-win32-x64-msvc" /r /d y
) else (
  takeown /f "node_modules" /r /d y
)

echo [2/4] icacls で現在ユーザにフルコントロール...
icacls "node_modules" /grant "%USERNAME%:(OI)(CI)F" /t

echo [3/4] rd /s /q node_modules ...
rd /s /q "node_modules"
if exist "node_modules" (
  echo.
  echo まだ削除できませんでした。次を試してください:
  echo - PC を再起動し、Cursor / ターミナルを開かずにこのバッチをもう一度管理者実行
  echo - または Windows Defender でこのフォルダを一時除外
  echo.
  pause
  exit /b 1
)

echo [4/4] npm ci と rebuild ...
call npm ci
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run rebuild
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo 完了しました。
pause
exit /b 0
