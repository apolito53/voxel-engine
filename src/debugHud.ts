import * as THREE from "three";
import type { DebrisPerformancePressureState } from "./debrisPerformanceGovernor";
import type { DebrisSettlerStats } from "./debrisSettler";
import type { FrameTimings } from "./frameTimings";
import { compactText, type GpuInfo } from "./gpu";
import type { PartialBlockMeshStats } from "./partialBlocks";
import type { PhysicsToyCollisionStats } from "./physics";
import type { PhysicsFragmentRenderStats } from "./physicsInstancing";
import type { QualityPreset } from "./qualityPresets";
import type { RigidDebrisStats } from "./rigidDebris";
import type { RubbleFieldStats } from "./rubble";
import type { ChunkCoords, WorldStats } from "./world";

type DebugHudOptions = {
  readonly panel: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly gpuInfo: GpuInfo;
  readonly getQualityPreset: () => QualityPreset;
};

type DebugHudSection = {
  readonly title: string;
  readonly rows: readonly DebugHudRow[];
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
  private visible = true;
  private accumulator = Infinity;
  private smoothedFps = 0;
  private peakFrameMs = 0;
  private peakFrameHoldSeconds = 0;

  constructor(options: DebugHudOptions) {
    this.panel = options.panel;
    this.renderer = options.renderer;
    this.gpuInfo = options.gpuInfo;
    this.getQualityPreset = options.getQualityPreset;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.classList.toggle("is-hidden", !this.visible);
  }

  reset(): void {
    this.accumulator = Infinity;
  }

  update(
    rawDelta: number,
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
    timings: FrameTimings
  ): void {
    if (!this.visible) return;

    const currentFps = Math.min(240, 1 / Math.max(rawDelta, 1 / 240));
    this.smoothedFps = this.smoothedFps === 0
      ? currentFps
      : this.smoothedFps * 0.92 + currentFps * 0.08;
    this.accumulator += rawDelta;
    this.trackPeakFrame(rawDelta);

    if (this.accumulator < 0.1) return;
    this.accumulator = 0;

    this.renderPanel({
      rawDelta,
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
      timings
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
    readonly timings: FrameTimings;
  }): void {
    const render = this.renderer.info.render;
    const memory = this.renderer.info.memory;
    const qualityPreset = this.getQualityPreset();
    const debrisPressureLabel = snapshot.debrisPressure.stress > 0.01
      ? `pressure ${Math.round(snapshot.debrisPressure.stress * 100)}%, base ${snapshot.debrisPressure.nominalRigidDebrisBodyBudget}`
      : "normal";
    const sections: DebugHudSection[] = [
      {
        title: "Perf",
        rows: [
          { label: "fps", value: `${Math.round(this.smoothedFps)} @ ${(snapshot.rawDelta * 1000).toFixed(1)}ms` },
          { label: "peak", value: `${this.peakFrameMs.toFixed(1)}ms` },
          { label: "cpu", value: `${snapshot.timings.frameMs.toFixed(1)}ms total` },
          { label: "work", value: `p ${snapshot.timings.playerMs.toFixed(1)} c ${snapshot.timings.chunkMs.toFixed(1)} ph ${snapshot.timings.physicsMs.toFixed(1)}` },
          { label: "draw", value: `r ${snapshot.timings.renderMs.toFixed(1)} m ${snapshot.timings.meshMs.toFixed(1)} map ${snapshot.timings.minimapMs.toFixed(1)}` }
        ]
      },
      {
        title: "World",
        rows: [
          { label: "chunk", value: `${snapshot.playerChunk.cx}, ${snapshot.playerChunk.cz}` },
          { label: "view", value: `${snapshot.stats.visibleChunks}/${snapshot.stats.loadedChunks}, culled ${snapshot.stats.culledChunks}` },
          { label: "load", value: `q ${snapshot.stats.queuedChunks}, gen ${snapshot.stats.loadedThisFrame}/${snapshot.stats.pendingChunkLoads}` },
          { label: "mesh", value: `q ${snapshot.stats.dirtyChunks}, view ${snapshot.stats.visibleDirtyChunks}, done ${snapshot.stats.meshedThisFrame}/${snapshot.stats.pendingMeshBuilds}` },
          { label: "save", value: `${snapshot.stats.savedChunks} saved, ${snapshot.stats.modifiedChunks} edited, q ${snapshot.stats.pendingChunkSaves}` },
          { label: "partial", value: `${snapshot.stats.partialDamageBlocks}/${snapshot.stats.partialBlocks} blk, cut ${snapshot.stats.partialRemovedSubvoxels}, tri ${snapshot.partialMeshStats.triangles}` }
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
        title: "Debris",
        rows: [
          { label: "rigid", value: `${snapshot.rigidDebrisStats.bodies}/${snapshot.rigidDebrisBodyBudget}, sleep ${snapshot.rigidDebrisStats.sleepingBodies}` },
          { label: "support", value: `col ${snapshot.rigidDebrisStats.terrainColliders}/${snapshot.rigidDebrisStats.rubbleSupportColliders}, ${debrisPressureLabel}` },
          { label: "render", value: `${snapshot.fragmentRenderStats.instances} inst, ${snapshot.fragmentRenderStats.batches} batches, cap ${snapshot.fragmentRenderStats.capacity}` },
          { label: "settle", value: `${snapshot.debrisSettlerStats.regions} rg, ${snapshot.debrisSettlerStats.activeFragments}/${snapshot.debrisSettlerStats.fragments} active` },
          { label: "rubble", value: `${snapshot.rubbleStats.clusters} clusters, ${snapshot.rubbleStats.pieces.toFixed(2)} pcs, ${snapshot.rubbleStats.maxCoverHeight.toFixed(2)}m` }
        ]
      },
      {
        title: "Render",
        rows: [
          { label: "quality", value: `${qualityPreset.label} ${qualityPreset.distanceScale}x, debris ${qualityPreset.debrisActiveRadiusMeters}m, px ${this.renderer.getPixelRatio()}` },
          { label: "req", value: `gen ${snapshot.stats.requestedLoadsThisFrame}, mesh ${snapshot.stats.requestedMeshesThisFrame}, map ${snapshot.lastMinimapMs.toFixed(1)}ms` },
          { label: "gpu", value: compactText(this.gpuInfo.vendor, 30) },
          { label: "driver", value: compactText(this.gpuInfo.renderer, 34) },
          { label: "draw", value: `${render.calls} calls, ${render.triangles} tris` },
          { label: "mem", value: `${memory.geometries} geo, ${memory.textures} tex` }
        ]
      }
    ];

    const fragment = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "debug-hud-header";
    header.append(
      createTextNode("span", "debug-hud-kicker", "F3 Debug"),
      createTextNode("span", "debug-hud-summary", `${Math.round(this.smoothedFps)} fps | ${qualityPreset.label}`)
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

function createDebugSection(section: DebugHudSection): HTMLElement {
  const node = document.createElement("section");
  node.className = "debug-hud-section";
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
