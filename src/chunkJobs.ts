import { BLOCK, BLOCKS } from "./blocks";
import { getMaterialBlockColor } from "./blockColors";
import { appendBlockTextureQuadAttributes } from "./blockTextureTiles";
import {
  createChunkSkyExposure,
  createLitBlockMeshKey,
  getBaseBlockMeshKey,
  getLitBlockFaceShade,
  type ChunkSkyExposure
} from "./chunkLightOcclusion";
import type {
  ChunkGeneratedResult,
  ChunkGenerateRequest,
  ChunkMeshData,
  ChunkMeshedResult,
  ChunkMeshRequest,
  ChunkNeighborBlocks,
  ChunkNeighborBuffers,
  ChunkPartialBlockMaskBuffers,
  ChunkPartialBlockMasks
} from "./chunkProtocol";
import { createTerrainContext, generateChunkBlocks } from "./terrain";
import type { TerrainContext, TerrainProfile } from "./terrain";
import { getSunlitFaceShade } from "./voxelLighting";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export const CHUNK_GENERATE_JOB = "chunk:generate";
export const CHUNK_MESH_JOB = "chunk:mesh";

export type ChunkGenerateJobPayload = Omit<ChunkGenerateRequest, "type">;
export type ChunkMeshJobPayload = Omit<ChunkMeshRequest, "type">;
export type ChunkJobPayload = ChunkGenerateJobPayload | ChunkMeshJobPayload;
export type ChunkJobResult = ChunkGeneratedResult | ChunkMeshedResult;

const terrainContexts = new Map<string, TerrainContext>();

export function buildChunkGenerateJob(payload: ChunkGenerateJobPayload): ChunkGeneratedResult {
  const blocks = generateChunkBlocks(
    payload.cx,
    payload.cz,
    getTerrainContext(payload.seed, payload.terrainProfile)
  );

  return {
    type: "generated",
    requestId: payload.requestId,
    cx: payload.cx,
    cz: payload.cz,
    blocks
  };
}

export function buildChunkMeshJob(payload: ChunkMeshJobPayload): ChunkMeshedResult {
  const meshData = buildChunkMesh({
    cx: payload.cx,
    cz: payload.cz,
    blocks: new Uint8Array(payload.blocks),
    neighbors: readNeighbors(payload.neighbors),
    partialBlockMasks: readPartialBlockMasks(payload.partialBlockMasks)
  });

  return {
    type: "meshed",
    requestId: payload.requestId,
    cx: payload.cx,
    cz: payload.cz,
    revision: payload.revision,
    positions: meshData.positions,
    normals: meshData.normals,
    colors: meshData.colors,
    uvs: meshData.uvs,
    textureTiles: meshData.textureTiles,
    indices: meshData.indices
  };
}

export function getChunkJobResultTransfers(result: ChunkJobResult): Transferable[] {
  if (result.type === "generated") {
    return [result.blocks.buffer];
  }

  return [
    result.positions.buffer,
    result.normals.buffer,
    result.colors.buffer,
    result.uvs.buffer,
    result.textureTiles.buffer,
    result.indices.buffer
  ];
}

function getTerrainContext(seed = "", terrainProfile?: TerrainProfile): TerrainContext {
  const key = `${String(seed || "")}|${terrainProfile ?? "auto"}`;
  let context = terrainContexts.get(key);
  if (!context) {
    // Cache by seed/profile so legacy saves and newer varied worlds can coexist
    // without worker-generated chunks drifting between terrain provenance lanes.
    context = createTerrainContext(seed, terrainProfile);
    terrainContexts.set(key, context);
  }
  return context;
}

function readNeighbors(neighbors: ChunkNeighborBuffers): ChunkNeighborBlocks {
  return {
    negativeX: neighbors.negativeX ? new Uint8Array(neighbors.negativeX) : null,
    positiveX: neighbors.positiveX ? new Uint8Array(neighbors.positiveX) : null,
    negativeZ: neighbors.negativeZ ? new Uint8Array(neighbors.negativeZ) : null,
    positiveZ: neighbors.positiveZ ? new Uint8Array(neighbors.positiveZ) : null
  };
}

function readPartialBlockMasks(partialBlockMasks: ChunkPartialBlockMaskBuffers): ChunkPartialBlockMasks {
  return {
    current: partialBlockMasks.current ? new Uint8Array(partialBlockMasks.current) : null,
    neighbors: readNeighbors(partialBlockMasks.neighbors)
  };
}

