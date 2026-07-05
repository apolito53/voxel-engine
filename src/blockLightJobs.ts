import {
  buildChunkBlockLight,
  type BlockLightNeighborSnapshots,
  type ChunkBlockLightBuildResult
} from "./voxelBlockLight";

export const BLOCK_LIGHT_BUILD_JOB = "block-light:build";
export const BLOCK_LIGHT_BUILT_RESULT = "block-light-built";

export type BlockLightNeighborBuffers = Readonly<Record<string, ArrayBuffer | null | undefined>>;

export type BlockLightBuildJobPayload = {
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly revision: number;
  readonly blocks: ArrayBuffer;
  readonly neighbors: BlockLightNeighborBuffers;
  readonly partialBlockMask: ArrayBuffer | null;
  readonly neighborPartialBlockMasks: BlockLightNeighborBuffers;
};

export type BlockLightBuildJobResult = ChunkBlockLightBuildResult & {
  readonly type: typeof BLOCK_LIGHT_BUILT_RESULT;
  readonly requestId: number;
  readonly cx: number;
  readonly cz: number;
  readonly revision: number;
};

export function buildBlockLightBuildJob(payload: BlockLightBuildJobPayload): BlockLightBuildJobResult {
  const result = buildChunkBlockLight({
    blocks: new Uint8Array(payload.blocks),
    neighbors: readNeighborSnapshots(payload.neighbors),
    partialBlockMask: payload.partialBlockMask ? new Uint8Array(payload.partialBlockMask) : null,
    neighborPartialBlockMasks: readNeighborSnapshots(payload.neighborPartialBlockMasks)
  });

  return {
    type: BLOCK_LIGHT_BUILT_RESULT,
    requestId: payload.requestId,
    cx: payload.cx,
    cz: payload.cz,
    revision: payload.revision,
    blockLight: result.blockLight,
    sourceCount: result.sourceCount,
    litCellCount: result.litCellCount,
    maxQueueDepth: result.maxQueueDepth
  };
}

export function getBlockLightBuildJobTransfers(result: BlockLightBuildJobResult): Transferable[] {
  return [result.blockLight.buffer];
}

function readNeighborSnapshots(neighbors: BlockLightNeighborBuffers): BlockLightNeighborSnapshots {
  const snapshots: Record<string, Uint8Array | null> = {};
  for (const [key, buffer] of Object.entries(neighbors)) {
    snapshots[key] = buffer ? new Uint8Array(buffer) : null;
  }
  return snapshots;
}
