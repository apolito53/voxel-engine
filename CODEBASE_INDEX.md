# Codebase Index

Last reviewed: 2026-07-13 for `v0.19.1`.

This file is the fast routing map. It answers where to begin, who owns a
behavior, and which invariants are easy to break. Read
[docs/architecture.md](docs/architecture.md) only when a task needs deeper
runtime contracts or extraction boundaries.

## Current State

- Strict TypeScript browser app built with Vite and native ES modules.
- Three.js owns rendering; Rapier owns admitted active debris rigid bodies.
- A shared `WorkerPool` runs chunk generation, chunk meshing, partial-terrain
  meshing, and derived block-light jobs with revision guards and sync fallback.
- World scale is `1 block = 1 meter`; current worlds are 96m tall.
- IndexedDB stores local worlds, edited chunk snapshots, partial damage, player
  pose, day/night state, and inventory metadata.
- The normal runtime treats loose debris as temporary VFX. Durable terrain
  truth lives in full voxels and sparse 3x3x3 partial-block lattices.
- First/third-person view is presentation state. The physical eye camera remains
  authoritative for player movement, saves, tool reach, and reticle aim.
- Local development uses `5173` for Vite and `5174` for hitch/combat logs.

## Commands

- Install: `npm.cmd install`
- Start app and local diagnostics: `.\start.ps1`
- Dev server only: `npm.cmd run dev -- --port 5173`
- Log receiver only: `npm.cmd run debug:logs`
- Type check: `npm.cmd run typecheck`
- Tests and docs checks: `npm.cmd run test`
- Production build: `npm.cmd run build`
- Full local gate: `npm.cmd run validate`

## Task Router

| Task | Start here | Related owners or docs |
| --- | --- | --- |
| App lifecycle, render loop, input dispatch | [src/main.ts](src/main.ts) | [index.html](index.html), [src/style.css](src/style.css), [docs/architecture.md](docs/architecture.md) |
| World streaming, edits, chunk scheduling | [src/world.ts](src/world.ts) | [src/chunk.ts](src/chunk.ts), [src/chunkJobs.ts](src/chunkJobs.ts), [src/chunkProtocol.ts](src/chunkProtocol.ts) |
| Terrain profiles, trees, world height | [src/terrain.ts](src/terrain.ts) | [src/voxelConstants.ts](src/voxelConstants.ts), [src/blocks.ts](src/blocks.ts), [src/chunkStorage.ts](src/chunkStorage.ts) |
| Chunk materials, atlas, voxel lighting | [src/blockTextureAtlas.ts](src/blockTextureAtlas.ts) | [src/blockColors.ts](src/blockColors.ts), [src/blockTextureTiles.ts](src/blockTextureTiles.ts), [src/voxelLighting.ts](src/voxelLighting.ts) |
| Lamp block light and local light proxies | [src/voxelBlockLight.ts](src/voxelBlockLight.ts) | [src/blockLightJobs.ts](src/blockLightJobs.ts), [src/localLights.ts](src/localLights.ts), [src/localLightRenderer.ts](src/localLightRenderer.ts) |
| Sky, day/night, shadows, fog horizon | [src/dayNightCycle.ts](src/dayNightCycle.ts) | [src/skybox.ts](src/skybox.ts), [src/horizonMatte.ts](src/horizonMatte.ts), [src/lighting.ts](src/lighting.ts) |
| Partial terrain carving and geometry | [src/partialBlocks.ts](src/partialBlocks.ts) | [src/partialBlockMeshField.ts](src/partialBlockMeshField.ts), [src/partialBlockMeshWorker.ts](src/partialBlockMeshWorker.ts), [docs/destruction.md](docs/destruction.md) |
| Player movement, view, avatar, partial collision | [src/player.ts](src/player.ts) | [src/playerView.ts](src/playerView.ts), [src/playerAvatar.ts](src/playerAvatar.ts), [src/collision.ts](src/collision.ts), [src/playerMovement.ts](src/playerMovement.ts) |
| Projectile cores, contacts, fragments | [src/physics.ts](src/physics.ts) | [src/physicsCoreLaunch.ts](src/physicsCoreLaunch.ts), [src/coreAimPreview.ts](src/coreAimPreview.ts), [src/hitscanCore.ts](src/hitscanCore.ts) |
| Debris rigid bodies, cleanup, rendering | [src/rigidDebris.ts](src/rigidDebris.ts) | [src/debrisSettler.ts](src/debrisSettler.ts), [src/physicsInstancing.ts](src/physicsInstancing.ts), [src/debrisCleanup.ts](src/debrisCleanup.ts) |
| Items, inventory, hotbar, click mode | [src/items.ts](src/items.ts) | [src/inventory.ts](src/inventory.ts), [src/hotbar.ts](src/hotbar.ts), [src/clickFireMode.ts](src/clickFireMode.ts) |
| Saves, world list, migration | [src/chunkStorage.ts](src/chunkStorage.ts) | [src/worldMenu.ts](src/worldMenu.ts), [src/deleteWorldDialog.ts](src/deleteWorldDialog.ts) |
| Builder, admin fixtures, previews | [src/builderTools.ts](src/builderTools.ts) | [src/builderPreview.ts](src/builderPreview.ts), [src/adminCommands.ts](src/adminCommands.ts) |
| Settings and quality budgets | [src/qualityPresets.ts](src/qualityPresets.ts) | [src/qualitySettings.ts](src/qualitySettings.ts), [src/qualityController.ts](src/qualityController.ts), [docs/controls.md](docs/controls.md) |
| Debug HUD, hitch and combat logs | [src/debugHud.ts](src/debugHud.ts) | [src/performanceHitchLog.ts](src/performanceHitchLog.ts), [src/frameDiagnostics.ts](src/frameDiagnostics.ts), [src/combatLog.ts](src/combatLog.ts) |
| Worker jobs and scheduling | [src/workerPool.ts](src/workerPool.ts) | [src/engineWorker.ts](src/engineWorker.ts), job-specific protocol and pure job modules |
| Browser automation and visual runs | [src/codexPilot.ts](src/codexPilot.ts) | [src/testAvatar.ts](src/testAvatar.ts), [src/visualTestScenarios.ts](src/visualTestScenarios.ts), [docs/automation.md](docs/automation.md) |
| Nova Pilot and Terminal | [src/novaPilot.ts](src/novaPilot.ts) | [src/novaContext.ts](src/novaContext.ts), [src/novaChat.ts](src/novaChat.ts), [docs/nova-companion.md](docs/nova-companion.md) |
| Procedural audio and settings | [src/audioEngine.ts](src/audioEngine.ts) | [src/audioSettings.ts](src/audioSettings.ts) |

