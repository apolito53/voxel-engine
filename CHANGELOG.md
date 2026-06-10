# Changelog

## Unreleased

## 0.10.4 - 2026-06-09

### Fixed

- Changed the rigid-debris cadence governor to skip fixed `1/60s` Rapier steps
  instead of stretching each step to the lower target Hz, preventing pressured
  debris from fast-forwarding through breakup motion.

## 0.10.3 - 2026-06-09

### Fixed

- Smoothed the visible transforms between lower-frequency rigid-debris solver
  ticks so pressured debris no longer lunges through large Rapier steps in a
  comically fast burst.
- Kept terrain/support penetration corrections immediate, so smoothing cannot
  leave shallowly embedded shards visually stuck in terrain.

## 0.10.2 - 2026-06-09

### Added

- Added F3 HUD and hitch-log telemetry for rigid-debris solver Hz, skipped
  render frames, Rapier step time, and static support-collider refresh cost.

### Changed

- Added an adaptive rigid-debris solver cadence: active Rapier debris now steps
  at 30Hz normally, 20Hz under debris pressure, and 15Hz under severe pressure
  instead of trying to solve every rendered frame.
- Stopped rigid debris from running catch-up substeps after long frames, keeping
  controls, projectile cores, terrain damage, rendering, and other gameplay
  systems on their normal frame loop while debris degrades separately.

## 0.10.1 - 2026-06-08

### Added

- Moved partial-terrain region mesh generation onto the shared browser-native
  `WorkerPool`, with real Web Worker dispatch, transferable geometry buffers,
  cancellation, revision-stale rejection, and sync fallback for tests or worker
  failures.

### Changed

- Split partial-block mesh math from the Three.js mesh owner so worker-safe
  geometry building lives in pure data helpers while main-thread code only owns
  renderer resource upload and disposal.
- Added per-region partial-mesh revisions and precomputed face-visibility masks
  so asynchronous worker results cannot resurrect stale carved geometry or call
  back into live world state from a worker.

## 0.10.0 - 2026-06-07

### Added

- Added a browser-native `WorkerPool` foundation with clamped default capacity,
  job ids, cancellation, revision-stale result rejection, transferable-buffer
  bookkeeping, sync fallback execution, and F3/hitch-log telemetry for queued
  and running jobs.
- Added fog-hidden chunk render stats for the F3 HUD and hitch records,
  separating loaded chunks from frustum chunks, actually rendered chunks, and
  chunks hidden behind the opaque fog curtain.

### Changed

- Added render-horizon culling so hidden-horizon chunks stay streamed but stop
  drawing once they are safely behind fully opaque fog plus one safety ring.
  This preserves the fog curtain while reducing far-horizon draw calls and
  triangles.
- Reordered hitch summaries so render-led frames lead with current renderer
  counters, while low-FPS samples still surface current-frame RAF gaps or
  overlapping browser long tasks prominently.

## 0.9.10.1 - 2026-06-07

### Added

- Added browser-frame diagnostics to hitch records, including RAF gap time,
  unaccounted JavaScript frame time, renderer draw/geometry counters, recent
  browser long tasks when supported, and Chrome heap snapshots when available.
  This makes vague low-FPS/render-led logs distinguish engine work from likely
  browser, GPU-present, or GC stalls.

## 0.9.10 - 2026-06-07

### Fixed

- Restored block atlas texture sampling on damaged partial terrain, so carved
  grass, sand, stone, and other materials keep their surface texture instead of
  falling back to flat tinted geometry.

## 0.9.9 - 2026-06-07

### Changed

- Moved the actual streamed chunk edge behind the fully opaque part of the fog
  curtain, so distant terrain no longer fades into a visible square blue wall at
  the load boundary.
- Lightened the world fog color to better match the generated skybox horizon.
- Updated the F3 render debug line to show fog start, fog opacity, and the
  hidden streamed horizon separately.

## 0.9.8 - 2026-06-06

### Changed

- Reworked the render-distance setting into a fog-start distance: terrain now
  streams a small extra horizon behind the selected clear chunk radius, then
  fades into an opaque fog curtain instead of ending at a hard chunk cutoff.
- Updated the debug HUD and graphics settings copy to show the clear-distance
  radius separately from the fogged streamed horizon.

## 0.9.7 - 2026-06-06

### Changed

- Physics Cores now have a 20 second hard lifetime and start a short fade-out
  despawn countdown after staying below useful terrain-damage speed, keeping
  spent projectile cores from piling up in crater stress tests.

## 0.9.6 - 2026-06-06

### Added

- Added `T` as a gameplay toggle between semi-auto and full-auto click actions
  for the active held item or block lane.
- Added compact `SEMI`/`FULL` mode text to the bottom hotbar so the current
  click cadence is visible without reopening menus.

### Changed

- Held left/right click actions now repeat only in full-auto mode at a bounded
  cadence. Semi-auto remains the default one-action-per-press behavior.

## 0.9.5.1 - 2026-06-01

### Added

- Added persistent local combat logging for Terraformer, Physics Core, Hitscan
  Core, Builder, and rubble damage events. Local Vite dev sessions now accept
  `POST /__voxel_combat_log` and append per-entry JSONL under `logs/combat/`.
- Extended the `npm.cmd run debug:logs` receiver on `127.0.0.1:5174` with the
  same combat-log endpoint so preview/automation sessions can still write
  damage receipts.
- Added a Combat-panel disk status line to F3 so repro sessions show queued,
  written, and failed persistent combat-log batches.

### Changed

- Combat logs now flush queued disk writes when switching worlds or tearing down
  the runtime, preserving recent damage evidence before the in-memory ring
  buffer is cleared.

## 0.9.5 - 2026-05-31

### Added

- Added an F3 combat log that records recent Terraformer, Physics Core,
  Hitscan Core, Builder, and rubble damage events with source tool/core,
  terrain block coordinates, affected `3x3x3` sub-cell indexes, damage amount,
  remaining HP, and destruction state.
- Exposed the in-browser `__VOXEL_COMBAT_LOG__` debug helper so bad damage
  cases can be inspected from the console without relying only on screenshots.

### Changed

- Terrain carve results now carry explicit applied-damage and affected-sub-cell
  metadata for debugging and future combat/entity damage plumbing.

## 0.9.4 - 2026-05-31

### Fixed

- Fixed Terraformer exact-cut rendering so exposed sub-cell walls stay clean
  and cuboid instead of using the impact-damage wrinkle mesh that made adjacent
  sub-cells look damaged.

## 0.9.3 - 2026-05-31

### Fixed

- Fixed Terraformer sub-cell edits so precision cuts carry their exact targeted
  lattice cells and bypass the normal neighbor-spreading bite reconstruction.
  A size-1 Terraformer edit now reconstructs as exactly one sub-cell instead
  of being eligible for adjacent-cell damage sharing.

## 0.9.2 - 2026-05-31

### Fixed

- Fixed Terraformer targeting on partially destroyed blocks. The Terraformer
  now raycasts against the remaining `3x3x3` bite-lattice cells, so repeated
  edits retarget newly exposed inner sub-cells instead of getting stuck on the
  old full-cube shell.

## 0.9.1 - 2026-05-31

### Fixed

- Changed Terraformer brushes to grow inward from the targeted face along the
  face normal, so larger brush sizes carve real depth instead of wasting part
  of the selection outside the block.

