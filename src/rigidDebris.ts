import {
  ColliderDesc,
  RigidBodyDesc,
  World as RapierWorld,
  init as initRapier,
  type Collider,
  type RigidBody
} from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { BLOCK_FRAGMENT_VISUAL_SIZE } from "./blockFragments";
import type { CollisionBounds, CollisionWorld } from "./collision";
import type { PhysicsToy } from "./physics";

const RIGID_DEBRIS_GRAVITY = -18;
const RIGID_DEBRIS_FIXED_STEP = 1 / 60;
const RIGID_DEBRIS_MAX_FRAME_DELTA = 1 / 12;
const RIGID_DEBRIS_MAX_SUBSTEPS = 4;
const RIGID_DEBRIS_STATIC_REFRESH_SECONDS = 0.12;
const RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS = 2;
export const RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET = 4096;
const RIGID_DEBRIS_COLLIDER_HALF_SIZE = BLOCK_FRAGMENT_VISUAL_SIZE * 0.5;
const RIGID_DEBRIS_MASS = 0.4;
const RIGID_DEBRIS_LINEAR_DAMPING = 0.45;
const RIGID_DEBRIS_ANGULAR_DAMPING = 0.85;
const RIGID_DEBRIS_FRICTION = 0.92;
const RIGID_DEBRIS_RESTITUTION = 0.08;
const RIGID_DEBRIS_TERRAIN_FRICTION = 1.05;
const RIGID_DEBRIS_SUPPORT_MIN_HEIGHT = 0.04;
const RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION = 1000;
const RAPIER_COMPAT_INIT_WARNING = "using deprecated parameters for the initialization function";

type RigidDebrisBody = {
  readonly toy: PhysicsToy;
  readonly body: RigidBody;
};

type StaticColliderRecord = {
  readonly collider: Collider;
};

type StaticColliderCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type RigidDebrisStats = {
  readonly initialized: boolean;
  readonly bodies: number;
  readonly sleepingBodies: number;
  readonly terrainColliders: number;
  readonly rubbleSupportColliders: number;
};

export function createEmptyRigidDebrisStats(): RigidDebrisStats {
  return {
    initialized: false,
    bodies: 0,
    sleepingBodies: 0,
    terrainColliders: 0,
    rubbleSupportColliders: 0
  };
}

export class RigidDebrisSimulation {
  private readonly pendingFragments = new Set<PhysicsToy>();
  private readonly bodiesByToy = new Map<PhysicsToy, RigidDebrisBody>();
  private readonly terrainColliders = new Map<string, StaticColliderRecord>();
  private readonly rubbleSupportColliders = new Map<string, StaticColliderRecord>();
  private readonly activeColliderCells = new Set<string>();
  private readonly desiredTerrainColliderKeys = new Set<string>();
  private readonly desiredRubbleSupportColliderKeys = new Set<string>();
  private readonly syncPosition = new THREE.Vector3();
  private readonly syncQuaternion = new THREE.Quaternion();
  private readonly syncLinearVelocity = new THREE.Vector3();
  private readonly syncAngularVelocity = new THREE.Vector3();
  private world: RapierWorld | null = null;
  private initializePromise: Promise<void> | null = null;
  private accumulatorSeconds = 0;
  private staticRefreshSeconds = Infinity;
  private staticCollidersDirty = true;
  private disposed = false;
  private stats: RigidDebrisStats = createEmptyRigidDebrisStats();

  initialize(): Promise<void> {
    if (this.world) return Promise.resolve();
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = initializeRapierCompatQuietly().then(() => {
      if (this.disposed) return;

      this.world = new RapierWorld({ x: 0, y: RIGID_DEBRIS_GRAVITY, z: 0 });
      this.world.timestep = RIGID_DEBRIS_FIXED_STEP;
      this.world.numSolverIterations = 6;
      this.world.maxCcdSubsteps = 1;
      this.flushPendingFragments();
      this.refreshStats();
    });
    return this.initializePromise;
  }

  registerFragment(toy: PhysicsToy): void {
    if (!toy.isInstancedFragment || toy.isExpired) return;
    if (this.bodiesByToy.has(toy)) return;

    this.pendingFragments.add(toy);
    this.staticCollidersDirty = true;
    if (this.world) {
      this.flushPendingFragments();
    } else {
      void this.initialize();
    }
  }

