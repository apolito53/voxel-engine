# Wildlife

Birds are the first ambient wildlife slice. Faster formations cruise near the
clouds, with flapping wings, gliding, and banking turns. Solo birds fly lower
around the explored terrain and can land on tree canopies, rest, and take off.
They are lit, depth-tested world objects with no labels or interaction prompt.
The optional [friendly wanderers](friendly-npcs.md) are separate.

## Scope And Ownership

[birdWildlife.ts](../src/birdWildlife.ts) owns pure transient flock and flight
state. [birdSolo.ts](../src/birdSolo.ts) owns individual flight and tree-perch
transitions. [birdWildlifeRenderer.ts](../src/birdWildlifeRenderer.ts) owns the shared
instanced bird geometry, materials, pose upload, and disposal. The population
is capped at two flocks of six plus three solo birds. It does not add terrain
streaming, persistence, combat, nesting, or bird audio.

Formations fly around 130–140m, just below the cloud base at 144m, with a
19m/s cruise target and 24m/s cap. Solo birds target 22m/s with a 30m/s cap.
These targets and caps doubled in `v0.24.1`. Flight builds speed gradually
after placement, recovery, and takeoff; controlled tree approach and descent
remain slower. Turning and obstacle avoidance can reduce actual speed.
Positive speed changes are bounded to 6m/s² for formations and 8m/s² for solos,
including avoidance movement. The formations' atmospheric fade is independent
of the short terrain fog wall so they remain
visible overhead on low graphics presets. Near solo birds retain normal
terrain fog. Neither role expands the terrain stream or camera range.

High flocks make one-way passes through the sky. Each pass fixes its ingress,
direction, closest point, and exit in world space. Birds arrive from beyond
view, cross overhead, and continue out of view before a quiet interval and
another pass. The first approaches from the initial view direction; the second
is staggered. Player movement does not steer an active pass. The old short
habitat routes still read as orbiting at the faster flight speed, so these
formations now travel across the sky instead of turning back locally.

Initial ingress is about 420m away, fading into view between 380m and 300m.
The second formation starts 22 seconds later. Later passes vary their bearing
only while hidden, with roughly 14–30 seconds of quiet between visits from a
slot. Sky birds render at 1.65 times the lower birds' scale so individual wing
silhouettes remain legible in a grounded view.

Solo birds retain their own destination routes within fixed world habitats,
including tree visits. Nearby player movement does not retarget their flight;
distant travel determines when lower populations can be replaced near newly
explored terrain.

[main.ts](../src/main.ts) adapts the loaded terrain, seeds birds after world
hydration and player restoration, and clears them on world switch or exit.
Simulation advances only during active visible play. Pause, hidden tabs, and
idle hibernation do not accumulate flight catch-up time. The renderer releases
its owned resources on runtime disposal.

## Terrain Boundary

The lower-bird world seam combines collision boxes, a loaded-column predicate,
and a cheap column-top surface query. The surface query returns `null` for a
loaded void column; missing chunks remain a separate boundary. Full and
surviving partial collision boxes own obstacle truth. Solo flight cannot
generate chunks or use debris as durable terrain.

High formations stay entirely above the finite terrain ceiling. Their sky
passes do not query or require the terrain columns underneath them, allowing
ingress beyond the terrain stream without requesting chunks or changing view
distance. The rendered birds still use scene depth, so terrain and clouds can
occlude them naturally. Their maintained altitude must stay above the world
height and full animated wing clearance.

[birdWildlifeCollision.ts](../src/birdWildlifeCollision.ts) separates the
extended-wing flight clearance from compact landing/rest/takeoff clearance.
The final descent and lift are swept movements, and both feet must retain
support on the live tree surface. A perched bird reacts when that support or
its body clearance changes.

The [tree-perch adapter](../src/birdTreePerches.ts) queries only a loaded
column's top leaf/wood cell. Full blocks provide their upper face; partial
cells provide a surviving top with enough area for the feet. Terrain and
clearance are checked again during approach, rest, and takeoff. Treeless areas
keep solo birds in flight. Tree-like leaf/wood construction can also be used;
the first slice does not distinguish authored foliage from generated trees.

Flight and obstacle work stay bounded to the nearby population. Changes to
terrain are rechecked during play; birds that cannot safely occupy an area
must recover without flying through solid geometry. Distant formations use
their atmospheric haze and solo birds use terrain fog.

Sky ingress and exit use actual alpha fading to zero. A pass continues straight
while its birds remain visible to the current observer, even beyond its nominal
exit. A new pass starts only during an invisible interval; looking around or
moving nearby cannot turn an existing flock toward the player. Low birds keep
their loaded-air recovery and swept collision boundary.

## Verification

Run `npm.cmd run test:wildlife` and typechecking. The
[testing map](testing.md) describes adjacent terrain and lifecycle checks.
The [pilot bridge](automation.md#codex-pilot-bridge) exposes snapshots and
clear/reseed fixture controls for a browser pass.

Browser checks cover recognizable faster flight, cloud-height formations,
solo canopy approach/rest/takeoff, wing motion/gliding and banking,
terrain and atmospheric fog integration, pause/resume, player travel, world switching, and
teardown. Pure tests exercise deterministic bounds, varied routes and nearby
player independence, obstacles, loaded edges and recovery, terrain edits,
delta limits, and reset. This initial ambient layer does not
establish a simulated ecosystem or migration behavior.
