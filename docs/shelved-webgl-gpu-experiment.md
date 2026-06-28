# Shelved WebGL GPU Experiment

Status: shelved on 2026-06-28.

Branch: `experiment/gpu-ripple-field`

Last useful branch state: `9dbcbae` (`Batch debris support wakes quietly`)

This branch proved useful renderer seams, but it has outlived its purpose. Main
has moved far ahead in gameplay, terrain, traversal, lighting, audio, and world
height work. Reviving this branch directly would now cost more than starting the
next GPU architecture pass from current `main`.

## What This Branch Proved

- A hard simulation/render boundary is worth keeping. The
  `RenderBackend`/`WebGlRenderBackend` split made it clearer which systems own
  gameplay truth and which systems own presentation.
- Compact face records are a better terrain transfer shape than expanded
  position/normal/color/index buffers. The WebGL2 terrain path moved normal
  chunk terrain toward instanced greedy faces and reduced upload pressure.
- Renderer-owned terrain diagnostics are valuable. GPU adapter info, timer-query
  support, terrain face counts, upload bytes, and renderer stats made it much
  easier to tell whether work actually reached the GPU.
- Partial terrain should stay CPU-authored gameplay truth, but renderer-owned
  presentation is the right boundary. The first branch slice only wrapped the
  regional mesh field; a future backend can replace the internals without
  changing world/damage orchestration.
- Debris needs a data-oriented split. CPU/Rapier should keep the few pieces that
  matter for collision and gameplay; high-count visual debris should be emitted
  as compact render events or particles.
- WebGL2 is awkward for a radical debris/VFX overhaul. It can render instanced
  buffers well, but GPU-owned simulation, particle update, and richer material
  behavior are better suited to a fresh WebGPU design.

## What Not To Carry Forward Blindly

- Do not merge this branch wholesale into modern `main`. It diverged before the
  96m world, traversal/clamber work, audio, local lights, floating islands,
  horizon matte/fog floor, and later lighting fixes.
- Do not preserve WebGL2 terrain code as sacred. It was a useful proof of shape,
  not the final renderer.
- Do not let renderer code become gameplay truth. Saves, block damage, collision,
  support checks, and authoritative world state still need explicit CPU-side data
  models unless a future WebGPU simulation design replaces that architecture
  deliberately.
- Do not optimize debris by making every visible shard a full physics body. The
  better design is material-aware debris lanes: gameplay chunks, visual shards,
  and GPU particle clouds.

## Future WebGPU Direction

Start a new branch from current `main`, likely named something like
`experiment/webgpu-overhaul`, and treat this branch as reference material only.

The next serious GPU pass should design around WebGPU from the start:

- `SimulationRuntime` remains the gameplay authority until a GPU simulation
  architecture is explicitly designed.
- `RenderBackend` becomes a backend-neutral contract shaped for WebGPU command
  encoding, persistent buffers, and explicit disposal.
- Terrain pages use compact GPU buffers, chunk/page visibility, and renderer-owned
  fog/horizon policy.
- Visual debris uses material profiles. Leaves, sand, stone, and wood should
  produce different particle/shard lanes with different drag, wind coupling,
  lifetime, spin, and collision importance.
- Fine debris such as sand should become volumetric particle/sprite/cloud work,
  not thousands of CPU physics toys.
- Important debris remains CPU/Rapier-backed only when it affects gameplay,
  collision, cover, or player interaction.
- Post effects such as bloom should arrive after renderer-owned VFX exists, so
  glow is intentional instead of a blanket terrain filter.

## Useful Files To Revisit

- `src/renderBackend.ts`
- `src/webGlRenderBackend.ts`
- `src/gpuTerrainRenderer.ts`
- `src/gpuPartialTerrainRenderer.ts`
- `src/chunkProtocol.ts`
- `src/chunkJobs.ts`
- `src/physicsInstancing.ts`
- `src/debrisSupportInvalidation.ts`
- `src/debugHud.ts`

Those files are historical references now, not migration targets by default.
