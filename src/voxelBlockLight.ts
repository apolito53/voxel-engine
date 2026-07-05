import { BLOCK, BLOCKS } from "./blocks";
import type { ChunkBlockLights, ChunkNeighborBlocks } from "./chunkProtocol";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export type BlockLightNeighborSnapshots = Readonly<Record<string, Uint8Array | null | undefined>>;

export type ChunkBlockLightBuildInput = {
  readonly blocks: Uint8Array;
  readonly neighbors?: BlockLightNeighborSnapshots;
  readonly partialBlockMask?: Uint8Array | null;
  readonly neighborPartialBlockMasks?: BlockLightNeighborSnapshots;
};

export type ChunkBlockLightBuildResult = {
  readonly blockLight: Uint8Array;
  readonly sourceCount: number;
  readonly litCellCount: number;
  readonly maxQueueDepth: number;
};

export type BlockLightDirtyChunkCoord = {
  readonly cx: number;
  readonly cz: number;
};

export const BLOCK_LIGHT_MIN_LEVEL = 0;
export const BLOCK_LIGHT_MAX_LEVEL = 15;
export const BLOCK_LIGHT_RADIUS = BLOCK_LIGHT_MAX_LEVEL;

const CHUNK_CELL_COUNT = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
const EXTENDED_MIN_LOCAL = -BLOCK_LIGHT_RADIUS;
const EXTENDED_MAX_LOCAL = CHUNK_SIZE - 1 + BLOCK_LIGHT_RADIUS;
const EXTENDED_SIZE = CHUNK_SIZE + BLOCK_LIGHT_RADIUS * 2;
const EXTENDED_CELL_COUNT = EXTENDED_SIZE * WORLD_HEIGHT * EXTENDED_SIZE;
const TANGENTIAL_BLOCK_LIGHT_SCALE = 0.35;
const NEIGHBOR_STEPS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
] as const;

export function buildChunkBlockLight(input: ChunkBlockLightBuildInput): ChunkBlockLightBuildResult {
  const extendedLight = new Uint8Array(EXTENDED_CELL_COUNT);
  const queue = new Int32Array(EXTENDED_CELL_COUNT);
  let readIndex = 0;
  let writeIndex = 0;
  let sourceCount = 0;
  let maxQueueDepth = 0;

  const enqueue = (localX: number, y: number, localZ: number, level: number): void => {
    if (!isExtendedCell(localX, y, localZ)) return;
    const clampedLevel = normalizeBlockLightLevel(level);
    if (clampedLevel <= BLOCK_LIGHT_MIN_LEVEL) return;
    const index = getExtendedBlockLightIndex(localX, y, localZ);
    if (extendedLight[index] >= clampedLevel) return;
    extendedLight[index] = clampedLevel;
    queue[writeIndex] = index;
    writeIndex += 1;
    maxQueueDepth = Math.max(maxQueueDepth, writeIndex - readIndex);
  };

  // Sources are scanned from the current chunk plus the one-chunk halo. A
  // 15-step block light cannot reach farther than the immediate neighbors when
  // chunks are 16 blocks wide, including diagonals near chunk corners.
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let localZ = EXTENDED_MIN_LOCAL; localZ <= EXTENDED_MAX_LOCAL; localZ += 1) {
      for (let localX = EXTENDED_MIN_LOCAL; localX <= EXTENDED_MAX_LOCAL; localX += 1) {
        const emission = getBlockLightEmission(sampleBlock(input, localX, y, localZ));
        if (emission <= BLOCK_LIGHT_MIN_LEVEL) continue;
        sourceCount += 1;
        enqueue(localX, y, localZ, emission);
      }
    }
  }

  while (readIndex < writeIndex) {
    const packedIndex = queue[readIndex];
    readIndex += 1;
    const level = extendedLight[packedIndex];
    if (level <= 1) continue;

    const cell = unpackExtendedBlockLightIndex(packedIndex);
    const nextLevel = level - 1;
    for (const [dx, dy, dz] of NEIGHBOR_STEPS) {
      const nextX = cell.localX + dx;
      const nextY = cell.y + dy;
      const nextZ = cell.localZ + dz;
      if (!isExtendedCell(nextX, nextY, nextZ)) continue;
      const nextBlock = sampleBlock(input, nextX, nextY, nextZ);
      const nextMask = samplePartialMask(input, nextX, nextY, nextZ);
      if (isBlockLightOpaque(nextBlock, nextMask) && getBlockLightEmission(nextBlock) <= 0) continue;
      enqueue(nextX, nextY, nextZ, nextLevel);
    }
  }

  const blockLight = new Uint8Array(CHUNK_CELL_COUNT);
  let litCellCount = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const lightLevel = extendedLight[getExtendedBlockLightIndex(localX, y, localZ)];
        blockLight[getBlockLightIndex(localX, y, localZ)] = lightLevel;
        if (lightLevel > BLOCK_LIGHT_MIN_LEVEL) litCellCount += 1;
      }
    }
  }

  return {
    blockLight,
    sourceCount,
    litCellCount,
    maxQueueDepth
  };
}

