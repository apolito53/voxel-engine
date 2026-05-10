# Codebase Index

Last reviewed: 2026-05-10

Purpose: a compact map for surgical codebase reads. Keep this file current when module ownership, commands, or architecture changes.

## Stack

- Strict TypeScript Vite browser app using native ES modules plus a module Web Worker for chunk CPU work.
- Three.js handles rendering, camera, materials, lights, and meshes.
- Rapier (`@dimforge/rapier3d-compat`) handles active rigid-body cuboid-envelope debris inside the player bubble through the local `src/rigidDebris.ts` adapter.
- World units are metric: `1 block = 1 meter`, defined by `METERS_PER_BLOCK` in `src/voxelConstants.ts`.
- The app code owns chunks, terrain generation, voxel meshing, player movement, collision, ray picking, held-item action routing, HUD, minimap, admin/test-lab tooling, impact damage, debris lifetime/bake-out, rubble cover proxies, and simple physics toys/cores.

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

- App bootstrap, render loop, input glue, world lifecycle orchestration, terrain/rubble target selection, damage indicator wiring, and WebGL runtime teardown: `src/main.ts`
- HTML shell, home screen, HUD nodes, pause menu, minimap canvas: `index.html`
- Visual styling and overlays: `src/style.css`
- Admin command parsing/routing, Superflat Lab launcher hook, and spawnable terrain fixtures used by Nova Terminal for repeatable testing: `src/adminCommands.ts`
- F8 scripted runtime avatar for in-browser gameplay smoke checks: `src/testAvatar.ts`
- Floating health-bar projection for damaged terrain/rubble targets; visibility is gated by the pause-menu `Health Bars` toggle in `src/main.ts`: `src/damageIndicators.ts`
- Typed in-memory engine/gameplay pub/sub: `src/eventBus.ts`, `src/engineEvents.ts`
- Required DOM/canvas lookup helpers: `src/dom.ts`
- WebGL GPU text helpers: `src/gpu.ts`
- Saved-world list rendering, save deletion controls, and seed generation: `src/worldMenu.ts`
- Delete-world confirmation pane copy: `src/deleteWorldDialog.ts`
- Debug HUD throttling, frame-spike tracking, CPU timing buckets, fragment instancing stats, rubble cover stats, and renderer stats text: `src/debugHud.ts`
- Frame delta clamping, hidden/overnight resume guards, and idle animation-loop hibernation: `src/frameLoop.ts`
- Smoothed per-frame subsystem timing helpers for hitch profiling: `src/frameTimings.ts`
- Reusable held-item registry, stack metadata, categories, tags, and primary/secondary action descriptors: `src/items.ts`
- Scroll-selected held-item lane, selection wrapping, number-key mapping, and action resolution helpers: `src/hotbar.ts`
- Minimap terrain slicing, grid, and player marker drawing: `src/minimap.ts`
- Block IDs, colors, health, generated `Rubble` block, and placeable palette: `src/blocks.ts`
- Deterministic per-block tint buckets used by worker and fallback meshing: `src/blockColors.ts`
- Block fracture grid, quality-scaled visible-fragment sampling, stable per-block rubble material units, and debris sizing constants: `src/blockFragments.ts`
- Shared low-poly shard geometry catalog, deterministic material-aware debris shape selection, visual scale, and cuboid physics envelope helpers: `src/debrisShapes.ts`
- Player-bubble-owned debris regions, material accounting, sleeping-first pressure finalization, batched debris-to-rubble bake-out, and legacy non-Rapier glue/contact helpers: `src/debrisSettler.ts`
- Orphan debris-to-rubble eligibility rules for active-bubble distance, explicit expiration, and material-preserving fallback cleanup: `src/fragmentRubble.ts`
- Shared world scale, chunk dimensions, and world height constants: `src/voxelConstants.ts`
- IndexedDB storage adapter for saved worlds, player resume location, save deletion, and edited chunk persistence: `src/chunkStorage.ts`
- Seeded terrain generation shared by fallback and worker paths, including the reserved `superflat` test-world seed: `src/terrain.ts`
- Chunk voxel storage, top-column cache, main-thread mesh fallback, worker mesh upload: `src/chunk.ts`
- Shared chunk worker request/result message contracts: `src/chunkProtocol.ts`
- Worker-side chunk terrain generation and greedy mesh buffer building: `src/chunkWorker.ts`
- Chunk ownership, worker scheduling, cached chunk-window streaming/unloading, dirty/modified chunk indexes, reads/writes, sparse block damage, coalesced chunk-save writes, idle pending-work reporting, and worker/chunk disposal: `src/world.ts`
- Shared collision-world shape, collision bounds, and optional partial-height support contract used by player movement and loose debris physics: `src/collision.ts`
- First-person walking, flight, smoothed crouch view, committed slide state, crouched landing slides, slide-jump momentum, pointer lock, input-listener disposal, voxel collision, and partial-height rubble stepping: `src/player.ts`
- Player movement constants and committed slide/landing-slide/air-control/flight/crouch-view tuning helpers: `src/playerMovement.ts`
- Player velocity magnitude and metric speed readout formatting: `src/playerSpeed.ts`
- Sprint/flight-boost feedback FOV target and smoothing helpers: `src/sprintFeedback.ts`
- Nova Pilot companion mesh, follow/orbit behavior, and Nova-thrown core launch helpers: `src/novaPilot.ts`
- Event-backed Nova context journal, local reply generation, terminal command routing, and in-game terminal panel: `src/novaContext.ts`, `src/novaChat.ts`, `src/novaChatPanel.ts`
- Event-driven Nova chatter, glow pulses, message throttling, and companion reactions: `src/novaPilotReactions.ts`
- Block picking for break/place interactions: `src/raycast.ts`
- Thin edge outline for the currently targeted block or settled-rubble cube cell, including style switching and geometry/material disposal: `src/targetHighlighter.ts`
- Throwable bouncing swept physics core, fragment render/material/shape state, rigid-debris sync hooks, sleep-aware split core/debris broadphase collision, impact speed reporting, and shared-resource sleeping/expiring fragments: `src/physics.ts`
- Persisted physics-core size/velocity slider bounds, defaults, normalization, and label formatting: `src/physicsCoreSettings.ts`
- Instanced debris rendering batches keyed by source block material and shard shape, including per-fragment tumble rotation and non-uniform scale: `src/physicsInstancing.ts`
- Rapier WASM initialization, dynamic cuboid debris bodies with per-fragment half extents, path-lookahead temporary terrain/rubble support colliders, transform sync back to fragment render proxies, sleeping stats, and cleanup: `src/rigidDebris.ts`
- Persistent destructible rubble cover patches, sparse hidden support footprints, parked faceted heightfield rendering, batched absorption, bounded surface samples, baked static shard-pile visuals, scaled durability separate from material volume, raycast target-cell reporting, direct-hit damage with small neighbor chip damage, damage-event reporting, multi-cell merge rules, walkable support-height queries, support/fall behavior, and dense terrain-block promotion: `src/rubble.ts`
- Per-quality persisted physics body budget bounds and step helpers: `src/physicsBudget.ts`
- CPU-facing Rapier debris body cap derived from the broader physics object budget: `src/rigidDebrisBudget.ts`
- Shared visible-sun direction used by lighting, skybox alignment, and shadow anchoring: `src/lighting.ts`
- Worker-safe sun constants and light-aware baked voxel face shading: `src/voxelLighting.ts`
- Render quality controller, Custom preset for slider edits, persistence, and renderer/light/camera application: `src/qualityController.ts`
- Custom quality settings storage, slider bounds, and menu label formatting: `src/qualitySettings.ts`
- Render quality preset definitions, physics-body defaults, active debris bubble radii, Custom baseline, and tuning knobs: `src/qualityPresets.ts`
- Generated sunlit skybox texture and camera-following sky dome: `src/assets/skybox-sunlit-day.png`, `src/skybox.ts`
- Directional shadow-map texel snapping helpers: `src/shadows.ts`
- Clamp, noise, and terrain math helpers: `src/math.ts`
- Windows startup helper: `start.ps1`
- Linux/Ubuntu startup helper: `start.sh`
- Project backlog and parked feature ideas: `TODO.md`
- Tiny Node test bundler: `scripts/run_tests.mjs`
- Engine robustness test entrypoint: `tests/run.ts`
- TypeScript migration helpers: `scripts/ts_migration.py`, `scripts/ts_migration_audit.py`, `scripts/run_python.ps1`, `scripts/run_python.sh`, `scripts/README.md`
- Vite production-build config and manual vendor chunking: `vite.config.ts`

