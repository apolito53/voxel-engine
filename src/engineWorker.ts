import {
  BLOCK_LIGHT_BUILD_JOB,
  buildBlockLightBuildJob,
  getBlockLightBuildJobTransfers,
  type BlockLightBuildJobPayload,
  type BlockLightBuildJobResult
} from "./blockLightJobs";
import {
  CHUNK_GENERATE_JOB,
  CHUNK_MESH_JOB,
  buildChunkGenerateJob,
  buildChunkMeshJob,
  getChunkJobResultTransfers,
  type ChunkGenerateJobPayload,
  type ChunkJobResult,
  type ChunkMeshJobPayload
} from "./chunkJobs";
import {
  PARTIAL_BLOCK_MESH_BUILD_JOB,
  buildPartialBlockMeshBuildJob,
  getPartialBlockMeshBuildJobTransfers,
  type PartialBlockMeshBuildJobPayload,
  type PartialBlockMeshBuildJobResult
} from "./partialBlockMeshWorkerProtocol";
import type { WorkerPoolWorkerRequest, WorkerPoolWorkerResponse } from "./workerPool";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerPoolWorkerRequest>) => {
  const request = event.data;
  const startedAt = performance.now();

  try {
    const { result, transfers } = runEngineJob(request);
    const response: WorkerPoolWorkerResponse<typeof result> = {
      status: "completed",
      id: request.id,
      type: request.type,
      revision: request.revision,
      result,
      workerTimeMs: performance.now() - startedAt
    };
    workerScope.postMessage(response, transfers);
  } catch (error) {
    const response: WorkerPoolWorkerResponse = {
      status: "failed",
      id: request.id,
      type: request.type,
      revision: request.revision,
      error: error instanceof Error ? error.message : String(error),
      workerTimeMs: performance.now() - startedAt
    };
    workerScope.postMessage(response);
  }
};

function runEngineJob(
  request: WorkerPoolWorkerRequest
): {
  readonly result: ChunkJobResult | PartialBlockMeshBuildJobResult | BlockLightBuildJobResult;
  readonly transfers: Transferable[];
} {
  if (request.type === BLOCK_LIGHT_BUILD_JOB) {
    const result = buildBlockLightBuildJob(request.payload as BlockLightBuildJobPayload);
    return {
      result,
      transfers: getBlockLightBuildJobTransfers(result)
    };
  }

  if (request.type === PARTIAL_BLOCK_MESH_BUILD_JOB) {
    const result = buildPartialBlockMeshBuildJob(request.payload as PartialBlockMeshBuildJobPayload);
    return {
      result,
      transfers: getPartialBlockMeshBuildJobTransfers(result)
    };
  }

  if (request.type === CHUNK_GENERATE_JOB) {
    const result = buildChunkGenerateJob(request.payload as ChunkGenerateJobPayload);
    return {
      result,
      transfers: getChunkJobResultTransfers(result)
    };
  }

  if (request.type === CHUNK_MESH_JOB) {
    const result = buildChunkMeshJob(request.payload as ChunkMeshJobPayload);
    return {
      result,
      transfers: getChunkJobResultTransfers(result)
    };
  }

  throw new Error(`Unknown worker-pool job type "${request.type}".`);
}
