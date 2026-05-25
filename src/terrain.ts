import { BLOCK, type BlockId } from "./blocks";
import { clamp, fbm2, smoothstep } from "./math";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export type TerrainProfile = "classic" | "varied";

export type TerrainContext = {
  readonly seed: string;
  readonly mode: "generated" | "superflat";
  readonly profile: TerrainProfile;
  readonly continentOffsetX: number;
  readonly continentOffsetZ: number;
  readonly detailOffsetX: number;
  readonly detailOffsetZ: number;
  readonly landformOffsetX: number;
  readonly landformOffsetZ: number;
  readonly ridgeOffsetX: number;
  readonly ridgeOffsetZ: number;
  readonly washOffsetX: number;
  readonly washOffsetZ: number;
  readonly climateOffsetX: number;
  readonly climateOffsetZ: number;
  readonly terraceOffsetX: number;
  readonly terraceOffsetZ: number;
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
      profile: "classic",
      continentOffsetX: 0,
      continentOffsetZ: 0,
      detailOffsetX: 0,
      detailOffsetZ: 0,
      landformOffsetX: 0,
      landformOffsetZ: 0,
      ridgeOffsetX: 0,
      ridgeOffsetZ: 0,
      washOffsetX: 0,
      washOffsetZ: 0,
      climateOffsetX: 0,
      climateOffsetZ: 0,
      terraceOffsetX: 0,
      terraceOffsetZ: 0,
      heightOffset: 0
    };
  }

  const hash = hashSeed(normalizedSeed);

  // Empty seed preserves the original unseeded terrain so existing default saves still line up.
  if (!normalizedSeed) {
    return {
      seed: "",
      mode: "generated",
      profile: "classic",
      continentOffsetX: 0,
      continentOffsetZ: 0,
      detailOffsetX: 9.2,
      detailOffsetZ: -4.8,
      landformOffsetX: 0,
      landformOffsetZ: 0,
      ridgeOffsetX: 0,
      ridgeOffsetZ: 0,
      washOffsetX: 0,
      washOffsetZ: 0,
      climateOffsetX: 0,
      climateOffsetZ: 0,
      terraceOffsetX: 0,
      terraceOffsetZ: 0,
      heightOffset: 0
    };
  }

  return {
    seed: normalizedSeed,
    mode: "generated",
    profile: "varied",
    continentOffsetX: seededRange(hash, 0, -900, 900),
    continentOffsetZ: seededRange(hash, 8, -900, 900),
    detailOffsetX: seededRange(hash, 16, -1300, 1300),
    detailOffsetZ: seededRange(hash, 24, -1300, 1300),
    landformOffsetX: seededRange(hash, 32, -2200, 2200),
    landformOffsetZ: seededRange(hash, 40, -2200, 2200),
    ridgeOffsetX: seededRange(hash, 48, -1800, 1800),
    ridgeOffsetZ: seededRange(hash, 56, -1800, 1800),
    washOffsetX: seededRange(hash, 64, -1700, 1700),
    washOffsetZ: seededRange(hash, 72, -1700, 1700),
    climateOffsetX: seededRange(hash, 80, -1400, 1400),
    climateOffsetZ: seededRange(hash, 88, -1400, 1400),
    terraceOffsetX: seededRange(hash, 96, -1600, 1600),
    terraceOffsetZ: seededRange(hash, 104, -1600, 1600),
    heightOffset: seededRange(hash, 112, -2, 2)
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
      const surfaceBlock = getTerrainSurfaceBlock(wx, wz, height, terrain);

      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        if (y > height) continue;
        blocks[index(x, y, z)] = getTerrainBlock(y, height, terrain, surfaceBlock);
      }
    }
  }

  return blocks;
}

