import {
  ColliderDesc,
  RigidBodyDesc,
  World as RapierWorld,
  init as initRapier,
  type Collider,
  type RigidBody
} from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { CollisionBounds, CollisionWorld } from "./collision";
import { createDefaultDebrisShape } from "./debrisShapes";
import type { PhysicsToy } from "./physics";

const RIGID_DEBRIS_GRAVITY = -18;
const RIGID_DEBRIS_MAX_FRAME_DELTA = 1 / 12;
export const RIGID_DEBRIS_NOMINAL_TICK_HZ = 30;
export const RIGID_DEBRIS_PRESSURE_TICK_HZ = 20;
export const RIGID_DEBRIS_PANIC_TICK_HZ = 15;
const RIGID_DEBRIS_PRESSURE_TICK_STRESS = 0.3;
const RIGID_DEBRIS_PANIC_TICK_STRESS = 0.72;
const RIGID_DEBRIS_STATIC_REFRESH_SECONDS = 0.12;
const RIGID_DEBRIS_DIRTY_STATIC_REFRESH_MIN_SECONDS = 0.08;
const RIGID_DEBRIS_STATIC_LOOKAHEAD_SECONDS =
  RIGID_DEBRIS_STATIC_REFRESH_SECONDS + 1 / RIGID_DEBRIS_NOMINAL_TICK_HZ;
const RIGID_DEBRIS_STATIC_LOOKAHEAD_SAMPLES = 2;
const RIGID_DEBRIS_STATIC_SCAN_RADIUS_BLOCKS = 1;
export const RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET = 1536;
const RIGID_DEBRIS_MASS = 0.4;
const RIGID_DEBRIS_LINEAR_DAMPING = 0.45;
const RIGID_DEBRIS_ANGULAR_DAMPING = 0.85;
const RIGID_DEBRIS_FRICTION = 0.92;
const RIGID_DEBRIS_RESTITUTION = 0.08;
const RIGID_DEBRIS_TERRAIN_FRICTION = 1.05;
const RIGID_DEBRIS_FORCE_SLEEP_LINEAR_SPEED = 0.85;
const RIGID_DEBRIS_FORCE_SLEEP_ANGULAR_SPEED = 3.5;
const RIGID_DEBRIS_FORCE_SLEEP_SECONDS = 0.18;
const RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE = 0.08;
const RIGID_DEBRIS_SUPPORT_CORRECTION_SKIN = 0.004;
const RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH = 0.75;
const RIGID_DEBRIS_SUPPORT_MIN_HEIGHT = 0.04;
const RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION = 1000;
const RAPIER_COMPAT_INIT_WARNING = "using deprecated parameters for the initialization function";

type RigidDebrisBody = {
  readonly toy: PhysicsToy;
  readonly body: RigidBody;
  readonly colliderHalfExtents: THREE.Vector3;
  quietSeconds: number;
  syncedExternalRevision: number;
};

type StaticColliderRecord = {
  readonly collider: Collider;
};

type StaticColliderCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type RigidDebrisSupport = {
  readonly height: number;
  readonly penetrationDepth: number;
};

export type RigidDebrisUpdateOptions = {
  readonly pressureStress?: number;
};

export type RigidDebrisStats = {
  readonly initialized: boolean;
  readonly bodies: number;
  readonly sleepingBodies: number;
  readonly terrainColliders: number;
  readonly rubbleSupportColliders: number;
  readonly targetTickHz: number;
  readonly simulatedTicksThisUpdate: number;
  readonly skippedRenderFramesSinceTick: number;
  readonly tickAccumulatorMs: number;
  readonly lastRapierStepMs: number;
  readonly lastStaticColliderRefreshMs: number;
  readonly lastSyncMs: number;
};

export function createEmptyRigidDebrisStats(): RigidDebrisStats {
  return {
    initialized: false,
    bodies: 0,
    sleepingBodies: 0,
    terrainColliders: 0,
    rubbleSupportColliders: 0,
    targetTickHz: RIGID_DEBRIS_NOMINAL_TICK_HZ,
    simulatedTicksThisUpdate: 0,
    skippedRenderFramesSinceTick: 0,
    tickAccumulatorMs: 0,
    lastRapierStepMs: 0,
    lastStaticColliderRefreshMs: 0,
    lastSyncMs: 0
  };
}

