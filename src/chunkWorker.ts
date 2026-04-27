import { BLOCK, BLOCKS } from "./blocks";
import type {
  ChunkGeneratedResult,
  ChunkMeshData,
  ChunkMeshedResult,
  ChunkNeighborBlocks,
  ChunkNeighborBuffers,
  ChunkWorkerRequest
} from "./chunkProtocol";
import { createTerrainContext, generateChunkBlocks } from "./terrain";
import type { TerrainContext } from "./terrain";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

const terrainContexts = new Map<string, TerrainContext>();

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const message = event.data;

  if (message.type === "generate") {
    const blocks = generateChunkBlocks(
      message.cx,
      message.cz,
      getTerrainContext(message.seed)
    );
    workerScope.postMessage(
      {
        type: "generated",
        requestId: message.requestId,
        cx: message.cx,
        cz: message.cz,
        blocks
      } satisfies ChunkGeneratedResult,
      [blocks.buffer]
    );
    return;
  }

  if (message.type === "mesh") {
    const meshData = buildChunkMesh({
      cx: message.cx,
      cz: message.cz,
      blocks: new Uint8Array(message.blocks),
      neighbors: readNeighbors(message.neighbors)
    });

    workerScope.postMessage(
      {
        type: "meshed",
        requestId: message.requestId,
        cx: message.cx,
        cz: message.cz,
        revision: message.revision,
        positions: meshData.positions,
        normals: meshData.normals,
        colors: meshData.colors,
        indices: meshData.indices
      } satisfies ChunkMeshedResult,
      [
        meshData.positions.buffer,
        meshData.normals.buffer,
        meshData.colors.buffer,
        meshData.indices.buffer
      ]
    );
  }
};

function getTerrainContext(seed = ""): TerrainContext {
  const key = String(seed || "");
  if (!terrainContexts.has(key)) {
    // Cache by seed so chunk streaming does not rebuild the same terrain offsets every request.
    terrainContexts.set(key, createTerrainContext(key));
  }
  return terrainContexts.get(key);
}

function readNeighbors(neighbors: ChunkNeighborBuffers): ChunkNeighborBlocks {
  return {
    negativeX: neighbors.negativeX ? new Uint8Array(neighbors.negativeX) : null,
    positiveX: neighbors.positiveX ? new Uint8Array(neighbors.positiveX) : null,
    negativeZ: neighbors.negativeZ ? new Uint8Array(neighbors.negativeZ) : null,
    positiveZ: neighbors.positiveZ ? new Uint8Array(neighbors.positiveZ) : null
  };
}

function buildChunkMesh({
  cx,
  cz,
  blocks,
  neighbors
}: {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  neighbors: ChunkNeighborBlocks;
}): ChunkMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  buildXFaces(blocks, neighbors, ox, oz, positions, normals, colors, indices);
  buildYFaces(blocks, neighbors, ox, oz, positions, normals, colors, indices);
  buildZFaces(blocks, neighbors, ox, oz, positions, normals, colors, indices);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices)
  };
}

function buildXFaces(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[]
): void {
  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    emitGreedyFaces(
      WORLD_HEIGHT,
      CHUNK_SIZE,
      (y, z) => exposedBlock(blocks, neighbors, x, y, z, x + 1, y, z),
      (y, z, height, width, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
      (y, z) => exposedBlock(blocks, neighbors, x, y, z, x - 1, y, z),
      (y, z, height, width, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[]
): void {
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    emitGreedyFaces(
      CHUNK_SIZE,
      CHUNK_SIZE,
      (x, z) => exposedBlock(blocks, neighbors, x, y, z, x, y + 1, z),
      (x, z, width, depth, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
      (x, z) => exposedBlock(blocks, neighbors, x, y, z, x, y - 1, z),
      (x, z, width, depth, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
  ox: number,
  oz: number,
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[]
): void {
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    emitGreedyFaces(
      CHUNK_SIZE,
      WORLD_HEIGHT,
      (x, y) => exposedBlock(blocks, neighbors, x, y, z, x, y, z + 1),
      (x, y, width, height, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
      (x, y) => exposedBlock(blocks, neighbors, x, y, z, x, y, z - 1),
      (x, y, width, height, block) => {
        addQuad(
          positions,
          normals,
          colors,
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
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): number {
  const block = blocks[index(x, y, z)];
  if (!BLOCKS[block].solid || isSolidAt(blocks, neighbors, nx, ny, nz)) {
    return BLOCK.air;
  }
  return block;
}

function isSolidAt(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  x: number,
  y: number,
  z: number
): boolean {
  if (y < 0) return true;
  if (y >= WORLD_HEIGHT) return false;
  return BLOCKS[getBlockAt(blocks, neighbors, x, y, z)].solid;
}

function getBlockAt(
  blocks: Uint8Array,
  neighbors: ChunkNeighborBlocks,
  x: number,
  y: number,
  z: number
): number {
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

  return BLOCK.air;
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

      const block = getBlock(u, v);
      if (block === BLOCK.air) continue;

      let runWidth = 1;
      while (
        u + runWidth < width &&
        !consumed[u + runWidth + v * width] &&
        getBlock(u + runWidth, v) === block
      ) {
        runWidth += 1;
      }

      let runHeight = 1;
      let canGrow = true;
      while (v + runHeight < height && canGrow) {
        for (let du = 0; du < runWidth; du += 1) {
          const nextIndex = u + du + (v + runHeight) * width;
          if (consumed[nextIndex] || getBlock(u + du, v + runHeight) !== block) {
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

      emit(u, v, runWidth, runHeight, block);
    }
  }
}

function addQuad(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  block: number,
  normal: readonly [number, number, number],
  corners: readonly (readonly [number, number, number])[]
): void {
  const base = positions.length / 3;
  const shade = normal[1] > 0 ? 1 : normal[1] < 0 ? 0.45 : 0.72;
  const color = BLOCKS[block].color.map((channel) => channel * shade);

  for (const corner of corners) {
    positions.push(corner[0], corner[1], corner[2]);
    normals.push(...normal);
    colors.push(...color);
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function index(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}
