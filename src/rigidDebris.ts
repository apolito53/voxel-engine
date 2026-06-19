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
import { doesRememberedSupportOverlapChangedCells } from "./debrisSupportInvalidation";
import type { PhysicsToy } from "./physics";

const RIGID_DEBRIS_GRAVITY = -18;
const RIGID_DEBRIS_FIXED_STEP = 1 / 60;
const RIGID_DEBRIS_MAX_FRAME_DELTA = 1 / 12;
const RIGID_DEBRIS_MAX_SUBSTEPS = 4;
const RIGID_DEBRIS_STATIC_REFRESH_SECONDS = 0.12;
const RIGID_DEBRIS_DIRTY_STATIC_REFRESH_MIN_SECONDS = 0.08;
const RIGID_DEBRIS_STATIC_LOOKAHEAD_SECONDS = RIGID_DEBRIS_STATIC_REFRESH_SECONDS + RIGID_DEBRIS_FIXED_STEP;
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
const RIGID_DEBRIS_FORCE_SLEEP_STABLE_LINEAR_SPEED = 0.35;
const RIGID_DEBRIS_FORCE_SLEEP_STABLE_TRANSLATION = 0.035;
const RIGID_DEBRIS_FORCE_SLEEP_STABLE_SECONDS = 0.45;
const RIGID_DEBRIS_FORCE_SLEEP_STABLE_SUPPORT_CLEARANCE = 0.025;
const RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE = 0.08;
const RIGID_DEBRIS_SUPPORT_CORRECTION_SKIN = 0.004;
const RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH = 0.75;
const RIGID_DEBRIS_CHANGED_SUPPORT_STACK_WAKE_HEIGHT = 4.5;
const RIGID_DEBRIS_CHANGED_SUPPORT_WAKE_SPEED = -0.35;
const RIGID_DEBRIS_CHANGED_SUPPORT_WAKE_MAX_BODIES = 512;
const RIGID_DEBRIS_SUPPORT_MIN_HEIGHT = 0.04;
const RIGID_DEBRIS_SUPPORT_HEIGHT_PRECISION = 1000;
const RIGID_DEBRIS_SUPPORT_DESCENDING_SPEED = -0.5;
const RIGID_DEBRIS_SUPPORT_FAST_SPEED_SQ = 10 * 10;
const RIGID_DEBRIS_SUPPORT_HORIZONTAL_SPEED_SQ = 4 * 4;
const RIGID_DEBRIS_SUPPORT_LOOKDOWN_METERS = 2.25;
const RAPIER_COMPAT_INIT_WARNING = "using deprecated parameters for the initialization function";

type RigidDebrisBody = {
  readonly toy: PhysicsToy;
  readonly body: RigidBody;
  readonly colliderHalfExtents: THREE.Vector3;
  readonly lastStableTranslation: THREE.Vector3;
  quietSeconds: number;
  translationQuietSeconds: number;
  syncedExternalRevision: number;
};

type StaticColliderRecord = {
  readonly collider: Collider;
};

type StaticColliderCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bounds?: StaticColliderCellBounds;
};

type StaticColliderCellBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export type RigidDebrisChangedTerrainCell = StaticColliderCell;

type RigidDebrisSupport = {
  readonly height: number;
  readonly penetrationDepth: number;
};

type RigidDebrisSupportScanCandidate = {
  readonly record: RigidDebrisBody;
  readonly priority: number;
  readonly lookaheadSamples: number;
  readonly supportScanY: number | null;
  readonly speedSq: number;
};

export type RigidDebrisStaticRefreshReason = "none" | "scheduled" | "dirty";

export type RigidDebrisFrameTimings = {
  readonly flushMs: number;
  readonly staticColliderCollectMs: number;
  readonly staticColliderSyncMs: number;
  readonly stepMs: number;
  readonly syncMs: number;
};

