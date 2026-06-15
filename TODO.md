# TODO

Shortlist of ideas worth keeping visible without pretending they are committed scope yet.

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
- Current wake/cleanup target completed: terrain, builder/admin, and rubble
  support edits now wake bounded local stacks of sleeping Rapier debris,
  detached VFX debris, and glue-connected settler clumps, while normal pressure
  cleanup protects awake airborne shards instead of poofing them mid-flight.
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