export function createEmptyChunkBlockLight(): Uint8Array {
  return new Uint8Array(CHUNK_CELL_COUNT);
}

export function getBlockLightIndex(localX: number, y: number, localZ: number): number {
  return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * y);
}

export function getChunkBlockLightAt(
  blockLights: ChunkBlockLights,
  x: number,
  y: number,
  z: number
): number {
  if (y < 0 || y >= WORLD_HEIGHT) return 0;
  const light = getChunkLightValueAt(blockLights.current, blockLights.neighbors, x, y, z);
  return normalizeBlockLightLevel(light ?? 0);
}

export function getChunkFaceBlockLightAt(
  blockLights: ChunkBlockLights,
  x: number,
  y: number,
  z: number,
  normalX: number,
  normalY: number,
  normalZ: number
): number {
  const centerLight = getChunkBlockLightAt(blockLights, x, y, z);
  if (centerLight <= 0) return 0;

  const forwardLight = getChunkBlockLightAt(
    blockLights,
    x + normalX,
    y + normalY,
    z + normalZ
  );
  if (forwardLight > centerLight) return centerLight;

  const tangentLight = getMaxTangentialBlockLightAt(blockLights, x, y, z, normalX, normalY, normalZ);
  if (tangentLight > forwardLight && tangentLight >= centerLight) {
    // A scalar voxel light field makes a surface beside a Lamp look like the
    // Lamp is directly in front of that face. Keep the propagation data intact,
    // but soften light that clearly arrives along the face plane.
    return normalizeBlockLightLevel(centerLight * TANGENTIAL_BLOCK_LIGHT_SCALE);
  }

  return centerLight;
}

export function normalizeBlockLightLevel(value: number): number {
  if (!Number.isFinite(value)) return BLOCK_LIGHT_MIN_LEVEL;
  return Math.max(BLOCK_LIGHT_MIN_LEVEL, Math.min(BLOCK_LIGHT_MAX_LEVEL, Math.round(value)));
}

export function getBlockLightEmission(block: number): number {
  return block === BLOCK.lamp ? BLOCK_LIGHT_MAX_LEVEL : BLOCK_LIGHT_MIN_LEVEL;
}

export function isBlockLightOpaque(block: number, partialMaskValue = 0): boolean {
  if (block === BLOCK.air) return false;
  if (partialMaskValue > 0) return true;
  return BLOCKS[block]?.solid ?? true;
}

export function createBlockLightNeighborKey(dx: number, dz: number): string {
  return `${Math.sign(dx)},${Math.sign(dz)}`;
}

export function getDirtyBlockLightChunkCoordsForEdit(
  worldX: number,
  worldZ: number,
  radius = BLOCK_LIGHT_RADIUS
): readonly BlockLightDirtyChunkCoord[] {
  const safeRadius = Math.max(0, Math.floor(Number.isFinite(radius) ? radius : BLOCK_LIGHT_RADIUS));
  const minChunkX = worldToChunkCoord(Math.floor(worldX) - safeRadius);
  const maxChunkX = worldToChunkCoord(Math.floor(worldX) + safeRadius);
  const minChunkZ = worldToChunkCoord(Math.floor(worldZ) - safeRadius);
  const maxChunkZ = worldToChunkCoord(Math.floor(worldZ) + safeRadius);
  const coords: BlockLightDirtyChunkCoord[] = [];

  for (let cz = minChunkZ; cz <= maxChunkZ; cz += 1) {
    for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
      coords.push({ cx, cz });
    }
  }

  return coords;
}

function sampleBlock(input: ChunkBlockLightBuildInput, localX: number, y: number, localZ: number): number {
  const snapshot = getSnapshotForExtendedCell(input.blocks, input.neighbors, localX, localZ);
  if (!snapshot) return BLOCK.air;
  const wrapped = wrapExtendedCell(localX, localZ);
  return snapshot[getBlockLightIndex(wrapped.localX, y, wrapped.localZ)] ?? BLOCK.air;
}

function samplePartialMask(input: ChunkBlockLightBuildInput, localX: number, y: number, localZ: number): number {
  const snapshot = getSnapshotForExtendedCell(input.partialBlockMask ?? undefined, input.neighborPartialBlockMasks, localX, localZ);
  if (!snapshot) return 0;
  const wrapped = wrapExtendedCell(localX, localZ);
  return snapshot[getBlockLightIndex(wrapped.localX, y, wrapped.localZ)] ?? 0;
}

