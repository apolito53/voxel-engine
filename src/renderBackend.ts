import type * as THREE from "three";
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
};

export interface RenderBackend extends ChunkMeshRenderSink {
  applyQuality(preset: QualityPreset): void;
  beginFrame(): void;
  updateFrame(context: RenderFrameContext): void;
  render(context: RenderFrameContext): void;
  resize(width: number, height: number): void;
  getStats(): RenderBackendStats;
  dispose(): void;
}

