# Voxel Sandbox Engine

A tiny strict-TypeScript browser voxel sandbox prototype. Three.js handles rendering, Rapier handles active rigid-body block debris VFX, and the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, held item actions, block edits, impact damage, partial-block carving, projectile physics cores, hitscan cores, and parked rubble-cover experiments.

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

The dedicated local ports for this Vite project are:

- Base Vite server: `5173`
- Hitch-log receiver: `5174`
- Preview server: `4173`

Run `npm.cmd run debug:logs` in a second terminal when you want the local hitch-log receiver on `127.0.0.1:5174`.

The deployed Vercel site also writes 45ms+ hitch records to the private `voxel-engine-logs` Vercel Blob store through `/api/hitch-log`. Those remote JSONL blobs include the app version, hitch pass/session ids, source URL, browser user agent, Vercel environment, deployment URL, git commit, and branch. The local `.env.local` file contains the Blob token for CLI inspection; it is intentionally ignored by git.

Pass a different base-server port as the first argument only for temporary one-off runs, for example `.\start.ps1 5193` or `./start.sh 5193`. Do not use `5174`; it is reserved for the hitch-log receiver.

## Controls

- `WASD` move
- Home screen creates, loads, or deletes a world through an in-app confirmation pane
- `Superflat Lab` on the home screen creates a flat grass/dirt/stone test world using the reserved `superflat` seed
- Loading a world restores the last saved player location and look direction
- `Resume` captures mouse after pausing
- `Exit to Home` returns to the world list; switch worlds from there
- `Mouse` look while playing
- HUD shows the selected lane/item, movement mode, and Nova state in a compact status card; quick controls sit in low-profile hint chips away from the reticle, while F3 debug shows total player speed plus signed X/Y/Z velocity components
- Pause menu `Settings` opens the tunable engine controls; `Exit to Home` sits at the bottom as the red world-leave action
- `Space` jump, or fly upward while flight mode is active
- `C` crouch smoothly on foot, or fly downward while flight mode is active
- `C` while sprinting forward, or landing crouched with enough speed, starts a committed slide with an 80% entry-speed pop; hold `W` to glide longer, `Space` to spring-jump out of the slide
- `Shift` sprint on ground, or use the stronger flight speed boost; active sprint/boost widens FOV and adds peripheral speed lines
- `Mouse wheel` selects within the active lane: gameplay items or build blocks
- `G` toggles the active lane between `Items` and `Blocks`
- `Unarmed` does nothing on either click for now
- In `Blocks` lane, selected blocks use `Left click` to erase the targeted brush volume and `Right click` to place the selected block brush into the adjacent space; a translucent block-color ghost previews the placement volume before committing it
- Selected Physics Core uses `Left click` to throw a core from the lowered right-side muzzle; hold `Right click` while firing to use centered reticle ADS with a slight 15% zoom
- Selected Hitscan Core uses `Left click` to fire an instant 10%-radius, 500%-speed core trace from the lowered right-side muzzle through the same partial-block bite and piercing rules, poof loose debris along the beam path, and draw a short additive energy-beam flash along the shot line; hold `Right click` while firing to use centered reticle ADS with a slight 15% zoom
- `F` toggle flight mode
- Core impacts above 2 m/s carve one health step out of 10-HP ordinary terrain by taking hidden 3x3x3 bite cells out of a faceted partial-block volume, spend projectile cores on contact unless a tiny fast core pierces through to air, show short debug health bars, pop material-tinted bite poofs where sub-cells vanish, and eject a small material-budgeted chip burst from the struck point. Damage is applied through a sparse brush: centered hits touch only the struck macro block, while seam/corner hits can promote only the overlapped neighboring macro blocks into their own partial bite lattices for continuous-looking terrain damage without activating tiny voxels globally. That fan-out shares one impact damage budget across touched macro blocks by overlap, then keeps affected sub-voxels face-adjacent in world space so seams do not produce disconnected bite islands. Chipped cells stay full-cube for player collision and raycast until they break, but projectile and hitscan cores collide against the remaining bite-lattice material so shots can pass through visual tunnels while still hitting any visible partial piece in front; visible fill tracks remaining HP, so a 7/10 HP block keeps about 70% of its presentation lattice. Bite cells persist once removed and grow through face-adjacent neighbors, so later hits cannot visually refill older damage or open isolated gaps. Final fractures release only the block material still left inside, clear the bite mesh, and leave air instead of stamping a wrinkled surface puddle. Impact trajectory and core radius rank bite cells, so tiny cores drill narrow lattice columns while larger cores chew a broader connected face footprint before reaching deeper cells; small fast cores can continue through a complete tunnel with reduced speed when the exit cell is empty, and Hitscan Core repeats that continuation instantly across its trace. This first pass does not persist carved shapes to saves yet. Destructible rubble piles still take the full 30 core damage when present, but normal loose block debris is now VFX: nearby fragments tumble, collide through cheap cuboid envelopes, stack, sleep, collide with surviving partial-block lattice boxes instead of old invisible full-cube shells, keep temporary collider budget focused on real terrain/support surfaces, correct shallow ground penetration before stuck cleanup, remain shoveable inside the player-centered debris bubble, poof when trapped in partial-block/tunnel clutter, and otherwise poof or get culled by lifetime, distance, or budget pressure instead of converting into persistent rubble cover
- `N` toggle the Nova Pilot companion; `B` asks Nova to throw a physics core from her own position
- `Enter` or `F9` opens Nova Terminal, a local companion terminal that accepts normal chat plus commands like `/spawn target`, `/superflat`, or bare known commands such as `help`
- `X` despawn active physics cores while keeping loose debris and any existing rubble cover experiments
- `F3` toggle debug overlay, grouped into Perf, Player, World, Physics, Debris, and Render panels with smoothed FPS, raw/peak frame time, player speed plus signed X/Y/Z velocity, CPU timing buckets, active/sleeping physics broadphase counts, rigid debris body/collider counts, adaptive debris pressure, instanced debris render counts, partial-block damage lattice/subvoxel counts, partial-mesh triangle pressure, active debris bubble metrics, settling-region metrics, baked rubble chunk counts, and rubble cover stats for hitch hunting. 45ms+ frame spikes write a compact `[Voxel Hitch]` diagnosis, and sustained frame cadence below 60 FPS adds at most one low-FPS sample per second with the same counter snapshot, including the effective debris pressure cap when it is active. Recent records stay available at `globalThis.__VOXEL_HITCHES__()` and append pass-versioned JSONL records under `logs/` while `npm.cmd run debug:logs` is listening on `127.0.0.1:5174`. On the deployed Vercel build, the same records are batched to private Blob JSONL files through `/api/hitch-log` with app-version and deployment metadata. Use `globalThis.__VOXEL_HITCH_START_PASS__("label")` before a focused repro to split fresh logs from stale ones.
- `npm.cmd run dev -- --port 5173` appends a `logs/server-starts-YYYY-MM-DD.jsonl` marker with branch, commit, dirty state, package version, port, and runtime metadata before Vite starts, so performance logs can be tied to the exact code pass that produced them.
- `F4` cycle built-in quality: Potato, Low, Normal, High, Ultra
- `F6` toggles the Core Aim Preview. Physics Core draws a dotted throw arc, while Hitscan Core draws a straight dotted beam; both show the predicted impact ring and 3x3x3 bite-lattice cells the next terrain impact would affect. Camera-facing sub-cells draw bright white, while hidden/far-side cells still draw as a much softer red ghost so the full damage footprint remains visible without lying about what is exposed
- `F8` toggles the scripted test avatar, currently a small core-break integration run that stages a target voxel and fires the real player Physics Core path
- Browser automation can use `globalThis.__VOXEL_CODEX_PILOT__` as a high-level play bridge for real in-world inputs: `superflat()`, `scenario("wall-range")`, `move(...)`, `lookAt(...)`, `fire(...)`, `play("preview-parity")`, `play("debris-pressure")`, `play("wall-range")`, `play("debris-grounding")`, `play("hitscan-tunnel")`, `snapshot()`, and `startPass("label")`
- Local browser test runs can use `globalThis.__VOXEL_VISUAL_TEST__.listScenarios()` and `globalThis.__VOXEL_VISUAL_TEST__.recordScenario("debris-grounding")` while `npm.cmd run debug:logs` is listening; the browser records the game canvas as WebM, samples review frames, and posts the run to `logs/visual-runs/YYYY-MM-DD/...` with `recording.webm`, extracted video frames when local `ffmpeg` is available, `manifest.json`, and `review.html`. Current scripted shots include `preview-parity`, `debris-pressure`, `debris-grounding`, `hitscan-tunnel`, `builder-fixture`, `wall-range`, and `free-roam`; `recordPilotPlay("wall-range")` remains as a compatibility shortcut.
- Nova Terminal commands include `superflat`, `spawn target [block]`, `spawn wall [block] [width] [height]`, `spawn pillar [block] [height]`, and `spawn platform [block] [size]`
- Pause menu `Builder` opens an admin build panel with a block palette, odd-sized place/erase brush, and quick target/wall/platform/pillar fixture spawns using the selected block
- Pause menu `Settings` splits tuning into `Graphics`, `Gameplay`, and `Experimental` tabs: graphics owns quality, render distance, and shadows; gameplay owns projectile core size/velocity, the Core Aim Preview toggle, health bars, and cleanup; experimental owns the controls most likely to create CPU/GPU stress. Quality slider edits switch the dropdown to `Custom` so built-in presets stay clean
- Experimental `Physics Object Budget` stepper and slider change the current quality preset's physics-body budget
- Experimental `Max Ground Debris` caps grounded shard clutter after the explosion; airborne bursts still spawn normally, then excess ground debris is culled instead of being baked into instant rubble lumps
- Experimental `Ground Debris Lifetime` controls how long grounded shards remain before they pop a small material-tinted dust poof and disappear; `Forever` keeps them visible until distance, pressure, or manual cleanup removes them
- Gameplay `Health Bars` toggles block/rubble damage bars and clears any visible bars when turned off
- Gameplay `Despawn All Objects` performs the drastic full cleanup: physics cores, loose debris VFX, and any existing rubble cover
- Experimental `Max Break Debris` controls the per-block visible shard ceiling, and `Allow Super Ultra Mode` appears at `Ultra` to unlock the 12x stress-test preset
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 54 max debris shards/block, 8m active debris bubble
- `Low`: current low-end baseline, no shadows, 128 physics bodies, 72 max debris shards/block, 12m active debris bubble
- `Normal`: 2x render distance, shadows, 192 physics bodies, 108 max debris shards/block, 20m active debris bubble
- `High`: 4x render distance, sharper local shadows, 512 physics bodies, 144 max debris shards/block, 32m active debris bubble
- `Ultra`: 6x render distance, sharper local shadows, 1024 physics bodies, 180 max debris shards/block, 48m active debris bubble
- `Super Ultra`: 12x render distance, highest local shadow resolution, 4096 physics bodies, 216 max debris shards/block, 72m active debris bubble, maximum stress-test mode; opt in from the pause menu once `Ultra` is selected
- `Custom`: created automatically when settings sliders are changed, using the selected built-in preset as its baseline

