# Voxel Sandbox Logs

Use this folder for project-local runtime notes, captured hitch reports, browser-console excerpts, and debugging breadcrumbs that should survive across Codex sessions without becoming user-facing docs.

`npm.cmd run dev -- --port 5173` launches Vite through `scripts/dev-server.mjs`, which appends `dev-server-start` and `dev-server-stop` records to `server-starts-YYYY-MM-DD.jsonl`. The start record includes the run id, port, package version, branch, commit, dirty-file count, short diff stats, and dirty file names so a later debugging pass can tell exactly which code state produced the logs.

When `npm.cmd run debug:logs` is running, 45ms+ frame spikes from the app append JSONL records to `hitches-YYYY-MM-DD-SESSION-PASS.jsonl` through `http://127.0.0.1:5174/__voxel_hitch_log`. This keeps the main Vite app on `5173` so saved browser worlds do not need to move.

Each browser load starts a fresh hitch session/pass. For manual debugging passes without reloading, run `globalThis.__VOXEL_HITCH_START_PASS__("short-label")` in the browser console before reproducing a bug, then inspect the newest matching hitch file. `globalThis.__VOXEL_HITCH_PASS__()` reports the active pass id.

Local combat logs write under `logs/combat/` as ignored JSONL files. Normal Vite dev sessions use same-origin `POST /__voxel_combat_log`; `npm.cmd run debug:logs` exposes the same endpoint on `127.0.0.1:5174` for preview or automation fallback. Each line records one Terraformer/core/builder/rubble damage event plus context such as world id, selected item, quality, URL, and app version.

At the start of a task, skim recent files here before broad code exploration if the folder contains anything beyond this README.