  update(delta: number, collisionWorld: CollisionWorld): RigidDebrisStats {
    if (!this.world) {
      void this.initialize();
      this.refreshStats();
      return this.stats;
    }

    this.flushPendingFragments();
    this.removeExpiredBodies();
    if (this.bodiesByToy.size === 0) {
      this.clearStaticColliders();
      this.refreshStats();
      return this.stats;
    }

    this.refreshStaticCollidersIfNeeded(Math.max(0, delta), collisionWorld);
    this.accumulatorSeconds += Math.min(Math.max(0, delta), RIGID_DEBRIS_MAX_FRAME_DELTA);

    let substeps = 0;
    while (
      this.accumulatorSeconds >= RIGID_DEBRIS_FIXED_STEP &&
      substeps < RIGID_DEBRIS_MAX_SUBSTEPS
    ) {
      this.world.timestep = RIGID_DEBRIS_FIXED_STEP;
      this.world.step();
      this.accumulatorSeconds -= RIGID_DEBRIS_FIXED_STEP;
      substeps += 1;
    }

    if (substeps === RIGID_DEBRIS_MAX_SUBSTEPS) {
      this.accumulatorSeconds = Math.min(this.accumulatorSeconds, RIGID_DEBRIS_FIXED_STEP);
    }

    this.syncBodiesToToys();
    this.refreshStats();
    return this.stats;
  }

  syncToyStatesToBodies(): void {
    if (!this.world) return;

    for (const record of this.bodiesByToy.values()) {
      if (record.toy.isExpired || record.toy.isSleeping) continue;

      const position = record.toy.mesh.position;
      const quaternion = record.toy.mesh.quaternion;
      record.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
      record.body.setRotation({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w
      }, true);
      record.body.setLinvel({
        x: record.toy.velocity.x,
        y: record.toy.velocity.y,
        z: record.toy.velocity.z
      }, true);
      record.body.setAngvel({
        x: record.toy.angularVelocity.x,
        y: record.toy.angularVelocity.y,
        z: record.toy.angularVelocity.z
      }, true);
      record.body.wakeUp();
    }
  }

  forget(toy: PhysicsToy): void {
    this.pendingFragments.delete(toy);
    const record = this.bodiesByToy.get(toy);
    if (!record) return;

    this.world?.removeRigidBody(record.body);
    this.bodiesByToy.delete(toy);
    toy.detachRigidDebrisBody();
    this.staticCollidersDirty = true;
    this.refreshStats();
  }

  invalidateStaticColliders(): void {
    this.staticCollidersDirty = true;
  }

  clear(): void {
    for (const record of this.bodiesByToy.values()) {
      this.world?.removeRigidBody(record.body);
      record.toy.detachRigidDebrisBody();
    }
    this.pendingFragments.clear();
    this.bodiesByToy.clear();
    this.accumulatorSeconds = 0;
    this.clearStaticColliders();
    this.refreshStats();
  }

  dispose(): void {
    if (this.disposed) return;

    this.clear();
    this.disposed = true;
    this.world?.free();
    this.world = null;
    this.initializePromise = null;
    this.refreshStats();
  }

  getStats(): RigidDebrisStats {
    this.refreshStats();
    return this.stats;
  }

  private flushPendingFragments(): void {
    if (!this.world) return;

    for (const toy of this.pendingFragments) {
      if (!toy.isInstancedFragment || toy.isExpired || this.bodiesByToy.has(toy)) continue;

      const body = this.createBody(toy);
      this.bodiesByToy.set(toy, { toy, body });
      toy.attachRigidDebrisBody();
    }
    this.pendingFragments.clear();
  }

  private createBody(toy: PhysicsToy): RigidBody {
    if (!this.world) {
      throw new Error("Rigid debris world is not initialized.");
    }

    const position = toy.mesh.position;
    const quaternion = toy.mesh.quaternion;
    const bodyDesc = RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setLinvel(toy.velocity.x, toy.velocity.y, toy.velocity.z)
      .setAngvel({ x: toy.angularVelocity.x, y: toy.angularVelocity.y, z: toy.angularVelocity.z })
      .setLinearDamping(RIGID_DEBRIS_LINEAR_DAMPING)
      .setAngularDamping(RIGID_DEBRIS_ANGULAR_DAMPING)
      .setCanSleep(true)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = ColliderDesc
      .cuboid(
        RIGID_DEBRIS_COLLIDER_HALF_SIZE,
        RIGID_DEBRIS_COLLIDER_HALF_SIZE,
        RIGID_DEBRIS_COLLIDER_HALF_SIZE
      )
      .setMass(RIGID_DEBRIS_MASS)
      .setFriction(RIGID_DEBRIS_FRICTION)
      .setRestitution(RIGID_DEBRIS_RESTITUTION)
      .setContactSkin(0.002);

    this.world.createCollider(colliderDesc, body);
    return body;
  }

