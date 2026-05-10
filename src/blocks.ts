export type BlockColor = readonly [number, number, number];

export type BlockDefinition = {
  readonly name: string;
  readonly solid: boolean;
  readonly color: BlockColor;
  readonly health: number;
};

export const BLOCK = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  ember: 5,
  rubble: 6
} as const;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];
export const DEFAULT_TERRAIN_BLOCK_HEALTH = 10;

export const BLOCKS: Record<number, BlockDefinition> = {
  [BLOCK.air]: { name: "Air", solid: false, color: [0, 0, 0], health: 0 },
  [BLOCK.grass]: { name: "Grass", solid: true, color: [0.28, 0.66, 0.31], health: DEFAULT_TERRAIN_BLOCK_HEALTH },
  [BLOCK.dirt]: { name: "Dirt", solid: true, color: [0.48, 0.31, 0.18], health: DEFAULT_TERRAIN_BLOCK_HEALTH },
  [BLOCK.stone]: { name: "Stone", solid: true, color: [0.46, 0.49, 0.5], health: DEFAULT_TERRAIN_BLOCK_HEALTH },
  [BLOCK.sand]: { name: "Sand", solid: true, color: [0.78, 0.68, 0.42], health: DEFAULT_TERRAIN_BLOCK_HEALTH },
  [BLOCK.ember]: { name: "Ember", solid: true, color: [0.9, 0.25, 0.12], health: DEFAULT_TERRAIN_BLOCK_HEALTH },
  [BLOCK.rubble]: { name: "Rubble", solid: true, color: [0.43, 0.39, 0.33], health: 3 }
};

export const PLACEABLE_BLOCKS: readonly BlockId[] = [
  BLOCK.grass,
  BLOCK.dirt,
  BLOCK.stone,
  BLOCK.sand,
  BLOCK.ember
];
