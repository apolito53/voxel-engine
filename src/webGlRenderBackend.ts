import * as THREE from "three";
import { WebGlGpuTimer } from "./gpu";
import { GpuPartialTerrainRenderer } from "./gpuPartialTerrainRenderer";
import { GpuTerrainRenderer } from "./gpuTerrainRenderer";
import type { ChunkMeshedResult } from "./chunkProtocol";
import type { PartialBlockMeshStats } from "./partialBlockMeshField";
import type { PartialBlockMeshGeometryData } from "./partialBlocks";
import type { QualityPreset } from "./qualityPresets";
import type {
  GpuTimerFrameStats,
  RenderBackend,
  RenderBackendStats,
  RenderFrameContext
} from "./renderBackend";

type WebGlRenderBackendOptions = {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly fogColor: number;
  readonly initialQuality: QualityPreset;
};

export class WebGlRenderBackend implements RenderBackend {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gpuTimer: WebGlGpuTimer;
  private readonly terrain: GpuTerrainRenderer;
  private readonly partialTerrain: GpuPartialTerrainRenderer;
  private gpuTimerStats: GpuTimerFrameStats = {
    supported: false,
    pendingQueries: 0,
    lastFrameMs: null,
    averageFrameMs: null,
    disjointCount: 0
  };

  constructor(options: WebGlRenderBackendOptions) {
    this.renderer = options.renderer;
    this.gpuTimer = new WebGlGpuTimer(options.renderer);
    this.terrain = new GpuTerrainRenderer({
      scene: options.scene,
      fogColor: options.fogColor,
      fogNear: options.initialQuality.fogNear,
      fogFar: options.initialQuality.fogFar
    });
    this.partialTerrain = new GpuPartialTerrainRenderer({
      scene: options.scene
    });
    this.applyQuality(options.initialQuality);
  }

  beginFrame(): void {
    this.gpuTimerStats = this.gpuTimer.collect();
    this.terrain.beginFrame();
  }

  applyQuality(preset: QualityPreset): void {
    this.terrain.applyQuality(preset);
    // Keep the renderer-level shadow map exactly where QualityController set
    // it. GPU terrain pages opt out per mesh, but projectile cores and debris
    // still need the normal Three.js shadow path until the renderer-owned VFX
    // pass replaces them.
  }

  applyChunkMesh(result: ChunkMeshedResult): void {
    this.terrain.applyChunkMesh(result);
  }

  retainTerrainChunks(keys: Iterable<string>): void {
    this.terrain.retainChunkKeys(keys);
  }

  updateTerrainVisibility(centerCx: number, centerCz: number, renderRadius: number): void {
    this.terrain.updateVisibility(centerCx, centerCz, renderRadius);
  }

  beginPartialTerrainUpdate(dirtyRegionCount: number): void {
    this.partialTerrain.beginUpdate(dirtyRegionCount);
  }

  setPartialTerrainDirtyRegionCount(dirtyRegionCount: number): void {
    this.partialTerrain.setDirtyRegionCount(dirtyRegionCount);
  }

  applyPartialTerrainRegionGeometry(
    key: string,
    cellCount: number,
    geometryData: PartialBlockMeshGeometryData
  ): void {
    this.partialTerrain.applyRegionGeometry(key, cellCount, geometryData);
  }

  clearPartialTerrain(): void {
    this.partialTerrain.clear();
  }

  getPartialTerrainStats(): PartialBlockMeshStats {
    return this.partialTerrain.getStats();
  }

  updateFrame(_context: RenderFrameContext): void {
    // The first backend cut keeps simulation systems responsible for their own
    // render helpers. This hook is where GPU-owned VFX and debug draw will move
    // as those systems are lifted out of main.ts.
  }

  render(context: RenderFrameContext): void {
    this.gpuTimer.beginFrame();
    this.renderer.render(context.scene, context.camera);
    this.gpuTimer.endFrame();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  getStats(): RenderBackendStats {
    return {
      name: "WebGL2 GPU terrain + partial",
      gpuTimer: this.gpuTimerStats,
      terrain: this.terrain.getStats(),
      partialTerrain: this.partialTerrain.getStats()
    };
  }

  dispose(): void {
    this.partialTerrain.dispose();
    this.terrain.dispose();
    this.gpuTimer.dispose();
  }
}
