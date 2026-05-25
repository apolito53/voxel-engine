# Voxel Sandbox Engine

A strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering,
Rapier handles active rigid-body debris VFX, and the engine owns chunk streaming,
terrain meshing, first-person movement, block edits, partial-block damage,
projectile and hitscan cores, Nova companion affordances, automation hooks, and
performance logging.

World units are metric: `1 block = 1 meter`.

Edited chunks and the last player location persist in IndexedDB browser storage.
Clear this site's browser data to reset saved worlds. The home screen creates,
loads, and deletes local saved worlds; `Superflat Lab` creates a flat test world
using the reserved `superflat` seed.

## Quick Start

Windows:

```powershell
.\start.ps1
```

Linux/Ubuntu:

```bash
chmod +x ./start.sh
./start.sh
```

Open `http://127.0.0.1:5173`.

Run `npm.cmd run debug:logs` in a second terminal when you want the local
hitch-log receiver on `127.0.0.1:5174`.

Pass a different base-server port as the first argument only for temporary
one-off runs, for example `.\start.ps1 5193` or `./start.sh 5193`. Do not use
`5174`; it is reserved for the hitch-log receiver.

## Ports

- Base Vite server: `5173`
- Hitch-log receiver: `5174`
- Preview server: `4173`

The deployed Vercel site writes 45ms+ hitch records to the private
`voxel-engine-logs` Vercel Blob store through `/api/hitch-log`. The local
`.env.local` file contains the Blob token for CLI inspection and is intentionally
ignored by git.

## Core Controls

- `WASD` move, `Mouse` look, `Esc` pause/release mouse
- `Space` jump/fly up, `C` crouch/fly down, `Shift` sprint or flight boost
- `G` toggles between `Items` and `Blocks`
- `Mouse wheel` selects within the active lane
- `Left click` fires the selected core or erases blocks in build mode
- `Right click` places blocks in build mode; hold while firing cores for ADS
- `F` toggles flight
- `F3` toggles the debug overlay
- `F4` cycles quality presets
- `F6` toggles Core Aim Preview
- `F8` toggles the scripted test avatar
- `Enter` or `F9` opens Nova Terminal
- `N` toggles Nova Pilot; `B` asks Nova to throw a physics core
- `X` despawns active physics cores

For the full control map, builder tools, settings tabs, and quality presets, see
[docs/controls.md](docs/controls.md).

## Deeper Docs

- [docs/controls.md](docs/controls.md): movement, item/block lanes, builder
  tools, settings, debug keys, and quality presets.
- [docs/destruction.md](docs/destruction.md): partial-block terrain damage,
  projectile and hitscan core behavior, debris VFX, and parked rubble mechanics.
- [docs/nova-companion.md](docs/nova-companion.md): Nova Pilot, Nova Terminal,
  local reactions, and the future model-hook direction.
- [docs/performance-hitch-logging.md](docs/performance-hitch-logging.md): local
  and deployed hitch logs, debug metrics, server markers, and visual recordings.
- [docs/automation.md](docs/automation.md): F8 avatar, Codex pilot bridge,
  visual scenario recorder, and Chrome/playtest automation notes.

`CODEBASE_INDEX.md` is the surgical code map for module ownership and
[common change targets](CODEBASE_INDEX.md#common-change-targets). `TODO.md`
keeps parked feature ideas visible without pretending they are current scope.

## Development Checks

```powershell
npm.cmd run typecheck
npm.cmd run docs:check
npm.cmd run test
npm.cmd run build
git diff --check
```

`npm.cmd run test` also runs the Markdown docs-link check, so broken local
README/docs references fail alongside the engine robustness tests.

`npm.cmd run build` may still emit the known large vendor chunk warning; the
warning is expected unless the build fails.
