import type { PhysicsToy } from "./physics";

export type ChangedTerrainCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

const DETACHED_DEBRIS_SUPPORT_WAKE_MARGIN = 0.08;
const DETACHED_DEBRIS_SUPPORT_RESCUE_DEPTH = 0.75;
const DETACHED_DEBRIS_SUPPORT_STACK_WAKE_HEIGHT = 2.25;

export function wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
  fragments: Iterable<PhysicsToy>,
  cells: Iterable<ChangedTerrainCell>
): number {
  const changedCells = normalizeChangedTerrainCells(cells);
  if (changedCells.length === 0) return 0;

  let wokenFragments = 0;
  for (const fragment of fragments) {
    if (!shouldWakeDetachedFragment(fragment)) continue;
    if (!isDetachedFragmentInsideAnyChangedSupportColumn(fragment, changedCells)) continue;

    // Detached VFX shards are deliberately outside Rapier, so the rigid-debris
    // body wake path cannot see them. Wake the whole small support column rather
    // than only the exact bottom contact, because upper shards may be sleeping
    // on a lower shard that just lost terrain support.
    if (fragment.wakeFromTerrainSupportChange()) wokenFragments += 1;
  }

  return wokenFragments;
}

export function normalizeChangedTerrainCells(cells: Iterable<ChangedTerrainCell>): ChangedTerrainCell[] {
  const normalized: ChangedTerrainCell[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.z)) continue;

    const x = Math.floor(cell.x);
    const y = Math.floor(cell.y);
    const z = Math.floor(cell.z);
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push({ x, y, z });
  }

  return normalized;
}

function shouldWakeDetachedFragment(fragment: PhysicsToy): boolean {
  return fragment.isInstancedFragment &&
    fragment.isSleeping &&
    !fragment.isExpired &&
    !fragment.isRigidDebrisDriven;
}

function isDetachedFragmentInsideAnyChangedSupportColumn(
  fragment: PhysicsToy,
  cells: readonly ChangedTerrainCell[]
): boolean {
  for (const cell of cells) {
    if (isDetachedFragmentInsideChangedSupportColumn(fragment, cell)) return true;
  }
  return false;
}

function isDetachedFragmentInsideChangedSupportColumn(
  fragment: PhysicsToy,
  cell: ChangedTerrainCell
): boolean {
  const position = fragment.mesh.position;
  const radius = fragment.radius;
  const margin = DETACHED_DEBRIS_SUPPORT_WAKE_MARGIN;
  if (!rangesOverlap(position.x - radius - margin, position.x + radius + margin, cell.x, cell.x + 1)) {
    return false;
  }
  if (!rangesOverlap(position.z - radius - margin, position.z + radius + margin, cell.z, cell.z + 1)) {
    return false;
  }

  const bottomY = position.y - radius;
  const supportColumnTop = cell.y + 1 + DETACHED_DEBRIS_SUPPORT_STACK_WAKE_HEIGHT;
  return bottomY >= cell.y - margin &&
    bottomY <= supportColumnTop + DETACHED_DEBRIS_SUPPORT_RESCUE_DEPTH;
}

function rangesOverlap(leftMin: number, leftMax: number, rightMin: number, rightMax: number): boolean {
  return leftMax > rightMin && rightMax > leftMin;
}
