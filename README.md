# Voxel Sandbox Engine

A tiny strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering, Rapier handles active rigid-body block debris, and the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, held item actions, block edits, impact damage, rubble bake-out, projectile physics cores, and hitscan cores.

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
- `Superflat Lab` on the home screen creates a flat grass/dirt/stone test world using the reserved `superflat` seed
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
- `Mouse wheel` selects held items: Unarmed, placeable blocks, Physics Core, or Hitscan Core
- `Unarmed` does nothing on either click for now
- Selected blocks use `Left click` to break the targeted block and `Right click` to place into the adjacent space
- Selected Physics Core uses `Left click` to throw a core from the lowered right-side muzzle; hold `Right click` while firing to use centered reticle ADS with a slight 15% zoom
- Selected Hitscan Core uses `Left click` to fire an instant 10%-radius, 500%-speed core trace from the lowered right-side muzzle through the same partial-block bite and piercing rules, with a short additive energy-beam flash drawn along the shot line; hold `Right click` while firing to use centered reticle ADS with a slight 15% zoom
- `F` toggle flight mode
- Core impacts above 2 m/s carve one health step out of 10-HP ordinary terrain by taking hidden 3x3x3 bite cells out of a faceted partial-block volume, spend projectile cores on contact unless a tiny fast core pierces through to air, show short debug health bars, and eject a small material-budgeted chip burst from the struck point. Chipped cells stay full-cube for player/debris collision and raycast until they break, but projectile and hitscan cores collide against the remaining bite-lattice material so shots can pass through visual tunnels; visible fill tracks remaining HP, so a 7/10 HP block keeps about 70% of its presentation lattice. Bite cells persist once removed, so later hits cannot visually refill older damage. Final fractures release only the block material still left inside, clear the bite mesh, and leave air instead of stamping a wrinkled surface puddle. Impact trajectory and core radius rank bite cells, so tiny cores drill narrow lattice columns while larger cores chew a broader face footprint before reaching deeper cells; small fast cores can continue through a complete tunnel with reduced speed when the exit cell is empty, and Hitscan Core repeats that continuation instantly across its trace. This first pass does not persist carved shapes to saves yet. Destructible rubble piles still take the full 30 core damage. Nearby fragments tumble, collide through cheap cuboid envelopes, stack, sleep, and remain shoveable inside the player-centered debris bubble, then convert into hybrid walkable rubble piles once outside the bubble or under physics-budget pressure; targeted rubble cells use a white cube-space outline, unsupported piles fall/merge, and large dense piles compact into a solid `Rubble` block
- `N` toggle the Nova Pilot companion; `B` asks Nova to throw a physics core from her own position
- `Enter` or `F9` opens Nova Terminal, a local companion terminal that accepts normal chat plus commands like `/spawn target`, `/superflat`, or bare known commands such as `help`
- `X` despawn active physics cores while keeping loose debris and rubble cover
- `F3` toggle debug overlay, including smoothed FPS, raw/peak frame time, CPU timing buckets, active/sleeping physics broadphase counts, rigid debris body/collider counts, instanced debris render counts, active debris bubble metrics, settling-region metrics, baked rubble chunk counts, and rubble cover stats for hitch hunting. 45ms+ frame spikes also write a compact `[Voxel Hitch]` diagnosis to the browser console and keep recent records available at `globalThis.__VOXEL_HITCHES__()`
- `F4` cycle built-in quality: Potato, Low, Normal, High, Ultra
- `F8` toggles the scripted test avatar, currently a small core-break integration run that stages a target voxel and fires the real player Physics Core path
- Nova Terminal commands include `superflat`, `spawn target [block]`, `spawn wall [block] [width] [height]`, `spawn pillar [block] [height]`, and `spawn platform [block] [size]`
- Pause menu `Settings` splits tuning into `Graphics` and `Gameplay` tabs: graphics owns quality, render distance, physics body budget, shadows, debris count, and Super Ultra; gameplay owns projectile core size/velocity, health bars, and cleanup. Quality slider edits switch the dropdown to `Custom` so built-in presets stay clean
- Settings `Physics Object Budget` stepper and slider change the current quality preset's physics-body budget
- Gameplay `Health Bars` toggles block/rubble damage bars and clears any visible bars when turned off
- Gameplay `Despawn All Objects` performs the drastic full cleanup: physics cores, loose debris, and rubble cover
- Pause menu `Allow Super Ultra Mode` toggle appears at `Ultra` and unlocks the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 2 visible debris shards, 8m active debris bubble
- `Low`: current low-end baseline, no shadows, 128 physics bodies, 4 visible debris shards, 12m active debris bubble
- `Normal`: 2x render distance, shadows, 192 physics bodies, 7 visible debris shards, 20m active debris bubble
- `High`: 4x render distance, sharper local shadows, 512 physics bodies, 14 visible debris shards, 32m active debris bubble
- `Ultra`: 6x render distance, sharper local shadows, 1024 physics bodies, 27 visible debris shards, 48m active debris bubble
- `Super Ultra`: 12x render distance, highest local shadow resolution, 4096 physics bodies, 27 visible debris shards, 72m active debris bubble, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected
- `Custom`: created automatically when settings sliders are changed, using the selected built-in preset as its baseline

