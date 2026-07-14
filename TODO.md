# TODO

Shortlist of project direction that is worth keeping visible. This file is for
promoted work, not every fun idea that crosses the room.

## Current Recommended Next Slice

- The `v0.19.x` flight line is active. `v0.19.0` establishes a collision-aware
  third-person camera, visible player avatar, and separate physical-eye/render
  camera ownership as the prerequisite.
- Replace the current clean debug flight toggle with physical flight: deliberate
  thrust acceleration, retained momentum, drag/braking, boost cost/limits,
  readable ascent/descent, bank/lean presentation, terrain contact, and a safe
  landing/recovery transition back to grounded movement.
- Preserve first-person comfort and exact tool aim while letting third-person
  communicate body tilt and thruster state. Tune camera lag only after motion is
  mechanically stable, and avoid attaching collision truth to avatar geometry.
- Add focused flight tests for acceleration, terminal limits, timestep
  stability, input release, opposite-thrust braking, collisions, landing, and
  world reload. Exercise the finished feel in both camera modes.
- Treat rigid debris, worker scheduling, and partial terrain collision as
  maintenance/watchlist areas for now. They should not steal the whole roadmap
  unless a bug makes them unavoidable. Equipment pickup/drop and richer sound
  content remain the best follow-on gameplay lanes after flight.
- Keep performance work evidence-led. Check Chrome logs, F3 counters, and
  repeatable stress scenes before optimizing something just because it feels
  suspicious.

## Parked: Future WebGPU Overhaul

- The old `experiment/gpu-ripple-field` WebGL2 branch is shelved. It proved
  useful renderer seams, compact terrain records, and diagnostics, but current
  `main` has moved too far ahead to merge that branch wholesale.
- Future GPU renderer work should start from current `main` on a fresh branch
  such as `experiment/webgpu-overhaul`, using
  `docs/future-webgpu-overhaul.md` as the planning breadcrumb.
- Keep the first WebGPU pass renderer-focused: backend contract, capability
  layer, explicit buffers, terrain pages, diagnostics, and disposal.
- Material-specific high-count debris belongs in the WebGPU visual lane later:
  leaves as floaty wind-sensitive particles, sand as clouds/spray, stone as
  chunky shards, and wood as long splinters. CPU/Rapier should keep only the
  gameplay-relevant pieces.
- Do not reopen this lane until we intentionally choose renderer architecture
  work again; equipment slots/pickup gameplay and sound remain the current
  mainline priorities.

## High Priority: Sound

- First engine slice shipped in `v0.12.0`: `src/audioEngine.ts` owns a
  browser-unlocked procedural Web Audio layer, `src/audioSettings.ts` owns
  persisted Sound/Master/SFX/UI settings, and `src/main.ts` feeds it typed
  engine events plus lightweight player motion snapshots.
- Goal: add a real sound layer so movement, tools, terrain hits, material
  destruction, debris, projectiles, UI, Nova, weather, and future entities have
  readable feedback instead of the current silent prototype feel.
- Next slice should improve content quality and coverage: authored/generated
  source assets or richer synth profiles for Terraformer carve, block
  placement/removal, material poofs, debris hits, weather, and more distinct
  Nova companion cues.
- Material identity should drive sound flavor over time. Leaves can be soft and
  airy, sand/dirt more dusty, wood snappy, stone heavy/jagged, ember hotter and
  sharper, matching the existing material/debris personality direction.
- Add simple positional/spatial audio for world events after the non-spatial SFX
  path is stable. Keep listener updates tied to the player/camera, cap active
  voices per quality setting, and pool/reuse nodes so debris storms cannot turn
  audio into a CPU problem.
- Browser constraints matter: audio must handle muted autoplay policies,
  suspend/resume, tab visibility, device changes, and clean teardown during Vite
  reloads without leaving stale audio nodes alive.