function buildChunkMesh({
  cx,
  cz,
  blocks,
  neighbors,
  partialBlockMasks
}: {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  neighbors: ChunkNeighborBlocks;
  partialBlockMasks: ChunkPartialBlockMasks;
}): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const textureTiles: number[] = [];
  const indices: number[] = [];
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const skyExposure = createChunkSkyExposure((x, y, z) => (
    isRenderableSolidAt(blocks, neighbors, partialBlockMasks, x, y, z)
  ));

  buildXFaces(blocks, neighbors, partialBlockMasks, skyExposure, ox, oz, positions, normals, colors, uvs, textureTiles, indices);
  buildYFaces(blocks, neighbors, partialBlockMasks, skyExposure, ox, oz, positions, normals, colors, uvs, textureTiles, indices);
  buildZFaces(blocks, neighbors, partialBlockMasks, skyExposure, ox, oz, positions, normals, colors, uvs, textureTiles, indices);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    textureTiles: new Float32Array(textureTiles),
    indices: new Uint32Array(indices)
  };
}

function buildXFaces(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  partialBlockMasks: ChunkPartialBlockMasks,
  skyExposure: ChunkSkyExposure,
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  textureTiles: number[],
  indices: number[]
): void {
  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    emitGreedyFaces(
      WORLD_HEIGHT,
      CHUNK_SIZE,
      (y, z) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x + 1, y, z, ox + x, y, oz + z),
      (y, z, height, width, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [1, 0, 0],
          [
            [ox + x + 1, y, oz + z],
            [ox + x + 1, y + height, oz + z],
            [ox + x + 1, y + height, oz + z + width],
            [ox + x + 1, y, oz + z + width]
          ]
        );
      }
    );

    emitGreedyFaces(
      WORLD_HEIGHT,
      CHUNK_SIZE,
      (y, z) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x - 1, y, z, ox + x, y, oz + z),
      (y, z, height, width, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [-1, 0, 0],
          [
            [ox + x, y, oz + z + width],
            [ox + x, y + height, oz + z + width],
            [ox + x, y + height, oz + z],
            [ox + x, y, oz + z]
          ]
        );
      }
    );
  }
}

function buildYFaces(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  partialBlockMasks: ChunkPartialBlockMasks,
  skyExposure: ChunkSkyExposure,
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  textureTiles: number[],
  indices: number[]
): void {
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    emitGreedyFaces(
      CHUNK_SIZE,
      CHUNK_SIZE,
      (x, z) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x, y + 1, z, ox + x, y, oz + z),
      (x, z, width, depth, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [0, 1, 0],
          [
            [ox + x, y + 1, oz + z + depth],
            [ox + x + width, y + 1, oz + z + depth],
            [ox + x + width, y + 1, oz + z],
            [ox + x, y + 1, oz + z]
          ]
        );
      }
    );

    emitGreedyFaces(
      CHUNK_SIZE,
      CHUNK_SIZE,
      (x, z) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x, y - 1, z, ox + x, y, oz + z),
      (x, z, width, depth, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [0, -1, 0],
          [
            [ox + x, y, oz + z],
            [ox + x + width, y, oz + z],
            [ox + x + width, y, oz + z + depth],
            [ox + x, y, oz + z + depth]
          ]
        );
      }
    );
  }
}

function buildZFaces(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  partialBlockMasks: ChunkPartialBlockMasks,
  skyExposure: ChunkSkyExposure,
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  textureTiles: number[],
  indices: number[]
): void {
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    emitGreedyFaces(
      CHUNK_SIZE,
      WORLD_HEIGHT,
      (x, y) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x, y, z + 1, ox + x, y, oz + z),
      (x, y, width, height, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [0, 0, 1],
          [
            [ox + x + width, y, oz + z + 1],
            [ox + x + width, y + height, oz + z + 1],
            [ox + x, y + height, oz + z + 1],
            [ox + x, y, oz + z + 1]
          ]
        );
      }
    );

    emitGreedyFaces(
      CHUNK_SIZE,
      WORLD_HEIGHT,
      (x, y) => exposedBlock(blocks, neighbors, partialBlockMasks, skyExposure, x, y, z, x, y, z - 1, ox + x, y, oz + z),
      (x, y, width, height, block) => {
        addQuad(
          positions,
          normals,
          colors,
          uvs,
          textureTiles,
          indices,
          block,
          [0, 0, -1],
          [
            [ox + x, y, oz + z],
            [ox + x, y + height, oz + z],
            [ox + x + width, y + height, oz + z],
            [ox + x + width, y, oz + z]
          ]
        );
      }
    );
  }
}

function exposedBlock(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  partialBlockMasks: ChunkPartialBlockMasks,
  skyExposure: ChunkSkyExposure,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  worldX: number,
  worldY: number,
  worldZ: number
): number {
  const block = blocks[index(x, y, z)];
  if (
    !BLOCKS[block].solid ||
    isPartialBlockAt(partialBlockMasks, x, y, z) ||
    isRenderableSolidAt(blocks, neighbors, partialBlockMasks, nx, ny, nz)
  ) {
    return BLOCK.air;
  }
  // Keep the merge key tied to material and light bucket only. Coordinate
  // variants belong in the shader/texture path; putting them here fragments
  // otherwise flat greedy faces and can leave bright MSAA seams in interiors.
  return createLitBlockMeshKey(
    block,
    skyExposure.getLightBucketForNeighbor(nx, ny, nz)
  );
}