export function getRigidDebrisTargetTickHz(pressureStress: number): number {
  const stress = clampNumber(pressureStress, 0, 1);
  if (stress >= RIGID_DEBRIS_PANIC_TICK_STRESS) return RIGID_DEBRIS_PANIC_TICK_HZ;
  if (stress >= RIGID_DEBRIS_PRESSURE_TICK_STRESS) return RIGID_DEBRIS_PRESSURE_TICK_HZ;
  return RIGID_DEBRIS_NOMINAL_TICK_HZ;
}

export class RigidDebrisSimulation {
  private readonly pendingFragments = new Set<PhysicsToy>();
  private readonly bodiesByToy = new Map<PhysicsToy, RigidDebrisBody>();
  private readonly terrainColliders = new Map<string, StaticColliderRecord>();
  private readonly surfaceBoxColliders = new Map<string, StaticColliderRecord>();
  private readonly rubbleSupportColliders = new Map<string, StaticColliderRecord>();
  private readonly activeColliderCells = new Set<string>();
  private readonly desiredTerrainColliderKeys = new Set<string>();
  private readonly desiredSurfaceBoxColliderKeys = new Set<string>();
  private readonly desiredRubbleSupportColliderKeys = new Set<string>();
  private readonly syncPosition = new THREE.Vector3();
  private readonly syncQuaternion = new THREE.Quaternion();
  private readonly syncLinearVelocity = new THREE.Vector3();
  private readonly syncAngularVelocity = new THREE.Vector3();
  private readonly colliderScanCenter = new THREE.Vector3();
  private world: RapierWorld | null = null;
  private initializePromise: Promise<void> | null = null;
  private tickAccumulatorSeconds = 0;
  private staticRefreshSeconds = Infinity;
  private staticCollidersDirty = true;
  private forceNextTickAfterFragmentRegistration = false;
  private targetTickHz = RIGID_DEBRIS_NOMINAL_TICK_HZ;
  private simulatedTicksThisUpdate = 0;
  private skippedRenderFramesSinceTick = 0;
  private lastRapierStepMs = 0;
  private lastStaticColliderRefreshMs = 0;
  private lastSyncMs = 0;
  private disposed = false;
  private stats: RigidDebrisStats = createEmptyRigidDebrisStats();

