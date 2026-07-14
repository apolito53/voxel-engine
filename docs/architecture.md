# Engine Architecture

This document is the opt-in architecture layer behind
[CODEBASE_INDEX.md](../CODEBASE_INDEX.md). The index stays small enough to read
at the start of a task; this file preserves the deeper contracts needed for
cross-system work.

## Design Posture

The repository is a kitchen-sink proving ground. Mature systems should become
portable through small data and query boundaries, but the immediate goal is
clear ownership inside one application rather than premature package splitting.

The browser main thread owns input, UI, camera state, Three.js objects, final
buffer uploads, and gameplay decisions. Workers own pure CPU jobs that accept
structured-clone data and return typed arrays or compact derived state. Rapier
is isolated behind the debris adapter instead of becoming the engine-wide data
model.

## System Shape

```text
input / UI / browser lifecycle
             |
          main.ts
       /      |       \
 player   VoxelWorld   transient physics
   |       /   |   \          |
collision save jobs workers  Rapier adapter
              |      |
          IndexedDB typed buffers
                     |
              Three.js upload/render
```

`main.ts` is intentionally the integration boundary, but reusable rules should
live in focused modules. A new feature should usually add a pure owner plus a
small orchestration hook instead of another large inline branch in the frame
loop.

## World, Chunks, And Streaming

`VoxelWorld` owns loaded chunks, chunk revisions, dirty and modified indexes,
saved-chunk lookup, partial-cell masks, block-light caches, worker scheduling,
and coalesced storage writes. `Chunk` owns block bytes, top-column caching, and
the Three.js mesh upload/disposal surface.

The visible radius is intentionally not the loaded radius. The player sees a
short opaque fog wall while a farther radial horizon stays loaded behind it.
Chunks past the wall plus one safety ring stop drawing but remain available for
continuity. Generation, result application, and dirty meshing are bounded and
prioritized toward nearby in-frustum work.

Changing this system requires preserving five separate concepts:

- clear distance where the fog wall begins;
- `fogFar`, where the wall becomes opaque;
- render radius for loaded meshes;
- stream radius for hidden continuity;
- the render-only horizon matte used by non-floating worlds.

Queue windows are cached while the player remains in one chunk. Any path that
clears pending work or directly creates/removes chunks must invalidate the
appropriate queue/unload state and maintain dirty/modified indexes.

## Workers And Mesh Upload

`WorkerPool` provides priority lanes, bounded worker count, job IDs, revision
staleness checks, cancellation, transfer accounting, telemetry, and sync
fallback. Normal runtime jobs include chunk generation, greedy chunk meshing,
partial-region meshing, and derived block-light construction.

Workers never receive Three.js objects, DOM state, IndexedDB handles, or live
gameplay owners. Job modules operate on cloned snapshots and return typed
buffers. The main thread validates the revision, constructs or updates
`BufferGeometry`, and owns disposal.

Worker and fallback paths must remain behaviorally identical. Mesh protocol
changes normally require coordinated updates to the protocol types, pure job,
engine worker router, fallback builder, upload owner, and regression tests.

## Terrain Truth And Partial Damage

Full voxels remain the storage and generation unit. Damage promotes only
impacted macro blocks into sparse 3x3x3 lattices. HP and the surviving lattice
are authoritative; debris is presentation.

`VoxelWorld.carveBlock` is the single-block primitive.
`VoxelWorld.carveBlockBrush` finds nearby overlapping macro blocks, distributes
one shared damage/material budget, and applies the primitive to each accepted
target. The selection rules keep removed cells face-connected across the world
footprint and monotonic over repeated hits.

A damaged block deliberately has split queries:

- `isSolid` keeps it part of durable terrain while material remains;
- `isRenderableSolid` suppresses the old full cube;
- `getCellCollisionBoxes` exposes surviving lattice collision;
- partial mesh regions draw the custom faceted geometry;
- projectile queries test remaining lattice material and open tunnels.

Partial meshes are grouped into bounded regions with halo context. Repeated
damage can dirty only the custom region, while transitions into or out of the
partial state also dirty the owning chunk and relevant edge neighbors. Old
partial geometry may remain briefly as a bridge until replacement chunk meshes
and required light caches are current.

Saved chunk snapshots contain full block bytes plus optional partial cells.
Hydration must restore HP, lattice state, sparse masks, and visual dirtiness
before remeshing. Fully destroyed cells save as air without stale partial data.

## Collision And Traversal

`CollisionWorld` is shared by the player and cheap debris. Full blocks use
voxel solidity; damaged blocks expose explicit surviving lattice boxes; rubble
experiments can expose partial support height.

Player movement owns walking, sprinting, crouching, sliding, flight, low partial
steps, sprint vaults, jump-held clambers, and falling edge grabs. Movement code
should depend on collision/support queries and tuning values rather than chunk
storage or render meshes.

Ground movement uses a yaw-only forward basis. During flight, forward/backward
movement follows the physical eye's pitch for climb and dive control, while
strafe remains level and `Space`/`C` add explicit vertical correction. The
planned momentum pass may change how quickly velocity turns toward that wish
direction, but camera orientation must remain intent rather than velocity truth.

The `PlayerController` camera remains the physical eye and authoritative source
for movement orientation, saves, tool reach, and targeting. `PlayerViewController`
may select a separate collision-aware third-person render camera, while
`PlayerAvatar` mirrors player state for presentation. Rendering, frustum
culling, sky, fog, and screen-space damage indicators follow the selected render
camera; world streaming and gameplay queries continue to follow the physical
eye. Avatar flight tilt derives from actual 3D velocity and rotates a centered
presentation pivot; it must not become collision, movement, or camera truth.
Keep that boundary intact when physical flight changes orientation.