## 0.9.0 - 2026-05-31

Minor milestone: the old Mining Tool is now the Terraformer, a deterministic
terrain editor that removes exact sub-block cells instead of pretending to be a
weapon with vague chip damage.

### Added

- Added a Terraformer size setting in `Settings > Gameplay`, plus in-world
  `ArrowUp`/`ArrowDown` controls while the Terraformer is selected.
- Added thin sub-cell outlines so the Terraformer previews the exact `3x3x3`
  lattice cells it will remove before editing terrain.

### Changed

- Renamed the player-facing `Mining Tool` to `Terraformer` across the hotbar,
  Loadout menu, HUD hints, docs, and tests.
- Scaled durable terrain HP from compact material values to a shared
  `3x3x3` sub-cell pool: full block HP is old material HP times `270`, and one
  Terraformer sub-cell is old material HP times `10`.
- Kept Physics Core and Hitscan Core on the existing carve/brush path while
  scaling their terrain damage to preserve the practical old hits-to-break
  behavior against the larger HP pool.

## 0.8.10 - 2026-05-31

### Fixed

- Moved Nova chatter pop-ups above the bottom hotbar so messages no longer
  cover item/tool selection.

## 0.8.9 - 2026-05-30

### Changed

- Replaced the top-left selected-item title with a bottom-center hotbar that
  shows the active Items or Blocks lane and selected slot.
- Hid debug and quick-control overlays by default; `F3` still opens debug, and
  Settings > Gameplay can persistently show the controls stack.
- Added a pause-menu Loadout panel with separate Tools and Blocks tabs, leaving
  the Builder panel focused on admin brush and fixture actions.

## 0.8.8 - 2026-05-30

### Changed

- Reduced quick-control HUD hints from boxed chips to a compact left-aligned
  text stack, keeping the controls readable without turning the left side of
  the screen into a second menu.

## 0.8.7 - 2026-05-30

### Fixed

- Fixed block placement mode leaving block primary clicks inert: selected blocks
  now left-click erase the targeted brush and right-click place, matching the
  HUD/control hints.
- Fixed pause-menu block-lane and palette selection feeling like movement died
  by resuming gameplay when those controls are used to enter placement mode.
- Moved the quick-control HUD hints into a left-aligned vertical stack and
  updated the block hint to show left-click erase plus right-click place.

## 0.8.6 - 2026-05-30

### Changed

- Darkened the procedural grass top and side texture base colors so terrain
  reads less washed out while keeping the new per-block texture variation.

## 0.8.5 - 2026-05-29

### Added

- Added a procedural block texture atlas for normal terrain chunks, giving
  grass, dirt, stone, sand, ember, rubble, wood, and leaves distinct readable
  surface patterns while preserving deterministic per-block tint variation.
- Added deterministic atlas variants per material face, so repeated terrain
  surfaces no longer stamp the exact same pixel pattern across every block.

### Changed

- Chunk worker and fallback meshes now emit tiled UVs and per-face texture tile
  ids, so greedy-meshed faces repeat texture detail per block instead of
  stretching one flat color across the whole run.
- Increased deterministic tint variance slightly for terrain materials,
  including Wood and Leaves, to make repeated blocks easier to distinguish.

## 0.8.4 - 2026-05-29

### Changed

- Split partial-block terrain visuals into spatial region meshes, so repeated
  terrain bites rebuild only nearby damaged regions instead of the old global
  partial mesh.
- Cached sparse partial-block chunk masks by chunk and separated visual dirty
  regions from normal chunk-mask invalidation, so repeated damage to an
  already-chipped block no longer forces normal chunk remeshing.
- Expanded partial-terrain HUD and hitch-log stats with dirty/rebuilt region
  counts and max-region triangle pressure.

## 0.8.3.2 - 2026-05-29

### Fixed

- Re-ran rigid-debris budget pruning after the adaptive pressure governor lowers
  the effective body cap, so stressed frames do not keep reporting more Rapier
  debris bodies than the current cap allows.

## 0.8.3.1 - 2026-05-29

### Fixed

- Replaced the debug HUD's overly flattering smoothed instant-FPS counter with
  a rolling elapsed-time frame-rate meter plus low-FPS readout, so uneven frame
  pacing is visible instead of being averaged into nonsense.

## 0.8.3 - 2026-05-29

### Fixed

- Coalesced dense partial-block mesh rebuilds so crater spam does not rebuild
  hundreds of faceted damaged cells on every impact frame.
- Coalesced dirty rigid-debris static-collider refreshes so rapid terrain
  carving no longer rebuilds Rapier support colliders every frame.

## 0.8.2 - 2026-05-28

### Changed

- Changed surviving Physics Core terrain bounces to bleed projectile velocity
  after damaging terrain, so high bounce counts dig repeatedly without
  preserving full launch speed forever.

### Fixed

- Fixed the adaptive rigid-debris pressure governor being pinned at a 32-body
  floor, which made crater spam stay CPU-bound even after hitch logs reported
  maximum debris pressure.

## 0.8.1 - 2026-05-27

### Added

- Added a Gameplay settings slider for Physics Core terrain bounces, letting
  projectile cores damage terrain across multiple rebounds before self-destructing.

## 0.8.0 - 2026-05-27

Minor milestone: this introduces the first reusable tool/mining/material identity layer, so the version now reflects a real engine capability step instead of another tiny patch.

### Added

- Added `Mining Tool` to the Items lane for held left-click terrain mining with
  material-specific HP, mining cadence, and chip debris flavor.

### Changed

- Changed placeable block items to build-only behavior: left click no longer
  mines or erases terrain, while right click still places the selected block.
- Changed terrain material identity so Leaves, Sand, Grass, Dirt, Ember, Wood,
  Stone, and Rubble each own distinct HP and debris ejection feel.

## 0.7.0 - 2026-05-25

Minor milestone: deterministic voxel trees make generated terrain materially richer instead of just tuning an existing system.

### Added

- Added first-pass deterministic voxel trees to varied-profile generated worlds:
  grassy gentle terrain can now spawn Wood trunks and Leaves canopies, while
  `classic` saved worlds and `superflat` labs stay clear.
- Added Wood and Leaves as destructible/placeable block types.
- Added regression coverage proving tree placement is deterministic and does not
  backfill old terrain profiles.

## 0.6.27 - 2026-05-25

### Changed

- Saved worlds now carry terrain-profile provenance so older edited worlds keep
  streaming legacy `classic` chunks instead of mixing old saved chunk snapshots
  with newly generated varied-profile neighbors.
- Chunk-worker generation now receives the saved world's terrain profile, keeping
  async streamed chunks aligned with the main-thread terrain context.
- Tuned the varied terrain profile so sandy washes stay present without turning
  common generated worlds into broad desert blankets, and softened terracing so
  high ground reads less like a contour map.

## 0.6.26 - 2026-05-25

### Added

- Reworked non-special seeded terrain generation with a varied landform profile
  that creates broader plains, raised ridges, sandy washes, terraced high
  ground, and rocky highland surfaces while keeping `superflat` unchanged.
- Preserved the empty seed path, shown as `classic` in the save list, so old
  default worlds can still stream the original rolling terrain shape in
  unedited chunks.
- Added `npm.cmd run docs:check` and wired it into `npm.cmd run test` so
  broken local README/docs Markdown links fail during normal validation.