export type RigidDebrisStats = {
  readonly initialized: boolean;
  readonly bodies: number;
  readonly sleepingBodies: number;
  readonly awakeBodies: number;
  readonly pendingFragments: number;
  readonly admittedBodiesThisFrame: number;
  readonly deniedAdmissionThisFrame: number;
  readonly admissionQueueDepth: number;
  readonly convertedToVfxThisFrame: number;
  readonly substeps: number;
  readonly accumulatorMs: number;
  readonly forcedSleepBodiesThisFrame: number;
  readonly wokenBodiesThisFrame: number;
  readonly staticRefreshRan: boolean;
  readonly staticRefreshReason: RigidDebrisStaticRefreshReason;
  readonly activeColliderCells: number;
  readonly candidateCellsScanned: number;
  readonly candidateCellsAccepted: number;
  readonly candidateCellsRejected: number;
  readonly candidateCellsBudgetHit: number;
  readonly terrainColliders: number;
  readonly surfaceBoxColliders: number;
  readonly rubbleSupportColliders: number;
  readonly staticColliderCreatedThisFrame: number;
  readonly staticColliderRemovedThisFrame: number;
  readonly staticColliderReusedThisFrame: number;
  readonly supportCacheEntries: number;
  readonly supportCacheHits: number;
  readonly supportCacheMisses: number;
  readonly supportCacheInvalidations: number;
  readonly parkedSleepers: number;
  readonly parkedWakeCandidates: number;
  readonly parkedWakesThisFrame: number;
  readonly parkedExpiredThisFrame: number;
  readonly parkedColliderCells: number;
};

export function createEmptyRigidDebrisStats(): RigidDebrisStats {
  return {
    initialized: false,
    bodies: 0,
    sleepingBodies: 0,
    awakeBodies: 0,
    pendingFragments: 0,
    admittedBodiesThisFrame: 0,
    deniedAdmissionThisFrame: 0,
    admissionQueueDepth: 0,
    convertedToVfxThisFrame: 0,
    substeps: 0,
    accumulatorMs: 0,
    forcedSleepBodiesThisFrame: 0,
    wokenBodiesThisFrame: 0,
    staticRefreshRan: false,
    staticRefreshReason: "none",
    activeColliderCells: 0,
    candidateCellsScanned: 0,
    candidateCellsAccepted: 0,
    candidateCellsRejected: 0,
    candidateCellsBudgetHit: 0,
    terrainColliders: 0,
    surfaceBoxColliders: 0,
    rubbleSupportColliders: 0,
    staticColliderCreatedThisFrame: 0,
    staticColliderRemovedThisFrame: 0,
    staticColliderReusedThisFrame: 0,
    supportCacheEntries: 0,
    supportCacheHits: 0,
    supportCacheMisses: 0,
    supportCacheInvalidations: 0,
    parkedSleepers: 0,
    parkedWakeCandidates: 0,
    parkedWakesThisFrame: 0,
    parkedExpiredThisFrame: 0,
    parkedColliderCells: 0
  };
}

function createEmptyRigidDebrisFrameTimings(): RigidDebrisFrameTimings {
  return {
    flushMs: 0,
    staticColliderCollectMs: 0,
    staticColliderSyncMs: 0,
    stepMs: 0,
    syncMs: 0
  };
}

