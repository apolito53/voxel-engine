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

export type ChunkGenerateRequest = {
  readonly type: "generate";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly seed: string;
};

export type ChunkMeshRequest = {
  readonly type: "mesh";
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly revision: number;
  readonly blocks: ArrayBuffer;
  readonly neighbors: ChunkNeighborBuffers;
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