Visual geometry and collision must tell the same story. When a partial mesh or
support rule changes, test narrow shafts, one-subcell stairs, cross-block seams,
ledges, and the transition between step, vault, and clamber bands.

## Cores, Debris, And Rubble

`physics.ts` owns transient projectile cores and fragment state. Swept sphere
and hitscan paths test the first remaining partial-lattice material so tiny fast
cores cannot skip visible pieces. A core may pierce only after the primary carve
result reports a complete open tunnel and an air exit.

Fragment shape, scale, and count are visual choices bounded by the material
volume removed from terrain. `RigidDebrisSimulation` admits a capped subset to
Rapier cuboid bodies inside the active bubble. Overflow remains visible through
the cheap VFX path. `PhysicsFragmentInstancer` renders both paths in shared
block-and-shape batches.

Sleeping debris is wakeable. Terrain and support edits publish bounded local
invalidation so Rapier bodies, settler-owned clumps, and detached VFX fragments
above changed support can resume without a global scan. Cleanup protects fresh
airborne bursts, prefers settled debris under pressure, and exposes emergency
airborne expiry in diagnostics.

Automatic debris-to-rubble conversion is parked. `RubbleField` remains useful
for isolated cover, support, damage, fall, merge, and promotion experiments, but
normal debris cleanup must not silently revive durable rubble piles.

## Lighting And Sky

Terrain lighting has several layers with different costs:

- baked face and sealed-cavity shading supplies the cheap ambient baseline;
- procedural day/night uniforms alter outdoor exposure, fog, and sky;
- Lamp material emission keeps every fixture visibly bright;
- worker-derived integer block light illuminates terrain and partial cavities;
- a quality-scaled nearest PointLight pool adds smooth local highlights.

Block-light arrays are derived caches, not saved world truth. Lamp or opaque
terrain edits dirty affected light bounds. Chunk meshes consume accepted light
buffers, while partial regions clone the relevant cached light and derive local
cavity transfer through visible apertures. Stale light jobs must not overwrite
newer terrain revisions, and a dirty cache should not cause a zero-lit flash.

The PointLight layer is intentionally secondary. Quality budgets range from no
proxies on Potato to a bounded high-quality pool; overflow Lamps remain backed
by emissive material and block light. Keep allocated high-water objects reusable
to avoid shader-variant churn during ordinary edits.

## Items, Inventory, And Persistence

`items.ts` defines stable item IDs, stack metadata, tags, and primary/secondary
action descriptors. New gameplay tools extend those contracts and add focused
dispatch rather than reintroducing hard-coded hotbar-kind checks.

`inventory.ts` owns pure fixed-slot container operations and normalized saved
state. `hotbar.ts` presents independent Items and Blocks lanes. The current
catalog is creative and unlimited; the finite 18-slot Backpack is persistent
groundwork for later pickup/drop gameplay.

Inventory state is stored in existing world metadata without an IndexedDB
schema bump. Persist stable IDs rather than registry positions, reject unknown
or virtual items from finite containers, and normalize malformed quantities.
The latest-snapshot save coalescer must flush before changing world identity or
disposing the runtime.

Edited chunks are full snapshots rather than a final compact save format.
Terrain-profile provenance prevents old edited chunks from bordering a new
generator. Legacy 48m varied worlds retain their block/player lift migration.

## Diagnostics And Testing

F3 diagnostics expose frame buckets, browser RAF gaps, renderer pressure,
streaming state, worker queues, partial-region/subvoxel pressure, debris phases,
lighting pressure, day/night state, and persistent combat-log status.

Local hitch logs are pass-versioned. A useful investigation starts with a fresh
pass, a repeatable scene, and the current server marker. Renderer-led frames,
worker saturation, long tasks, RAF gaps, and physics pressure are different
failure classes and should not be blended into one vague performance diagnosis.

Use unit tests for pure contracts and `npm.cmd run validate` for shared changes.
Use Chrome for pointer lock, raw first-person input, and gameplay feel. The
in-app browser is appropriate for DOM and basic visual smoke checks only.

## Bolt-On Direction

The most portable current seams are:

- player control behind `CollisionWorld` and movement tuning;
- pure inventory containers and item action definitions;
- builder/admin brushes behind world get/set and target queries;
- typed engine events and feedback consumers;
- browser-native worker jobs returning typed buffers;
- procedural audio behind typed engine events and simple settings;
- Nova Pilot/Terminal behind world context and command hooks.

The base voxel world is still the hardest extraction target because streaming,
storage, meshing, lighting, and the frame loop are closely coordinated. Improve
those interfaces incrementally when a real second game needs them; do not split
packages merely to make the folder tree look ambitious.

## Parked Decisions

- Do not restore the reverted partial-mesh draw cap as a generic optimization;
  durable damaged terrain should not disappear because a render budget filled.
- Do not restore reduced rigid-debris solve cadence; it visibly damaged motion.
  Reduce body count, support work, or gameplay ownership instead.
- `ImpactCraterField` is a parked surface-scar prototype and is not terrain.
- The draped rubble-sheet renderer and automatic rubble bake-out remain parked.
- The old WebGL2 GPU experiment is reference material only. A future renderer
  overhaul starts from current `main` and the WebGPU plan.
- Nova Terminal remains local-only until a backend proxy owns model credentials.
