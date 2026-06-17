# Destruction, Debris, And Rubble

This page describes the current gameplay contract for terrain damage. Durable
terrain state is owned by partial-block damage. Loose debris is visual feedback.

## Terrain Damage

Terrain HP is material-specific, using compact toughness values as the authored
source: Leaves 3, Sand 5, Grass 6, Dirt 8, Ember 10, Wood 12, Stone 16, and
Rubble 4. Runtime terrain HP scales those values onto the shared `3x3x3`
sub-cell lattice: a full macro block is old HP times `270`, and one Terraformer
sub-cell is old HP times `10`.

The Terraformer is an editor tool, not a weapon: it targets exact highlighted
sub-cells and spends exactly the remaining HP for those cells. Its cubic brush
stays centered on the reticle across the two tangent axes, but grows inward
along the targeted face normal so larger brush sizes carve depth instead of
spilling out into air. Physics Core and Hitscan Core still damage terrain
through the core impact path, with terrain impact damage scaled from `1` to
`270` so their practical hits-to-break feel matches the old compact-HP model.

Core impacts above 2 m/s carve one health step by removing hidden cells from a
3x3x3 bite lattice inside the macro block. That lattice is presentation and
targeting resolution, not a global tiny-voxel world.

The visible fill tracks remaining HP against that material's max health. Removed
bite cells persist and grow through face-adjacent neighbors, so later hits cannot
visually refill older damage or create isolated disconnected holes.

Damage is applied through a sparse brush:

- Centered hits usually touch only the struck macro block.
- Seam and corner hits can promote only overlapped neighboring macro blocks into
  their own partial bite lattices.
- One impact damage/material budget is shared across touched macro blocks by
  overlap.
- Affected sub-voxels stay face-adjacent in world space so seams do not produce
  disconnected damage islands.

Chipped cells stay full-cube for player collision and raycast until the block
breaks, but projectile and hitscan cores collide against the remaining
bite-lattice material. Shots can pass through visual tunnels while still hitting
visible partial material in front.

Final fractures release only the block material still left inside, clear the
bite mesh, and leave air instead of stamping the old wrinkled surface puddle.
Carved shapes are not persisted to saves yet; leaving the active world clears
partial-block state.

## Projectile And Hitscan Cores

Terraformer owns precision manual terrain editing. Placeable block items are
build controls: left click erases the targeted block brush, and right click
places the selected block brush.

Physics Core:

- Throws a swept projectile from the lowered right-side muzzle.
- Uses the configured projectile core size and velocity.
- Uses the configured core hue and optional short projectile trail from Gameplay settings.
- Uses the configured bounce count from Gameplay settings. Each terrain impact
  that actually damages terrain spends one bounce; at the default `1 bounce`,
  projectile cores keep the old one-hit self-destruct behavior. Surviving
  terrain-damaging rebounds lose projectile speed so repeated impacts read as
  spent energy instead of a free infinite ricochet.
- Holding right click uses centered reticle ADS with a slight 15% zoom.
- Small fast cores can pierce through a complete bite-lattice tunnel when the
  exit cell is air, then continue with reduced speed.

Hitscan Core:

- Fires an instant 10%-radius, 500%-speed core trace.
- Uses the same partial-block bite and piercing rules as projectile cores.
- Uses the configured core hue for the short additive beam flash.
- Repeats tunnel continuation instantly along the trace.
- Clears loose debris VFX along the beam without blocking terrain drilling.
- Draws a short additive energy-beam flash along the shot line.

Core radius and impact trajectory rank bite cells. Tiny cores drill narrow
lattice columns. Larger cores chew broader connected face footprints before
reaching deeper cells.

## Core Aim Preview

`F6` toggles Core Aim Preview:

- Physics Core draws a dotted ballistic arc.
- Hitscan Core draws a straight dotted beam.
- Both show the predicted impact ring and 3x3x3 bite cells for the next terrain
  hit.
- Visible cells draw bright white; hidden/far-side cells draw as a softer red
  ghost.

The preview is a debug aid, not durable gameplay state.