## Runtime Flow

1. `index.html` loads `src/main.ts`.
2. `main.ts` creates the Three.js renderer, scene, lights, camera-following generated skybox, `VoxelWorld`, `PlayerController`, and small UI helpers for quality, debug HUD, minimap, and world list rendering.
3. `main.ts` opens the async IndexedDB save registry, then starts on the home screen; `worldMenu.ts` renders saved-world rows, and loading, creating, Superflat Lab creation, or confirmed deletion updates the saved-world slots, active seed, and optional player resume location.
4. `VoxelWorld` reads the saved chunk key index when a world loads, but chunk payloads stay lazy and stream from IndexedDB only when needed.
5. `VoxelWorld.ensureChunksAround` creates initial spawn chunks after a world is loaded; generated chunks use seeded `fbm2` terrain noise from `src/terrain.ts`.
6. During play, `main.ts` passes the camera view direction and camera frustum into `VoxelWorld.streamChunksAround`; cached chunk-radius offsets populate the queue only when the player crosses a chunk boundary or the load radius changes, unchanged unload windows skip loaded-chunk sweeps, then chunk generation queues are picked as a bounded slice that keeps nearby chunks first and prioritizes chunks inside the camera view.
7. Completed worker/storage chunk results are also applied in camera-prioritized bounded slices, so high-distance fresh worlds do not upload large bursts of chunks or let offscreen results steal the visible-frame budget.
8. Dirty chunks are tracked by key, then use the same bounded frustum-biased priority before meshing in the worker as typed-array buffers and uploading through `Chunk.applyMeshData`; worker and fallback meshes both use `src/blockColors.ts` so deterministic tint buckets do not change between mesh paths.
9. If workers are unavailable or fail, `VoxelWorld` falls back to synchronous chunk generation and `Chunk.rebuildMesh`.
10. Each visible animation frame updates player motion, optional F8 test-avatar scripting, Nova Pilot companion motion/reactions, Nova Terminal runtime context, chunk streaming, physics toys/cores with reusable impact buffers and slider-tuned launch size/velocity, rubble-core collision, damage health-bar projection, Rapier rigid debris and temporary static terrain/rubble colliders, settling-region debris finalization, orphan settled-fragment fallback absorption, rubble patch merge/support/fall/terrain-promotion rules, a sleep-aware split core/debris broadphase shove pass, speed-gated impact damage, quality-scaled and slider-tuned physics body budgets, instanced debris render batches, dirty mesh scheduling, HUD/debug text, minimap, and final render only while a world is active. Hidden tabs and long resume gaps skip expensive work and reset profiler/minimap meters; once chunk, worker, save, debris, and awake-physics work has drained, visible worlds with no input for five minutes stop RAF entirely and use a low-frequency idle heartbeat until focus, visibility, pointer, or keyboard activity resumes the loop. The debug HUD receives smoothed CPU timing buckets for player, chunk, physics, mesh, minimap, render, miscellaneous work, settling-region pressure, rigid debris body/collider pressure, fragment instancing pressure, and rubble cover pressure.
11. `Exit to Home` saves the player feet position plus look angles, flushes async chunk writes, and unloads the active world view; switching worlds happens from the home screen, not the pause menu.
12. The scroll wheel selects the current held item stack from the hotbar. `src/items.ts` owns reusable item definitions and primary/secondary action descriptors, while `src/hotbar.ts` only owns selection and action lookup. The current item set is Unarmed, placeable blocks, and Physics Core: Unarmed is intentionally inert, selected blocks use left click to break and right click to place, and selected Physics Core uses left click to throw while right click stays reserved.
13. Block edits go through `voxelRaycast` plus `VoxelWorld.setBlock`; edited chunk snapshots are coalesced per chunk before IndexedDB receives raw binary chunk payloads, and neighboring chunks are marked dirty when edge blocks change.
14. Thrown physics cores report voxel impacts; impacts above 2 m/s carry the source core, resolve terrain damage immediately after that core moves, apply `PHYSICS_CORE_BLOCK_DAMAGE` (`30`) to terrain through `VoxelWorld.damageBlock`, and consume the core if the impacted voxel is destroyed before rubble collision is considered. Damaged terrain and rubble emit typed events and short floating health bars for debugging/future combat feedback. Destroyed blocks are removed from the grid before spawning quality-scaled visible loose shaped fragments sampled from the 3x3x3 fracture grid. Visible fragment count is only a performance/rendering knob: every destroyed block still carries one full fracture-grid worth of rubble material for cover shape, support, and dense-pile promotion, while rubble HP is scaled separately to one generated `Rubble` block's durability per full block of material. New fractures join nearby temporary settling regions, burst apart for a short breakup grace, then briefly collide/glue/stack/clump with same-region debris, add exaggerated shard tumble through `PhysicsToy.angularVelocity`, and rest on terrain or existing partial-height rubble surfaces. Debris reports whether it touched support during its most recent physics update and whether its sleep state is support-anchored, allowing supported glue-connected clumps to sleep even when upper shards are resting on other debris rather than terrain. Sleep checks run per glue-connected component and then per-fragment support chain so a grounded shard can support stack-like upper debris without freezing side-linked or visibly floating debris. Glue links also maintain a minimum readable center separation so the sticky clump illusion does not preserve obvious fragment interpenetration. In the browser loop those owned regions now stay active or sleeping while inside the quality-scaled player debris bubble; they finalize into rubble only when the player leaves the radius plus buffer, physics-budget pressure needs relief, or full cleanup clears the world. Budget pressure finalizes farthest regions first, then absorbs far/outside orphan fragments, and only prunes old cores directly as a last resort so fragment material is not deleted. Rubble patches merge across neighboring same-height cells up to a bounded patch size, skip internal mesh faces so they read as connected debris, keep bounded surface samples from settled fragments, render a faceted low-poly heightfield draped over those samples, bake capped static shard samples into the same mesh for silhouette and future re-break data, keep sparse material in local sample footprints instead of full-cell tiles, share edge heights across neighboring broad piles, rise subtly toward adjacent solid terrain, and expose partial-height support queries so the player can stand on larger piles without making every pile a full terrain voxel. Rubble checks support each active frame: unsupported cells fall one voxel cell, falling cells merge into piles below, and dense supported cells compact into the generated solid `Rubble` block only after well over one full block-fracture worth of debris accumulates. Active cores can still shove loose fragments and collide with rubble patches without enabling permanent debris-debris pair generation; the same `30` impact damage applies to the directly struck rubble pile, only immediate neighbors get a small non-lethal chip if that pile breaks, and a core is consumed if it destroys the pile cell it struck. `X` removes only thrown cores so rubble experiments can stay in place, while the settings-panel `Despawn All Objects` button clears cores, loose debris, settling regions, rubble, and damage indicators. Cores also sleep after settling so old shots do not keep paying per-frame voxel collision cost forever.
15. `Enter`, `F9`, or the pause-menu `Nova Terminal` button opens the local terminal pane. Normal text feeds replies from the `NovaContextJournal`; slash commands and bare known admin commands route through `src/adminCommands.ts`. Opening the terminal suspends movement/look without showing the pause menu and resumes pointer lock when closed. The conversational implementation is local context-aware text only; a real model/proxy hook is future work.
16. Dev reloads and browser unloads run `disposeRuntime()` from `src/main.ts`: the active animation frame is canceled, main event listeners are aborted, player input listeners are disposed, active chunks/worker/physics/Nova helpers are released, and the renderer forces WebGL context loss so Firefox's GPU process does not keep old dev contexts around.