export class RigidDebrisSimulation {
  private readonly pendingFragments = new Set<PhysicsToy>();
  private readonly bodiesByToy = new Map<PhysicsToy, RigidDebrisBody>();
  private readonly terrainColliders = new Map<string, StaticColliderRecord>();
  private readonly surfaceBoxColliders = new Map<string, StaticColliderRecord>();
  private readonly rubbleSupportColliders = new Map<string, StaticColliderRecord>();
  private readonly activeColliderCells = new Set<string>();
  private readonly probedColliderCells = new Set<string>();
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
  private accumulatorSeconds = 0;
  private staticRefreshSeconds = Infinity;
  private staticCollidersDirty = true;
  private disposed = false;
  private stats: RigidDebrisStats = createEmptyRigidDebrisStats();
  private lastFrameTimings: RigidDebrisFrameTimings = createEmptyRigidDebrisFrameTimings();
  private admittedBodiesThisFrame = 0;
  private deniedAdmissionThisFrame = 0;
  private admissionQueueDepth = 0;
  private convertedToVfxThisFrame = 0;
  private substepsThisFrame = 0;
  private forcedSleepBodiesThisFrame = 0;
  private wokenBodiesThisFrame = 0;
  private staticRefreshRanThisFrame = false;
  private staticRefreshReasonThisFrame: RigidDebrisStaticRefreshReason = "none";
  private candidateCellsScannedThisFrame = 0;
  private candidateCellsAcceptedThisFrame = 0;
  private candidateCellsRejectedThisFrame = 0;
  private candidateCellsBudgetHitThisFrame = 0;
  private staticColliderCreatedThisFrame = 0;
  private staticColliderRemovedThisFrame = 0;
  private staticColliderReusedThisFrame = 0;
  private deniedAdmissionSinceLastUpdate = 0;

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
    if (!this.world) {
      void this.initialize();
    }
  }

  recordAdmissionDenied(count: number): void {
    this.deniedAdmissionSinceLastUpdate += Math.max(0, Math.floor(count));
  }

  update(delta: number, collisionWorld: CollisionWorld): RigidDebrisStats {
    this.resetFrameCounters();
    if (!this.world) {
      void this.initialize();
      this.refreshStats();
      return this.stats;
    }

    const flushStartedAt = nowMs();
    this.flushPendingFragments();
    if (this.admittedBodiesThisFrame > 0) {
      // New bodies need nearby support soon, but forcing a same-frame collider
      // rebuild immediately after Rapier body creation can churn static
      // colliders before the solver has a stable velocity/contact picture.
      this.staticCollidersDirty = true;
    }
    this.lastFrameTimings = {
      ...this.lastFrameTimings,
      flushMs: nowMs() - flushStartedAt
    };
    this.removeExpiredBodies();
    if (this.bodiesByToy.size === 0) {
      this.clearStaticColliders();
      this.refreshStats();
      return this.stats;
    }

    this.refreshStaticCollidersIfNeeded(Math.max(0, delta), collisionWorld);
    this.accumulatorSeconds += Math.min(Math.max(0, delta), RIGID_DEBRIS_MAX_FRAME_DELTA);

    let substeps = 0;
    const stepStartedAt = nowMs();
    while (
      this.accumulatorSeconds >= RIGID_DEBRIS_FIXED_STEP &&
      substeps < RIGID_DEBRIS_MAX_SUBSTEPS
    ) {
      this.world.timestep = RIGID_DEBRIS_FIXED_STEP;
      this.world.step();
      this.accumulatorSeconds -= RIGID_DEBRIS_FIXED_STEP;
      substeps += 1;
    }
    this.lastFrameTimings = {
      ...this.lastFrameTimings,
      stepMs: nowMs() - stepStartedAt
    };
    this.substepsThisFrame = substeps;

    if (substeps === RIGID_DEBRIS_MAX_SUBSTEPS) {
      this.accumulatorSeconds = Math.min(this.accumulatorSeconds, RIGID_DEBRIS_FIXED_STEP);
    }

    const syncStartedAt = nowMs();
    this.syncBodiesToToys(substeps * RIGID_DEBRIS_FIXED_STEP, collisionWorld);
    this.lastFrameTimings = {
      ...this.lastFrameTimings,
      syncMs: nowMs() - syncStartedAt
    };
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
      if (bodyWasSleeping) this.wokenBodiesThisFrame += 1;
      record.syncedExternalRevision = externalRevision;
      record.quietSeconds = 0;
      record.translationQuietSeconds = 0;
      record.lastStableTranslation.copy(position);
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

  demoteFragmentToVfx(toy: PhysicsToy): boolean {
    const hadPendingFragment = this.pendingFragments.delete(toy);
    const record = this.bodiesByToy.get(toy);
    if (!record && !hadPendingFragment) return false;

    if (record) {
      this.world?.removeRigidBody(record.body);
      this.bodiesByToy.delete(toy);
    }
    toy.detachRigidDebrisBody();
    this.convertedToVfxThisFrame += 1;
    this.staticCollidersDirty = true;
    this.refreshStats();
    return true;
  }

  invalidateStaticColliders(): void {
    this.staticCollidersDirty = true;
  }

  wakeDebrisRestingOnChangedTerrainCells(cells: Iterable<RigidDebrisChangedTerrainCell>): number {
    const changedCells = normalizeChangedTerrainCells(cells);
    if (!this.world || changedCells.length === 0 || this.bodiesByToy.size === 0) return 0;

    let wokenBodies = 0;
    for (const record of this.bodiesByToy.values()) {
      if (wokenBodies >= RIGID_DEBRIS_CHANGED_SUPPORT_WAKE_MAX_BODIES) break;
      if (record.toy.isExpired || !record.body.isSleeping()) continue;
      if (!isRecordRestingOnAnyChangedTerrainCell(record, changedCells)) continue;

      // Terrain edits are discrete events, so this is the cheap place to unpark
      // debris that used to be supported by the edited cell. A small downward
      // nudge keeps Rapier from re-sleeping on the exact stale contact frame.
      const linvel = record.body.linvel();
      record.body.setLinvel({
        x: linvel.x,
        y: Math.min(linvel.y, RIGID_DEBRIS_CHANGED_SUPPORT_WAKE_SPEED),
        z: linvel.z
      }, true);
      record.body.wakeUp();
      record.quietSeconds = 0;
      wokenBodies += 1;
    }

    if (wokenBodies > 0) {
      this.wokenBodiesThisFrame += wokenBodies;
      this.staticCollidersDirty = true;
      this.staticRefreshSeconds = Infinity;
      this.refreshStats();
    }
    return wokenBodies;
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

  getLastFrameTimings(): RigidDebrisFrameTimings {
    return { ...this.lastFrameTimings };
  }

  getBodyCount(): number {
    return this.bodiesByToy.size;
  }

  getPendingFragmentCount(): number {
    return this.pendingFragments.size;
  }

  getRegisteredColliderHalfExtents(toy: PhysicsToy): THREE.Vector3 | null {
    return this.bodiesByToy.get(toy)?.colliderHalfExtents.clone() ?? null;
  }

  private flushPendingFragments(): void {
    if (!this.world) return;

    this.admissionQueueDepth = Math.max(this.admissionQueueDepth, this.pendingFragments.size);
    for (const toy of this.pendingFragments) {
      if (!toy.isInstancedFragment || toy.isExpired || this.bodiesByToy.has(toy)) continue;

      const body = this.createBody(toy);
      const colliderHalfExtents = getFragmentColliderHalfExtents(toy);
      this.bodiesByToy.set(toy, {
        toy,
        body,
        colliderHalfExtents,
        lastStableTranslation: toy.mesh.position.clone(),
        quietSeconds: 0,
        translationQuietSeconds: 0,
        syncedExternalRevision: toy.rigidDebrisExternalMutationRevision
      });
      toy.attachRigidDebrisBody();
      this.admittedBodiesThisFrame += 1;
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

  private resetFrameCounters(): void {
    this.lastFrameTimings = createEmptyRigidDebrisFrameTimings();
    this.admittedBodiesThisFrame = 0;
    this.deniedAdmissionThisFrame = this.deniedAdmissionSinceLastUpdate;
    this.deniedAdmissionSinceLastUpdate = 0;
    this.admissionQueueDepth = this.pendingFragments.size;
    this.convertedToVfxThisFrame = 0;
    this.substepsThisFrame = 0;
    this.forcedSleepBodiesThisFrame = 0;
    this.wokenBodiesThisFrame = 0;
    this.staticRefreshRanThisFrame = false;
    this.staticRefreshReasonThisFrame = "none";
    this.candidateCellsScannedThisFrame = 0;
    this.candidateCellsAcceptedThisFrame = 0;
    this.candidateCellsRejectedThisFrame = 0;
    this.candidateCellsBudgetHitThisFrame = 0;
    this.staticColliderCreatedThisFrame = 0;
    this.staticColliderRemovedThisFrame = 0;
    this.staticColliderReusedThisFrame = 0;
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
    this.wokenBodiesThisFrame += 1;
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
      record.translationQuietSeconds = 0;
      return;
    }

    const translation = record.body.translation();
    const linvel = record.body.linvel();
    const angvel = record.body.angvel();
    const linearSpeedSq = getVectorLengthSq(linvel);
    const angularSpeedSq = getVectorLengthSq(angvel);
    const support = getRigidDebrisSupport(record, collisionWorld);
    const nearSupport = support !== null;
    const bottomY = translation.y - record.colliderHalfExtents.y;
    const tightlyRestingOnSupport =
      support !== null &&
      bottomY <= support.height + RIGID_DEBRIS_FORCE_SLEEP_STABLE_SUPPORT_CLEARANCE;
    const isQuiet =
      linearSpeedSq <= RIGID_DEBRIS_FORCE_SLEEP_LINEAR_SPEED ** 2 &&
      angularSpeedSq <= RIGID_DEBRIS_FORCE_SLEEP_ANGULAR_SPEED ** 2;
    const stableTranslationSq =
      (translation.x - record.lastStableTranslation.x) ** 2 +
      (translation.y - record.lastStableTranslation.y) ** 2 +
      (translation.z - record.lastStableTranslation.z) ** 2;
    const translationIsStable =
      tightlyRestingOnSupport &&
      linearSpeedSq <= RIGID_DEBRIS_FORCE_SLEEP_STABLE_LINEAR_SPEED ** 2 &&
      stableTranslationSq <= RIGID_DEBRIS_FORCE_SLEEP_STABLE_TRANSLATION ** 2;

    if (!nearSupport) {
      record.quietSeconds = 0;
      record.translationQuietSeconds = 0;
      record.lastStableTranslation.set(translation.x, translation.y, translation.z);
      return;
    }

    if (translationIsStable) {
      record.translationQuietSeconds += Math.max(0, delta);
    } else {
      // Rapier can leave a shard visually parked but rotationally twitching on
      // a contact edge. Track actual position drift separately from angular
      // velocity so a non-translating support-resting shard can still park.
      record.translationQuietSeconds = 0;
      record.lastStableTranslation.set(translation.x, translation.y, translation.z);
    }

    if (isQuiet) {
      record.quietSeconds += Math.max(0, delta);
    } else {
      record.quietSeconds = 0;
    }

    if (
      record.quietSeconds < RIGID_DEBRIS_FORCE_SLEEP_SECONDS &&
      record.translationQuietSeconds < RIGID_DEBRIS_FORCE_SLEEP_STABLE_SECONDS
    ) return;

    record.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    record.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    record.body.sleep();
    this.forcedSleepBodiesThisFrame += 1;
    record.quietSeconds = 0;
    record.translationQuietSeconds = 0;
    record.lastStableTranslation.set(translation.x, translation.y, translation.z);
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

  private refreshStaticCollidersIfNeeded(delta: number, collisionWorld: CollisionWorld): void {
    this.staticRefreshSeconds += delta;
    const scheduledRefreshDue = this.staticRefreshSeconds >= RIGID_DEBRIS_STATIC_REFRESH_SECONDS;
    const dirtyRefreshDue = this.staticCollidersDirty &&
      this.staticRefreshSeconds >= RIGID_DEBRIS_DIRTY_STATIC_REFRESH_MIN_SECONDS;
    if (!scheduledRefreshDue && !dirtyRefreshDue) {
      return;
    }

    // Terrain damage invalidates support colliders rapidly while a bouncing core
    // is chewing a crater. Rebuilding Rapier static colliders every impact frame
    // made the solver spike even after the debris body cap dropped, so dirty
    // refreshes are coalesced into the same short cadence as normal lookahead.
    this.staticRefreshSeconds = 0;
    this.staticCollidersDirty = false;
    this.staticRefreshRanThisFrame = true;
    this.staticRefreshReasonThisFrame = dirtyRefreshDue ? "dirty" : "scheduled";
    const collectStartedAt = nowMs();
    this.collectActiveColliderCells(collisionWorld);
    const collectEndedAt = nowMs();
    const syncStartedAt = collectEndedAt;
    this.syncTerrainColliders(collisionWorld);
    this.syncSurfaceBoxColliders(collisionWorld);
    this.syncRubbleSupportColliders(collisionWorld);
    this.lastFrameTimings = {
      ...this.lastFrameTimings,
      staticColliderCollectMs: collectEndedAt - collectStartedAt,
      staticColliderSyncMs: nowMs() - syncStartedAt
    };
  }

  private collectActiveColliderCells(collisionWorld: CollisionWorld): void {
    this.activeColliderCells.clear();
    // Many debris shards cluster inside the same few crater cells. The old
    // path deduped accepted support cells, but still re-ran the expensive
    // terrain/partial/rubble suitability checks for every duplicate probe.
    // Keep one probe per cell per refresh so overlapping shards share the
    // answer instead of asking the collision world the same question hundreds
    // of times in a stress crater.
    this.probedColliderCells.clear();
    const candidates = this.collectSupportScanCandidates(collisionWorld);
    for (const candidate of candidates) {
      const { record } = candidate;

      if (record.toy.isSleeping) {
        this.addSleepingSupportColliderCells(record, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
          this.candidateCellsBudgetHitThisFrame = 1;
          return;
        }
        continue;
      }

      const position = record.body.translation();
      const velocity = record.body.linvel();

      // Static terrain/rubble colliders are intentionally temporary. Sampling
      // only around the current body position lets tiny fast shards outrun the
      // collider bubble between refreshes and tunnel through the surface they
      // were about to hit. Fast or descending shards keep lookahead bubbles;
      // calm airborne shards skip support work until gravity or contact makes
      // them relevant, which keeps empty-air debris from spending the budget.
      if (candidate.supportScanY !== null) {
        this.colliderScanCenter.set(position.x, candidate.supportScanY, position.z);
        this.addColliderCellsAround(this.colliderScanCenter, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
          this.candidateCellsBudgetHitThisFrame = 1;
          return;
        }
      }

      for (let sample = 0; sample <= candidate.lookaheadSamples; sample += 1) {
        const lookaheadSeconds = candidate.lookaheadSamples <= 0
          ? 0
          : (sample / candidate.lookaheadSamples) * RIGID_DEBRIS_STATIC_LOOKAHEAD_SECONDS;
        this.colliderScanCenter.set(
          position.x + velocity.x * lookaheadSeconds,
          position.y + velocity.y * lookaheadSeconds,
          position.z + velocity.z * lookaheadSeconds
        );
        this.addColliderCellsAround(this.colliderScanCenter, collisionWorld);
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
          this.candidateCellsBudgetHitThisFrame = 1;
          return;
        }
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
        if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
          this.candidateCellsBudgetHitThisFrame = 1;
          return;
        }
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
          if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
            this.candidateCellsBudgetHitThisFrame = 1;
            return;
          }
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
    if (this.activeColliderCells.size >= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET) {
      this.candidateCellsBudgetHitThisFrame = 1;
      return;
    }

    const key = getStaticColliderCellKey(x, y, z);
    if (this.probedColliderCells.has(key)) return;
    this.probedColliderCells.add(key);

    const cell = { x, y, z };
    this.candidateCellsScannedThisFrame += 1;
    // The collider budget is tiny compared with a loud debris burst. Spend it
    // only where Rapier can actually receive a terrain or partial-height floor,
    // otherwise high airborne shards can starve ground-adjacent shards of support.
    if (!isStaticColliderCandidateCell(collisionWorld, cell)) {
      this.candidateCellsRejectedThisFrame += 1;
      return;
    }

    const beforeSize = this.activeColliderCells.size;
    this.activeColliderCells.add(key);
    if (this.activeColliderCells.size > beforeSize) {
      this.candidateCellsAcceptedThisFrame += 1;
    }
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
      this.staticColliderRemovedThisFrame += 1;
    }

    for (const key of desiredKeys) {
      if (colliders.has(key)) {
        this.staticColliderReusedThisFrame += 1;
        continue;
      }

      const collider = createCollider(key);
      if (collider) {
        colliders.set(key, { collider });
        this.staticColliderCreatedThisFrame += 1;
      }
    }
  }

  private collectSupportScanCandidates(collisionWorld: CollisionWorld): RigidDebrisSupportScanCandidate[] {
    const candidates: RigidDebrisSupportScanCandidate[] = [];
    for (const record of this.bodiesByToy.values()) {
      if (record.toy.isExpired) continue;

      const candidate = createSupportScanCandidate(record, collisionWorld);
      if (candidate) candidates.push(candidate);
    }

    return candidates.sort((left, right) => {
      const priorityDelta = left.priority - right.priority;
      if (priorityDelta !== 0) return priorityDelta;
      return right.speedSq - left.speedSq;
    });
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
    this.probedColliderCells.clear();
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
    const awakeBodies = Math.max(0, this.bodiesByToy.size - sleepingBodies);

    this.stats = {
      initialized: this.world !== null,
      bodies: this.bodiesByToy.size,
      sleepingBodies,
      awakeBodies,
      pendingFragments: this.pendingFragments.size,
      admittedBodiesThisFrame: this.admittedBodiesThisFrame,
      deniedAdmissionThisFrame: this.deniedAdmissionThisFrame,
      admissionQueueDepth: this.admissionQueueDepth,
      convertedToVfxThisFrame: this.convertedToVfxThisFrame,
      substeps: this.substepsThisFrame,
      accumulatorMs: this.accumulatorSeconds * 1000,
      forcedSleepBodiesThisFrame: this.forcedSleepBodiesThisFrame,
      wokenBodiesThisFrame: this.wokenBodiesThisFrame,
      staticRefreshRan: this.staticRefreshRanThisFrame,
      staticRefreshReason: this.staticRefreshReasonThisFrame,
      activeColliderCells: this.activeColliderCells.size,
      candidateCellsScanned: this.candidateCellsScannedThisFrame,
      candidateCellsAccepted: this.candidateCellsAcceptedThisFrame,
      candidateCellsRejected: this.candidateCellsRejectedThisFrame,
      candidateCellsBudgetHit: this.candidateCellsBudgetHitThisFrame,
      terrainColliders: this.terrainColliders.size + this.surfaceBoxColliders.size,
      surfaceBoxColliders: this.surfaceBoxColliders.size,
      rubbleSupportColliders: this.rubbleSupportColliders.size,
      staticColliderCreatedThisFrame: this.staticColliderCreatedThisFrame,
      staticColliderRemovedThisFrame: this.staticColliderRemovedThisFrame,
      staticColliderReusedThisFrame: this.staticColliderReusedThisFrame,
      supportCacheEntries: 0,
      supportCacheHits: 0,
      supportCacheMisses: 0,
      supportCacheInvalidations: 0,
      parkedSleepers: 0,
      parkedWakeCandidates: 0,
      parkedWakesThisFrame: 0,
      parkedExpiredThisFrame: 0,
      parkedColliderCells: 0
    };
  }
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function createSupportScanCandidate(
  record: RigidDebrisBody,
  collisionWorld: CollisionWorld
): RigidDebrisSupportScanCandidate | null {
  if (record.toy.isSleeping) {
    return {
      record,
      priority: 0,
      lookaheadSamples: 0,
      supportScanY: null,
      speedSq: 0
    };
  }

  const velocity = record.body.linvel();
  const horizontalSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
  const speedSq = horizontalSpeedSq + velocity.y * velocity.y;

  if (isRecordNearSupport(record, collisionWorld)) {
    return {
      record,
      priority: 1,
      lookaheadSamples: 0,
      supportScanY: null,
      speedSq
    };
  }

  const nearbySupportScanY = getNearbySupportScanY(record, collisionWorld);
  if (nearbySupportScanY !== null) {
    return {
      record,
      priority: 2,
      lookaheadSamples: 0,
      supportScanY: nearbySupportScanY,
      speedSq
    };
  }

  const lookaheadSupportScanY = getLookaheadSupportScanY(record, collisionWorld, velocity);
  if (velocity.y <= RIGID_DEBRIS_SUPPORT_DESCENDING_SPEED) {
    if (lookaheadSupportScanY === null) return null;
    return {
      record,
      priority: 3,
      lookaheadSamples: 0,
      supportScanY: lookaheadSupportScanY,
      speedSq
    };
  }

  if (speedSq >= RIGID_DEBRIS_SUPPORT_FAST_SPEED_SQ) {
    if (lookaheadSupportScanY === null) return null;
    return {
      record,
      priority: 4,
      lookaheadSamples: 0,
      supportScanY: lookaheadSupportScanY,
      speedSq
    };
  }

  if (horizontalSpeedSq >= RIGID_DEBRIS_SUPPORT_HORIZONTAL_SPEED_SQ) {
    return {
      record,
      priority: 5,
      lookaheadSamples: 0,
      supportScanY: null,
      speedSq
    };
  }

  return null;
}

function getLookaheadSupportScanY(
  record: RigidDebrisBody,
  collisionWorld: CollisionWorld,
  velocity: { readonly y: number }
): number | null {
  if (velocity.y >= 0) return null;

  const position = record.body.translation();
  const halfExtents = record.colliderHalfExtents;
  const bottomY = position.y - halfExtents.y;
  const predictedBottomY = bottomY + velocity.y * RIGID_DEBRIS_STATIC_LOOKAHEAD_SECONDS;
  const minY = Math.floor(Math.min(bottomY, predictedBottomY) - RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE);
  const maxY = Math.floor(Math.max(bottomY, predictedBottomY) + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE);
  const minX = Math.floor(position.x - halfExtents.x);
  const maxX = Math.floor(position.x + halfExtents.x);
  const minZ = Math.floor(position.z - halfExtents.z);
  const maxZ = Math.floor(position.z + halfExtents.z);

  // This is a cheap one-column-ish preflight before the expensive collider
  // bubble scan. Fast debris still gets support before impact, while calm
  // high-air shards do not spend dozens of rejected empty-air probes per frame.
  for (let y = maxY; y >= minY; y -= 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (isStaticColliderCandidateCell(collisionWorld, { x, y, z })) return y;
      }
    }
  }

  return null;
}

