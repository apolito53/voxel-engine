export const BLOCK_FRAGMENT_GRID_SIZE = 3;
export const BLOCK_FRAGMENT_COUNT = BLOCK_FRAGMENT_GRID_SIZE ** 3;
// Gameplay rubble uses normalized block-volume material. A whole terrain block
// is 1.0 no matter how many visible shards the current quality tier spawns.
export const BLOCK_RUBBLE_MATERIAL_UNITS = 1;
export const BLOCK_FRAGMENT_SPACING = 0.28;
export const BLOCK_FRAGMENT_VISUAL_SIZE = 0.24;
export const BLOCK_FRAGMENT_COLLISION_RADIUS = 0.16;
export const TERRAIN_CHIP_FRAGMENT_MAX_COUNT = 4;

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

  // Split normalized block-volume material across however many visible shards
  // the current quality tier spawns. A 2-shard Potato fracture therefore still
  // settles into the same full-block material as a 27-shard Ultra fracture, and
  // chip damage can carry fractional volume instead of rounding HP loss.
  const normalizedMaterialUnits = Math.max(
    0,
    Number.isFinite(materialUnits) ? materialUnits : BLOCK_RUBBLE_MATERIAL_UNITS
  );
  if (normalizedMaterialUnits <= 0) return 0;
  return normalizedMaterialUnits / normalizedCount;
}

export function getTerrainImpactFragmentCount(
  maxVisibleFragmentCount: number,
  materialUnits: number,
  destroyed: boolean
): number {
  const normalizedMaxVisible = normalizeBlockFragmentCount(maxVisibleFragmentCount);
  const normalizedMaterialUnits = Math.max(0, Math.min(
    BLOCK_RUBBLE_MATERIAL_UNITS,
    Number.isFinite(materialUnits) ? materialUnits : 0
  ));
  if (normalizedMaterialUnits <= 0) return 0;

  const proportionalCount = Math.max(
    1,
    Math.ceil((normalizedMaterialUnits / BLOCK_RUBBLE_MATERIAL_UNITS) * normalizedMaxVisible)
  );
  if (destroyed) return Math.min(normalizedMaxVisible, proportionalCount);

  const qualityScaledChipCap = Math.max(1, Math.ceil(normalizedMaxVisible * 0.2));
  return Math.min(proportionalCount, TERRAIN_CHIP_FRAGMENT_MAX_COUNT, qualityScaledChipCap);
}

export function getBlockRubbleMaterialUnitsForHealth(
  remainingHealth: number,
  maxHealth: number,
  materialUnits = BLOCK_RUBBLE_MATERIAL_UNITS
): number {
  const normalizedMaterialUnits = Math.max(
    0,
    Number.isFinite(materialUnits) ? materialUnits : BLOCK_RUBBLE_MATERIAL_UNITS
  );
  if (normalizedMaterialUnits <= 0 || maxHealth <= 0) return 0;

  const remainingFraction = Math.max(0, Math.min(1, remainingHealth / maxHealth));
  return Math.max(0, Math.min(normalizedMaterialUnits, normalizedMaterialUnits * remainingFraction));
}

export function getEjectedBlockRubbleMaterialUnits(
  previousDamage: number,
  nextDamage: number,
  maxHealth: number,
  materialUnits = BLOCK_RUBBLE_MATERIAL_UNITS
): number {
  const previousRemainingHealth = Math.max(0, maxHealth - Math.max(0, previousDamage));
  const nextRemainingHealth = Math.max(0, maxHealth - Math.max(previousDamage, nextDamage));
  const previousMaterialUnits = getBlockRubbleMaterialUnitsForHealth(
    previousRemainingHealth,
    maxHealth,
    materialUnits
  );
  const nextMaterialUnits = getBlockRubbleMaterialUnitsForHealth(
    nextRemainingHealth,
    maxHealth,
    materialUnits
  );
  return Math.max(0, previousMaterialUnits - nextMaterialUnits);
}

export function normalizeBlockFragmentCount(fragmentCount: number): number {
  if (!Number.isFinite(fragmentCount)) return 1;
  return Math.min(BLOCK_FRAGMENT_COUNT, Math.max(1, Math.round(fragmentCount)));
}
