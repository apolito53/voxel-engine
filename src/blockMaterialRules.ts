import { BLOCK, type BlockId } from "./blocks";
import type { DebrisShapeId } from "./debrisShapes";

export type MiningCadence =
  | "none"
  | "very-fast"
  | "fast"
  | "quick"
  | "medium"
  | "medium-hard"
  | "slow"
  | "slowest";

export type DebrisFlavor =
  | "none"
  | "light-shredded"
  | "soft-low-spray"
  | "moderate-chunks"
  | "heavier-chunks"
  | "sharp-hot-ejection"
  | "splinter-biased"
  | "heavy-angular"
  | "muted";

export type DebrisSpawnProfile = {
  readonly flavor: DebrisFlavor;
  readonly preferredShapeIds: readonly DebrisShapeId[];
  readonly visualScaleMultiplier: number;
  readonly ejectionSpeedMultiplier: number;
  readonly upwardSpeedMultiplier: number;
};

export type BlockMaterialRule = {
  readonly block: BlockId;
  // This is the compact material toughness value. Runtime terrain HP multiplies
  // it by TERRAIN_DAMAGE_SCALE so the 3x3x3 sub-cell editor can spend integer
  // HP without losing the old material identity.
  readonly health: number;
  readonly miningCadence: MiningCadence;
  readonly miningTickSeconds: number;
  readonly miningDamageAmount: number;
  readonly debris: DebrisSpawnProfile;
};

const MINING_DAMAGE_PER_TICK = 1;
export const TERRAIN_DAMAGE_SCALE = 270;
export const TERRAFORMER_SUBCELL_DAMAGE_SCALE = 10;

// These are feel values, not durability values. Keep them separate so changing
// a block's HP does not silently retune how often held mining spends damage.
const MINING_TICK_SECONDS_BY_CADENCE: Readonly<Record<MiningCadence, number>> = {
  none: 0,
  "very-fast": 0.08,
  fast: 0.12,
  quick: 0.16,
  medium: 0.22,
  "medium-hard": 0.28,
  slow: 0.36,
  slowest: 0.45
};

const INERT_DEBRIS_PROFILE: DebrisSpawnProfile = {
  flavor: "none",
  preferredShapeIds: ["chunky-chip"],
  visualScaleMultiplier: 0,
  ejectionSpeedMultiplier: 0,
  upwardSpeedMultiplier: 0
};

export const BLOCK_MATERIAL_RULES: Readonly<Record<BlockId, BlockMaterialRule>> = {
  [BLOCK.air]: createBlockMaterialRule(BLOCK.air, 0, "none", INERT_DEBRIS_PROFILE),
  [BLOCK.leaves]: createBlockMaterialRule(BLOCK.leaves, 3, "very-fast", {
    flavor: "light-shredded",
    preferredShapeIds: ["narrow-shard", "flat-slab", "long-splinter"],
    visualScaleMultiplier: 0.78,
    ejectionSpeedMultiplier: 0.82,
    upwardSpeedMultiplier: 0.9
  }),
  [BLOCK.sand]: createBlockMaterialRule(BLOCK.sand, 5, "fast", {
    flavor: "soft-low-spray",
    preferredShapeIds: ["flat-slab", "squat-block", "chunky-chip"],
    visualScaleMultiplier: 0.82,
    ejectionSpeedMultiplier: 0.68,
    upwardSpeedMultiplier: 0.48
  }),
  [BLOCK.grass]: createBlockMaterialRule(BLOCK.grass, 6, "quick", {
    flavor: "moderate-chunks",
    preferredShapeIds: ["chunky-chip", "squat-block", "sheared-chunk"],
    visualScaleMultiplier: 1,
    ejectionSpeedMultiplier: 1,
    upwardSpeedMultiplier: 1
  }),
  [BLOCK.dirt]: createBlockMaterialRule(BLOCK.dirt, 8, "medium", {
    flavor: "heavier-chunks",
    preferredShapeIds: ["squat-block", "chunky-chip", "sheared-chunk", "corner-chunk"],
    visualScaleMultiplier: 1.08,
    ejectionSpeedMultiplier: 0.9,
    upwardSpeedMultiplier: 0.82
  }),
  [BLOCK.ember]: createBlockMaterialRule(BLOCK.ember, 10, "medium-hard", {
    flavor: "sharp-hot-ejection",
    preferredShapeIds: ["narrow-shard", "wedge", "sheared-chunk", "corner-chunk"],
    visualScaleMultiplier: 1,
    ejectionSpeedMultiplier: 1.18,
    upwardSpeedMultiplier: 1.16
  }),
  [BLOCK.wood]: createBlockMaterialRule(BLOCK.wood, 12, "slow", {
    flavor: "splinter-biased",
    preferredShapeIds: ["long-splinter", "narrow-shard", "wedge"],
    visualScaleMultiplier: 0.95,
    ejectionSpeedMultiplier: 1.05,
    upwardSpeedMultiplier: 0.95
  }),
  [BLOCK.stone]: createBlockMaterialRule(BLOCK.stone, 16, "slowest", {
    flavor: "heavy-angular",
    preferredShapeIds: ["corner-chunk", "wedge", "sheared-chunk", "chunky-chip"],
    visualScaleMultiplier: 1.12,
    ejectionSpeedMultiplier: 0.82,
    upwardSpeedMultiplier: 0.72
  }),
  [BLOCK.rubble]: createBlockMaterialRule(BLOCK.rubble, 4, "quick", {
    flavor: "muted",
    preferredShapeIds: ["squat-block", "flat-slab", "chunky-chip"],
    visualScaleMultiplier: 0.72,
    ejectionSpeedMultiplier: 0.55,
    upwardSpeedMultiplier: 0.5
  })
};

export function getBlockMaterialRule(block: number): BlockMaterialRule {
  return isKnownBlockId(block) ? BLOCK_MATERIAL_RULES[block] : BLOCK_MATERIAL_RULES[BLOCK.air];
}

export function getMiningTickSeconds(block: number): number {
  return getBlockMaterialRule(block).miningTickSeconds;
}

export function getMiningDamageAmount(block: number): number {
  return getTerraformerSubCellHealth(block);
}

export function getDebrisSpawnProfile(block: number): DebrisSpawnProfile {
  return getBlockMaterialRule(block).debris;
}

export function getTerrainMaxHealth(block: number): number {
  return getBlockMaterialRule(block).health * TERRAIN_DAMAGE_SCALE;
}

export function getTerraformerSubCellHealth(block: number): number {
  return getBlockMaterialRule(block).health * TERRAFORMER_SUBCELL_DAMAGE_SCALE;
}

function createBlockMaterialRule(
  block: BlockId,
  health: number,
  miningCadence: MiningCadence,
  debris: DebrisSpawnProfile
): BlockMaterialRule {
  return {
    block,
    health,
    miningCadence,
    miningTickSeconds: MINING_TICK_SECONDS_BY_CADENCE[miningCadence],
    miningDamageAmount: miningCadence === "none" ? 0 : MINING_DAMAGE_PER_TICK,
    debris
  };
}

function isKnownBlockId(block: number): block is BlockId {
  return Object.prototype.hasOwnProperty.call(BLOCK_MATERIAL_RULES, block);
}
