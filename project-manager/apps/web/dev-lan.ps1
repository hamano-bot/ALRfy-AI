# 開発: dev-ALRfy-AI.com:8001/project-list 用（全インターフェイスで待受）
$nodeDir = Join-Path $env:ProgramFiles "nodejs"
if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
    Write-Error "npm が見つかりません: $nodeDir。Node.js をインストールしてください。"
    exit 1
}
$env:Path = "$nodeDir;$env:Path"
# Webpack の watchpack が安定し、保存のたびに CSS チャンク参照だけズレてスタイルが消える現象を抑える
$env:WATCHPACK_POLLING = "1"
Set-Location $PSScriptRoot
& npm.cmd run dev:lan @args