function normalizeChangedTerrainCells(
  cells: Iterable<RigidDebrisChangedTerrainCell>
): RigidDebrisChangedTerrainCell[] {
  const normalized: RigidDebrisChangedTerrainCell[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    if (
      !Number.isFinite(cell.x) ||
      !Number.isFinite(cell.y) ||
      !Number.isFinite(cell.z)
    ) {
      continue;
    }

    const x = Math.floor(cell.x);
    const y = Math.floor(cell.y);
    const z = Math.floor(cell.z);
    const bounds = normalizeStaticColliderCellBounds(cell.bounds);
    const key = getChangedStaticColliderCellKey(x, y, z, bounds);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(bounds ? { x, y, z, bounds } : { x, y, z });
  }

  return normalized;
}

function isRecordRestingOnAnyChangedTerrainCell(
  record: RigidDebrisBody,
  cells: readonly RigidDebrisChangedTerrainCell[]
): boolean {
  if (doesRememberedSupportOverlapChangedCells(record.toy.lastKnownSupportCells, cells)) return true;

  for (const cell of cells) {
    if (isRecordRestingOnChangedTerrainCell(record, cell)) return true;
  }
  return false;
}

function isRecordRestingOnChangedTerrainCell(
  record: RigidDebrisBody,
  cell: RigidDebrisChangedTerrainCell
): boolean {
  const position = record.body.translation();
  const halfExtents = record.colliderHalfExtents;
  const margin = RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE;
  const minX = position.x - halfExtents.x - margin;
  const maxX = position.x + halfExtents.x + margin;
  const minZ = position.z - halfExtents.z - margin;
  const maxZ = position.z + halfExtents.z + margin;
  const supportMinX = cell.bounds?.minX ?? cell.x;
  const supportMaxX = cell.bounds?.maxX ?? cell.x + 1;
  const supportMinY = cell.bounds?.minY ?? cell.y;
  const supportMaxY = cell.bounds?.maxY ?? cell.y + 1;
  const supportMinZ = cell.bounds?.minZ ?? cell.z;
  const supportMaxZ = cell.bounds?.maxZ ?? cell.z + 1;
  if (!boundsOverlap(minX, maxX, supportMinX, supportMaxX)) return false;
  if (!boundsOverlap(minZ, maxZ, supportMinZ, supportMaxZ)) return false;

  const bottomY = position.y - halfExtents.y;
  const lowestChangedSupport = supportMinY - margin;
  // Terrain edits are event-scoped, so we can afford to wake a short local
  // stack above the edited support cell. This catches sleeping debris resting
  // on other debris without restoring broad per-frame support scans.
  const highestChangedSupport = supportMaxY +
    RIGID_DEBRIS_CHANGED_SUPPORT_STACK_WAKE_HEIGHT +
    RIGID_DEBRIS_SUPPORT_RESCUE_DEPTH;
  return bottomY >= lowestChangedSupport && bottomY <= highestChangedSupport;
}

