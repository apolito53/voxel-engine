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
same sparse 3x3x3 partial-block lattice that terrain damage already uses. The
player should fall through a cross-block opening when the aggregate open area is
wide enough for the configured player radius, and should remain supported or
blocked when the opening is narrower than the player footprint.

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
   - Position an AABB with width `PLAYER_RADIUS * 2` over the seam and assert the
     current support query reports support even though the aggregate opening
     should let the player fall.
   - Also create a narrower seam opening to preserve expected support.

2. **Measure the intended width rule in lattice coordinates**
   - The TODO says roughly `>= 3` sub-blocks wide should be passable. Since the
     damage lattice is 3 cells per block and each sub-cell is one third of a
     block, verify whether the desired threshold is:
     - continuous open interval width at least `PLAYER_RADIUS * 2`, or
     - an explicit design threshold of three contiguous lattice cells, or
     - both, using the larger of the two for robustness.
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
   near the queried feet height.
2. Convert remaining lattice cells from `createPartialBlockCollisionBoxes()` into
   world-space XZ rectangles at or just below the player's feet.
3. Clip those rectangles to the player's AABB footprint.
4. Merge or sample coverage across macro-block boundaries so a seam opening is
   treated as one continuous aperture rather than two local holes.
5. Return no support when an open rectangle/interval across the footprint is at
   least the passable width threshold.
6. Return the best support height only when the remaining support coverage is
   sufficient to hold the player.

Prefer an exact grid approach over floating polygon booleans: the existing 3x3x3
lattice naturally defines world-space thirds, so candidate support can be mapped
onto a small integer grid spanning the player's footprint. This keeps the code
predictable and easy to test.

### Phase 2: add a world-level query that is bounded by coordinates

Extend `CollisionWorld` with an optional query that can answer the player-specific
question without scanning every partial block:

```ts
getFootprintSupportHeight?(bounds: CollisionBounds, options?: {
  readonly minPassableWidth?: number;
}): number | null;
```

In `VoxelWorld`, implement it by iterating only the integer X/Y/Z range
intersecting the player bounds and looking up `getPartialBlock(x, y, z)`.
Keep the old `getSupportHeight()` for debris and surface uses until those paths
are audited separately.

### Phase 3: route player grounding through the new query

Update `PlayerController` so `snapDownToPartialSupport()` and
`stepUpOntoPartialSupport()` prefer `world.getFootprintSupportHeight?.(bounds)`
and fall back to `world.getSupportHeight?.(bounds)` for non-voxel test worlds or
older adapters.

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
   - The combined open aperture is at least the chosen passable width.
   - A player-sized footprint centered on the seam gets `null` support and falls
     during an update.

2. **Narrow seam still supports**
   - Similar setup, but the combined opening is below the passable threshold.
   - The support query returns a support height and the player remains grounded.

3. **Single-block hole behavior is unchanged**
   - A too-small hole inside one macro block still supports/blocks.
   - A sufficiently wide hole inside one macro block remains passable if that is
     already intended by design.

4. **Boundary positions are stable**
   - Place the player footprint exactly on a macro-block seam and slightly to
     both sides of it to catch off-by-one floor/ceil errors.

5. **No false support from adjacent high surfaces**
   - A high partial surface outside the player's clipped footprint must not keep
     the player grounded.

6. **Performance guard**
   - Add a small test helper or assertion that the world query only consults the
     bounded candidate coordinates for the player footprint, not all partial
     cells.

## Manual validation checklist

1. Create or script a Superflat Lab setup with partial holes that cross two or
   more block boundaries.
2. Walk, sprint, crouch, slide, and jump over:
   - a passable cross-block shaft,
   - a narrow cross-block crack,
   - a single-block damaged hole,
   - a partial-height rubble/support surface.
3. Confirm passable openings drop the player cleanly without jitter or repeated
   snap-back.
4. Confirm narrow openings still feel solid and do not create edge-catching when
   crossing seams diagonally.
5. Verify debris still rests on partial support, since debris currently relies on
   `getSupportHeight()` and `getCellCollisionBoxes()` paths that should remain
   compatible.

## Risks and mitigations

- **Player-size coupling:** If the threshold is hard-coded to three sub-cells,
  future `PLAYER_RADIUS` changes can desync collision feel. Mitigate by deriving
  the default from `PLAYER_RADIUS * 2` and documenting any deliberate minimum.
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
  support occupancy.
- Player support checks are bounded to cells under the footprint.
- Existing partial-block, debris-support, player movement, and world tests pass.
- The TODO entry can be updated from planning language to a completed fix note or
  removed once implementation and manual validation are complete.