function isRenderableSolidAt(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  partialBlockMasks: ChunkPartialBlockMasks,
  x: number,
  y: number,
  z: number
): boolean {
  if (y < 0) return true;
  if (y >= WORLD_HEIGHT) return false;
  if (isPartialBlockAt(partialBlockMasks, x, y, z)) return false;
  const block = getBlockAt(blocks, neighbors, x, y, z);

  // Missing neighbor chunks are unknown, not air. Treat them as solid for this
  // mesh pass so streaming does not draw temporary chunk-edge walls that vanish
  // a few frames later when the real neighbor data arrives and marks us dirty.
  return block === null || BLOCKS[block].solid;
}

function isPartialBlockAt(
  partialBlockMasks: ChunkPartialBlockMasks,
  x: number,
  y: number,
  z: number
): boolean {
  if (y < 0 || y >= WORLD_HEIGHT) return false;
  const mask = getPartialBlockMaskAt(partialBlockMasks, x, y, z);
  return mask !== null && mask > 0;
}

function getPartialBlockMaskAt(
  partialBlockMasks: ChunkPartialBlockMasks,
  x: number,
  y: number,
  z: number
): number | null {
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    return partialBlockMasks.current ? partialBlockMasks.current[index(x, y, z)] : null;
  }

  if (x < 0 && z >= 0 && z < CHUNK_SIZE && partialBlockMasks.neighbors.negativeX) {
    return partialBlockMasks.neighbors.negativeX[index(CHUNK_SIZE - 1, y, z)];
  }

  if (x >= CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && partialBlockMasks.neighbors.positiveX) {
    return partialBlockMasks.neighbors.positiveX[index(0, y, z)];
  }

  if (z < 0 && x >= 0 && x < CHUNK_SIZE && partialBlockMasks.neighbors.negativeZ) {
    return partialBlockMasks.neighbors.negativeZ[index(x, y, CHUNK_SIZE - 1)];
  }

  if (z >= CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && partialBlockMasks.neighbors.positiveZ) {
    return partialBlockMasks.neighbors.positiveZ[index(x, y, 0)];
  }

  return null;
}

function getBlockAt(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  x: number,
  y: number,
  z: number
): number | null {
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    return blocks[index(x, y, z)];
  }

  if (x < 0 && z >= 0 && z < CHUNK_SIZE && neighbors.negativeX) {
    return neighbors.negativeX[index(CHUNK_SIZE - 1, y, z)];
  }

  if (x >= CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && neighbors.positiveX) {
    return neighbors.positiveX[index(0, y, z)];
  }

  if (z < 0 && x >= 0 && x < CHUNK_SIZE && neighbors.negativeZ) {
    return neighbors.negativeZ[index(x, y, CHUNK_SIZE - 1)];
  }

  if (z >= CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && neighbors.positiveZ) {
    return neighbors.positiveZ[index(x, y, 0)];
  }

  return null;
}

function emitGreedyFaces(
  width: number,
  height: number,
  getBlock: (u: number, v: number) => number,
  emit: (u: number, v: number, width: number, height: number, block: number) => void
): void {
  const consumed = new Uint8Array(width * height);

  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const consumedIndex = u + v * width;
      if (consumed[consumedIndex]) continue;

      const meshKey = getBlock(u, v);
      if (meshKey === BLOCK.air) continue;

      let runWidth = 1;
      while (
        u + runWidth < width &&
        !consumed[u + runWidth + v * width] &&
        getBlock(u + runWidth, v) === meshKey
      ) {
        runWidth += 1;
      }

      let runHeight = 1;
      let canGrow = true;
      while (v + runHeight < height && canGrow) {
        for (let du = 0; du < runWidth; du += 1) {
          const nextIndex = u + du + (v + runHeight) * width;
          if (consumed[nextIndex] || getBlock(u + du, v + runHeight) !== meshKey) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) runHeight += 1;
      }

      for (let dv = 0; dv < runHeight; dv += 1) {
        for (let du = 0; du < runWidth; du += 1) {
          consumed[u + du + (v + dv) * width] = 1;
        }
      }

      emit(u, v, runWidth, runHeight, meshKey);
    }
  }
}

function addQuad(
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  textureTiles: number[],
  indices: number[],
  meshKey: number,
  normal: readonly [number, number, number],
  corners: readonly (readonly [number, number, number])[]
): void {
  const base = positions.length / 3;
  const baseMeshKey = getBaseBlockMeshKey(meshKey);
  const shade = getLitBlockFaceShade(meshKey, normal, getSunlitFaceShade(normal));
  const color = getMaterialBlockColor(baseMeshKey, shade);

  for (const corner of corners) {
    positions.push(corner[0], corner[1], corner[2]);
    normals.push(...normal);
    colors.push(...color);
  }

  appendBlockTextureQuadAttributes(uvs, textureTiles, baseMeshKey, normal, corners);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function index(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}
