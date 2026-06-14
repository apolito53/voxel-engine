# Voxel Sandbox Engine

A strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering,
Rapier handles active rigid-body debris VFX, and the engine owns chunk streaming,
terrain meshing, first-person movement, block edits, partial-block damage,
projectile and hitscan cores, Nova companion affordances, automation hooks, and
performance logging. Chunk generation, chunk meshing, and partial-terrain region
mesh generation use a shared browser `WorkerPool` with priority lanes and sync
fallbacks, keeping the browser-first engine portable while opening the door for
more CPU-heavy systems to move off the main thread.

World units are metric: `1 block = 1 meter`.

Edited chunks and the last player location persist in IndexedDB browser storage.
Clear this site's browser data to reset saved worlds. The home screen creates,
loads, and deletes local saved worlds; `Superflat Lab` creates a flat test world
using the reserved `superflat` seed.

New saved-world seeds use the newer varied terrain profile with broader plains,
ridges, sandy washes, terraced high ground, rocky highlands, and deterministic
voxel trees on grassy gentle ground. Existing saved worlds without
terrain-profile metadata stay on the legacy `classic` generator so full edited
chunk snapshots do not border newly streamed terrain from a different profile.
The varied profile keeps sand focused on lowlands and wash channels so generated
worlds still read primarily as traversable grass and highland terrain;
`superflat` remains reserved for clear test labs.

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
hitch/combat-log receiver on `127.0.0.1:5174`. Normal Vite dev sessions also
write combat damage JSONL through the same-origin `/__voxel_combat_log`
endpoint.

Pass a different base-server port as the first argument only for temporary
one-off runs, for example `.\start.ps1 5193` or `./start.sh 5193`. Do not use
`5174`; it is reserved for the hitch-log receiver.

## Ports

- Base Vite server: `5173`
- Hitch/combat-log receiver: `5174`
- Preview server: `4173`

The deployed Vercel site writes 45ms+ hitch records to the private
`voxel-engine-logs` Vercel Blob store through `/api/hitch-log`. The local
`.env.local` file contains the Blob token for CLI inspection and is intentionally
ignored by git.

## Core Controls

- `WASD` move, `Mouse` look, `Esc` pause/release mouse
- `Space` jump/fly up, `C` crouch/fly down, `Shift` sprint or flight boost
- `G` toggles between `Items` and `Blocks`
- `T` toggles click actions between `Semi Auto` and `Full Auto`
- `Mouse wheel` selects within the active lane
- `Left click` fires selected cores, edits exact sub-cells with the Terraformer,
  or erases in the Blocks lane; full-auto mode repeats while held
- `Right click` places selected blocks; hold while firing cores for ADS
- `F` toggles flight
- `F3` toggles the debug overlay, including the recent combat/damage log and
  local disk-write status
- `F4` cycles quality presets
- `F6` toggles Core Aim Preview
- `F8` toggles the scripted test avatar
- `Enter` or `F9` opens Nova Terminal
- `N` toggles Nova Pilot; `B` asks Nova to throw a physics core
- `X` despawns active physics cores

Gameplay settings include Terraformer size plus Physics Core size, velocity,
terrain-damaging bounce count, color, and trail controls.
Experimental settings include a local instanced `Ripple Cube Field` visual toy
that reacts to player movement without changing terrain or save data.
Graphics settings treat distance as the clear chunk radius where fog starts;
the engine streams a hidden extra horizon behind the opaque part of that curtain
so far chunks fade out instead of popping away at the edge. Hidden-horizon
chunks remain loaded for continuity, but stop drawing after the opaque fog
curtain plus a safety ring to reduce far-distance draw pressure.
Thrown Physics Cores have a hard lifetime and fade out once they stay below
useful terrain-damage speed, so spent shots do not linger forever during stress
tests.
`Break Burst Shards` controls the initial destruction spray, while `Active
Ground Debris Cap` trims only supported or sleeping aftermath shards after they
touch down and survive the short burst grace.
When shard storms exceed the rigid-body safety cap, the full visible burst still
spawns; overflow shards stay as cheap VFX and existing rigid shards are demoted
to VFX before anything is removed.
Rigid debris support scanning prioritizes sleeping, near-ground, falling, and
fast shards so stress tests spend less CPU creating temporary colliders for
calm unsupported airborne fragments, and overlapping debris shares support-cell
probe results during each refresh instead of repeating the same crater scan.
Local hitch logs also receive runtime diagnostic breadcrumbs for WebGL context
loss/restoration and uncaught browser errors, which helps separate a canvas-side
render failure from a full engine freeze.
The bottom hotbar shows the active Items or Blocks lane plus the current
semi/full-auto click mode. The pause-menu
`Loadout` panel selects tools and blocks, while `Settings > Gameplay` can show
or hide the quick-control hints. Debug and control overlays start hidden by
default.

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
  and deployed hitch logs, browser-frame diagnostics, persistent combat damage
  logs, split physics/debris timing metrics, server markers, and visual
  recordings.
- [docs/automation.md](docs/automation.md): F8 avatar, Codex pilot bridge,
  visual scenario recorder, and Chrome/playtest automation notes.

`CODEBASE_INDEX.md` is the surgical code map for module ownership and
[common change targets](CODEBASE_INDEX.md#common-change-targets). `TODO.md`
keeps parked feature ideas visible without pretending they are current scope.

## Development Checks

```powershell
npm.cmd run typecheck
npm.cmd run source:check
npm.cmd run docs:check
npm.cmd run test
npm.cmd run build
git diff --check
```

`npm.cmd run test` also runs the Markdown docs-link check, so broken local
README/docs references and TypeScript source-hygiene regressions fail alongside
the engine robustness tests.
`npm.cmd run validate` runs the normal test, production build, and whitespace
diff check sequence in one pass.
GitHub Actions runs the same validation command on pushes and pull requests to
`main`, and the `CI` workflow can be triggered manually from GitHub when a fresh
remote check is useful.

`npm.cmd run build` may still emit the known large vendor chunk warning; the
warning is expected unless the build fails.
