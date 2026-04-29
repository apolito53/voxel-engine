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
- Home screen creates, loads, or deletes a world through an in-app confirmation pane
- `Resume` captures mouse after pausing
- `Exit to Home` returns to the world list; switch worlds from there
- `Mouse` look while playing
- HUD shows the selected block, movement mode, and current player speed in m/s
- `Space` jump, or fly upward while flight mode is active
- `C` crouch smoothly on foot, or fly downward while flight mode is active
- `C` while sprinting forward, or landing crouched with enough speed, starts a committed slide with an 80% entry-speed pop; hold `W` to glide longer, `Space` to spring-jump out of the slide
- `Shift` sprint on ground, or use the stronger flight speed boost; active sprint/boost widens FOV and adds peripheral speed lines
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` toggle flight mode
- `T` throw a physics core; impacts above 2 m/s damage blocks, and two damaging hits fracture a block into quality-scaled loose cube fragments that sleep/expire to keep debris cheap
- `F3` toggle debug overlay, including smoothed FPS, raw/peak frame time, and CPU timing buckets for hitch hunting
- `F4` cycle quality: Potato, Low, Normal, High, Ultra
- Pause menu `Physics Object Budget` stepper changes the current quality preset's physics-body budget
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 2 debris shards
- `Low`: current low-end baseline, no shadows, 128 physics bodies, 4 debris shards
- `Normal`: 2x render distance, shadows, 192 physics bodies, 7 debris shards
- `High`: 4x render distance, shadows, 512 physics bodies, 14 debris shards
- `Ultra`: 6x render distance, higher shadow resolution, 1024 physics bodies, 27 debris shards
- `Super Ultra`: 12x render distance, 2048 physics bodies, 27 debris shards, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, and world lifecycle orchestration
- `src/world.ts`: chunk ownership, worker scheduling, streaming, block reads/writes, sparse block damage, and coalesced edited-chunk saves
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building
- `src/player.ts`: first-person controller and voxel collision
- `src/sprintFeedback.ts`: sprint/boost FOV target and smoothing helpers
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin block-target outline rendering
- `src/blockFragments.ts`: 3x3x3 block fracture pattern and debris sizing constants
- `src/physics.ts`: simple sphere-vs-voxel rigid bodies, impact reporting, and shared-resource cube fragments
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
- `src/qualityController.ts`: quality preset persistence and renderer/light/camera application
- `src/shadows.ts`: directional shadow-map texel snapping helpers
- `src/minimap.ts`: minimap terrain slicing, grid, and player marker drawing
- `src/debugHud.ts`: debug overlay stats formatting, CPU timing buckets, and update throttling
- `src/frameTimings.ts`: smoothed per-frame subsystem timing helpers for the debug overlay
- `src/worldMenu.ts`: saved-world list rendering and readable seed generation

## Development Checks

- `npm.cmd run typecheck`: strict TypeScript no-emit validation
- `npm.cmd run test`: strict typecheck plus bundled Node engine robustness tests
- `npm.cmd run build`: production build smoke test
- `git diff --check`: whitespace sanity check before commits

## Sensible Next Steps

- Add material-specific fracture behavior so stone, dirt, sand, grass, and ember fail differently.
