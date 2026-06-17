import { BLOCK, type BlockId } from "./blocks";
import { clamp, fbm2, smoothstep } from "./math";
import { CHUNK_SIZE, EXPANDED_TERRAIN_SURFACE_OFFSET, WORLD_HEIGHT } from "./voxelConstants";

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
  readonly treeOffsetX: number;
  readonly treeOffsetZ: number;
  readonly treeSeed: number;
};

export const SUPERFLAT_WORLD_SEED = "superflat";
export const SUPERFLAT_TERRAIN_HEIGHT = 4;
const TREE_CANDIDATE_GRID_SIZE = 6;
const TREE_CANOPY_RADIUS = 3;
const TREE_MIN_TRUNK_HEIGHT = 4;
const TREE_TRUNK_HEIGHT_VARIATION = 3;

export function createTerrainContext(seed = "", profileOverride?: TerrainProfile): TerrainContext {
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
      heightOffset: 0,
      treeOffsetX: 0,
      treeOffsetZ: 0,
      treeSeed: 0
    };
  }

  const hash = hashSeed(normalizedSeed);
  if (profileOverride === "classic") return createClassicTerrainContext(normalizedSeed, hash);

  // Empty seed preserves the original unseeded terrain so existing default saves still line up.
  if (!normalizedSeed) {
    return createClassicTerrainContext(normalizedSeed, hash);
  }

  return createVariedTerrainContext(normalizedSeed, hash);
}

function createClassicTerrainContext(seed: string, hash: number): TerrainContext {
  return {
    seed,
    mode: "generated",
    profile: "classic",
    continentOffsetX: seed ? seededRange(hash, 0, -900, 900) : 0,
    continentOffsetZ: seed ? seededRange(hash, 8, -900, 900) : 0,
    detailOffsetX: seed ? seededRange(hash, 16, -1300, 1300) : 9.2,
    detailOffsetZ: seed ? seededRange(hash, 24, -1300, 1300) : -4.8,
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
    heightOffset: seed ? seededRange(hash, 32, -2, 2) : 0,
    treeOffsetX: 0,
    treeOffsetZ: 0,
    treeSeed: mixHash(hash ^ 0x6d2b79f5)
  };
}

function createVariedTerrainContext(normalizedSeed: string, hash: number): TerrainContext {
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
    heightOffset: seededRange(hash, 112, -2, 2),
    treeOffsetX: seededRange(hash, 120, -1900, 1900),
    treeOffsetZ: seededRange(hash, 128, -1900, 1900),
    treeSeed: mixHash(hash ^ 0xa511e9b3)
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

  decorateChunkTrees(cx, cz, blocks, terrain);
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
  const terraceMask = smoothstep(0.56, 0.9, landform) * smoothstep(0.12, 0.55, terraceField);
  const terracedHeight = Math.round(height / 2) * 2;
  height += (terracedHeight - height) * terraceMask * 0.35;

  // The expanded world keeps the old terrain shape but lifts the varied profile
  // into the taller volume. That buys both build headroom and meaningful depth
  // below natural terrain without changing every landform formula at once.
  return Math.floor(clamp(height + EXPANDED_TERRAIN_SURFACE_OFFSET, 2, WORLD_HEIGHT - 6));
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
  const ridgeSource = signedFbm2(
    wx * 0.011 + terrain.ridgeOffsetX,
    wz * 0.011 + terrain.ridgeOffsetZ,
    4
  );
  const ridge = Math.pow(1 - Math.abs(ridgeSource), 2.35);

  const featureHeight = getTerrainFeatureHeight(height, terrain);
  if (featureHeight >= 31 || (featureHeight >= 27 && ridge > 0.74 && climate < 0.58)) return BLOCK.stone;
  if (
    featureHeight <= 8 ||
    (wash > 0.78 && featureHeight <= 20) ||
    (climate < 0.18 && featureHeight <= 17)
  ) {
    return BLOCK.sand;
  }
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

function decorateChunkTrees(
  cx: number,
  cz: number,
  blocks: Uint8Array,
  terrain: TerrainContext
): void {
  if (terrain.mode !== "generated" || terrain.profile !== "varied") return;

  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const minCellX = Math.floor((ox - TREE_CANOPY_RADIUS) / TREE_CANDIDATE_GRID_SIZE);
  const maxCellX = Math.floor((ox + CHUNK_SIZE - 1 + TREE_CANOPY_RADIUS) / TREE_CANDIDATE_GRID_SIZE);
  const minCellZ = Math.floor((oz - TREE_CANOPY_RADIUS) / TREE_CANDIDATE_GRID_SIZE);
  const maxCellZ = Math.floor((oz + CHUNK_SIZE - 1 + TREE_CANOPY_RADIUS) / TREE_CANDIDATE_GRID_SIZE);

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const root = createTreeRootCandidate(cellX, cellZ, terrain);
      if (
        root.x < ox - TREE_CANOPY_RADIUS ||
        root.x >= ox + CHUNK_SIZE + TREE_CANOPY_RADIUS ||
        root.z < oz - TREE_CANOPY_RADIUS ||
        root.z >= oz + CHUNK_SIZE + TREE_CANOPY_RADIUS
      ) {
        continue;
      }

      placeTreeInChunk(root.x, root.z, root.hash, cx, cz, blocks, terrain);
    }
  }
}

