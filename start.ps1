$ErrorActionPreference = "Stop"

$DefaultPort = "5193"
$DefaultLogPort = "5194"
$Port = if ($args.Count -gt 0) { $args[0] } else { $DefaultPort }
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $Root

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Error "npm.cmd was not found. Install Node.js, then run this script again."
}

if (-not (Test-Path -Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies..."
  npm.cmd install
}

Write-Host "Starting Voxel Sandbox Engine experiment branch on http://127.0.0.1:$Port"
Write-Host "Main branch can keep http://127.0.0.1:5173 while this branch defaults to http://127.0.0.1:$DefaultPort."
Write-Host "For parallel hitch/combat logs, run: `$env:VOXEL_HITCH_LOG_PORT='$DefaultLogPort'; npm.cmd run debug:logs"
Write-Host "Saved worlds are tied to that exact browser address. If the port is busy, this script fails instead of silently moving your save list."
npm.cmd run dev -- --port $Port
