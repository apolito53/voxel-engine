$ErrorActionPreference = "Stop"

$Port = if ($args.Count -gt 0) { $args[0] } else { "5173" }
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $Root

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Error "npm.cmd was not found. Install Node.js, then run this script again."
}

if (-not (Test-Path -Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies..."
  npm.cmd install
}

Write-Host "Starting Voxel Sandbox Engine on http://127.0.0.1:$Port"
npm.cmd run dev -- --port $Port
