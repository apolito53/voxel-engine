import type { PhysicsToy, PhysicsToySupportCell } from "./physics";

export type ChangedTerrainCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Optional world-space support patch inside the macro terrain cell. Whole
   * block edits use the cell itself; Terraformer/partial damage can pass the
   * exact 1/3m sub-cell support box that disappeared.
   */
  readonly bounds?: ChangedTerrainSupportBounds;
};

export type ChangedTerrainSupportBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

const DETACHED_DEBRIS_SUPPORT_WAKE_MARGIN = 0.08;
const DETACHED_DEBRIS_SUPPORT_RESCUE_DEPTH = 0.75;
const DETACHED_DEBRIS_SUPPORT_STACK_WAKE_HEIGHT = 4.5;
const DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS = 512;

export type DebrisLifecycleDiagnostics = {
  readonly supportCellsInvalidated: number;
  readonly rigidDebrisWoken: number;
  readonly settlerDebrisWoken: number;
  readonly detachedDebrisWoken: number;
  readonly settledPressureExpiries: number;
  readonly airbornePressureProtections: number;
  readonly emergencyAirborneExpiries: number;
};

export function createEmptyDebrisLifecycleDiagnostics(): DebrisLifecycleDiagnostics {
  return {
    supportCellsInvalidated: 0,
    rigidDebrisWoken: 0,
    settlerDebrisWoken: 0,
    detachedDebrisWoken: 0,
    settledPressureExpiries: 0,
    airbornePressureProtections: 0,
    emergencyAirborneExpiries: 0
  };
}

export function hasDebrisLifecycleDiagnosticsActivity(stats: DebrisLifecycleDiagnostics): boolean {
  return stats.supportCellsInvalidated > 0 ||
    stats.rigidDebrisWoken > 0 ||
    stats.settlerDebrisWoken > 0 ||
    stats.detachedDebrisWoken > 0 ||
    stats.settledPressureExpiries > 0 ||
    stats.airbornePressureProtections > 0 ||
    stats.emergencyAirborneExpiries > 0;
}

export function wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
  fragments: Iterable<PhysicsToy>,
  cells: Iterable<ChangedTerrainCell>
): number {
  const changedCells = normalizeChangedTerrainCells(cells);
  if (changedCells.length === 0) return 0;

  let wokenFragments = 0;
  for (const fragment of fragments) {
    if (wokenFragments >= DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS) break;
    if (!shouldWakeDetachedFragment(fragment)) continue;
    if (!isFragmentInsideAnyChangedSupportColumn(fragment, changedCells)) continue;

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
    const bounds = normalizeChangedTerrainSupportBounds(cell.bounds);
    const key = createChangedTerrainCellKey(x, y, z, bounds);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(bounds ? { x, y, z, bounds } : { x, y, z });
  }

  return normalized;
}

export function isFragmentInsideAnyChangedSupportColumn(
  fragment: PhysicsToy,
  cells: readonly ChangedTerrainCell[]
): boolean {
  if (doesRememberedSupportOverlapChangedCells(fragment.lastKnownSupportCells, cells)) return true;

  for (const cell of cells) {
    if (isFragmentInsideChangedSupportColumn(fragment, cell)) return true;
  }
  return false;
}

export function doesRememberedSupportOverlapChangedCells(
  supportCells: readonly PhysicsToySupportCell[],
  changedCells: readonly ChangedTerrainCell[]
): boolean {
  for (const supportCell of supportCells) {
    for (const changedCell of changedCells) {
      if (doSupportCellsOverlap(supportCell, changedCell)) return true;
    }
  }
  return false;
}

function shouldWakeDetachedFragment(fragment: PhysicsToy): boolean {
  return fragment.isInstancedFragment &&
    fragment.isSleeping &&
    !fragment.isExpired &&
    !fragment.isRigidDebrisDriven;
}

function isFragmentInsideChangedSupportColumn(
  fragment: PhysicsToy,
  cell: ChangedTerrainCell
): boolean {
  const position = fragment.mesh.position;
  const halfExtents = getDetachedFragmentSupportHalfExtents(fragment);
  const margin = DETACHED_DEBRIS_SUPPORT_WAKE_MARGIN;
  const supportMinX = cell.bounds?.minX ?? cell.x;
  const supportMaxX = cell.bounds?.maxX ?? cell.x + 1;
  const supportMinY = cell.bounds?.minY ?? cell.y;
  const supportMaxY = cell.bounds?.maxY ?? cell.y + 1;
  const supportMinZ = cell.bounds?.minZ ?? cell.z;
  const supportMaxZ = cell.bounds?.maxZ ?? cell.z + 1;

  if (!rangesOverlap(position.x - halfExtents.x - margin, position.x + halfExtents.x + margin, supportMinX, supportMaxX)) {
    return false;
  }
  if (!rangesOverlap(position.z - halfExtents.z - margin, position.z + halfExtents.z + margin, supportMinZ, supportMaxZ)) {
    return false;
  }

  const bottomY = position.y - halfExtents.y;
  const supportColumnTop = supportMaxY + DETACHED_DEBRIS_SUPPORT_STACK_WAKE_HEIGHT;
  return bottomY >= supportMinY - margin &&
    bottomY <= supportColumnTop + DETACHED_DEBRIS_SUPPORT_RESCUE_DEPTH;
}

function normalizeChangedTerrainSupportBounds(
  bounds: ChangedTerrainSupportBounds | undefined
): ChangedTerrainSupportBounds | undefined {
  if (!bounds) return undefined;
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxY) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxZ)
  ) {
    return undefined;
  }

  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const minZ = Math.min(bounds.minZ, bounds.maxZ);
  const maxZ = Math.max(bounds.minZ, bounds.maxZ);
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) return undefined;
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function createChangedTerrainCellKey(
  x: number,
  y: number,
  z: number,
  bounds: ChangedTerrainSupportBounds | undefined
): string {
  if (!bounds) return `${x},${y},${z}`;
  return [
    `${x},${y},${z}`,
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
    bounds.minZ,
    bounds.maxZ
  ].map((part) => typeof part === "number" ? part.toFixed(4) : part).join("|");
}

function doSupportCellsOverlap(
  supportCell: PhysicsToySupportCell,
  changedCell: ChangedTerrainCell
): boolean {
  if (supportCell.x !== changedCell.x || supportCell.y !== changedCell.y || supportCell.z !== changedCell.z) {
    return false;
  }

  // A whole-block remembered support footprint is useful for block removals,
  // but it is too coarse for exact Terraformer sub-cell edits. In that case,
  // fall back to the fragment's current bounds or exact remembered bounds so
  // neighboring sub-cells do not wake just because they share one macro block.
  if (changedCell.bounds && !supportCell.bounds) return false;

  const supportBounds = supportCell.bounds ?? createWholeCellBounds(supportCell);
  const changedBounds = changedCell.bounds ?? createWholeCellBounds(changedCell);
  return rangesOverlap(supportBounds.minX, supportBounds.maxX, changedBounds.minX, changedBounds.maxX) &&
    rangesOverlap(supportBounds.minY, supportBounds.maxY, changedBounds.minY, changedBounds.maxY) &&
    rangesOverlap(supportBounds.minZ, supportBounds.maxZ, changedBounds.minZ, changedBounds.maxZ);
}

function createWholeCellBounds(cell: { readonly x: number; readonly y: number; readonly z: number }): ChangedTerrainSupportBounds {
  return {
    minX: cell.x,
    maxX: cell.x + 1,
    minY: cell.y,
    maxY: cell.y + 1,
    minZ: cell.z,
    maxZ: cell.z + 1
  };
}

function getDetachedFragmentSupportHalfExtents(fragment: PhysicsToy): { readonly x: number; readonly y: number; readonly z: number } {
  return fragment.debrisShape?.colliderHalfExtents ?? {
    x: fragment.radius,
    y: fragment.radius,
    z: fragment.radius
  };
}

function rangesOverlap(leftMin: number, leftMax: number, rightMin: number, rightMax: number): boolean {
  return leftMax > rightMin && rightMax > leftMin;
}
