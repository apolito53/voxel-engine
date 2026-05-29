export const PARTIAL_BLOCK_MESH_DEFER_CELL_THRESHOLD = 160;
export const PARTIAL_BLOCK_MESH_MIN_UPDATE_INTERVAL_MS = 80;

export type PartialBlockMeshDeferInput = {
  readonly cellCount: number;
  readonly lastUpdateMs: number;
  readonly nowMs: number;
  readonly hasRenderedMesh: boolean;
};

export function shouldDeferPartialBlockMeshUpdate({
  cellCount,
  lastUpdateMs,
  nowMs,
  hasRenderedMesh
}: PartialBlockMeshDeferInput): boolean {
  if (!hasRenderedMesh) return false;
  if (cellCount <= 0) return false;
  if (cellCount < PARTIAL_BLOCK_MESH_DEFER_CELL_THRESHOLD) return false;
  if (!Number.isFinite(lastUpdateMs) || lastUpdateMs <= 0) return false;
  if (!Number.isFinite(nowMs)) return false;

  return nowMs - lastUpdateMs < PARTIAL_BLOCK_MESH_MIN_UPDATE_INTERVAL_MS;
}
