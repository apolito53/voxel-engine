# Codebase Index

Last reviewed: 2026-05-02

Purpose: a compact map for surgical codebase reads. Keep this file current when module ownership, commands, or architecture changes.

## Stack

- Strict TypeScript Vite browser app using native ES modules plus a module Web Worker for chunk CPU work.
- Three.js handles rendering, camera, materials, lights, and meshes.
- World units are metric: `1 block = 1 meter`, defined by `METERS_PER_BLOCK` in `src/voxelConstants.ts`.
- The app code owns chunks, terrain generation, voxel meshing, player movement, collision, ray picking, HUD, minimap, impact damage, debris lifetime, rubble cover proxies, and simple physics toys.

## Commands

- Install: `npm.cmd install`
- Start on Windows: `.\start.ps1`
- Start on Linux/Ubuntu: `chmod +x ./start.sh && ./start.sh`
- Dev server: `npm.cmd run dev -- --port 5173`
- Strict type check: `npm.cmd run typecheck`
- Engine robustness tests: `npm.cmd run test`
- Production build: `npm.cmd run build`
- Preview build: `npm.cmd run preview -- --port 4173`
- TypeScript migration plan: `python .\scripts\ts_migration.py plan`
- TypeScript migration audit: `python .\scripts\ts_migration_audit.py`

## Fast Lookup

- App bootstrap, render loop, input glue, world lifecycle orchestration: `src/main.ts`
- HTML shell, home screen, HUD nodes, pause menu, minimap canvas: `index.html`
- Visual styling and overlays: `src/style.css`
- Required DOM/canvas lookup helpers: `src/dom.ts`
- WebGL GPU text helpers: `src/gpu.ts`
- Saved-world list rendering, save deletion controls, and seed generation: `src/worldMenu.ts`
- Delete-world confirmation pane copy: `src/deleteWorldDialog.ts`
- Debug HUD throttling, frame-spike tracking, CPU timing buckets, fragment instancing stats, rubble cover stats, and renderer stats text: `src/debugHud.ts`
- Frame delta clamping and hidden/overnight resume guards: `src/frameLoop.ts`
- Smoothed per-frame subsystem timing helpers for hitch profiling: `src/frameTimings.ts`
- Minimap terrain slicing, grid, and player marker drawing: `src/minimap.ts`
- Block IDs, colors, health, generated `Rubble` block, and placeable palette: `src/blocks.ts`
- Deterministic per-block tint buckets used by worker and fallback meshing: `src/blockColors.ts`
- Block fracture grid, quality-scaled grid sampling, and debris sizing constants: `src/blockFragments.ts`
- Shared world scale, chunk dimensions, and world height constants: `src/voxelConstants.ts`
- IndexedDB storage adapter for saved worlds, save deletion, and edited chunk persistence: `src/chunkStorage.ts`
- Seeded terrain generation shared by fallback and worker paths: `src/terrain.ts`
- Chunk voxel storage, top-column cache, main-thread mesh fallback, worker mesh upload: `src/chunk.ts`
- Shared chunk worker request/result message contracts: `src/chunkProtocol.ts`
- Worker-side chunk terrain generation and greedy mesh buffer building: `src/chunkWorker.ts`
- Chunk ownership, worker scheduling, cached chunk-window streaming/unloading, dirty/modified chunk indexes, reads/writes, sparse block damage, coalesced chunk-save writes: `src/world.ts`
- Shared collision-world shape used by player and physics toys: `src/collision.ts`
- First-person walking, flight, smoothed crouch view, committed slide state, crouched landing slides, slide-jump momentum, pointer lock, voxel collision: `src/player.ts`
- Player movement constants and committed slide/landing-slide/air-control/flight/crouch-view tuning helpers: `src/playerMovement.ts`
- Player velocity magnitude and metric speed readout formatting: `src/playerSpeed.ts`
- Sprint/flight-boost feedback FOV target and smoothing helpers: `src/sprintFeedback.ts`
- Nova Pilot companion mesh, follow/orbit behavior, and Nova-thrown core launch helpers: `src/novaPilot.ts`
- Block picking for break/place interactions: `src/raycast.ts`
- Thin black edge outline for the currently targeted block: `src/targetHighlighter.ts`
- Throwable bouncing physics core, sleep-aware split core/debris broadphase collision, impact speed reporting, shared-resource sleeping/expiring cube fragments: `src/physics.ts`
- Instanced debris rendering batches keyed by source block material: `src/physicsInstancing.ts`
- Persistent destructible rubble cover patches, multi-cell merge rules, support/fall behavior, and dense terrain-block promotion: `src/rubble.ts`
- Per-quality persisted physics body budget bounds and step helpers: `src/physicsBudget.ts`
- Shared visible-sun direction used by lighting, skybox alignment, and shadow anchoring: `src/lighting.ts`
- Worker-safe sun constants and light-aware baked voxel face shading: `src/voxelLighting.ts`
- Render quality controller, Custom preset for slider edits, persistence, and renderer/light/camera application: `src/qualityController.ts`
- Custom quality settings storage, slider bounds, and menu label formatting: `src/qualitySettings.ts`
- Render quality preset definitions, physics-body defaults, Custom baseline, and tuning knobs: `src/qualityPresets.ts`
- Generated sunlit skybox texture and camera-following sky dome: `src/assets/skybox-sunlit-day.png`, `src/skybox.ts`
- Directional shadow-map texel snapping helpers: `src/shadows.ts`
- Clamp, noise, and terrain math helpers: `src/math.ts`
- Windows startup helper: `start.ps1`
- Linux/Ubuntu startup helper: `start.sh`
- Tiny Node test bundler: `scripts/run_tests.mjs`
- Engine robustness test entrypoint: `tests/run.ts`
- TypeScript migration helpers: `scripts/ts_migration.py`, `scripts/ts_migration_audit.py`, `scripts/run_python.ps1`, `scripts/run_python.sh`, `scripts/README.md`
- Vite production-build config and manual vendor chunking: `vite.config.ts`

