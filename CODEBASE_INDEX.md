# Codebase Index

Last reviewed: 2026-04-27

Purpose: a compact map for surgical codebase reads. Keep this file current when module ownership, commands, or architecture changes.

## Stack

- Strict TypeScript Vite browser app using native ES modules plus a module Web Worker for chunk CPU work.
- Three.js handles rendering, camera, materials, lights, and meshes.
- World units are metric: `1 block = 1 meter`, defined by `METERS_PER_BLOCK` in `src/voxelConstants.ts`.
- The app code owns chunks, terrain generation, voxel meshing, player movement, collision, ray picking, HUD, minimap, and simple physics toys.

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
- Saved-world list rendering and seed generation: `src/worldMenu.ts`
- Debug HUD throttling and renderer stats text: `src/debugHud.ts`
- Minimap terrain slicing, grid, and player marker drawing: `src/minimap.ts`
- Block IDs, colors, placeable palette: `src/blocks.ts`
- Shared world scale, chunk dimensions, and world height constants: `src/voxelConstants.ts`
- IndexedDB storage adapter for saved worlds and edited chunk persistence: `src/chunkStorage.ts`
- Seeded terrain generation shared by fallback and worker paths: `src/terrain.ts`
- Chunk voxel storage, top-column cache, main-thread mesh fallback, worker mesh upload: `src/chunk.ts`
- Shared chunk worker request/result message contracts: `src/chunkProtocol.ts`
- Worker-side chunk terrain generation and greedy mesh buffer building: `src/chunkWorker.ts`
- Chunk ownership, worker scheduling, streaming, reads/writes: `src/world.ts`
- Shared collision-world shape used by player and physics toys: `src/collision.ts`
- First-person movement, pointer lock, voxel collision: `src/player.ts`
- Block picking for break/place interactions: `src/raycast.ts`
- Throwable bouncing physics core: `src/physics.ts`
- Render quality controller, persistence, and renderer/light/camera application: `src/qualityController.ts`
- Render quality preset definitions and tuning knobs: `src/qualityPresets.ts`
- Directional shadow-map texel snapping helpers: `src/shadows.ts`
- Clamp, noise, and terrain math helpers: `src/math.ts`
- Windows startup helper: `start.ps1`
- Linux/Ubuntu startup helper: `start.sh`
- Tiny Node test bundler: `scripts/run_tests.mjs`
- Engine robustness test entrypoint: `tests/run.ts`
- TypeScript migration helpers: `scripts/ts_migration.py`, `scripts/ts_migration_audit.py`, `scripts/run_python.ps1`, `scripts/run_python.sh`, `scripts/README.md`

## Runtime Flow

1. `index.html` loads `src/main.ts`.
2. `main.ts` creates the Three.js renderer, scene, lights, camera, `VoxelWorld`, `PlayerController`, and small UI helpers for quality, debug HUD, minimap, and world list rendering.
3. `main.ts` opens the async IndexedDB save registry, then starts on the home screen; `worldMenu.ts` renders saved-world rows, and loading or creating a world activates a saved-world slot and seed.
4. `VoxelWorld` reads the saved chunk key index when a world loads, but chunk payloads stay lazy and stream from IndexedDB only when needed.
5. `VoxelWorld.ensureChunksAround` creates initial spawn chunks after a world is loaded; generated chunks use seeded `fbm2` terrain noise from `src/terrain.ts`.
6. During play, `main.ts` passes the camera view direction and camera frustum into `VoxelWorld.streamChunksAround`; chunk generation queues are picked as a bounded slice that keeps nearby chunks first, then prioritizes chunks inside the camera view.
7. Dirty chunks use the same bounded frustum-biased priority before meshing in the worker as typed-array buffers and uploading through `Chunk.applyMeshData`.
8. If workers are unavailable or fail, `VoxelWorld` falls back to synchronous chunk generation and `Chunk.rebuildMesh`.
9. Each animation frame updates player motion, chunk streaming, dirty mesh scheduling, physics toys, HUD/debug text, minimap, and final render only while a world is active.
10. `Exit to Home` flushes async chunk writes and unloads the active world view; switching worlds happens from the home screen, not the pause menu.
11. Block edits go through `voxelRaycast` plus `VoxelWorld.setBlock`, then edited chunk snapshots are queued to IndexedDB as raw binary chunk payloads and neighboring chunks are marked dirty when edge blocks change.

## Common Change Targets

- Add or recolor blocks: update `src/blocks.ts`; inspect mesh color use in `src/chunk.ts`.
- Tune chunk dimensions: update `src/voxelConstants.ts`, then verify worker and main-thread paths still agree.
- Tune terrain: update `src/terrain.ts`; terrain noise helpers live in `src/math.ts`.
- Tune saved worlds or edit persistence: update `src/chunkStorage.ts`, home-menu glue in `src/main.ts`, and the save/load calls in `src/world.ts`.
- Tune chunk streaming or worker budgets: update scheduling in `src/world.ts` and the debug display in `src/main.ts`.
- Tune movement feel: metric-scaled constants and collision resolution in `src/player.ts`.
- Tune render/performance modes: quality preset constants in `src/qualityPresets.ts`, the Super Ultra opt-in toggle, and application logic in `src/qualityController.ts`.
- Tune shadow stability or shimmer behavior: anchor snapping in `src/shadows.ts`, sun anchor wiring in `src/main.ts`, and preset shadow bounds in `src/qualityPresets.ts`.
- Change break/place reach or hit behavior: `src/raycast.ts` and pointer handlers in `src/main.ts`.
- Change thrown object behavior: `src/physics.ts` plus `KeyF` handling in `src/main.ts`.
- Change HUD/minimap/debug UI: `index.html`, `src/style.css`, `src/debugHud.ts`, `src/minimap.ts`, and the orchestration hooks in `src/main.ts`.

## Sharp Edges

- `rg.exe` may be blocked on this Windows machine; fall back to bounded PowerShell searches.
- `VoxelWorld.savedChunkKeys` mirrors the persisted edited chunk index; `savedChunks` is only a cache of loaded edited chunk payloads.
- Saved worlds are local browser slots in IndexedDB; edited chunks persist as full binary chunk snapshots, which is simple and reliable but not a final save-file format.
- Worker meshing has a synchronous fallback path; keep both paths healthy when changing chunk storage or mesh formats.
- Worker meshes treat missing neighbor chunks as temporarily solid so streaming does not draw chunk-edge walls before neighbors load and trigger a remesh.
- Chunk `revision` values invalidate worker mesh results for both local block edits and neighbor-driven dirty marks; do not let stale neighbor snapshots clear `dirty`.
- Large render-distance presets depend on bounded frustum-biased chunk and mesh selection in `src/world.ts`; avoid reintroducing full queue sorts on every frame.
- `Super Ultra` is intentionally gated by a pause-menu opt-in that only appears at `Ultra` or while `Super Ultra` is active.
- Browser worker behavior can differ from the build smoke test; reload the local app after worker pipeline changes and watch console logs/debug metrics.
- `npm.cmd run test` bundles `tests/run.ts` into `.test-dist/` with esbuild before running in Node; `.test-dist/` is generated and ignored.
- `node_modules` and `dist` are generated and should not be scanned unless diagnosing dependency/build output.
- Pointer lock behavior is browser-sensitive; test movement changes in the browser, not just with `npm.cmd run build`.
- TypeScript migration helpers are historical prep tools now; source in `src` is expected to stay strict without `@ts-nocheck` or explicit `any`.
