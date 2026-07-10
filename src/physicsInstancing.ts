import * as THREE from "three";
import { getDebrisShapeGeometry, type DebrisShapeId } from "./debrisShapes";
import { PhysicsToy, getFragmentMaterial } from "./physics";
import { BLOCK_LIGHT_MAX_LEVEL, BLOCK_LIGHT_MIN_LEVEL, normalizeBlockLightLevel } from "./voxelBlockLight";

type ShaderWithUniforms = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];
type FragmentBlockLightSampler = (position: Pick<THREE.Vector3, "x" | "y" | "z">) => number;

type FragmentRenderBatch = {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly blockLights: THREE.InstancedBufferAttribute;
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

const FRAGMENT_BLOCK_LIGHT_ATTRIBUTE = "fragmentBlockLight";
const FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM = "voxelFragmentBlockLightLevelRange";
const FRAGMENT_BLOCK_LIGHT_STRENGTH = 1.45;

export class PhysicsFragmentInstancer {
  private readonly scene: THREE.Scene;
  private readonly batchesByKey = new Map<string, FragmentRenderBatch>();
  private readonly materialsByBlock = new Map<number, THREE.MeshStandardMaterial>();
  private readonly countsByKey = new Map<string, number>();
  private readonly writeIndexesByKey = new Map<string, number>();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly instanceScale = new THREE.Vector3(1, 1, 1);
  private readonly blockLightLevelRange = new THREE.Vector2(BLOCK_LIGHT_MIN_LEVEL, BLOCK_LIGHT_MAX_LEVEL);
  private stats: PhysicsFragmentRenderStats = EMPTY_FRAGMENT_RENDER_STATS;
  private debrisShadowsEnabled = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  getStats(): PhysicsFragmentRenderStats {
    return this.stats;
  }

  setDebrisShadowsEnabled(enabled: boolean): void {
    this.debrisShadowsEnabled = enabled;
    for (const batch of this.batchesByKey.values()) {
      batch.mesh.castShadow = enabled;
    }
  }

  setBlockLightRange(minLevel: number, maxLevel: number): void {
    const lowLevel = normalizeBlockLightLevel(Math.min(minLevel, maxLevel));
    const highLevel = normalizeBlockLightLevel(Math.max(minLevel, maxLevel));
    this.blockLightLevelRange.set(lowLevel, highLevel);
    for (const material of this.materialsByBlock.values()) {
      updatePhysicsFragmentMaterialBlockLightRange(material, lowLevel, highLevel);
    }
  }

  update(toys: readonly PhysicsToy[], sampleBlockLight: FragmentBlockLightSampler = () => 0): void {
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
      batch.blockLights.setX(writeIndex, normalizeBlockLightLevel(sampleBlockLight(toy.mesh.position)));
    }

    let totalInstances = 0;
    let totalCapacity = 0;
    for (const [key, count] of this.countsByKey) {
      const batch = this.batchesByKey.get(key);
      if (!batch) continue;

      batch.mesh.count = count;
      batch.mesh.visible = count > 0;
      batch.mesh.instanceMatrix.needsUpdate = count > 0;
      batch.blockLights.needsUpdate = count > 0;
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
      batch.mesh.geometry.dispose();
      batch.mesh.dispose();
    }
    for (const material of this.materialsByBlock.values()) material.dispose();
    this.batchesByKey.clear();
    this.materialsByBlock.clear();
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
      existingBatch.mesh.geometry.dispose();
      existingBatch.mesh.dispose();
    }

    const capacity = roundCapacityUp(neededCapacity);
    // Each batch owns its clone because the per-instance light attribute has a
    // capacity-specific buffer. The low-poly source shape remains shared and
    // untouched by the dynamic render data.
    const geometry = getDebrisShapeGeometry(shapeId).clone();
    const blockLights = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    blockLights.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(FRAGMENT_BLOCK_LIGHT_ATTRIBUTE, blockLights);
    const mesh = new THREE.InstancedMesh(
      geometry,
      this.getOrCreateFragmentRenderMaterial(block),
      capacity
    );

    // Fragment positions move every frame, and Three's computed instanced
    // bounds are not worth chasing for thousands of tiny transient shards.
    mesh.frustumCulled = false;
    mesh.castShadow = this.debrisShadowsEnabled;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.count = 0;
    mesh.name = `Block fragment instances ${block}:${shapeId}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(mesh);
    this.batchesByKey.set(key, { mesh, blockLights, block, shapeId, capacity });
  }

  private getOrCreateFragmentRenderMaterial(block: number): THREE.MeshStandardMaterial {
    const existing = this.materialsByBlock.get(block);
    if (existing) return existing;

    // PhysicsToy and parked-rubble meshes still share the plain material from
    // physics.ts. Instanced flight debris gets its own clone so adding an
    // instanced-only attribute cannot change either of those render contracts.
    const material = getFragmentMaterial(block).clone();
    const blockLightLevelRange = this.blockLightLevelRange.clone();
    material.userData[FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM] = blockLightLevelRange;
    material.onBeforeCompile = (shader) => {
      applyPhysicsFragmentBlockLightShaderPatch(shader, blockLightLevelRange);
      material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => "voxel-physics-fragment-block-light-v1";
    this.materialsByBlock.set(block, material);
    return material;
  }
}

export function applyPhysicsFragmentBlockLightShaderPatch(
  shader: ShaderWithUniforms,
  blockLightLevelRange = new THREE.Vector2(BLOCK_LIGHT_MIN_LEVEL, BLOCK_LIGHT_MAX_LEVEL)
): void {
  shader.uniforms[FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM] = { value: blockLightLevelRange };
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        `attribute float ${FRAGMENT_BLOCK_LIGHT_ATTRIBUTE};`,
        "varying float vFragmentBlockLight;"
      ].join("\n")
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvFragmentBlockLight = ${FRAGMENT_BLOCK_LIGHT_ATTRIBUTE};`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        `uniform vec2 ${FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM};`,
        "varying float vFragmentBlockLight;"
      ].join("\n")
    )
    .replace(
      "#include <lights_fragment_end>",
      [
        "#include <lights_fragment_end>",
        `float voxelFragmentMinLight = min(${FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM}.x, ${FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM}.y);`,
        `float voxelFragmentMaxLight = max(${FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM}.x, ${FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM}.y);`,
        "float voxelFragmentRawLight = clamp(vFragmentBlockLight, 0.0, 15.0);",
        "float voxelFragmentClampedLight = clamp(voxelFragmentRawLight, voxelFragmentMinLight, voxelFragmentMaxLight);",
        "float voxelFragmentLight = clamp(voxelFragmentClampedLight / 15.0, 0.0, 1.0);",
        "float voxelFragmentLightCurve = voxelFragmentLight * voxelFragmentLight;",
        `vec3 voxelFragmentLightColor = vec3(1.0, 0.62, 0.28) * ${FRAGMENT_BLOCK_LIGHT_STRENGTH.toFixed(2)};`,
        "reflectedLight.indirectDiffuse += diffuseColor.rgb * voxelFragmentLightColor * voxelFragmentLightCurve;"
      ].join("\n")
    );
}

function updatePhysicsFragmentMaterialBlockLightRange(
  material: THREE.MeshStandardMaterial,
  minLevel: number,
  maxLevel: number
): void {
  const range = material.userData[FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM];
  if (range instanceof THREE.Vector2) range.set(minLevel, maxLevel);

  const shader = material.userData.shader as ShaderWithUniforms | undefined;
  const shaderRange = shader?.uniforms[FRAGMENT_BLOCK_LIGHT_RANGE_UNIFORM]?.value;
  if (shaderRange instanceof THREE.Vector2) shaderRange.set(minLevel, maxLevel);
}

function isRenderableFragment(
  toy: PhysicsToy
): toy is PhysicsToy & { readonly fragmentBlock: number; readonly debrisShape: NonNullable<PhysicsToy["debrisShape"]> } {
  return (
    toy.isInstancedFragment &&
    toy.isFragmentRenderVisible &&
    !toy.isExpired &&
    toy.fragmentBlock !== null &&
    toy.debrisShape !== null
  );
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
