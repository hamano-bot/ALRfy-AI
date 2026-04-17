# PHP built-in server (router.php). Use a different port than the project-manager web app.
# Default: http://127.0.0.1:8000/  -> match PORTAL_API_BASE_URL in project-manager/apps/web/.env.local
param(
    [Parameter(Position = 0)]
    [string]$Listen = "127.0.0.1:8000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$php = Get-Command php -ErrorAction SilentlyContinue
if (-not $php) {
    Write-Error "php is not on PATH. Install PHP and try again."
    exit 1
}

Write-Host ("platform-common: http://{0}/ (router: router.php)" -f $Listen)
Write-Host ("Set PORTAL_API_BASE_URL=http://{0} in apps/web/.env.local" -f $Listen)
Write-Host ""

& php -S $Listen router.php