  initialize(): Promise<void> {
    if (this.world) return Promise.resolve();
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = initializeRapierCompatQuietly().then(() => {
      if (this.disposed) return;

      this.world = new RapierWorld({ x: 0, y: RIGID_DEBRIS_GRAVITY, z: 0 });
      this.world.timestep = 1 / RIGID_DEBRIS_NOMINAL_TICK_HZ;
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
    this.forceNextTickAfterFragmentRegistration = true;
    this.staticCollidersDirty = true;
    if (this.world) {
      this.flushPendingFragments();
    } else {
      void this.initialize();
    }
  }

  update(
    delta: number,
    collisionWorld: CollisionWorld,
    options: RigidDebrisUpdateOptions = {}
  ): RigidDebrisStats {
    this.simulatedTicksThisUpdate = 0;
    this.lastRapierStepMs = 0;
    this.lastStaticColliderRefreshMs = 0;
    this.lastSyncMs = 0;
    this.targetTickHz = getRigidDebrisTargetTickHz(options.pressureStress ?? 0);

    if (!this.world) {
      void this.initialize();
      this.refreshStats();
      return this.stats;
    }

    const flushedFragments = this.flushPendingFragments();
    this.removeExpiredBodies();
    if (this.bodiesByToy.size === 0) {
      this.forceNextTickAfterFragmentRegistration = false;
      this.clearStaticColliders();
      this.refreshStats();
      return this.stats;
    }

    const tickIntervalSeconds = 1 / this.targetTickHz;
    const clampedDelta = Math.min(Math.max(0, delta), RIGID_DEBRIS_MAX_FRAME_DELTA);
    this.tickAccumulatorSeconds = Math.min(
      this.tickAccumulatorSeconds + clampedDelta,
      tickIntervalSeconds
    );

    // Newly registered fragments get one immediate support/collision solve so
    // their first visible frame is not a frozen mid-air card. After that, debris
    // intentionally runs at its own Hz and never burns catch-up steps after a
    // slow render frame.
    const shouldTick = this.forceNextTickAfterFragmentRegistration ||
      flushedFragments ||
      this.tickAccumulatorSeconds + Number.EPSILON >= tickIntervalSeconds;
    if (!shouldTick) {
      this.skippedRenderFramesSinceTick += 1;
      this.refreshStats();
      return this.stats;
    }

    this.tickAccumulatorSeconds = 0;
    this.forceNextTickAfterFragmentRegistration = false;
    this.skippedRenderFramesSinceTick = 0;
    this.lastStaticColliderRefreshMs = this.refreshStaticCollidersIfNeeded(tickIntervalSeconds, collisionWorld);

    this.world.timestep = tickIntervalSeconds;
    const stepStartedAt = getNowMs();
    this.world.step();
    this.lastRapierStepMs = getNowMs() - stepStartedAt;
    this.simulatedTicksThisUpdate = 1;

    const syncStartedAt = getNowMs();
    this.syncBodiesToToys(tickIntervalSeconds, collisionWorld);
    this.lastSyncMs = getNowMs() - syncStartedAt;
    this.refreshStats();
    return this.stats;
  }

  syncToyStatesToBodies(): void {
    if (!this.world) return;

    for (const record of this.bodiesByToy.values()) {
      if (record.toy.isExpired) continue;

      if (record.toy.isSleeping) {
        if (!record.body.isSleeping()) {
          record.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          record.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          record.body.sleep();
          this.staticCollidersDirty = true;
        }
        continue;
      }

      const externalRevision = record.toy.rigidDebrisExternalMutationRevision;
      const needsExternalSync = externalRevision !== record.syncedExternalRevision;
      const bodyWasSleeping = record.body.isSleeping();
      if (!needsExternalSync && !bodyWasSleeping) continue;

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
      record.syncedExternalRevision = externalRevision;
      record.quietSeconds = 0;
      this.staticCollidersDirty = true;
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
    this.tickAccumulatorSeconds = 0;
    this.simulatedTicksThisUpdate = 0;
    this.skippedRenderFramesSinceTick = 0;
    this.forceNextTickAfterFragmentRegistration = false;
    this.lastRapierStepMs = 0;
    this.lastStaticColliderRefreshMs = 0;
    this.lastSyncMs = 0;
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

  getRegisteredColliderHalfExtents(toy: PhysicsToy): THREE.Vector3 | null {
    return this.bodiesByToy.get(toy)?.colliderHalfExtents.clone() ?? null;
  }

  private flushPendingFragments(): boolean {
    if (!this.world) return false;
    let createdBody = false;

    for (const toy of this.pendingFragments) {
      if (!toy.isInstancedFragment || toy.isExpired || this.bodiesByToy.has(toy)) continue;

      const body = this.createBody(toy);
      const colliderHalfExtents = getFragmentColliderHalfExtents(toy);
      this.bodiesByToy.set(toy, {
        toy,
        body,
        colliderHalfExtents,
        quietSeconds: 0,
        syncedExternalRevision: toy.rigidDebrisExternalMutationRevision
      });
      toy.attachRigidDebrisBody();
      createdBody = true;
    }
    this.pendingFragments.clear();
    return createdBody;
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
    const colliderHalfExtents = getFragmentColliderHalfExtents(toy);
    const colliderDesc = ColliderDesc
      .cuboid(
        colliderHalfExtents.x,
        colliderHalfExtents.y,
        colliderHalfExtents.z
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

  private syncBodiesToToys(delta: number, collisionWorld: CollisionWorld): void {
    for (const record of this.bodiesByToy.values()) {
      const toyWasSleeping = record.toy.isSleeping;
      this.wakeSleepingBodyIfPartialSupportChanged(record, collisionWorld);
      this.correctSupportPenetration(record, collisionWorld);
      this.applyAggressiveSleep(record, delta, collisionWorld);
      const translation = record.body.translation();
      const rotation = record.body.rotation();
      const linvel = record.body.linvel();
      const angvel = record.body.angvel();
      const bodyIsSleeping = record.body.isSleeping();

      this.syncPosition.set(translation.x, translation.y, translation.z);
      this.syncQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
      this.syncLinearVelocity.set(linvel.x, linvel.y, linvel.z);
      this.syncAngularVelocity.set(angvel.x, angvel.y, angvel.z);
      record.toy.syncRigidDebrisState({
        position: this.syncPosition,
        quaternion: this.syncQuaternion,
        linearVelocity: this.syncLinearVelocity,
        angularVelocity: this.syncAngularVelocity,
        sleeping: bodyIsSleeping
      });
      if (toyWasSleeping !== bodyIsSleeping) {
        record.quietSeconds = 0;
        this.staticCollidersDirty = true;
      }
    }
  }

  private wakeSleepingBodyIfPartialSupportChanged(
    record: RigidDebrisBody,
    collisionWorld: CollisionWorld
  ): void {
    if (!record.body.isSleeping() || record.toy.isExpired) return;
    if (!isRecordNearExplicitCollisionCell(record, collisionWorld)) return;
    if (isRecordNearSupport(record, collisionWorld)) return;

    const linvel = record.body.linvel();
    record.body.setLinvel({ x: linvel.x, y: Math.min(linvel.y, -0.05), z: linvel.z }, true);
    record.body.wakeUp();
    record.quietSeconds = 0;
    this.staticCollidersDirty = true;
  }

  private applyAggressiveSleep(
    record: RigidDebrisBody,
    delta: number,
    collisionWorld: CollisionWorld
  ): void {
    if (record.body.isSleeping() || record.toy.isExpired) {
      record.quietSeconds = 0;
      return;
    }

    const linvel = record.body.linvel();
    const angvel = record.body.angvel();
    const linearSpeedSq = getVectorLengthSq(linvel);
    const angularSpeedSq = getVectorLengthSq(angvel);
    const isQuiet =
      linearSpeedSq <= RIGID_DEBRIS_FORCE_SLEEP_LINEAR_SPEED ** 2 &&
      angularSpeedSq <= RIGID_DEBRIS_FORCE_SLEEP_ANGULAR_SPEED ** 2;

    if (!isQuiet) {
      record.quietSeconds = 0;
      return;
    }
    if (!isRecordNearSupport(record, collisionWorld)) {
      record.quietSeconds = 0;
      return;
    }

    record.quietSeconds += Math.max(0, delta);
    if (record.quietSeconds < RIGID_DEBRIS_FORCE_SLEEP_SECONDS) return;

    record.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    record.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    record.body.sleep();
    record.quietSeconds = 0;
    this.staticCollidersDirty = true;
  }

  private correctSupportPenetration(record: RigidDebrisBody, collisionWorld: CollisionWorld): void {
    if (record.toy.isExpired) return;

    const support = getRigidDebrisSupport(record, collisionWorld);
    if (!support || support.penetrationDepth <= RIGID_DEBRIS_SUPPORT_CORRECTION_SKIN) return;

    const translation = record.body.translation();
    const correctedY = support.height +
      record.colliderHalfExtents.y +
      RIGID_DEBRIS_SUPPORT_CORRECTION_SKIN;
    if (translation.y >= correctedY) return;

    const wakeBody = !record.body.isSleeping();
    record.body.setTranslation({
      x: translation.x,
      y: correctedY,
      z: translation.z
    }, wakeBody);

    const linvel = record.body.linvel();
    if (linvel.y < 0) {
      record.body.setLinvel({ x: linvel.x, y: 0, z: linvel.z }, wakeBody);
    }
    this.staticCollidersDirty = true;
  }

  private refreshStaticCollidersIfNeeded(delta: number, collisionWorld: CollisionWorld): number {
    this.staticRefreshSeconds += delta;
    const scheduledRefreshDue = this.staticRefreshSeconds >= RIGID_DEBRIS_STATIC_REFRESH_SECONDS;
    const dirtyRefreshDue = this.staticCollidersDirty &&
      this.staticRefreshSeconds >= RIGID_DEBRIS_DIRTY_STATIC_REFRESH_MIN_SECONDS;
    if (!scheduledRefreshDue && !dirtyRefreshDue) {
      return 0;
    }

    // Terrain damage invalidates support colliders rapidly while a bouncing core
    // is chewing a crater. Rebuilding Rapier static colliders every impact frame
    // made the solver spike even after the debris body cap dropped, so dirty
    // refreshes are coalesced into the same short cadence as normal lookahead.
    const startedAt = getNowMs();
    this.staticRefreshSeconds = 0;
    this.staticCollidersDirty = false;
    this.collectActiveColliderCells(collisionWorld);
    this.syncTerrainColliders(collisionWorld);
    this.syncSurfaceBoxColliders(collisionWorld);
    this.syncRubbleSupportColliders(collisionWorld);
    return getNowMs() - startedAt;
  }

  private collectActiveColliderCells(collisionWorld: CollisionWorld): void {
    this.activeColliderCells.clear();
    for (const record of this.bodiesByToy.values()) {
      if (record.toy.isExpired) continue;

      if (record.toy.isSleeping) {
        this.addSleepingSupportColliderCells(record, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) return;
        continue;
      }

      const position = record.body.translation();
      const velocity = record.body.linvel();

      // Static terrain/rubble colliders are intentionally temporary. Sampling
      // only around the current body position lets tiny fast shards outrun the
      // collider bubble between refreshes and tunnel through the surface they
      // were about to hit. Add a few scan bubbles along the predicted path so
      // the first floor/wall ahead exists before Rapier integrates into it.
      for (let sample = 0; sample <= RIGID_DEBRIS_STATIC_LOOKAHEAD_SAMPLES; sample += 1) {
        const lookaheadSeconds = (sample / RIGID_DEBRIS_STATIC_LOOKAHEAD_SAMPLES) *
          RIGID_DEBRIS_STATIC_LOOKAHEAD_SECONDS;
        this.colliderScanCenter.set(
          position.x + velocity.x * lookaheadSeconds,
          position.y + velocity.y * lookaheadSeconds,
          position.z + velocity.z * lookaheadSeconds
        );
        this.addColliderCellsAround(this.colliderScanCenter, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) return;
      }
    }
  }

  private addSleepingSupportColliderCells(
    record: RigidDebrisBody,
    collisionWorld: CollisionWorld
  ): void {
    const position = record.body.translation();
    const halfExtents = record.colliderHalfExtents;
    const bottomY = position.y - halfExtents.y;
    const supportProbeY = Math.floor(bottomY - RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE);
    const rubbleProbeY = Math.floor(bottomY);
    const minX = Math.floor(position.x - halfExtents.x);
    const maxX = Math.floor(position.x + halfExtents.x);
    const minZ = Math.floor(position.z - halfExtents.z);
    const maxZ = Math.floor(position.z + halfExtents.z);

    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        this.addStaticColliderCandidateCell(x, supportProbeY, z, collisionWorld);
        this.addStaticColliderCandidateCell(x, rubbleProbeY, z, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) return;
      }
    }
  }

  private addColliderCellsAround(center: THREE.Vector3, collisionWorld: CollisionWorld): void {
    const centerX = Math.floor(center.x);
    const centerY = Math.floor(center.y);
    const centerZ = Math.floor(center.z);

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
          this.addStaticColliderCandidateCell(x, y, z, collisionWorld);
          if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) return;
        }
      }
    }
  }

