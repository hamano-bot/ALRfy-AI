@echo off
chcp 65001 >nul
cd /d "%~dp0.."
REM PowerShell の実行ポリシーで npm.ps1 が弾かれる環境向け（npm.cmd を明示）
call npm.cmd run dev:lan
exit /b %ERRORLEVEL%
