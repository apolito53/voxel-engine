import * as THREE from "three";
import {
  BLOCK_FRAGMENT_COLLISION_RADIUS,
  BLOCK_FRAGMENT_VISUAL_SIZE
} from "./blockFragments";
import { BLOCKS } from "./blocks";
import type { CollisionWorld } from "./collision";

export const BLOCK_DAMAGE_IMPACT_SPEED = 2;

const FRAGMENT_MAX_AGE_SECONDS = 9;
const FRAGMENT_INVERSE_MASS = 2.5;
const FRAGMENT_SLEEP_SPEED = 0.18;
const FRAGMENT_SLEEP_AFTER_SECONDS = 0.35;
const PHYSICS_TOY_COLLISION_CELL_SIZE = 1;
const PHYSICS_TOY_COLLISION_RESTITUTION = 0.42;
const PHYSICS_TOY_COLLISION_DAMPING = 0.995;
const PHYSICS_TOY_COLLISION_EPSILON = 0.000001;

// Debris cubes all share one tiny geometry and one material per source block.
// Creating GPU buffers/materials during every explosion is exactly the sort of
// allocation burst that feels like a hitch even when the smoothed FPS looks fine.
const sharedFragmentGeometry = new THREE.BoxGeometry(
  BLOCK_FRAGMENT_VISUAL_SIZE,
  BLOCK_FRAGMENT_VISUAL_SIZE,
  BLOCK_FRAGMENT_VISUAL_SIZE
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
  readonly inverseMass?: number;
  readonly castShadow?: boolean;
  readonly maxAgeSeconds?: number | null;
  readonly sleepSpeed?: number;
  readonly sleepAfterSeconds?: number;
  readonly disposeGeometry?: boolean;
  readonly disposeMaterial?: boolean;
};

export type PhysicsToyCollisionStats = {
  readonly activeBodies: number;
  readonly broadphaseCells: number;
  readonly candidatePairs: number;
  readonly resolvedContacts: number;
  readonly skippedDebrisPairs: number;
};

type MutablePhysicsToyCollisionStats = {
  -readonly [Key in keyof PhysicsToyCollisionStats]: PhysicsToyCollisionStats[Key];
};

export class PhysicsToy {
  readonly radius: number;
  readonly inverseMass: number;
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
    this.inverseMass = Math.max(0, options.inverseMass ?? 1);
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
      radius: BLOCK_FRAGMENT_COLLISION_RADIUS,
      geometry: sharedFragmentGeometry,
      material: getFragmentMaterial(block),
      damagesBlocks: false,
      inverseMass: FRAGMENT_INVERSE_MASS,
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

  get isSleeping(): boolean {
    return this.sleeping;
  }

