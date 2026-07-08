import type {
  PartialBlockMeshBuildInput,
  PartialBlockMeshGeometryData,
  PartialBlockMeshRegionUpdate
} from "./partialBlocks";
import { buildPartialBlockMeshGeometryData } from "./partialBlocks";
import type { ChunkBlockLightBuffers } from "./chunkProtocol";

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
  blockLightInput?: Pick<PartialBlockMeshBuildInput, "blockLights" | "blockLightChunkOrigin">
): PartialBlockMeshBuildJobPayload {
  return {
    update,
    faceVisibilityMasks,
    ...(blockLightInput?.blockLights ? { blockLights: blockLightInput.blockLights } : {}),
    ...(blockLightInput?.blockLightChunkOrigin ? { blockLightChunkOrigin: blockLightInput.blockLightChunkOrigin } : {})
  };
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

export function getPartialBlockMeshBuildJobPayloadTransfers(
  payload: PartialBlockMeshBuildJobPayload
): Transferable[] {
  return collectChunkBlockLightTransfers(payload.blockLights);
}

function collectChunkBlockLightTransfers(blockLights: ChunkBlockLightBuffers | undefined): Transferable[] {
  if (!blockLights) return [];
  return [
    blockLights.current,
    ...Object.values(blockLights.neighbors)
  ].filter((buffer): buffer is ArrayBuffer => Boolean(buffer));
}
