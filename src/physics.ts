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
  readonly sleepingBodies: number;
  readonly broadphaseCells: number;
  readonly sleepingBroadphaseCells: number;
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
    sleepingBodies: 0,
    broadphaseCells: 0,
    sleepingBroadphaseCells: 0,
    candidatePairs: 0,
    resolvedContacts: 0,
    skippedDebrisPairs: 0
  };
}

export class PhysicsToyCollider {
  private readonly activeCells = new Map<string, PhysicsToy[]>();
  private readonly sleepingCells = new Map<string, PhysicsToy[]>();
  private readonly sleepingCellKeys = new WeakMap<PhysicsToy, string[]>();
  private readonly toyIds = new WeakMap<PhysicsToy, number>();
  private readonly visitedPairs = new Set<string>();
  private readonly normal = new THREE.Vector3();
  private readonly relativeVelocity = new THREE.Vector3();
  private readonly stats: MutablePhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();
  private nextToyId = 1;

  resolve(toys: readonly PhysicsToy[]): PhysicsToyCollisionStats {
    this.clearFrameBroadphase();
    this.resetStats();

    for (const toy of toys) {
      if (!toy) continue;
      if (toy.isExpired) {
        this.removeSleepingToy(toy);
        continue;
      }

      if (toy.isSleeping) {
        this.stats.sleepingBodies += 1;
        this.indexSleepingToy(toy);
        continue;
      }

      this.removeSleepingToy(toy);
      this.stats.activeBodies += 1;
      this.insertToyIntoCells(this.activeCells, toy);
    }

    this.stats.broadphaseCells = this.activeCells.size;
    for (const [cellKey, activeCellToys] of this.activeCells) {
      this.resolveCellPairs(activeCellToys);
      this.resolveActiveSleepingPairs(activeCellToys, this.sleepingCells.get(cellKey));
    }
    this.stats.sleepingBroadphaseCells = this.sleepingCells.size;

    return { ...this.stats };
  }

  forget(toy: PhysicsToy): void {
    this.removeSleepingToy(toy);
  }

  private clearFrameBroadphase(): void {
    this.activeCells.clear();
    this.visitedPairs.clear();
  }

  private resetStats(): void {
    this.stats.activeBodies = 0;
    this.stats.sleepingBodies = 0;
    this.stats.broadphaseCells = 0;
    this.stats.sleepingBroadphaseCells = 0;
    this.stats.candidatePairs = 0;
    this.stats.resolvedContacts = 0;
    this.stats.skippedDebrisPairs = 0;
  }

  private indexSleepingToy(toy: PhysicsToy): void {
    if (this.sleepingCellKeys.has(toy)) return;

    const cellKeys = this.getToyCellKeys(toy);
    this.sleepingCellKeys.set(toy, cellKeys);
    for (const key of cellKeys) {
      const cell = this.sleepingCells.get(key);
      if (cell) {
        cell.push(toy);
      } else {
        this.sleepingCells.set(key, [toy]);
      }
    }
  }

  private removeSleepingToy(toy: PhysicsToy): void {
    const cellKeys = this.sleepingCellKeys.get(toy);
    if (!cellKeys) return;

    for (const key of cellKeys) {
      const cell = this.sleepingCells.get(key);
      if (!cell) continue;

      const toyIndex = cell.indexOf(toy);
      if (toyIndex >= 0) cell.splice(toyIndex, 1);
      if (cell.length === 0) {
        this.sleepingCells.delete(key);
      }
    }
    this.sleepingCellKeys.delete(toy);
  }

  private insertToyIntoCells(cells: Map<string, PhysicsToy[]>, toy: PhysicsToy): void {
    for (const key of this.getToyCellKeys(toy)) {
      const cell = cells.get(key);
      if (cell) {
        cell.push(toy);
      } else {
        cells.set(key, [toy]);
      }
    }
  }

  private getToyCellKeys(toy: PhysicsToy): string[] {
    const position = toy.mesh.position;
    const minX = Math.floor((position.x - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxX = Math.floor((position.x + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const minY = Math.floor((position.y - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxY = Math.floor((position.y + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const minZ = Math.floor((position.z - toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const maxZ = Math.floor((position.z + toy.radius) / PHYSICS_TOY_COLLISION_CELL_SIZE);
    const keys: string[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          keys.push(`${x},${y},${z}`);
        }
      }
    }
    return keys;
  }

  private resolveCellPairs(cellToys: readonly PhysicsToy[]): void {
    for (let leftCursor = 0; leftCursor < cellToys.length - 1; leftCursor += 1) {
      const leftToy = cellToys[leftCursor];
      for (let rightCursor = leftCursor + 1; rightCursor < cellToys.length; rightCursor += 1) {
        const rightToy = cellToys[rightCursor];
        if (!leftToy || !rightToy) continue;

        this.resolveCandidatePair(leftToy, rightToy);
      }
    }
  }

  private resolveActiveSleepingPairs(activeCellToys: readonly PhysicsToy[], sleepingCellToys?: readonly PhysicsToy[]): void {
    if (!sleepingCellToys) return;

    // Resolving a contact can wake a sleeping toy, which removes it from the
    // static broadphase cell. Snapshot the cell first so later sleeping toys in
    // the same cell still get considered during this frame.
    const sleepingSnapshot = [...sleepingCellToys];
    for (const activeToy of activeCellToys) {
      for (const sleepingToy of sleepingSnapshot) {
        if (!activeToy || !sleepingToy) continue;
        this.resolveCandidatePair(activeToy, sleepingToy);
      }
    }
  }

  private resolveCandidatePair(leftToy: PhysicsToy, rightToy: PhysicsToy): void {
    const pairKey = this.pairKey(leftToy, rightToy);
    if (this.visitedPairs.has(pairKey)) return;

    this.visitedPairs.add(pairKey);
    this.stats.candidatePairs += 1;
    if (!this.shouldResolvePair(leftToy, rightToy)) return;
    if (this.resolvePair(leftToy, rightToy)) {
      this.stats.resolvedContacts += 1;
    }
  }

  private pairKey(leftToy: PhysicsToy, rightToy: PhysicsToy): string {
    const leftId = this.toyId(leftToy);
    const rightId = this.toyId(rightToy);
    return leftId < rightId
      ? `${leftId}:${rightId}`
      : `${rightId}:${leftId}`;
  }

  private toyId(toy: PhysicsToy): number {
    const existingId = this.toyIds.get(toy);
    if (existingId !== undefined) return existingId;

    const newId = this.nextToyId;
    this.nextToyId += 1;
    this.toyIds.set(toy, newId);
    return newId;
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
    const leftWasSleeping = leftToy.isSleeping;
    const rightWasSleeping = rightToy.isSleeping;
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
      if (leftWasSleeping) this.removeSleepingToy(leftToy);
      if (rightWasSleeping) this.removeSleepingToy(rightToy);
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