- Tightened the docs-link checker so same-file and cross-file Markdown heading
  anchors are validated instead of skipped.
- Added `npm.cmd run validate` as a one-command local validation pass for tests,
  production build, and whitespace diff checks.
- Added `npm.cmd run source:check` and wired it into `npm.cmd run test` so
  `src` stays free of `@ts-nocheck`, `@ts-ignore`, and explicit `any`.
- Added GitHub Actions CI to run `npm run validate` on pushes and pull requests
  to `main`.
- Added manual dispatch and stale-run cancellation to the CI validation
  workflow.

## 0.6.25 - 2026-05-24

### Added

- Added Gameplay settings for Core Color and Core Trail so projectile cores and hitscan beams can share a player-tuned hue, with thrown Physics Cores leaving a short optional trail.
- Added `globalThis.__VOXEL_VISUAL_TEST__.scenarioSnapshot(id)` and embedded before/after scenario snapshots in visual recording manifests, giving automated visual runs compact runtime pressure and hitch receipts alongside the video artifacts.
- Added a `debris-pressure` Codex Pilot and visual-test scenario that runs bounded multi-angle projectile-core bursts against a fresh Superflat wall to capture rigid debris pressure, sleep behavior, and hitch attribution in a repeatable review pass.
- Added a `preview-parity` Codex Pilot and visual-test scenario that enables Core Aim Preview, exercises both Physics Core and Hitscan Core against a fresh Superflat wall, and records the run through the existing visual-test catalog.

## 0.6.24 - 2026-05-17

### Added

- Extended Core Aim Preview to Hitscan Core with a straight dotted beam, predicted impact ring, and non-mutating bite-cell preview for the next terrain impact.

## 0.6.23.1 - 2026-05-17

### Changed

- Moved the risky performance/destruction tuning controls into a new Experimental settings tab with a warning that they can tank framerate if abused.
- Updated the release-notes parser so four-part settings-only versions sort correctly in the in-game version modal.

## 0.6.23 - 2026-05-17

### Fixed

- Merged adjacent surviving partial-block lattice cells into larger exact debris support cuboids so damaged surfaces still collide correctly without flooding Rapier with one temporary collider per sub-voxel.

## 0.6.22 - 2026-05-17

### Fixed

- Kept temporary rigid-debris terrain colliders focused on actual surface/support cells so airborne shard storms cannot exhaust the collider budget before near-ground debris gets a floor.
- Added a shallow support-penetration correction for rigid debris so a slightly sunken shard is lifted back onto terrain before trapped-debris cleanup can poof it.
- Added partial-block lattice collision boxes for rigid debris so shards collide with surviving 3x3x3 sub-voxels instead of floating on damaged blocks' old invisible full-cube shell.

## 0.6.21 - 2026-05-17

### Changed

- Removed the countdown flashing from timed debris cleanup; grounded shards now stay visually stable until their material-tinted poof removes them.

## 0.6.20.2 - 2026-05-17

### Added

- Added a named visual-test scenario catalog at `globalThis.__VOXEL_VISUAL_TEST__.listScenarios()` with scripted runs for debris grounding, hitscan tunnel drilling, builder/admin fixture staging, the baseline wall range, and free-roam smoke checks.
- Added `globalThis.__VOXEL_VISUAL_TEST__.recordScenario(id, options)` so visual recordings can reuse scenario-specific default timing, labels, and metadata instead of one-off console snippets.

## 0.6.20.1 - 2026-05-17

### Added

- Added a local visual test recorder API at `globalThis.__VOXEL_VISUAL_TEST__` so automated pilot runs can capture WebM canvas recordings, sampled frames, metadata, and matching hitch-log pass context.
- Added a `POST /__voxel_visual_test` endpoint to the local `5174` debug server that writes visual run folders under `logs/visual-runs/` with `recording.webm`, frame samples, optional `ffmpeg`-extracted video frames, `manifest.json`, and `review.html`.

## 0.6.20 - 2026-05-17

### Changed

- Moved the player speed readout out of the main HUD and into the F3 debug panel.
- Added signed player velocity components to the F3 debug panel so movement tuning can see X/Y/Z motion separately.

## 0.6.19 - 2026-05-17

### Added

- Added a translucent block-color Builder brush preview that shows the right-click placement volume while the Blocks lane is active.

### Changed

- Redesigned the in-world HUD so status stays in a compact top-left card and controls move into bottom-left hint chips.
- Redesigned the F3 debug panel into grouped Perf/World/Physics/Debris/Render sections instead of a raw line dump.

## 0.6.18 - 2026-05-17

### Added

- Added a pause-menu Builder panel with a block palette, odd-sized place/erase brushes, and quick target/wall/platform/pillar fixture spawns.
- Added an Items/Blocks selection split so the mouse wheel cycles gameplay tools separately from buildable terrain blocks; `G` toggles between those lanes during play.

## 0.6.17 - 2026-05-17

### Added

- Added an adaptive debris pressure governor that temporarily lowers the effective rigid-debris cap when sub-60 FPS samples coincide with heavy live debris pressure, then recovers toward the user's configured cap once frames stabilize.
- Added F3 HUD and hitch-log pressure details showing when the adaptive debris cap is active and what nominal cap it is protecting.

## 0.6.16 - 2026-05-17

### Changed

- Reduced rigid-debris CPU pressure by shrinking temporary support-collider scan bubbles, keeping terrain support colliders surface-only, and hard-capping temporary terrain collider cells.
- Changed rigid-debris budget relief so extreme airborne debris bursts can poof farthest active shards after exceeding the body cap instead of waiting until every shard is grounded.

## 0.6.15.2 - 2026-05-17

### Added

- Added once-per-second low-FPS diagnostics while observed frame cadence stays below 60 FPS, sharing the same counter snapshot as hard frame hitch logs.

## 0.6.15.1 - 2026-05-17

### Added

- Added partial-block debug counters for active damage lattices, remaining/cut 3x3x3 subvoxels, and partial-mesh triangle pressure in the F3 HUD and hitch logs.

## 0.6.15 - 2026-05-17

### Changed

- Reduced debris shard visual size by capping every shard axis to 60% of a damage-lattice subvoxel edge, so legal low-mass slabs and splinters no longer appear as oversized plates.
- Changed ordinary chip hits to scale with the `Max Break Debris` slider instead of staying hidden behind the old four-piece soft cap.
- Raised visible-debris presets from `54` max shards/block on Potato through `216` on Super Ultra, while keeping the total ejected material volume bounded by the removed material.
- Clarified the settings label from `Break Debris` to `Max Break Debris` because the slider controls the full-block/quality ceiling, not a guaranteed count on every tiny hit.

## 0.6.14 - 2026-05-17

### Changed

- Changed debris burst sizing so the 27-cell damage lattice remains the source map, but visible debris can oversample it up to 81 VFX shards for smaller, denser chips.
- Capped each spawned shard to at most 70% of one damage-lattice subvoxel's material volume while preserving the total ejected material budget for each hit.
- Raised the built-in debris-count presets from `39` shards on Potato through `81` shards on Super Ultra, with ordinary chip hits splitting into enough pieces to avoid oversized debris.

## 0.6.13 - 2026-05-17

### Added

- Added opening-biased debris ejection hints so partial-block chips prefer exposed bite holes and tunnel exits instead of spawning as clutter inside the wound.
- Added Hitscan Core cleanup for loose debris in the beam path; visual shards poof without blocking the terrain drilling trace.

