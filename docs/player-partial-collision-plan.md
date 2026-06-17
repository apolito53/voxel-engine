# Player Collision With Cross-Block Partial Holes Plan

## Problem statement

The player controller currently treats ordinary voxel collision and partial-height
support as separate queries. Full blocks are checked by sampling macro cells in
`PlayerController.collides()`, while partial-height terrain uses
`CollisionWorld.getSupportHeight()` during snap-down and step-up handling. That
separation is useful, but the TODO notes a false support case: a shaft assembled
from removed sub-voxels across two or more neighboring blocks can be wide enough
for the player capsule footprint, yet still hold the player up because support is
reasoned about one main block at a time instead of over the combined aperture
under the player.

The fix should make support and collision decisions footprint-aware across the
same sparse 3x3x3 partial-block lattice that terrain damage already uses. For
design purposes, treat the player as one main block wide (3 sub-blocks) and two
main blocks tall (6 sub-blocks) while standing. The player should fall through a
vertical Y-direction shaft only when the connected opening is at least 3
contiguous sub-blocks wide across the footprint, should pass through a standing
horizontal X-direction opening only when there is at least 6 contiguous
sub-blocks of vertical clearance, and should remain supported or blocked when the
opening is smaller than those active-stance dimensions. Leave room for a future
crawl stance that deliberately lowers the horizontal-passage clearance threshold
to 1 sub-block tall without weakening standing collision.

## Current-code research map

1. **Player hull dimensions and movement flow**
   - `PLAYER_RADIUS`, `PLAYER_HEIGHT`, and crouch height live in
     `src/playerMovement.ts`.
   - `PlayerController.update()` resolves movement one axis at a time and calls
     `moveAxis("y", ...)` after horizontal movement.
   - `PlayerController.getBounds()` converts the camera position into the active
     AABB used by collision and support checks.
   - `PlayerController.collides()` currently scans macro-block coordinates and
     returns true as soon as `world.isSolid(x, y, z)` is true.
   - `snapDownToPartialSupport()` and `stepUpOntoPartialSupport()` call
     `world.getSupportHeight(bounds)` after a non-colliding move.

2. **CollisionWorld contract**
   - `CollisionWorld` already exposes optional hooks for partial terrain:
     `isPartialBlock`, `getCellCollisionBoxes`, and `getSupportHeight`.
   - The player path only uses `isSolid()` and `getSupportHeight()` today; it
     does not use `getCellCollisionBoxes()` for damaged terrain occupancy.

3. **Partial-block collision data**
   - `createPartialBlockCollisionBoxes(cell)` converts remaining 3x3x3 lattice
     cells into merged collision boxes.
   - `getPartialBlockSupportHeight(cells, bounds)` is surface-height oriented
     and returns the maximum sampled partial surface under the queried bounds.
   - The TODO bug is likely not just a height problem: a maximum-height answer
     can be wrong if no connected support patch overlaps enough of the player's
     footprint.

4. **World adapter**
   - `VoxelWorld.getSupportHeight(bounds)` delegates directly to
     `getPartialBlockSupportHeight(this.partialBlocks.values(), bounds)`.
   - `VoxelWorld.getCellCollisionBoxes(x, y, z)` already exposes per-cell boxes
     from `createPartialBlockCollisionBoxes(cell)` and can be reused for the
     player without inventing a second partial occupancy representation.

5. **Existing tests to extend**
   - `tests/run.ts` already covers player movement tuning, world solidity,
     partial block collision boxes, partial support height, Terraformer sub-cell
     edits, and debris support behavior. Add regression tests near the existing
     partial-block and player-collision sections rather than introducing a new
     runner.

## Research tasks before editing behavior

1. **Reproduce the bug with a minimal deterministic fixture**
   - Build a test-only `CollisionWorld` containing two adjacent partial blocks
     below the player.
   - Use `PartialBlockCell.removedVisualCellIndexes` or a helper factory to make
     neighboring removed columns that combine into a shaft crossing the macro
     boundary.
   - Position a player AABB over a seam where the connected opening is at least
     3 contiguous sub-blocks wide and assert the current support query reports
     support even though the design rule says the player should fall.
   - Also create a narrower seam opening to preserve expected support.

2. **Apply the intended design dimensions in lattice coordinates**
   - Treat the player as exactly one main block wide for hole passability. Since
     the damage lattice is 3 cells per block and each sub-cell is one third of a
     block, a vertical Y-direction shaft must contain a connected opening at
     least 3 contiguous sub-blocks wide across the footprint before the player can
     fall through it.
   - Treat the standing player as exactly two main blocks tall for horizontal
     passability. A horizontal X-direction passage through damaged terrain must
     provide at least 6 contiguous sub-blocks of vertical clearance before the
     standing player can move through it without colliding.
   - Reserve a separate crawl-stance rule for later implementation: when crawling
     is active, a horizontal passage may be traversable with only 1 contiguous
     sub-block of vertical clearance. Do not bake the 6-sub-block standing
     threshold into helpers in a way that prevents adding this lower crawl
     threshold.
   - Keep `PLAYER_RADIUS`, `PLAYER_HEIGHT`, and future crawl-height constants as
     runtime AABB dimensions, but use stance-specific lattice thresholds as the
     terrain aperture requirements so passability remains stable if movement
     tuning changes slightly.
   - Treat total open area as insufficient by itself: two disconnected cracks
     should not combine into one passable shaft. The passable aperture should be
     a connected open XZ region under the player footprint whose minimum span is
     at least 3 contiguous sub-blocks and that intersects the player center or
     otherwise overlaps enough of the active footprint to plausibly let the player
     fall.
   - Document the final rule in code comments and tests so future player-size
     tuning does not silently change terrain-hole behavior.

