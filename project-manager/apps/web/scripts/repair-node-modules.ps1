# 次の SWC ネイティブ DLL がロックされていると Remove-Item / npm ci が EPERM になる。
# 先にポート・Node プロセスを止めてから node_modules を消す。
$ErrorActionPreference = "Continue"
$webRoot = Split-Path -Parent $PSScriptRoot
Set-Location $webRoot

Write-Host "== repair-node-modules (cwd: $webRoot) ==" -ForegroundColor Cyan

# 開発でよく使うポートの待ち受けを終了（kill-port が入っていれば）
$npxKill = Get-Command npx -ErrorAction SilentlyContinue
if ($npxKill) {
  try {
    npx --yes kill-port 8001 3000 2>$null
    Start-Sleep -Milliseconds 800
  } catch { }
}

$script:stopped = 0

function Stop-ProcessByIdSafe([int]$ProcessId) {
  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    $script:stopped++
    return $true
  } catch {
    return $false
  }
}

# 1) C:\Program Files\nodejs\node.exe
try {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
    $exe = $_.ExecutablePath
    if ($exe -and ($exe -like "*\Program Files\nodejs\node.exe")) {
      Stop-ProcessByIdSafe $_.ProcessId
    }
  }
} catch { }

# 2) このリポジトリの apps\web をコマンドラインに含む node（nvm / 別パスの node も対象）
try {
  $webNorm = (Resolve-Path -LiteralPath $webRoot).Path
} catch {
  $webNorm = $webRoot
}
try {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
    $exe = $_.ExecutablePath
    if ($exe -and ($exe -like "*\Programs\cursor\resources\app\resources\helpers\node.exe")) {
      return
    }
    if ($exe -and ($exe -like "*\Adobe\Adobe Creative Cloud Experience\libs\node.exe")) {
      return
    }
    $cl = $_.CommandLine
    if (-not $cl) {
      return
    }
    if ($cl.Contains($webNorm)) {
      Stop-ProcessByIdSafe $_.ProcessId
    }
  }
} catch { }

Write-Host "Stopped $script:stopped node.exe process(es) (ports + Program Files + cwd match)." -ForegroundColor Yellow
Start-Sleep -Seconds 3

if (-not (Test-Path "node_modules")) {
  Write-Host "node_modules not found; running npm ci only." -ForegroundColor Green
  npm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm run rebuild
  exit $LASTEXITCODE
}

function Remove-NodeModulesTree {
  param([string]$nmPath)

  if (-not (Test-Path $nmPath)) {
    return $true
  }

  Write-Host "Trying Remove-Item -Recurse -Force ..." -ForegroundColor Yellow
  try {
    Remove-Item -Recurse -Force -LiteralPath $nmPath -ErrorAction Stop
    return $true
  } catch {
    Write-Host "Remove-Item failed: $_" -ForegroundColor DarkYellow
  }

  # Windows: 空フォルダへ robocopy /MIR で実質中身を消してから rmdir（ロックが弱いケースで通る）
  Write-Host "Trying robocopy mirror (empty -> node_modules) ..." -ForegroundColor Yellow
  $empty = Join-Path $env:TEMP ("nm-empty-" + [guid]::NewGuid().ToString("n"))
  try {
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    $absNm = (Resolve-Path -LiteralPath $nmPath).Path
    & robocopy $empty $absNm /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
    cmd.exe /c "rd /s /q `"$absNm`"" 2>$null
    if (-not (Test-Path $nmPath)) {
      return $true
    }
  } catch {
    Write-Host "robocopy/rd failed: $_" -ForegroundColor DarkYellow
  }

  # 最後に cmd の rd のみ
  Write-Host "Trying cmd rd /s /q ..." -ForegroundColor Yellow
  try {
    $absNm = (Resolve-Path -LiteralPath $nmPath).Path
    cmd.exe /c "rd /s /q `"$absNm`""
    if (-not (Test-Path $nmPath)) {
      return $true
    }
  } catch {
    Write-Host "cmd rd failed: $_" -ForegroundColor DarkYellow
  }

  return -not (Test-Path $nmPath)
}

Write-Host "Removing node_modules ..." -ForegroundColor Yellow
$ok = Remove-NodeModulesTree -nmPath (Join-Path $webRoot "node_modules")

if (-not $ok) {
  Write-Host ""
  Write-Host "FAILED to delete node_modules completely." -ForegroundColor Red
  Write-Host "- Close Cursor completely, then run as Administrator:" -ForegroundColor Yellow
  Write-Host "    scripts\repair-node-modules-admin.cmd" -ForegroundColor Cyan
  Write-Host "  (takeown / icacls のあと rd し、npm ci まで実行します)" -ForegroundColor Yellow
  Write-Host "- Or: reboot PC, do not start dev server, then npm run repair again." -ForegroundColor Red
  Write-Host "- Exclude this folder from real-time antivirus if it keeps failing." -ForegroundColor Red
  exit 1
}

Write-Host "npm ci ..." -ForegroundColor Green
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "npm run rebuild ..." -ForegroundColor Green
npm run rebuild
exit $LASTEXITCODE
