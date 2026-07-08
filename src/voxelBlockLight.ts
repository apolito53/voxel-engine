import { BLOCK, BLOCKS } from "./blocks";
import type {
  ChunkBlockLightBuffers,
  ChunkBlockLights,
  ChunkNeighborBlocks,
  ChunkNeighborBuffers
} from "./chunkProtocol";
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

export type BlockLightFaceNormal = readonly [number, number, number];
export type BlockLightSamplePoint = readonly [number, number, number] | {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};
export type QuadBlockLightLevels = readonly [number, number, number, number];

export const BLOCK_LIGHT_MIN_LEVEL = 0;
export const BLOCK_LIGHT_MAX_LEVEL = 15;
export const BLOCK_LIGHT_RADIUS = BLOCK_LIGHT_MAX_LEVEL;

const CHUNK_CELL_COUNT = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
const EXTENDED_MIN_LOCAL = -BLOCK_LIGHT_RADIUS;
const EXTENDED_MAX_LOCAL = CHUNK_SIZE - 1 + BLOCK_LIGHT_RADIUS;
const EXTENDED_SIZE = CHUNK_SIZE + BLOCK_LIGHT_RADIUS * 2;
const EXTENDED_CELL_COUNT = EXTENDED_SIZE * WORLD_HEIGHT * EXTENDED_SIZE;
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

export function readChunkBlockLightBuffers(blockLights?: ChunkBlockLightBuffers | null): ChunkBlockLights {
  return {
    current: blockLights?.current ? new Uint8Array(blockLights.current) : null,
    neighbors: readChunkBlockLightNeighborBuffers(blockLights?.neighbors)
  };
}

export function getBlockLightAt(
  blockLights: ChunkBlockLights,
  x: number,
  y: number,
  z: number
): number {
  if (y < 0 || y >= WORLD_HEIGHT) return 0;
  return normalizeBlockLightLevel(getChunkBlockLightValueAt(blockLights.current, blockLights.neighbors, x, y, z) ?? 0);
}

export function getSmoothedFaceBlockLightCorners(
  blockLights: ChunkBlockLights,
  normal: BlockLightFaceNormal,
  corners: readonly [
    BlockLightSamplePoint,
    BlockLightSamplePoint,
    BlockLightSamplePoint,
    BlockLightSamplePoint
  ]
): QuadBlockLightLevels {
  return [
    getSmoothedFaceVertexBlockLight(blockLights, normal, corners[0], corners[0]),
    getSmoothedFaceVertexBlockLight(blockLights, normal, corners[1], corners[1]),
    getSmoothedFaceVertexBlockLight(blockLights, normal, corners[2], corners[2]),
    getSmoothedFaceVertexBlockLight(blockLights, normal, corners[3], corners[3])
  ];
}

export function getSmoothedFaceVertexBlockLight(
  blockLights: ChunkBlockLights,
  normal: BlockLightFaceNormal,
  vertex: BlockLightSamplePoint,
  faceSideCell: BlockLightSamplePoint
): number {
  // Block light is still a macro-voxel 0..15 field. Mesh vertices sample only
  // the face-adjacent cells touching that vertex in the face plane, then let
  // the shader interpolate. Fractional partial-terrain vertices stay inside
  // their containing macro row/column instead of reaching through solids.
  if (normal[0] !== 0) {
    const yCells = getTouchingBlockLightCellCoords(getBlockLightSampleY(vertex));
    const zCells = getTouchingBlockLightCellCoords(getBlockLightSampleZ(vertex));
    return averageBlockLight4(
      blockLights,
      Math.floor(getBlockLightSampleX(faceSideCell)),
      yCells[0],
      zCells[0],
      Math.floor(getBlockLightSampleX(faceSideCell)),
      yCells[1],
      zCells[0],
      Math.floor(getBlockLightSampleX(faceSideCell)),
      yCells[0],
      zCells[1],
      Math.floor(getBlockLightSampleX(faceSideCell)),
      yCells[1],
      zCells[1]
    );
  }

  if (normal[1] !== 0) {
    const xCells = getTouchingBlockLightCellCoords(getBlockLightSampleX(vertex));
    const zCells = getTouchingBlockLightCellCoords(getBlockLightSampleZ(vertex));
    return averageBlockLight4(
      blockLights,
      xCells[0],
      Math.floor(getBlockLightSampleY(faceSideCell)),
      zCells[0],
      xCells[1],
      Math.floor(getBlockLightSampleY(faceSideCell)),
      zCells[0],
      xCells[0],
      Math.floor(getBlockLightSampleY(faceSideCell)),
      zCells[1],
      xCells[1],
      Math.floor(getBlockLightSampleY(faceSideCell)),
      zCells[1]
    );
  }

  const xCells = getTouchingBlockLightCellCoords(getBlockLightSampleX(vertex));
  const yCells = getTouchingBlockLightCellCoords(getBlockLightSampleY(vertex));
  return averageBlockLight4(
    blockLights,
    xCells[0],
    yCells[0],
    Math.floor(getBlockLightSampleZ(faceSideCell)),
    xCells[1],
    yCells[0],
    Math.floor(getBlockLightSampleZ(faceSideCell)),
    xCells[0],
    yCells[1],
    Math.floor(getBlockLightSampleZ(faceSideCell)),
    xCells[1],
    yCells[1],
    Math.floor(getBlockLightSampleZ(faceSideCell))
  );
}

export function averageBlockLight4(
  blockLights: ChunkBlockLights,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number
): number {
  return (
    getBlockLightAt(blockLights, ax, ay, az) +
    getBlockLightAt(blockLights, bx, by, bz) +
    getBlockLightAt(blockLights, cx, cy, cz) +
    getBlockLightAt(blockLights, dx, dy, dz)
  ) / 4;
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

function readChunkBlockLightNeighborBuffers(neighbors?: ChunkNeighborBuffers): ChunkNeighborBlocks {
  return {
    negativeX: neighbors?.negativeX ? new Uint8Array(neighbors.negativeX) : null,
    positiveX: neighbors?.positiveX ? new Uint8Array(neighbors.positiveX) : null,
    negativeZ: neighbors?.negativeZ ? new Uint8Array(neighbors.negativeZ) : null,
    positiveZ: neighbors?.positiveZ ? new Uint8Array(neighbors.positiveZ) : null
  };
}

function getChunkBlockLightValueAt(
  current: Uint8Array | null,
  neighbors: ChunkNeighborBlocks,
  x: number,
  y: number,
  z: number
): number | null {
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    return current ? current[getBlockLightIndex(x, y, z)] : null;
  }

  // Mesh-time block-light smoothing may look exactly one cell across a cardinal
  // chunk edge. Farther or diagonal out-of-range reads are darkness so border
  // falloff cannot smear a bright edge cell into a fake halo.
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

function getTouchingBlockLightCellCoords(value: number): readonly [number, number] {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) <= 0.000001) {
    return [rounded - 1, rounded];
  }
  const cell = Math.floor(value);
  return [cell, cell];
}

function getBlockLightSampleX(point: BlockLightSamplePoint): number {
  return "x" in point ? point.x : point[0];
}

function getBlockLightSampleY(point: BlockLightSamplePoint): number {
  return "y" in point ? point.y : point[1];
}

function getBlockLightSampleZ(point: BlockLightSamplePoint): number {
  return "z" in point ? point.z : point[2];
}