  wakeFromToyCollision(): void {
    if (!this.sleeping) return;

    this.sleeping = false;
    this.settledSeconds = 0;
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

export function createEmptyPhysicsToyCollisionStats(): PhysicsToyCollisionStats {
  return {
    activeBodies: 0,
    broadphaseCells: 0,
    candidatePairs: 0,
    resolvedContacts: 0,
    skippedDebrisPairs: 0
  };
}

export class PhysicsToyCollider {
  private readonly cells = new Map<string, number[]>();
  private readonly visitedPairs = new Set<string>();
  private readonly normal = new THREE.Vector3();
  private readonly relativeVelocity = new THREE.Vector3();
  private readonly stats: MutablePhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();

  resolve(toys: readonly PhysicsToy[]): PhysicsToyCollisionStats {
    this.clearBroadphase();
    this.resetStats();

    for (let index = 0; index < toys.length; index += 1) {
      const toy = toys[index];
      if (!toy || toy.isExpired) continue;

      this.stats.activeBodies += 1;
      this.insertToy(index, toy);
    }

    this.stats.broadphaseCells = this.cells.size;
    for (const cellToyIndexes of this.cells.values()) {
      this.resolveCellPairs(cellToyIndexes, toys);
    }

    return { ...this.stats };
  }

  private clearBroadphase(): void {
    this.cells.clear();
    this.visitedPairs.clear();
  }

  private resetStats(): void {
    this.stats.activeBodies = 0;
    this.stats.broadphaseCells = 0;
    this.stats.candidatePairs = 0;
    this.stats.resolvedContacts = 0;
    this.stats.skippedDebrisPairs = 0;
  }

  private insertToy(index: number, toy: PhysicsToy): void {
    const position = toy.mesh.position;
    const minX = Math.floor((position.x - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxX = Math.floor((position.x + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const minY = Math.floor((position.y - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxY = Math.floor((position.y + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const minZ = Math.floor((position.z - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxZ = Math.floor((position.z + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = `${x},${y},${z}`;
          const cell = this.cells.get(key);
          if (cell) {
            cell.push(index);
          } else {
            this.cells.set(key, [index]);
          }
        }
      }
    }
  }

  private resolveCellPairs(cellToyIndexes: readonly number[], toys: readonly PhysicsToy[]): void {
    for (let leftCursor = 0; leftCursor < cellToyIndexes.length - 1; leftCursor += 1) {
      const leftIndex = cellToyIndexes[leftCursor];
      for (let rightCursor = leftCursor + 1; rightCursor < cellToyIndexes.length; rightCursor += 1) {
        const rightIndex = cellToyIndexes[rightCursor];
        if (leftIndex === undefined || rightIndex === undefined) continue;

        const pairKey = leftIndex < rightIndex
          ? `${leftIndex}:${rightIndex}`
          : `${rightIndex}:${leftIndex}`;
        if (this.visitedPairs.has(pairKey)) continue;
        this.visitedPairs.add(pairKey);
        this.stats.candidatePairs += 1;

        const leftToy = toys[leftIndex];
        const rightToy = toys[rightIndex];
        if (!leftToy || !rightToy) continue;
        if (!this.shouldResolvePair(leftToy, rightToy)) continue;
        if (this.resolvePair(leftToy, rightToy)) {
          this.stats.resolvedContacts += 1;
        }
      }
    }
  }

  private shouldResolvePair(leftToy: PhysicsToy, rightToy: PhysicsToy): boolean {
    if (leftToy.isExpired || rightToy.isExpired) return false;
    if (!leftToy.damagesBlocks && !rightToy.damagesBlocks) {
      this.stats.skippedDebrisPairs += 1;
      return false;
    }

    // Sleeping debris still lives in the broadphase so an active core can wake
    // and shove it, but sleeping/sleeping contacts are ignored entirely.
    return !(leftToy.isSleeping && rightToy.isSleeping);
  }

  private resolvePair(leftToy: PhysicsToy, rightToy: PhysicsToy): boolean {
    const leftPosition = leftToy.mesh.position;
    const rightPosition = rightToy.mesh.position;
    const combinedRadius = leftToy.radius + rightToy.radius;
    const combinedRadiusSq = combinedRadius * combinedRadius;
    const distanceSq = this.normal.subVectors(rightPosition, leftPosition).lengthSq();

    if (distanceSq >= combinedRadiusSq) return false;

    const distance = Math.sqrt(distanceSq);
    if (distance > PHYSICS_TOY_COLLISION_EPSILON) {
      this.normal.multiplyScalar(1 / distance);
    } else {
      this.normal.copy(rightToy.velocity).sub(leftToy.velocity);
      if (this.normal.lengthSq() <= PHYSICS_TOY_COLLISION_EPSILON) {
        this.normal.set(1, 0, 0);
      } else {
        this.normal.normalize();
      }
    }

    const inverseMassSum = leftToy.inverseMass + rightToy.inverseMass;
    if (inverseMassSum <= 0) return false;

    const penetration = combinedRadius - distance;
    leftPosition.addScaledVector(this.normal, -(penetration * leftToy.inverseMass) / inverseMassSum);
    rightPosition.addScaledVector(this.normal, (penetration * rightToy.inverseMass) / inverseMassSum);

    this.relativeVelocity.copy(rightToy.velocity).sub(leftToy.velocity);
    const closingSpeed = this.relativeVelocity.dot(this.normal);
    if (Math.abs(closingSpeed) > 0.05 || penetration > 0.001) {
      leftToy.wakeFromToyCollision();
      rightToy.wakeFromToyCollision();
    }

    if (closingSpeed >= 0) return true;

    const impulse = (-(1 + PHYSICS_TOY_COLLISION_RESTITUTION) * closingSpeed) / inverseMassSum;
    leftToy.velocity.addScaledVector(this.normal, -impulse * leftToy.inverseMass);
    rightToy.velocity.addScaledVector(this.normal, impulse * rightToy.inverseMass);
    leftToy.velocity.multiplyScalar(PHYSICS_TOY_COLLISION_DAMPING);
    rightToy.velocity.multiplyScalar(PHYSICS_TOY_COLLISION_DAMPING);
    return true;
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
