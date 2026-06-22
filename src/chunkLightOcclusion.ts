import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export type ChunkRenderableSampler = (localX: number, y: number, localZ: number) => boolean;

export type ChunkSkyExposure = {
  getLightBucketForNeighbor(localX: number, y: number, localZ: number): number;
};

export const SKY_EXPOSED_LIGHT_BUCKET = 0;
export const ENCLOSED_LIGHT_BUCKET = 1;

const PADDED_CHUNK_SIZE = CHUNK_SIZE + 2;
const LIGHT_BUCKET_SHIFT = 16;
const LIGHT_BUCKET_MASK = 0xff;
const BASE_MESH_KEY_MASK = (1 << LIGHT_BUCKET_SHIFT) - 1;
const ENCLOSED_AIR_SHADE_MULTIPLIER = 0.3;

export function createChunkSkyExposure(isRenderableSolidAt: ChunkRenderableSampler): ChunkSkyExposure {
  const skyConnected = new Uint8Array(PADDED_CHUNK_SIZE * WORLD_HEIGHT * PADDED_CHUNK_SIZE);
  const queue = new Int32Array(skyConnected.length);
  let read = 0;
  let write = 0;

  const enqueue = (localX: number, y: number, localZ: number): void => {
    if (!isPaddedCell(localX, y, localZ)) return;
    if (isRenderableSolidAt(localX, y, localZ)) return;
    const cellIndex = paddedIndex(localX, y, localZ);
    if (skyConnected[cellIndex]) return;
    skyConnected[cellIndex] = 1;
    queue[write] = cellIndex;
    write += 1;
  };

  // Sun/sky reaches the chunk through open cells that can see the world top.
  // Flooding from that roofline gives sealed rooms and enclosed boxes a cheap
  // baked darkness pass without doing expensive global lighting.
  for (let localX = -1; localX <= CHUNK_SIZE; localX += 1) {
    for (let localZ = -1; localZ <= CHUNK_SIZE; localZ += 1) {
      enqueue(localX, WORLD_HEIGHT - 1, localZ);
    }
  }

  while (read < write) {
    const cellIndex = queue[read];
    read += 1;
    const { localX, y, localZ } = unpackPaddedIndex(cellIndex);
    enqueue(localX + 1, y, localZ);
    enqueue(localX - 1, y, localZ);
    enqueue(localX, y + 1, localZ);
    enqueue(localX, y - 1, localZ);
    enqueue(localX, y, localZ + 1);
    enqueue(localX, y, localZ - 1);
  }

  return {
    getLightBucketForNeighbor(localX: number, y: number, localZ: number): number {
      if (y >= WORLD_HEIGHT) return SKY_EXPOSED_LIGHT_BUCKET;
      if (!isPaddedCell(localX, y, localZ)) return SKY_EXPOSED_LIGHT_BUCKET;
      return skyConnected[paddedIndex(localX, y, localZ)]
        ? SKY_EXPOSED_LIGHT_BUCKET
        : ENCLOSED_LIGHT_BUCKET;
    }
  };
}

export function createLitBlockMeshKey(meshKey: number, lightBucket: number): number {
  return meshKey | ((lightBucket & LIGHT_BUCKET_MASK) << LIGHT_BUCKET_SHIFT);
}

export function getBaseBlockMeshKey(litMeshKey: number): number {
  return litMeshKey & BASE_MESH_KEY_MASK;
}

export function getLitBlockShadeMultiplier(litMeshKey: number): number {
  const lightBucket = (litMeshKey >>> LIGHT_BUCKET_SHIFT) & LIGHT_BUCKET_MASK;
  return lightBucket === ENCLOSED_LIGHT_BUCKET ? ENCLOSED_AIR_SHADE_MULTIPLIER : 1;
}

function isPaddedCell(localX: number, y: number, localZ: number): boolean {
  return (
    localX >= -1 &&
    localX <= CHUNK_SIZE &&
    y >= 0 &&
    y < WORLD_HEIGHT &&
    localZ >= -1 &&
    localZ <= CHUNK_SIZE
  );
}

function paddedIndex(localX: number, y: number, localZ: number): number {
  return (localX + 1) + PADDED_CHUNK_SIZE * ((localZ + 1) + PADDED_CHUNK_SIZE * y);
}

function unpackPaddedIndex(cellIndex: number): { localX: number; y: number; localZ: number } {
  const paddedX = cellIndex % PADDED_CHUNK_SIZE;
  const yz = Math.floor(cellIndex / PADDED_CHUNK_SIZE);
  const paddedZ = yz % PADDED_CHUNK_SIZE;
  const y = Math.floor(yz / PADDED_CHUNK_SIZE);
  return {
    localX: paddedX - 1,
    y,
    localZ: paddedZ - 1
  };
}
