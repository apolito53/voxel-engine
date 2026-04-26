# Codebase Index

Last reviewed: 2026-04-26

Purpose: a compact map for surgical codebase reads. Keep this file current when module ownership, commands, or architecture changes.

## Stack

- Vite browser app using native ES modules plus a module Web Worker for chunk CPU work.
- Three.js handles rendering, camera, materials, lights, and meshes.
- World units are metric: `1 block = 1 meter`, defined by `METERS_PER_BLOCK` in `src/voxelConstants.js`.
- The app code owns chunks, terrain generation, voxel meshing, player movement, collision, ray picking, HUD, minimap, and simple physics toys.

## Commands

- Install: `npm.cmd install`
- Start on Windows: `.\start.ps1`
- Start on Linux/Ubuntu: `chmod +x ./start.sh && ./start.sh`
- Dev server: `npm.cmd run dev -- --port 5173`
- Production build: `npm.cmd run build`
- Preview build: `npm.cmd run preview -- --port 4173`

## Fast Lookup

- App bootstrap, splash/home menu, render loop, HUD, minimap, input glue: `src/main.js`
- HTML shell, home screen, HUD nodes, pause menu, minimap canvas: `index.html`
- Visual styling and overlays: `src/style.css`
- Block IDs, colors, placeable palette: `src/blocks.js`
- Shared world scale, chunk dimensions, and world height constants: `src/voxelConstants.js`
- IndexedDB storage adapter for saved worlds and edited chunk persistence: `src/chunkStorage.js`
- Seeded terrain generation shared by fallback and worker paths: `src/terrain.js`
- Chunk voxel storage, top-column cache, main-thread mesh fallback, worker mesh upload: `src/chunk.js`
- Worker-side chunk terrain generation and greedy mesh buffer building: `src/chunkWorker.js`
- Chunk ownership, worker scheduling, streaming, reads/writes: `src/world.js`
- First-person movement, pointer lock, voxel collision: `src/player.js`
- Block picking for break/place interactions: `src/raycast.js`
- Throwable bouncing physics core: `src/physics.js`
- Clamp, noise, and terrain math helpers: `src/math.js`
- Windows startup helper: `start.ps1`
- Linux/Ubuntu startup helper: `start.sh`

## Runtime Flow

1. `index.html` loads `src/main.js`.
2. `main.js` creates the Three.js renderer, scene, lights, camera, `VoxelWorld`, and `PlayerController`.
3. `main.js` opens the async IndexedDB save registry, then starts on the home screen; loading or creating a world activates a saved-world slot and seed.
4. `VoxelWorld` reads the saved chunk key index when a world loads, but chunk payloads stay lazy and stream from IndexedDB only when needed.
5. `VoxelWorld.ensureChunksAround` creates initial spawn chunks after a world is loaded; generated chunks use seeded `fbm2` terrain noise from `src/terrain.js`.
6. During play, `VoxelWorld.streamChunksAround` queues chunk generation requests near the player and sends a bounded nearest-first slice to `src/chunkWorker.js` when workers are available.
7. Dirty chunks are also picked as a bounded nearest-first slice, then meshed in the worker as typed-array buffers and uploaded through `Chunk.applyMeshData`.
8. If workers are unavailable or fail, `VoxelWorld` falls back to synchronous chunk generation and `Chunk.rebuildMesh`.
9. Each animation frame updates player motion, chunk streaming, dirty mesh scheduling, physics toys, HUD/debug text, minimap, and final render only while a world is active.
10. `Exit to Home` flushes async chunk writes and unloads the active world view; switching worlds happens from the home screen, not the pause menu.
11. Block edits go through `voxelRaycast` plus `VoxelWorld.setBlock`, then edited chunk snapshots are queued to IndexedDB as raw binary chunk payloads and neighboring chunks are marked dirty when edge blocks change.

## Common Change Targets

- Add or recolor blocks: update `src/blocks.js`; inspect mesh color use in `src/chunk.js`.
- Tune chunk dimensions: update `src/voxelConstants.js`, then verify worker and main-thread paths still agree.
- Tune terrain: update `src/terrain.js`; terrain noise helpers live in `src/math.js`.
- Tune saved worlds or edit persistence: update `src/chunkStorage.js`, home-menu glue in `src/main.js`, and the save/load calls in `src/world.js`.
- Tune chunk streaming or worker budgets: update scheduling in `src/world.js` and the debug display in `src/main.js`.
- Tune movement feel: metric-scaled constants and collision resolution in `src/player.js`.
- Tune render/performance modes: quality preset constants, the Super Ultra opt-in toggle, and `setQualityPreset` helpers in `src/main.js`.
- Change break/place reach or hit behavior: `src/raycast.js` and pointer handlers in `src/main.js`.
- Change thrown object behavior: `src/physics.js` plus `KeyF` handling in `src/main.js`.
- Change HUD/minimap/debug UI: `index.html`, `src/style.css`, and `src/main.js`.

## Sharp Edges

- `rg.exe` may be blocked on this Windows machine; fall back to bounded PowerShell searches.
- `VoxelWorld.savedChunkKeys` mirrors the persisted edited chunk index; `savedChunks` is only a cache of loaded edited chunk payloads.
- Saved worlds are local browser slots in IndexedDB; edited chunks persist as full binary chunk snapshots, which is simple and reliable but not a final save-file format.
- Worker meshing has a synchronous fallback path; keep both paths healthy when changing chunk storage or mesh formats.
- Large render-distance presets depend on bounded nearest-first chunk and mesh selection in `src/world.js`; avoid reintroducing full queue sorts on every frame.
- `Super Ultra` is intentionally gated by a pause-menu opt-in so normal quality cycling tops out at `Ultra`.
- Browser worker behavior can differ from the build smoke test; reload the local app after worker pipeline changes and watch console logs/debug metrics.
- `node_modules` and `dist` are generated and should not be scanned unless diagnosing dependency/build output.
- Pointer lock behavior is browser-sensitive; test movement changes in the browser, not just with `npm.cmd run build`.
