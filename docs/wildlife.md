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

Formations fly around 130–140m, just below the cloud base at 144m, cruising
around 9.5m/s with a 12m/s cap. Solo birds can reach 15m/s. The formations'
atmospheric fade is independent of the short terrain fog wall so they remain
visible overhead on low graphics presets. Near solo birds retain normal
terrain fog. Neither role expands the terrain stream or camera range.

Birds choose destinations within a fixed world-space habitat. Routes connect
those destinations, with shared formation movement for flocks and separate
paths for solo birds. Habitat and route targets do not follow normal player
movement. Player travel only determines when distant populations can be
replaced near newly explored terrain. The old repeating circles around the
entry area were removed in `v0.23.1` because they looked like birds orbiting
the player.

[main.ts](../src/main.ts) adapts the loaded terrain, seeds birds after world
hydration and player restoration, and clears them on world switch or exit.
Simulation advances only during active visible play. Pause, hidden tabs, and
idle hibernation do not accumulate flight catch-up time. The renderer releases
its owned resources on runtime disposal.

## Terrain Boundary

The world seam combines collision boxes, a loaded-column predicate, and a
cheap column-top surface query. The surface query returns `null` for a loaded
void column; missing chunks remain a separate boundary. Full and surviving
partial collision boxes own obstacle truth. NPC flight cannot generate chunks
or use debris as durable terrain.

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

A flock's invisible route leader also revalidates its air. An unavailable
initial position or unloaded route retries fixed world points at a bounded
cadence, then resumes from safe loaded space. Visible members retain swept
movement; hidden members use the existing recovery fade. A very small loaded
footprint can hold a formation until there is room for its next route leg.

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