### Changed

- Changed loose debris cleanup so trapped or enclosed shards can poof even when ground-debris lifetime is set to `Forever`, while open-ground debris still follows the normal lifetime slider.
- Changed shard randomization to allow more dramatic low-poly shapes and non-uniform sizes while fitting every spawned shard inside the material volume removed by that damage event.

## 0.6.12 - 2026-05-17

### Fixed

- Fixed sparse brush bite selection so previewed and carved sub-voxel damage stays face-adjacent in world space instead of creating disjoint seam/corner islands.

## 0.6.11 - 2026-05-17

### Fixed

- Fixed sparse multi-block core damage so seam/corner brush fan-out distributes one shared impact damage budget instead of applying a full carve step to every touched macro block.

## 0.6.10 - 2026-05-17

### Changed

- Changed the Physics Core Aim Preview bite-cell overlay to split predicted sub-voxel damage into bright white camera-visible cells and softer red hidden/far-side cells.

## 0.6.9 - 2026-05-16

### Fixed

- Fixed the deployed Vercel hitch-log function by using a Node-resolvable ESM import for the shared remote log helpers.

## 0.6.8 - 2026-05-16

### Added

- Added a Vercel Blob-backed production hitch-log endpoint at `/api/hitch-log`, so deployed frame spikes can be captured as private JSONL blobs instead of only appearing in local `5174` logs.
- Added remote hitch-log metadata for app version, session/pass ids, source URL, browser user agent, Vercel environment, deployment URL, git commit, and branch.

## 0.6.7 - 2026-05-16

### Changed

- Changed loose block debris into pure VFX in the runtime loop: settled, far, expired, or over-budget shards now blink/poof or get culled instead of baking into persistent rubble cover.
- Kept the old rubble conversion helpers parked for tests/future experiments, while the durable terrain-damage truth now lives in block HP and the partial-block bite lattice.
- Added a TODO note for a future rigid sub-voxel pass where promoted damaged cells could become real rigid objects deliberately instead of piggybacking on debris bake-out.

## 0.6.6 - 2026-05-16

### Added

- Added a toggleable Physics Core aim preview: F6 or the Gameplay settings toggle draws a dotted projectile arc, impact ring, and the predicted 3x3x3 bite-lattice cells that the next thrown core would affect.

## 0.6.5 - 2026-05-16

### Added

- Added a sparse multi-block damage brush for core terrain impacts: hits near block seams can now promote only the overlapped macro blocks into partial 3x3x3 bite lattices, creating more continuous damage across terrain without activating tiny voxels globally.

## 0.6.4 - 2026-05-16

### Fixed

- Fixed thrown Physics Core sweeps against damaged partial blocks so visible remaining bite-lattice pieces are hit first, even when the core starts inside the old full-cube collision shell, instead of clipping through to the block behind.

## 0.6.3 - 2026-05-16

### Added

- Added material-tinted poofs when partial-block bite cells are destroyed, plus debris cleanup poofs so expired shards leave a short dust burst instead of simply vanishing.

### Changed

- Shortened the debris flashing window by half and made the blink cadence ramp up more sharply until expiration.

## 0.6.2 - 2026-05-16

### Changed

- Changed `Max Ground Debris` to govern grounded shards after impact instead of throttling the initial destruction burst.
- Changed grounded visual debris to blink faster near the end of its cleanup timer before disappearing.
- Changed stale never-grounded debris to fall back into the same cleanup path after a grace window so floaters do not live forever.

### Added

- Added a gameplay `Ground Debris Lifetime` slider with a `Forever` setting for keeping grounded shards around.

## 0.6.1 - 2026-05-16

### Changed

- Changed the in-world crosshair to a circular reticle with separated ticks and an open center for clearer aiming.
- Changed core ADS to apply a slight 15% camera zoom while right click is held on Physics Core or Hitscan Core.
- Changed loose debris shards to render and collide at roughly half their previous size so piles snag less aggressively.
- Changed sleeping rigid debris inside the active player bubble to remain wakeable physics instead of baking into destructible rubble immediately.
- Changed `Max Ground Debris` pressure relief to skip/cull excess visual debris instead of baking instant rubble lumps or freezing airborne shards.

### Added

- Added dev-server start/stop markers under `logs/server-starts-YYYY-MM-DD.jsonl`, including port, package version, branch, commit, dirty files, short diff stats, and runtime metadata.
- Added pass-versioned hitch logs plus browser hooks (`__VOXEL_HITCH_PASS__`, `__VOXEL_HITCH_START_PASS__`) so focused performance repros do not get mixed with stale logs.
- Added a `globalThis.__VOXEL_CODEX_PILOT__` play bridge for browser automation that can create Superflat labs, spawn scenarios, move/look/fire through real player systems, and start focused hitch-log passes.
- Added a gameplay `Max Ground Debris` slider that caps active rigid debris bodies.

### Fixed

- Fixed aggressively slept rigid debris losing the temporary support collider underneath it, which could wake/crash Rapier instead of staying parked.

## 0.6.0 - 2026-05-12

### Added

- Added main-branch testing tools: a `Superflat Lab` world shortcut, reserved `superflat` terrain seed, Nova Terminal admin command routing, and spawn commands for target walls, walls, pillars, and platforms.
- Added an F8 scripted test avatar that stages a target block and drives the real player Physics Core throw path for repeatable in-browser gameplay smoke checks.
- Added tests covering superflat generation, admin command parsing/fixture placement, and test-avatar aim planning.
- Folded chat and commands into Nova Terminal: Enter/F9 now opens one panel that accepts normal chat, slash commands, and bare known admin commands.
- Added a pause-menu `Health Bars` toggle that persists locally, suppresses block/rubble damage bars, and clears active bars immediately when disabled.
- Added a white cube-space target outline for destructible settled-rubble cells, including direct destroy-action hits against the targeted rubble proxy instead of terrain behind it.
- Added in-memory partial-block terrain carving for Physics Core impacts: chipped terrain keeps collision and health, sheds a small material-budgeted burst of debris, and shows bite-style custom terrain until the final fracture clears it.
- Added a capped `ImpactCraterField` prototype for faceted visual crater/scar experiments; it is currently parked behind the partial-block terrain carve path.
- Added a shared debris-shape catalog for varied low-poly active fragments, with non-uniform shard scales, cuboid physics envelopes, and baked rubble visuals that preserve the settled shard shape.
- Split pause-menu `Settings` into `Graphics` and `Gameplay` tabs so visual/performance tuning stays separate from core feel, health bars, and cleanup.
- Added pause-menu physics-core size and velocity sliders, with smaller/faster first-pass defaults and local persistence for future throw tuning.
- Added projectile-footprint carving and tiny-core piercing: small fast cores can open a complete bite-lattice tunnel and continue into air with reduced speed, while wider cores chew a broader face gouge and stop.
- Added `Hitscan Core` as a separate hotbar weapon that fires an instant smallest/fastest core trace through the same partial-block bite, material ejection, and tunnel-continuation rules.
- Added a generated additive energy-beam visual for `Hitscan Core`, using a short-lived cylinder-style tracer wrapped with the bolt texture so the instant shot has a readable flash without becoming a physical projectile.

### Changed

