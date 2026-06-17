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

export type DebrisSupportWakeBudgetOwner =
  | "rigidDebris"
  | "settlerDebris"
  | "detachedDebris";

export type DebrisSupportWakeReason =
  | "remembered-support"
  | "direct-support"
  | "stack-fallback"
  | "settler-component"
  | "detached-vfx";

export type DebrisSupportWakeMatch = {
  readonly reason: DebrisSupportWakeReason;
};

export type DebrisSupportWakeBudgets = {
  readonly rigidDebris: number;
  readonly settlerDebris: number;
  readonly detachedDebris: number;
};

export type DebrisSupportWakeContext = {
  readonly claimedToys: WeakSet<PhysicsToy>;
  readonly budgets: DebrisSupportWakeBudgets;
  readonly used: Record<DebrisSupportWakeBudgetOwner, number>;
  duplicateWakeSkips: number;
  budgetExhausted: boolean;
};

export type DebrisSupportWakeReport = {
  readonly supportCellsProcessed: number;
  readonly rigidDebrisWoken: number;
  readonly settlerDebrisWoken: number;
  readonly detachedDebrisWoken: number;
  readonly rememberedSupportWoken: number;
  readonly directSupportWoken: number;
  readonly stackFallbackWoken: number;
  readonly settlerComponentWoken: number;
  readonly detachedVfxWoken: number;
  readonly duplicateWakeSkips: number;
  readonly budgetExhausted: boolean;
};

export type DebrisSupportInvalidationQueueReport = {
  readonly queuedCells: number;
  readonly duplicateCells: number;
  readonly pendingCells: number;
};

export type DebrisLifecycleDiagnostics = {
  readonly supportCellsInvalidated: number;
  readonly supportCellsQueued: number;
  readonly supportCellsProcessed: number;
  readonly supportCellsDeferred: number;
  readonly duplicateSupportCellsSkipped: number;
  readonly duplicateWakeSkips: number;
  readonly rigidDebrisWoken: number;
  readonly settlerDebrisWoken: number;
  readonly detachedDebrisWoken: number;
  readonly rememberedSupportWoken: number;
  readonly directSupportWoken: number;
  readonly stackFallbackWoken: number;
  readonly settlerComponentWoken: number;
  readonly detachedVfxWoken: number;
  readonly settledPressureExpiries: number;
  readonly airbornePressureProtections: number;
  readonly emergencyAirborneExpiries: number;
};

export function createEmptyDebrisLifecycleDiagnostics(): DebrisLifecycleDiagnostics {
  return {
    supportCellsInvalidated: 0,
    supportCellsQueued: 0,
    supportCellsProcessed: 0,
    supportCellsDeferred: 0,
    duplicateSupportCellsSkipped: 0,
    duplicateWakeSkips: 0,
    rigidDebrisWoken: 0,
    settlerDebrisWoken: 0,
    detachedDebrisWoken: 0,
    rememberedSupportWoken: 0,
    directSupportWoken: 0,
    stackFallbackWoken: 0,
    settlerComponentWoken: 0,
    detachedVfxWoken: 0,
    settledPressureExpiries: 0,
    airbornePressureProtections: 0,
    emergencyAirborneExpiries: 0
  };
}

export function hasDebrisLifecycleDiagnosticsActivity(stats: DebrisLifecycleDiagnostics): boolean {
  return stats.supportCellsInvalidated > 0 ||
    stats.supportCellsQueued > 0 ||
    stats.supportCellsProcessed > 0 ||
    stats.supportCellsDeferred > 0 ||
    stats.duplicateSupportCellsSkipped > 0 ||
    stats.duplicateWakeSkips > 0 ||
    stats.rigidDebrisWoken > 0 ||
    stats.settlerDebrisWoken > 0 ||
    stats.detachedDebrisWoken > 0 ||
    stats.rememberedSupportWoken > 0 ||
    stats.directSupportWoken > 0 ||
    stats.stackFallbackWoken > 0 ||
    stats.settlerComponentWoken > 0 ||
    stats.detachedVfxWoken > 0 ||
    stats.settledPressureExpiries > 0 ||
    stats.airbornePressureProtections > 0 ||
    stats.emergencyAirborneExpiries > 0;
}

export class DebrisSupportInvalidationQueue {
  private readonly pendingCells: ChangedTerrainCell[] = [];
  private readonly pendingKeys = new Set<string>();

  get pendingCellCount(): number {
    return this.pendingCells.length;
  }

  enqueue(cells: Iterable<ChangedTerrainCell>): DebrisSupportInvalidationQueueReport {
    let queuedCells = 0;
    let duplicateCells = 0;

    for (const rawCell of cells) {
      const cell = normalizeChangedTerrainCell(rawCell);
      if (!cell) continue;
      const key = createChangedTerrainCellKey(cell.x, cell.y, cell.z, cell.bounds);
      if (this.pendingKeys.has(key)) {
        duplicateCells += 1;
        continue;
      }

      this.pendingKeys.add(key);
      this.pendingCells.push(cell);
      queuedCells += 1;
    }

    return {
      queuedCells,
      duplicateCells,
      pendingCells: this.pendingCells.length
    };
  }

  take(maxCells: number): ChangedTerrainCell[] {
    const cellCount = Math.min(this.pendingCells.length, Math.max(0, Math.floor(maxCells)));
    if (cellCount === 0) return [];

    const cells = this.pendingCells.splice(0, cellCount);
    for (const cell of cells) {
      this.pendingKeys.delete(createChangedTerrainCellKey(cell.x, cell.y, cell.z, cell.bounds));
    }
    return cells;
  }

  requeueFront(cells: readonly ChangedTerrainCell[]): DebrisSupportInvalidationQueueReport {
    let queuedCells = 0;
    let duplicateCells = 0;

    // Preserve the original order when putting an over-budget support slice
    // back at the front. That makes stress cases drain predictably over the
    // next few frames instead of starving older terrain edits behind new ones.
    for (let index = cells.length - 1; index >= 0; index -= 1) {
      const cell = cells[index];
      const key = createChangedTerrainCellKey(cell.x, cell.y, cell.z, cell.bounds);
      if (this.pendingKeys.has(key)) {
        duplicateCells += 1;
        continue;
      }

      this.pendingKeys.add(key);
      this.pendingCells.unshift(cell);
      queuedCells += 1;
    }

    return {
      queuedCells,
      duplicateCells,
      pendingCells: this.pendingCells.length
    };
  }

  clear(): void {
    this.pendingCells.length = 0;
    this.pendingKeys.clear();
  }
}

export function createDebrisSupportWakeContext(budgets: DebrisSupportWakeBudgets): DebrisSupportWakeContext {
  return {
    claimedToys: new WeakSet<PhysicsToy>(),
    budgets: {
      rigidDebris: Math.max(0, Math.floor(budgets.rigidDebris)),
      settlerDebris: Math.max(0, Math.floor(budgets.settlerDebris)),
      detachedDebris: Math.max(0, Math.floor(budgets.detachedDebris))
    },
    used: {
      rigidDebris: 0,
      settlerDebris: 0,
      detachedDebris: 0
    },
    duplicateWakeSkips: 0,
    budgetExhausted: false
  };
}

export function hasDebrisSupportWakeBudget(
  context: DebrisSupportWakeContext,
  owner: DebrisSupportWakeBudgetOwner
): boolean {
  const hasBudget = context.used[owner] < context.budgets[owner];
  if (!hasBudget) context.budgetExhausted = true;
  return hasBudget;
}

export function tryClaimDebrisSupportWake(
  context: DebrisSupportWakeContext,
  owner: DebrisSupportWakeBudgetOwner,
  toy: PhysicsToy
): boolean {
  if (context.claimedToys.has(toy)) {
    context.duplicateWakeSkips += 1;
    return false;
  }
  if (!hasDebrisSupportWakeBudget(context, owner)) return false;

  context.claimedToys.add(toy);
  context.used[owner] += 1;
  return true;
}

export function createEmptyDebrisSupportWakeReport(
  overrides: Partial<DebrisSupportWakeReport> = {}
): DebrisSupportWakeReport {
  return {
    supportCellsProcessed: 0,
    rigidDebrisWoken: 0,
    settlerDebrisWoken: 0,
    detachedDebrisWoken: 0,
    rememberedSupportWoken: 0,
    directSupportWoken: 0,
    stackFallbackWoken: 0,
    settlerComponentWoken: 0,
    detachedVfxWoken: 0,
    duplicateWakeSkips: 0,
    budgetExhausted: false,
    ...overrides
  };
}

export function addDebrisSupportWakeReports(
  left: DebrisSupportWakeReport,
  right: DebrisSupportWakeReport
): DebrisSupportWakeReport {
  return {
    supportCellsProcessed: left.supportCellsProcessed + right.supportCellsProcessed,
    rigidDebrisWoken: left.rigidDebrisWoken + right.rigidDebrisWoken,
    settlerDebrisWoken: left.settlerDebrisWoken + right.settlerDebrisWoken,
    detachedDebrisWoken: left.detachedDebrisWoken + right.detachedDebrisWoken,
    rememberedSupportWoken: left.rememberedSupportWoken + right.rememberedSupportWoken,
    directSupportWoken: left.directSupportWoken + right.directSupportWoken,
    stackFallbackWoken: left.stackFallbackWoken + right.stackFallbackWoken,
    settlerComponentWoken: left.settlerComponentWoken + right.settlerComponentWoken,
    detachedVfxWoken: left.detachedVfxWoken + right.detachedVfxWoken,
    duplicateWakeSkips: left.duplicateWakeSkips + right.duplicateWakeSkips,
    budgetExhausted: left.budgetExhausted || right.budgetExhausted
  };
}

export function addDebrisSupportWakeReason(
  report: DebrisSupportWakeReport,
  reason: DebrisSupportWakeReason
): DebrisSupportWakeReport {
  switch (reason) {
    case "remembered-support":
      return { ...report, rememberedSupportWoken: report.rememberedSupportWoken + 1 };
    case "direct-support":
      return { ...report, directSupportWoken: report.directSupportWoken + 1 };
    case "stack-fallback":
      return { ...report, stackFallbackWoken: report.stackFallbackWoken + 1 };
    case "settler-component":
      return { ...report, settlerComponentWoken: report.settlerComponentWoken + 1 };
    case "detached-vfx":
      return { ...report, detachedVfxWoken: report.detachedVfxWoken + 1 };
  }
}

export function wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
  fragments: Iterable<PhysicsToy>,
  cells: Iterable<ChangedTerrainCell>,
  context = createDebrisSupportWakeContext({
    rigidDebris: DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS,
    settlerDebris: DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS,
    detachedDebris: DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS
  })
): DebrisSupportWakeReport {
  const changedCells = normalizeChangedTerrainCells(cells);
  if (changedCells.length === 0) return createEmptyDebrisSupportWakeReport();

  let wokenFragments = 0;
  let report = createEmptyDebrisSupportWakeReport();
  for (const fragment of fragments) {
    if (wokenFragments >= DETACHED_DEBRIS_SUPPORT_WAKE_MAX_FRAGMENTS) break;
    if (!shouldWakeDetachedFragment(fragment)) continue;
    const match = getFragmentChangedSupportWakeMatch(fragment, changedCells);
    if (!match) continue;
    if (!hasDebrisSupportWakeBudget(context, "detachedDebris")) break;
    if (!tryClaimDebrisSupportWake(context, "detachedDebris", fragment)) continue;

    // Detached VFX shards are deliberately outside Rapier, so the rigid-debris
    // body wake path cannot see them. Wake the whole small support column rather
    // than only the exact bottom contact, because upper shards may be sleeping
    // on a lower shard that just lost terrain support.
    if (fragment.wakeFromTerrainSupportChange({ quiet: true })) {
      wokenFragments += 1;
      report = addDebrisSupportWakeReason(addDebrisSupportWakeReason(report, match.reason), "detached-vfx");
    }
  }

  return {
    ...report,
    detachedDebrisWoken: wokenFragments,
    duplicateWakeSkips: context.duplicateWakeSkips,
    budgetExhausted: context.budgetExhausted
  };
}

export function normalizeChangedTerrainCells(cells: Iterable<ChangedTerrainCell>): ChangedTerrainCell[] {
  const normalized: ChangedTerrainCell[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    const normalizedCell = normalizeChangedTerrainCell(cell);
    if (!normalizedCell) continue;

    const key = createChangedTerrainCellKey(normalizedCell.x, normalizedCell.y, normalizedCell.z, normalizedCell.bounds);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(normalizedCell);
  }

  return normalized;
}

function normalizeChangedTerrainCell(cell: ChangedTerrainCell): ChangedTerrainCell | null {
  if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.z)) return null;

  const x = Math.floor(cell.x);
  const y = Math.floor(cell.y);
  const z = Math.floor(cell.z);
  const bounds = normalizeChangedTerrainSupportBounds(cell.bounds);
  return bounds ? { x, y, z, bounds } : { x, y, z };
}

export function isFragmentInsideAnyChangedSupportColumn(
  fragment: PhysicsToy,
  cells: readonly ChangedTerrainCell[]
): boolean {
  return Boolean(getFragmentChangedSupportWakeMatch(fragment, cells));
}

export function getFragmentChangedSupportWakeMatch(
  fragment: PhysicsToy,
  cells: readonly ChangedTerrainCell[]
): DebrisSupportWakeMatch | null {
  if (doesRememberedSupportOverlapChangedCells(fragment.lastKnownSupportCells, cells)) {
    return { reason: "remembered-support" };
  }

  for (const cell of cells) {
    const match = getFragmentChangedSupportColumnMatch(fragment, cell);
    if (match) return match;
  }
  return null;
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

function getFragmentChangedSupportColumnMatch(
  fragment: PhysicsToy,
  cell: ChangedTerrainCell
): DebrisSupportWakeMatch | null {
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
    return null;
  }
  if (!rangesOverlap(position.z - halfExtents.z - margin, position.z + halfExtents.z + margin, supportMinZ, supportMaxZ)) {
    return null;
  }

  const bottomY = position.y - halfExtents.y;
  const supportColumnTop = supportMaxY + DETACHED_DEBRIS_SUPPORT_STACK_WAKE_HEIGHT;
  if (bottomY < supportMinY - margin || bottomY > supportColumnTop + DETACHED_DEBRIS_SUPPORT_RESCUE_DEPTH) {
    return null;
  }
  return {
    reason: bottomY <= supportMaxY + margin
      ? "direct-support"
      : "stack-fallback"
  };
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
