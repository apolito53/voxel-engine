import { BLOCK, type BlockId } from "./blocks";
import { clamp, fbm2, smoothstep } from "./math";
import { CHUNK_SIZE, EXPANDED_TERRAIN_SURFACE_OFFSET, WORLD_HEIGHT } from "./voxelConstants";

export type TerrainProfile = "classic" | "varied" | "floating-islands";

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
  readonly islandOffsetX: number;
  readonly islandOffsetZ: number;
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
      islandOffsetX: 0,
      islandOffsetZ: 0,
      heightOffset: 0,
      treeOffsetX: 0,
      treeOffsetZ: 0,
      treeSeed: 0
    };
  }

  const hash = hashSeed(normalizedSeed);
  if (profileOverride === "classic") return createClassicTerrainContext(normalizedSeed, hash);
  if (profileOverride === "floating-islands") return createFloatingIslandTerrainContext(normalizedSeed, hash);

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
    islandOffsetX: 0,
    islandOffsetZ: 0,
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
    islandOffsetX: seededRange(hash, 132, -2100, 2100),
    islandOffsetZ: seededRange(hash, 140, -2100, 2100),
    heightOffset: seededRange(hash, 112, -2, 2),
    treeOffsetX: seededRange(hash, 120, -1900, 1900),
    treeOffsetZ: seededRange(hash, 128, -1900, 1900),
    treeSeed: mixHash(hash ^ 0xa511e9b3)
  };
}