- Future path: ambient biome loops, day/night/weather sound beds, occlusion or
  muffling through terrain, per-tool sound profiles, bot/entity voices or cues,
  and optional music once the world has enough identity to deserve it.
- Validation shape: include unit coverage for audio settings/state helpers, a
  browser smoke test that confirms audio unlock and mute/volume behavior, a
  stress scene with many debris/material events, and a cleanup check across
  pause, world exit, and dev reload.

## Completed Foundation: Individual Light Sources

- First slice shipped in `v0.14.0` and was corrected through `v0.15.3`:
  placeable `Lamp` blocks register as radius-selected Three.js point lights
  from exposed fixture surfaces, rebuild from loaded/edited chunks, use a
  quality-tuned light radius, and coexist with the cheaper baked
  sun/face-shading baseline.
- The `v0.17.0` data foundation now renders through cached worker-built 0..15
  Lamp block-light arrays on normal chunks, carved partial terrain, and flying
  instanced debris. Partial cavities preserve aperture direction and light
  attenuation, while chunk and partial faces share smoothed corner gradients.
- The expensive smooth PointLight layer is now secondary and quality-scaled:
  Potato uses none, while Low through Super Ultra use stable budgets from 4 to
  32. Overflow Lamps remain emissive and block-light-backed instead of going
  dark, and quality changes retain allocated high-water proxy objects for reuse.
- Keep baked sun/face shading and individual runtime lights conceptually
  separate. Existing `voxelLighting.ts` face shading can remain the cheap
  ambient/sun baseline while block-light data becomes an additive local layer.
- Reopen this lane for a named visual or performance repro, or when gameplay
  needs colored/emissive blocks, dynamic projectile glows, tool/Nova light
  pulses, or illumination-aware mechanics. Sub-cell propagation through intact
  partial material remains deliberately out of scope until it earns the cost.

## Completed Foundation: Creative Inventory

- `v0.18.0` adds `src/inventory.ts`: fixed nullable-slot containers with
  normalization, max-stack limits, merge/remainder insertion,
  remove/split/transfer/swap operations, stable-id selection, and plain
  deep-cloneable save state.
- Inventory metadata now persists per world without an IndexedDB schema bump:
  active lane, independent selected item/block ids, and an 18-slot finite
  Backpack normalize against the current registry on read.
- The pause menu now exposes Items and Blocks creative catalogs plus the saved
  Backpack grid. `I` opens it, catalog picks resume play, and the bottom hotbar
  remains lane-specific.
- Current sandbox rules remain deliberately creative: Terraformer, cores, and
  blocks are unlimited-use; Unarmed is virtual; there is no ammo, durability,
  placement consumption, pickup, or drop behavior yet.
- Next equipment slice should decide what earns a finite stack, add explicit
  equipment slots, and design pickup/drop transfer as gameplay instead of
  quietly turning the editor sandbox into a survival inventory.
- Keep terrain editing, combat, building, and utility actions owned by item
  descriptors. Regression coverage should continue proving action routing when
  equipment and finite stacks arrive.

## Watchlist: Partial Terrain Traversal

- Current status: the old cross-block partial-hole collision task has largely
  shipped. Player movement now uses partial-block collision/support paths for
  fall-through holes, narrower seams, low partial ledges/stairs, vaults,
  clambers, and falling edge-grabs.
- Keep watching for collision/visual mismatches around weird damaged terrain:
  cross-block apertures, one-sub-block stairs, partial ledges, clamber/vault
  transitions, and debris piles near partial terrain.
- `docs/player-partial-collision-plan.md` is now a historical/audit reference,
  not the active next implementation plan.
- Do not reopen this lane unless playtesting finds a clear repro. When that
  happens, add a regression scene/test before patching the movement code again.

## Worker Migration Roadmap

- Current foundation: `WorkerPool` owns shared job protocol shape with clamped
  capacity, ids, stale revision rejection, cancellation, sync fallback, transfer
  bookkeeping, priority lanes, per-job-type telemetry, and buffered main-thread
  upload accounting.
