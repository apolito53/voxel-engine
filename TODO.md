# TODO

Shortlist of ideas worth keeping visible without pretending they are committed scope yet.

## High Priority: Individual Light Sources

- Goal: support individual local light sources so the world can have torches,
  lamps, glowing tools/projectiles, lit structures, and eventually gameplay that
  depends on local darkness or illumination instead of only sun/sky lighting.
- First slice should be deliberately small: add a bounded light-source registry,
  one placeable/test light block or admin-spawned lamp, persistence for placed
  light metadata, and a strict per-quality cap so local lights cannot silently
  murder frame time.
- Start with renderer-owned local lights and emissive visuals before attempting
  full voxel light propagation. Three.js `PointLight`/`SpotLight` behavior,
  shadow settings, culling, pooling, and quality budgets need to be proven in
  normal play first.
- Keep baked sun/face shading and individual runtime lights conceptually
  separate. Existing `voxelLighting.ts` face shading can remain the cheap
  ambient/sun baseline while individual lights become an additive local layer.
- Future path: optional chunk-aware light influence data for blocks/materials,
  light permeability, colored/emissive blocks, day/night interaction, dynamic
  projectile glows, and tool/Nova light pulses.
- Validation shape: include a Superflat Lab scene with multiple lights, a
  quality-budget stress pass, a save/load check for placed light sources, and a
  visual smoke check that moving around chunk boundaries does not pop or leak
  lights weirdly.

## High Priority: Sound

- Goal: add a real sound layer so movement, tools, terrain hits, material
  destruction, debris, projectiles, UI, Nova, weather, and future entities have
  readable feedback instead of the current silent prototype feel.
- First slice should be small and engine-shaped: create an audio manager that
  unlocks a browser `AudioContext` from a user gesture, owns master/SFX/UI
  volume and mute state, and exposes a typed event-style API for one-shot and
  looping sounds.
- Start with a tiny SFX set tied to existing gameplay signals: footsteps or
  landing, Terraformer carve, block placement/removal, Physics Core launch and
  impact, Hitscan fire, material poofs, debris hits, pause/menu clicks, and one
  Nova companion cue.
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

## Worker Migration Roadmap

- Current foundation: `WorkerPool` owns the shared job protocol shape with
  clamped capacity, ids, stale revision rejection, cancellation, sync fallback,
  transfer bookkeeping, priority lanes, per-job-type telemetry, and buffered
  main-thread upload accounting.
- Completed browser-worker slices: partial-region geometry building plus chunk
  generation/meshing now run through the generic `engineWorker` and shared
  WorkerPool while the main thread keeps Three.js `BufferGeometry` ownership.
- Later, decouple loose debris simulation state from Three proxy objects so
  rendering consumes plain arrays of transforms/material/shape ids instead of
  owning the simulation state.
- Only after that, prototype workerized loose-debris simulation with compact
  nearby-support snapshots. Keep player movement, core firing, terrain damage,
  gameplay decisions, SharedArrayBuffer, WASM threads, and OffscreenCanvas out
  of scope until the simpler worker pipeline proves its value.
- Bigger architecture fork to consider later: run a dedicated local/backend
  simulation host and treat the browser as the rendering/input interface. That
  would unlock normal host-side multi-threading, process-level CPU/core
  telemetry, richer profiling, heavier physics/world jobs, and cleaner log
  capture than browser APIs allow. Keep it as a deliberate backend experiment,
  not a panic rewrite, unless browser-native workers prove too cramped for the
  engine vision.

## Rigid Debris Optimization Roadmap

- Current first step: split physics timing now distinguishes toy motion, impact
  application, Rapier debris flush/step/sync, support-collider collection/sync,
  cleanup, broadphase, rubble settling, and render-proxy sync without changing
  gameplay behavior.
- Current optimization target completed: Rapier admission is capped at spawn
  time while preserving the full visible break burst as cheap VFX, and
  over-pressure rigid debris demotes to VFX before expiring anything.
- Current support target completed: temporary support-collider scans now
  prioritize sleeping, near-supported, falling, fast, and moving shards before
  calm unsupported airborne shards, still do a narrow lookdown for known
  rubble/partial support, and deduplicate repeated support-cell probes inside
  dense crater piles.
- Next validate fresh `debris-pressure` and WebGL diagnostic logs before
  deciding whether parked sleepers are worth the complexity.
- Do not revive partial-mesh draw caps or rigid-debris cadence throttling; both
  were playtested and parked because the visual/feel cost was not worth it.

## Rigid Sub-Voxel Damage Objects

- Current direction: loose block debris is VFX, while block HP and the sparse 3x3x3 partial-block bite lattice own durable terrain damage.
- Future experiment: let selected damaged sub-voxels promote into real rigid objects when that is the actual mechanic, instead of using generic debris bake-out as an accidental gameplay proxy.
- Keep this opt-in and local to impacted macro blocks. Do not activate the whole world as tiny rigid voxels.
- Useful first target: a heavily damaged bite cell or severed exposed chunk can detach as a rigid cuboid/shard, collide briefly, then either expire as VFX or intentionally become a placed terrain/cover object through a dedicated rule.
- Preserve material/HP accounting separately from visible shard count so graphics quality never changes gameplay value.

## Future Nova Chat Hook

- First local slice is in place: `Enter` opens Nova Chat, `NovaContextJournal` collects recent engine context, and `novaChat.ts` produces local context-aware replies without network calls.
- Add an optional live Nova chat path so the in-game companion can answer typed player questions with a real model response instead of only canned local reactions.
- Keep API credentials out of browser code. The safe shape is a tiny local/backend proxy for text chat, then a browser-safe short-lived token flow if we later move to realtime voice.
- Feed a real model the existing compact game context from the event bus journal: active world name/seed, selected block, quality preset, player speed/mode, recent block damage, rubble events, and frame hitches.
- Start with explicit player-initiated chat so token usage is controlled. Event-triggered autonomous commentary can stay canned or heavily rate-limited until the behavior is actually fun.
- Likely next implementation: local/backend proxy that streams Responses API text into the Nova chat log.
- Later stretch goal: Realtime API voice mode, if it still feels useful once the text version proves itself.

Official docs to re-check before implementation:
- Responses streaming: https://developers.openai.com/api/docs/guides/streaming
- Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Realtime client secrets: https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets

## Equipment And Items Iteration

- First foundation is in place: `src/items.ts` defines reusable item definitions, stack metadata, categories, tags, and primary/secondary action descriptors; `src/hotbar.ts` now selects item stacks instead of hard-coded behavior unions.
- Add explicit tool items so terrain destruction can be owned by selected blocks/tools instead of being a universal left-click behavior.
- Decide whether blocks, throwable cores, tools, and future weapons share one hotbar or split into equipment slots plus item inventory.
- Add an actual inventory/equipment container once item quantities, pickups, crafting, or weapon slots exist in gameplay.
