import * as THREE from "three";
import { getDebrisShapeGeometry, type DebrisShapeId } from "./debrisShapes";
import { PhysicsToy, getFragmentMaterial } from "./physics";

type FragmentRenderBatch = {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly block: number;
  readonly shapeId: DebrisShapeId;
  capacity: number;
};

export type PhysicsFragmentRenderStats = {
  readonly batches: number;
  readonly instances: number;
  readonly capacity: number;
};

const EMPTY_FRAGMENT_RENDER_STATS: PhysicsFragmentRenderStats = {
  batches: 0,
  instances: 0,
  capacity: 0
};

export class PhysicsFragmentInstancer {
  private readonly scene: THREE.Scene;
  private readonly batchesByKey = new Map<string, FragmentRenderBatch>();
  private readonly countsByKey = new Map<string, number>();
  private readonly writeIndexesByKey = new Map<string, number>();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly instanceScale = new THREE.Vector3(1, 1, 1);
  private stats: PhysicsFragmentRenderStats = EMPTY_FRAGMENT_RENDER_STATS;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  getStats(): PhysicsFragmentRenderStats {
    return this.stats;
  }

  update(toys: readonly PhysicsToy[]): void {
    this.countsByKey.clear();
    this.writeIndexesByKey.clear();

    for (const toy of toys) {
      if (!isRenderableFragment(toy)) continue;

      const key = createFragmentRenderBatchKey(toy.fragmentBlock, toy.debrisShape.shapeId);
      this.countsByKey.set(key, (this.countsByKey.get(key) ?? 0) + 1);
    }

    for (const [key, count] of this.countsByKey) {
      const [block, shapeId] = parseFragmentRenderBatchKey(key);
      this.ensureBatchCapacity(key, block, shapeId, count);
    }

    for (const batch of this.batchesByKey.values()) {
      batch.mesh.count = 0;
      batch.mesh.visible = false;
    }

    for (const toy of toys) {
      if (!isRenderableFragment(toy)) continue;

      const key = createFragmentRenderBatchKey(toy.fragmentBlock, toy.debrisShape.shapeId);
      const batch = this.batchesByKey.get(key);
      if (!batch) continue;

      const writeIndex = this.writeIndexesByKey.get(key) ?? 0;
      this.writeIndexesByKey.set(key, writeIndex + 1);
      // Fragment toys are not added to the scene individually, so the instanced
      // renderer must carry their toy quaternion too. Without this, debris
      // physics could spin all day and still look like static sliding tiles.
      this.instanceScale.copy(toy.debrisShape.visualScale);
      this.instanceMatrix.compose(toy.mesh.position, toy.mesh.quaternion, this.instanceScale);
      batch.mesh.setMatrixAt(writeIndex, this.instanceMatrix);
    }

    let totalInstances = 0;
    let totalCapacity = 0;
    for (const [key, count] of this.countsByKey) {
      const batch = this.batchesByKey.get(key);
      if (!batch) continue;

      batch.mesh.count = count;
      batch.mesh.visible = count > 0;
      batch.mesh.instanceMatrix.needsUpdate = count > 0;
      totalInstances += count;
    }

    for (const batch of this.batchesByKey.values()) {
      totalCapacity += batch.capacity;
    }

    this.stats = {
      batches: this.batchesByKey.size,
      instances: totalInstances,
      capacity: totalCapacity
    };
  }

  clear(): void {
    for (const batch of this.batchesByKey.values()) {
      batch.mesh.count = 0;
      batch.mesh.visible = false;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    this.stats = {
      ...this.stats,
      instances: 0
    };
  }

  dispose(): void {
    for (const batch of this.batchesByKey.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.batchesByKey.clear();
    this.countsByKey.clear();
    this.writeIndexesByKey.clear();
    this.stats = EMPTY_FRAGMENT_RENDER_STATS;
  }

  private ensureBatchCapacity(
    key: string,
    block: number,
    shapeId: DebrisShapeId,
    neededCapacity: number
  ): void {
    const existingBatch = this.batchesByKey.get(key);
    if (existingBatch && existingBatch.capacity >= neededCapacity) return;

    if (existingBatch) {
      this.scene.remove(existingBatch.mesh);
      existingBatch.mesh.dispose();
    }

    const capacity = roundCapacityUp(neededCapacity);
    const mesh = new THREE.InstancedMesh(
      getDebrisShapeGeometry(shapeId),
      getFragmentMaterial(block),
      capacity
    );

    // Fragment positions move every frame, and Three's computed instanced
    // bounds are not worth chasing for thousands of tiny transient shards.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.count = 0;
    mesh.name = `Block fragment instances ${block}:${shapeId}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(mesh);
    this.batchesByKey.set(key, { mesh, block, shapeId, capacity });
  }
}

function isRenderableFragment(
  toy: PhysicsToy
): toy is PhysicsToy & { readonly fragmentBlock: number; readonly debrisShape: NonNullable<PhysicsToy["debrisShape"]> } {
  return toy.isInstancedFragment && !toy.isExpired && toy.fragmentBlock !== null && toy.debrisShape !== null;
}

function createFragmentRenderBatchKey(block: number, shapeId: DebrisShapeId): string {
  return `${block}:${shapeId}`;
}

function parseFragmentRenderBatchKey(key: string): readonly [number, DebrisShapeId] {
  const separatorIndex = key.indexOf(":");
  return [
    Number(key.slice(0, separatorIndex)),
    key.slice(separatorIndex + 1) as DebrisShapeId
  ];
}

function roundCapacityUp(neededCapacity: number): number {
  let capacity = 1;
  while (capacity < neededCapacity) {
    capacity *= 2;
  }
  return capacity;
}
