import {
  buildChunkGenerateJob,
  buildChunkMeshJob,
  getChunkJobResultTransfers
} from "./chunkJobs";
import type {
  ChunkGeneratedResult,
  ChunkMeshedResult,
  ChunkWorkerRequest
} from "./chunkProtocol";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const message = event.data;

  if (message.type === "generate") {
    const result: ChunkGeneratedResult = buildChunkGenerateJob(message);
    workerScope.postMessage(result, getChunkJobResultTransfers(result));
    return;
  }

  const result: ChunkMeshedResult = buildChunkMeshJob(message);
  workerScope.postMessage(result, getChunkJobResultTransfers(result));
};
