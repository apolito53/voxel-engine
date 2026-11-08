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
  rubble: 6,
  wood: 7,
  leaves: 8,
  moss: 9,
  bush: 10,
  lamp: 11
} as const;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];
// Legacy fallback for generic terrain callers. Actual block HP is material
// specific below; mining cadence lives separately in blockMaterialRules.ts.
export const DEFAULT_TERRAIN_BLOCK_HEALTH = 8;

// Sunwashed middle tones in linear RGB keep untextured debris and poofs in
// the same palette; textured terrain owns its full authored color separately.
export const BLOCKS: Record<number, BlockDefinition> = {
  [BLOCK.air]: { name: "Air", solid: false, color: [0, 0, 0], health: 0 },
  [BLOCK.grass]: { name: "Grass", solid: true, color: [0.296138, 0.341914, 0.116971], health: 6 },
  [BLOCK.dirt]: { name: "Dirt", solid: true, color: [0.439657, 0.270498, 0.132868], health: 8 },
  [BLOCK.stone]: { name: "Stone", solid: true, color: [0.597202, 0.55834, 0.417885], health: 16 },
  [BLOCK.sand]: { name: "Sand", solid: true, color: [0.730461, 0.571125, 0.283149], health: 5 },
  [BLOCK.ember]: { name: "Ember", solid: true, color: [0.132868, 0.082283, 0.049707], health: 10 },
  [BLOCK.rubble]: { name: "Rubble", solid: true, color: [0.533276, 0.42869, 0.283149], health: 4 },
  [BLOCK.wood]: { name: "Wood", solid: true, color: [0.361307, 0.234551, 0.097587], health: 12 },
  [BLOCK.leaves]: { name: "Leaves", solid: true, color: [0.205079, 0.283149, 0.072272], health: 3 },
  [BLOCK.moss]: { name: "Moss", solid: true, color: [0.262251, 0.3564, 0.088656], health: 4 },
  [BLOCK.bush]: { name: "Bush", solid: true, color: [0.116971, 0.177888, 0.051269], health: 2 },
  [BLOCK.lamp]: { name: "Lamp", solid: true, color: [0.715694, 0.502886, 0.194618], health: 6 }
};

export const PLACEABLE_BLOCKS: readonly BlockId[] = [
  BLOCK.grass,
  BLOCK.dirt,
  BLOCK.stone,
  BLOCK.sand,
  BLOCK.ember,
  BLOCK.wood,
  BLOCK.leaves,
  BLOCK.moss,
  BLOCK.bush,
  BLOCK.lamp
];
