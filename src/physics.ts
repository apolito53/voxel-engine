import * as THREE from "three";
import { BLOCKS } from "./blocks";
import type { CollisionWorld } from "./collision";

export const BLOCK_DAMAGE_IMPACT_SPEED = 2;

const FRAGMENT_SIZE = 0.34;
const FRAGMENT_RADIUS = 0.21;
const FRAGMENT_MAX_AGE_SECONDS = 9;
const FRAGMENT_SLEEP_SPEED = 0.18;
const FRAGMENT_SLEEP_AFTER_SECONDS = 0.35;

// Debris cubes all share one tiny geometry and one material per source block.
// Creating GPU buffers/materials during every explosion is exactly the sort of
// allocation burst that feels like a hitch even when the smoothed FPS looks fine.
const sharedFragmentGeometry = new THREE.BoxGeometry(
  FRAGMENT_SIZE,
  FRAGMENT_SIZE,
  FRAGMENT_SIZE
);
const sharedFragmentMaterials = new Map<number, THREE.MeshStandardMaterial>();

export type PhysicsImpact = {
  readonly block: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly normal: THREE.Vector3;
  readonly speed: number;
  readonly position: THREE.Vector3;
};

type PhysicsToyOptions = {
  readonly radius?: number;
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: THREE.MeshStandardMaterial;
  readonly damagesBlocks?: boolean;
  readonly castShadow?: boolean;
  readonly maxAgeSeconds?: number | null;
  readonly sleepSpeed?: number;
  readonly sleepAfterSeconds?: number;
  readonly disposeGeometry?: boolean;
  readonly disposeMaterial?: boolean;
};

export class PhysicsToy {
  readonly radius: number;
  readonly velocity: THREE.Vector3;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly damagesBlocks: boolean;
  private readonly closestPoint = new THREE.Vector3();
  private readonly centerDelta = new THREE.Vector3();
  private readonly disposeGeometry: boolean;
  private readonly disposeMaterial: boolean;
  private readonly maxAgeSeconds: number | null;
  private readonly sleepSpeed: number;
  private readonly sleepAfterSeconds: number;
  private ageSeconds = 0;
  private settledSeconds = 0;
  private sleeping = false;
  private expired = false;

  constructor(position: THREE.Vector3, velocity: THREE.Vector3, options: PhysicsToyOptions = {}) {
    this.radius = options.radius ?? 0.35;
    this.velocity = velocity.clone();
    this.mesh = new THREE.Mesh(
      options.geometry ?? new THREE.SphereGeometry(this.radius, 18, 12),
      options.material ?? new THREE.MeshStandardMaterial({
        color: 0xff3d52,
        roughness: 0.48,
        metalness: 0.1,
        emissive: 0x330008
      })
    );
    this.damagesBlocks = options.damagesBlocks ?? true;
    this.disposeGeometry = options.disposeGeometry ?? true;
    this.disposeMaterial = options.disposeMaterial ?? true;
    this.maxAgeSeconds = options.maxAgeSeconds ?? null;
    this.sleepSpeed = options.sleepSpeed ?? 0;
    this.sleepAfterSeconds = options.sleepAfterSeconds ?? 0;
    this.mesh.castShadow = options.castShadow ?? true;
    this.mesh.position.copy(position);
  }

  static createBlockFragment(block: number, position: THREE.Vector3, velocity: THREE.Vector3): PhysicsToy {
    return new PhysicsToy(position, velocity, {
      radius: FRAGMENT_RADIUS,
      geometry: sharedFragmentGeometry,
      material: getFragmentMaterial(block),
      damagesBlocks: false,
      castShadow: false,
      maxAgeSeconds: FRAGMENT_MAX_AGE_SECONDS + Math.random() * 3,
      sleepSpeed: FRAGMENT_SLEEP_SPEED,
      sleepAfterSeconds: FRAGMENT_SLEEP_AFTER_SECONDS,
      disposeGeometry: false,
      disposeMaterial: false
    });
  }

  get isExpired(): boolean {
    return this.expired;
  }

  update(delta: number, world: CollisionWorld, impacts: PhysicsImpact[] = []): PhysicsImpact[] {
    if (this.expired) return impacts;

    this.ageSeconds += delta;
    if (this.maxAgeSeconds !== null && this.ageSeconds >= this.maxAgeSeconds) {
      this.expired = true;
      return impacts;
    }

    if (this.sleeping) return impacts;

    this.velocity.y -= 18 * delta;
    this.mesh.position.addScaledVector(this.velocity, delta);

    const p = this.mesh.position;
    const minX = Math.floor(p.x - this.radius);
    const maxX = Math.floor(p.x + this.radius);
    const minY = Math.floor(p.y - this.radius);
    const maxY = Math.floor(p.y + this.radius);
    const minZ = Math.floor(p.z - this.radius);
    const maxZ = Math.floor(p.z + this.radius);
    let touchedSolidBlock = false;

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!world.isSolid(x, y, z)) continue;

          this.closestPoint.set(
            clampToBlock(p.x, x),
            clampToBlock(p.y, y),
            clampToBlock(p.z, z)
          );
          const distance = this.centerDelta.copy(p).sub(this.closestPoint).length();
          if (distance >= this.radius || distance === 0) {
            continue;
          }

          touchedSolidBlock = true;
          const normal = this.centerDelta.multiplyScalar(1 / distance);
          p.addScaledVector(normal, this.radius - distance + 0.001);
          const impact = this.velocity.dot(normal);
          if (impact < 0) {
            if (this.damagesBlocks) {
              impacts.push({
                block: { x, y, z },
                normal: normal.clone(),
                speed: -impact,
                position: p.clone()
              });
            }
            this.velocity.addScaledVector(normal, -impact * 1.55);
            this.velocity.multiplyScalar(0.985);
          }
        }
      }
    }

    this.updateSleepState(delta, touchedSolidBlock);
    return impacts;
  }

  dispose(): void {
    if (this.disposeGeometry) this.mesh.geometry.dispose();
    if (this.disposeMaterial) this.mesh.material.dispose();
  }

  private updateSleepState(delta: number, touchedSolidBlock: boolean): void {
    if (this.sleepAfterSeconds <= 0 || !touchedSolidBlock) {
      this.settledSeconds = 0;
      return;
    }

    if (this.velocity.lengthSq() > this.sleepSpeed * this.sleepSpeed) {
      this.settledSeconds = 0;
      return;
    }

    this.settledSeconds += delta;
    if (this.settledSeconds < this.sleepAfterSeconds) return;

    // Sleeping debris keeps the visual aftermath without paying collision costs forever.
    this.sleeping = true;
    this.velocity.set(0, 0, 0);
  }
}

function clampToBlock(value: number, blockCoordinate: number): number {
  return Math.max(blockCoordinate, Math.min(value, blockCoordinate + 1));
}

function getFragmentMaterial(block: number): THREE.MeshStandardMaterial {
  const cachedMaterial = sharedFragmentMaterials.get(block);
  if (cachedMaterial) return cachedMaterial;

  const definition = BLOCKS[block] ?? BLOCKS[0];
  const fragmentColor = new THREE.Color().setRGB(
    definition.color[0],
    definition.color[1],
    definition.color[2]
  );
  const material = new THREE.MeshStandardMaterial({
    color: fragmentColor,
    roughness: 0.88,
    metalness: 0.02
  });
  sharedFragmentMaterials.set(block, material);
  return material;
}
