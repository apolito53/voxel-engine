export type BlockColor = readonly [number, number, number];

export type BlockDefinition = {
  readonly name: string;
  readonly solid: boolean;
  readonly color: BlockColor;
};

export const BLOCK = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  ember: 5
} as const;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];

export const BLOCKS: Record<number, BlockDefinition> = {
  [BLOCK.air]: { name: "Air", solid: false, color: [0, 0, 0] },
  [BLOCK.grass]: { name: "Grass", solid: true, color: [0.28, 0.66, 0.31] },
  [BLOCK.dirt]: { name: "Dirt", solid: true, color: [0.48, 0.31, 0.18] },
  [BLOCK.stone]: { name: "Stone", solid: true, color: [0.46, 0.49, 0.5] },
  [BLOCK.sand]: { name: "Sand", solid: true, color: [0.78, 0.68, 0.42] },
  [BLOCK.ember]: { name: "Ember", solid: true, color: [0.9, 0.25, 0.12] }
};

export const PLACEABLE_BLOCKS: readonly BlockId[] = [
  BLOCK.grass,
  BLOCK.dirt,
  BLOCK.stone,
  BLOCK.sand,
  BLOCK.ember
];
