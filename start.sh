#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORT="5193"
DEFAULT_LOG_PORT="${VOXEL_HITCH_LOG_PORT:-5194}"
PORT="${1:-$DEFAULT_PORT}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js, then run this script again." >&2
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Voxel Sandbox Engine experiment branch on http://127.0.0.1:$PORT"
echo "Main branch can keep http://127.0.0.1:5173 while this branch defaults to http://127.0.0.1:$DEFAULT_PORT."
echo "For parallel hitch/combat logs: VOXEL_HITCH_LOG_PORT=$DEFAULT_LOG_PORT npm run debug:logs"
echo "Saved worlds are tied to that exact browser address. If the port is busy, this script fails instead of silently moving your save list."
npm run dev -- --port "$PORT"