function createTreeRootCandidate(
  cellX: number,
  cellZ: number,
  terrain: TerrainContext
): { readonly x: number; readonly z: number; readonly hash: number } {
  const hash = hashTreeCell(terrain.treeSeed, cellX, cellZ);
  const jitterX = Math.floor(hashUnit(hash ^ 0x9e3779b9) * TREE_CANDIDATE_GRID_SIZE);
  const jitterZ = Math.floor(hashUnit(hash ^ 0x85ebca6b) * TREE_CANDIDATE_GRID_SIZE);
  return {
    x: cellX * TREE_CANDIDATE_GRID_SIZE + jitterX,
    z: cellZ * TREE_CANDIDATE_GRID_SIZE + jitterZ,
    hash
  };
}

function placeTreeInChunk(
  wx: number,
  wz: number,
  hash: number,
  cx: number,
  cz: number,
  blocks: Uint8Array,
  terrain: TerrainContext
): void {
  const surfaceY = getTerrainHeight(wx, wz, terrain);
  if (surfaceY < 7 || surfaceY > WORLD_HEIGHT - 10) return;
  if (getTerrainSurfaceBlock(wx, wz, surfaceY, terrain) !== BLOCK.grass) return;
  if (!isTreeFriendlySlope(wx, wz, surfaceY, terrain)) return;

  const probability = getTreeProbability(wx, wz, surfaceY, terrain);
  if (hashUnit(hash ^ 0xc2b2ae35) > probability) return;

  const trunkHeight = TREE_MIN_TRUNK_HEIGHT +
    Math.floor(hashUnit(hash ^ 0x27d4eb2f) * TREE_TRUNK_HEIGHT_VARIATION);
  const trunkTopY = surfaceY + trunkHeight;
  if (trunkTopY + 2 >= WORLD_HEIGHT) return;

  for (let y = surfaceY + 1; y <= trunkTopY; y += 1) {
    setDecoratedBlockIfInside(cx, cz, blocks, wx, y, wz, BLOCK.wood, true);
  }

  for (let dy = -2; dy <= 2; dy += 1) {
    const radius = dy >= 1 ? 1 : 2;
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const distance = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy);
        if (distance > radius + 1) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        const leafHash = hashWorldCell(hash ^ 0x165667b1, wx + dx, trunkTopY + dy, wz + dz);
        if (distance >= radius + 1 && hashUnit(leafHash) < 0.35) continue;
        setDecoratedBlockIfInside(cx, cz, blocks, wx + dx, trunkTopY + dy, wz + dz, BLOCK.leaves);
      }
    }
  }

  setDecoratedBlockIfInside(cx, cz, blocks, wx, trunkTopY + 2, wz, BLOCK.leaves);
}

function isTreeFriendlySlope(wx: number, wz: number, surfaceY: number, terrain: TerrainContext): boolean {
  return Math.abs(getTerrainHeight(wx + 1, wz, terrain) - surfaceY) <= 1 &&
    Math.abs(getTerrainHeight(wx - 1, wz, terrain) - surfaceY) <= 1 &&
    Math.abs(getTerrainHeight(wx, wz + 1, terrain) - surfaceY) <= 1 &&
    Math.abs(getTerrainHeight(wx, wz - 1, terrain) - surfaceY) <= 1;
}

function getTreeProbability(wx: number, wz: number, surfaceY: number, terrain: TerrainContext): number {
  const grove = normalizedFbm2(
    wx * 0.018 + terrain.treeOffsetX,
    wz * 0.018 + terrain.treeOffsetZ,
    4
  );
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
  const washPenalty = 1 - smoothstep(0.02, 0.16, Math.abs(washSource));
  const elevationPenalty = smoothstep(25, 32, getTerrainFeatureHeight(surfaceY, terrain));
  const groveWeight = smoothstep(0.42, 0.78, grove);
  const climateWeight = smoothstep(0.25, 0.48, climate) * (1 - smoothstep(0.78, 0.95, climate));
  return clamp(groveWeight * climateWeight * (1 - washPenalty) * (1 - elevationPenalty) * 0.58, 0, 0.45);
}

function getTerrainFeatureHeight(height: number, terrain: TerrainContext): number {
  return terrain.profile === "varied" ? height - EXPANDED_TERRAIN_SURFACE_OFFSET : height;
}

function setDecoratedBlockIfInside(
  cx: number,
  cz: number,
  blocks: Uint8Array,
  wx: number,
  y: number,
  wz: number,
  block: BlockId,
  replaceLeaves = false
): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;

  const blockIndex = index(lx, y, lz);
  const existingBlock = blocks[blockIndex];
  if (existingBlock !== BLOCK.air && !(replaceLeaves && existingBlock === BLOCK.leaves)) return;
  blocks[blockIndex] = block;
}

function hashTreeCell(seed: number, cellX: number, cellZ: number): number {
  return hashWorldCell(seed, cellX, 0, cellZ);
}

function hashWorldCell(seed: number, x: number, y: number, z: number): number {
  let hash = seed >>> 0;
  hash = mixHash(hash ^ Math.imul(x, 73856093));
  hash = mixHash(hash ^ Math.imul(y, 19349663));
  hash = mixHash(hash ^ Math.imul(z, 83492791));
  return hash >>> 0;
}

function hashUnit(seed: number): number {
  return (mixHash(seed) >>> 0) / 0xffffffff;
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
