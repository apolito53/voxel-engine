import type { DebrisPerformancePressureState } from "./debrisPerformanceGovernor";
import type { DebrisSettlerStats } from "./debrisSettler";
import type { FrameDiagnosticsSnapshot } from "./frameDiagnostics";
import type { FrameTimings, PhysicsTimingStats } from "./frameTimings";
import type { PartialBlockMeshStats } from "./partialBlockMeshField";
import type { PhysicsToyCollisionStats } from "./physics";
import type { PhysicsFragmentRenderStats } from "./physicsInstancing";
import type { RigidDebrisStats } from "./rigidDebris";
import type { RubbleFieldStats } from "./rubble";
import type { WorldStats } from "./world";
import type { WorkerPoolJobTypeStats, WorkerPoolStats } from "./workerPool";
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

export type PerformanceHitchKind = "frame-hitch" | "low-fps";

export type PerformanceHitchStatsSnapshot = {
  readonly qualityLabel: string;
  readonly physicsObjectCount: number;
  readonly physicsObjectBudget: number;
  readonly rigidDebrisBodyBudget: number;
  readonly debrisPressure: DebrisPerformancePressureState;
  readonly physicsTiming: PhysicsTimingStats;
  readonly world: WorldStats;
  readonly physics: PhysicsToyCollisionStats;
  readonly rigidDebris: RigidDebrisStats;
  readonly fragmentRender: PhysicsFragmentRenderStats;
  readonly partialMesh: PartialBlockMeshStats;
  readonly debrisSettler: DebrisSettlerStats;
  readonly rubble: RubbleFieldStats;
  readonly workerPool: WorkerPoolStats;
};

export type PerformanceHitchLogPass = {
  readonly sessionId: string;
  readonly passId: string;
  readonly passIndex: number;
  readonly label: string;
  readonly startedAtMs: number;
};

export type PerformanceHitchRecord = {
  readonly kind: PerformanceHitchKind;
  readonly id: number;
  readonly timestampMs: number;
  readonly logPass: PerformanceHitchLogPass;
  readonly frameMs: number;
  readonly observedFps?: number;
  readonly primaryBucket: PerformanceHitchBucket;
  readonly primaryBucketMs: number;
  readonly primaryBucketShare: number;
  readonly summary: string;
  readonly details: readonly string[];
  readonly timings: FrameTimings;
  readonly diagnostics: FrameDiagnosticsSnapshot | null;
  readonly stats: PerformanceHitchStatsSnapshot;
};

export type PerformanceHitchInput = {
  readonly kind?: PerformanceHitchKind;
  readonly frameMs: number;
  readonly observedFps?: number;
  readonly timings: FrameTimings;
  readonly diagnostics?: FrameDiagnosticsSnapshot | null;
  readonly stats: PerformanceHitchStatsSnapshot;
};

export type RuntimeDiagnosticEventInput = {
  readonly type: string;
  readonly logPass: PerformanceHitchLogPass;
  readonly timestampMs?: number;
  readonly details?: Readonly<Record<string, unknown>>;
};

const DEFAULT_MAX_RECORDS = 30;
const DEFAULT_CONSOLE_LOG_INTERVAL_MS = 1000;
export const LOW_FPS_LOG_THRESHOLD = 60;
export const LOW_FPS_LOG_INTERVAL_MS = 1000;
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
  private lastLowFpsLogAt = Number.NEGATIVE_INFINITY;
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
    return this.addRecord(input, this.getNow());
  }

  recordLowFpsSample(input: Omit<PerformanceHitchInput, "kind"> & {
    readonly observedFps: number;
  }): PerformanceHitchRecord | null {
    if (!Number.isFinite(input.observedFps) || input.observedFps >= LOW_FPS_LOG_THRESHOLD) return null;

    const now = this.getNow();
    if (now - this.lastLowFpsLogAt < LOW_FPS_LOG_INTERVAL_MS) return null;

    this.lastLowFpsLogAt = now;
    return this.addRecord({ ...input, kind: "low-fps" }, now);
  }

  private addRecord(input: PerformanceHitchInput, timestampMs: number): PerformanceHitchRecord {
    const record = createPerformanceHitchRecord(this.nextId, timestampMs, input, this.currentPass);
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
    this.lastLowFpsLogAt = Number.NEGATIVE_INFINITY;
    this.currentPass = this.createNextPass(label);
    return this.currentPass;
  }

  clear(): void {
    this.records = [];
    this.suppressedConsoleLogs = 0;
    this.lastConsoleLogAt = Number.NEGATIVE_INFINITY;
    this.lastLowFpsLogAt = Number.NEGATIVE_INFINITY;
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
      diagnostics: record.diagnostics,
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

export function writeRuntimeDiagnosticEvent(input: RuntimeDiagnosticEventInput): void {
  if (!canWriteLocalDevLog()) return;

  const payload = {
    kind: "runtime-diagnostic",
    type: input.type,
    timestampMs: input.timestampMs ?? performance.now(),
    logPass: input.logPass,
    appVersion: packageManifest.version,
    href: window.location.href,
    userAgent: navigator.userAgent,
    details: input.details ?? {}
  };

  void fetch(LOCAL_DEV_HITCH_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // Runtime diagnostics are best-effort breadcrumbs. Losing the debug log
    // endpoint should never make a render/context failure worse.
  });
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
  const kind = input.kind ?? "frame-hitch";
  const [primaryBucket, primaryTimingKey] = getPrimaryTimingBucket(input.timings);
  const primaryBucketMs = input.timings[primaryTimingKey];
  const primaryBucketShare = input.frameMs > 0 ? primaryBucketMs / input.frameMs : 0;
  const details = getPerformanceHitchDetails(primaryBucket, input);
  const summary = [
    createPerformanceSummaryLead(kind, input),
    `${primaryBucket} ${formatMs(primaryBucketMs)}`,
    details[0] ?? "no obvious counter spike"
  ].join(" - ");

  return {
    kind,
    id,
    timestampMs,
    logPass,
    frameMs: input.frameMs,
    observedFps: input.observedFps,
    primaryBucket,
    primaryBucketMs,
    primaryBucketShare,
    summary,
    details,
    timings: cloneFrameTimings(input.timings),
    diagnostics: cloneDiagnosticsSnapshot(input.diagnostics ?? null),
    stats: cloneStatsSnapshot(input.stats)
  };
}