Visible debris counts are a rendering/performance compromise, but they now respect the shard mass cap before honoring low-count preferences. Physics Core carving still treats a full block as `1.0` normalized block-volume for chip/final-fracture presentation, and remaining material is derived from remaining HP, so a block at 7/10 HP keeps about 70% of its visible fill. The damaged-block mesh uses the same 27-cell fracture lattice only as presentation resolution, hiding roughly the damage fraction while gameplay material remains normalized. Loose debris is now temporary VFX: nearby fractures share a settling region, visible low-poly shards burst apart as smaller Rapier cuboids, collide against each other, terrain, temporary support colliders, and explicit collision boxes generated from surviving partial-block lattice cells, then park as sleeping rigid bodies while they remain inside the player debris bubble. Temporary terrain support colliders are surface-only, use a tighter lookahead bubble, and stay under a hard cell cap so high debris settings do not flood Rapier with buried terrain boxes; damaged blocks no longer donate a ghost full-cube collider once their 3x3x3 presentation lattice has been carved, and adjacent surviving sub-voxels merge into larger exact support cuboids before Rapier sees them. Each visible shard carries at most 70% of one 3x3x3 damage-lattice subvoxel's material and no visual axis can exceed 60% of a subvoxel edge, so low-mass slabs and splinters stay chip-sized instead of becoming big legal-but-ugly plates. The `Max Break Debris` slider is a ceiling for full-block debris density and now also scales ordinary chip bursts; it is not a promise that every tiny hit spawns the full value. Shards are aggressively varied, but their conservative visual volume is capped by that per-shard material slice and by the total material removed by the hit; debris ejection also prefers exposed bite openings or drilled tunnel exits so chips spray out of wounds instead of filling them. Sleeping debris can wake again when hit by a core or active shard, but it no longer becomes destructible rubble cover just because it settled. The ground-debris sliders govern that aftermath: full bursts can exceed the cap while airborne, then excess sleeping regions are culled and timed-out shards stay stable until disappearing in a material-tinted poof after first ground contact unless the lifetime is set to `Forever`; stale never-grounded floaters and trapped tunnel/partial-block clutter fall back into forced poof cleanup after a short grace window. If the player leaves the bubble or the physics budget needs relief, debris is expired as visual clutter instead of baked into persistent material; extreme airborne bursts can now drop the farthest active shards once they exceed the rigid-body cap instead of waiting for ground contact. When sustained sub-60 FPS lines up with heavy live debris pressure, an adaptive governor temporarily lowers the effective rigid-debris cap below the user's normal healthy-frame ceiling and poofs the farthest/least valuable shards until frames recover. `RubbleField` and the old material-preserving bake-out helpers remain parked for experiments and tests, including future larger-scale rubble mechanics, but the active gameplay direction is partial-block terrain damage plus debris VFX rather than automatic settled rubble piles.

