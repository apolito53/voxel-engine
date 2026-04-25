# Codebase Index

Last reviewed: 2026-04-25

Purpose: a compact map for surgical codebase reads. Keep this file current when module ownership, commands, or architecture changes.

## Stack

- Vite browser app using native ES modules plus a module Web Worker for chunk CPU work.
- Three.js handles rendering, camera, materials, lights, and meshes.
- The app code owns chunks, terrain generation, voxel meshing, player movement, collision, ray picking, HUD, minimap, and simple physics toys.

## Commands

- Install: `npm.cmd install`
- Dev server: `npm.cmd run dev -- --port 5173`
- Production build: `npm.cmd run build`
- Preview build: `npm.cmd run preview -- --port 4173`

## Fast Lookup

- App bootstrap, render loop, HUD, minimap, input glue: `src/main.js`
- HTML shell, HUD nodes, pause menu, minimap canvas: `index.html`
- Visual styling and overlays: `src/style.css`
- Block IDs, colors, placeable palette: `src/blocks.js`
- Shared chunk dimensions and world height constants: `src/voxelConstants.js`
- Chunk voxel storage, top-column cache, main-thread mesh fallback, worker mesh upload: `src/chunk.js`
- Worker-side chunk terrain generation and greedy mesh buffer building: `src/chunkWorker.js`
- Chunk ownership, worker scheduling, streaming, reads/writes: `src/world.js`
- First-person movement, pointer lock, voxel collision: `src/player.js`
- Block picking for break/place interactions: `src/raycast.js`
- Throwable bouncing physics core: `src/physics.js`
- Clamp, noise, and terrain math helpers: `src/math.js`

## Runtime Flow

1. `index.html` loads `src/main.js`.
2. `main.js` creates the Three.js renderer, scene, lights, camera, `VoxelWorld`, and `PlayerController`.
3. `VoxelWorld.ensureChunksAround` creates initial spawn chunks; generated chunks use `fbm2` terrain noise.
4. During play, `VoxelWorld.streamChunksAround` queues chunk generation requests near the player and sends them to `src/chunkWorker.js` when workers are available.
5. Dirty chunks are meshed in the worker as typed-array buffers, then `Chunk.applyMeshData` uploads the returned data into Three.js `BufferGeometry`.
6. If workers are unavailable or fail, `VoxelWorld` falls back to synchronous chunk generation and `Chunk.rebuildMesh`.
7. Each animation frame updates player motion, chunk streaming, dirty mesh scheduling, physics toys, HUD/debug text, minimap, and final render.
8. Block edits go through `voxelRaycast` plus `VoxelWorld.setBlock`, then neighboring chunks are marked dirty when edge blocks change.

## Common Change Targets

- Add or recolor blocks: update `src/blocks.js`; inspect mesh color use in `src/chunk.js`.
- Tune chunk dimensions: update `src/voxelConstants.js`, then verify worker and main-thread paths still agree.
- Tune terrain: update `generateChunkBlocks` in `src/chunkWorker.js` and `VoxelWorld.generateChunk` in `src/world.js`; terrain noise lives in `src/math.js`.
- Tune chunk streaming or worker budgets: update scheduling in `src/world.js` and the debug display in `src/main.js`.
- Tune movement feel: constants and collision resolution in `src/player.js`.
- Tune render/performance modes: constants and `setPotatoMode` helpers in `src/main.js`.
- Change break/place reach or hit behavior: `src/raycast.js` and pointer handlers in `src/main.js`.
- Change thrown object behavior: `src/physics.js` plus `KeyF` handling in `src/main.js`.
- Change HUD/minimap/debug UI: `index.html`, `src/style.css`, and `src/main.js`.

## Sharp Edges

- `rg.exe` may be blocked on this Windows machine; fall back to bounded PowerShell searches.
- Chunk edits are kept in memory via `VoxelWorld.savedChunks`; there is no persistence yet.
- Worker meshing has a synchronous fallback path; keep both paths healthy when changing chunk storage or mesh formats.
- Browser worker behavior can differ from the build smoke test; reload the local app after worker pipeline changes and watch console logs/debug metrics.
- `node_modules` and `dist` are generated and should not be scanned unless diagnosing dependency/build output.
- Pointer lock behavior is browser-sensitive; test movement changes in the browser, not just with `npm.cmd run build`.