- Changed damaged partial-terrain visuals from surface dents into hidden 3x3x3 apple-bite volumes: removed visual cells now follow damage/maxHealth, exposed bite interiors render as wrinkled faceted surfaces, and the lattice stays presentation-only while gameplay material remains normalized.
- Changed partial-terrain bite ranking to follow the core's swept trajectory and radius, so tiny cores remove a narrow column and larger cores remove neighboring face cells before drilling deeper.
- Changed Physics Core terrain hits from one-shot block deletion plus visual scars into one-health carve steps; ordinary terrain now chips first, ejects debris as material is removed, then fractures into leftover debris once its health is exhausted.
- Changed final partial-terrain fracture to leave air instead of stamping the old wrinkled surface puddle.
- Changed final terrain-fracture debris counts to scale with the material still left inside the block, so nearly-broken blocks no longer explode as if they were untouched full voxels.
- Changed rubble material accounting from the old 27-piece debris grid to normalized block volume: a full block is `1.0`, HP ratio directly controls remaining material, and visible shard count is only presentation/performance.
- Increased ordinary terrain block health from 2 to 10 HP so Physics Core carving has enough hits to show repeated deformation and chip debris before final fracture.
- Expanded projectile Physics Core tuning to 10% minimum size and 500% maximum velocity for bullet-like experiments without replacing the thrown-core path.
- Changed player-fired projectile and hitscan cores to hip-fire from a lowered right-side muzzle by default, with right-click ADS restoring centered reticle-origin shots.

### Fixed

- Fixed damaged partial-terrain bites visually refilling when later hits arrive from a different side; removed bite cells now persist and only expand as damage increases.
- Fixed tiny fast Physics Cores failing to pierce when the hit landed near a 3x3x3 bite-lattice seam; tiny cores now reserve the nearest continuous tunnel before the pierce check runs.
- Fixed thrown cores colliding with a chipped block's full invisible cube after a visual tunnel already exists; projectile collision now checks the remaining bite-lattice material while player/debris/raycast behavior stays full-cube until final fracture.
- Fixed Physics Core launches inheriting an upward arc instead of firing straight along the current aim direction.
- Fixed small fast Physics Cores tunneling through the front terrain block and damaging a block behind it.
- Fixed fast rigid debris sometimes outrunning its temporary terrain-collider bubble before landing.
- Fixed the pause settings panel clipping off-screen in shorter browser windows by constraining the panel to the viewport and scrolling inside it.
- Fixed destroyed-block crater stamps floating in empty space by moving them onto surviving exposed faces and removing scars hosted by blocks that later break.
- Fixed over-budget debris bake-out disappearing visually while preserving hidden material. Forced pressure relief now keeps a static shard pose when it has to convert awake debris, which matters while the draped rubble-sheet renderer is disabled.

## 0.5.0 - 2026-05-07

### Added

- Added Rapier through `@dimforge/rapier3d-compat` and a local `RigidDebrisSimulation` adapter, keeping WASM setup, dynamic cuboid bodies, static terrain/rubble colliders, transform sync, stats, and cleanup behind one engine-owned API.
- Routed destroyed-block fragments through Rapier dynamic cuboids while preserving the existing `PhysicsToy` render/material proxy and `PhysicsFragmentInstancer` batches.
- Added temporary static colliders around active debris for nearby solid terrain and partial-height rubble support, so rigid fragments can land on terrain, stack with each other, and rest on finalized piles.
- Added rigid-debris regressions for terrain landing/sleep, rubble-support landing, far-bubble bake-out, material preservation, and sleeping-first pressure relief.
- Added a separate CPU-facing rigid debris budget so large physics-object stress settings do not turn into thousands of active Rapier cuboids on the main thread.

### Changed

- `DebrisSettler` now treats Rapier-driven debris as region-owned material instead of running the old glue/contact/support-chain illusion over those fragments.
- Physics-budget pressure now prefers sleeping debris regions before awake debris, then still preserves material before falling back to pruning old physics cores.
- Static collider refresh now ignores already-sleeping debris and caps the active collider-cell set, reducing main-thread terrain/rubble collider churn during large debris piles.
- Settled Rapier debris now promotes into cheap rubble even inside the player bubble, preserving the final cube poses as baked chunks instead of keeping dead rigid bodies alive forever.
- Parked the old draped/wrinkly rubble sheet renderer behind a disabled flag, so finalized debris now renders as baked static cube chunks while keeping the cheap support, material, raycast, and damage data underneath.
- Debug HUD now reports rigid debris body sleep counts plus terrain/rubble support collider counts.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://127.0.0.1:5175/`: loaded `Default World`, confirmed the rigid-debris debug HUD counters render, and checked for fresh console errors/warnings.

## 0.4.7 - 2026-05-07

### Fixed

- Tightened active-bubble debris sleep so each sleeping fragment needs terrain/rubble support or a believable stack-chain through another supported shard.
- Reduced the intentional sticky contact overlap and made glue links preserve a minimum visual separation, so glued cube debris keeps clumping without freezing inside itself.
- Added regressions for overlapped glued shards, supported stack sleep, and side-linked unsupported fragments that should keep simulating instead of floating asleep.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/?debrisGlueSmoke=1778142000000`: loaded `Default World`, let the HUD settle, and confirmed no fresh console errors or warnings.

## 0.4.6 - 2026-05-07

### Fixed

- Changed active-bubble debris sleep from whole-region to glue-connected component checks, so one supported pile can no longer freeze unrelated fragments floating above the same crater.
- Added support-anchored sleep tracking to debris fragments so already-sleeping, legitimately supported clumps can still anchor their own component without making old unsupported sleepers count as terrain support.
- Added a mixed-region regression test where a supported clump sleeps while an unconnected floating shard remains active.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/?debrisComponentSmoke=1778135000000`: loaded `Default World` and confirmed no fresh console errors.

## 0.4.5 - 2026-05-07

### Fixed

- Added a support-contact signal to loose debris physics so the settling region can tell when part of a glued clump is actually resting on terrain or rubble.
- Let quiet supported debris clumps sleep in place even if upper shards still have leftover angular velocity, stopping the visible "spinning forever on top of the pile" behavior.
- Kept unsupported quiet clumps from sleeping in midair, so the stronger stop condition only applies when the pile has a real support anchor.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/?debrisBakeSmoke=1778115000000`: reloaded the app, loaded `Default World`, and confirmed no fresh console errors.

## 0.4.4 - 2026-05-07

### Fixed

- Stopped debris pair-pressure relief from baking active-bubble regions into static rubble. Over-budget local contact work now shuts off the oldest contact theater instead of despawning live debris mid-flight.
- Delayed outside-bubble settling-region finalization until fragments are actually quiet/sleeping, so distance cleanup no longer turns airborne debris into floating baked rubble.
- Limited baked rubble visual chunks to settled fragments. Awake fragments can still preserve their material through rubble surface samples, but they no longer leave floating cube fossils when forced cleanup happens.
- Tightened orphan fragment absorption so outside-bubble debris waits until it is sleeping before it converts into persistent rubble.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.4.3 - 2026-05-07

### Changed

- Added an initial no-contact breakup window for destroyed-block debris so dense 3x3x3 fragments can spread before local contact damping starts preserving the original cube silhouette.
- Delayed debris glue/cohesion and stopped applying region cohesion during breakup, so early ejection no longer fights the later clumping pass.
- Added a quiet-clump sleep path for active-bubble debris so glued fragments that have settled stop spinning in place while remaining shoveable by physics cores.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/?debrisEjectionSmoke=1778110000000`: confirmed no fresh console errors after reload.