function getMaxTangentialBlockLightAt(
  blockLights: ChunkBlockLights,
  x: number,
  y: number,
  z: number,
  normalX: number,
  normalY: number,
  normalZ: number
): number {
  let maxLight = 0;
  for (const [dx, dy, dz] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ] as const) {
    if (dx === normalX && dy === normalY && dz === normalZ) continue;
    if (dx === -normalX && dy === -normalY && dz === -normalZ) continue;
    maxLight = Math.max(maxLight, getChunkBlockLightAt(blockLights, x + dx, y + dy, z + dz));
  }
  return maxLight;
}

function getChunkLightValueAt(
  current: Uint8Array | null,
  neighbors: ChunkNeighborBlocks,
  x: number,
  y: number,
  z: number
): number | null {
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    return current ? current[getBlockLightIndex(x, y, z)] : null;
  }

  // Mesh jobs only carry the current chunk plus the four cardinal neighbor
  // light buffers. Treat exactly one cell outside the chunk as the sampled
  // halo; farther coordinates are genuinely unknown, not another copy of the
  // edge cell. Without this guard, face-light lookups can flatten falloff by
  // reading the same bright neighbor voxel for x=-1, x=-2, x=-3, and so on.
  if (x === -1 && z >= 0 && z < CHUNK_SIZE && neighbors.negativeX) {
    return neighbors.negativeX[getBlockLightIndex(CHUNK_SIZE - 1, y, z)];
  }

  if (x === CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && neighbors.positiveX) {
    return neighbors.positiveX[getBlockLightIndex(0, y, z)];
  }

  if (z === -1 && x >= 0 && x < CHUNK_SIZE && neighbors.negativeZ) {
    return neighbors.negativeZ[getBlockLightIndex(x, y, CHUNK_SIZE - 1)];
  }

  if (z === CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && neighbors.positiveZ) {
    return neighbors.positiveZ[getBlockLightIndex(x, y, 0)];
  }

  return null;
}

function getSnapshotForExtendedCell(
  current: Uint8Array | undefined,
  neighbors: BlockLightNeighborSnapshots | undefined,
  localX: number,
  localZ: number
): Uint8Array | null | undefined {
  const dx = getNeighborOffset(localX);
  const dz = getNeighborOffset(localZ);
  if (dx === 0 && dz === 0) return current;
  return neighbors?.[createBlockLightNeighborKey(dx, dz)];
}

function getNeighborOffset(localCoord: number): -1 | 0 | 1 {
  if (localCoord < 0) return -1;
  if (localCoord >= CHUNK_SIZE) return 1;
  return 0;
}

function wrapExtendedCell(localX: number, localZ: number): { localX: number; localZ: number } {
  return {
    localX: wrapExtendedCoord(localX),
    localZ: wrapExtendedCoord(localZ)
  };
}

function wrapExtendedCoord(localCoord: number): number {
  if (localCoord < 0) return localCoord + CHUNK_SIZE;
  if (localCoord >= CHUNK_SIZE) return localCoord - CHUNK_SIZE;
  return localCoord;
}

function isExtendedCell(localX: number, y: number, localZ: number): boolean {
  return (
    localX >= EXTENDED_MIN_LOCAL &&
    localX <= EXTENDED_MAX_LOCAL &&
    y >= 0 &&
    y < WORLD_HEIGHT &&
    localZ >= EXTENDED_MIN_LOCAL &&
    localZ <= EXTENDED_MAX_LOCAL
  );
}

function getExtendedBlockLightIndex(localX: number, y: number, localZ: number): number {
  const paddedX = localX - EXTENDED_MIN_LOCAL;
  const paddedZ = localZ - EXTENDED_MIN_LOCAL;
  return paddedX + EXTENDED_SIZE * (paddedZ + EXTENDED_SIZE * y);
}

function unpackExtendedBlockLightIndex(index: number): { localX: number; y: number; localZ: number } {
  const paddedX = index % EXTENDED_SIZE;
  const yz = Math.floor(index / EXTENDED_SIZE);
  const paddedZ = yz % EXTENDED_SIZE;
  const y = Math.floor(yz / EXTENDED_SIZE);
  return {
    localX: paddedX + EXTENDED_MIN_LOCAL,
    y,
    localZ: paddedZ + EXTENDED_MIN_LOCAL
  };
}

function worldToChunkCoord(worldCoord: number): number {
  return Math.floor(worldCoord / CHUNK_SIZE);
}