## Runtime Flow

1. `index.html` loads `src/main.ts`.
2. `main.ts` creates the Three.js renderer, scene, lights, camera-following generated skybox, `VoxelWorld`, `PlayerController`, and small UI helpers for quality, debug HUD, minimap, and world list rendering.
3. `main.ts` opens the async IndexedDB save registry, then starts on the home screen; `worldMenu.ts` renders saved-world rows, and loading, creating, or confirmed deletion updates the saved-world slots and active seed.
4. `VoxelWorld` reads the saved chunk key index when a world loads, but chunk payloads stay lazy and stream from IndexedDB only when needed.
5. `VoxelWorld.ensureChunksAround` creates initial spawn chunks after a world is loaded; generated chunks use seeded `fbm2` terrain noise from `src/terrain.ts`.
6. During play, `main.ts` passes the camera view direction and camera frustum into `VoxelWorld.streamChunksAround`; cached chunk-radius offsets populate the queue only when the player crosses a chunk boundary or the load radius changes, unchanged unload windows skip loaded-chunk sweeps, then chunk generation queues are picked as a bounded slice that keeps nearby chunks first and prioritizes chunks inside the camera view.
7. Completed worker/storage chunk results are also applied in camera-prioritized bounded slices, so high-distance fresh worlds do not upload large bursts of chunks or let offscreen results steal the visible-frame budget.
8. Dirty chunks are tracked by key, then use the same bounded frustum-biased priority before meshing in the worker as typed-array buffers and uploading through `Chunk.applyMeshData`; worker and fallback meshes both use `src/blockColors.ts` so deterministic tint buckets do not change between mesh paths.
9. If workers are unavailable or fail, `VoxelWorld` falls back to synchronous chunk generation and `Chunk.rebuildMesh`.
10. Each visible animation frame updates player motion, Nova Pilot companion motion, chunk streaming, physics toys with reusable impact buffers, rubble-core collision, settled-fragment rubble absorption, rubble patch merge/support/fall/terrain-promotion rules, a sleep-aware split core/debris broadphase object-object collision pass, speed-gated impact damage, quality-scaled and slider-tuned physics body budgets, instanced debris render batches, dirty mesh scheduling, HUD/debug text, minimap, and final render only while a world is active; hidden tabs and long resume gaps skip the expensive frame once and reset profiler/minimap meters before play continues. The debug HUD receives smoothed CPU timing buckets for player, chunk, physics, mesh, minimap, render, miscellaneous work, fragment instancing pressure, and rubble cover pressure.
11. `Exit to Home` flushes async chunk writes and unloads the active world view; switching worlds happens from the home screen, not the pause menu.
12. Block edits go through `voxelRaycast` plus `VoxelWorld.setBlock`; edited chunk snapshots are coalesced per chunk before IndexedDB receives raw binary chunk payloads, and neighboring chunks are marked dirty when edge blocks change.
13. Thrown physics cores report voxel impacts; impacts above 2 m/s call `VoxelWorld.damageBlock`, and destroyed blocks are removed from the grid before spawning quality-scaled loose cube fragments sampled from the 3x3x3 fracture grid. Fragments reuse geometry/materials, avoid shadow casting, and become persistent destructible rubble cover patches after settling, rather than staying as long-lived individual physics bodies. Rubble patches merge across neighboring same-height cells up to a bounded patch size, skip internal mesh faces so they read as connected debris, and check support each active frame: unsupported cells fall one voxel cell, falling cells merge into piles below, and dense supported cells compact into the generated solid `Rubble` block only after well over one full block-fracture worth of debris accumulates. Active cores can still shove loose fragments, collide with rubble patches, and chip rubble health without enabling debris-debris pair generation; `X` removes only thrown cores so rubble experiments can stay in place, while the settings-panel `Despawn All Objects` button clears cores, loose debris, and rubble. Cores also sleep after settling so old shots do not keep paying per-frame voxel collision cost forever.

