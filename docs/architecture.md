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
- the live DirectionalLight supplies solar direction and direct shadows;
- procedural day/night uniforms alter outdoor exposure, fog, and sky;
- Lamp material emission keeps every fixture visibly bright;
- worker-derived integer block light illuminates terrain and partial cavities;
- a quality-scaled nearest PointLight pool adds smooth local highlights.

`skybox.ts` owns the far-depth procedural atmosphere, directional twilight,
celestial disks, and stars. Its shared atmosphere shader also supplies the
distant color for `cloudLayer.ts`; clouds do not consume terrain fog. The shared
atmosphere converges to the actual world fog color at the true horizon, lifting
directional twilight above that seam so the existing fog wall stays continuous.
The sky dome writes at the clip-space far plane, independently of its small
physical sphere radius. `lighting.ts` owns the established fixed-azimuth solar
orbit: elevation follows the saved world clock, preserving the roughly
40-degree noon calibration. `main.ts` computes one unit direction and supplies
it to the visible sun/moon, actual DirectionalLight, cloud shading, current
shadow basis, and debug guides. Anchor translation and depth extension never
change that vector. Direct sunlight fades near the true horizon and is zero
below it; the existing hemisphere/outdoor exposure handles night. Baked terrain
face colors retain only neutral ambient, upward sky fill and underside darkness;
sealed/cut shading, Lamp emission and block light keep their separate contracts.
Clock updates do not schedule chunk or partial-terrain mesh jobs.

`sunGlare.ts` owns the optional camera optical effect. The existing scene draws
directly to the canvas with its original antialiasing and color conventions;
the procedural sky/cloud shaders already author display RGB, whereas standard
materials own their output conversion. Glare therefore screen-blends a warm
halo, veil, and narrow horizontal streak over that finished image without a
full-scene color target, HDR/tone-mapping change, or second output conversion.
DOM menus and HUD remain outside the effect. Its projection consumes the same
live unit solar vector and camera projection as the disk, with alignment,
frame-edge, true-horizon, daylight, and world-activity gates. Golden-hour
twilight/solar elevation warms the optical contribution. The effect does not
change world light, shadows, terrain streaming, or worker jobs.

Default-on Glare Occlusion renders the real scene/materials into a fixed
32x32 target cropped around the angular disk. The query camera keeps the main
camera's exact world/view transforms, near/far planes, and cloud-distance
origin; only its projection changes. Standard and partial terrain, instanced
debris, solid objects, alpha-tested surfaces, and opaque cloud banks retain
their actual depth/discard behavior. The sky writes no depth, so clear depth
1 marks exposed disk rays. Intentional `depthWrite=false` guides, glows,
poofs, beams, previews, and the horizon matte are non-solid and do not occlude.

A one-pixel GPU reduction weights 256 depth samples over the actual angular
disk, then two byte targets smooth partial exposure without CPU readback.
Completely blocked disks extinguish every glare component immediately; byte
history snaps near its target to avoid a permanent quantized leak. World
changes, teleports, large projected solar/camera jumps, and toggle changes
invalidate history. Explicit Codex Pilot diagnostics may read that one pixel;
ordinary frames never do. The small target bounds fragment work and storage,
but the extra scene traversal and submitted vertices still cost CPU/GPU work,
especially for uncullable cloud/debris instance batches. Renderer counters
retain the original main-scene/shadow-reset baseline, then accumulate query,
reduction, and overlay so F3/logs report the actual additional work consistently.

Disabling occlusion releases/skips its depth and history targets while keeping
the optical overlay; strength zero releases all effect-owned resources and
uses the original single-render path. Tiny target dimensions stay fixed over
resize/DPR/quality changes, while crop and optical aspect use the live camera
and drawing buffer. Renderer target, viewport/scissor, clear policy, shadow
update flags, and counter ownership restore through `finally`; the extra view
never updates shadow maps. HMR/unload releases owned geometry/materials/targets,
context restoration recreates them lazily, and a failed supplemental pass
falls back to the existing scene renderer and emits one bounded diagnostic
through the existing local collector. Normal scene errors keep their
existing reporting path. Controls/persistence live with quality settings;
Normal and higher use 100%, Low 65%, Potato Off, with occlusion defaulting on.

`CloudLayer` owns render-only, opaque stepped voxel banks at a fixed world
base of 144m, reaching at most 156m. A deterministic periodic 1024m field emits
only exposed faces, including across tile seams. Up to nine instances of that
shared geometry cover the camera's horizontal neighborhood in one draw call;
tile exchange occurs beyond the independent cloud fade. Recentring changes
which periodic copies draw, never their world placement or altitude. Potato,
Low, and Normal-or-higher cloud horizons are 520m, 680m, and 920m respectively.
The opaque material keeps correct face/terrain depth ordering from below,
inside, or above banks, while the distant edge blends into the same sky haze.

Cloud wind advances from clamped active, unpaused, visible frame deltas,
independently of world time. Clock edits change cloud lighting and shadow
projection without changing its transforms or wind; hidden frames,
pause, and existing idle hibernation do not accumulate catch-up drift. Cloud
wind is transient presentation, reset on world entry/exit and excluded from
saved-world metadata. The reused runtime owns cloud geometry, visible/depth
materials, and instance-buffer disposal on HMR/unload. Clouds have no collision,
picking, or voxel-light role.