Long-running idle sessions are guarded too: once chunk, mesh, save, debris, and physics work has drained, the app stops the animation loop after five minutes without input, and hidden/locked sessions use a low-frequency heartbeat instead of continuous WebGL frames.

## Engine Pieces

- `src/main.ts`: app bootstrap, render loop, input glue, world lifecycle orchestration, and WebGL runtime teardown
- `src/adminCommands.ts`: admin command parsing/routing, Superflat Lab shortcut, and spawnable terrain test fixtures used by Nova Terminal
- `src/builderTools.ts`: centered odd-size builder brush utilities shared by the in-game Builder panel and block lane
- `src/builderPreview.ts`: translucent block-color placement ghost for the active build brush
- `src/testAvatar.ts`: F8 scripted runtime avatar for repeatable in-browser gameplay smoke checks
- `src/codexPilot.ts`: high-level browser play bridge for automation-assisted roaming, aiming, movement, weapon fire, scenario setup, and focused hitch-log passes through real player/hotbar systems
- `src/visualTestScenarios.ts`: named visual review catalog that maps repeatable shots like debris grounding and hitscan tunnel drilling to pilot scripts and recorder defaults
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
- `src/partialBlocks.ts`: in-memory partial-block terrain carving, core-footprint-ranked hidden 3x3x3 bite-lattice damage visuals, stitched wrinkled partial-height surface mesh/support generation, merged explicit surviving-lattice collision boxes, and core-hit carve constants
- `src/impactCraterField.ts`: parked capped faceted crater/scar prototype retained for later visual experiments
- `src/blockColors.ts`: deterministic per-block tint buckets for subtle voxel color variation
- `src/blockFragments.ts`: 3x3x3 block fracture pattern, visible debris sampling, proportional terrain chip counts, normalized block-volume rubble material, and debris sizing constants
- `src/blocks.ts`: block IDs, colors, 10-HP ordinary terrain definitions, generated `Rubble`, and placeable palette
- `src/debrisShapes.ts`: shared low-poly shard geometry catalog, material-aware shape assignment helpers, aggressive non-uniform shard sizing, and volume-budget fitting
- `src/debrisCleanup.ts`: stuck/trapped loose-debris cleanup heuristics so tunnel clutter poofs without reviving rubble conversion
- `src/debrisSettler.ts`: player-bubble-owned debris regions, VFX cleanup/far-pressure expiration, optional parked rubble finalization for tests/experiments, and legacy glue/contact helpers for non-Rapier test/fallback fragments
- `src/debrisPoof.ts`: short-lived material-tinted dust poofs for partial-block bite feedback and visual debris cleanup
- `src/fragmentRubble.ts`: parked orphan debris-to-rubble eligibility rules retained for isolated rubble/cover tests and future experiments; the normal runtime no longer calls this for loose debris cleanup
- `src/items.ts`: reusable item registry, stack metadata, categories, tags, and primary/secondary action descriptors
- `src/hotbar.ts`: separate tool/block selection lanes, selection wrapping, number-key mapping, and action resolution helpers
- `src/physics.ts`: simple swept sphere-vs-voxel physics cores, fragment render/material/shape state, rigid-debris sync hooks, sleep-aware core/debris broadphase collision, and velocity/radius impact reporting for terrain carving and piercing
- `src/coreAimPreview.ts`: toggleable Physics Core trajectory preview, first terrain-hit prediction, landing ring rendering, and predicted bite-lattice cell outlines
- `src/hitscanCore.ts`: instant core ray traversal that reuses the partial-block bite lattice, open-tunnel projectile query, and fixed smallest/fastest core envelope
- `src/hitscanDebris.ts`: non-blocking Hitscan Core debris-beam capsule checks for clearing loose VFX shards along drilled lines
- `src/hitscanBoltTracer.ts`: short-lived additive beam visuals for Hitscan Core, using the generated `src/assets/hitscan-energy-bolt.png` texture as a cylinder-like wrapper instead of a moving projectile sprite
- `src/physicsInstancing.ts`: instanced rendering batches for debris fragments keyed by source block and shard shape, including per-fragment tumble rotation and non-uniform scale
- `src/rigidDebris.ts`: Rapier WASM initialization, dynamic cuboid debris bodies with per-fragment envelopes, candidate-filtered temporary terrain/rubble/partial-lattice support colliders, stale partial-support wakeups, shallow support-penetration correction, transform sync back into fragment render proxies, sleeping stats, and cleanup
- `src/rubble.ts`: parked persistent destructible rubble cover patches, sample-sized hidden support footprints, parked draped-sheet rendering, batched absorption, scaled durability separate from material volume, baked static shard-pile visuals, local direct-hit damage with small neighbor chip damage, damage-event reporting, multi-cell merge rules, walkable support queries, fall behavior, and promotion into generated `Rubble` terrain blocks
- `src/physicsBudget.ts`: per-quality persisted physics body budget bounds and step helpers
- `src/physicsCoreSettings.ts`: persisted physics-core size/velocity tuning bounds and menu label formatting
- `src/debrisLifetime.ts`: grounded debris lifetime slider bounds, persistence, forever mode, and label formatting
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
- `src/debugHud.ts`: grouped debug overlay stats formatting, player speed/velocity components, CPU timing buckets, and update throttling
- `src/frameLoop.ts`: frame delta clamping, hidden/overnight resume guards, and idle animation-loop hibernation
- `src/frameTimings.ts`: smoothed per-frame subsystem timing helpers for the debug overlay
- `src/performanceHitchLog.ts`: bounded frame-spike black-box log, dominant-subsystem diagnosis, local debug-log POSTs, and console/Nova Terminal summaries
- `src/visualTestRecorder.ts`: local-only canvas/WebM visual recorder for automated visual scenarios, including frame samples, metadata, and upload to the `5174` debug server
- `src/remoteHitchLog.ts`: shared production hitch-log payload normalization, origin checks, app-version metadata, JSONL formatting, and Blob path grouping
- `api/hitch-log.ts`: Vercel serverless receiver that writes deployed hitch batches into the private `voxel-engine-logs` Blob store
- `scripts/dev-server.mjs`: dev-only Vite launcher that writes server-start/stop JSONL markers with repo metadata before handing off to Vite
- `scripts/hitch-log-server.mjs`: tiny local `127.0.0.1:5174` receiver that appends hitch JSONL records into `logs/` and visual test recordings into `logs/visual-runs/` without restarting the main `5173` Vite world
- `src/worldMenu.ts`: saved-world list rendering and readable seed generation

## Development Checks

- `npm.cmd run typecheck`: strict TypeScript no-emit validation
- `npm.cmd run test`: strict typecheck plus bundled Node engine robustness tests
- `npm.cmd run build`: production build smoke test
- `git diff --check`: whitespace sanity check before commits

## Sensible Next Steps

- Add material-specific fracture behavior so stone, dirt, sand, grass, ember, and generated rubble fail differently.
