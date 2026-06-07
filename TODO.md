# TODO

Shortlist of ideas worth keeping visible without pretending they are committed scope yet.

## v0.10 Worker Migration Roadmap

- Current foundation: `WorkerPool` owns the shared job protocol shape with
  clamped capacity, ids, stale revision rejection, cancellation, sync fallback,
  transfer bookkeeping, and HUD/log telemetry.
- Next likely slice: extract partial-region geometry building into a pure
  sync-or-worker path that returns transferable typed mesh buffers while the
  main thread keeps Three.js `BufferGeometry` ownership.
- Then fold chunk generation/meshing into the shared pool without changing
  terrain semantics, chunk revision rejection, atlas UV/tile attributes, or
  near/fog priority.
- Later, decouple loose debris simulation state from Three proxy objects so
  rendering consumes plain arrays of transforms/material/shape ids instead of
  owning the simulation state.
- Only after that, prototype workerized loose-debris simulation with compact
  nearby-support snapshots. Keep player movement, core firing, terrain damage,
  gameplay decisions, SharedArrayBuffer, WASM threads, and OffscreenCanvas out
  of scope until the simpler worker pipeline proves its value.

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