  private addStaticColliderCandidateCell(
    x: number,
    y: number,
    z: number,
    collisionWorld: CollisionWorld
  ): void {
    const cell = { x, y, z };
    // The collider budget is tiny compared with a loud debris burst. Spend it
    // only where Rapier can actually receive a terrain or partial-height floor,
    // otherwise high airborne shards can starve ground-adjacent shards of support.
    if (!isStaticColliderCandidateCell(collisionWorld, cell)) return;

    this.activeColliderCells.add(getStaticColliderCellKey(x, y, z));
  }

  private syncTerrainColliders(collisionWorld: CollisionWorld): void {
    this.desiredTerrainColliderKeys.clear();
    for (const key of this.activeColliderCells) {
      const cell = parseStaticColliderCellKey(key);
      if (!cell || !isTerrainSurfaceColliderCell(collisionWorld, cell)) continue;

      this.desiredTerrainColliderKeys.add(key);
    }
    this.syncStaticColliderMap(
      this.terrainColliders,
      this.desiredTerrainColliderKeys,
      (key) => this.createTerrainCollider(key)
    );
  }

  private syncSurfaceBoxColliders(collisionWorld: CollisionWorld): void {
    this.desiredSurfaceBoxColliderKeys.clear();
    if (!collisionWorld.getCellCollisionBoxes) {
      this.syncStaticColliderMap(
        this.surfaceBoxColliders,
        this.desiredSurfaceBoxColliderKeys,
        (key) => this.createSurfaceBoxCollider(key)
      );
      return;
    }

    for (const key of this.activeColliderCells) {
      const cell = parseStaticColliderCellKey(key);
      if (!cell) continue;

      const boxes = getExplicitCellCollisionBoxes(collisionWorld, cell);
      if (!boxes) continue;

      for (let index = 0; index < boxes.length; index += 1) {
        const boxKey = getSurfaceBoxColliderKey(boxes[index]);
        if (!boxKey) continue;

        this.desiredSurfaceBoxColliderKeys.add(boxKey);
        if (this.desiredSurfaceBoxColliderKeys.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) break;
      }
      if (this.desiredSurfaceBoxColliderKeys.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) break;
    }

    this.syncStaticColliderMap(
      this.surfaceBoxColliders,
      this.desiredSurfaceBoxColliderKeys,
      (key) => this.createSurfaceBoxCollider(key)
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

  private createSurfaceBoxCollider(key: string): Collider | null {
    if (!this.world) return null;

    const box = parseSurfaceBoxColliderKey(key);
    if (!box) return null;

    const halfX = (box.maxX - box.minX) * 0.5;
    const halfY = (box.maxY - box.minY) * 0.5;
    const halfZ = (box.maxZ - box.minZ) * 0.5;
    if (halfX <= 0 || halfY <= 0 || halfZ <= 0) return null;

    return this.world.createCollider(
      ColliderDesc
        .cuboid(halfX, halfY, halfZ)
        .setTranslation(
          box.minX + halfX,
          box.minY + halfY,
          box.minZ + halfZ
        )
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
      for (const record of this.surfaceBoxColliders.values()) {
        this.world.removeCollider(record.collider, true);
      }
      for (const record of this.rubbleSupportColliders.values()) {
        this.world.removeCollider(record.collider, true);
      }
    }
    this.terrainColliders.clear();
    this.surfaceBoxColliders.clear();
    this.rubbleSupportColliders.clear();
    this.activeColliderCells.clear();
    this.desiredTerrainColliderKeys.clear();
    this.desiredSurfaceBoxColliderKeys.clear();
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
      terrainColliders: this.terrainColliders.size + this.surfaceBoxColliders.size,
      rubbleSupportColliders: this.rubbleSupportColliders.size,
      targetTickHz: this.targetTickHz,
      simulatedTicksThisUpdate: this.simulatedTicksThisUpdate,
      skippedRenderFramesSinceTick: this.skippedRenderFramesSinceTick,
      tickAccumulatorMs: this.tickAccumulatorSeconds * 1000,
      lastRapierStepMs: this.lastRapierStepMs,
      lastStaticColliderRefreshMs: this.lastStaticColliderRefreshMs,
      lastSyncMs: this.lastSyncMs
    };
  }
}

function getNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getFragmentColliderHalfExtents(toy: PhysicsToy): THREE.Vector3 {
  return toy.debrisShape?.colliderHalfExtents.clone()
    ?? createDefaultDebrisShape().colliderHalfExtents;
}

function isRecordNearSupport(record: RigidDebrisBody, collisionWorld: CollisionWorld): boolean {
  return getRigidDebrisSupport(record, collisionWorld) !== null;
}

function isRecordNearExplicitCollisionCell(
  record: RigidDebrisBody,
  collisionWorld: CollisionWorld
): boolean {
  if (!collisionWorld.getCellCollisionBoxes && !collisionWorld.isPartialBlock) return false;

  const position = record.body.translation();
  const halfExtents = record.colliderHalfExtents;
  const minX = Math.floor(position.x - halfExtents.x);
  const maxX = Math.floor(position.x + halfExtents.x);
  const minY = Math.floor(position.y - halfExtents.y - RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH);
  const maxY = Math.floor(position.y + halfExtents.y + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE);
  const minZ = Math.floor(position.z - halfExtents.z);
  const maxZ = Math.floor(position.z + halfExtents.z);

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (collisionWorld.isPartialBlock?.(x, y, z)) return true;
        if (hasExplicitCellCollisionBoxes(collisionWorld, { x, y, z })) return true;
      }
    }
  }

  return false;
}