Thrown Physics Cores have a 20 second hard lifetime. Once a projectile stays
below useful terrain-damage speed, it starts a short fade/despawn countdown so
old spent shots stop accumulating as physics objects. Projectile cores do not
consume the loose-debris body budget; they have a separate active-core safety
cap so debris cleanup cannot silently delete freshly fired gameplay shots.

## Debris VFX

Loose block debris is temporary VFX in the normal runtime.

Visible low-poly shards burst apart as smaller Rapier cuboids, collide against
each other, terrain, support colliders, and explicit collision boxes generated
from surviving partial-block lattice cells. They sleep while inside the
player-centered active debris bubble and can wake when hit by cores or active
shards.

Debris presentation is material-budgeted:

- Physics Core carving treats a full block as `1.0` normalized block-volume.
- Remaining material is derived from remaining HP.
- Material identity controls chip cadence, preferred debris shapes, and ejection
  feel, so leaves shred quickly, wood splinters, stone breaks into heavier
  angular pieces, and sand/rubble spray lower and softer.
- Each visible shard carries at most 70% of one 3x3x3 damage-lattice subvoxel's
  material.
- No visual axis can exceed 60% of a subvoxel edge.
- The sum of conservative visual shard volume stays within the material removed
  by the hit.

The `Break Burst Shards` slider is a visible shard ceiling for full-block
debris density and also scales ordinary chip bursts. It is not a promise that
every tiny hit spawns the full value.

Debris ejection prefers exposed bite openings or drilled tunnel exits so chips
spray out of wounds instead of filling them. Stale never-grounded floaters and
trapped tunnel/partial-block clutter force-poof after a grace window.

## Debris Budgets And Cleanup

The `Active Ground Debris Cap` and `Ground Debris Lifetime` settings govern
aftermath:

- Full bursts can exceed the ground cap while airborne.
- The ground cap only trims shards after they are supported or sleeping and have
  survived a short burst-grace window, so it controls how much loose clutter
  remains on the floor rather than how many pieces spray out of a break.
- Excess supported/sleeping debris is culled after it settles.
- Timed-out shards disappear in a material-tinted poof after first ground
  contact unless lifetime is set to `Forever`; the countdown pauses again if a
  shard is knocked airborne by later impacts or support changes.
- Distance and pressure cleanup can still remove shards even when lifetime is
  `Forever`.
- The rigid-body safety cap is enforced before Rapier admission. The full
  visible spray still appears, but overflow shards remain cheap VFX, and later
  pressure demotes rigid shards to VFX before expiring anything.
- The total toy-budget cleanup path prefers settled/sleeping debris first and
  protects awake airborne shards during normal pressure relief. Emergency
  airborne expiry is reserved for extreme over-budget cases and is surfaced in
  diagnostics.
- Extreme airborne bursts can still demote farthest active rigid shards once
  they exceed the separate rigid-body safety cap derived from the Physics Object
  Budget.
- Sustained sub-60 FPS with heavy debris pressure can temporarily lower the
  effective rigid-debris cap until frames recover.

Terrain damage, block placement/removal, builder/admin edits, rubble damage,
and rubble falling/promotion all route through an event-driven support
invalidation path. That path wakes a bounded local stack of Rapier-owned and
detached VFX debris above edited cells, plus glue-connected settler clumps that
are sleeping as one visible pile, so sleeping piles fall when their terrain or
rubble support changes without bringing back a broad per-frame support scan.

`Despawn All Objects` performs the full cleanup path and releases physics cores,
loose debris VFX, and any existing rubble cover.

## Parked Rubble Mechanics

`RubbleField` and the older material-preserving bake-out helpers remain parked
for experiments and tests. They include destructible cover patches, hidden
support footprints, baked shard visuals, scaled durability, core collision,
walkable partial-height support queries, fall/merge behavior, and promotion into
the generated `Rubble` block.

The active gameplay direction is partial-block terrain damage plus debris VFX,
not automatic settled rubble piles. Do not reintroduce automatic debris-to-rubble
bake-out unless that mechanic is deliberately revived.
