export const BLOCK_FRAGMENT_GRID_SIZE = 3;
export const BLOCK_FRAGMENT_COUNT = BLOCK_FRAGMENT_GRID_SIZE ** 3;
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
