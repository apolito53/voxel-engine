import * as THREE from "three";
import {
  buildPartialBlockMeshGeometryData,
  createPartialBlockFaceVisibilityMasks,
  type PartialBlockFaceVisibility,
  type PartialBlockMeshGeometryData,
  type PartialBlockMeshRegionUpdate
} from "./partialBlocks";
import type { WorldBlockMaterial } from "./blockTextureAtlas";

type PartialBlockMeshRegionEntry = {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, WorldBlockMaterial>;
  stats: PartialBlockMeshRegionStats;
};

type PartialBlockMeshRegionStats = {
  readonly cells: number;
  readonly vertices: number;
  readonly triangles: number;
};

export type PartialBlockMeshStats = {
  readonly cells: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly regions: number;
  readonly dirtyRegions: number;
  readonly rebuiltRegions: number;
  readonly maxRegionTriangles: number;
};

export const EMPTY_PARTIAL_BLOCK_MESH_STATS: PartialBlockMeshStats = {
  cells: 0,
  vertices: 0,
  triangles: 0,
  regions: 0,
  dirtyRegions: 0,
  rebuiltRegions: 0,
  maxRegionTriangles: 0
};

export class PartialBlockMeshField {
  readonly mesh: THREE.Group;
  private readonly scene: THREE.Scene;
  private readonly material: WorldBlockMaterial;
  private readonly ownsMaterial: boolean;
  private readonly regions: Map<string, PartialBlockMeshRegionEntry>;
  private stats: PartialBlockMeshStats = EMPTY_PARTIAL_BLOCK_MESH_STATS;
  private dirtyRegionCount = 0;
  private rebuiltRegionCount = 0;

  constructor(scene: THREE.Scene, material?: WorldBlockMaterial) {
    this.scene = scene;
    this.material = material ?? new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide
    });
    this.ownsMaterial = !material;
    // The public `mesh` stays a single render owner. Individual dirty regions
    // are swapped below it so worker-built terrain can upload one small buffer
    // at a time instead of rebuilding the whole damaged-terrain field.
    this.mesh = new THREE.Group();
    this.mesh.name = "Partial block field";
    this.mesh.visible = false;
    this.regions = new Map();
    this.scene.add(this.mesh);
  }

  getStats(): PartialBlockMeshStats {
    return this.stats;
  }

  getRegionMesh(key: string): THREE.Mesh<THREE.BufferGeometry, WorldBlockMaterial> | null {
    return this.regions.get(key)?.mesh ?? null;
  }

  getRegionKeys(): readonly string[] {
    return [...this.regions.keys()];
  }

  beginUpdate(dirtyRegionCount: number): void {
    this.dirtyRegionCount = Math.max(0, dirtyRegionCount);
    this.rebuiltRegionCount = 0;
    this.recomputeStats();
  }

  setDirtyRegionCount(dirtyRegionCount: number): void {
    this.dirtyRegionCount = Math.max(0, dirtyRegionCount);
    this.recomputeStats();
  }

  updateRegion(
    update: PartialBlockMeshRegionUpdate,
    isFaceVisible: PartialBlockFaceVisibility
  ): void {
    if (update.cells.length === 0) {
      this.removeRegion(update.key);
      return;
    }

    const faceVisibilityMasks = createPartialBlockFaceVisibilityMasks(update, isFaceVisible);
    const geometryData = buildPartialBlockMeshGeometryData({ update, faceVisibilityMasks });
    this.updateRegionGeometry(update.key, update.cells.length, geometryData);
  }

  updateRegionGeometry(
    key: string,
    cellCount: number,
    geometryData: PartialBlockMeshGeometryData
  ): void {
    if (cellCount === 0) {
      this.removeRegion(key);
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(geometryData.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(geometryData.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(geometryData.colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(geometryData.uvs, 2));
    geometry.setAttribute("blockTextureTile", new THREE.Float32BufferAttribute(geometryData.textureTiles, 1));
    geometry.setIndex(new THREE.BufferAttribute(geometryData.indices, 1));
    if (geometryData.positions.length > 0) {
      geometry.computeBoundingSphere();
    } else {
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    }

    const entry = this.getOrCreateRegionEntry(key);
    entry.mesh.geometry.dispose();
    entry.mesh.geometry = geometry;
    entry.mesh.visible = true;
    entry.stats = {
      cells: cellCount,
      vertices: geometryData.positions.length / 3,
      triangles: geometryData.indices.length / 3
    };
    this.rebuiltRegionCount += 1;
    this.recomputeStats();
  }

  clear(): void {
    for (const [key] of this.regions) {
      this.removeRegion(key);
    }
    this.mesh.visible = false;
    this.dirtyRegionCount = 0;
    this.rebuiltRegionCount = 0;
    this.stats = EMPTY_PARTIAL_BLOCK_MESH_STATS;
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.mesh);
    if (this.ownsMaterial) this.material.dispose();
  }

  private getOrCreateRegionEntry(key: string): PartialBlockMeshRegionEntry {
    const existing = this.regions.get(key);
    if (existing) return existing;

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    mesh.name = `Partial block region ${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.mesh.add(mesh);

    const entry: PartialBlockMeshRegionEntry = {
      mesh,
      stats: { cells: 0, vertices: 0, triangles: 0 }
    };
    this.regions.set(key, entry);
    return entry;
  }

  private removeRegion(key: string): void {
    const entry = this.regions.get(key);
    if (!entry) return;

    this.mesh.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    this.regions.delete(key);
    this.rebuiltRegionCount += 1;
    this.recomputeStats();
  }

  private recomputeStats(): void {
    let cells = 0;
    let vertices = 0;
    let triangles = 0;
    let maxRegionTriangles = 0;

    for (const entry of this.regions.values()) {
      cells += entry.stats.cells;
      vertices += entry.stats.vertices;
      triangles += entry.stats.triangles;
      maxRegionTriangles = Math.max(maxRegionTriangles, entry.stats.triangles);
    }

    this.mesh.visible = this.regions.size > 0;
    this.stats = {
      cells,
      vertices,
      triangles,
      regions: this.regions.size,
      dirtyRegions: this.dirtyRegionCount,
      rebuiltRegions: this.rebuiltRegionCount,
      maxRegionTriangles
    };
  }
}
