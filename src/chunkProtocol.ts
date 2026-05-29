import type { TerrainProfile } from "./terrain";

export type ChunkNeighborBuffers = {
  readonly negativeX: ArrayBuffer | null;
  readonly positiveX: ArrayBuffer | null;
  readonly negativeZ: ArrayBuffer | null;
  readonly positiveZ: ArrayBuffer | null;
};

export type ChunkNeighborBlocks = {
  readonly negativeX: Uint8Array | null;
  readonly positiveX: Uint8Array | null;
  readonly negativeZ: Uint8Array | null;
  readonly positiveZ: Uint8Array | null;
};

export type ChunkPartialBlockMaskBuffers = {
  readonly current: ArrayBuffer | null;
  readonly neighbors: ChunkNeighborBuffers;
};

export type ChunkPartialBlockMasks = {
  readonly current: Uint8Array | null;
  readonly neighbors: ChunkNeighborBlocks;
};

export type ChunkGenerateRequest = {
  readonly type: "generate";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly seed: string;
  readonly terrainProfile: TerrainProfile;
};

export type ChunkMeshRequest = {
  readonly type: "mesh";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly revision: number;
  readonly blocks: ArrayBuffer;
  readonly neighbors: ChunkNeighborBuffers;
  readonly partialBlockMasks: ChunkPartialBlockMaskBuffers;
};

export type ChunkWorkerRequest = ChunkGenerateRequest | ChunkMeshRequest;

export type ChunkGeneratedResult = {
  readonly type: "generated";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
};

export type ChunkMeshData = {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly uvs: Float32Array;
  readonly textureTiles: Float32Array;
  readonly indices: Uint32Array;
};

export type ChunkMeshedResult = ChunkMeshData & {
  readonly type: "meshed";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly revision: number;
};

export type ChunkWorkerResult = ChunkGeneratedResult | ChunkMeshedResult;
