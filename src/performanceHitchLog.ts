import type { DebrisSettlerStats } from "./debrisSettler";
import type { FrameTimings } from "./frameTimings";
import type { PartialBlockMeshStats } from "./partialBlocks";
import type { PhysicsToyCollisionStats } from "./physics";
import type { PhysicsFragmentRenderStats } from "./physicsInstancing";
import type { RigidDebrisStats } from "./rigidDebris";
import type { RubbleFieldStats } from "./rubble";
import type { WorldStats } from "./world";
import packageManifest from "../package.json";
import {
  REMOTE_HITCH_LOG_ENDPOINT,
  REMOTE_HITCH_LOG_MAX_RECORDS
} from "./remoteHitchLog";

export type PerformanceHitchBucket =
  | "player"
  | "chunk"
  | "physics"
  | "mesh"
  | "minimap"
  | "render"
  | "other";

export type PerformanceHitchStatsSnapshot = {
  readonly qualityLabel: string;
  readonly physicsObjectCount: number;
  readonly physicsObjectBudget: number;
  readonly rigidDebrisBodyBudget: number;
  readonly world: WorldStats;
  readonly physics: PhysicsToyCollisionStats;
  readonly rigidDebris: RigidDebrisStats;
  readonly fragmentRender: PhysicsFragmentRenderStats;
  readonly partialMesh: PartialBlockMeshStats;
  readonly debrisSettler: DebrisSettlerStats;
  readonly rubble: RubbleFieldStats;
};

export type PerformanceHitchLogPass = {
  readonly sessionId: string;
  readonly passId: string;
  readonly passIndex: number;
  readonly label: string;
  readonly startedAtMs: number;
};

export type PerformanceHitchRecord = {
  readonly id: number;
  readonly timestampMs: number;
  readonly logPass: PerformanceHitchLogPass;
  readonly frameMs: number;
  readonly primaryBucket: PerformanceHitchBucket;
  readonly primaryBucketMs: number;
  readonly primaryBucketShare: number;
  readonly summary: string;
  readonly details: readonly string[];
  readonly timings: FrameTimings;
  readonly stats: PerformanceHitchStatsSnapshot;
};

export type PerformanceHitchInput = {
  readonly frameMs: number;
  readonly timings: FrameTimings;
  readonly stats: PerformanceHitchStatsSnapshot;
};

const DEFAULT_MAX_RECORDS = 30;
const DEFAULT_CONSOLE_LOG_INTERVAL_MS = 1000;
const LOCAL_DEV_HITCH_LOG_ENDPOINT = "http://127.0.0.1:5174/__voxel_hitch_log";
const REMOTE_HITCH_LOG_BATCH_DELAY_MS = 1000;
const REMOTE_HITCH_LOG_KEEPALIVE_MAX_BYTES = 60 * 1024;
const TIMING_BUCKETS = [
  ["player", "playerMs"],
  ["chunk", "chunkMs"],
  ["physics", "physicsMs"],
  ["mesh", "meshMs"],
  ["minimap", "minimapMs"],
  ["render", "renderMs"],
  ["other", "otherMs"]
] as const satisfies readonly [PerformanceHitchBucket, keyof FrameTimings][];

export class PerformanceHitchLog {
  private readonly getNow: () => number;
  private readonly maxRecords: number;
  private readonly consoleLogIntervalMs: number;
  private readonly sessionId: string;
  private records: PerformanceHitchRecord[] = [];
  private nextId = 1;
  private nextPassIndex = 1;
  private currentPass: PerformanceHitchLogPass;
  private lastConsoleLogAt = Number.NEGATIVE_INFINITY;
  private suppressedConsoleLogs = 0;
  private remoteQueue: PerformanceHitchRecord[] = [];
  private remoteFlushTimer: number | null = null;

  constructor(options: {
    readonly getNow?: () => number;
    readonly maxRecords?: number;
    readonly consoleLogIntervalMs?: number;
    readonly sessionId?: string;
    readonly initialPassLabel?: string;
  } = {}) {
    this.getNow = options.getNow ?? (() => performance.now());
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
    this.consoleLogIntervalMs = Math.max(0, options.consoleLogIntervalMs ?? DEFAULT_CONSOLE_LOG_INTERVAL_MS);
    this.sessionId = sanitizeLogToken(options.sessionId ?? createHitchLogSessionId(), "session");
    this.currentPass = this.createNextPass(options.initialPassLabel ?? "startup");
  }

