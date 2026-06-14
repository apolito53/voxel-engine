import * as THREE from "three";
import type { DebrisPerformancePressureState } from "./debrisPerformanceGovernor";
import type { DebrisSettlerStats } from "./debrisSettler";
import { RollingFrameRateMeter, type FrameRateSample } from "./frameRateMeter";
import type { FrameTimings, PhysicsTimingStats } from "./frameTimings";
import { compactText, type GpuInfo } from "./gpu";
import type { PartialBlockMeshStats } from "./partialBlockMeshField";
import type { PhysicsToyCollisionStats } from "./physics";
import type { PhysicsFragmentRenderStats } from "./physicsInstancing";
import {
  formatPlayerSpeedMetersPerSecond,
  formatPlayerVelocityComponentsMetersPerSecond,
  type PlayerVelocitySample
} from "./playerSpeed";
import type { QualityPreset } from "./qualityPresets";
import type { RenderBackendStats } from "./renderBackend";
import type { RigidDebrisStats } from "./rigidDebris";
import type { RubbleFieldStats } from "./rubble";
import type { WorkerPoolJobTypeStats, WorkerPoolStats } from "./workerPool";
import type { ChunkCoords, WorldStats } from "./world";

type DebugHudOptions = {
  readonly panel: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly gpuInfo: GpuInfo;
  readonly getQualityPreset: () => QualityPreset;
  readonly getRenderBackendStats?: () => RenderBackendStats;
};

type DebugHudSection = {
  readonly title: string;
  readonly rows: readonly DebugHudRow[];
  readonly wide?: boolean;
};

type DebugHudRow = {
  readonly label: string;
  readonly value: string;
};

export class DebugHud {
  private readonly panel: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gpuInfo: GpuInfo;
  private readonly getQualityPreset: () => QualityPreset;
  private readonly getRenderBackendStats: (() => RenderBackendStats) | null;
  private readonly frameRateMeter = new RollingFrameRateMeter();
  private visible = false;
  private accumulator = Infinity;
  private peakFrameMs = 0;
  private peakFrameHoldSeconds = 0;

  constructor(options: DebugHudOptions) {
    this.panel = options.panel;
    this.renderer = options.renderer;
    this.gpuInfo = options.gpuInfo;
    this.getQualityPreset = options.getQualityPreset;
    this.getRenderBackendStats = options.getRenderBackendStats ?? null;
    this.panel.classList.add("is-hidden");
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.classList.toggle("is-hidden", !this.visible);
  }

  reset(): void {
    this.accumulator = Infinity;
    this.frameRateMeter.reset();
    this.peakFrameMs = 0;
    this.peakFrameHoldSeconds = 0;
  }

  update(
    rawDelta: number,
    playerVelocity: PlayerVelocitySample,
    playerChunk: ChunkCoords,
    stats: WorldStats,
    lastMinimapMs: number,
    physicsBodyCount: number,
    physicsBodyBudget: number,
    physicsCollisions: PhysicsToyCollisionStats,
    rigidDebrisStats: RigidDebrisStats,
    rigidDebrisBodyBudget: number,
    debrisPressure: DebrisPerformancePressureState,
    fragmentRenderStats: PhysicsFragmentRenderStats,
    partialMeshStats: PartialBlockMeshStats,
    debrisSettlerStats: DebrisSettlerStats,
    rubbleStats: RubbleFieldStats,
    workerPoolStats: WorkerPoolStats,
    combatLogLines: readonly string[],
    physicsTiming: PhysicsTimingStats,
    timings: FrameTimings
  ): void {
    if (!this.visible) return;

    const frameRate = this.frameRateMeter.push(rawDelta);
    this.accumulator += rawDelta;
    this.trackPeakFrame(rawDelta);

    if (this.accumulator < 0.1) return;
    this.accumulator = 0;

    this.renderPanel({
      rawDelta,
      playerVelocity,
      playerChunk,
      stats,
      lastMinimapMs,
      physicsBodyCount,
      physicsBodyBudget,
      physicsCollisions,
      rigidDebrisStats,
      rigidDebrisBodyBudget,
      debrisPressure,
      fragmentRenderStats,
      partialMeshStats,
      debrisSettlerStats,
      rubbleStats,
      workerPoolStats,
      combatLogLines,
      physicsTiming,
      timings,
      frameRate
    });
  }

  private trackPeakFrame(rawDelta: number): void {
    const frameMs = rawDelta * 1000;
    if (frameMs >= this.peakFrameMs) {
      this.peakFrameMs = frameMs;
      this.peakFrameHoldSeconds = 1.5;
      return;
    }

    this.peakFrameHoldSeconds = Math.max(0, this.peakFrameHoldSeconds - rawDelta);
    if (this.peakFrameHoldSeconds > 0) return;

    // Let old spikes decay slowly so one bad frame is visible without haunting the HUD forever.
    this.peakFrameMs = Math.max(frameMs, this.peakFrameMs * 0.94);
  }