  private removeExpiredBodies(): void {
    for (const record of [...this.bodiesByToy.values()]) {
      if (record.toy.isExpired) this.forget(record.toy);
    }
  }

  private syncBodiesToToys(): void {
    for (const record of this.bodiesByToy.values()) {
      const translation = record.body.translation();
      const rotation = record.body.rotation();
      const linvel = record.body.linvel();
      const angvel = record.body.angvel();

      this.syncPosition.set(translation.x, translation.y, translation.z);
      this.syncQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
      this.syncLinearVelocity.set(linvel.x, linvel.y, linvel.z);
      this.syncAngularVelocity.set(angvel.x, angvel.y, angvel.z);
      record.toy.syncRigidDebrisState({
        position: this.syncPosition,
        quaternion: this.syncQuaternion,
        linearVelocity: this.syncLinearVelocity,
        angularVelocity: this.syncAngularVelocity,
        sleeping: record.body.isSleeping()
      });
    }
  }

  private refreshStaticCollidersIfNeeded(delta: number, collisionWorld: CollisionWorld): void {
    this.staticRefreshSeconds += delta;
    if (
      !this.staticCollidersDirty &&
      this.staticRefreshSeconds < RIGID_DEBRIS_STATIC_REFRESH_SECONDS
    ) {
      return;
    }

    this.staticRefreshSeconds = 0;
    this.staticCollidersDirty = false;
    this.collectActiveColliderCells();
    this.syncTerrainColliders(collisionWorld);
    this.syncRubbleSupportColliders(collisionWorld);
  }

