# PATH を直さずに npm install する（初回・依存更新用）
$nodeDir = Join-Path $env:ProgramFiles "nodejs"
if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
    Write-Error "npm が見つかりません: $nodeDir。Node.js をインストールしてください。"
    exit 1
}
$env:Path = "$nodeDir;$env:Path"
Set-Location $PSScriptRoot
& npm.cmd install @args