## Ownership Boundaries

- `main.ts` orchestrates systems and translates input into typed actions. Move
  reusable rules into focused modules instead of growing more inline policy.
- `VoxelWorld` owns durable terrain, streaming, chunk revisions, partial masks,
  block-light caches, and storage drains. Three.js upload remains main-thread
  work even when pure geometry construction happens in workers.
- `PartialBlockMeshField` owns custom damaged-terrain meshes, not gameplay HP.
  `partialBlocks.ts` owns the sparse lattice and its pure geometry rules.
- `PlayerController` consumes `CollisionWorld`; it should not learn chunk
  storage, rendering, or debris ownership details.
- `PlayerViewController` owns render-camera selection and camera obstruction;
  `PlayerAvatar` owns only the replaceable visual rig and pose mirroring.
- `physics.ts` owns transient cores and fragment motion records. Rapier is kept
  behind `RigidDebrisSimulation`; rendering consumes fragment state through
  instanced batches.
- `items.ts` defines action contracts, `inventory.ts` owns pure finite-container
  rules, and `hotbar.ts` owns lane presentation and stable-id selection.
- `chunkStorage.ts` is the persistence boundary. Saved metadata must remain
  normalized and backward compatible with older world records.
- Engine workers accept structured-clone data and return typed buffers. They do
  not own DOM, Three.js objects, IndexedDB, or gameplay decisions.
- Cross-system reactions use [src/eventBus.ts](src/eventBus.ts) and
  [src/engineEvents.ts](src/engineEvents.ts), not stringly DOM events.

## Runtime Flow

1. `index.html` loads `main.ts`, which creates renderer-owned resources and the
   small system controllers.
2. IndexedDB world metadata opens before the home screen renders saved worlds.
3. Entering a world selects its terrain profile and storage namespace, restores
   player/day-night/inventory metadata, and seeds the initial chunk window.
4. `VoxelWorld` schedules nearby generation, block-light, and mesh jobs through
   `WorkerPool`; synchronous fallbacks preserve the same contracts.
5. Completed results are revision-checked, applied in bounded visible-first
   slices, and uploaded into Three.js geometry on the main thread.
6. Each active frame updates input, player, sky, world streaming, transient
   physics, partial terrain, diagnostics, UI, and finally rendering.
