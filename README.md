# Voxel Sandbox Engine

A tiny strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, held item actions, block edits, impact damage, and simple physics toys.

World units are metric: `1 block = 1 meter`.

Edited chunks and the last player location persist in IndexedDB browser storage. Clear this site's browser data to reset saved worlds.
The home screen creates and loads local saved worlds. New worlds store a name, seed, and resume location once played.

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
- Loading a world restores the last saved player location and look direction
- `Resume` captures mouse after pausing
- `Exit to Home` returns to the world list; switch worlds from there
- `Mouse` look while playing
- HUD shows the selected held item, movement mode, and current player speed in m/s
- Pause menu `Settings` opens the tunable engine controls; `Exit to Home` sits at the bottom as the red world-leave action
- `Space` jump, or fly upward while flight mode is active
- `C` crouch smoothly on foot, or fly downward while flight mode is active
- `C` while sprinting forward, or landing crouched with enough speed, starts a committed slide with an 80% entry-speed pop; hold `W` to glide longer, `Space` to spring-jump out of the slide
- `Shift` sprint on ground, or use the stronger flight speed boost; active sprint/boost widens FOV and adds peripheral speed lines
- `Mouse wheel` selects held items: Unarmed, placeable blocks, or Physics Core
- `Unarmed` does nothing on either click for now
- Selected blocks use `Left click` to break the targeted block and `Right click` to place into the adjacent space
- Selected Physics Core uses `Left click` to throw a core; `Right click` is intentionally reserved
- `F` toggle flight mode
- Physics Core impacts above 2 m/s deal 30 damage to terrain blocks and destructible rubble piles, destroying ordinary blocks in one hit, consuming the core when the hit target breaks, and fracturing destroyed terrain into quality-scaled visible cube fragments that settle into sloped, walkable rubble cover patches; unsupported piles fall/merge, and large dense piles compact into a solid `Rubble` block
- `N` toggle the Nova Pilot companion; `B` asks Nova to throw a physics core from her own position
- `Enter` opens Nova Chat, a local companion chat pane that uses recent engine events and runtime context; this is not connected to a remote model yet
- `X` despawn active physics cores while keeping loose debris and rubble cover
- `F3` toggle debug overlay, including smoothed FPS, raw/peak frame time, CPU timing buckets, active/sleeping physics broadphase counts, instanced debris render counts, and rubble cover stats for hitch hunting
- `F4` cycle built-in quality: Potato, Low, Normal, High, Ultra
- Pause menu `Settings` contains a `Quality Preset` dropdown, plus sliders for render distance, physics body budget, shadow quality, and debris count; slider edits switch the dropdown to `Custom` so built-in presets stay clean
- Settings `Physics Object Budget` stepper and slider change the current quality preset's physics-body budget
- Settings `Despawn All Objects` performs the drastic full cleanup: physics cores, loose debris, and rubble cover
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 2 visible debris shards
- `Low`: current low-end baseline, no shadows, 128 physics bodies, 4 visible debris shards
- `Normal`: 2x render distance, shadows, 192 physics bodies, 7 visible debris shards
- `High`: 4x render distance, sharper local shadows, 512 physics bodies, 14 visible debris shards
- `Ultra`: 6x render distance, sharper local shadows, 1024 physics bodies, 27 visible debris shards
- `Super Ultra`: 12x render distance, highest local shadow resolution, 4096 physics bodies, 27 visible debris shards, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected
- `Custom`: created automatically when settings sliders are changed, using the selected built-in preset as its baseline

Lower visible debris counts are only a rendering/performance compromise. Destroyed blocks still contribute one full 3x3x3 block-fracture worth of gameplay rubble material, so sloped rubble cover, health, and dense-pile promotion do not change with graphics quality. If a tiny low-quality shard sample expires before sleeping, it still deposits its carried rubble material before cleanup.

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, world lifecycle orchestration, and WebGL runtime teardown
- `src/eventBus.ts`: tiny typed in-memory pub/sub used for local engine/gameplay events
- `src/engineEvents.ts`: shared engine event contracts for world, physics, damage, rubble, quality, palette, and performance signals
- `src/world.ts`: chunk ownership, worker scheduling, cached chunk-window streaming/unloading, dirty chunk indexes, block reads/writes, sparse block damage, coalesced edited-chunk saves, and chunk/worker disposal
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds, player resume location, and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building
- `src/player.ts`: first-person controller, pointer-lock/input listener lifecycle, voxel collision, and partial-height rubble support stepping
- `src/sprintFeedback.ts`: sprint/boost FOV target and smoothing helpers
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin block-target outline rendering
- `src/blockColors.ts`: deterministic per-block tint buckets for subtle voxel color variation
- `src/blockFragments.ts`: 3x3x3 block fracture pattern, visible debris sampling, stable rubble material units, and debris sizing constants
- `src/fragmentRubble.ts`: settled/expired debris-to-rubble eligibility rules that keep low-quality debris cleanup from deleting gameplay material
- `src/items.ts`: reusable item registry, stack metadata, categories, tags, and primary/secondary action descriptors
- `src/hotbar.ts`: scroll-selected held-item lane, selection wrapping, number-key mapping, and action resolution helpers
- `src/physics.ts`: simple sphere-vs-voxel rigid bodies, sleep-aware split core/debris broadphase collision, impact reporting, and shared-resource cube fragments
- `src/physicsInstancing.ts`: instanced rendering batches for debris fragments so thousands of shards do not become thousands of scene meshes
- `src/rubble.ts`: persistent sloped destructible rubble cover patches, multi-cell merge rules, walkable support queries, fall behavior, and promotion into generated `Rubble` terrain blocks
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
- `src/lighting.ts`: shared visible-sun direction used by lighting, skybox alignment, and shadow anchoring
- `src/voxelLighting.ts`: worker-safe sun constants and light-aware baked face shading
- `src/qualityController.ts`: quality preset persistence and renderer/light/camera application
- `src/qualitySettings.ts`: per-preset custom settings storage, slider bounds, and menu label formatting
- `src/skybox.ts`: generated sunlit equirectangular skybox texture and camera-following sky dome
- `src/shadows.ts`: directional shadow-map texel snapping helpers
- `src/minimap.ts`: minimap terrain slicing, grid, and player marker drawing
- `src/novaPilot.ts`: visible companion pilot, follow/orbit behavior, and Nova-thrown core launch helpers
- `src/novaContext.ts`: recent engine-event and runtime-context journal for Nova chat/reactions
- `src/novaChat.ts`: local context-aware Nova reply generation and bounded chat log helpers
- `src/novaChatPanel.ts`: in-game Nova chat pane, message rendering, and submit/close behavior
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