  private renderPanel(snapshot: {
    readonly rawDelta: number;
    readonly playerVelocity: PlayerVelocitySample;
    readonly playerChunk: ChunkCoords;
    readonly stats: WorldStats;
    readonly lastMinimapMs: number;
    readonly physicsBodyCount: number;
    readonly physicsBodyBudget: number;
    readonly physicsCollisions: PhysicsToyCollisionStats;
    readonly rigidDebrisStats: RigidDebrisStats;
    readonly rigidDebrisBodyBudget: number;
    readonly debrisPressure: DebrisPerformancePressureState;
    readonly fragmentRenderStats: PhysicsFragmentRenderStats;
    readonly partialMeshStats: PartialBlockMeshStats;
    readonly debrisSettlerStats: DebrisSettlerStats;
    readonly rubbleStats: RubbleFieldStats;
    readonly workerPoolStats: WorkerPoolStats;
    readonly combatLogLines: readonly string[];
    readonly physicsTiming: PhysicsTimingStats;
    readonly timings: FrameTimings;
    readonly frameRate: FrameRateSample;
  }): void {
    const render = this.renderer.info.render;
    const memory = this.renderer.info.memory;
    const qualityPreset = this.getQualityPreset();
    const renderBackendStats = this.getRenderBackendStats?.() ?? null;
    const fogOpaqueRadius = qualityPreset.fogStartRadius + qualityPreset.fogFalloffRadius;
    const debrisPressureLabel = snapshot.debrisPressure.stress > 0.01
      ? `pressure ${Math.round(snapshot.debrisPressure.stress * 100)}%, base ${snapshot.debrisPressure.nominalRigidDebrisBodyBudget}`
      : "normal";
    const sections: DebugHudSection[] = [
      {
        title: "Perf",
        rows: [
          { label: "fps", value: `${formatHudFps(snapshot.frameRate.fps)} avg | low ${formatHudFps(snapshot.frameRate.lowFps)}` },
          { label: "frame", value: `${snapshot.frameRate.latestFrameMs.toFixed(1)}ms now | avg ${snapshot.frameRate.averageFrameMs.toFixed(1)}ms` },
          { label: "peak", value: `${this.peakFrameMs.toFixed(1)}ms` },
          { label: "cpu", value: `${snapshot.timings.frameMs.toFixed(1)}ms total` },
          { label: "work", value: `p ${snapshot.timings.playerMs.toFixed(1)} c ${snapshot.timings.chunkMs.toFixed(1)} ph ${snapshot.timings.physicsMs.toFixed(1)}` },
          { label: "draw", value: `r ${snapshot.timings.renderMs.toFixed(1)} m ${snapshot.timings.meshMs.toFixed(1)} map ${snapshot.timings.minimapMs.toFixed(1)}` }
        ]
      },
      {
        title: "Player",
        rows: [
          { label: "speed", value: formatPlayerSpeedMetersPerSecond(snapshot.playerVelocity) },
          { label: "vel", value: formatPlayerVelocityComponentsMetersPerSecond(snapshot.playerVelocity) }
        ]
      },
      {
        title: "World",
        rows: [
          { label: "chunk", value: `${snapshot.playerChunk.cx}, ${snapshot.playerChunk.cz}` },
          {
            label: "view",
            value: `${snapshot.stats.renderedChunks}/${snapshot.stats.frustumChunks} draw, ` +
              `fog ${snapshot.stats.fogHiddenChunks}, load ${snapshot.stats.loadedChunks}`
          },
          { label: "load", value: `q ${snapshot.stats.queuedChunks}, gen ${snapshot.stats.loadedThisFrame}/${snapshot.stats.pendingChunkLoads}` },
          { label: "mesh", value: `q ${snapshot.stats.dirtyChunks}, view ${snapshot.stats.visibleDirtyChunks}, done ${snapshot.stats.meshedThisFrame}/${snapshot.stats.pendingMeshBuilds}` },
          { label: "save", value: `${snapshot.stats.savedChunks} saved, ${snapshot.stats.modifiedChunks} edited, q ${snapshot.stats.pendingChunkSaves}` },
          {
            label: "partial",
            value: `${snapshot.stats.partialDamageBlocks}/${snapshot.stats.partialBlocks} blk, ` +
              `r ${snapshot.partialMeshStats.regions} d ${snapshot.partialMeshStats.dirtyRegions} ` +
              `reb ${snapshot.partialMeshStats.rebuiltRegions}, tri ${snapshot.partialMeshStats.triangles} ` +
              `max ${snapshot.partialMeshStats.maxRegionTriangles}`
          }
        ]
      },
      {
        title: "Physics",
        rows: [
          { label: "bodies", value: `${snapshot.physicsBodyCount}/${snapshot.physicsBodyBudget}` },
          { label: "pairs", value: `${snapshot.physicsCollisions.candidatePairs} candidates, ${snapshot.physicsCollisions.resolvedContacts} hits` },
          { label: "cells", value: `${snapshot.physicsCollisions.broadphaseCells}/${snapshot.physicsCollisions.sleepingBroadphaseCells}` },
          { label: "sleep", value: `${snapshot.physicsCollisions.sleepingBodies} sleeping, ${snapshot.physicsCollisions.skippedDebrisPairs} skipped` }
        ]
      },
      {
        title: "Physics CPU",
        rows: [
          {
            label: "rigid",
            value: `tot ${snapshot.physicsTiming.rigidDebrisTotalMs.toFixed(1)} ` +
              `step ${snapshot.physicsTiming.rigidDebrisStepMs.toFixed(1)} ` +
              `sync ${snapshot.physicsTiming.rigidDebrisSyncMs.toFixed(1)}`
          },
          {
            label: "support",
            value: `scan ${snapshot.physicsTiming.rigidDebrisStaticColliderCollectMs.toFixed(1)} ` +
              `coll ${snapshot.physicsTiming.rigidDebrisStaticColliderSyncMs.toFixed(1)} ` +
              `${snapshot.rigidDebrisStats.staticRefreshReason}`
          },
          {
            label: "toy",
            value: `move ${snapshot.physicsTiming.toyUpdateMs.toFixed(1)} ` +
              `impact ${snapshot.physicsTiming.impactApplyMs.toFixed(1)} ` +
              `pairs ${snapshot.physicsTiming.toyBroadphaseMs.toFixed(1)}`
          },
          {
            label: "after",
            value: `budget ${snapshot.physicsTiming.budgetEnforcementMs.toFixed(1)} ` +
              `clean ${snapshot.physicsTiming.groundCleanupMs.toFixed(1)} ` +
              `render ${snapshot.physicsTiming.renderProxySyncMs.toFixed(1)}`
          }
        ]
      },
      {
        title: "Debris",
        rows: [
          { label: "rigid", value: `${snapshot.rigidDebrisStats.awakeBodies}/${snapshot.rigidDebrisStats.bodies}/${snapshot.rigidDebrisBodyBudget}, sleep ${snapshot.rigidDebrisStats.sleepingBodies}` },
          {
            label: "support",
            value: `col ${snapshot.rigidDebrisStats.terrainColliders}/${snapshot.rigidDebrisStats.rubbleSupportColliders}, ` +
              `cells ${snapshot.rigidDebrisStats.activeColliderCells}, ${debrisPressureLabel}`
          },
          {
            label: "churn",
            value: `+${snapshot.rigidDebrisStats.staticColliderCreatedThisFrame} ` +
              `-${snapshot.rigidDebrisStats.staticColliderRemovedThisFrame} ` +
              `reuse ${snapshot.rigidDebrisStats.staticColliderReusedThisFrame}`
          },
          {
            label: "admit",
            value: `+${snapshot.rigidDebrisStats.admittedBodiesThisFrame} ` +
              `-${snapshot.rigidDebrisStats.deniedAdmissionThisFrame} ` +
              `q ${snapshot.rigidDebrisStats.admissionQueueDepth}`
          },
          { label: "render", value: `${snapshot.fragmentRenderStats.instances} inst, ${snapshot.fragmentRenderStats.batches} batches, cap ${snapshot.fragmentRenderStats.capacity}` },
          { label: "settle", value: `${snapshot.debrisSettlerStats.regions} rg, ${snapshot.debrisSettlerStats.activeFragments}/${snapshot.debrisSettlerStats.fragments} active` },
          { label: "rubble", value: `${snapshot.rubbleStats.clusters} clusters, ${snapshot.rubbleStats.pieces.toFixed(2)} pcs, ${snapshot.rubbleStats.maxCoverHeight.toFixed(2)}m` }
        ]
      },
      {
        title: "Render",
        rows: [
          {
            label: "quality",
            value: `${qualityPreset.label} ${qualityPreset.distanceScale}x, ` +
              `fog ${qualityPreset.fogStartRadius}->${fogOpaqueRadius}c, draw ${qualityPreset.renderRadius}c, ` +
              `stream ${qualityPreset.loadRadius}c, ` +
              `debris ${qualityPreset.debrisActiveRadiusMeters}m, px ${this.renderer.getPixelRatio()}`
          },
          { label: "req", value: `gen ${snapshot.stats.requestedLoadsThisFrame}, mesh ${snapshot.stats.requestedMeshesThisFrame}, map ${snapshot.lastMinimapMs.toFixed(1)}ms` },
          { label: "gpu", value: compactText(this.gpuInfo.vendor, 30) },
          { label: "driver", value: compactText(this.gpuInfo.renderer, 34) },
          {
            label: "backend",
            value: renderBackendStats
              ? renderBackendStats.name
              : "legacy scene"
          },
          {
            label: "gpu ms",
            value: renderBackendStats
              ? formatGpuTimerStats(renderBackendStats.gpuTimer)
              : "untracked"
          },
          {
            label: "terrain",
            value: renderBackendStats
              ? `${renderBackendStats.terrain.visibleChunks}/${renderBackendStats.terrain.chunks} gpu chunks, ` +
                `${renderBackendStats.terrain.faces} faces`
              : "legacy chunks"
          },
          {
            label: "upload",
            value: renderBackendStats
              ? `${formatBytes(renderBackendStats.terrain.uploadBytesThisFrame)}/frame, ` +
                `${formatBytes(renderBackendStats.terrain.totalUploadBytes)} total`
              : "untracked"
          },
          {
            label: "worker",
            value: `${snapshot.workerPoolStats.mode} ${snapshot.workerPoolStats.runningJobs}/${snapshot.workerPoolStats.maxWorkers} run, ` +
              `q ${snapshot.workerPoolStats.queuedJobs}, avg ${snapshot.workerPoolStats.averageWorkerTimeMs.toFixed(1)}ms`
          },
          { label: "jobs", value: formatWorkerPoolJobTypes(snapshot.workerPoolStats.jobsByType) },
          { label: "draw", value: `${render.calls} calls, ${render.triangles} tris` },
          { label: "mem", value: `${memory.geometries} geo, ${memory.textures} tex` }
        ]
      },
      {
        title: "Combat",
        wide: true,
        rows: snapshot.combatLogLines.length > 0
          ? snapshot.combatLogLines.map((line) => ({ label: "", value: line }))
          : [{ label: "events", value: "none yet" }]
      }
    ];

    const fragment = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "debug-hud-header";
    header.append(
      createTextNode("span", "debug-hud-kicker", "F3 Debug"),
      createTextNode("span", "debug-hud-summary", `${formatHudFps(snapshot.frameRate.fps)} fps | low ${formatHudFps(snapshot.frameRate.lowFps)} | ${qualityPreset.label}`)
    );
    fragment.append(header);

    const grid = document.createElement("div");
    grid.className = "debug-hud-grid";
    for (const section of sections) {
      grid.append(createDebugSection(section));
    }
    fragment.append(grid);
    this.panel.replaceChildren(fragment);
  }
}