## Common Change Targets

- Add, recolor, or retune block health: update `src/blocks.ts`; inspect deterministic tinting in `src/blockColors.ts`, mesh color use in `src/chunk.ts`, rubble promotion in `src/rubble.ts`, and debris color use in `src/physics.ts`.
- Tune chunk dimensions: update `src/voxelConstants.ts`, then verify worker and main-thread paths still agree.
- Tune terrain: update `src/terrain.ts`; terrain noise helpers live in `src/math.ts`.
- Tune saved worlds, save deletion, or edit persistence: update `src/chunkStorage.ts`, home-menu glue in `src/main.ts`, list controls in `src/worldMenu.ts`, and the save/load calls in `src/world.ts`.
- Tune chunk streaming or worker budgets: update scheduling in `src/world.ts` and the debug display in `src/main.ts`.
- Tune movement feel: metric-scaled constants and committed slide/landing-slide/air-control/flight/crouch-view helpers in `src/playerMovement.ts`, sprint FOV feedback in `src/sprintFeedback.ts`, plus collision resolution, slide state, slide-jump momentum, and visual eye-height handling in `src/player.ts`.
- Change Nova's companion behavior or pilot-thrown cores: `src/novaPilot.ts`, `KeyN`/`KeyB` hooks in `src/main.ts`, and shared physics-core construction in `createPhysicsCore`.
- Tune render/performance modes: quality preset constants in `src/qualityPresets.ts`, Custom slider bounds/storage in `src/qualitySettings.ts`, the Super Ultra opt-in toggle, settings-menu HTML/CSS in `index.html` and `src/style.css`, and application logic in `src/qualityController.ts`.
- Tune baked voxel face shading or visible sun direction: update `src/voxelLighting.ts`, `src/lighting.ts`, `src/assets/skybox-sunlit-day.png`, and `src/skybox.ts` together so worker mesh colors, skybox alignment, and shadows agree.
- Tune shadow stability or shimmer behavior: anchor snapping in `src/shadows.ts`, sun anchor wiring in `src/main.ts`, and preset shadow bounds in `src/qualityPresets.ts`.
- Change break/place reach, hit behavior, or target outline: `src/raycast.ts`, `src/targetHighlighter.ts`, and pointer/highlight hooks in `src/main.ts`.
- Change thrown object behavior, core/debris/rubble collision, debris lifetime, debris grid size, quality-scaled debris counts, instanced debris rendering, rubble cover proxies, object budget, despawn controls, or impact damage: `src/blockFragments.ts`, `src/physics.ts`, `src/physicsInstancing.ts`, `src/rubble.ts`, per-quality defaults in `src/qualityPresets.ts`, persistence bounds in `src/physicsBudget.ts`, `VoxelWorld.damageBlock` in `src/world.ts`, plus `KeyT`, `KeyX`, `PhysicsToyCollider`, `RubbleField`, `clearPhysicsCores`, `clearToys`, and `handlePhysicsImpact` in `src/main.ts`.
- Change HUD/minimap/debug/sprint-feedback/settings UI: `index.html`, `src/style.css`, `src/debugHud.ts`, `src/frameTimings.ts`, `src/minimap.ts`, `src/sprintFeedback.ts`, and the orchestration hooks in `src/main.ts`.