Lower visible debris counts are only a rendering/performance compromise. A full destroyed block contributes `1.0` block-volume of gameplay rubble material, no matter whether the quality preset renders 2, 7, 14, or 27 visible shards. Physics Core carving releases that material over repeated chip hits instead of duplicating a whole block at the final break; remaining material is derived from remaining HP, so a block at 7/10 HP keeps about 70% of its material budget. The damaged-block mesh uses the same 27-cell fracture lattice only as presentation resolution, hiding roughly the damage fraction while gameplay material remains normalized. Support shape and dense-pile promotion do not change with graphics quality. Durability is scaled separately so one full block's rubble is roughly as tough as a generated `Rubble` terrain block instead of inheriting debris-shard count as health. Debris is temporary but no longer just timer-based: nearby fractures share a settling region, visible low-poly shards burst apart as Rapier cuboids, collide against each other, terrain, and temporary rubble-support colliders, then promote into the cheap persistent rubble field once the rigid-body stack sleeps. If the player leaves the bubble or the physics budget needs relief before that, the same material-preserving bake-out path runs, preferring sleeping debris before awake far debris so material is preserved before any core pruning happens. Final rubble keeps bounded surface samples for walkable support and capped baked shard chunks from the settled rigid-body poses; the old draped/wrinkly sheet mesh is parked behind a disabled flag, so persistent piles currently render as static shard piles while preserving enough data for future rubble-to-debris re-break and larger-scale rubble mechanics. Sparse rubble uses a local footprint around its samples, while heavier piles grow toward full-cell walkable cover.

