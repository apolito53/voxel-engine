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
    if (request.type !== PARTIAL_BLOCK_MESH_BUILD_JOB) {
      throw new Error(`Unknown worker-pool job type "${request.type}".`);
    }

    const payload = request.payload as PartialBlockMeshBuildJobPayload;
    const result: PartialBlockMeshBuildJobResult = buildPartialBlockMeshBuildJob(payload);
    const response: WorkerPoolWorkerResponse<PartialBlockMeshBuildJobResult> = {
      status: "completed",
      id: request.id,
      type: request.type,
      revision: request.revision,
      result,
      workerTimeMs: performance.now() - startedAt
    };
    workerScope.postMessage(response, getPartialBlockMeshBuildJobTransfers(result));
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
