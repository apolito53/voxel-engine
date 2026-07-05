import type {
  ChunkBlockLightBuffers,
  ChunkNeighborBuffers
} from "./chunkProtocol";
import type {
  PartialBlockMeshBuildInput,
  PartialBlockMeshGeometryData,
  PartialBlockMeshRegionUpdate
} from "./partialBlocks";
import { buildPartialBlockMeshGeometryData } from "./partialBlocks";

export const PARTIAL_BLOCK_MESH_BUILD_JOB = "partial-block-mesh:build";

export type PartialBlockMeshBuildJobPayload = PartialBlockMeshBuildInput;

export type PartialBlockMeshBuildJobResult = {
  readonly key: string;
  readonly revision: number;
  readonly cellCount: number;
  readonly geometry: PartialBlockMeshGeometryData;
};

export function createPartialBlockMeshBuildJobPayload(
  update: PartialBlockMeshRegionUpdate,
  faceVisibilityMasks: readonly number[],
  blockLights?: ChunkBlockLightBuffers
): PartialBlockMeshBuildJobPayload {
  return { update, faceVisibilityMasks, blockLights };
}

export function buildPartialBlockMeshBuildJob(
  payload: PartialBlockMeshBuildJobPayload
): PartialBlockMeshBuildJobResult {
  return {
    key: payload.update.key,
    revision: payload.update.revision ?? 0,
    cellCount: payload.update.cells.length,
    geometry: buildPartialBlockMeshGeometryData(payload)
  };
}

export function getPartialBlockMeshBuildJobTransfers(
  result: PartialBlockMeshBuildJobResult
): Transferable[] {
  return [
    result.geometry.positions.buffer,
    result.geometry.normals.buffer,
    result.geometry.colors.buffer,
    result.geometry.blockLights.buffer,
    result.geometry.uvs.buffer,
    result.geometry.textureTiles.buffer,
    result.geometry.indices.buffer
  ];
}

export function getPartialBlockMeshBuildPayloadTransfers(
  payload: PartialBlockMeshBuildJobPayload
): Transferable[] {
  if (!payload.blockLights) return [];

  return [
    payload.blockLights.current,
    ...getNeighborBuffers(payload.blockLights.neighbors)
  ].filter((buffer): buffer is ArrayBuffer => Boolean(buffer));
}

function getNeighborBuffers(neighbors: ChunkNeighborBuffers): readonly (ArrayBuffer | null)[] {
  return [
    neighbors.negativeX,
    neighbors.positiveX,
    neighbors.negativeZ,
    neighbors.positiveZ
  ];
}
