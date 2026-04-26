#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"
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

echo "Starting Voxel Sandbox Engine on http://127.0.0.1:$PORT"
npm run dev -- --port "$PORT"
