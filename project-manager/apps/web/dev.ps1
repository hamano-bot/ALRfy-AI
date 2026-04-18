# Cursor 等で PATH に nodejs が無いときでも開発サーバーを起動する
$nodeDir = Join-Path $env:ProgramFiles "nodejs"
if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
    Write-Error "npm が見つかりません: $nodeDir。Node.js をインストールしてください。"
    exit 1
}
$env:Path = "$nodeDir;$env:Path"
$env:WATCHPACK_POLLING = "1"
Set-Location $PSScriptRoot
& npm.cmd run dev @args