function getRigidDebrisSupport(
  record: RigidDebrisBody,
  collisionWorld: CollisionWorld
): RigidDebrisSupport | null {
  const position = record.body.translation();
  const halfExtents = record.colliderHalfExtents;
  const bottomY = position.y - halfExtents.y;
  const topY = position.y + halfExtents.y;
  let supportHeight = getVoxelSupportHeight(collisionWorld, position, halfExtents, bottomY, topY);

  if (collisionWorld.getSupportHeight) {
    const partialSupportHeight = collisionWorld.getSupportHeight({
      minX: position.x - halfExtents.x,
      maxX: position.x + halfExtents.x,
      minY: bottomY - RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE,
      maxY: topY + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE,
      minZ: position.z - halfExtents.z,
      maxZ: position.z + halfExtents.z
    });
    if (partialSupportHeight !== null && isUsableDebrisSupportHeight(partialSupportHeight, bottomY, topY)) {
      supportHeight = Math.max(supportHeight ?? -Infinity, partialSupportHeight);
    }
  }

  if (supportHeight === null) return null;
  return {
    height: supportHeight,
    penetrationDepth: Math.max(0, supportHeight - bottomY)
  };
}

function getVoxelSupportHeight(
  collisionWorld: CollisionWorld,
  position: { readonly x: number; readonly y: number; readonly z: number },
  halfExtents: THREE.Vector3,
  bottomY: number,
  topY: number
): number | null {
  const minX = Math.floor(position.x - halfExtents.x);
  const maxX = Math.floor(position.x + halfExtents.x);
  const minZ = Math.floor(position.z - halfExtents.z);
  const maxZ = Math.floor(position.z + halfExtents.z);
  const minProbeY = Math.floor(bottomY - RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH);
  const maxProbeY = Math.floor(bottomY + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE);
  let supportHeight: number | null = null;

  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = maxProbeY; y >= minProbeY; y -= 1) {
        const explicitBoxSupportHeight = getExplicitCellBoxSupportHeight(
          collisionWorld,
          { x, y, z },
          position,
          halfExtents,
          bottomY,
          topY
        );
        if (explicitBoxSupportHeight !== null) {
          supportHeight = Math.max(supportHeight ?? -Infinity, explicitBoxSupportHeight);
          break;
        }

        if (collisionWorld.isPartialBlock?.(x, y, z)) continue;
        if (!collisionWorld.isSolid(x, y, z)) continue;

        const candidateHeight = y + 1;
        if (!isUsableDebrisSupportHeight(candidateHeight, bottomY, topY)) continue;

        supportHeight = Math.max(supportHeight ?? -Infinity, candidateHeight);
        break;
      }
    }
  }

  return supportHeight;
}