function formatHudFps(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return "0";
  return fps < 10 ? fps.toFixed(1) : Math.round(fps).toString();
}

function formatWorkerPoolJobTypes(jobTypes: readonly WorkerPoolJobTypeStats[]): string {
  const activeTypes = jobTypes.filter((stats) =>
    stats.queuedJobs > 0 ||
    stats.runningJobs > 0 ||
    stats.completedJobs > 0 ||
    stats.failedJobs > 0 ||
    stats.staleJobs > 0
  );
  if (activeTypes.length === 0) return "none";

  return activeTypes
    .slice(0, 3)
    .map((stats) =>
      `${compactWorkerJobType(stats.type)} q${stats.queuedJobs}/r${stats.runningJobs} ` +
      `${stats.averageWorkerTimeMs.toFixed(1)}ms`
    )
    .join(" | ");
}

function compactWorkerJobType(type: string): string {
  if (type === "partial-block-mesh:build") return "partial";
  if (type === "chunk:generate") return "chunk gen";
  if (type === "chunk:mesh") return "chunk mesh";
  return compactText(type, 16);
}

function formatGpuTimerStats(stats: RenderBackendStats["gpuTimer"]): string {
  if (!stats.supported) return "timer unsupported";
  const latest = stats.lastFrameMs === null ? "pending" : `${stats.lastFrameMs.toFixed(2)}ms`;
  const average = stats.averageFrameMs === null ? "avg pending" : `avg ${stats.averageFrameMs.toFixed(2)}ms`;
  const disjoint = stats.disjointCount > 0 ? `, disjoint ${stats.disjointCount}` : "";
  return `${latest}, ${average}, q ${stats.pendingQueries}${disjoint}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib < 10 ? 2 : 1)} MiB`;
}

function createDebugSection(section: DebugHudSection): HTMLElement {
  const node = document.createElement("section");
  node.className = section.wide ? "debug-hud-section debug-hud-section-wide" : "debug-hud-section";
  node.append(createTextNode("div", "debug-hud-section-title", section.title));

  for (const row of section.rows) {
    const rowNode = document.createElement("div");
    rowNode.className = "debug-hud-row";
    rowNode.append(
      createTextNode("span", "debug-hud-label", row.label),
      createTextNode("span", "debug-hud-value", row.value)
    );
    node.append(rowNode);
  }

  return node;
}

function createTextNode(tagName: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}