## 0.4.2 - 2026-05-07

### Changed

- Increased destroyed-block debris ejection speed so fragments break away more clearly before the sticky settling pass starts clumping them into rubble.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/?debrisEjectionSmoke=1778110000000`: loaded `Default World`, confirmed HUD/runtime state, and checked for fresh console errors.

## 0.4.1 - 2026-05-07

### Fixed

- Fixed baked hybrid rubble chunk face winding so finalized rubble renders complete exterior cube faces instead of culling the outside into partial triangle shards.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.4.0 - 2026-05-06

### Added

- Added a quality-scaled active debris bubble: Potato keeps loose debris alive near the player within 8m, Low 12m, Normal 20m, High 32m, Ultra 48m, and Super Ultra 72m.
- Added hybrid rubble visuals. Finalized rubble still uses the cheap walkable/support heightfield, but it now bakes capped static cube chunks from settled debris poses into the same rubble mesh for a chunkier pile silhouette and future re-break data.
- Added debug HUD readouts for active settling fragments, active debris radius, and baked rubble visual chunk counts.

### Changed

- Replaced time-only debris finalization in the browser loop with one-way active-bubble finalization. Nearby sleeping fragments can remain visible and shoveable instead of hard-finalizing after the old 1.2s cap.
- Reworked physics-budget pressure relief to preserve material: farthest settling regions finalize into rubble first, far/outside orphan fragments absorb into rubble next, and old physics cores are pruned only as a last resort.
- Removed normal timer expiry from block fragments. Distance, budget pressure, or explicit cleanup now decide when debris becomes rubble.
- Reduced the same-region debris contact window to 0.35s while preserving glue links afterward, keeping the short clumping theater without reopening permanent debris-debris broadphase work.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: destroy nearby blocks, move/fly away to finalize debris, spam cores, verify `X` removes cores only, verify `Despawn All Objects` clears debris/rubble, and check console.

## 0.3.8 - 2026-05-06

### Changed

- Decoupled rubble material volume from rubble durability. A destroyed block still contributes one full 3x3x3 fracture grid worth of cover material for shape, support, quality parity, and dense-pile promotion, but one block worth of rubble now has 3 HP instead of accidentally inheriting 27 HP.
- Reduced the collateral chip applied to neighboring rubble after a directly hit pile breaks, keeping adjacent cover from feeling like it was secretly hit by the full impact.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.7 - 2026-05-06

### Added

- Added floating debug health bars for damaged terrain blocks and destructible rubble cover. Bars are DOM overlays projected from world positions, capped to avoid unbounded UI growth, and cleared during world/object teardown.
- Added a typed `rubble:damaged` engine event so future combat systems and Nova context can react to rubble damage without scraping render state.

### Changed

- Rubble damage now applies the full hit only to the directly impacted pile. If that pile is destroyed, immediate neighboring piles receive a small non-lethal collateral chip instead of inheriting the original impact damage.
- Physics cores stop checking additional rubble clusters once they expire from destroying a pile.

### Validation

- Browser smoke at `http://localhost:5173/`: loaded the saved world, selected Physics Core, threw cores into terrain, and confirmed a damage indicator element appeared with health text.
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.6 - 2026-05-06

### Fixed

- Resolved terrain-hit damage immediately after each physics core moves, before that core can collide with rubble, so a projectile consumed by block destruction cannot also delete an adjacent pile in the same frame.
- Added regression coverage for both core impact ordering and manual adjacent-terrain removal: adjacent same-height block edits should not delete a supported rubble pile.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.5 - 2026-05-06

### Fixed

- Prevented physics cores from damaging adjacent rubble in the same frame that they register a meaningful terrain impact, so destroying a terrain block beside a pile no longer consumes the nearby rubble pile as collateral damage.
- Added a regression test for the terrain-plus-rubble overlap case: the impacted terrain block is destroyed, the core is consumed, and the neighboring rubble health remains unchanged.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.4 - 2026-05-05

### Fixed

- Added a real idle hibernation path for the browser engine: hidden pages stop scheduling RAF work, and visible worlds with no active chunks, saves, debris, or physics actors suspend after five minutes of no input.
- Added a low-frequency idle heartbeat that drains the frame clock and saves player location while the app is hidden, then resumes the normal animation loop on focus, visibility, pointer, or keyboard activity.
- Added a world pending-work signal so the engine only hibernates after chunk streaming, worker results, mesh rebuilds, and save writes have drained.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.3 - 2026-05-03

### Changed

- Fresh block debris now gets a short breakup phase before sticky contacts can form, with stronger outward scatter so destroyed voxels do not briefly remain as tiny intact block silhouettes.
- Existing debris glue links now keep shaping a settling region until rubble finalization, preventing a good-looking clump from melting flat after the active pair-check window closes.
- Final rubble meshes now use a small faceted heightfield driven by settled debris samples instead of reducing each occupied cell to one smoothed apex, so the persistent cover reads more like a jagged sheet over the pile.
- Sparse rubble now keeps a local footprint around its settled samples instead of inflating every occupied cell into a full bumpy tile; larger material totals still grow toward broad walkable cover.
- Loose debris now resolves against finalized rubble support surfaces, preventing fragments that land on piles from slowly sinking or clipping into the cover mesh before they finalize.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.2 - 2026-05-03

### Changed

- Same-region block debris now uses temporary glue contacts: fragments that touch during the settling window share velocity, stop independent rotation, and hold a tiny link until the region finalizes.
- Rubble finalization now keeps bounded surface samples from the settled debris and builds a draped, jagged top surface over those samples instead of flattening each pile into a simple cell lid.
- Lowered temporary debris-debris bounce during settling so rubble formation reads more like tumbling material and less like loose rubber cubes.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.1 - 2026-05-03

### Fixed

- Settling regions now wait for visible fragments to go quiet before soft finalization, preventing mid-bounce debris poses from being frozen into permanent rubble.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.3.0 - 2026-05-03

### Added

- Added the first hybrid settling-region rubble pipeline: destroyed blocks now feed nearby temporary debris into shared regions that finalize into connected rubble patches instead of isolated per-block piles.
- Added short-lived same-region debris collision and stacked-contact support with a hard pair budget so fragments can tumble, stack, and clump briefly without turning dense destruction into permanent debris-debris physics.
- Added batched rubble absorption so settled regions deposit full gameplay material in one pass, including Potato mode expanding two visible shards into one full block's rubble material.
- Added visible cube tumbling for block fragments, including instanced-renderer support for each fragment's rotation.
- Added debug HUD settling metrics for active regions, settling fragments, debris pair checks, resolved debris contacts, finalized batches, and forced finalizations.

### Changed

- Loose block fragments now convert to persistent rubble roughly `0.6s` after the latest nearby fracture, with temporary region contacts lasting most of that window and a `1.2s` hard cap from the first fracture in a region.
- Rubble gameplay/collision truth remains the cheap sloped rubble field; visible debris is now short-lived physical theater.
- Softened rubble height and terrain-banking so batched debris regions form lower, more organic cover instead of oversized square slabs.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: checked Potato, Normal, and Ultra rubble formation, adjacent fracture merging, core/rubble interaction, and console errors.

