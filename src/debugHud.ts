import * as THREE from "three";
import type { FrameTimings } from "./frameTimings";
import { compactText, type GpuInfo } from "./gpu";
import type { PhysicsToyCollisionStats } from "./physics";
import type { PhysicsFragmentRenderStats } from "./physicsInstancing";
import type { QualityPreset } from "./qualityPresets";
import type { RubbleFieldStats } from "./rubble";
import type { ChunkCoords, WorldStats } from "./world";

type DebugHudOptions = {
  readonly panel: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly gpuInfo: GpuInfo;
  readonly getQualityPreset: () => QualityPreset;
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
    fragmentRenderStats: PhysicsFragmentRenderStats,
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

    const render = this.renderer.info.render;
    const memory = this.renderer.info.memory;
    const qualityPreset = this.getQualityPreset();
    this.panel.textContent = [
      `fps ${Math.round(this.smoothedFps)}`,
      `frame ${(rawDelta * 1000).toFixed(1)}ms peak ${this.peakFrameMs.toFixed(1)}ms`,
      `cpu ${timings.frameMs.toFixed(1)}ms player ${timings.playerMs.toFixed(1)} chunk ${timings.chunkMs.toFixed(1)}`,
      `cpu phys ${timings.physicsMs.toFixed(1)} mesh ${timings.meshMs.toFixed(1)} map ${timings.minimapMs.toFixed(1)} draw ${timings.renderMs.toFixed(1)} other ${timings.otherMs.toFixed(1)}`,
      `chunk ${playerChunk.cx}, ${playerChunk.cz}`,
      `chunks ${stats.loadedChunks} q ${stats.queuedChunks} gen ${stats.loadedThisFrame}/${stats.pendingChunkLoads}`,
      `view ${stats.visibleChunks}/${stats.loadedChunks} culled ${stats.culledChunks}`,
      `mesh q ${stats.dirtyChunks} view ${stats.visibleDirtyChunks} done ${stats.meshedThisFrame}/${stats.pendingMeshBuilds}`,
      `saved ${stats.savedChunks} edited ${stats.modifiedChunks} saveq ${stats.pendingChunkSaves} dmg ${stats.damagedBlocks}`,
      `physics ${physicsBodyCount}/${physicsBodyBudget} pairs ${physicsCollisions.candidatePairs} hit ${physicsCollisions.resolvedContacts}`,
      `phys cells ${physicsCollisions.broadphaseCells}/${physicsCollisions.sleepingBroadphaseCells} active ${physicsCollisions.activeBodies} sleep ${physicsCollisions.sleepingBodies} skip ${physicsCollisions.skippedDebrisPairs}`,
      `frag inst ${fragmentRenderStats.instances} batches ${fragmentRenderStats.batches} cap ${fragmentRenderStats.capacity}`,
      `rubble ${rubbleStats.clusters} piles ${rubbleStats.pieces} pcs cover ${rubbleStats.maxCoverHeight.toFixed(2)}m`,
      `req gen ${stats.requestedLoadsThisFrame} mesh ${stats.requestedMeshesThisFrame}`,
      `quality ${qualityPreset.label.toLowerCase()} ${qualityPreset.distanceScale}x px ${this.renderer.getPixelRatio()}`,
      `map slice ${lastMinimapMs.toFixed(1)}ms`,
      `gpu ${compactText(this.gpuInfo.vendor, 30)}`,
      compactText(this.gpuInfo.renderer, 34),
      `calls ${render.calls} tris ${render.triangles}`,
      `geo ${memory.geometries} tex ${memory.textures}`
    ].join("\n");
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
}