function getExplicitCellBoxSupportHeight(
  collisionWorld: CollisionWorld,
  cell: StaticColliderCell,
  position: { readonly x: number; readonly y: number; readonly z: number },
  halfExtents: THREE.Vector3,
  bottomY: number,
  topY: number
): number | null {
  const boxes = getExplicitCellCollisionBoxes(collisionWorld, cell);
  if (!boxes) return null;

  let supportHeight: number | null = null;
  const minX = position.x - halfExtents.x;
  const maxX = position.x + halfExtents.x;
  const minZ = position.z - halfExtents.z;
  const maxZ = position.z + halfExtents.z;

  for (const box of boxes) {
    if (!boundsOverlap(minX, maxX, box.minX, box.maxX)) continue;
    if (!boundsOverlap(minZ, maxZ, box.minZ, box.maxZ)) continue;
    if (!isUsableDebrisSupportHeight(box.maxY, bottomY, topY)) continue;

    supportHeight = Math.max(supportHeight ?? -Infinity, box.maxY);
  }

  return supportHeight;
}

function isUsableDebrisSupportHeight(supportHeight: number, bottomY: number, topY: number): boolean {
  if (!Number.isFinite(supportHeight)) return false;
  if (bottomY > supportHeight + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE) return false;
  if (supportHeight - bottomY > RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH) return false;
  if (supportHeight > topY + RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH) return false;
  return true;
}

