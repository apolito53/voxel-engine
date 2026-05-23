# Performance And Hitch Logging

Voxel has local and deployed logging paths so performance debugging can use
fresh evidence instead of stale vibes.

## Local Ports

- App server: `127.0.0.1:5173`
- Hitch-log receiver: `127.0.0.1:5174`
- Preview server: `127.0.0.1:4173`

Run the app with:

```powershell
.\start.ps1
```

Run the local receiver in a second terminal when you want logs and visual runs:

```powershell
npm.cmd run debug:logs
```

`5174` is reserved for the receiver. Do not use it as a temporary Vite port.

## Server Markers

`npm.cmd run dev -- --port 5173` and the startup scripts use
`scripts/dev-server.mjs`, which appends a marker to
`logs/server-starts-YYYY-MM-DD.jsonl` before Vite starts.

Markers include branch, commit, dirty state, package version, port, and runtime
metadata. Use them to tie hitch logs to the exact code pass that produced them.

## Runtime Hitch Records

The debug overlay and hitch logger capture:

- 45ms+ frame spikes.
- At most one sustained sub-60-FPS sample per second.
- CPU buckets for player, chunk, physics, mesh, minimap, render, and other work.
- Rigid debris body/collider pressure.
- Adaptive debris pressure and effective cap state.
- Instanced debris render counts.
- Partial-block lattice/subvoxel pressure.
- Partial-mesh triangle pressure.
- Rubble cover stats when parked rubble exists.

Recent records are available in the browser at:

```js
globalThis.__VOXEL_HITCHES__()
```

Start a focused pass before a repro with:

```js
globalThis.__VOXEL_HITCH_START_PASS__("label")
```

When `npm.cmd run debug:logs` is listening, local records append as
pass-versioned JSONL under `logs/`.

## Deployed Logs

The Vercel build batches the same records to private Vercel Blob JSONL files
through `/api/hitch-log`.

Remote payloads include app version, hitch pass/session ids, source URL, browser
user agent, Vercel environment, deployment URL, git commit, and branch. The
local `.env.local` file contains the Blob token for CLI inspection and must stay
untracked.

Useful CLI flow:

```powershell
vercel blob list --prefix hitches --limit 20
vercel blob get <pathname> --access private
```

## Visual Runs

When the local receiver is running, browser visual tests can upload recordings
under `logs/visual-runs/YYYY-MM-DD/...`.

Each visual run can include:

- `recording.webm`
- Extracted video frames when local `ffmpeg` is available
- `manifest.json`
- `review.html`

Scenario snapshots and recording manifests include compact pressure/hitch
receipts so videos are not the only evidence.

## Idle Guard

Long-running idle sessions are guarded. Once chunk, mesh, save, debris, and
physics work has drained, the app stops the animation loop after five minutes
without input. Hidden/locked sessions use a low-frequency heartbeat instead of
continuous WebGL frames.
