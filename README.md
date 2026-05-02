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
- Pause menu `Settings` opens the tunable engine controls; `Exit to Home` sits at the bottom as the red world-leave action
- `Space` jump, or fly upward while flight mode is active
- `C` crouch smoothly on foot, or fly downward while flight mode is active
- `C` while sprinting forward, or landing crouched with enough speed, starts a committed slide with an 80% entry-speed pop; hold `W` to glide longer, `Space` to spring-jump out of the slide
- `Shift` sprint on ground, or use the stronger flight speed boost; active sprint/boost widens FOV and adds peripheral speed lines
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` toggle flight mode
- `T` throw a physics core; impacts above 2 m/s damage blocks, two damaging hits fracture a block into quality-scaled loose cube fragments, settled fragments merge into destructible rubble cover patches that can span neighboring cells, unsupported piles fall/merge, large dense piles compact into a solid `Rubble` block, and moving cores can bump or chip cores/fragments/rubble before settling to sleep
- `N` toggle the Nova Pilot companion; `B` asks Nova to throw a physics core from her own position
- `X` despawn active physics cores while keeping loose debris and rubble cover
- `F3` toggle debug overlay, including smoothed FPS, raw/peak frame time, CPU timing buckets, active/sleeping physics broadphase counts, instanced debris render counts, and rubble cover stats for hitch hunting
- `F4` cycle built-in quality: Potato, Low, Normal, High, Ultra
- Pause menu `Settings` contains a `Quality Preset` dropdown, plus sliders for render distance, physics body budget, shadow quality, and debris count; slider edits switch the dropdown to `Custom` so built-in presets stay clean
- Settings `Physics Object Budget` stepper and slider change the current quality preset's physics-body budget
- Settings `Despawn All Objects` performs the drastic full cleanup: physics cores, loose debris, and rubble cover
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 2 debris shards
- `Low`: current low-end baseline, no shadows, 128 physics bodies, 4 debris shards
- `Normal`: 2x render distance, shadows, 192 physics bodies, 7 debris shards
- `High`: 4x render distance, sharper local shadows, 512 physics bodies, 14 debris shards
- `Ultra`: 6x render distance, sharper local shadows, 1024 physics bodies, 27 debris shards
- `Super Ultra`: 12x render distance, highest local shadow resolution, 4096 physics bodies, 27 debris shards, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected
- `Custom`: created automatically when settings sliders are changed, using the selected built-in preset as its baseline

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, and world lifecycle orchestration
- `src/eventBus.ts`: tiny typed in-memory pub/sub used for local engine/gameplay events
- `src/engineEvents.ts`: shared engine event contracts for world, physics, damage, rubble, quality, palette, and performance signals
- `src/world.ts`: chunk ownership, worker scheduling, cached chunk-window streaming/unloading, dirty chunk indexes, block reads/writes, sparse block damage, and coalesced edited-chunk saves
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building
- `src/player.ts`: first-person controller and voxel collision
- `src/sprintFeedback.ts`: sprint/boost FOV target and smoothing helpers
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin block-target outline rendering
- `src/blockColors.ts`: deterministic per-block tint buckets for subtle voxel color variation
- `src/blockFragments.ts`: 3x3x3 block fracture pattern and debris sizing constants
- `src/physics.ts`: simple sphere-vs-voxel rigid bodies, sleep-aware split core/debris broadphase collision, impact reporting, and shared-resource cube fragments
- `src/physicsInstancing.ts`: instanced rendering batches for debris fragments so thousands of shards do not become thousands of scene meshes
- `src/rubble.ts`: persistent destructible rubble cover patches, multi-cell merge rules, support/fall behavior, and promotion into generated `Rubble` terrain blocks
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
- `src/lighting.ts`: shared visible-sun direction used by lighting, skybox alignment, and shadow anchoring
- `src/voxelLighting.ts`: worker-safe sun constants and light-aware baked face shading
- `src/qualityController.ts`: quality preset persistence and renderer/light/camera application
- `src/qualitySettings.ts`: per-preset custom settings storage, slider bounds, and menu label formatting
- `src/skybox.ts`: generated sunlit equirectangular skybox texture and camera-following sky dome
- `src/shadows.ts`: directional shadow-map texel snapping helpers
- `src/minimap.ts`: minimap terrain slicing, grid, and player marker drawing
- `src/novaPilot.ts`: visible companion pilot, follow/orbit behavior, and Nova-thrown core launch helpers
- `src/novaPilotReactions.ts`: event-driven Nova chatter, pulse reactions, and message throttling
- `src/debugHud.ts`: debug overlay stats formatting, CPU timing buckets, and update throttling
- `src/frameLoop.ts`: frame delta clamping and hidden/overnight resume guards
- `src/frameTimings.ts`: smoothed per-frame subsystem timing helpers for the debug overlay
- `src/worldMenu.ts`: saved-world list rendering and readable seed generation

## Development Checks

- `npm.cmd run typecheck`: strict TypeScript no-emit validation
- `npm.cmd run test`: strict typecheck plus bundled Node engine robustness tests
- `npm.cmd run build`: production build smoke test
- `git diff --check`: whitespace sanity check before commits

## Sensible Next Steps

- Add material-specific fracture behavior so stone, dirt, sand, grass, ember, and generated rubble fail differently.