## Base And Bolt-On Boundaries

Long-term direction: keep this repo as the kitchen-sink proving ground, but shape mature systems so a new game instance can pick a base plus selected bolt-ons without dragging every experiment along. The immediate goal is documentation and small interface boundaries, not a package split.

- Base voxel instance: `index.html`, `src/main.ts`, `src/world.ts`, `src/chunk.ts`, `src/chunkWorker.ts`, `src/chunkProtocol.ts`, `src/terrain.ts`, `src/voxelConstants.ts`, `src/collision.ts`, `src/raycast.ts`, `src/blocks.ts`, `src/blockColors.ts`, `src/voxelLighting.ts`, `src/lighting.ts`, `src/skybox.ts`, and `src/shadows.ts`. This is the hardest piece to extract because chunk storage, meshing, terrain generation, collision queries, and the play loop are intentionally interwoven for now.
- Player-control bolt-on: `src/player.ts`, `src/playerMovement.ts`, `src/playerSpeed.ts`, and `src/sprintFeedback.ts`. Desired extraction contract is a world collision/support query, a camera/input surface, and a movement-tuning object.
- Save/world-menu bolt-on: `src/chunkStorage.ts`, `src/worldMenu.ts`, `src/deleteWorldDialog.ts`, plus the home-screen orchestration in `src/main.ts`. Desired extraction contract is an app identity/storage namespace, seed metadata, edited-chunk payload format, and optional player resume pose.
- Held-item/action bolt-on: `src/items.ts`, `src/hotbar.ts`, plus focused action dispatch in `src/main.ts`. This is already close to portable because held-item behavior is mostly data plus a small runtime dispatcher.
- Damage/targeting feedback bolt-on: `src/targetHighlighter.ts`, `src/damageIndicators.ts`, terrain/rubble damage events in `src/engineEvents.ts`, and the target-selection hooks in `src/main.ts`. Desired extraction contract is a targetable cell/source id, world-to-screen projection, and a health-event payload.
- Quality/performance bolt-on: `src/qualityPresets.ts`, `src/qualitySettings.ts`, `src/qualityController.ts`, `src/physicsBudget.ts`, `src/physicsCoreSettings.ts`, `src/rigidDebrisBudget.ts`, `src/frameTimings.ts`, and debug-HUD display in `src/debugHud.ts`. This should stay policy-driven: presets tune budgets/radii/counts, while features ask for budgets/settings instead of hard-coding their own limits.
- Physics-core bolt-on: `src/physics.ts`, `src/physicsCoreSettings.ts`, plus `PhysicsToyCollider` use in `src/main.ts`. Desired extraction contract is scene ownership, collision bounds/support queries, impact callbacks, and a launch tuning object. Keep thrown-core behavior separable from debris and rubble so a new instance can keep projectiles without destruction cover.
- Debris-visual bolt-on: `src/blockFragments.ts`, `src/debrisShapes.ts`, and `src/physicsInstancing.ts`. This is one of the cleanest reusable pieces: given source material/block id, fragment positions, transforms, and shape metadata, it can render many transient fragments through shared geometries and instanced batches.
- Rigid-debris bolt-on: `src/rigidDebris.ts` plus budget policy in `src/rigidDebrisBudget.ts`. This is intentionally adapter-shaped: Rapier stays behind local methods, dynamic bodies use cheap cuboid envelopes, and terrain/rubble support enters through small path-lookahead static-collider refresh inputs.
- Rubble/cover bolt-on: `src/rubble.ts`, `src/debrisSettler.ts`, and `src/fragmentRubble.ts`. This is powerful but least portable today because it owns gameplay material accounting, support height, damage, raycast cells, fall/merge rules, and terrain-block promotion. Future extraction should split the durable cover proxy from the voxel-world promotion policy.
- Event/reaction bolt-on: `src/eventBus.ts`, `src/engineEvents.ts`, `src/novaPilotReactions.ts`, `src/novaContext.ts`, `src/novaChat.ts`, `src/novaChatPanel.ts`, and `src/novaPilot.ts`. Keep engine events generic enough that Nova can be removed, replaced, or kept as a flavor layer without rewriting damage, world, or physics systems.

