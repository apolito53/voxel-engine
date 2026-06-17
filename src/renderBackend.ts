import type * as THREE from "three";
import type { PartialBlockMeshStats } from "./partialBlockMeshField";
import type { PartialBlockMeshGeometryData } from "./partialBlocks";
import type { QualityPreset } from "./qualityPresets";
import type { ChunkMeshRenderSink } from "./world";

export type RenderFrameContext = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
  readonly inWorld: boolean;
};

export type GpuTimerFrameStats = {
  readonly supported: boolean;
  readonly pendingQueries: number;
  readonly lastFrameMs: number | null;
  readonly averageFrameMs: number | null;
  readonly disjointCount: number;
};

export type GpuTerrainRenderStats = {
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly faces: number;
  readonly uploadBytesThisFrame: number;
  readonly totalUploadBytes: number;
};

export type RenderBackendStats = {
  readonly name: string;
  readonly gpuTimer: GpuTimerFrameStats;
  readonly terrain: GpuTerrainRenderStats;
  readonly partialTerrain: PartialBlockMeshStats;
};

export interface RenderBackend extends ChunkMeshRenderSink {
  applyQuality(preset: QualityPreset): void;
  beginFrame(): void;
  /**
   * Partial terrain is still CPU-authored gameplay truth, but its visual
   * buffers belong to the renderer. These methods are deliberately region
   * oriented so the current worker-built BufferGeometry path and a future
   * shader-first WebGPU/WebGL page path can share the same orchestration seam.
   */
  beginPartialTerrainUpdate(dirtyRegionCount: number): void;
  setPartialTerrainDirtyRegionCount(dirtyRegionCount: number): void;
  applyPartialTerrainRegionGeometry(
    key: string,
    cellCount: number,
    geometryData: PartialBlockMeshGeometryData
  ): void;
  clearPartialTerrain(): void;
  getPartialTerrainStats(): PartialBlockMeshStats;
  updateFrame(context: RenderFrameContext): void;
  render(context: RenderFrameContext): void;
  resize(width: number, height: number): void;
  getStats(): RenderBackendStats;
  dispose(): void;
}
