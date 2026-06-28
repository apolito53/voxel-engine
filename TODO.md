# TODO

Shortlist of project direction that is worth keeping visible. This file is for
promoted work, not every fun idea that crosses the room.

## Current Recommended Next Slice

- Stop polishing debris unless logs or playtesting show a blocking regression.
  The engine is stable enough to start adding gameplay-relevant systems again.
- Best next gameplay-feel lanes:
  1. Equipment and items
  2. Sound polish/content pass
  3. Individual light-source follow-up polish
- Treat rigid debris, worker scheduling, and partial terrain collision as
  maintenance/watchlist areas for now. They should not steal the whole roadmap
  unless a bug makes them unavoidable.
- Keep performance work evidence-led. Check Chrome logs, F3 counters, and
  repeatable stress scenes before optimizing something just because it feels
  suspicious.

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

## High Priority: Individual Light Sources

- First slice shipped in `v0.14.0` and was corrected through `v0.15.3`:
  placeable `Lamp` blocks register as radius-selected Three.js point lights
  from exposed fixture surfaces, rebuild from loaded/edited chunks, use a
  quality-tuned light radius, and coexist with the cheaper baked
  sun/face-shading baseline.
- Goal: support individual local light sources so the world can have torches,
  lamps, glowing tools/projectiles, lit structures, and eventually gameplay that
  depends on local darkness or illumination instead of only sun/sky lighting.
- Next slice should polish authored light identity: torch/lamp variants,
  brighter emissive-looking block faces, optional tool/Nova/projectile glows,
  and a simple test fixture for walking around several lights in Superflat Lab.
- Keep baked sun/face shading and individual runtime lights conceptually
  separate. Existing `voxelLighting.ts` face shading can remain the cheap
  ambient/sun baseline while individual lights become an additive local layer.
- Future path: optional chunk-aware light influence data for blocks/materials,
  light permeability, colored/emissive blocks, day/night interaction, dynamic
  projectile glows, and tool/Nova light pulses.
- Validation shape: include a Superflat Lab scene with multiple lights, a
  dense-fixture stress pass, a save/load check for placed light sources, and a
  visual smoke check that moving around chunk boundaries does not pop or leak
  lights weirdly.

## High Priority: Equipment And Items

- First foundation is in place: `src/items.ts` defines reusable item
  definitions, stack metadata, categories, tags, and primary/secondary action
  descriptors; `src/hotbar.ts` selects item stacks instead of hard-coded
  behavior unions.
- Next slice should turn that foundation into actual gameplay structure:
  equipment slots, inventory containers, item quantities, pickups/drops, and
  durable tool/weapon definitions.
- Keep blocks, throwable cores, tools, and future weapons in one clean model.
  If the hotbar becomes too crowded, split presentation into equipment slots
  plus inventory without splitting the item data model too early.
- Add explicit tool behavior so terrain editing, combat, building, and utility
  actions are owned by selected items instead of creeping back into universal
  left-click/right-click logic.
- Validation shape: unit-test item container operations, hotbar/equipment
  selection, stack limits, pickup/drop transfer, and click-action routing; smoke
  test that Terraformer, blocks, Physics Core, and Hitscan Core still behave.

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
