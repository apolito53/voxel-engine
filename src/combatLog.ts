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
  readonly diagnostics?: Record<string, unknown>;
};

export type CombatLogEntryInput = Omit<CombatLogEntry, "id" | "atMs"> & {
  readonly atMs?: number;
};

export type CombatLogPersistenceContext = Record<string, unknown>;

export type CombatLogPersistencePayload = {
  readonly type: "voxel.combat-log.batch";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly batchId: number;
  readonly sentAtIso: string;
  readonly context: CombatLogPersistenceContext;
  readonly entries: readonly CombatLogEntry[];
};

export type CombatLogPersistenceOptions = {
  readonly endpoints: readonly string[];
  readonly getContext?: () => CombatLogPersistenceContext;
  readonly flushDelayMs?: number;
  readonly maxBatchEntries?: number;
};

const DEFAULT_COMBAT_LOG_CAPACITY = 120;
const DEFAULT_PERSISTENCE_FLUSH_DELAY_MS = 250;
const DEFAULT_PERSISTENCE_MAX_BATCH_ENTRIES = 24;
const COMBAT_LOG_KEEPALIVE_MAX_BYTES = 48 * 1024;
const SUB_CELL_GRID_SIZE = 3;

export class CombatLog {
  private readonly capacity: number;
  private readonly persistence: NormalizedCombatLogPersistenceOptions | null;
  private readonly entries: CombatLogEntry[] = [];
  private readonly pendingPersistentEntries: CombatLogEntry[] = [];
  private nextId = 1;
  private nextBatchId = 1;
  private persistedEntryCount = 0;
  private failedBatchCount = 0;
  private lastPersistentError: string | null = null;
  private lastPersistentWritePath: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> | null = null;

  constructor(
    capacity = DEFAULT_COMBAT_LOG_CAPACITY,
    options: {
      readonly persistence?: CombatLogPersistenceOptions;
    } = {}
  ) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const persistence = options.persistence
      ? normalizeCombatLogPersistenceOptions(options.persistence)
      : null;
    this.persistence = persistence && persistence.endpoints.length > 0 ? persistence : null;
  }

  record(input: CombatLogEntryInput): CombatLogEntry {
    const entry: CombatLogEntry = {
      id: this.nextId,
      atMs: input.atMs ?? performance.now(),
      source: input.source,
      action: input.action,
      targets: [...input.targets],
      diagnostics: input.diagnostics
    };
    this.nextId += 1;

    this.entries.push(entry);
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    this.queuePersistentEntry(entry);
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

  getPersistenceStatusLine(): string {
    if (!this.persistence) return "disk disabled";

    const base = `disk sent ${this.persistedEntryCount}, queued ${this.pendingPersistentEntries.length}, ` +
      `failed ${this.failedBatchCount}`;
    if (this.lastPersistentError) return `${base}, last ${this.lastPersistentError}`;
    if (this.lastPersistentWritePath) return `${base}, ok`;
    return base;
  }

  flushPersistent(): Promise<void> {
    if (!this.persistence || this.pendingPersistentEntries.length === 0) return Promise.resolve();
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushInFlight) return this.flushInFlight;

    this.flushInFlight = this.flushPersistentQueue()
      .finally(() => {
        this.flushInFlight = null;
        if (this.pendingPersistentEntries.length > 0) this.schedulePersistentFlush();
      });
    return this.flushInFlight;
  }

  private queuePersistentEntry(entry: CombatLogEntry): void {
    if (!this.persistence || !canWritePersistentCombatLog()) return;

    this.pendingPersistentEntries.push(entry);
    if (this.pendingPersistentEntries.length >= this.persistence.maxBatchEntries) {
      void this.flushPersistent();
      return;
    }
    this.schedulePersistentFlush();
  }

  private schedulePersistentFlush(): void {
    if (!this.persistence || this.flushTimer !== null || !canSchedulePersistentFlush()) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPersistent();
    }, this.persistence.flushDelayMs);
  }

  private async flushPersistentQueue(): Promise<void> {
    while (this.pendingPersistentEntries.length > 0) {
      await this.flushPersistentBatch();
    }
  }

  private async flushPersistentBatch(): Promise<void> {
    const persistence = this.persistence;
    if (!persistence || this.pendingPersistentEntries.length === 0) return;

    const entries = this.pendingPersistentEntries.splice(0, persistence.maxBatchEntries);
    const payload: CombatLogPersistencePayload = {
      type: "voxel.combat-log.batch",
      schemaVersion: 1,
      sessionId: persistence.sessionId,
      batchId: this.nextBatchId,
      sentAtIso: new Date().toISOString(),
      context: persistence.getContext(),
      entries
    };
    this.nextBatchId += 1;

    try {
      const result = await postCombatLogPayload(persistence.endpoints, payload);
      this.persistedEntryCount += entries.length;
      this.lastPersistentError = null;
      this.lastPersistentWritePath = result.logPath ?? this.lastPersistentWritePath;
    } catch (error) {
      // Failed batches are intentionally not requeued. If the local receiver is
      // down, retaining every damage event would quietly become a memory leak.
      this.failedBatchCount += 1;
      this.lastPersistentError = error instanceof Error ? error.message : "write failed";
    }
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

type NormalizedCombatLogPersistenceOptions = {
  readonly endpoints: readonly string[];
  readonly getContext: () => CombatLogPersistenceContext;
  readonly flushDelayMs: number;
  readonly maxBatchEntries: number;
  readonly sessionId: string;
};

function normalizeCombatLogPersistenceOptions(
  options: CombatLogPersistenceOptions
): NormalizedCombatLogPersistenceOptions {
  return {
    endpoints: options.endpoints.filter((endpoint) => endpoint.trim().length > 0),
    getContext: options.getContext ?? (() => ({})),
    flushDelayMs: Math.max(0, Math.floor(options.flushDelayMs ?? DEFAULT_PERSISTENCE_FLUSH_DELAY_MS)),
    maxBatchEntries: Math.max(1, Math.floor(options.maxBatchEntries ?? DEFAULT_PERSISTENCE_MAX_BATCH_ENTRIES)),
    sessionId: createCombatLogSessionId()
  };
}

async function postCombatLogPayload(
  endpoints: readonly string[],
  payload: CombatLogPersistencePayload
): Promise<{ readonly logPath?: string }> {
  if (endpoints.length === 0) throw new Error("no endpoint");

  const body = JSON.stringify(payload);
  let lastError = "all endpoints failed";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body,
        keepalive: body.length <= COMBAT_LOG_KEEPALIVE_MAX_BYTES
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = typeof responseBody.error === "string"
          ? responseBody.error
          : `HTTP ${response.status}`;
        continue;
      }
      return typeof responseBody.logPath === "string" ? { logPath: responseBody.logPath } : {};
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

function canWritePersistentCombatLog(): boolean {
  return typeof fetch === "function" && typeof Date === "function";
}

function canSchedulePersistentFlush(): boolean {
  return typeof setTimeout === "function" && typeof clearTimeout === "function";
}

function createCombatLogSessionId(): string {
  return `combat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