export function formatPerformanceHitchRecord(record: PerformanceHitchRecord): string {
  const detail = getSummaryDetail(record);
  if (record.kind === "low-fps") {
    return `${formatFps(record.observedFps ?? getFpsFromFrameMs(record.frameMs))} low FPS: ` +
      `${record.primaryBucket} led at ${formatMs(record.primaryBucketMs)} ` +
      `(${Math.round(record.primaryBucketShare * 100)}%). ${detail}`;
  }
  return `${formatMs(record.frameMs)} hitch: ${record.primaryBucket} led at ` +
    `${formatMs(record.primaryBucketMs)} (${Math.round(record.primaryBucketShare * 100)}%). ${detail}`;
}

function getSummaryDetail(record: PerformanceHitchRecord): string {
  if (record.kind === "low-fps") {
    const currentFrameBrowserClue = record.details.find((detail) =>
      detail.includes("RAF gap") || detail.includes("overlapped the frame")
    );
    if (currentFrameBrowserClue) return currentFrameBrowserClue;
  }

  return record.details[0] ?? "no obvious counter spike";
}

function createPerformanceSummaryLead(kind: PerformanceHitchKind, input: PerformanceHitchInput): string {
  if (kind === "low-fps") {
    return `${formatFps(input.observedFps ?? getFpsFromFrameMs(input.frameMs))} low FPS sample`;
  }
  return `${formatMs(input.frameMs)} frame hitch`;
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
      addRenderDetails(details, stats, input.diagnostics ?? null);
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

  addFrameDiagnosticsDetails(details, input);
  addCrossCuttingPressureDetails(details, stats);
  return details.slice(0, 6);
}

function addFrameDiagnosticsDetails(details: string[], input: PerformanceHitchInput): void {
  const diagnostics = input.diagnostics;
  if (!diagnostics) return;

  const rafGapMs = Math.max(input.frameMs, diagnostics.rafGapMs);
  const measuredFrameMs = Math.max(diagnostics.jsFrameMs, input.timings.frameMs);
  const rafGapOverJsMs = Math.max(diagnostics.rafGapOverJsMs, rafGapMs - measuredFrameMs);
  if (rafGapOverJsMs >= 25 && rafGapMs >= measuredFrameMs * 1.75) {
    details.push(
      `${formatMs(rafGapMs)} RAF gap with only ${formatMs(measuredFrameMs)} measured JS; ` +
      "browser, GPU present, or GC stall suspected"
    );
  }

  if (diagnostics.unaccountedFrameMs >= 8) {
    details.push(
      `${formatMs(diagnostics.unaccountedFrameMs)} of JS frame time was outside measured buckets`
    );
  }

  if (diagnostics.longTasks.frameCount > 0) {
    details.push(
      `${diagnostics.longTasks.frameCount} browser long task${diagnostics.longTasks.frameCount === 1 ? "" : "s"} ` +
      `overlapped the frame, max ${formatMs(diagnostics.longTasks.frameMaxMs)}`
    );
  } else if (diagnostics.longTasks.recentCount > 0) {
    details.push(
      `${diagnostics.longTasks.recentCount} browser long task${diagnostics.longTasks.recentCount === 1 ? "" : "s"} ` +
      `seen recently, max ${formatMs(diagnostics.longTasks.recentMaxMs)}`
    );
  }
}