- Completed browser-worker slices: partial-region geometry building plus chunk
  generation/meshing now run through the generic `engineWorker` and shared
  WorkerPool while the main thread keeps Three.js `BufferGeometry` ownership.
- Future worker targets should be chosen from logs, not vibes. The next likely
  worthwhile lane is decoupling loose-debris simulation state from Three proxy
  objects so rendering consumes plain arrays of transforms/material/shape ids.
- Only after that, prototype workerized loose-debris simulation with compact
  nearby-support snapshots. Keep player movement, core firing, terrain damage,
  gameplay decisions, SharedArrayBuffer, WASM threads, and OffscreenCanvas out
  of scope until the simpler worker pipeline proves its value.
- Bigger architecture fork to consider later: run a dedicated local/backend
  simulation host and treat the browser as the rendering/input interface. That
  would unlock normal host-side multi-threading, process-level CPU/core
  telemetry, richer profiling, heavier physics/world jobs, and cleaner log
  capture than browser APIs allow. Keep it as a deliberate backend experiment,
  not a panic rewrite.

## Rigid Debris Optimization Roadmap

- Current state: rigid debris is good enough for now. Recent passes split
  physics timings, capped Rapier admission at spawn time, preserved full visible
  break bursts as cheap VFX, reduced support-collider pressure, and fixed the
  detached-sleeper support bug that made debris float after the terrain below it
  changed.
- Parked unless logs force it: parked sleepers, deeper workerized debris
  simulation, material-specific rigid behavior, and GPU-owned transient VFX.
- Do not revive partial-mesh draw caps or rigid-debris cadence throttling; both
  were playtested and parked because the visual/feel cost was not worth it.
- Do not keep nitpicking debris feel while the game has no sound, light tools,
  inventory, combat loop, entities, objectives, or world interaction structure.
  Yes, this note is here because we know exactly what we are like.
- If this lane reopens, require a named repro/stress scene and compare against
  current Chrome logs before changing behavior.

## Rigid Sub-Voxel Damage Objects

- Current direction: loose block debris is VFX, while block HP and the sparse
  3x3x3 partial-block bite lattice own durable terrain damage.
- Future experiment: let selected damaged sub-voxels promote into real rigid
  objects when that is the actual mechanic, instead of using generic debris
  bake-out as an accidental gameplay proxy.
- Keep this opt-in and local to impacted macro blocks. Do not activate the
  whole world as tiny rigid voxels.
- Useful first target: a heavily damaged bite cell or severed exposed chunk can
  detach as a rigid cuboid/shard, collide briefly, then either expire as VFX or
  intentionally become a placed terrain/cover object through a dedicated rule.
- Preserve material/HP accounting separately from visible shard count so
  graphics quality never changes gameplay value.

## Future Nova Chat Hook

- First local slice is in place: `Enter` opens Nova Chat,
  `NovaContextJournal` collects recent engine context, and `novaChat.ts`
  produces local context-aware replies without network calls.
- Add an optional live Nova chat path so the in-game companion can answer typed
  player questions with a real model response instead of only canned local
  reactions.
- Keep API credentials out of browser code. The safe shape is a tiny
  local/backend proxy for text chat, then a browser-safe short-lived token flow
  if we later move to realtime voice.
- Feed a real model the existing compact game context from the event bus
  journal: active world name/seed, selected block, quality preset, player
  speed/mode, recent block damage, rubble events, and frame hitches.
- Start with explicit player-initiated chat so token usage is controlled.
  Event-triggered autonomous commentary can stay canned or heavily rate-limited
  until the behavior is actually fun.
- Likely next implementation: local/backend proxy that streams Responses API
  text into the Nova chat log.
- Later stretch goal: Realtime API voice mode, if it still feels useful once
  the text version proves itself.

Official docs to re-check before implementation:
- Responses streaming: https://developers.openai.com/api/docs/guides/streaming
- Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Realtime client secrets: https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets
