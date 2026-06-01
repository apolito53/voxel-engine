export type CombatLogSourceKind =
  | "terraformer"
  | "physics-core"
  | "hitscan-core"
  | "builder"
  | "unknown";

export type CombatLogSource = {
  readonly kind: CombatLogSourceKind;
  readonly label: string;
};

export type CombatLogSubCell = {
  readonly index: number;
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  readonly globalX?: number;
  readonly globalY?: number;
  readonly globalZ?: number;
};

export type CombatLogTerrainTarget = {
  readonly kind: "terrain";
  readonly block: number;
  readonly blockName: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly damageApplied: number;
  readonly damageBefore?: number;
  readonly damageAfter?: number;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly destroyed: boolean;
  readonly subCells: readonly CombatLogSubCell[];
};

export type CombatLogRubbleTarget = {
  readonly kind: "rubble";
  readonly block: number;
  readonly blockName: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly damageApplied: number;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly destroyed: boolean;
  readonly collateral: boolean;
};

export type CombatLogTarget =
  | CombatLogTerrainTarget
  | CombatLogRubbleTarget;

export type CombatLogEntry = {
  readonly id: number;
  readonly atMs: number;
  readonly source: CombatLogSource;
  readonly action: string;
  readonly targets: readonly CombatLogTarget[];
};

export type CombatLogEntryInput = Omit<CombatLogEntry, "id" | "atMs"> & {
  readonly atMs?: number;
};

const DEFAULT_COMBAT_LOG_CAPACITY = 120;
const SUB_CELL_GRID_SIZE = 3;

export class CombatLog {
  private readonly capacity: number;
  private readonly entries: CombatLogEntry[] = [];
  private nextId = 1;

  constructor(capacity = DEFAULT_COMBAT_LOG_CAPACITY) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  record(input: CombatLogEntryInput): CombatLogEntry {
    const entry: CombatLogEntry = {
      id: this.nextId,
      atMs: input.atMs ?? performance.now(),
      source: input.source,
      action: input.action,
      targets: [...input.targets]
    };
    this.nextId += 1;

    this.entries.push(entry);
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    return entry;
  }

  clear(): void {
    this.entries.length = 0;
  }

  getEntries(): readonly CombatLogEntry[] {
    return this.entries;
  }

  getRecentEntries(count: number): readonly CombatLogEntry[] {
    if (count <= 0) return [];
    return this.entries.slice(-Math.floor(count)).reverse();
  }

  getRecentLines(count: number): readonly string[] {
    return this.getRecentEntries(count).map(formatCombatLogEntry);
  }
}

export function createCombatLogSubCell(index: number, global?: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): CombatLogSubCell {
  const localX = positiveModulo(index, SUB_CELL_GRID_SIZE);
  const localY = Math.floor(index / (SUB_CELL_GRID_SIZE * SUB_CELL_GRID_SIZE));
  const localZ = Math.floor(index / SUB_CELL_GRID_SIZE) % SUB_CELL_GRID_SIZE;
  return {
    index,
    localX,
    localY,
    localZ,
    globalX: global?.x,
    globalY: global?.y,
    globalZ: global?.z
  };
}

export function formatCombatLogEntry(entry: CombatLogEntry): string {
  const targetText = entry.targets.length > 0
    ? entry.targets.map(formatCombatLogTarget).join(" | ")
    : "no target";
  return `#${entry.id} ${entry.source.label} ${entry.action} -> ${targetText}`;
}

function formatCombatLogTarget(target: CombatLogTarget): string {
  if (target.kind === "rubble") {
    const collateral = target.collateral ? " collateral" : "";
    return `${target.blockName} rubble@${formatPosition(target)} -${formatDamage(target.damageApplied)} ` +
      `hp ${formatDamage(target.remainingHealth)}/${formatDamage(target.maxHealth)}` +
      `${target.destroyed ? " destroyed" : ""}${collateral}`;
  }

  const cellText = target.subCells.length > 0
    ? ` cells ${target.subCells.map(formatCombatLogSubCell).join(",")}`
    : " cells ?";
  return `${target.blockName}@${formatPosition(target)} -${formatDamage(target.damageApplied)} ` +
    `hp ${formatDamage(target.remainingHealth)}/${formatDamage(target.maxHealth)}` +
    `${target.destroyed ? " destroyed" : ""}${cellText}`;
}

function formatCombatLogSubCell(cell: CombatLogSubCell): string {
  const local = `${cell.localX}${cell.localY}${cell.localZ}`;
  if (
    cell.globalX === undefined ||
    cell.globalY === undefined ||
    cell.globalZ === undefined
  ) {
    return local;
  }
  return `${local}[${cell.globalX},${cell.globalY},${cell.globalZ}]`;
}

function formatPosition(position: { readonly x: number; readonly y: number; readonly z: number }): string {
  return `${position.x},${position.y},${position.z}`;
}

function formatDamage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 0.001) return Math.round(value).toString();
  return value.toFixed(1);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