When adding a new mature feature, add it to this list with three things: owning files, external contracts it should depend on, and the parts it should not directly own. Prefer small TypeScript interfaces at module boundaries once a second instance actually needs the system; until then, avoid premature package structure and keep the kitchen sink pleasant to work in.

## Common Change Targets

- Add, recolor, or retune block health: update `src/blocks.ts`; inspect deterministic tinting in `src/blockColors.ts`, mesh color use in `src/chunk.ts`, rubble promotion in `src/rubble.ts`, and debris color use in `src/physics.ts`.
- Tune chunk dimensions: update `src/voxelConstants.ts`, then verify worker and main-thread paths still agree.
- Tune terrain: update `src/terrain.ts`; terrain noise helpers live in `src/math.ts`.
- Add or adjust repeatable runtime test tools: `src/adminCommands.ts`, `src/testAvatar.ts`, Nova Terminal routing in `src/novaChat.ts`/`src/novaChatPanel.ts`, home/HUD markup in `index.html`, overlay styling in `src/style.css`, and the lifecycle hooks in `src/main.ts`.
- Tune saved worlds, player resume location, save deletion, or edit persistence: update `src/chunkStorage.ts`, home-menu glue in `src/main.ts`, list controls in `src/worldMenu.ts`, and the save/load calls in `src/world.ts`.
- Tune chunk streaming or worker budgets: update scheduling in `src/world.ts` and the debug display in `src/main.ts`.
- Tune movement feel: metric-scaled constants and committed slide/landing-slide/air-control/flight/crouch-view helpers in `src/playerMovement.ts`, sprint FOV feedback in `src/sprintFeedback.ts`, plus collision resolution, slide state, slide-jump momentum, and visual eye-height handling in `src/player.ts`.
- Change Nova's companion behavior or pilot-thrown cores: `src/novaPilot.ts`, `KeyN`/`KeyB` hooks in `src/main.ts`, and shared physics-core construction in `createPhysicsCore`.
- Add Nova chat context or local reply behavior: event payloads in `src/engineEvents.ts`, journal rules in `src/novaContext.ts`, reply selection in `src/novaChat.ts`, panel behavior in `src/novaChatPanel.ts`, and input/pointer-lock wiring in `src/main.ts`.
- Add gameplay/system reactions without coupling features together: define payloads in `src/engineEvents.ts`, emit from the owning runtime path, and subscribe from a focused consumer like `src/novaPilotReactions.ts` or `src/novaContext.ts`.
- Tune render/performance modes or settings tabs: quality preset constants in `src/qualityPresets.ts`, Custom slider bounds/storage in `src/qualitySettings.ts`, physics-core tuning in `src/physicsCoreSettings.ts`, the Super Ultra opt-in toggle, settings-menu HTML/CSS in `index.html` and `src/style.css`, and application logic in `src/qualityController.ts`/`src/main.ts`.
- Tune baked voxel face shading or visible sun direction: update `src/voxelLighting.ts`, `src/lighting.ts`, `src/assets/skybox-sunlit-day.png`, and `src/skybox.ts` together so worker mesh colors, skybox alignment, and shadows agree.
- Tune shadow stability or shimmer behavior: anchor snapping in `src/shadows.ts`, sun anchor wiring in `src/main.ts`, and preset shadow bounds in `src/qualityPresets.ts`.
- Change held item definitions, action mapping, break/place reach, hit behavior, item selection, terrain/rubble target picking, or target outline: `src/items.ts`, `src/hotbar.ts`, `src/raycast.ts`, `src/targetHighlighter.ts`, `src/rubble.ts`, and pointer/highlight hooks in `src/main.ts`.
- Change thrown object behavior, core/debris/rubble collision, debris lifetime, debris grid size, debris shapes, quality-scaled visible debris counts, stable rubble material units, settling-region behavior, Rapier debris bodies/colliders, instanced debris rendering, rubble cover proxies, walkable rubble support, object budget, despawn controls, damage indicators, or impact damage: `src/blockFragments.ts`, `src/debrisShapes.ts`, `src/rigidDebris.ts`, `src/debrisSettler.ts`, `src/fragmentRubble.ts`, `src/physics.ts`, `src/physicsCoreSettings.ts`, `src/physicsInstancing.ts`, `src/rubble.ts`, `src/collision.ts`, `src/damageIndicators.ts`, per-quality defaults in `src/qualityPresets.ts`, persistence bounds in `src/physicsBudget.ts`, `VoxelWorld.damageBlock` in `src/world.ts`, plus selected Physics Core use, `KeyX`, `PhysicsToyCollider`, `RigidDebrisSimulation`, `RubbleField`, `clearPhysicsCores`, `clearToys`, and `handlePhysicsImpact` in `src/main.ts`.
- Change HUD/minimap/debug/sprint-feedback/settings UI or the health-bar toggle: `index.html`, `src/style.css`, `src/debugHud.ts`, `src/frameTimings.ts`, `src/minimap.ts`, `src/sprintFeedback.ts`, `src/damageIndicators.ts`, and the orchestration hooks in `src/main.ts`.

