import * as THREE from "three";
import { PhysicsToy, getFragmentMaterial, getSharedFragmentGeometry } from "./physics";

type FragmentRenderBatch = {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
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
  private readonly batchesByBlock = new Map<number, FragmentRenderBatch>();
  private readonly countsByBlock = new Map<number, number>();
  private readonly writeIndexesByBlock = new Map<number, number>();
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
    this.countsByBlock.clear();
    this.writeIndexesByBlock.clear();

    for (const toy of toys) {
      if (!toy.isInstancedFragment || toy.isExpired || toy.fragmentBlock === null) continue;

      this.countsByBlock.set(
        toy.fragmentBlock,
        (this.countsByBlock.get(toy.fragmentBlock) ?? 0) + 1
      );
    }

    for (const [block, count] of this.countsByBlock) {
      this.ensureBatchCapacity(block, count);
    }

    for (const batch of this.batchesByBlock.values()) {
      batch.mesh.count = 0;
      batch.mesh.visible = false;
    }

    for (const toy of toys) {
      if (!toy.isInstancedFragment || toy.isExpired || toy.fragmentBlock === null) continue;

      const batch = this.batchesByBlock.get(toy.fragmentBlock);
      if (!batch) continue;

      const writeIndex = this.writeIndexesByBlock.get(toy.fragmentBlock) ?? 0;
      this.writeIndexesByBlock.set(toy.fragmentBlock, writeIndex + 1);
      // Fragment toys are not added to the scene individually, so the instanced
      // renderer must carry their toy quaternion too. Without this, debris
      // physics could spin all day and still look like static sliding tiles.
      this.instanceMatrix.compose(toy.mesh.position, toy.mesh.quaternion, this.instanceScale);
      batch.mesh.setMatrixAt(writeIndex, this.instanceMatrix);
    }

    let totalInstances = 0;
    let totalCapacity = 0;
    for (const [block, count] of this.countsByBlock) {
      const batch = this.batchesByBlock.get(block);
      if (!batch) continue;

      batch.mesh.count = count;
      batch.mesh.visible = count > 0;
      batch.mesh.instanceMatrix.needsUpdate = count > 0;
      totalInstances += count;
    }

    for (const batch of this.batchesByBlock.values()) {
      totalCapacity += batch.capacity;
    }

    this.stats = {
      batches: this.batchesByBlock.size,
      instances: totalInstances,
      capacity: totalCapacity
    };
  }

  clear(): void {
    for (const batch of this.batchesByBlock.values()) {
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
    for (const batch of this.batchesByBlock.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.batchesByBlock.clear();
    this.countsByBlock.clear();
    this.writeIndexesByBlock.clear();
    this.stats = EMPTY_FRAGMENT_RENDER_STATS;
  }

  private ensureBatchCapacity(block: number, neededCapacity: number): void {
    const existingBatch = this.batchesByBlock.get(block);
    if (existingBatch && existingBatch.capacity >= neededCapacity) return;

    if (existingBatch) {
      this.scene.remove(existingBatch.mesh);
      existingBatch.mesh.dispose();
    }

    const capacity = roundCapacityUp(neededCapacity);
    const mesh = new THREE.InstancedMesh(
      getSharedFragmentGeometry(),
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
    mesh.name = `Block fragment instances ${block}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(mesh);
    this.batchesByBlock.set(block, { mesh, capacity });
  }
}

function roundCapacityUp(neededCapacity: number): number {
  let capacity = 1;
  while (capacity < neededCapacity) {
    capacity *= 2;
  }
  return capacity;
}