## 0.2.21 - 2026-05-03

### Fixed

- Fixed Potato-mode block debris failing to become rubble when its two visible shards expired before satisfying the sleep threshold.
- Expired instanced block fragments now deposit their carried rubble material before the generic physics cleanup pass removes them, so graphics-quality debris counts do not alter gameplay rubble output.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: selected Potato quality, destroyed terrain with Physics Core impacts, and confirmed rubble counters increased without fresh app console errors.

## 0.2.20 - 2026-05-03

### Changed

- Raised physics core impact damage to `30` for terrain blocks and destructible rubble piles.
- Physics core impact payloads now keep a reference to the source core so gameplay handlers can consume the projectile after destructive impacts.
- Physics cores now self-destruct when their impact destroys a terrain voxel or the rubble pile cell they struck.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: selected Physics Core, fired into terrain, confirmed one-shot block destruction/core consumption behavior, and checked for fresh app console errors.

## 0.2.19 - 2026-05-03

### Added

- Added partial-height rubble support queries so the player can stand on and step onto settled rubble cover without turning every pile into a full solid voxel.
- Added sloped rubble patch surfaces that share corner heights across neighboring pile cells and rise subtly toward adjacent solid terrain.
- Added regression coverage for walkable rubble support height and terrain-directed rubble slope generation.

### Changed

- Routed player collision through a combined collision world: full terrain still comes from `VoxelWorld.isSolid`, while rubble supplies optional partial support height.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: spawned rubble by firing physics cores into terrain, walked onto settled rubble patches, and checked for fresh app console errors.

## 0.2.18 - 2026-05-03

### Fixed

- Fixed rubble damage targeting so impacts damage the pile cell closest to the hit/contact point instead of damaging the healthiest pile in the merged patch.
- Tightened rubble core collision and rubble raycasts to use occupied pile-cell bounds instead of broad merged-patch bounds, avoiding false hits in empty corners of broad rubble clusters.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.17 - 2026-05-03

### Changed

- Decoupled rubble gameplay material from visible debris count: every destroyed block now contributes one full block's worth of rubble material even when lower quality settings spawn fewer visible fragments.
- Visible debris count remains a performance/visual tuning knob, while settled rubble height, health, cover value, and terrain-promotion behavior stay consistent across Potato, Low, Normal, High, Ultra, and Super Ultra.
- Fragment physics bodies now carry `rubbleMaterialUnits`, so a small number of visible shards can settle into the same gameplay rubble mass as the full 3x3x3 fracture grid.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.16 - 2026-05-03

### Added

- Added explicit runtime disposal for Vite reloads and browser unloads: cancel the animation frame loop, abort main event listeners, dispose the player controller, drop active physics/world resources, dispose long-lived Three.js helpers, and force WebGL context loss.
- Added `PlayerController.dispose()` so document-level pointer-lock, keyboard, and mouse listeners are removed when the engine runtime is torn down.
- Added `VoxelWorld.dispose()` so active chunk meshes and the worker are released from synchronous teardown paths.
- Added `TargetBlockHighlighter.dispose()` and disposed the temporary box geometry used to build its edge outline.

### Changed

- Main runtime event listeners now share an `AbortController`, preventing duplicate UI/input handlers during dev reloads.
- The render loop now stores and cancels its `requestAnimationFrame` id, preventing orphan frame loops when the app is reloaded in place.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app through the new teardown path, loaded `Default World`, opened the debug HUD, confirmed the world rendered with stable low object counts, and saw no fresh console warnings/errors. Firefox process sampling dropped from the earlier multi-GB GPU-process spike to roughly 4.7 GB total working set after the cleanup reload, though a full browser restart may still be needed to reclaim memory from contexts leaked before this patch.

## 0.2.15 - 2026-05-03

### Added

- Added `src/items.ts`, a reusable item registry with item ids, categories, tags, stack metadata, and primary/secondary action descriptors.
- Added item action contracts for empty hands, placeable terrain blocks, and the Physics Core.
- Added an `item:selected` engine event so future systems can react to held-item changes without coupling to block palette events.
- Added regression coverage for item registry behavior, action lookup, and number-key hotbar selection mapping.

### Changed

- Refactored the hotbar to store item stacks and resolve behavior through the item registry instead of hard-coded item-kind unions.
- Refactored mouse click handling to dispatch item actions, preserving the current behavior: Unarmed does nothing, blocks break/place, and Physics Core throws on left click.
- Updated README, TODO, and codebase index notes for the new item/action foundation.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded `Default World`, selected `Physics Core` with the hotbar digit path, threw a core and confirmed the debug HUD physics count updated with no fresh console errors, then selected `Grass` and confirmed the HUD label changed through the item registry path.

## 0.2.14 - 2026-05-03

### Added

- Added `NovaContextJournal`, an event-backed local context snapshot that tracks loaded world, selected item, player mode/speed, quality settings, physics counts, recent damage/rubble/performance events, and chat history.
- Added `Nova Chat`, an in-game local chat pane opened with `Enter` or the pause-menu `Nova Chat` button.
- Added local context-aware Nova replies for help, world/location, performance, physics-core, rubble, and general status prompts.
- Added regression coverage for Nova context snapshots, contextual chat replies, and bounded chat logs.

### Changed

- Opening Nova Chat now suspends movement/look input without showing the pause menu, then resumes pointer lock when chat closes.
- Updated README, TODO, and codebase index notes for the local chat slice and the later real model/proxy hook.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded `Default World`, opened Nova Chat with `Enter`, submitted `what are you seeing?`, verified the player message and context-aware Nova status reply rendered, closed chat with `Esc`, and saw no fresh console errors.

## 0.2.13 - 2026-05-03

### Changed

- Changed hotbar click behavior so `Unarmed` is intentionally inert on both mouse buttons.
- Changed selected block behavior to own terrain editing: left click breaks the targeted block and right click places the selected block.
- Changed selected `Physics Core` behavior so left click throws a core and right click is reserved for future use.
- Updated HUD, README, and codebase index controls for the corrected item-action mapping.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded `Default World`, confirmed updated HUD control text, verified wheel selection reaches block and `Physics Core` slots, and confirmed selected `Physics Core` left click increased the active physics count from 1 to 2 with no fresh console errors during the focused check.

## 0.2.12 - 2026-05-02

### Added

- Added a scroll-selected hotbar lane containing `Unarmed`, each placeable block, and `Physics Core`.
- Added regression coverage for hotbar item order, labels, break eligibility, wheel direction, and wraparound selection.
- Added a TODO note for the future equipment/items iteration.

### Changed

- Removed `T` as the player physics-core launch control.
- Right click now uses the selected hotbar item: selected blocks place into the targeted adjacent space, while selected Physics Core throws a core.
- Left click now breaks terrain only while `Unarmed`, leaving selected blocks/cores from accidentally demolishing the target.
- Updated HUD, README, and codebase index control references for the new selection model.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded `Default World`, confirmed the HUD starts on `Unarmed`, mouse wheel selection advances through block items, and no fresh console errors appeared.

## 0.2.11 - 2026-05-02

### Added

- Saved worlds now remember the player's last feet position plus yaw/pitch look direction, restoring that location when the world is loaded again.
- Added a bounded player-location autosave path that writes periodically during play and also saves on pause, page hide, and `Exit to Home`.
- Added regression coverage for player-location metadata persistence and deep cloning in the saved-world registry.