## Sharp Edges

- Prefer `rg` for repo search. If Windows ever resolves to the protected Codex-bundled copy under `C:\Program Files\WindowsApps`, use the working user-local copy at `C:\Users\apoli\AppData\Local\OpenAI\Codex\bin\rg.exe` or `C:\Users\apoli\codex\tools\ripgrep\rg.exe`.
- `VoxelWorld.savedChunkKeys` mirrors the persisted edited chunk index; `savedChunks` is only a cache of loaded edited chunk payloads.
- Saved worlds are local browser slots in IndexedDB; edited chunks persist as full binary chunk snapshots, which is simple and reliable but not a final save-file format.
- Player resume location is saved as feet position plus yaw/pitch in saved-world metadata; avoid storing raw camera height or crouch view offsets, or crouched exits can reload into terrain.
- Edited chunk saves are debounced and coalesced per chunk so rapid destruction does not spam IndexedDB with intermediate snapshots; call `VoxelWorld.flushStorageWrites()` before switching storage or unloading a world.
- Worker meshing has a synchronous fallback path; keep both paths healthy when changing chunk storage or mesh formats.
- Block tint variation is part of the greedy mesh key. Keep worker and fallback meshing on the shared `src/blockColors.ts` helpers so tint buckets stay deterministic and chunks do not repaint between mesh paths.
- Worker meshes treat missing neighbor chunks as temporarily solid so streaming does not draw chunk-edge walls before neighbors load and trigger a remesh.
- Chunk `revision` values invalidate worker mesh results for both local block edits and neighbor-driven dirty marks; do not let stale neighbor snapshots clear `dirty`.
- Large render-distance presets depend on bounded frustum-biased chunk and mesh selection in `src/world.ts`; avoid reintroducing full queue sorts, full chunk-radius queue refreshes, full unload sweeps, or all-loaded-chunk dirty scans on every frame. If code clears pending load state or makes a saved chunk fall back to generated terrain, call the queue-window invalidation path so unchanged-center streaming can safely repopulate missing work. If code loads or creates chunks directly, keep the unload-window and dirty/modified indexes in sync.
- `Super Ultra` is intentionally gated by a pause-menu opt-in that only appears at `Ultra` or while `Super Ultra` is active.
- Pause-menu tuning controls live behind the `Settings` button so normal pause/resume stays quick; opening settings hides `Resume` and the red `Exit to Home` action until the user backs out. The panel is viewport-constrained and split into `Graphics` and `Gameplay` tabs to keep smaller windows reachable.
- Slider edits intentionally fork into the single `Custom` preset instead of mutating built-in presets; named custom preset management is future UI work.
- Browser worker behavior can differ from the build smoke test; reload the local app after worker pipeline changes and watch console logs/debug metrics.
- Firefox can retain WebGL/GPU-process memory across dev reloads if old contexts are not explicitly lost. Keep `disposeRuntime()` wired to `beforeunload` and Vite HMR, and keep long-lived Three.js helpers on a disposal path when adding new renderer-owned resources.
- Long idle sessions should hibernate instead of trusting browser RAF throttling. Keep `src/frameLoop.ts` and `VoxelWorld.hasPendingRuntimeWork()` in sync when adding new async queues or persistent simulation work, or the engine may sleep too early or run overnight again.
- `npm.cmd run test` bundles `tests/run.ts` into `.test-dist/` with esbuild before running in Node; `.test-dist/` is generated and ignored.
- `node_modules` and `dist` are generated and should not be scanned unless diagnosing dependency/build output.
- `vite.config.ts` manually separates Three.js into a `vendor-three` chunk and keeps other dependencies in `vendor`, so production build warnings point at genuinely oversized app code instead of the stable renderer dependency.
- Object-object physics is split: Rapier owns active debris-debris cuboid contacts, while `PhysicsToyCollider` keeps the cheap core/core and core/debris shove pass in spatial hashes. Call both `PhysicsToyCollider.forget()` and `RigidDebrisSimulation.forget()` before disposing a toy so sleeping/static caches and Rapier bodies cannot keep stale references.
- Physics-core size and velocity sliders affect newly thrown player and Nova cores. Core-vs-terrain contact uses a swept sphere path so tiny fast cores hit the first block along the segment instead of tunneling into the block behind it; crater/impact-point work should preserve that first-contact ordering.
- Debris fragments are rendered through per-block/per-shape `THREE.InstancedMesh` batches in `src/physicsInstancing.ts`; Rapier writes active fragment transforms back into `PhysicsToy.mesh.position` and `mesh.quaternion`, while `debrisShape.visualScale` stays render-side and fragment meshes are not added to the scene individually.
- `Despawn All Objects` uses the full cleanup path and releases high-water instanced debris batches, while `X` removes only thrown physics cores and preserves fragment/rubble experiments.
- Rubble patches are the persistent gameplay representation of finalized debris. `RigidDebrisSimulation` owns active cuboid contacts inside the bubble, while `DebrisSettler` owns region grouping, material accounting, settled-rigid-body promotion, distance/budget bake-out, and legacy manual-fragment glue helpers for tests/fallbacks. Sleeping rigid-body regions bake into rubble even inside the player bubble, pressure relief finalizes sleeping regions before awake far debris, and old cores are pruned only as a last resort. Because the old sheet renderer is parked, forced pressure bake-out must preserve at least one static visual chunk per converted fragment or the material becomes invisible support-only rubble. `RubbleField` keeps sample-driven hidden support footprints, baked shard visual chunks for current pile silhouettes and future re-break data, cover raycasts, scaled health, core collision, walkable partial-height support queries, fall/merge behavior, and promotion into the generated `Rubble` block together; the old faceted/draped heightfield renderer is parked behind `RUBBLE_RENDER_DRAPED_SHEET_MESH` and should stay disabled unless that zoomed-out rubble mechanic returns deliberately. Do not reintroduce permanent per-shard gameplay collision when tuning cover behavior. Lower quality settings spawn fewer visible flying fragments, but fragment `rubbleMaterialUnits` preserves one full block's material contribution and low-quality regions expand carried material into multiple samples, so graphics quality does not change cover value; durability is scaled separately so material volume does not become accidental 27-HP rubble.
- The player and loose debris receive terrain collision and rubble support through the shared `CollisionWorld` contract in `src/collision.ts`; full voxel blocking still comes from `isSolid`, while partial-height surfaces should opt in through `getSupportHeight`.
- Engine/gameplay events are local typed pub/sub, not DOM events; keep cross-system reactions on `src/eventBus.ts`/`src/engineEvents.ts` instead of stringly `CustomEvent` wiring.
- Item actions are data contracts. Add future tools, weapons, consumables, or game-mode commands by extending `ItemAction`/`ItemDefinition` in `src/items.ts`, then dispatch the new action in `src/main.ts` or a focused gameplay owner; avoid reintroducing direct hotbar-kind checks.
- Nova Terminal chat is deliberately local-only for now. Do not put OpenAI/API credentials in browser code; use a tiny local/backend proxy when the real model hook happens.
- Pointer lock behavior is browser-sensitive; `requestPointerLock()` can return a promise or `void`, so keep the guarded catch path in `src/player.ts` and test movement changes in the browser, not just with `npm.cmd run build`.
- TypeScript migration helpers are historical prep tools now; source in `src` is expected to stay strict without `@ts-nocheck` or explicit `any`.
