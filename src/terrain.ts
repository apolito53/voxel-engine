import { BLOCK, type BlockId } from "./blocks";
import { fbm2 } from "./math";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export type TerrainContext = {
  readonly seed: string;
  readonly mode: "generated" | "superflat";
  readonly continentOffsetX: number;
  readonly continentOffsetZ: number;
  readonly detailOffsetX: number;
  readonly detailOffsetZ: number;
  readonly heightOffset: number;
};

export const SUPERFLAT_WORLD_SEED = "superflat";
export const SUPERFLAT_TERRAIN_HEIGHT = 4;

export function createTerrainContext(seed = ""): TerrainContext {
  const normalizedSeed = String(seed || "");
  if (isSuperflatSeed(normalizedSeed)) {
    return {
      seed: SUPERFLAT_WORLD_SEED,
      mode: "superflat",
      continentOffsetX: 0,
      continentOffsetZ: 0,
      detailOffsetX: 0,
      detailOffsetZ: 0,
      heightOffset: 0
    };
  }

  const hash = hashSeed(normalizedSeed);

  // Empty seed preserves the original unseeded terrain so existing default saves still line up.
  if (!normalizedSeed) {
    return {
      seed: "",
      mode: "generated",
      continentOffsetX: 0,
      continentOffsetZ: 0,
      detailOffsetX: 9.2,
      detailOffsetZ: -4.8,
      heightOffset: 0
    };
  }

  return {
    seed: normalizedSeed,
    mode: "generated",
    continentOffsetX: seededRange(hash, 0, -900, 900),
    continentOffsetZ: seededRange(hash, 8, -900, 900),
    detailOffsetX: seededRange(hash, 16, -1300, 1300),
    detailOffsetZ: seededRange(hash, 24, -1300, 1300),
    heightOffset: seededRange(hash, 32, -2, 2)
  };
}

export function generateChunkBlocks(
  cx: number,
  cz: number,
  terrain = createTerrainContext()
): Uint8Array {
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const wx = ox + x;
      const wz = oz + z;
      const height = getTerrainHeight(wx, wz, terrain);

      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        if (y > height) continue;
        blocks[index(x, y, z)] = getTerrainBlock(y, height, terrain);
      }
    }
  }

  return blocks;
}

export function getTerrainHeight(wx: number, wz: number, terrain: TerrainContext): number {
  if (terrain.mode === "superflat") return SUPERFLAT_TERRAIN_HEIGHT;

  const continent = fbm2(
    wx * 0.018 + terrain.continentOffsetX,
    wz * 0.018 + terrain.continentOffsetZ,
    4
  );
  const detail = fbm2(
    wx * 0.07 + terrain.detailOffsetX,
    wz * 0.07 + terrain.detailOffsetZ,
    3
  );

  return Math.floor(8 + continent * 18 + detail * 5 + terrain.heightOffset);
}

export function isSuperflatSeed(seed: string): boolean {
  return String(seed || "").trim().toLowerCase() === SUPERFLAT_WORLD_SEED;
}

function getTerrainBlock(y: number, height: number, terrain: TerrainContext): BlockId {
  if (terrain.mode === "superflat") {
    if (y === height) return BLOCK.grass;
    if (y >= height - 2) return BLOCK.dirt;
    return BLOCK.stone;
  }

  if (y === height) return height < 14 ? BLOCK.sand : BLOCK.grass;
  if (y > height - 4) return BLOCK.dirt;
  return BLOCK.stone;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRange(hash: number, salt: number, min: number, max: number): number {
  const mixed = mixHash(hash + salt);
  return min + (mixed / 0xffffffff) * (max - min);
}

function mixHash(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function index(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}