Long-running idle sessions are guarded too: once chunk, mesh, save, debris, and physics work has drained, the app stops the animation loop after five minutes without input, and hidden/locked sessions use a low-frequency heartbeat instead of continuous WebGL frames.

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, world lifecycle orchestration, and WebGL runtime teardown
- `src/adminCommands.ts`: admin command parsing/routing, Superflat Lab shortcut, and spawnable terrain test fixtures used by Nova Terminal
- `src/testAvatar.ts`: F8 scripted runtime avatar for repeatable in-browser gameplay smoke checks
- `src/damageIndicators.ts`: DOM-projected floating health bars for damaged terrain and rubble targets
- `src/eventBus.ts`: tiny typed in-memory pub/sub used for local engine/gameplay events
- `src/engineEvents.ts`: shared engine event contracts for world, physics, damage, rubble, quality, palette, and performance signals
- `src/world.ts`: chunk ownership, worker scheduling, cached chunk-window streaming/unloading, dirty chunk indexes, block reads/writes, sparse block damage, coalesced edited-chunk saves, and chunk/worker disposal
- `src/chunkStorage.ts`: IndexedDB adapter for saved worlds, player resume location, and edited chunk persistence
- `src/terrain.ts`: seeded terrain generation shared by main-thread fallback and the worker, including the reserved superflat test-lab seed
- `src/chunk.ts`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.ts`: worker-side terrain generation and greedy mesh building, including partial-block render masks
- `src/player.ts`: first-person controller, pointer-lock/input listener lifecycle, voxel collision, and partial-height rubble support stepping
- `src/sprintFeedback.ts`: sprint/boost FOV target and smoothing helpers
- `src/raycast.ts`: grid DDA block picking
- `src/targetHighlighter.ts`: thin target outline rendering for terrain blocks and settled rubble cube cells
- `src/partialBlocks.ts`: in-memory partial-block terrain carving, core-footprint-ranked hidden 3x3x3 bite-lattice damage visuals, stitched wrinkled partial-height surface mesh/support generation, and core-hit carve constants
- `src/impactCraterField.ts`: parked capped faceted crater/scar prototype retained for later visual experiments
- `src/blockColors.ts`: deterministic per-block tint buckets for subtle voxel color variation
- `src/blockFragments.ts`: 3x3x3 block fracture pattern, visible debris sampling, proportional terrain chip counts, normalized block-volume rubble material, and debris sizing constants
- `src/blocks.ts`: block IDs, colors, 10-HP ordinary terrain definitions, generated `Rubble`, and placeable palette
- `src/debrisShapes.ts`: shared low-poly shard geometry catalog and material-aware shape assignment helpers
- `src/debrisSettler.ts`: player-bubble-owned debris regions, material accounting, sleeping-first pressure finalization, and batched debris-to-rubble bake-out; legacy glue/contact helpers remain for non-Rapier test/fallback fragments
- `src/fragmentRubble.ts`: orphan debris-to-rubble eligibility rules for active-bubble distance, explicit expiration, and material-preserving fallback cleanup
- `src/items.ts`: reusable item registry, stack metadata, categories, tags, and primary/secondary action descriptors
- `src/hotbar.ts`: scroll-selected held-item lane, selection wrapping, number-key mapping, and action resolution helpers
- `src/physics.ts`: simple swept sphere-vs-voxel physics cores, fragment render/material/shape state, rigid-debris sync hooks, sleep-aware core/debris broadphase collision, and velocity/radius impact reporting for terrain carving and piercing
- `src/hitscanCore.ts`: instant core ray traversal that reuses the partial-block bite lattice, open-tunnel projectile query, and fixed smallest/fastest core envelope
- `src/hitscanBoltTracer.ts`: short-lived additive beam visuals for Hitscan Core, using the generated `src/assets/hitscan-energy-bolt.png` texture as a cylinder-like wrapper instead of a moving projectile sprite
- `src/physicsInstancing.ts`: instanced rendering batches for debris fragments keyed by source block and shard shape, including per-fragment tumble rotation and non-uniform scale
- `src/rigidDebris.ts`: Rapier WASM initialization, dynamic cuboid debris bodies with per-fragment envelopes, temporary terrain/rubble support colliders, transform sync back into fragment render proxies, sleeping stats, and cleanup
- `src/rubble.ts`: persistent destructible rubble cover patches, sample-sized hidden support footprints, parked draped-sheet rendering, batched absorption, scaled durability separate from material volume, baked static shard-pile visuals, local direct-hit damage with small neighbor chip damage, damage-event reporting, multi-cell merge rules, walkable support queries, fall behavior, and promotion into generated `Rubble` terrain blocks
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
- `src/physicsCoreSettings.ts`: persisted physics-core size/velocity tuning bounds and menu label formatting
- `src/rigidDebrisBudget.ts`: CPU-facing Rapier debris body safety rail derived from the broader physics object budget
- `src/lighting.ts`: shared visible-sun direction used by lighting, skybox alignment, and shadow anchoring
- `src/voxelLighting.ts`: worker-safe sun constants and light-aware baked face shading
- `src/qualityController.ts`: quality preset persistence and renderer/light/camera application
- `src/qualitySettings.ts`: per-preset custom settings storage, slider bounds, and menu label formatting
- `src/qualityPresets.ts`: render, shadow, streaming, physics budget, visible debris count, and active debris bubble defaults
- `src/skybox.ts`: generated sunlit equirectangular skybox texture and camera-following sky dome
- `src/shadows.ts`: directional shadow-map texel snapping helpers
- `src/minimap.ts`: minimap terrain slicing, grid, and player marker drawing
- `src/novaPilot.ts`: visible companion pilot, follow/orbit behavior, and Nova-thrown core launch helpers
- `src/novaContext.ts`: recent engine-event and runtime-context journal for Nova chat/reactions
- `src/novaChat.ts`: local context-aware Nova reply generation, terminal command routing, and bounded log helpers
- `src/novaChatPanel.ts`: in-game Nova Terminal pane, message rendering, and submit/close behavior
- `src/novaPilotReactions.ts`: event-driven Nova chatter, pulse reactions, and message throttling
- `src/debugHud.ts`: debug overlay stats formatting, CPU timing buckets, and update throttling
- `src/frameLoop.ts`: frame delta clamping, hidden/overnight resume guards, and idle animation-loop hibernation
- `src/frameTimings.ts`: smoothed per-frame subsystem timing helpers for the debug overlay
- `src/performanceHitchLog.ts`: bounded frame-spike black-box log, dominant-subsystem diagnosis, and console/Nova Terminal summaries
- `src/worldMenu.ts`: saved-world list rendering and readable seed generation

## Development Checks

- `npm.cmd run typecheck`: strict TypeScript no-emit validation
- `npm.cmd run test`: strict typecheck plus bundled Node engine robustness tests
- `npm.cmd run build`: production build smoke test
- `git diff --check`: whitespace sanity check before commits

## Sensible Next Steps

- Add material-specific fracture behavior so stone, dirt, sand, grass, ember, and generated rubble fail differently.
