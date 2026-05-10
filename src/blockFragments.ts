export const BLOCK_FRAGMENT_GRID_SIZE = 3;
export const BLOCK_FRAGMENT_COUNT = BLOCK_FRAGMENT_GRID_SIZE ** 3;
// Gameplay rubble uses a fixed material budget per destroyed block. Quality
// settings can lower the number of visible flying shards, but they should not
// make low-end machines produce less cover or different terrain outcomes.
export const BLOCK_RUBBLE_MATERIAL_UNITS = BLOCK_FRAGMENT_COUNT;
export const BLOCK_FRAGMENT_SPACING = 0.28;
export const BLOCK_FRAGMENT_VISUAL_SIZE = 0.24;
export const BLOCK_FRAGMENT_COLLISION_RADIUS = 0.16;

export type BlockFragmentOffset = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export function getBlockFragmentOffset(index: number): BlockFragmentOffset {
  if (!Number.isInteger(index) || index < 0 || index >= BLOCK_FRAGMENT_COUNT) {
    throw new RangeError(`Block fragment index ${index} is outside the ${BLOCK_FRAGMENT_COUNT}-piece fracture grid.`);
  }

  // Flattened grid order keeps spawning cheap while still giving each axis a
  // proper 0..gridSize-1 coordinate. A 3x3x3 grid therefore yields 27 pieces.
  const xIndex = index % BLOCK_FRAGMENT_GRID_SIZE;
  const yIndex = Math.floor(index / BLOCK_FRAGMENT_GRID_SIZE) % BLOCK_FRAGMENT_GRID_SIZE;
  const zIndex = Math.floor(index / (BLOCK_FRAGMENT_GRID_SIZE ** 2));
  const centeredOrigin = (BLOCK_FRAGMENT_GRID_SIZE - 1) / 2;

  return {
    x: (xIndex - centeredOrigin) * BLOCK_FRAGMENT_SPACING,
    y: (yIndex - centeredOrigin) * BLOCK_FRAGMENT_SPACING,
    z: (zIndex - centeredOrigin) * BLOCK_FRAGMENT_SPACING
  };
}

export function getDistributedBlockFragmentIndex(fragmentIndex: number, fragmentCount: number): number {
  const normalizedCount = normalizeBlockFragmentCount(fragmentCount);
  if (!Number.isInteger(fragmentIndex) || fragmentIndex < 0 || fragmentIndex >= normalizedCount) {
    throw new RangeError(`Fragment selection index ${fragmentIndex} is outside the ${normalizedCount}-piece budget.`);
  }

  // Sample the 27-piece fracture grid at the middle of each quality-budgeted
  // bucket. Reduced debris counts stay spread across the block instead of
  // always spawning the same low-corner pieces.
  return Math.min(
    BLOCK_FRAGMENT_COUNT - 1,
    Math.floor(((fragmentIndex + 0.5) * BLOCK_FRAGMENT_COUNT) / normalizedCount)
  );
}

export function getBlockFragmentMaterialUnits(
  fragmentIndex: number,
  fragmentCount: number,
  materialUnits = BLOCK_RUBBLE_MATERIAL_UNITS
): number {
  const normalizedCount = normalizeBlockFragmentCount(fragmentCount);
  if (!Number.isInteger(fragmentIndex) || fragmentIndex < 0 || fragmentIndex >= normalizedCount) {
    throw new RangeError(`Fragment material index ${fragmentIndex} is outside the ${normalizedCount}-piece budget.`);
  }

  // Split the fixed rubble material across however many visible shards the
  // current quality tier spawns. A 2-shard Potato fracture therefore still
  // settles into the same 27 material units as a full 27-shard Ultra fracture.
  const normalizedMaterialUnits = Math.max(
    normalizedCount,
    Number.isFinite(materialUnits) ? Math.round(materialUnits) : BLOCK_RUBBLE_MATERIAL_UNITS
  );
  const startUnit = Math.floor((fragmentIndex * normalizedMaterialUnits) / normalizedCount);
  const endUnit = Math.floor(((fragmentIndex + 1) * normalizedMaterialUnits) / normalizedCount);
  return Math.max(1, endUnit - startUnit);
}

export function normalizeBlockFragmentCount(fragmentCount: number): number {
  if (!Number.isFinite(fragmentCount)) return 1;
  return Math.min(BLOCK_FRAGMENT_COUNT, Math.max(1, Math.round(fragmentCount)));
}
