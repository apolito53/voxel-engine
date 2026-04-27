# Voxel Sandbox Engine

A tiny strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, block edits, impact damage, and simple physics toys.

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
- `Space` jump, or fly upward while flight mode is active
- `C` crouch on foot, or fly downward while flight mode is active
- `C` while sprinting, then release movement, to slide
- `Shift` sprint or boost flight speed
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` toggle flight mode
- `T` throw a physics core; impacts above 2 m/s damage blocks, and two damaging hits fracture a block into 27 loose cube fragments that sleep/expire to keep debris cheap
- `F3` toggle debug overlay, including smoothed FPS plus raw/peak frame time for hitch hunting
- `F4` cycle quality: Potato, Low, Normal, High, Ultra
- Pause menu `Physics Object Budget` stepper changes the current quality preset's physics-body budget
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 32 physics bodies
- `Low`: current low-end baseline, no shadows, 64 physics bodies
- `Normal`: 2x render distance, shadows, 96 physics bodies
- `High`: 4x render distance, shadows, 256 physics bodies
- `Ultra`: 6x render distance, higher shadow resolution, 512 physics bodies
- `Super Ultra`: 12x render distance, 1024 physics bodies, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, and world lifecycle orchestration
- `src/world.ts`: chunk ownership, worker scheduling, streaming, block reads/writes, sparse block damage, and coalesced edited-chunk saves
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building
- `src/player.ts`: first-person controller and voxel collision
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin block-target outline rendering
- `src/blockFragments.ts`: 3x3x3 block fracture pattern and debris sizing constants
- `src/physics.ts`: simple sphere-vs-voxel rigid bodies, impact reporting, and shared-resource cube fragments
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
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

- Add material-specific fracture behavior so stone, dirt, sand, grass, and ember fail differently.