export function getTerrainHeight(wx: number, wz: number, terrain: TerrainContext): number {
  if (terrain.mode === "superflat") return SUPERFLAT_TERRAIN_HEIGHT;
  if (terrain.profile === "classic") return getClassicTerrainHeight(wx, wz, terrain);

  const landform = signedFbm2(
    wx * 0.004 + terrain.landformOffsetX,
    wz * 0.004 + terrain.landformOffsetZ,
    5
  );
  const rollingHills = signedFbm2(
    wx * 0.017 + terrain.continentOffsetX,
    wz * 0.017 + terrain.continentOffsetZ,
    4
  );
  const detail = signedFbm2(
    wx * 0.072 + terrain.detailOffsetX,
    wz * 0.072 + terrain.detailOffsetZ,
    3
  );

  // Ridges and washes are separate landform fields instead of more hill noise.
  // That gives the first-pass generator recognizable places: broad flats,
  // raised backbones, and dry channels that cut across otherwise soft terrain.
  const ridgeSource = signedFbm2(
    wx * 0.011 + terrain.ridgeOffsetX,
    wz * 0.011 + terrain.ridgeOffsetZ,
    4
  );
  const ridge = Math.pow(1 - Math.abs(ridgeSource), 2.35);
  const washSource = signedFbm2(
    wx * 0.009 + terrain.washOffsetX,
    wz * 0.009 + terrain.washOffsetZ,
    4
  );
  const wash = (1 - smoothstep(0.035, 0.17, Math.abs(washSource))) *
    (1 - smoothstep(0.35, 0.85, landform));
  const roughness = smoothstep(-0.25, 0.72, landform);

  let height =
    13 +
    terrain.heightOffset +
    landform * 13 +
    rollingHills * (3.5 + roughness * 7) +
    ridge * roughness * 10 -
    wash * (4.5 + roughness * 3) +
    detail * (1.5 + roughness * 2.5);

  const terraceField = signedFbm2(
    wx * 0.006 + terrain.terraceOffsetX,
    wz * 0.006 + terrain.terraceOffsetZ,
    3
  );
  const terraceMask = smoothstep(0.42, 0.82, landform) * smoothstep(-0.05, 0.45, terraceField);
  const terracedHeight = Math.round(height / 2) * 2;
  height += (terracedHeight - height) * terraceMask * 0.65;

  return Math.floor(clamp(height, 2, WORLD_HEIGHT - 6));
}

export function getTerrainSurfaceBlock(
  wx: number,
  wz: number,
  height: number,
  terrain: TerrainContext
): BlockId {
  if (terrain.mode === "superflat") return BLOCK.grass;
  if (terrain.profile === "classic") return height < 14 ? BLOCK.sand : BLOCK.grass;

  const climate = normalizedFbm2(
    wx * 0.013 + terrain.climateOffsetX,
    wz * 0.013 + terrain.climateOffsetZ,
    4
  );
  const washSource = signedFbm2(
    wx * 0.009 + terrain.washOffsetX,
    wz * 0.009 + terrain.washOffsetZ,
    4
  );
  const wash = 1 - smoothstep(0.035, 0.17, Math.abs(washSource));

  if (height <= 10 || wash > 0.62 || (climate < 0.24 && height < 24)) return BLOCK.sand;
  if (height >= 29 || (height >= 25 && climate < 0.38)) return BLOCK.stone;
  return BLOCK.grass;
}

function getClassicTerrainHeight(wx: number, wz: number, terrain: TerrainContext): number {
  // Keep the empty "classic" seed byte-for-byte compatible with the old shape.
  // Existing default saves can still stream unedited chunks without the ground
  // sliding out from under the player after this generator upgrade.
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

function getTerrainBlock(
  y: number,
  height: number,
  terrain: TerrainContext,
  surfaceBlock: BlockId
): BlockId {
  if (terrain.mode === "superflat") {
    if (y === height) return BLOCK.grass;
    if (y >= height - 2) return BLOCK.dirt;
    return BLOCK.stone;
  }

  if (terrain.profile === "classic") {
    if (y === height) return surfaceBlock;
    if (y > height - 4) return BLOCK.dirt;
    return BLOCK.stone;
  }

  const depth = height - y;
  if (depth === 0) return surfaceBlock;
  if (surfaceBlock === BLOCK.sand && depth <= 2) return BLOCK.sand;
  if (surfaceBlock === BLOCK.stone && depth <= 2) return BLOCK.stone;
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

function normalizedFbm2(x: number, z: number, octaves: number): number {
  const amplitudeSum = 1 - Math.pow(0.5, Math.max(1, octaves));
  return fbm2(x, z, octaves) / amplitudeSum;
}

function signedFbm2(x: number, z: number, octaves: number): number {
  return normalizedFbm2(x, z, octaves) * 2 - 1;
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
