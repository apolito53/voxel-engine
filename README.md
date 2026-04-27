# Voxel Sandbox Engine

A tiny strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, block edits, and simple physics toys.

World units are metric: `1 block = 1 meter`.

Edited chunks persist in IndexedDB browser storage. Clear this site's browser data to reset saved worlds.
The home screen creates and loads local saved worlds. New worlds store a name and seed.

## Run

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

Pass a different port as the first argument, for example `.\start.ps1 5174` or `./start.sh 5174`.

## Controls

- `WASD` move
- Home screen creates or loads a world
- `Resume` captures mouse after pausing
- `Exit to Home` returns to the world list; switch worlds from there
- `Mouse` look while playing
- `Space` jump
- `Shift` sprint
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` throw a physics core
- `F3` toggle debug overlay
- `F4` cycle quality: Potato, Low, Normal, High, Ultra
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows
- `Low`: current low-end baseline, no shadows
- `Normal`: 2x render distance, shadows
- `High`: 4x render distance, shadows
- `Ultra`: 6x render distance, higher shadow resolution
- `Super Ultra`: 12x render distance, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, and world lifecycle orchestration
- `src/world.ts`: chunk ownership, worker scheduling, streaming, block reads/writes
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building
- `src/player.ts`: first-person controller and voxel collision
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin block-target outline rendering
- `src/physics.ts`: simple sphere-vs-voxel rigid toy
- `src/qualityController.ts`: quality preset persistence and renderer/light/camera application
- `src/shadows.ts`: directional shadow-map texel snapping helpers
- `src/minimap.ts`: minimap terrain slicing, grid, and player marker drawing
- `src/debugHud.ts`: debug overlay stats formatting and update throttling
- `src/worldMenu.ts`: saved-world list rendering and readable seed generation

## Development Checks

- `npm.cmd run typecheck`: strict TypeScript no-emit validation
- `npm.cmd run test`: strict typecheck plus bundled Node engine robustness tests
- `npm.cmd run build`: production build smoke test
- `git diff --check`: whitespace sanity check before commits

## Sensible Next Steps

- Give physics toys voxel damage so thrown objects can punch little craters.
