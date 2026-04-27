#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${CODEX_PYTHON:-}" && -x "${CODEX_PYTHON}" ]]; then
  exec "${CODEX_PYTHON}" "$@"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python "$@"
fi

bundled_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python"
if [[ -x "${bundled_python}" ]]; then
  exec "${bundled_python}" "$@"
fi

echo "No usable Python executable found. Install Python or set CODEX_PYTHON." >&2
exit 127