3. **Trace horizontal collision expectations**
   - Confirm whether damaged partial blocks should block the player's sides as
     merged sub-cell boxes or whether they should remain macro-solid except for
     support/fall-through holes.
   - If side collision is intentionally still macro-solid for ordinary chipped
     blocks, keep this slice focused on downward support and avoid changing wall
     clipping behavior.

4. **Check runtime cost envelope**
   - Count how many macro cells a player footprint can overlap: normally at most
     four XZ cells per vertical level.
   - Bound any support-aperture query to the cells intersecting the player AABB
     plus at most one lattice halo. Avoid scanning all partial blocks each frame.

## Implementation plan

### Phase 1: introduce footprint-aware partial support helpers

Add a helper in `src/partialBlocks.ts` that evaluates partial support occupancy
as XZ coverage instead of returning only the highest sampled surface. A likely
shape:

```ts
export type PartialBlockFootprintSupportResult = {
  readonly supportY: number;
  readonly coveredArea: number;
  readonly footprintArea: number;
  readonly hasPassableAperture: boolean;
};
```

The helper should:

1. Gather candidate partial cells whose lattice boxes intersect the player bounds
   within the same snap/step vertical band used by player grounding. In practice,
   support should come from top faces of occupied lattice collision boxes at or
   just below the player's feet, not from arbitrary lower cells that are hidden
   beneath a passable shaft.
2. Convert remaining lattice cells from `createPartialBlockCollisionBoxes()` into
   world-space XZ rectangles for the candidate top faces.
3. Clip those rectangles to the player's AABB footprint.
4. Merge or sample coverage across macro-block boundaries so a seam opening is
   treated as one continuous aperture rather than two local holes.
5. Detect passable apertures from connected open regions, not just aggregate
   uncovered area. A vertical-fall region is passable only when its continuous
   span is at least 3 contiguous sub-blocks and it intersects the active player
   footprint in a way that would let the player fall through. Horizontal passages
   should separately require a stance-aware vertical clearance threshold: 6
   contiguous sub-blocks for standing movement, and eventually 1 contiguous
   sub-block for the planned crawl movement.
6. Return no support when a passable connected aperture exists.
7. Return the best support height only when the remaining support coverage is
   sufficient to hold the player. A single occupied sub-block-height ledge should
   still count as a valid traversable surface so the existing partial-surface
   step-up path can carry the player up and over it naturally without requiring a
   jump.

Prefer an exact grid approach over floating polygon booleans: the existing 3x3x3
lattice naturally defines world-space thirds, so candidate support can be mapped
onto a small integer grid spanning the player's footprint. This keeps the code
predictable and easy to test. If the helper returns the richer
`PartialBlockFootprintSupportResult`, make the conversion to the public query
explicit: `hasPassableAperture` maps to `null`, while a supported footprint maps
to the selected `supportY`.

### Phase 2: add a world-level query that is bounded by coordinates

Extend `CollisionWorld` with an optional query that can answer the player-specific
question without scanning every partial block:

```ts
getPlayerFootprintSupportHeight?(bounds: CollisionBounds, options?: {
  readonly minPassableSubBlocks?: number;
  readonly minHorizontalClearanceSubBlocks?: number;
  readonly stance?: "standing" | "crawling";
}): number | null;
```

In `VoxelWorld`, implement it by iterating only the integer X/Y/Z range
intersecting the player bounds plus the documented lattice halo and looking up
`getPartialBlock(x, y, z)`. Keep the old `getSupportHeight()` for debris and
surface uses until those paths are audited separately. The method name should stay
player-specific so debris, rubble, and other physics paths do not accidentally
adopt player-aperture semantics.

### Phase 3: route player grounding through the new query

Update `PlayerController` so `snapDownToPartialSupport()` and
`stepUpOntoPartialSupport()` prefer
`world.getPlayerFootprintSupportHeight?.(bounds)` and fall back to
`world.getSupportHeight?.(bounds)` for non-voxel test worlds or older adapters.
Add an explicit fallback test so worlds that only implement the existing support
query continue to work.

Keep the existing snap epsilon and step-height rules. The behavioral change
should be limited to whether partial support exists under the current footprint,
not how high the player is allowed to snap or step.

### Phase 4: decide whether to use partial boxes for full collision

After the support fix is green, run a separate audit of `collides()`:

- If partial blocks are supposed to be physically carved in all directions,
  replace the macro `isSolid()` shortcut for partial cells with AABB-vs-box tests
  from `getCellCollisionBoxes()`.
- If that is too large for this slice, explicitly preserve macro-solid side
  collision and add a TODO comment/test that downward support is the only fixed
  behavior.

This separation prevents a support bug fix from unexpectedly allowing players to
clip through partial walls or ceilings.

## Regression tests

Add tests in `tests/run.ts` for these cases:

1. **Cross-block passable shaft**
   - Two adjacent partial blocks each remove seam-side lattice cells.
   - The combined open aperture is at least 3 contiguous sub-blocks wide.
   - A player-sized footprint centered on the seam gets `null` support and falls
     during an update.

2. **Narrow seam still supports**
   - Similar setup, but the combined opening is below the 3-sub-block passable
     threshold.
   - The support query returns a support height and the player remains grounded.

3. **Single-block hole behavior follows design dimensions**
   - A hole smaller than 3 contiguous sub-blocks across still supports/blocks.
   - A 3-sub-block-wide vertical shaft lets the player fall when it is connected
     under the active footprint.

4. **Horizontal passage clearance**
   - A damaged horizontal opening with less than 6 contiguous sub-blocks of
     vertical clearance blocks a standing player.
   - A horizontal X-direction passage with at least 6 contiguous sub-blocks of
     vertical clearance can be traversed while standing when its width/depth also
     satisfies the one-block footprint rule.

5. **Future crawl clearance**
   - Mark a one-sub-block-tall horizontal opening as blocked for the standing
     stance but eligible for the future crawling stance. This can be a pending or
     TODO-backed test until crawl exists, but the support helper/API should not
     make one-sub-block crawl openings impossible to express.

6. **One-sub-block ledge traversal**
   - A single sub-block-height partial ledge returns a support height and can be
     stepped up and traversed naturally without a jump.

7. **Boundary positions are stable**
   - Place the player footprint exactly on a macro-block seam and slightly to
     both sides of it to catch off-by-one floor/ceil errors.

8. **No false support from adjacent high surfaces**
   - A high partial surface outside the player's clipped footprint must not keep
     the player grounded.

9. **Compatibility fallback**
   - A test-only world that implements `getSupportHeight()` but not
     `getPlayerFootprintSupportHeight()` still supports snap-down and step-up, so
     non-voxel adapters keep working while they migrate.

10. **Performance guard**
   - Add a small test helper that records every partial-cell coordinate consulted
     by the player-footprint query. Assert that the visited set is bounded to the
     player footprint plus the documented halo, not all partial cells. Avoid
     timing-based assertions.

## Manual validation checklist

1. Create or script a Superflat Lab setup with partial holes that cross two or
   more block boundaries.
2. Walk, sprint, crouch, slide, and jump over:
   - a passable cross-block shaft,
   - a narrow cross-block crack,
   - a single-block damaged hole,
   - a partial-height rubble/support surface,
   - a one-sub-block ledge that should step smoothly without jumping,
   - a horizontal damaged opening below and at the 6-sub-block standing height
     threshold,
   - a one-sub-block-tall horizontal crawl opening once the crawl stance exists.
3. Confirm passable openings drop the player cleanly without jitter or repeated
   snap-back.
4. Confirm narrow openings still feel solid and do not create edge-catching when
   crossing seams diagonally.
5. Verify debris still rests on partial support, since debris currently relies on
   `getSupportHeight()` and `getCellCollisionBoxes()` paths that should remain
   compatible.

## Risks and mitigations

- **Player-size coupling:** Runtime AABB constants may change for movement feel,
  but terrain passability should continue using deliberate stance-aware lattice
  thresholds: one-block-wide (3 sub-block) footprint, two-block-tall (6
  sub-block) standing clearance, and future one-sub-block crawl clearance.
  Mitigate by naming those thresholds explicitly instead of deriving them only
  from `PLAYER_RADIUS` or `PLAYER_HEIGHT`.
- **Support flicker at seams:** Floating-point floor/ceil boundaries can make the
  player alternate between supported and falling. Mitigate with existing epsilon
  constants plus seam-position tests.
- **Over-broad behavior changes:** Replacing `collides()` too early could change
  wall and ceiling collision. Keep support-first and gate side-collision changes
  behind explicit tests.
- **Cost from global scans:** The old `getSupportHeight()` scans partial cells.
  The player-specific implementation should iterate bounded coordinates through
  `VoxelWorld.getPartialBlock()` instead.

## Definition of done

- Automated regression tests prove passable cross-block partial holes make the
  player fall while narrower holes still support the player.
- The implementation uses the existing 3x3x3 lattice as the source of truth for
  support occupancy and applies the one-block-wide footprint plus stance-aware
  standing/crawling height thresholds.
- Player support checks are bounded to cells under the footprint.
- Existing partial-block, debris-support, player movement, and world tests pass.
- The TODO entry can be updated from planning language to a completed fix note or
  removed once implementation and manual validation are complete.