  record(input: PerformanceHitchInput): PerformanceHitchRecord {
    const record = createPerformanceHitchRecord(this.nextId, this.getNow(), input, this.currentPass);
    this.nextId += 1;
    this.records.unshift(record);
    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }
    this.logToConsole(record);
    this.writeToLocalDevLog(record);
    this.queueRemoteProductionLog(record);
    return record;
  }

  getLast(): PerformanceHitchRecord | null {
    return this.records[0] ?? null;
  }

  getRecent(limit = this.maxRecords): readonly PerformanceHitchRecord[] {
    return this.records.slice(0, Math.max(0, Math.floor(limit)));
  }

  getPass(): PerformanceHitchLogPass {
    return this.currentPass;
  }

  startPass(label = "manual"): PerformanceHitchLogPass {
    this.records = [];
    this.nextId = 1;
    this.suppressedConsoleLogs = 0;
    this.lastConsoleLogAt = Number.NEGATIVE_INFINITY;
    this.currentPass = this.createNextPass(label);
    return this.currentPass;
  }

  clear(): void {
    this.records = [];
    this.suppressedConsoleLogs = 0;
    this.lastConsoleLogAt = Number.NEGATIVE_INFINITY;
  }

  private logToConsole(record: PerformanceHitchRecord): void {
    if (typeof console === "undefined") return;

    const now = record.timestampMs;
    if (now - this.lastConsoleLogAt < this.consoleLogIntervalMs) {
      this.suppressedConsoleLogs += 1;
      return;
    }

    const suppressedSuffix = this.suppressedConsoleLogs > 0
      ? ` (${this.suppressedConsoleLogs} similar hitch log${this.suppressedConsoleLogs === 1 ? "" : "s"} suppressed)`
      : "";
    this.suppressedConsoleLogs = 0;
    this.lastConsoleLogAt = now;
    console.warn(`[Voxel Hitch] ${record.summary}${suppressedSuffix}`, {
      timings: record.timings,
      stats: record.stats,
      details: record.details
    });
  }

  private writeToLocalDevLog(record: PerformanceHitchRecord): void {
    if (!canWriteLocalDevLog()) return;

    void fetch(LOCAL_DEV_HITCH_LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(record),
      keepalive: true
    }).catch(() => {
      // The endpoint exists only on the local Vite dev server. A failed write
      // should never make hitch reporting create more noise than the hitch did.
    });
  }

  private queueRemoteProductionLog(record: PerformanceHitchRecord): void {
    if (!canWriteRemoteProductionLog()) return;

    this.remoteQueue.push(record);
    if (this.remoteQueue.length > REMOTE_HITCH_LOG_MAX_RECORDS) {
      this.remoteQueue.splice(0, this.remoteQueue.length - REMOTE_HITCH_LOG_MAX_RECORDS);
    }

    if (this.remoteQueue.length >= REMOTE_HITCH_LOG_MAX_RECORDS) {
      this.flushRemoteProductionLog();
      return;
    }

    if (this.remoteFlushTimer !== null) return;
    this.remoteFlushTimer = window.setTimeout(() => {
      this.remoteFlushTimer = null;
      this.flushRemoteProductionLog();
    }, REMOTE_HITCH_LOG_BATCH_DELAY_MS);
  }

  private flushRemoteProductionLog(): void {
    if (!canWriteRemoteProductionLog() || this.remoteQueue.length === 0) return;

    const records = this.remoteQueue.splice(0, REMOTE_HITCH_LOG_MAX_RECORDS);
    const firstRecord = records[0];
    const body = JSON.stringify({
      source: "browser",
      appVersion: packageManifest.version,
      href: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: firstRecord?.logPass.sessionId,
      passId: firstRecord?.logPass.passId,
      passLabel: firstRecord?.logPass.label,
      passIndex: firstRecord?.logPass.passIndex,
      records
    });

    void fetch(REMOTE_HITCH_LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body,
      keepalive: body.length <= REMOTE_HITCH_LOG_KEEPALIVE_MAX_BYTES
    }).catch(() => {
      // Remote logging is diagnostic only. The game should never hitch harder
      // because the production log endpoint is unavailable or rate-limited.
    });
  }

  private createNextPass(label: string): PerformanceHitchLogPass {
    const passIndex = this.nextPassIndex;
    this.nextPassIndex += 1;
    const safeLabel = sanitizeLogToken(label, "pass");
    return {
      sessionId: this.sessionId,
      passId: `${this.sessionId}-p${passIndex.toString().padStart(3, "0")}-${safeLabel}`,
      passIndex,
      label: safeLabel,
      startedAtMs: this.getNow()
    };
  }
}

