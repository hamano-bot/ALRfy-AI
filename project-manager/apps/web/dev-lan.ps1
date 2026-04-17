# 開発: dev-alrfy-ai.com:8001/project-manager 用（全インターフェイスで待受）
$nodeDir = Join-Path $env:ProgramFiles "nodejs"
if (-not (Test-Path (Join-Path $nodeDir "npm.cmd"))) {
    Write-Error "npm が見つかりません: $nodeDir。Node.js をインストールしてください。"
    exit 1
}
$env:Path = "$nodeDir;$env:Path"
Set-Location $PSScriptRoot
& npm.cmd run dev:lan @args