7. Terrain damage enters through `VoxelWorld.carveBlockBrush`, updates durable
   HP/lattice state, then emits presentation events such as poofs and debris.
8. Fog-hidden horizon chunks remain streamed but stop drawing beyond the opaque
   wall plus its safety ring.
9. Save writes coalesce by world/chunk and flush before world switches, exits,
   page unload, or runtime disposal.
10. Hidden/resumed frames are clamped, and fully idle settled worlds hibernate
    until browser or player activity resumes the loop.

## High-Risk Invariants

- A partial voxel is durable terrain. `isSolid` may remain true while
  `isRenderableSolid` is false and surviving lattice boxes provide collision.
- Core brush fan-out shares one damage/material budget across macro blocks. It
  must not multiply damage because several blocks overlap the footprint.
- Removed partial cells grow monotonically and stay face-connected. Later hits
  must never refill old wounds or create detached visual holes.
- Projectile and hitscan collision test remaining lattice material, not the old
  full-cube envelope. Piercing requires a complete open tunnel and an air exit.
- Worker and fallback jobs must emit identical mesh attributes. Always reject
  stale revisions before applying generated, mesh, partial, or light results.
- Partial render masks must accompany chunk mesh jobs or workers will draw full
  cubes over carved terrain.
- Derived block light is cached data. Partial meshes may bridge with accepted
  light while a genuinely dirty cache rebuilds; do not flash zero-lit geometry.
- The clear-distance slider, hidden stream horizon, chunk render radius, hard
  fog wall, and horizon matte have different jobs. Do not collapse their radii.
- Third-person rendering must not move or repurpose the physical eye camera.
  Player collision, saves, tool reach, and reticle aim depend on that transform.
- Debris presentation volume cannot exceed removed terrain volume. Normal
  runtime pressure cleanup prefers settled debris and protects fresh airborne
  bursts during their grace window.
- Automatic debris-to-rubble conversion is parked. Do not revive it as an
  optimization without deliberately restoring that gameplay mechanic.
- Terrain edits must emit bounded support invalidation so sleeping Rapier and
  detached VFX debris wake without broad per-frame support scans.
- Persist item IDs, never registry indexes. Flush the latest coalesced inventory
  snapshot before changing the active world identity.
- Edited chunk snapshots carry terrain-profile provenance and partial cells.
  Legacy 48m varied worlds also require their existing lift migration.
- Pointer lock can return a promise or `void`; preserve the guarded browser path
  and test first-person changes in Chrome.
- Renderer-owned helpers, workers, audio, input listeners, and physics bodies
  need explicit disposal during world exit, HMR, and browser unload.
- `.env.local` and `.vercel/` contain local deployment linkage and stay
  untracked. Never print or commit the private Blob token.

## Validation

- Narrow pure-rule change: relevant unit tests plus `npm.cmd run typecheck`.
- Docs-only change: `npm.cmd run docs:check` and `git diff --check`.
- Shared gameplay or engine change: `npm.cmd run validate`.
- Worker, rendering, pointer-lock, lighting, or visual changes also need a real
  browser smoke. Use Chrome for pointer lock and first-person feel.
- Inspect fresh `logs/` records and F3 counters for performance work. Versioned
  passes matter; do not diagnose from stale sessions.
- `dist/`, `.test-dist/`, and `node_modules/` are generated and should not be
  searched during normal source exploration.

## Deeper References

- [docs/README.md](docs/README.md): focused documentation index.
- [docs/architecture.md](docs/architecture.md): runtime contracts, subsystem
  boundaries, bolt-on direction, and parked architecture decisions.
- [docs/controls.md](docs/controls.md): controls, settings, builder, and quality.
- [docs/destruction.md](docs/destruction.md): partial damage, cores, debris, and
  parked rubble behavior.
- [docs/performance-hitch-logging.md](docs/performance-hitch-logging.md): local
  and deployed diagnostics.
- [docs/future-webgpu-overhaul.md](docs/future-webgpu-overhaul.md): shelved GPU
  experiment lessons and the future renderer direction.
- [TODO.md](TODO.md): promoted next work and parked plans.
- [FEATURE_SPITBALLS.md](FEATURE_SPITBALLS.md): less-committed ideas.

## Maintenance Contract

- Keep this file below 30 KB and keep individual lines readable.
- Route tasks here; explain subsystem history and deep contracts elsewhere.
- Add a task row only when it materially shortens future discovery.
- Remove superseded warnings instead of accumulating archaeological layers.
- Update this map when ownership, entry points, ports, or validation commands
  change.
