#!/usr/bin/env pwsh
<#
Assumes config (e.g., backend\.env) is already setup, starts docker compose.

NOTE ON EXECUTION POLICY:
  Windows blocks script execution by default. If running this script fails
  with a message about execution policies, either:
    - run once: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    - or launch with: pwsh -ExecutionPolicy Bypass -File .\scripts\run-backend.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
Set-Location $Root

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Blue }
function Die($msg)  { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker not found." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Die "Docker is not running." }
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue))  { Die "curl.exe not found." }

if (-not (Test-Path 'backend\.env')) { Die "Missing backend\.env - follow the student setup guide first." }

$backendPortLine = Get-Content 'backend\.env' | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
$BackendPort = '3000'
if ($backendPortLine) {
    $BackendPort = ($backendPortLine -replace '^PORT=', '').Trim(' ', '"')
}
$httpsLine = Get-Content 'backend\.env' | Where-Object { $_ -match '^ENABLE_HTTPS=' } | Select-Object -First 1
$HttpsEnabled = $httpsLine -and (($httpsLine -replace '^ENABLE_HTTPS=', '').Trim(' ', '"').ToLower() -eq 'true')

# With ENABLE_HTTPS=true the backend only speaks HTTPS. Its self-signed
# certificate names the server's public IP, not localhost, so this local
# probe skips certificate verification (-k); it only reads /health.
$Scheme = if ($HttpsEnabled) { 'https' } else { 'http' }
$CurlTlsOpts = if ($HttpsEnabled) { @('-k') } else { @() }
$BackendHealthUrl = if ($env:BACKEND_HEALTH_URL) { $env:BACKEND_HEALTH_URL } else { "${Scheme}://localhost:$BackendPort/health" }

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

Info "Starting backend (docker compose up --build -d)..."
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { Die "docker compose failed." }

Info "Waiting for $BackendHealthUrl ..."
$healthy = $false
for ($i = 0; $i -lt 120; $i++) {
    curl.exe -sf @CurlTlsOpts $BackendHealthUrl *> $null
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $healthy) { Die "Backend not healthy. Try: docker compose logs backend" }

Write-Host ""
Info "Backend is up. Stop with: docker compose down"