### Changed

- World loading now preloads and ensures chunks around the saved player location instead of always starting around the origin.
- Player teleports now reset movement/crouch/slide state from a feet-position anchor so crouched exits do not reload the camera inside terrain.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, paused to trigger the player-location save path, and confirmed no fresh app console errors.

## 0.2.10 - 2026-05-02

### Added

- Added a typed in-browser engine event bus for decoupled gameplay events such as world load, Nova toggles, physics core throws, block damage/destruction, rubble formation, quality/settings changes, palette selection, core cleanup, and frame spikes.
- Added Nova Pilot reactions as the first event-bus consumer: Nova now pulses and shows short rate-limited HUD messages when meaningful engine events happen.
- Added regression coverage for event-bus unsubscribe behavior and Nova reaction throttling/expiration.

### Changed

- Routed existing main-loop events through the event bus instead of baking all future companion/gameplay reactions directly into `main.ts`.
- Added a lightweight `#nova-message` HUD panel for companion chatter.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the Nova message panel shows on world load, toggled Nova off/on with `N`, triggered the Nova-thrown core reaction with `B`, and checked for fresh app console errors.

## 0.2.9 - 2026-05-02

### Added

- Added the Nova Pilot companion as a visible in-world hover pilot that starts alongside loaded worlds, orbits near the player, stays above nearby terrain, and can be toggled with `N`.
- Added `B` as a Nova-thrown physics-core launch, using the pilot's position and aim direction instead of the player's camera muzzle.
- Added regression coverage for Nova's companion positioning fallback and pilot-thrown core launch direction.

### Changed

- Shared player-thrown and Nova-thrown physics-core construction through one helper so sleep/damage tuning stays consistent.
- Updated HUD, README, and codebase index entries for the new companion controls and module ownership.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the HUD rendered `| Nova`, toggled Nova off/on with `N`, spawned a Nova core with `B`, spawned a player core with `T`, cleared active cores with `X`, and checked for fresh app console errors.

## 0.2.8 - 2026-05-02

### Changed

- Reworked sprint/flight boost lines from side-mounted parallel streaks into faint center-out radial spokes that are masked toward the screen edges.
- Softened boost overlay opacity and transition timing so the FOV pop remains readable without the overlay dominating the view.
- Restored physics-core rebounds against rubble cover so cores bounce with meaningful speed instead of dying on settled debris.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the HUD/debug overlay rendered, and checked for fresh app console errors.

## 0.2.7 - 2026-05-02

### Changed

- Added hidden-tab and overnight-resume frame guards so chunk streaming, physics, minimap, and rendering skip expensive work while the page is hidden or recovering from a long frame gap.
- Reset debug timing and minimap meters after visibility/focus resumes so stale overnight deltas do not poison the HUD smoothing window.
- Made `Despawn All Objects` release high-water instanced debris batches instead of only hiding fragment instances, allowing long stress tests to give those GPU buffers back.

### Added

- Added regression coverage for frame delta clamping, hidden/resume frame skipping, and lazy recreation of disposed fragment instancing batches.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the debug HUD rendered with `frag inst 0 batches 0 cap 0`, and checked for fresh app console errors.

## 0.2.6 - 2026-05-02

### Changed

- Reworked settled rubble from one proxy mesh per occupied cell into bounded multi-cell patches, so neighboring piles read as connected debris fields instead of scattered floor tiles.
- Lowered rubble patch height and skipped internal patch side faces, reducing the blocky slab look while keeping rubble queryable for cover and core collision.
- Updated the debug HUD label from rubble `piles` to rubble `patches`.

### Added

- Added a regression test proving adjacent rubble cells merge into one rendered patch while still raycasting as cover.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the debug HUD reports rubble `patches`, and checked for fresh app console errors.

## 0.2.5 - 2026-05-02

### Changed

- Raised the rubble-to-terrain promotion threshold from 36 to 48 pieces, making compacted `Rubble` blocks require roughly two high-quality block fractures worth of material.
- Kept the visual rubble pile cap at 36 pieces while allowing hidden pile material to continue accumulating toward terrain compaction.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.4 - 2026-05-02

### Changed

- Doubled the rubble-to-terrain promotion threshold from 18 to 36 pieces, so one full 27-piece block fracture remains destructible cover instead of immediately refilling the hole it came from.
- Updated rubble docs to describe compaction as a dense-pile behavior rather than a normal one-block break result.

### Added

- Added a regression test proving one maximum-quality block fracture stays as a rubble proxy while larger accumulated piles can still compact into generated `Rubble` terrain.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, and checked for fresh console errors.

## 0.2.3 - 2026-05-02

### Added

- Added a generated `Rubble` terrain block that compacted rubble piles can promote into once a cell gathers enough settled pieces.
- Added rubble support checks: unsupported rubble piles fall one voxel cell at a time, and falling piles merge into piles directly below them.
- Added tests for falling/merging rubble piles and promotion from cover proxy into solid terrain.

### Changed

- Rubble settlement now runs each active frame after physics impacts, so destroying support blocks can make existing piles drop or compact.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded a world, toggled debug HUD, confirmed the rubble stats line renders, and checked for fresh console errors.

## 0.2.2 - 2026-05-02

### Changed

- Reassigned `X` to despawn only thrown physics cores, preserving loose debris and settled rubble piles for ongoing destruction tests.
- Removed the redundant settings-menu core-despawn button; the settings menu now keeps only the drastic `Despawn All Objects` cleanup action.
- Updated HUD and README control copy so the quick hotkey and full cleanup button describe their different blast radii.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: confirmed HUD says `X despawn cores`, Settings only exposes `Despawn All Objects`, pressed `X`, and checked for fresh console errors.

## 0.2.1 - 2026-05-02

### Changed

- Tuned block-fragment launch speeds downward so destroyed blocks break into nearby debris instead of spraying pieces far from the fracture site.
- Split fragment block-collision response from thrown-core collision response: fragments now lose horizontal speed on ground contact, bounce less, and settle into rubble piles faster.
- Added a settings-menu `Despawn Physics Cores` button for clearing thrown cores without deleting loose debris or rubble piles.
- Added a regression test that keeps grounded fragments from skating away before they become rubble cover.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.0 - 2026-05-02

### Added

- Added persistent rubble cover proxies: settled debris fragments now merge into cheap gameplay piles instead of remaining as long-lived individual physics shards.
- Added destructible rubble behavior: moving physics cores collide with rubble piles, bounce away, and chip pile health on meaningful impacts.
- Added rubble raycast support so future shooter line-of-sight, bullet, and cover checks can query piles without touching every visual shard.
- Added rubble statistics to the debug HUD for pile count, piece count, and maximum cover height.

### Changed

- Absorbed sleeping debris into rubble piles before object-object broadphase work, reducing per-frame physics pressure while preserving tactical destruction hooks.
- Bumped the project version to `0.2.0` and started release notes for engine-level milestones.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded a world, toggled debug HUD, confirmed the rubble stats line was present, and checked for fresh console errors.

## 0.1.0 - 2026-05-02

### Added

- Initial strict TypeScript voxel sandbox engine baseline with chunk streaming, saved worlds, quality presets, player movement, destructible blocks, physics cores, instanced debris rendering, and engine robustness tests.
