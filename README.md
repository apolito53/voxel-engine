# Voxel Sandbox Engine

A strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering,
Rapier handles active rigid-body debris VFX, and the engine owns chunk streaming,
terrain meshing, first-person movement, block edits, partial-block damage,
projectile and hitscan cores, Nova companion affordances, automation hooks, and
performance logging. Chunk generation, chunk meshing, and partial-terrain region
mesh generation use a shared browser `WorkerPool` with priority lanes and sync
fallbacks, keeping the browser-first engine portable while opening the door for
more CPU-heavy systems to move off the main thread.

World units are metric: `1 block = 1 meter`. The active world volume is 96m
tall, with legacy 48m edited chunk saves expanded on read so older maps remain
aligned with the current terrain profile.

Edited chunk snapshots, partial-block terrain damage, last player location,
per-world time of day, and inventory selection/backpack state persist in
IndexedDB browser storage. Clear this site's browser data to reset saved worlds.
The home screen creates, loads, and deletes local saved worlds, with a `World
Type` selector for `Varied Terrain`, `Floating Islands`, and `Classic Legacy`;
`Superflat Lab` creates a flat test world using the reserved `superflat` seed.

New saved-world seeds default to the newer varied terrain profile with broader
plains, mountain-scale ridges, cliff-like slope breaks, sandy washes, terraced
high ground, rocky highlands, and deterministic voxel trees on grassy gentle
ground. `Floating Islands` worlds generate spawn-safe airborne landmasses with
real void between island columns, broader playable plateaus, deeper tapered
stone undersides, mossy crowns, dark bush clumps, and trees on broad island
patches. Existing saved worlds without terrain-profile
metadata stay on the legacy `classic` generator so full edited chunk snapshots
do not border newly streamed terrain from a different profile. Legacy
varied-world chunks and player resume locations are lifted when read so touched
chunks do not remain stuck at their old 48m-era heights. The varied profile
keeps sand focused on lowlands and wash channels so generated worlds still read
primarily as traversable grass and highland terrain; `superflat` remains
reserved for clear test labs.

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
- `I` opens or closes Inventory
- `Space` jump/fly up, `C` crouch/fly down, `Shift` sprint or flight boost
- Low damaged-terrain ledges step up automatically with a short vertical ease,
  so Terraformer stairs do not pop the camera upward. Two-to-four-sub-block
  ledges need a sprint vault, while taller reachable lips clamber only while
  `Space` is held; falling players holding `Space` can catch nearby reachable
  edges even before direct body contact.
- `G` toggles between `Items` and `Blocks`
- `T` toggles click actions between `Semi Auto` and `Full Auto`
- `Mouse wheel` selects within the active lane
- `Left click` fires selected cores, edits exact sub-cells with the Terraformer,
  or erases in the Blocks lane; full-auto mode repeats while held
- `Right click` places selected blocks; hold while firing cores for ADS
- `F` toggles flight
- `F3` toggles the debug overlay, including collapsible performance, lighting,
  combat/damage, and local disk-write diagnostics
- `F4` cycles quality presets
- `F6` toggles Core Aim Preview
- `F8` toggles the scripted test avatar
- `Enter` or `F9` opens Nova Terminal
- `N` toggles Nova Pilot; `B` asks Nova to throw a physics core
- `X` despawns active physics cores