function normalizeStaticColliderCellBounds(
  bounds: StaticColliderCellBounds | undefined
): StaticColliderCellBounds | undefined {
  if (!bounds) return undefined;
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxY) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxZ)
  ) {
    return undefined;
  }

  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const minZ = Math.min(bounds.minZ, bounds.maxZ);
  const maxZ = Math.max(bounds.minZ, bounds.maxZ);
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) return undefined;
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function getChangedStaticColliderCellKey(
  x: number,
  y: number,
  z: number,
  bounds: StaticColliderCellBounds | undefined
): string {
  if (!bounds) return getStaticColliderCellKey(x, y, z);
  return [
    getStaticColliderCellKey(x, y, z),
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
    bounds.minZ,
    bounds.maxZ
  ].map((part) => typeof part === "number" ? part.toFixed(4) : part).join("|");
}

function getFragmentColliderHalfExtents(toy: PhysicsToy): THREE.Vector3 {
  return toy.debrisShape?.colliderHalfExtents.clone()
    ?? createDefaultDebrisShape().colliderHalfExtents;
}

function isRecordNearSupport(record: RigidDebrisBody, collisionWorld: CollisionWorld): boolean {
  return getRigidDebrisSupport(record, collisionWorld) !== null;
}

function getNearbySupportScanY(
  record: RigidDebrisBody,
  collisionWorld: CollisionWorld
): number | null {
  if (!collisionWorld.getSupportHeight) return null;

  const position = record.body.translation();
  const halfExtents = record.colliderHalfExtents;
  const bottomY = position.y - halfExtents.y;
  const supportHeight = collisionWorld.getSupportHeight({
    minX: position.x - halfExtents.x,
    maxX: position.x + halfExtents.x,
    minY: bottomY - RIGID_DEBRIS_SUPPORT_LOOKDOWN_METERS,
    maxY: bottomY + RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE,
    minZ: position.z - halfExtents.z,
    maxZ: position.z + halfExtents.z
  });

  if (supportHeight === null || !Number.isFinite(supportHeight)) return null;

  const clearance = bottomY - supportHeight;
  if (clearance < -RIGID_DEBRIS_FORCE_SLEEP_SUPPORT_TOLERANCE) return null;
  if (clearance > RIGID_DEBRIS_SUPPORT_LOOKDOWN_METERS) return null;

  // Ask the normal cell scanner to visit the support's own voxel row. This is
  // intentionally narrower than restoring a full airborne scan: rubble/partial
  // support gets an early collider, while empty sky fragments stay cheap.
  return supportHeight;
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