Cloud shadows reuse the one existing directional sun map and the cloud mesh's
real moving instance transforms. `shadows.ts` gates cloud depth coverage by
the separately saved Cloud Shadows preference, global shadows, daylight, and
the finite cloud horizon.
Normal and higher default on; Potato/Low default off. The Custom checkbox
preference survives global shadows being off. Off/low-sun/night set `castShadow=false`,
omitting the cloud depth draw without removing visible clouds or their wind.
The owned `MeshDepthMaterial` preserves Three's standard instanced projection
and reads the resulting instance world position. Its distance discard shares
the visible shader's cloud horizon and an explicit main-camera position uniform
(the shadow camera's built-in position would be wrong). Invisible cloud copies
beyond that horizon cannot cast. Daytime patch interiors use full depth
coverage for pronounced shade, while
stable ordered coverage softens daylight/edge fades through the existing PCF filter.
Cloud depth coverage fades radially through the map's outer 35%, preventing a
hard square footprint without changing terrain receiver shaders. Clouds do not
receive shadows. Lamp emission, local PointLight spill, and block light remain
independent of the directional map.

`getDirectionalShadowDepthRange` first fits the finite rendered terrain cylinder
(`renderRadius + 2` chunk-edge/snap allowance, height `0..WORLD_HEIGHT`) using
dot-product bounds along the current sun. Its near-side light extension keeps
sunward hill casters ahead of the camera; its far fit keeps opposite receivers
covered even on Custom Potato/Low with cloud casting off. This terrain fit stays
finite at the horizon and preserves the original preset depth interval.

While clouds cast, the helper extends the light farther along that same vector
until both cloud planes fit across every tilted orthographic corner. Far grows
by the exact added light displacement so terrain range is preserved. Before
using that slanted-plane division, `getCloudShadowMinSunHeight` reserves the
largest eye-to-cloud-plane height gap, perpendicular map-corner reach, and a
small texel/snap margin inside the actual cloud-view sphere. The remaining
horizontal reach sets a conservative minimum solar Y; coverage fades over the
next `0.04` Y. On Normal at ground level this is about 15 degrees to 17.5
degrees, with stricter bounds for short cloud horizons or high flight. Unsupported
low sun uses the finite terrain-only fit and performs no cloud casts or guide
queries, without clamping the solar vector. Orthographic XY bounds, map
resolution, texel snapping in the current basis, and terrain streaming retain
their existing roles. This adds one instanced depth draw and some caster
rasterization, with no second shadow map or streamed terrain.

`cloudShadowDebug.ts` owns the optional Cloud Shadow Guides diagnostic, separate
from graphics-quality state. It identifies four-connected banks on the toroidal
64x64 cloud field and reads `CloudLayer.getDebugState()` for the actual wind and
visibility. Matching bank colors link exposed cloud edges, one representative
live-sun connector, and sparse full/partial-terrain contact crosses. It uses
the real snapped shadow anchor, current light basis, near/far range, radial fade,
and the same daylight/elevation/shadow gates. Low sun outside the supported
cloud horizon is reported separately from a genuinely below-horizon sun.

Contact sampling is local and bounded to three banks / 128 cloud-column rays
per refresh, with 96 additional terrain rays for fade/edge rings. Refreshes run
at most four times per second during ordinary motion, with immediate rebuilds
on enable, world switch, teleport, wrap, substantial clock/direction jumps, or
shadow-range changes. Small per-frame solar/depth updates retain the bounded
cadence. First-hit queries reuse `VoxelWorld.raycastTerraformerTarget`, preserving partial geometry;
chunk-grid traversal rejects paths through unloaded terrain below world height
instead of treating missing chunks as proven clear sky. Void/missing/depth-clipped
samples produce no fabricated ground contact. This is geometric sampling, not
pixel-exact shadow ownership or a second renderer/shadow map.

The diagnostic caches bank topology/colors and reuses bounded DynamicDraw
geometry buffers. Its lines ignore terrain fog to remain visible at cloud
distances, while depth testing preserves terrain/cloud occlusion.
Turning it off skips update-state allocation, terrain queries,
and all helper draws. World entry/exit clears stale guides; runtime disposal
releases the owned buffers/materials/overlay and detaches the group. The pilot
inspection route is documented in [automation](automation.md#codex-pilot-bridge).

`qualityPresets.ts` gives every preset an independent 1800m atmosphere camera
far floor. Effective Custom settings preserve that floor through their base
preset. Keep it larger than the cloud fade, and keep the fade shorter than a
cloud tile so replacement copies stay invisible. This projection allowance
does not alter terrain fog or chunk render/stream/unload radii. The independent
cloud-shadow depth extension above is unrelated to atmosphere camera clipping.

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

## Friendly NPCs

The [friendly NPC system](friendly-npcs.md) is a small main-thread gameplay
owner. Its pure navigation consumes `CollisionWorld` and an explicit loaded
column check; its per-visit simulation owns roster, local roaming, perception,
and greetings. Rendering and the interaction overlay have separate lifecycle
ownership. `main.ts` adapts the active world and controls entry, pause, switch,
exit, and disposal.

Keep NPC queries local and bounded, including surviving partial boxes for
support and body clearance. Missing chunks are a navigation boundary. NPCs
cannot request generation or borrow debris/Rapier state as terrain truth.
The first population is transient and now opt-in under Debug, defaulting off;
persistence, combat, jobs, and long-range navigation remain outside this
initial contract. The preference is browser state, not world metadata.

## Bird Wildlife

[Bird wildlife](wildlife.md) keeps bounded pure flock/flight state separate from
instanced scene presentation. Loaded column/top-surface queries guide nearby
flight; surviving full/partial terrain boxes govern collision and tree-perch
support. Cloud-height formations use independent atmospheric haze while low
solo birds retain terrain fog. Birds do not
request chunks, attach themselves to the camera/sky, or expand the view range.
The main runtime owns world entry, pause, switch/exit, and disposal. This is a
transient ambient population, with no save or terrain mutations.

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
