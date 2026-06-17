import * as THREE from "three";
import {
  createUnlitWorldBlockMaterial,
  disposeWorldBlockMaterial,
  type WorldBlockMaterial
} from "./blockTextureAtlas";
import {
  PartialBlockMeshField,
  type PartialBlockMeshStats
} from "./partialBlockMeshField";
import type { PartialBlockMeshGeometryData } from "./partialBlocks";

type GpuPartialTerrainRendererOptions = {
  readonly scene: THREE.Scene;
  readonly material?: WorldBlockMaterial;
};

/**
 * Renderer-owned presentation path for damaged partial terrain.
 *
 * This first GPU-overhaul slice intentionally keeps the existing regional
 * BufferGeometry uploader instead of pretending arbitrary bitten/wrinkled
 * partial terrain is the same as the neat instanced greedy quads used by normal
 * chunks. The important boundary shift is ownership: main.ts now feeds compact
 * worker geometry into the render backend, and the backend owns the scene
 * objects/materials/disposal. A later pass can replace the wrapped field with a
 * shader-first page renderer without changing gameplay orchestration.
 */
export class GpuPartialTerrainRenderer {
  private readonly material: WorldBlockMaterial;
  private readonly ownsMaterial: boolean;
  private readonly field: PartialBlockMeshField;

  constructor(options: GpuPartialTerrainRendererOptions) {
    this.material = options.material ?? createUnlitWorldBlockMaterial({ side: THREE.DoubleSide });
    this.ownsMaterial = !options.material;
    this.field = new PartialBlockMeshField(options.scene, this.material);
    this.field.mesh.name = "GPU partial terrain field";
  }

  beginUpdate(dirtyRegionCount: number): void {
    this.field.beginUpdate(dirtyRegionCount);
  }

  setDirtyRegionCount(dirtyRegionCount: number): void {
    this.field.setDirtyRegionCount(dirtyRegionCount);
  }

  applyRegionGeometry(
    key: string,
    cellCount: number,
    geometryData: PartialBlockMeshGeometryData
  ): void {
    this.field.updateRegionGeometry(key, cellCount, geometryData);
  }

  getStats(): PartialBlockMeshStats {
    return this.field.getStats();
  }

  getRegionMesh(key: string): THREE.Mesh<THREE.BufferGeometry, WorldBlockMaterial> | null {
    return this.field.getRegionMesh(key);
  }

  clear(): void {
    this.field.clear();
  }

  dispose(): void {
    this.field.dispose();
    if (this.ownsMaterial) disposeWorldBlockMaterial(this.material);
  }
}