function isStaticColliderCandidateCell(collisionWorld: CollisionWorld, cell: StaticColliderCell): boolean {
  return hasExplicitCellCollisionBoxes(collisionWorld, cell) ||
    isTerrainSurfaceColliderCell(collisionWorld, cell) ||
    isSupportColliderCandidateCell(collisionWorld, cell);
}

function isSupportColliderCandidateCell(collisionWorld: CollisionWorld, cell: StaticColliderCell): boolean {
  if (!collisionWorld.getSupportHeight || collisionWorld.isSolid(cell.x, cell.y, cell.z)) return false;

  const supportHeight = collisionWorld.getSupportHeight(createCellSupportBounds(cell));
  if (supportHeight === null) return false;

  const localHeight = supportHeight - cell.y;
  return localHeight >= RIGID_DEBRIS_SUPPORT_MIN_HEIGHT && localHeight <= 1;
}

function isTerrainSurfaceColliderCell(collisionWorld: CollisionWorld, cell: StaticColliderCell): boolean {
  if (!isFullTerrainColliderCell(collisionWorld, cell.x, cell.y, cell.z)) return false;

  // Rapier only needs a static cuboid where a shard can actually touch the
  // outside of terrain. Buried interior voxels were quietly becoming thousands
  // of useless colliders during high-debris tests, which made the CPU pay for
  // stone nobody could collide with. Keep exposed surfaces and discard the
  // sealed interior.
  return (
    !isFullTerrainColliderCell(collisionWorld, cell.x + 1, cell.y, cell.z) ||
    !isFullTerrainColliderCell(collisionWorld, cell.x - 1, cell.y, cell.z) ||
    !isFullTerrainColliderCell(collisionWorld, cell.x, cell.y + 1, cell.z) ||
    !isFullTerrainColliderCell(collisionWorld, cell.x, cell.y - 1, cell.z) ||
    !isFullTerrainColliderCell(collisionWorld, cell.x, cell.y, cell.z + 1) ||
    !isFullTerrainColliderCell(collisionWorld, cell.x, cell.y, cell.z - 1)
  );
}