function addPhysicsDetails(details: string[], stats: PerformanceHitchStatsSnapshot): void {
  const dominantPhysicsTiming = getDominantPhysicsTiming(stats.physicsTiming);
  if (dominantPhysicsTiming && dominantPhysicsTiming.valueMs >= 1) {
    details.push(`${dominantPhysicsTiming.label} ${formatMs(dominantPhysicsTiming.valueMs)}`);
  }

  const awakeRigidBodies = stats.rigidDebris.awakeBodies;
  const staticColliderCount = stats.rigidDebris.terrainColliders + stats.rigidDebris.rubbleSupportColliders;
  if (awakeRigidBodies > 0) {
    details.push(`${awakeRigidBodies}/${stats.rigidDebris.bodies} rigid debris bodies awake`);
  }
  if (staticColliderCount > 0) {
    details.push(
      `${staticColliderCount} temporary debris support colliders active, ` +
      `${stats.rigidDebris.staticColliderCreatedThisFrame}/${stats.rigidDebris.staticColliderRemovedThisFrame} add/remove`
    );
  }
  if (stats.rigidDebris.staticRefreshRan) {
    details.push(
      `static refresh ${stats.rigidDebris.staticRefreshReason}: ` +
      `${stats.rigidDebris.candidateCellsAccepted}/${stats.rigidDebris.candidateCellsScanned} support cells`
    );
  }
  if (stats.rigidDebris.admittedBodiesThisFrame > 0 || stats.rigidDebris.deniedAdmissionThisFrame > 0) {
    details.push(
      `rigid admission +${stats.rigidDebris.admittedBodiesThisFrame}/` +
      `-${stats.rigidDebris.deniedAdmissionThisFrame}, q ${stats.rigidDebris.admissionQueueDepth}`
    );
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
    details.push(
      `${stats.partialMesh.triangles} partial-mesh tris across ${stats.partialMesh.cells} cells, ` +
      `${stats.partialMesh.regions} regions, max ${stats.partialMesh.maxRegionTriangles} tris/region`
    );
  }
  if (stats.partialMesh.dirtyRegions > 0 || stats.partialMesh.rebuiltRegions > 0) {
    details.push(
      `${stats.partialMesh.rebuiltRegions} partial regions rebuilt, ${stats.partialMesh.dirtyRegions} still dirty`
    );
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

function addRenderDetails(
  details: string[],
  stats: PerformanceHitchStatsSnapshot,
  diagnostics: FrameDiagnosticsSnapshot | null
): void {
  if (diagnostics) {
    details.push(
      `${diagnostics.renderer.calls} draw calls, ${diagnostics.renderer.triangles} tris, ` +
      `${diagnostics.renderer.geometries} geo, ${diagnostics.renderer.textures} tex`
    );
    if (diagnostics.gpu) {
      const gpuFrame = diagnostics.gpu.lastFrameMs === null
        ? "pending"
        : `${diagnostics.gpu.lastFrameMs.toFixed(2)}ms`;
      const gpuAverage = diagnostics.gpu.averageFrameMs === null
        ? "avg pending"
        : `avg ${diagnostics.gpu.averageFrameMs.toFixed(2)}ms`;
      details.push(
        `GPU timer ${diagnostics.gpu.supported ? "supported" : "unsupported"}: ` +
        `${gpuFrame}, ${gpuAverage}, pending ${diagnostics.gpu.pendingQueries}, ` +
        `disjoint ${diagnostics.gpu.disjointCount}`
      );
    }
  }
  if (stats.fragmentRender.instances > 0) {
    details.push(`${stats.fragmentRender.instances} debris instances across ${stats.fragmentRender.batches} batches`);
  }
  if (stats.rubble.visualChunks > 0) {
    details.push(`${stats.rubble.visualChunks} baked rubble visual chunks`);
  }
  if (stats.world.frustumChunks > 0) {
    details.push(
      `${stats.world.renderedChunks}/${stats.world.frustumChunks} frustum chunks rendered, ` +
      `${stats.world.fogHiddenChunks} hidden behind opaque fog`
    );
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
  if (stats.debrisPressure.stress > 0.01) {
    details.push(
      `debris pressure ${Math.round(stats.debrisPressure.stress * 100)}%, cap ${stats.rigidDebrisBodyBudget}/${stats.debrisPressure.nominalRigidDebrisBodyBudget}`
    );
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
  if (stats.workerPool.queuedJobs > 0 || stats.workerPool.runningJobs > 0) {
    details.push(
      `worker jobs q ${stats.workerPool.queuedJobs}, run ${stats.workerPool.runningJobs}, ` +
      `avg ${formatMs(stats.workerPool.averageWorkerTimeMs)}`
    );
    const activeJobDetails = formatWorkerPoolJobTypeDetails(stats.workerPool.jobsByType);
    if (activeJobDetails) details.push(activeJobDetails);
  }
}

function getDominantPhysicsTiming(timings: PhysicsTimingStats): {
  readonly label: string;
  readonly valueMs: number;
} | null {
  const candidates = [
    ["toy update", timings.toyUpdateMs],
    ["impact apply", timings.impactApplyMs],
    ["rigid debris total", timings.rigidDebrisTotalMs],
    ["rigid debris flush", timings.rigidDebrisFlushMs],
    ["rigid debris support collect", timings.rigidDebrisStaticColliderCollectMs],
    ["rigid debris support sync", timings.rigidDebrisStaticColliderSyncMs],
    ["rigid debris step", timings.rigidDebrisStepMs],
    ["rigid debris sync", timings.rigidDebrisSyncMs],
    ["debris settler", timings.debrisSettlerMs],
    ["budget enforcement", timings.budgetEnforcementMs],
    ["ground debris cleanup", timings.groundCleanupMs],
    ["toy broadphase", timings.toyBroadphaseMs],
    ["rubble settle", timings.rubbleSettleMs],
    ["render proxy sync", timings.renderProxySyncMs]
  ] as const;
  let best: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate[1])) continue;
    if (!best || candidate[1] > best[1]) best = candidate;
  }
  return best ? { label: best[0], valueMs: best[1] } : null;
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

function cloneDiagnosticsSnapshot(diagnostics: FrameDiagnosticsSnapshot | null): FrameDiagnosticsSnapshot | null {
  if (!diagnostics) return null;
  return {
    frameStartedAtMs: diagnostics.frameStartedAtMs,
    frameEndedAtMs: diagnostics.frameEndedAtMs,
    rafGapMs: diagnostics.rafGapMs,
    jsFrameMs: diagnostics.jsFrameMs,
    measuredBucketTotalMs: diagnostics.measuredBucketTotalMs,
    unaccountedFrameMs: diagnostics.unaccountedFrameMs,
    rafGapOverJsMs: diagnostics.rafGapOverJsMs,
    renderCallMs: diagnostics.renderCallMs,
    renderCallShare: diagnostics.renderCallShare,
    longTasks: { ...diagnostics.longTasks },
    renderer: { ...diagnostics.renderer },
    gpu: diagnostics.gpu ? { ...diagnostics.gpu } : null,
    memory: diagnostics.memory ? { ...diagnostics.memory } : null,
    documentHidden: diagnostics.documentHidden,
    visibilityState: diagnostics.visibilityState
  };
}

function cloneStatsSnapshot(stats: PerformanceHitchStatsSnapshot): PerformanceHitchStatsSnapshot {
  return {
    qualityLabel: stats.qualityLabel,
    physicsObjectCount: stats.physicsObjectCount,
    physicsObjectBudget: stats.physicsObjectBudget,
    rigidDebrisBodyBudget: stats.rigidDebrisBodyBudget,
    debrisPressure: { ...stats.debrisPressure },
    physicsTiming: { ...stats.physicsTiming },
    world: { ...stats.world },
    physics: { ...stats.physics },
    rigidDebris: { ...stats.rigidDebris },
    fragmentRender: { ...stats.fragmentRender },
    partialMesh: { ...stats.partialMesh },
    debrisSettler: { ...stats.debrisSettler },
    rubble: { ...stats.rubble },
    workerPool: { ...stats.workerPool }
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function formatWorkerPoolJobTypeDetails(jobTypes: readonly WorkerPoolJobTypeStats[]): string {
  const activeTypes = jobTypes.filter((stats) =>
    stats.queuedJobs > 0 ||
    stats.runningJobs > 0 ||
    stats.failedJobs > 0 ||
    stats.staleJobs > 0
  );
  if (activeTypes.length === 0) return "";

  return "worker lanes " + activeTypes
    .slice(0, 4)
    .map((stats) =>
      `${formatWorkerPoolJobType(stats.type)} q${stats.queuedJobs}/run${stats.runningJobs}` +
      `/stale${stats.staleJobs}/fail${stats.failedJobs}`
    )
    .join(", ");
}

function formatWorkerPoolJobType(type: string): string {
  if (type === "partial-block-mesh:build") return "partial";
  if (type === "chunk:generate") return "chunk-gen";
  if (type === "chunk:mesh") return "chunk-mesh";
  return type;
}

function formatFps(value: number): string {
  if (!Number.isFinite(value)) return "unknown fps";
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)} fps`;
}

function getFpsFromFrameMs(frameMs: number): number {
  return frameMs > 0 ? 1000 / frameMs : Number.POSITIVE_INFINITY;
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