## Sharp Edges

- `rg.exe` may be blocked on this Windows machine; fall back to bounded PowerShell searches.
- `VoxelWorld.savedChunkKeys` mirrors the persisted edited chunk index; `savedChunks` is only a cache of loaded edited chunk payloads.
- Saved worlds are local browser slots in IndexedDB; edited chunks persist as full binary chunk snapshots, which is simple and reliable but not a final save-file format.
- Edited chunk saves are debounced and coalesced per chunk so rapid destruction does not spam IndexedDB with intermediate snapshots; call `VoxelWorld.flushStorageWrites()` before switching storage or unloading a world.
- Worker meshing has a synchronous fallback path; keep both paths healthy when changing chunk storage or mesh formats.
- Block tint variation is part of the greedy mesh key. Keep worker and fallback meshing on the shared `src/blockColors.ts` helpers so tint buckets stay deterministic and chunks do not repaint between mesh paths.
- Worker meshes treat missing neighbor chunks as temporarily solid so streaming does not draw chunk-edge walls before neighbors load and trigger a remesh.
- Chunk `revision` values invalidate worker mesh results for both local block edits and neighbor-driven dirty marks; do not let stale neighbor snapshots clear `dirty`.
- Large render-distance presets depend on bounded frustum-biased chunk and mesh selection in `src/world.ts`; avoid reintroducing full queue sorts, full chunk-radius queue refreshes, full unload sweeps, or all-loaded-chunk dirty scans on every frame. If code clears pending load state or makes a saved chunk fall back to generated terrain, call the queue-window invalidation path so unchanged-center streaming can safely repopulate missing work. If code loads or creates chunks directly, keep the unload-window and dirty/modified indexes in sync.
- `Super Ultra` is intentionally gated by a pause-menu opt-in that only appears at `Ultra` or while `Super Ultra` is active.
- Pause-menu tuning controls live behind the `Settings` button so normal pause/resume stays quick; opening settings hides `Resume` and the red `Exit to Home` action until the user backs out.
- Slider edits intentionally fork into the single `Custom` preset instead of mutating built-in presets; named custom preset management is future UI work.
- Browser worker behavior can differ from the build smoke test; reload the local app after worker pipeline changes and watch console logs/debug metrics.
- `npm.cmd run test` bundles `tests/run.ts` into `.test-dist/` with esbuild before running in Node; `.test-dist/` is generated and ignored.
- `node_modules` and `dist` are generated and should not be scanned unless diagnosing dependency/build output.
- `vite.config.ts` manually separates Three.js into a `vendor-three` chunk and keeps other dependencies in `vendor`, so production build warnings point at genuinely oversized app code instead of the stable renderer dependency.
- Object-object physics is intentionally limited: `PhysicsToyCollider` keeps active cores and active fragments in separate spatial hashes, only indexes fragments that overlap core cells, caches sleeping bodies in a static hash, resolves core-core and core-fragment contacts, and avoids debris-debris pair creation entirely so high debris budgets do not become quadratic contact work. Call `PhysicsToyCollider.forget()` before disposing a sleeping toy so the static hash does not keep stale references.
- Debris fragments are rendered through per-block `THREE.InstancedMesh` batches in `src/physicsInstancing.ts`; fragment physics still uses `PhysicsToy.mesh.position`, but fragment meshes are not added to the scene individually.
- `Despawn All Objects` uses the full cleanup path and releases high-water instanced debris batches, while `X` removes only thrown physics cores and preserves fragment/rubble experiments.
- Rubble patches are the persistent gameplay representation of settled debris. `RubbleField` keeps visual patches, cover raycasts, health, core collision, support checks, fall/merge behavior, and promotion into the generated `Rubble` block together; do not reintroduce permanent per-shard gameplay collision when tuning cover behavior.
- Pointer lock behavior is browser-sensitive; `requestPointerLock()` can return a promise or `void`, so keep the guarded catch path in `src/player.ts` and test movement changes in the browser, not just with `npm.cmd run build`.
- TypeScript migration helpers are historical prep tools now; source in `src` is expected to stay strict without `@ts-nocheck` or explicit `any`.