  private collectActiveColliderCells(): void {
    this.activeColliderCells.clear();
    for (const record of this.bodiesByToy.values()) {
      if (record.toy.isExpired || record.toy.isSleeping) continue;

      const position = record.toy.mesh.position;
      const centerX = Math.floor(position.x);
      const centerY = Math.floor(position.y);
      const centerZ = Math.floor(position.z);

      for (
        let y = centerY - RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
        y <= centerY + RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
        y += 1
      ) {
        for (
          let z = centerZ - RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
          z <= centerZ + RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
          z += 1
        ) {
          for (
            let x = centerX - RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
            x <= centerX + RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS;
            x += 1
          ) {
            this.activeColliderCells.add(getStaticColliderCellKey(x, y, z));
            if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) return;
          }
        }
      }
    }
  }

  private syncTerrainColliders(collisionWorld: CollisionWorld): void {
    this.desiredTerrainColliderKeys.clear();
    for (const key of this.activeColliderCells) {
      const cell = parseStaticColliderCellKey(key);
      if (!cell || !collisionWorld.isSolid(cell.x, cell.y, cell.z)) continue;

      this.desiredTerrainColliderKeys.add(key);
    }
    this.syncStaticColliderMap(
      this.terrainColliders,
      this.desiredTerrainColliderKeys,
      (key) => this.createTerrainCollider(key)
    );
  }

  private syncRubbleSupportColliders(collisionWorld: CollisionWorld): void {
    this.desiredRubbleSupportColliderKeys.clear();
    if (!collisionWorld.getSupportHeight) {
      this.syncStaticColliderMap(
        this.rubbleSupportColliders,
        this.desiredRubbleSupportColliderKeys,
        (key) => this.createRubbleSupportCollider(key)
      );
      return;
    }

    for (const key of this.activeColliderCells) {
      const cell = parseStaticColliderCellKey(key);
      if (!cell || collisionWorld.isSolid(cell.x, cell.y, cell.z)) continue;

      const supportBounds = createCellSupportBounds(cell);
      const supportHeight = collisionWorld.getSupportHeight(supportBounds);
      if (supportHeight === null) continue;

      const localHeight = supportHeight - cell.y;
      if (localHeight < RIGID_DEBRIS_SUPPORT_MIN_HEIGHT || localHeight > 1) continue;

      this.desiredRubbleSupportColliderKeys.add(
        getRubbleSupportColliderKey(cell.x, cell.y, cell.z, localHeight)
      );
    }

    this.syncStaticColliderMap(
      this.rubbleSupportColliders,
      this.desiredRubbleSupportColliderKeys,
      (key) => this.createRubbleSupportCollider(key)
    );
  }

  private syncStaticColliderMap(
    colliders: Map<string, StaticColliderRecord>,
    desiredKeys: ReadonlySet<string>,
    createCollider: (key: string) => Collider | null
  ): void {
    if (!this.world) return;

    for (const [key, record] of colliders) {
      if (desiredKeys.has(key)) continue;

      this.world.removeCollider(record.collider, true);
      colliders.delete(key);
    }

    for (const key of desiredKeys) {
      if (colliders.has(key)) continue;

      const collider = createCollider(key);
      if (collider) colliders.set(key, { collider });
    }
  }

  private createTerrainCollider(key: string): Collider | null {
    if (!this.world) return null;

    const cell = parseStaticColliderCellKey(key);
    if (!cell) return null;

    return this.world.createCollider(
      ColliderDesc
        .cuboid(0.5, 0.5, 0.5)
        .setTranslation(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5)
        .setFriction(RIGID_DEBRIS_TERRAIN_FRICTION)
        .setRestitution(0)
    );
  }

  private createRubbleSupportCollider(key: string): Collider | null {
    if (!this.world) return null;

    const support = parseRubbleSupportColliderKey(key);
    if (!support) return null;

    return this.world.createCollider(
      ColliderDesc
        .cuboid(0.5, support.height * 0.5, 0.5)
        .setTranslation(support.x + 0.5, support.y + support.height * 0.5, support.z + 0.5)
        .setFriction(RIGID_DEBRIS_TERRAIN_FRICTION)
        .setRestitution(0)
    );
  }

  private clearStaticColliders(): void {
    if (this.world) {
      for (const record of this.terrainColliders.values()) {
        this.world.removeCollider(record.collider, true);
      }
      for (const record of this.rubbleSupportColliders.values()) {
        this.world.removeCollider(record.collider, true);
      }
    }
    this.terrainColliders.clear();
    this.rubbleSupportColliders.clear();
    this.activeColliderCells.clear();
    this.desiredTerrainColliderKeys.clear();
    this.desiredRubbleSupportColliderKeys.clear();
    this.staticCollidersDirty = true;
    this.staticRefreshSeconds = Infinity;
  }

  private refreshStats(): void {
    let sleepingBodies = 0;
    for (const record of this.bodiesByToy.values()) {
      if (record.body.isSleeping()) sleepingBodies += 1;
    }

    this.stats = {
      initialized: this.world !== null,
      bodies: this.bodiesByToy.size,
      sleepingBodies,
      terrainColliders: this.terrainColliders.size,
      rubbleSupportColliders: this.rubbleSupportColliders.size
    };
  }
}

function createCellSupportBounds(cell: StaticColliderCell): CollisionBounds {
  return {
    minX: cell.x,
    maxX: cell.x + 1,
    minY: cell.y,
    maxY: cell.y + 1,
    minZ: cell.z,
    maxZ: cell.z + 1
  };
}

function getStaticColliderCellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseStaticColliderCellKey(key: string): StaticColliderCell | null {
  const parts = key.split(",");
  if (parts.length !== 3) return null;

  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function getRubbleSupportColliderKey(x: number, y: number, z: number, height: number): string {
  const quantizedHeight = Math.round(height * RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION) /
    RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION;
  return `${x},${y},${z},${quantizedHeight}`;
}

function parseRubbleSupportColliderKey(
  key: string
): (StaticColliderCell & { readonly height: number }) | null {
  const parts = key.split(",");
  if (parts.length !== 4) return null;

  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  const height = Number(parts[3]);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  return { x, y, z, height };
}

async function initializeRapierCompatQuietly(): Promise<void> {
  const originalWarn = console.warn;
  const filteredWarn = (...args: unknown[]) => {
    const [firstArg] = args;
    if (typeof firstArg === "string" && firstArg.includes(RAPIER_COMPAT_INIT_WARNING)) {
      return;
    }
    originalWarn(...args);
  };
  console.warn = filteredWarn;

  try {
    await initRapier();
  } finally {
    if (console.warn === filteredWarn) {
      console.warn = originalWarn;
    }
  }
}