Gameplay settings include Terraformer size, Day/Night Cycle, Time of Day,
Physics Core size, velocity, terrain-damaging bounce count, color, and trail
controls, plus a first-pass procedural sound layer with Sound, Master Volume,
SFX Volume, and UI Volume controls. Experimental settings include the Cycle
Length slider for stretching or compressing the default 20-minute sky cycle.
Audio defaults are intentionally forward in the mix so terrain, movement, and
UI cues are audible without pushing the OS volume to nonsense territory.
Browser audio unlocks after the first normal click or key press.
Graphics settings treat distance as the clear chunk radius where the hard fog
wall starts; the engine streams a hidden extra horizon behind the opaque band so
far chunks vanish into atmosphere instead of popping away at the edge.
Streaming, unloading, and fog-hidden render visibility use a radial chunk
footprint with a small chunk-boundary safety margin, matching the circular fog
wall instead of revealing square terrain corners at the horizon. Hidden-horizon
chunks remain loaded for continuity, but stop drawing after the opaque fog wall
plus a safety ring to reduce far-distance draw pressure. Voxel terrain fog is
also computed from horizontal world distance so high-altitude views keep that
same circular horizon instead of a screen-shaped fog slab. A render-only
fog-colored horizon matte fills the far world below the wall in normal terrain
worlds, so high-altitude views read as atmospheric continuation instead of
empty sky. The old daytime skybox is now a legacy asset; runtime sky visuals
come from a procedural dome with a gradient sky, fixed-direction sun/moon
disks, sparse stars, and cloud bands that stay above the horizon. Fog,
background, horizon matte, and outdoor terrain exposure shift together as the
world clock moves, while the directional shadow direction stays fixed for this
first pass. The night exposure pass dims sky and hemisphere fill, but direct
local Lamp spill remains intact so open and sealed Lamp-lit rooms read
consistently. Placeable Lamp blocks are shader-emissive on every visible Lamp
face, so dense fixtures and Lamp walls read as the same glowing material
regardless of camera/player position or time of day. The local-light renderer
keeps a preset-stable nearest-point proxy layer for smooth per-fragment
highlights: Potato uses no PointLights, then Low through Super Ultra use
`4 / 8 / 16 / 24 / 32`. Unused slots inside the current budget stay visible at
zero intensity so ordinary Lamp edits do not churn Three.js shader variants;
allocated high-water slots above the current quality budget stay hidden and
reusable. Lamps beyond the proxy budget still glow and illuminate terrain
through voxel block light instead of becoming visually dead. Lamp shadow maps
remain parked until the emitter volume can be excluded from its own shadows.
The F3 `Lights` and `Sky` panels report source/proxy/block-light-only pressure
plus the current clock, phase, cycle state, light scales, and fog color.
The engine now also has a worker-safe Minecraft-style block-light data layer:
Lamp blocks emit level 15 into derived 0..15 chunk light arrays, light falls off
by one per orthogonal block step, and solid or partial terrain blocks occlude it.
That block-light field now feeds a dedicated per-vertex `blockLight` terrain
attribute for warm rendered Lamp spill, with chunk terrain vertices averaging
nearby face-adjacent light cells so the rendered falloff is smoother than the
raw integer grid. Damaged partial-block terrain consumes cloned cached
block-light buffers through its mesh worker as a conservative render-only path:
exterior macro and partial-height faces interpolate the same macro-face corner
gradient used by full chunk blocks. Carved bite interiors build a tiny 3x3x3
render-only cavity field per damaged block: visible apertures seed the cached
macro light with a one-third-level entry loss, connected removed subcells lose
another one-third per step, and six directional channels derive the dominant
incoming-light gradient. Cavity walls facing that direction receive full spill,
tangential walls receive softer diffuse light, opposing walls retain only a
faint reflected component, and balanced opposing inputs remain ambient fill.
Sealed pockets keep zero cavity data before the player's global minimum-light
display floor. The emissive Lamp material and quality-scaled near-field
PointLight proxies stay active alongside that derived terrain light.
First-time damage carries accepted block-light buffers across the opaque
full-voxel-to-partial-mask mesh revision. If a relevant light cache genuinely
needs rebuilding, the prior partial mesh remains visible until current light is
available instead of flashing a zero-lit intermediate mesh.
When a damaged voxel is finally destroyed, its regional partial mesh remains as
a brief visual bridge until the current normal chunk mesh (and any touched
cardinal neighbor) has uploaded the newly exposed terrain faces.
Flying instanced debris reads the accepted integer light cache at each shard's
world cell and carries one light value in its instance batch, keeping break
bursts visible in Lamp pools without creating per-fragment lights or draw calls.
`Settings > Graphics` exposes minimum and maximum rendered
block-light level sliders, defaulting to `1..15`, so night readability and Lamp
spill can be tuned without changing the underlying 0..15 chunk light data.
`Settings > Graphics > Debris Shadows` lets loose shards cast shadows,
but it stays off on lower presets because debris storms are already spicy.
Directional shadow bias, baked underside face shading, chunk sky-exposure
buckets, sealed-room interior face shading, and diffuse-tinted terrain specular
are tuned together so overhangs and closed interiors read darker instead of
looking like sunlight leaks upward through terrain.
Thrown Physics Cores have a hard lifetime and fade out once they stay below
useful terrain-damage speed, so spent shots do not linger forever during stress
tests.
`Break Burst Shards` controls the initial destruction spray, while `Active
Ground Debris Cap` trims only supported or sleeping aftermath shards after they
touch down and survive the short burst grace.
`Ground Debris Lifetime` uses a true `0s..60s` cleanup slider, with
`Keep Ground Debris Forever` as a separate explicit toggle for disabling timed
ground cleanup. Even at `0s`, the initial break burst gets the same short grace
window as the ground cap so the lifetime slider cannot thin the eruption.
When shard storms exceed the rigid-body safety cap, the full visible burst still
spawns; overflow shards stay as cheap VFX and existing rigid shards are demoted
to VFX before anything is removed.
Normal pressure cleanup now removes settled debris first and protects awake
airborne shards; if the last-resort airborne emergency path ever fires, the F3
HUD and hitch logs expose it directly.
Rigid debris registration is guarded before entering Rapier, and the F3 Debris
HUD shows a `fault` count if the adapter has to detach shards back to cheap VFX
motion after a Rapier-side failure.
Rigid debris support scanning prioritizes sleeping, near-ground, falling, and
fast shards so stress tests spend less CPU creating temporary colliders for
calm unsupported airborne fragments, and overlapping debris shares support-cell
probe results during each refresh instead of repeating the same crater scan.
Terrain edits, block placement, builder/admin edits, and rubble support changes
wake a bounded local debris stack above the affected cells, including
glue-connected settler clumps that are no longer Rapier-owned, so settled piles
fall when their support is destroyed without restoring broad per-frame scans.
Local hitch logs also receive runtime diagnostic breadcrumbs for WebGL context
loss/restoration and uncaught browser errors, which helps separate a canvas-side
render failure from a full engine freeze.
The current Inventory is a creative catalog: Unarmed, Terraformer, both cores,
and every placeable block remain unlimited-use, with no ammo, durability, or
placement consumption. Its finite 18-slot Backpack is saved per world and
reserved for later pickup/drop gameplay. Unarmed is virtual and cannot occupy a
Backpack slot.

The bottom hotbar shows only the active Items or Blocks lane plus the current
semi/full-auto click mode. The pause-menu `Inventory` panel selects items and
blocks, while `Settings > Gameplay` can show or hide the quick-control hints and
tune audio. Debug and control overlays start hidden by default.

For the full control map, builder tools, settings tabs, and quality presets, see
[docs/controls.md](docs/controls.md).

## Deeper Docs

- [docs/controls.md](docs/controls.md): movement, item/block lanes, builder
  tools, settings, debug keys, and quality presets.
- [docs/architecture.md](docs/architecture.md): engine ownership, runtime flow,
  worker/main-thread contracts, extraction seams, and parked decisions.
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

`CODEBASE_INDEX.md` is the surgical code map for module ownership and its
[task router](CODEBASE_INDEX.md#task-router). `TODO.md`
keeps coherent parked plans visible, while `FEATURE_SPITBALLS.md` keeps looser
feature sparks that are not committed scope yet.

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