function createFloatingIslandTerrainContext(normalizedSeed: string, hash: number): TerrainContext {
  return {
    seed: normalizedSeed,
    mode: "generated",
    profile: "floating-islands",
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
    islandOffsetX: seededRange(hash, 132, -2100, 2100),
    islandOffsetZ: seededRange(hash, 140, -2100, 2100),
    heightOffset: seededRange(hash, 112, -2, 2),
    treeOffsetX: seededRange(hash, 120, -1900, 1900),
    treeOffsetZ: seededRange(hash, 128, -1900, 1900),
    treeSeed: mixHash(hash ^ 0xd1b54a35)
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
      if (terrain.profile === "floating-islands") {
        generateFloatingIslandColumn(blocks, x, z, wx, wz, terrain);
        continue;
      }

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
  if (terrain.profile === "floating-islands") {
    return getFloatingIslandColumn(wx, wz, terrain)?.top ?? 0;
  }

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
  const mountainMask = smoothstep(0.42, 0.88, landform);
  const cliffSource = signedFbm2(
    wx * 0.019 + terrain.islandOffsetX,
    wz * 0.019 + terrain.islandOffsetZ,
    4
  );
  const cliffBands = Math.pow(1 - Math.abs(cliffSource), 1.45) * mountainMask;

  let height =
    13 +
    terrain.heightOffset +
    landform * (14 + mountainMask * 16) +
    rollingHills * (3.5 + roughness * 8 + mountainMask * 7) +
    ridge * roughness * (10 + mountainMask * 14) +
    cliffBands * 16 -
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
  if (terrain.profile === "floating-islands") return getFloatingIslandSurfaceBlock(wx, wz, height, terrain);

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

type FloatingIslandColumn = {
  readonly top: number;
  readonly bottom: number;
  readonly centerStrength: number;
};

function generateFloatingIslandColumn(
  blocks: Uint8Array,
  localX: number,
  localZ: number,
  wx: number,
  wz: number,
  terrain: TerrainContext
): void {
  const island = getFloatingIslandColumn(wx, wz, terrain);
  if (!island) return;

  const surfaceBlock = getFloatingIslandSurfaceBlock(wx, wz, island.top, terrain);
  for (let y = island.bottom; y <= island.top; y += 1) {
    blocks[index(localX, y, localZ)] = getFloatingIslandBlock(y, island.top, island.bottom, surfaceBlock);
  }
}

function getFloatingIslandColumn(wx: number, wz: number, terrain: TerrainContext): FloatingIslandColumn | null {
  const field = getFloatingIslandField(wx, wz, terrain);
  const threshold = 0.58;
  if (field.strength < threshold) return null;

  // The mask strength now behaves like an island cross-section: broad enough
  // to create playable green plateaus, but steep enough near the rim that the
  // underside tapers into dramatic stone points instead of slabby pancakes.
  const centerStrength = smoothstep(threshold, 0.9, field.strength);
  const ridgeSource = signedFbm2(
    wx * 0.017 + terrain.ridgeOffsetX,
    wz * 0.017 + terrain.ridgeOffsetZ,
    4
  );
  const ridge = Math.pow(1 - Math.abs(ridgeSource), 2.2);
  const detail = signedFbm2(
    wx * 0.071 + terrain.detailOffsetX,
    wz * 0.071 + terrain.detailOffsetZ,
    3
  );
  const plateauLift = smoothstep(0.2, 0.82, centerStrength);
  const baseTop = 56 +
    terrain.heightOffset +
    field.heightNoise * 8 +
    plateauLift * 5 +
    ridge * centerStrength * 3 +
    detail * (1 + centerStrength);
  const top = Math.floor(clamp(baseTop, 34, WORLD_HEIGHT - 10));
  const undersideTaper = Math.pow(centerStrength, 1.65);
  const thickness = Math.floor(clamp(
    2 + undersideTaper * 36 + ridge * undersideTaper * 8 + Math.max(0, -detail) * 3,
    2,
    48
  ));
  const bottom = Math.max(2, top - thickness);

  return { top, bottom, centerStrength };
}

function getFloatingIslandField(
  wx: number,
  wz: number,
  terrain: TerrainContext
): { readonly strength: number; readonly heightNoise: number } {
  const broad = normalizedFbm2(
    wx * 0.0035 + terrain.landformOffsetX,
    wz * 0.0035 + terrain.landformOffsetZ,
    5
  );
  const blob = normalizedFbm2(
    wx * 0.0105 + terrain.islandOffsetX,
    wz * 0.0105 + terrain.islandOffsetZ,
    4
  );
  const tornEdge = signedFbm2(
    wx * 0.033 + terrain.washOffsetX,
    wz * 0.033 + terrain.washOffsetZ,
    3
  );
  const skyGapSource = signedFbm2(
    wx * 0.012 + terrain.terraceOffsetX,
    wz * 0.012 + terrain.terraceOffsetZ,
    3
  );
  const skyGap = (1 - smoothstep(0.035, 0.18, Math.abs(skyGapSource))) * 0.2;
  const distanceFromSpawn = Math.hypot(wx - 2, wz - 2);
  const spawnIsland = 1 - smoothstep(28, 76, distanceFromSpawn);
  const strength = clamp(broad * 0.34 + blob * 0.48 + tornEdge * 0.08 + spawnIsland * 0.74 - skyGap, 0, 1);
  const heightNoise = signedFbm2(
    wx * 0.004 + terrain.continentOffsetX,
    wz * 0.004 + terrain.continentOffsetZ,
    4
  );
  return { strength, heightNoise };
}

function getFloatingIslandSurfaceBlock(
  wx: number,
  wz: number,
  height: number,
  terrain: TerrainContext
): BlockId {
  const island = getFloatingIslandColumn(wx, wz, terrain);
  if (!island || height <= 0) return BLOCK.air;

  const climate = normalizedFbm2(
    wx * 0.013 + terrain.climateOffsetX,
    wz * 0.013 + terrain.climateOffsetZ,
    4
  );
  if (island.centerStrength < 0.24 || height >= WORLD_HEIGHT - 18) return BLOCK.stone;
  if (climate < 0.16) return BLOCK.sand;
  return BLOCK.moss;
}

function getFloatingIslandBlock(
  y: number,
  top: number,
  bottom: number,
  surfaceBlock: BlockId
): BlockId {
  const depth = top - y;
  if (depth === 0) return surfaceBlock;
  if (surfaceBlock === BLOCK.sand && depth <= 2) return BLOCK.sand;
  if ((surfaceBlock === BLOCK.grass || surfaceBlock === BLOCK.moss) && depth <= 2) return BLOCK.dirt;
  if (y <= bottom + 1) return BLOCK.stone;
  return depth <= 3 ? BLOCK.dirt : BLOCK.stone;
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
  if (terrain.mode !== "generated" || (terrain.profile !== "varied" && terrain.profile !== "floating-islands")) return;

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
  const surfaceBlock = getTerrainSurfaceBlock(wx, wz, surfaceY, terrain);
  if (!isTreeRootSurfaceBlock(surfaceBlock, terrain)) return;
  if (!isTreeFriendlySlope(wx, wz, surfaceY, terrain)) return;

  const probability = getTreeProbability(wx, wz, surfaceY, terrain);
  if (hashUnit(hash ^ 0xc2b2ae35) > probability) {
    placeFloatingIslandBushPatch(wx, wz, hash, cx, cz, blocks, terrain, surfaceY);
    return;
  }

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

function isTreeRootSurfaceBlock(block: BlockId, terrain: TerrainContext): boolean {
  return block === BLOCK.grass || (terrain.profile === "floating-islands" && block === BLOCK.moss);
}

function placeFloatingIslandBushPatch(
  wx: number,
  wz: number,
  hash: number,
  cx: number,
  cz: number,
  blocks: Uint8Array,
  terrain: TerrainContext,
  surfaceY: number
): void {
  if (terrain.profile !== "floating-islands") return;

  const grove = normalizedFbm2(
    wx * 0.022 + terrain.treeOffsetX,
    wz * 0.022 + terrain.treeOffsetZ,
    4
  );
  const probability = smoothstep(0.38, 0.76, grove) * 0.52;
  if (hashUnit(hash ^ 0x7f4a7c15) > probability) return;

  // Bushes are still full gameplay voxels for this pass. Keep them sparse,
  // low, and clustered on island crowns so they read as dark overgrowth
  // without pretending we already have a non-solid plant/decal layer.
  const radius = hashUnit(hash ^ 0x94d049bb) > 0.62 ? 1 : 0;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const distance = Math.abs(dx) + Math.abs(dz);
      if (distance > radius + 1) continue;
      const cellHash = hashWorldCell(hash ^ 0x6c8e9cf5, wx + dx, surfaceY + 1, wz + dz);
      if (distance > radius && hashUnit(cellHash) < 0.45) continue;
      setDecoratedBlockIfInside(cx, cz, blocks, wx + dx, surfaceY + 1, wz + dz, BLOCK.bush);
      if (distance === 0 && hashUnit(cellHash ^ 0x27d4eb2d) > 0.78) {
        setDecoratedBlockIfInside(cx, cz, blocks, wx + dx, surfaceY + 2, wz + dz, BLOCK.bush);
      }
    }
  }
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
  if (terrain.profile === "varied") return height - EXPANDED_TERRAIN_SURFACE_OFFSET;
  if (terrain.profile === "floating-islands") return height - 42;
  return height;
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