function isFullTerrainColliderCell(collisionWorld: CollisionWorld, x: number, y: number, z: number): boolean {
  if (collisionWorld.isPartialBlock?.(x, y, z)) return false;
  if (hasExplicitCellCollisionBoxes(collisionWorld, { x, y, z })) return false;
  return collisionWorld.isSolid(x, y, z);
}

function hasExplicitCellCollisionBoxes(collisionWorld: CollisionWorld, cell: StaticColliderCell): boolean {
  return Boolean(getExplicitCellCollisionBoxes(collisionWorld, cell)?.length);
}

function getExplicitCellCollisionBoxes(
  collisionWorld: CollisionWorld,
  cell: StaticColliderCell
): readonly CollisionBounds[] | null {
  if (!collisionWorld.getCellCollisionBoxes) return null;
  if (collisionWorld.isPartialBlock && !collisionWorld.isPartialBlock(cell.x, cell.y, cell.z)) return null;

  const boxes = collisionWorld.getCellCollisionBoxes?.(cell.x, cell.y, cell.z);
  return boxes && boxes.length > 0 ? boxes : null;
}

function boundsOverlap(leftMin: number, leftMax: number, rightMin: number, rightMax: number): boolean {
  return leftMax > rightMin && rightMax > leftMin;
}

function getVectorLengthSq(vector: { readonly x: number; readonly y: number; readonly z: number }): number {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
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

function getSurfaceBoxColliderKey(bounds: CollisionBounds): string | null {
  if (!isValidSurfaceBoxBounds(bounds)) return null;

  return [
    quantizeSurfaceBoxCoordinate(bounds.minX),
    quantizeSurfaceBoxCoordinate(bounds.maxX),
    quantizeSurfaceBoxCoordinate(bounds.minY),
    quantizeSurfaceBoxCoordinate(bounds.maxY),
    quantizeSurfaceBoxCoordinate(bounds.minZ),
    quantizeSurfaceBoxCoordinate(bounds.maxZ)
  ].join(",");
}

function parseSurfaceBoxColliderKey(key: string): CollisionBounds | null {
  const parts = key.split(",");
  if (parts.length !== 6) return null;

  const bounds = {
    minX: Number(parts[0]),
    maxX: Number(parts[1]),
    minY: Number(parts[2]),
    maxY: Number(parts[3]),
    minZ: Number(parts[4]),
    maxZ: Number(parts[5])
  };
  return isValidSurfaceBoxBounds(bounds) ? bounds : null;
}

function isValidSurfaceBoxBounds(bounds: CollisionBounds): boolean {
  return Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxY) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.maxX > bounds.minX &&
    bounds.maxY > bounds.minY &&
    bounds.maxZ > bounds.minZ;
}

function quantizeSurfaceBoxCoordinate(value: number): number {
  return Math.round(value * RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION) /
    RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION;
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