function canWriteLocalDevLog(): boolean {
  if (typeof window === "undefined" || typeof fetch !== "function") return false;
  const hostname = window.location.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function canWriteRemoteProductionLog(): boolean {
  if (typeof window === "undefined" || typeof fetch !== "function") return false;
  const hostname = window.location.hostname;
  if (hostname === "127.0.0.1" || hostname === "localhost") return false;
  return window.location.protocol === "https:";
}

export function createPerformanceHitchRecord(
  id: number,
  timestampMs: number,
  input: PerformanceHitchInput,
  logPass: PerformanceHitchLogPass = createFallbackHitchLogPass(timestampMs)
): PerformanceHitchRecord {
  const [primaryBucket, primaryTimingKey] = getPrimaryTimingBucket(input.timings);
  const primaryBucketMs = input.timings[primaryTimingKey];
  const primaryBucketShare = input.frameMs > 0 ? primaryBucketMs / input.frameMs : 0;
  const details = getPerformanceHitchDetails(primaryBucket, input);
  const summary = [
    `${formatMs(input.frameMs)} frame hitch`,
    `${primaryBucket} ${formatMs(primaryBucketMs)}`,
    details[0] ?? "no obvious counter spike"
  ].join(" - ");

  return {
    id,
    timestampMs,
    logPass,
    frameMs: input.frameMs,
    primaryBucket,
    primaryBucketMs,
    primaryBucketShare,
    summary,
    details,
    timings: cloneFrameTimings(input.timings),
    stats: cloneStatsSnapshot(input.stats)
  };
}

export function formatPerformanceHitchRecord(record: PerformanceHitchRecord): string {
  const detail = record.details[0] ?? "no obvious counter spike";
  return `${formatMs(record.frameMs)} hitch: ${record.primaryBucket} led at ` +
    `${formatMs(record.primaryBucketMs)} (${Math.round(record.primaryBucketShare * 100)}%). ${detail}`;
}

function getPrimaryTimingBucket(timings: FrameTimings): readonly [PerformanceHitchBucket, keyof FrameTimings] {
  let best: readonly [PerformanceHitchBucket, keyof FrameTimings] = ["player", "playerMs"];
  for (const bucket of TIMING_BUCKETS) {
    if (timings[bucket[1]] > timings[best[1]]) {
      best = bucket;
    }
  }
  return best;
}

function getPerformanceHitchDetails(
  primaryBucket: PerformanceHitchBucket,
  input: PerformanceHitchInput
): readonly string[] {
  const { stats } = input;
  const details: string[] = [];

  switch (primaryBucket) {
    case "physics":
      addPhysicsDetails(details, stats);
      break;
    case "mesh":
      addMeshDetails(details, stats);
      break;
    case "chunk":
      addChunkDetails(details, stats);
      break;
    case "render":
      addRenderDetails(details, stats);
      break;
    case "minimap":
      details.push("minimap slice was the largest measured bucket");
      break;
    case "player":
      details.push("player/input movement update was the largest measured bucket");
      break;
    case "other":
      details.push("misc UI, HUD, damage indicators, sky, or event work led the frame");
      break;
  }

  addCrossCuttingPressureDetails(details, stats);
  return details.slice(0, 5);
}

function addPhysicsDetails(details: string[], stats: PerformanceHitchStatsSnapshot): void {
  const awakeRigidBodies = stats.rigidDebris.bodies - stats.rigidDebris.sleepingBodies;
  const staticColliderCount = stats.rigidDebris.terrainColliders + stats.rigidDebris.rubbleSupportColliders;
  if (awakeRigidBodies > 0) {
    details.push(`${awakeRigidBodies}/${stats.rigidDebris.bodies} rigid debris bodies awake`);
  }
  if (staticColliderCount > 0) {
    details.push(`${staticColliderCount} temporary debris support colliders active`);
  }
  if (stats.debrisSettler.activeFragments > 0) {
    details.push(`${stats.debrisSettler.activeFragments} settling fragments still active`);
  }
  if (stats.physics.candidatePairs > 0) {
    details.push(`${stats.physics.candidatePairs} broadphase candidate pairs, ${stats.physics.resolvedContacts} resolved`);
  }
  if (details.length === 0) {
    details.push("physics bucket led without obvious debris or pair pressure");
  }
}

function addMeshDetails(details: string[], stats: PerformanceHitchStatsSnapshot): void {
  if (stats.world.partialDamageBlocks > 0) {
    details.push(
      `${stats.world.partialDamageBlocks}/${stats.world.partialBlocks} partial blocks keep ` +
      `${stats.world.partialRemainingSubvoxels}/${stats.world.partialTotalSubvoxels} subvoxels visible`
    );
  } else if (stats.world.damagedBlocks > 0) {
    details.push(`${stats.world.damagedBlocks} damaged blocks tracked without custom partial meshes`);
  }
  if (stats.partialMesh.triangles > 0) {
    details.push(`${stats.partialMesh.triangles} partial-mesh tris across ${stats.partialMesh.cells} cells`);
  }
  if (stats.world.visibleDirtyChunks > 0 || stats.world.dirtyChunks > 0) {
    details.push(`${stats.world.visibleDirtyChunks}/${stats.world.dirtyChunks} dirty chunks visible/total`);
  }
  if (stats.world.meshedThisFrame > 0 || stats.world.pendingMeshBuilds > 0) {
    details.push(`${stats.world.meshedThisFrame} chunk meshes applied, ${stats.world.pendingMeshBuilds} pending`);
  }
  if (details.length === 0) {
    details.push("mesh bucket led without dirty chunk pressure");
  }
}

function addChunkDetails(details: string[], stats: PerformanceHitchStatsSnapshot): void {
  if (stats.world.requestedLoadsThisFrame > 0 || stats.world.pendingChunkLoads > 0) {
    details.push(`${stats.world.requestedLoadsThisFrame} chunk loads requested, ${stats.world.pendingChunkLoads} pending`);
  }
  if (stats.world.queuedChunks > 0) {
    details.push(`${stats.world.queuedChunks} queued chunks in the stream window`);
  }
  if (details.length === 0) {
    details.push("chunk bucket led without obvious load backlog");
  }
}

function addRenderDetails(details: string[], stats: PerformanceHitchStatsSnapshot): void {
  if (stats.fragmentRender.instances > 0) {
    details.push(`${stats.fragmentRender.instances} debris instances across ${stats.fragmentRender.batches} batches`);
  }
  if (stats.rubble.visualChunks > 0) {
    details.push(`${stats.rubble.visualChunks} baked rubble visual chunks`);
  }
  if (details.length === 0) {
    details.push("render bucket led without obvious debris draw pressure");
  }
}

function addCrossCuttingPressureDetails(
  details: string[],
  stats: PerformanceHitchStatsSnapshot
): void {
  if (stats.rigidDebris.bodies >= stats.rigidDebrisBodyBudget) {
    details.push(`rigid debris at budget ${stats.rigidDebris.bodies}/${stats.rigidDebrisBodyBudget}`);
  }
  if (stats.physicsObjectCount >= stats.physicsObjectBudget) {
    details.push(`physics objects at budget ${stats.physicsObjectCount}/${stats.physicsObjectBudget}`);
  }
  if (stats.world.partialDamageBlocks > 0) {
    details.push(
      `${stats.world.partialRemainingSubvoxels}/${stats.world.partialTotalSubvoxels} partial subvoxels visible`
    );
  }
  if (stats.fragmentRender.instances >= 100) {
    details.push(`${stats.fragmentRender.instances} live fragment render instances`);
  }
}

function cloneFrameTimings(timings: FrameTimings): FrameTimings {
  return {
    playerMs: timings.playerMs,
    chunkMs: timings.chunkMs,
    physicsMs: timings.physicsMs,
    meshMs: timings.meshMs,
    minimapMs: timings.minimapMs,
    renderMs: timings.renderMs,
    otherMs: timings.otherMs,
    frameMs: timings.frameMs
  };
}

function cloneStatsSnapshot(stats: PerformanceHitchStatsSnapshot): PerformanceHitchStatsSnapshot {
  return {
    qualityLabel: stats.qualityLabel,
    physicsObjectCount: stats.physicsObjectCount,
    physicsObjectBudget: stats.physicsObjectBudget,
    rigidDebrisBodyBudget: stats.rigidDebrisBodyBudget,
    world: { ...stats.world },
    physics: { ...stats.physics },
    rigidDebris: { ...stats.rigidDebris },
    fragmentRender: { ...stats.fragmentRender },
    partialMesh: { ...stats.partialMesh },
    debrisSettler: { ...stats.debrisSettler },
    rubble: { ...stats.rubble }
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function createHitchLogSessionId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `s-${timePart}-${randomPart}`;
}

function createFallbackHitchLogPass(timestampMs: number): PerformanceHitchLogPass {
  return {
    sessionId: "manual",
    passId: "manual-p000",
    passIndex: 0,
    label: "manual",
    startedAtMs: timestampMs
  };
}

function sanitizeLogToken(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  const safe = trimmed
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return safe.length > 0 ? safe : fallback;
}
