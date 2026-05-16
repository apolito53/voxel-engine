import * as THREE from "three";
import { BLOCK_FRAGMENT_VISUAL_SIZE } from "./blockFragments";
import { createDefaultDebrisShape } from "./debrisShapes";
import type { PhysicsToy } from "./physics";
import { RubbleField, type RubbleAbsorptionSample, type RubbleVisualChunkSample } from "./rubble";

export const DEBRIS_REGION_HORIZONTAL_MERGE_RADIUS = 2.5;
export const DEBRIS_REGION_VERTICAL_MERGE_RADIUS = 1.5;
export const DEBRIS_REGION_COLLISION_SECONDS = 0.35;
export const DEBRIS_REGION_FINALIZE_SECONDS = 0.6;
export const DEBRIS_REGION_SETTLED_FINALIZE_SECONDS = 0.15;
export const DEBRIS_REGION_MAX_SECONDS = 1.2;
export const DEBRIS_REGION_PAIR_BUDGET = 768;
export const DEBRIS_REGION_CONTACT_BREAKUP_SECONDS = 0.1;
export const DEBRIS_REGION_GLUE_BREAKUP_SECONDS = 0.28;
export const DEBRIS_ACTIVE_RADIUS_BUFFER_METERS = 2;

const DEBRIS_REGION_QUIET_SPEED = 0.65;
const DEBRIS_REGION_QUIET_SLEEP_SECONDS = 0.08;
const DEBRIS_REGION_COLLISION_RESTITUTION = 0.06;
const DEBRIS_REGION_COLLISION_DAMPING = 0.74;
const DEBRIS_REGION_BREAKUP_RESTITUTION = 0.24;
const DEBRIS_REGION_BREAKUP_DAMPING = 0.96;
const DEBRIS_REGION_COLLISION_EPSILON = 0.000001;
const DEBRIS_REGION_FRAGMENT_RADIUS_SCALE = 0.78;
const DEBRIS_REGION_COHESION_ACCELERATION = 9.5;
const DEBRIS_REGION_GLUE_CAPTURE_SLOP = BLOCK_FRAGMENT_VISUAL_SIZE * 0.18;
const DEBRIS_REGION_STICKY_RETAINED_OVERLAP = BLOCK_FRAGMENT_VISUAL_SIZE * 0.03;
const DEBRIS_REGION_STICKY_HORIZONTAL_BLEND = 0.72;
const DEBRIS_REGION_STICKY_VERTICAL_BLEND = 0.35;
const DEBRIS_REGION_GLUE_POSITION_RESPONSE = 0.7;
const DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION = BLOCK_FRAGMENT_VISUAL_SIZE * 0.96;
const DEBRIS_REGION_MAX_GLUE_LINKS = 192;
const DEBRIS_REGION_STACK_HORIZONTAL_OVERLAP = BLOCK_FRAGMENT_VISUAL_SIZE * 0.95;
const DEBRIS_REGION_STACK_VERTICAL_RANGE = BLOCK_FRAGMENT_VISUAL_SIZE * 1.8;
const DEBRIS_REGION_STACK_CENTER_SEPARATION = BLOCK_FRAGMENT_VISUAL_SIZE * 0.96;
const RUBBLE_SAMPLE_JITTER_RADIUS = 0.24;

type DebrisGlueLink = {
  readonly left: PhysicsToy;
  readonly right: PhysicsToy;
  readonly restOffset: THREE.Vector3;
};

type SettlingRegion = {
  readonly id: number;
  readonly center: THREE.Vector3;
  readonly fragments: Set<PhysicsToy>;
  readonly glueLinks: Map<string, DebrisGlueLink>;
  readonly materialUnitsByBlock: Map<number, number>;
  createdAt: number;
  fractureCount: number;
  contactAfter: number;
  collisionUntil: number;
  glueAfter: number;
  finalizeAt: number;
  maxFinalizeAt: number;
  settledAt: number | null;
};

export type DebrisSettlerStats = {
  readonly regions: number;
  readonly fragments: number;
  readonly activeFragments: number;
  readonly pairChecks: number;
  readonly resolvedPairs: number;
  readonly finalizedBatches: number;
  readonly finalizedFragments: number;
  readonly finalizedPieces: number;
  readonly forcedFinalizations: number;
};

export type DebrisSettledBatch = {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly block: number;
  readonly pieces: number;
};

export type DebrisSettlerUpdateOptions = {
  readonly activeCenter?: THREE.Vector3;
  readonly activeRadius?: number;
  readonly activeRadiusBuffer?: number;
};

type MutableDebrisSettlerStats = {
  -readonly [Key in keyof DebrisSettlerStats]: DebrisSettlerStats[Key];
};

export function createEmptyDebrisSettlerStats(): DebrisSettlerStats {
  return {
    regions: 0,
    fragments: 0,
    activeFragments: 0,
    pairChecks: 0,
    resolvedPairs: 0,
    finalizedBatches: 0,
    finalizedFragments: 0,
    finalizedPieces: 0,
    forcedFinalizations: 0
  };
}

export class DebrisSettler {
  private readonly regionsById = new Map<number, SettlingRegion>();
  private readonly fragmentRegionIds = new Map<PhysicsToy, number>();
  private readonly normal = new THREE.Vector3();
  private readonly relativeVelocity = new THREE.Vector3();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly finalizedBatches: DebrisSettledBatch[] = [];
  private readonly stats: MutableDebrisSettlerStats = createEmptyDebrisSettlerStats();
  private readonly fragmentIds = new WeakMap<PhysicsToy, number>();
  private nextRegionId = 1;
  private nextFragmentId = 1;
  private elapsedSeconds = 0;

  registerFracture(
    block: number,
    center: THREE.Vector3,
    fragments: readonly PhysicsToy[]
  ): void {
    const activeFragments = fragments.filter((fragment) => (
      fragment.isInstancedFragment && !fragment.isExpired
    ));
    if (activeFragments.length === 0) return;

    const nearbyRegions = this.findNearbyRegions(center);
    const targetRegion = nearbyRegions.length > 0
      ? this.mergeRegions(nearbyRegions)
      : this.createRegion(center);

    this.addFractureToRegion(targetRegion, block, center, activeFragments);
    this.refreshLiveStats();
  }

  update(
    delta: number,
    rubbleField: RubbleField,
    options: DebrisSettlerUpdateOptions = {}
  ): DebrisSettlerStats {
    this.elapsedSeconds += Math.max(0, delta);
    this.resetFrameStats();

    // Pair checks are short-lived legacy settling-theater for manual fragment
    // toys. Rapier-driven fragments keep the same region/material ownership,
    // but the rigid-body solver owns their contacts, stacking, and sleep state.
    this.enforceExistingGlueLinks();
    this.enforcePairBudget();
    this.resolveActiveRegionCollisions(Math.max(0, delta));
    this.enforceExistingGlueLinks();
    this.finalizeDueRegions(rubbleField, options);
    this.refreshLiveStats();
    return { ...this.stats };
  }

  owns(toy: PhysicsToy): boolean {
    return this.fragmentRegionIds.has(toy);
  }

  getStats(): DebrisSettlerStats {
    this.refreshLiveStats();
    return { ...this.stats };
  }

  getFinalizedBatches(): readonly DebrisSettledBatch[] {
    return this.finalizedBatches;
  }

  finalizeRegionsForPressure(
    rubbleField: RubbleField,
    activeCenter: THREE.Vector3,
    targetBodyReduction: number
  ): number {
    if (targetBodyReduction <= 0) return 0;

    let finalizedFragments = 0;
    for (const region of this.getPressureOrderedRegions(activeCenter)) {
      if (!this.regionsById.has(region.id)) continue;

      const fragmentCount = region.fragments.size;
      this.finalizeRegion(region, rubbleField, true);
      finalizedFragments += fragmentCount;
      if (finalizedFragments >= targetBodyReduction) break;
    }

    this.refreshLiveStats();
    return finalizedFragments;
  }

  discardRegionsForPressure(
    activeCenter: THREE.Vector3,
    targetBodyReduction: number
  ): number {
    if (targetBodyReduction <= 0) return 0;

    let discardedFragments = 0;
    for (const region of this.getPressureOrderedRegions(activeCenter)) {
      if (!this.regionsById.has(region.id)) continue;

      const fragmentCount = region.fragments.size;
      this.discardRegion(region);
      discardedFragments += fragmentCount;
      if (discardedFragments >= targetBodyReduction) break;
    }

    this.refreshLiveStats();
    return discardedFragments;
  }

  discardSettledRegionsForPressure(
    activeCenter: THREE.Vector3,
    targetBodyReduction: number
  ): number {
    if (targetBodyReduction <= 0) return 0;

    let discardedFragments = 0;
    for (const region of this.getPressureOrderedRegions(activeCenter)) {
      if (!this.regionsById.has(region.id) || !this.isRegionSleeping(region)) continue;

      const fragmentCount = region.fragments.size;
      this.discardRegion(region);
      discardedFragments += fragmentCount;
      if (discardedFragments >= targetBodyReduction) break;
    }

    this.refreshLiveStats();
    return discardedFragments;
  }

  forget(toy: PhysicsToy): void {
    const regionId = this.fragmentRegionIds.get(toy);
    if (regionId === undefined) return;

    this.fragmentRegionIds.delete(toy);
    const region = this.regionsById.get(regionId);
    if (!region) return;

    region.fragments.delete(toy);
    this.removeGlueLinksForFragment(region, toy);
    if (region.fragments.size === 0) {
      this.regionsById.delete(region.id);
    }
  }

  clear(): void {
    this.regionsById.clear();
    this.fragmentRegionIds.clear();
    this.finalizedBatches.length = 0;
    this.resetFrameStats();
  }

  private createRegion(center: THREE.Vector3): SettlingRegion {
    const region: SettlingRegion = {
      id: this.nextRegionId,
      center: center.clone(),
      fragments: new Set(),
      glueLinks: new Map(),
      materialUnitsByBlock: new Map(),
      createdAt: this.elapsedSeconds,
      fractureCount: 0,
      contactAfter: this.elapsedSeconds + DEBRIS_REGION_CONTACT_BREAKUP_SECONDS,
      collisionUntil: this.elapsedSeconds + DEBRIS_REGION_COLLISION_SECONDS,
      glueAfter: this.elapsedSeconds + DEBRIS_REGION_GLUE_BREAKUP_SECONDS,
      finalizeAt: this.elapsedSeconds + DEBRIS_REGION_FINALIZE_SECONDS,
      maxFinalizeAt: this.elapsedSeconds + DEBRIS_REGION_MAX_SECONDS,
      settledAt: null
    };
    this.nextRegionId += 1;
    this.regionsById.set(region.id, region);
    return region;
  }

  private addFractureToRegion(
    region: SettlingRegion,
    block: number,
    center: THREE.Vector3,
    fragments: readonly PhysicsToy[]
  ): void {
    // A region is the temporary clumping truth. Individual fractures feed it,
    // but the final pile should read as one connected blast area.
    region.center
      .multiplyScalar(region.fractureCount)
      .add(center)
      .divideScalar(region.fractureCount + 1);
    region.fractureCount += 1;
    region.collisionUntil = Math.max(
      region.collisionUntil,
      this.elapsedSeconds + DEBRIS_REGION_COLLISION_SECONDS
    );
    region.contactAfter = Math.max(
      region.contactAfter,
      this.elapsedSeconds + DEBRIS_REGION_CONTACT_BREAKUP_SECONDS
    );
    region.glueAfter = Math.max(
      region.glueAfter,
      this.elapsedSeconds + DEBRIS_REGION_GLUE_BREAKUP_SECONDS
    );
    region.settledAt = null;
    region.finalizeAt = Math.min(
      this.elapsedSeconds + DEBRIS_REGION_FINALIZE_SECONDS,
      region.maxFinalizeAt
    );

    for (const fragment of fragments) {
      region.fragments.add(fragment);
      this.fragmentRegionIds.set(fragment, region.id);
      const fragmentBlock = fragment.fragmentBlock ?? block;
      region.materialUnitsByBlock.set(
        fragmentBlock,
        (region.materialUnitsByBlock.get(fragmentBlock) ?? 0) + fragment.rubbleMaterialUnits
      );
    }
  }

  private findNearbyRegions(center: THREE.Vector3): SettlingRegion[] {
    const nearbyRegions: SettlingRegion[] = [];
    for (const region of this.regionsById.values()) {
      const horizontalDistanceSq = (
        (region.center.x - center.x) ** 2 +
        (region.center.z - center.z) ** 2
      );
      const verticalDistance = Math.abs(region.center.y - center.y);
      if (
        horizontalDistanceSq <= DEBRIS_REGION_HORIZONTAL_MERGE_RADIUS ** 2 &&
        verticalDistance <= DEBRIS_REGION_VERTICAL_MERGE_RADIUS
      ) {
        nearbyRegions.push(region);
      }
    }
    return nearbyRegions;
  }

  private mergeRegions(regions: readonly SettlingRegion[]): SettlingRegion {
    const [target, ...sources] = [...regions].sort((left, right) => left.createdAt - right.createdAt);
    if (!target) {
      throw new Error("Cannot merge an empty settling-region list.");
    }

    for (const source of sources) {
      if (source === target || !this.regionsById.has(source.id)) continue;

      const combinedFractures = target.fractureCount + source.fractureCount;
      if (combinedFractures > 0) {
        target.center
          .multiplyScalar(target.fractureCount)
          .add(source.center.clone().multiplyScalar(source.fractureCount))
          .divideScalar(combinedFractures);
      }
      target.fractureCount = combinedFractures;
      target.createdAt = Math.min(target.createdAt, source.createdAt);
      target.contactAfter = Math.max(target.contactAfter, source.contactAfter);
      target.collisionUntil = Math.max(target.collisionUntil, source.collisionUntil);
      target.glueAfter = Math.max(target.glueAfter, source.glueAfter);
      target.maxFinalizeAt = Math.min(target.maxFinalizeAt, source.maxFinalizeAt);
      target.finalizeAt = Math.min(Math.max(target.finalizeAt, source.finalizeAt), target.maxFinalizeAt);
      target.settledAt = null;

      for (const fragment of source.fragments) {
        target.fragments.add(fragment);
        this.fragmentRegionIds.set(fragment, target.id);
      }
      for (const link of source.glueLinks.values()) {
        target.glueLinks.set(this.getGlueLinkKey(link.left, link.right), link);
      }
      for (const [block, materialUnits] of source.materialUnitsByBlock) {
        target.materialUnitsByBlock.set(
          block,
          (target.materialUnitsByBlock.get(block) ?? 0) + materialUnits
        );
      }
      this.regionsById.delete(source.id);
    }
    return target;
  }

  private finalizeDueRegions(rubbleField: RubbleField, options: DebrisSettlerUpdateOptions): void {
    for (const region of this.getRegionsOldestFirst()) {
      if (!this.regionsById.has(region.id)) continue;
      this.updateRegionFinalizationDeadline(region);

      // With an active player bubble configured, distance replaces the old
      // "hard max lifetime" as the normal conversion signal. A nearby sleeping
      // heap can keep being shoved by cores instead of secretly becoming a
      // baked pile while the player is studying it.
      if (this.isActiveBubbleConfigured(options)) {
        if (this.isRegionInsideActiveBubble(region, options)) {
          // Sleeping rigid debris inside the player bubble is still live
          // physics state, just parked cheaply. Rapier can wake it when active
          // debris hits it, and the core broadphase can wake it when a player
          // shot shoves it, so do not bake it into destructible rubble here.
          this.sleepQuietRegionFragments(region);
          continue;
        }

        if (this.shouldFinalizeOutsideActiveBubble(region)) {
          this.sleepQuietRegionFragments(region);
          this.finalizeRegion(region, rubbleField, false);
        }
        continue;
      }

      const reachedHardCap = this.elapsedSeconds >= region.maxFinalizeAt;
      const reachedSettledDeadline = region.settledAt !== null && this.elapsedSeconds >= region.finalizeAt;
      if (!reachedHardCap && !reachedSettledDeadline) continue;

      this.finalizeRegion(region, rubbleField, reachedHardCap);
    }
  }

  private updateRegionFinalizationDeadline(region: SettlingRegion): void {
    const liveFragments = this.getUnexpiredFragments(region);
    const regionIsQuiet = this.isRegionQuietForFinalization(region, liveFragments);
    if (!regionIsQuiet) {
      region.settledAt = null;
      return;
    }

    if (region.settledAt === null) {
      region.settledAt = this.elapsedSeconds;
    }

    // The original fracture timer is still the "show the little shards for a
    // beat" floor, but late-bouncing debris now waits until it actually sleeps.
    // This keeps us from freezing a chaotic mid-bounce pose into permanent
    // rubble while the hard cap still prevents immortal region bookkeeping.
    region.finalizeAt = Math.min(
      Math.max(region.finalizeAt, region.settledAt + DEBRIS_REGION_SETTLED_FINALIZE_SECONDS),
      region.maxFinalizeAt
    );
  }

  private isRegionQuietForFinalization(
    region: SettlingRegion,
    liveFragments: readonly PhysicsToy[]
  ): boolean {
    if (liveFragments.length === 0) return true;
    if (this.isRigidBodyRegion(region)) {
      return liveFragments.every((fragment) => fragment.isSleeping);
    }
    if (liveFragments.every((fragment) => fragment.isSupportAnchoredSleep)) return true;

    // A settling region can cover multiple disconnected piles after a spammy
    // explosion. Do quiet checks per glue-connected component so a supported
    // floor clump does not accidentally sleep unrelated shards floating above
    // the crater.
    return this.getGlueConnectedComponents(region, liveFragments)
      .every((component) => this.isComponentQuietAndSupported(component));
  }

  private isFragmentLinearQuiet(fragment: PhysicsToy): boolean {
    return fragment.velocity.lengthSq() <= DEBRIS_REGION_QUIET_SPEED ** 2;
  }

  private isFragmentSupportAnchor(fragment: PhysicsToy): boolean {
    return fragment.isSupportAnchoredSleep || fragment.hadSupportContactLastUpdate;
  }

  private isComponentQuietAndSupported(component: readonly PhysicsToy[]): boolean {
    if (component.length === 0) return true;
    const supportableFragments = this.getSupportableFragments(component);

    return component.every((fragment) => (
      supportableFragments.has(fragment) &&
      this.isFragmentQuietEnoughToSleep(fragment)
    ));
  }

  private isFragmentQuietEnoughToSleep(fragment: PhysicsToy): boolean {
    return fragment.isSleeping || this.isFragmentLinearQuiet(fragment);
  }

  private getSleepableSupportedFragments(component: readonly PhysicsToy[]): PhysicsToy[] {
    const supportableFragments = this.getSupportableFragments(component);
    return component.filter((fragment) => (
      supportableFragments.has(fragment) &&
      this.isFragmentQuietEnoughToSleep(fragment)
    ));
  }

  private getSupportableFragments(component: readonly PhysicsToy[]): Set<PhysicsToy> {
    const supportableFragments = new Set<PhysicsToy>();
    for (const fragment of component) {
      if (this.isFragmentSupportAnchor(fragment)) {
        supportableFragments.add(fragment);
      }
    }

    let addedSupport = true;
    while (addedSupport) {
      addedSupport = false;
      for (const candidate of component) {
        if (supportableFragments.has(candidate)) continue;
        if (!this.isFragmentQuietEnoughToSleep(candidate)) continue;

        for (const lower of supportableFragments) {
          if (!this.isFragmentQuietEnoughToSleep(lower)) continue;
          if (!this.isFragmentRestingOnSupportedFragment(candidate, lower)) continue;

          supportableFragments.add(candidate);
          addedSupport = true;
          break;
        }
      }
    }
    return supportableFragments;
  }

  private isFragmentRestingOnSupportedFragment(upper: PhysicsToy, lower: PhysicsToy): boolean {
    const deltaX = upper.mesh.position.x - lower.mesh.position.x;
    const deltaY = upper.mesh.position.y - lower.mesh.position.y;
    const deltaZ = upper.mesh.position.z - lower.mesh.position.z;

    // Support must look like a stack, not just a side-by-side sticky contact.
    // This stops a grounded shard from freezing neighboring debris that merely
    // touched it while still visibly hanging in the air.
    return (
      Math.abs(deltaX) <= DEBRIS_REGION_STACK_HORIZONTAL_OVERLAP &&
      Math.abs(deltaZ) <= DEBRIS_REGION_STACK_HORIZONTAL_OVERLAP &&
      deltaY > BLOCK_FRAGMENT_VISUAL_SIZE * 0.2 &&
      deltaY <= DEBRIS_REGION_STACK_VERTICAL_RANGE
    );
  }

  private getGlueConnectedComponents(
    region: SettlingRegion,
    liveFragments: readonly PhysicsToy[]
  ): PhysicsToy[][] {
    const liveSet = new Set(liveFragments);
    const adjacency = new Map<PhysicsToy, PhysicsToy[]>();
    for (const fragment of liveFragments) {
      adjacency.set(fragment, []);
    }

    for (const link of region.glueLinks.values()) {
      if (!liveSet.has(link.left) || !liveSet.has(link.right)) continue;

      adjacency.get(link.left)?.push(link.right);
      adjacency.get(link.right)?.push(link.left);
    }

    const components: PhysicsToy[][] = [];
    const visited = new Set<PhysicsToy>();
    for (const fragment of liveFragments) {
      if (visited.has(fragment)) continue;

      const component: PhysicsToy[] = [];
      const stack = [fragment];
      visited.add(fragment);
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;

        component.push(current);
        for (const neighbor of adjacency.get(current) ?? []) {
          if (visited.has(neighbor)) continue;

          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
      components.push(component);
    }
    return components;
  }

  private shouldFinalizeOutsideActiveBubble(region: SettlingRegion): boolean {
    if (region.settledAt === null) return false;
    return this.elapsedSeconds >= region.finalizeAt;
  }

  private enforcePairBudget(): void {
    let estimatedPairs = this.estimateActiveCollisionPairs();
    if (estimatedPairs <= DEBRIS_REGION_PAIR_BUDGET) return;

    for (const region of this.getRegionsOldestFirst()) {
      if (!this.regionsById.has(region.id)) continue;
      if (!this.isCollisionActive(region)) continue;

      // Pair pressure is a CPU throttle, not a gameplay/material signal. The
      // old path finalized whole regions here, which made dense craters appear
      // to despawn or freeze mid-flight inside the active bubble. Instead, end
      // local debris-debris contact work for the oldest noisy region and let
      // those fragments keep flying/settling as ordinary physics toys.
      region.collisionUntil = this.elapsedSeconds - DEBRIS_REGION_COLLISION_EPSILON;
      estimatedPairs = this.estimateActiveCollisionPairs();
      if (estimatedPairs <= DEBRIS_REGION_PAIR_BUDGET) break;
    }
  }

  private resolveActiveRegionCollisions(delta: number): void {
    for (const region of this.regionsById.values()) {
      if (this.isRigidBodyRegion(region)) continue;
      if (!this.isCollisionActive(region)) continue;

      const fragments = this.getAwakeFragments(region);
      this.applyRegionCohesion(region, fragments, delta);
      this.enforceGlueLinks(region);
      for (let leftIndex = 0; leftIndex < fragments.length - 1; leftIndex += 1) {
        const left = fragments[leftIndex];
        if (!left) continue;

        for (let rightIndex = leftIndex + 1; rightIndex < fragments.length; rightIndex += 1) {
          if (this.stats.pairChecks >= DEBRIS_REGION_PAIR_BUDGET) return;

          const right = fragments[rightIndex];
          if (!right) continue;

          this.stats.pairChecks += 1;
          if (this.resolveFragmentPair(region, left, right)) {
            this.stats.resolvedPairs += 1;
          }
        }
      }
      this.enforceGlueLinks(region);
    }
  }

  private enforceExistingGlueLinks(): void {
    for (const region of this.regionsById.values()) {
      if (this.isRigidBodyRegion(region)) continue;
      this.enforceGlueLinks(region);
    }
  }

  private resolveFragmentPair(region: SettlingRegion, left: PhysicsToy, right: PhysicsToy): boolean {
    if (left.isExpired || right.isExpired || left.isSleeping || right.isSleeping) return false;

    const leftPosition = left.mesh.position;
    const rightPosition = right.mesh.position;
    const combinedRadius = Math.max(
      BLOCK_FRAGMENT_VISUAL_SIZE,
      (left.radius + right.radius) * DEBRIS_REGION_FRAGMENT_RADIUS_SCALE
    );
    const glueContactRadius = combinedRadius + DEBRIS_REGION_GLUE_CAPTURE_SLOP;
    const distanceSq = this.normal.subVectors(rightPosition, leftPosition).lengthSq();
    if (distanceSq >= glueContactRadius * glueContactRadius) return false;

    const distance = Math.sqrt(distanceSq);
    this.normalizePairNormal(left, right, distance);

    const inverseMassSum = left.inverseMass + right.inverseMass;
    if (inverseMassSum <= 0) return false;

    const glueReady = this.elapsedSeconds >= region.glueAfter;
    const penetration = Math.max(0, combinedRadius - distance);
    const retainedOverlap = glueReady
      ? Math.min(penetration, DEBRIS_REGION_STICKY_RETAINED_OVERLAP)
      : 0;
    const correction = Math.max(0, penetration - retainedOverlap);
    leftPosition.addScaledVector(this.normal, -(correction * left.inverseMass) / inverseMassSum);
    rightPosition.addScaledVector(this.normal, (correction * right.inverseMass) / inverseMassSum);

    this.relativeVelocity.copy(right.velocity).sub(left.velocity);
    const closingSpeed = this.relativeVelocity.dot(this.normal);
    if (closingSpeed < 0) {
      const restitution = glueReady
        ? DEBRIS_REGION_COLLISION_RESTITUTION
        : DEBRIS_REGION_BREAKUP_RESTITUTION;
      const impulse = (-(1 + restitution) * closingSpeed) / inverseMassSum;
      left.velocity.addScaledVector(this.normal, -impulse * left.inverseMass);
      right.velocity.addScaledVector(this.normal, impulse * right.inverseMass);
      const tumbleSpeed = Math.min(8, Math.abs(closingSpeed) + penetration * 8);
      left.addTumbleImpulse(this.normal, tumbleSpeed);
      right.addTumbleImpulse(this.normal, tumbleSpeed);
    }

    if (glueReady) {
      this.resolveStackContact(left, right);
      this.glueFragmentPair(left, right);
    }

    const damping = glueReady
      ? DEBRIS_REGION_COLLISION_DAMPING
      : DEBRIS_REGION_BREAKUP_DAMPING;
    left.velocity.multiplyScalar(damping);
    right.velocity.multiplyScalar(damping);
    return true;
  }

  private normalizePairNormal(left: PhysicsToy, right: PhysicsToy, distance: number): void {
    if (distance > DEBRIS_REGION_COLLISION_EPSILON) {
      this.normal.multiplyScalar(1 / distance);
      return;
    }

    this.normal.copy(right.velocity).sub(left.velocity);
    if (this.normal.lengthSq() <= DEBRIS_REGION_COLLISION_EPSILON) {
      this.normal.set(1, 0, 0);
    } else {
      this.normal.normalize();
    }
  }

  private applyStickyVelocityBlend(left: PhysicsToy, right: PhysicsToy): void {
    const averageX = (left.velocity.x + right.velocity.x) * 0.5;
    const averageY = (left.velocity.y + right.velocity.y) * 0.5;
    const averageZ = (left.velocity.z + right.velocity.z) * 0.5;

    left.velocity.x += (averageX - left.velocity.x) * DEBRIS_REGION_STICKY_HORIZONTAL_BLEND;
    right.velocity.x += (averageX - right.velocity.x) * DEBRIS_REGION_STICKY_HORIZONTAL_BLEND;
    left.velocity.z += (averageZ - left.velocity.z) * DEBRIS_REGION_STICKY_HORIZONTAL_BLEND;
    right.velocity.z += (averageZ - right.velocity.z) * DEBRIS_REGION_STICKY_HORIZONTAL_BLEND;

    // Vertical glue stays weaker so a top fragment can still look like it is
    // tumbling down onto the pile instead of every shard becoming one welded
    // clump in mid-air.
    left.velocity.y += (averageY - left.velocity.y) * DEBRIS_REGION_STICKY_VERTICAL_BLEND;
    right.velocity.y += (averageY - right.velocity.y) * DEBRIS_REGION_STICKY_VERTICAL_BLEND;
  }

  private glueFragmentPair(left: PhysicsToy, right: PhysicsToy): void {
    const regionId = this.fragmentRegionIds.get(left);
    if (regionId === undefined || this.fragmentRegionIds.get(right) !== regionId) return;

    const region = this.regionsById.get(regionId);
    if (!region || region.glueLinks.size >= DEBRIS_REGION_MAX_GLUE_LINKS) return;
    if (this.elapsedSeconds < region.glueAfter) return;

    const linkKey = this.getGlueLinkKey(left, right);
    if (region.glueLinks.has(linkKey)) return;

    const restOffset = right.mesh.position.clone().sub(left.mesh.position);
    if (restOffset.lengthSq() <= DEBRIS_REGION_COLLISION_EPSILON) {
      restOffset.copy(this.normal).multiplyScalar(BLOCK_FRAGMENT_VISUAL_SIZE);
    }
    this.normalizeGlueRestOffset(restOffset);

    // Contact glue is the visible lie the player asked for: once two chunks
    // touch during the short settling window, they stop spinning independently
    // and behave like a tiny joined clump until the region becomes cheap rubble.
    region.glueLinks.set(linkKey, { left, right, restOffset });
    left.angularVelocity.set(0, 0, 0);
    right.angularVelocity.set(0, 0, 0);
    this.applyStickyVelocityBlend(left, right);
  }

  private enforceGlueLinks(region: SettlingRegion): void {
    for (const [linkKey, link] of region.glueLinks) {
      if (
        link.left.isExpired ||
        link.right.isExpired ||
        !region.fragments.has(link.left) ||
        !region.fragments.has(link.right)
      ) {
        region.glueLinks.delete(linkKey);
        continue;
      }

      link.left.angularVelocity.set(0, 0, 0);
      link.right.angularVelocity.set(0, 0, 0);
      this.applyStickyVelocityBlend(link.left, link.right);

      const inverseMassSum = link.left.inverseMass + link.right.inverseMass;
      if (inverseMassSum <= 0) continue;

      this.scratchPosition
        .copy(link.right.mesh.position)
        .sub(link.left.mesh.position)
        .sub(link.restOffset)
        .multiplyScalar(DEBRIS_REGION_GLUE_POSITION_RESPONSE);

      link.left.mesh.position.addScaledVector(
        this.scratchPosition,
        (link.left.inverseMass) / inverseMassSum
      );
      link.right.mesh.position.addScaledVector(
        this.scratchPosition,
        -(link.right.inverseMass) / inverseMassSum
      );
      this.relaxGlueLinkOverlap(link, inverseMassSum);
    }
  }

  private normalizeGlueRestOffset(restOffset: THREE.Vector3): void {
    const restDistance = restOffset.length();
    if (restDistance >= DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION) return;

    // Glue should mean "move together", not "occupy the same visual volume".
    // When the contact was captured from an overlapped pose, expand the stored
    // rest offset so the later glue pass keeps a small visible air gap instead
    // of preserving the interpenetration forever.
    if (restDistance <= DEBRIS_REGION_COLLISION_EPSILON) {
      restOffset.set(DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION, 0, 0);
      return;
    }
    restOffset.multiplyScalar(DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION / restDistance);
  }

  private relaxGlueLinkOverlap(link: DebrisGlueLink, inverseMassSum: number): void {
    this.scratchPosition.subVectors(link.right.mesh.position, link.left.mesh.position);
    const currentDistance = this.scratchPosition.length();
    if (currentDistance >= DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION) return;

    if (currentDistance <= DEBRIS_REGION_COLLISION_EPSILON) {
      this.normal.copy(link.restOffset);
      if (this.normal.lengthSq() <= DEBRIS_REGION_COLLISION_EPSILON) {
        this.normal.set(1, 0, 0);
      } else {
        this.normal.normalize();
      }
    } else {
      this.normal.copy(this.scratchPosition).multiplyScalar(1 / currentDistance);
    }

    const correction = DEBRIS_REGION_GLUE_MIN_CENTER_SEPARATION - currentDistance;
    link.left.mesh.position.addScaledVector(
      this.normal,
      -(correction * link.left.inverseMass) / inverseMassSum
    );
    link.right.mesh.position.addScaledVector(
      this.normal,
      (correction * link.right.inverseMass) / inverseMassSum
    );

    this.relativeVelocity.copy(link.right.velocity).sub(link.left.velocity);
    const closingSpeed = this.relativeVelocity.dot(this.normal);
    if (closingSpeed >= 0) return;

    // Bleed only the compressive part of the motion. The fragments can still be
    // shoved as a clump by a core, but the glue solver will not keep driving
    // two shards back through each other after it has separated them.
    const impulse = -closingSpeed / inverseMassSum;
    link.left.velocity.addScaledVector(this.normal, -impulse * link.left.inverseMass);
    link.right.velocity.addScaledVector(this.normal, impulse * link.right.inverseMass);
  }

  private removeGlueLinksForFragment(region: SettlingRegion, toy: PhysicsToy): void {
    for (const [linkKey, link] of region.glueLinks) {
      if (link.left === toy || link.right === toy) {
        region.glueLinks.delete(linkKey);
      }
    }
  }

  private getGlueLinkKey(left: PhysicsToy, right: PhysicsToy): string {
    const leftId = this.getFragmentId(left);
    const rightId = this.getFragmentId(right);
    return leftId < rightId
      ? `${leftId}:${rightId}`
      : `${rightId}:${leftId}`;
  }

  private getFragmentId(fragment: PhysicsToy): number {
    const existingId = this.fragmentIds.get(fragment);
    if (existingId !== undefined) return existingId;

    const id = this.nextFragmentId;
    this.nextFragmentId += 1;
    this.fragmentIds.set(fragment, id);
    return id;
  }

  private resolveStackContact(left: PhysicsToy, right: PhysicsToy): void {
    const deltaX = right.mesh.position.x - left.mesh.position.x;
    const deltaY = right.mesh.position.y - left.mesh.position.y;
    const deltaZ = right.mesh.position.z - left.mesh.position.z;
    if (
      Math.abs(deltaX) > DEBRIS_REGION_STACK_HORIZONTAL_OVERLAP ||
      Math.abs(deltaZ) > DEBRIS_REGION_STACK_HORIZONTAL_OVERLAP ||
      Math.abs(deltaY) <= DEBRIS_REGION_COLLISION_EPSILON ||
      Math.abs(deltaY) > DEBRIS_REGION_STACK_VERTICAL_RANGE
    ) {
      return;
    }

    const lower = deltaY > 0 ? left : right;
    const upper = deltaY > 0 ? right : left;
    const targetUpperY = lower.mesh.position.y + DEBRIS_REGION_STACK_CENTER_SEPARATION;
    if (upper.mesh.position.y >= targetUpperY) return;

    // This is the small cheat that makes the visible fragments read as shards
    // settling on a temporary pile instead of marbles phasing through each
    // other. The persistent gameplay truth is still the rubble surface mesh,
    // so this support only lives inside the short settling region window.
    const correction = targetUpperY - upper.mesh.position.y;
    upper.mesh.position.y += correction * 0.8;
    lower.mesh.position.y -= correction * 0.2;
    if (upper.velocity.y < lower.velocity.y) {
      upper.velocity.y = Math.max(upper.velocity.y * -0.15, lower.velocity.y * 0.25);
    }
    upper.velocity.x *= 0.7;
    upper.velocity.z *= 0.7;
    lower.velocity.x *= 0.85;
    lower.velocity.z *= 0.85;
    upper.addTumbleImpulse(this.normal, correction * 8);
  }

  private applyRegionCohesion(region: SettlingRegion, fragments: readonly PhysicsToy[], delta: number): void {
    if (delta <= 0) return;
    if (this.elapsedSeconds < region.glueAfter) return;

    for (const fragment of fragments) {
      // The visible stage is "settling theater", not a real granular solver.
      // A gentle horizontal pull keeps shards in the crater long enough for
      // same-region contacts to read as clumping instead of immediate scatter.
      this.scratchPosition.copy(region.center).sub(fragment.mesh.position);
      this.scratchPosition.y *= 0.15;
      const distanceSq = this.scratchPosition.lengthSq();
      if (distanceSq <= DEBRIS_REGION_COLLISION_EPSILON) continue;

      const distance = Math.sqrt(distanceSq);
      this.scratchPosition.multiplyScalar(1 / distance);
      const acceleration = Math.min(distance, 1.4) * DEBRIS_REGION_COHESION_ACCELERATION;
      fragment.velocity.addScaledVector(this.scratchPosition, acceleration * delta);
    }
  }

  private sleepQuietRegionFragments(region: SettlingRegion): void {
    if (this.isRigidBodyRegion(region)) return;
    if (this.elapsedSeconds < region.glueAfter + DEBRIS_REGION_QUIET_SLEEP_SECONDS) return;

    // Inside the active debris bubble, a quiet glued clump should remain as
    // shoveable debris rather than immediately finalizing into rubble. Put the
    // fragments into the same sleeping state terrain-supported shards use so
    // they stop spinning in place while the broadphase can still wake them when
    // a physics core hits. Do this per glue-connected component: one grounded
    // pile should not freeze unrelated fragments that are still hanging in the air.
    for (const component of this.getGlueConnectedComponents(region, this.getUnexpiredFragments(region))) {
      const sleepableFragments = this.getSleepableSupportedFragments(component);

      for (const fragment of sleepableFragments) {
        if (!fragment.isExpired) fragment.sleepInPlace(true);
      }
    }
  }

  private finalizeRegion(region: SettlingRegion, rubbleField: RubbleField, forced: boolean): void {
    const samples = this.createRubbleSamples(region, forced);
    const block = this.getDominantBlock(region);
    const pieces = samples.reduce((total, sample) => total + (sample.pieces ?? 1), 0);
    if (samples.length > 0) {
      rubbleField.absorbBatch(samples);
      this.finalizedBatches.push({
        position: {
          x: region.center.x,
          y: region.center.y,
          z: region.center.z
        },
        block,
        pieces
      });
    }

    for (const fragment of region.fragments) {
      // Keep the fragment marked as settler-owned until the normal prune path
      // removes it. Otherwise the orphan fallback would see an expired fragment
      // later in the same frame and deposit its material a second time.
      fragment.expire();
    }
    this.regionsById.delete(region.id);
    this.stats.finalizedBatches += 1;
    this.stats.finalizedFragments += region.fragments.size;
    this.stats.finalizedPieces += pieces;
    if (forced) this.stats.forcedFinalizations += 1;
  }

  private discardRegion(region: SettlingRegion): void {
    for (const fragment of region.fragments) {
      // Keep the stale ownership map until normal pruning removes the toy.
      // Otherwise the orphan absorption pass would see an expired fragment and
      // turn this visual-only budget cut straight back into static rubble.
      fragment.expire();
    }
    this.regionsById.delete(region.id);
  }

  private getPressureOrderedRegions(activeCenter: THREE.Vector3): SettlingRegion[] {
    return [...this.regionsById.values()].sort((left, right) => {
      const leftSleeping = this.isRegionSleeping(left);
      const rightSleeping = this.isRegionSleeping(right);
      if (leftSleeping !== rightSleeping) return leftSleeping ? -1 : 1;

      return (
        this.getRegionDistanceSqToPoint(right, activeCenter) -
        this.getRegionDistanceSqToPoint(left, activeCenter)
      );
    });
  }

  private createRubbleSamples(region: SettlingRegion, includeAwakeVisualChunks: boolean): RubbleAbsorptionSample[] {
    const block = this.getDominantBlock(region);
    const samples: RubbleAbsorptionSample[] = [];

    for (const fragment of region.fragments) {
      if (!fragment.isInstancedFragment || fragment.fragmentBlock === null) continue;

      const materialUnits = Math.max(0.0001, fragment.rubbleMaterialUnits);
      const sampleCount = Math.max(1, Math.ceil(materialUnits));
      const piecesPerSample = materialUnits / sampleCount;
      for (let unitIndex = 0; unitIndex < sampleCount; unitIndex += 1) {
        samples.push({
          block,
          position: this.getSamplePosition(fragment, unitIndex, sampleCount),
          pieces: piecesPerSample,
          visualChunk: unitIndex === 0 && (fragment.isSleeping || includeAwakeVisualChunks)
            ? this.createVisualChunkSample(fragment)
            : undefined
        });
      }
    }
    return samples;
  }

  private createVisualChunkSample(fragment: PhysicsToy): RubbleVisualChunkSample {
    const debrisShape = fragment.debrisShape ?? createDefaultDebrisShape();
    return {
      position: fragment.mesh.position.clone(),
      quaternion: fragment.mesh.quaternion.clone(),
      shapeId: debrisShape.shapeId,
      visualScale: debrisShape.visualScale.clone()
    };
  }

  private getSamplePosition(fragment: PhysicsToy, unitIndex: number, materialUnits: number): THREE.Vector3 {
    const angleSeed = (
      fragment.mesh.position.x * 12.9898 +
      fragment.mesh.position.y * 78.233 +
      fragment.mesh.position.z * 37.719 +
      unitIndex * 2.399963
    );
    const radius = materialUnits > 1
      ? RUBBLE_SAMPLE_JITTER_RADIUS * Math.sqrt((unitIndex + 0.5) / materialUnits)
      : 0;
    const angle = angleSeed % (Math.PI * 2);

    return this.scratchPosition
      .copy(fragment.mesh.position)
      .add(new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ))
      .clone();
  }

  private getDominantBlock(region: SettlingRegion): number {
    let dominantBlock = 0;
    let dominantUnits = -Infinity;
    for (const [block, materialUnits] of region.materialUnitsByBlock) {
      if (materialUnits <= dominantUnits) continue;
      dominantBlock = block;
      dominantUnits = materialUnits;
    }
    return dominantBlock;
  }

  private isCollisionActive(region: SettlingRegion): boolean {
    if (this.isRigidBodyRegion(region)) return false;
    return (
      this.elapsedSeconds >= region.contactAfter &&
      this.elapsedSeconds <= region.collisionUntil &&
      this.getAwakeFragments(region).length > 1
    );
  }

  private estimateActiveCollisionPairs(): number {
    let pairs = 0;
    for (const region of this.regionsById.values()) {
      if (!this.isCollisionActive(region)) continue;
      const fragmentCount = this.getAwakeFragments(region).length;
      pairs += (fragmentCount * (fragmentCount - 1)) / 2;
    }
    return pairs;
  }

  private getAwakeFragments(region: SettlingRegion): PhysicsToy[] {
    return [...region.fragments].filter((fragment) => !fragment.isExpired && !fragment.isSleeping);
  }

  private getUnexpiredFragments(region: SettlingRegion): PhysicsToy[] {
    return [...region.fragments].filter((fragment) => !fragment.isExpired);
  }

  private isRigidBodyRegion(region: SettlingRegion): boolean {
    return this.getUnexpiredFragments(region).some((fragment) => fragment.isRigidDebrisDriven);
  }

  private isRegionSleeping(region: SettlingRegion): boolean {
    const liveFragments = this.getUnexpiredFragments(region);
    return liveFragments.length > 0 && liveFragments.every((fragment) => fragment.isSleeping);
  }

  private isActiveBubbleConfigured(options: DebrisSettlerUpdateOptions): boolean {
    return (
      options.activeCenter !== undefined &&
      options.activeRadius !== undefined &&
      Number.isFinite(options.activeRadius)
    );
  }

  private isRegionInsideActiveBubble(
    region: SettlingRegion,
    options: DebrisSettlerUpdateOptions
  ): boolean {
    if (!options.activeCenter || options.activeRadius === undefined) return false;

    const radius = Math.max(0, options.activeRadius) +
      (options.activeRadiusBuffer ?? DEBRIS_ACTIVE_RADIUS_BUFFER_METERS);
    return this.getRegionDistanceSqToPoint(region, options.activeCenter) <= radius * radius;
  }

  private getRegionDistanceSqToPoint(region: SettlingRegion, point: THREE.Vector3): number {
    let distanceSq = region.center.distanceToSquared(point);

    // Keep a broad crater alive if any owned shard is still near the player.
    // Region centers are fracture averages, so using only the center can bake a
    // pile even though the player is standing beside one of its edge chunks.
    for (const fragment of region.fragments) {
      if (fragment.isExpired) continue;
      distanceSq = Math.min(distanceSq, fragment.mesh.position.distanceToSquared(point));
    }
    return distanceSq;
  }

  private getRegionsOldestFirst(): SettlingRegion[] {
    return [...this.regionsById.values()].sort((left, right) => left.createdAt - right.createdAt);
  }

  private resetFrameStats(): void {
    this.finalizedBatches.length = 0;
    this.stats.regions = 0;
    this.stats.fragments = 0;
    this.stats.activeFragments = 0;
    this.stats.pairChecks = 0;
    this.stats.resolvedPairs = 0;
    this.stats.finalizedBatches = 0;
    this.stats.finalizedFragments = 0;
    this.stats.finalizedPieces = 0;
    this.stats.forcedFinalizations = 0;
  }

  private refreshLiveStats(): void {
    this.stats.regions = this.regionsById.size;
    let fragments = 0;
    let activeFragments = 0;
    for (const region of this.regionsById.values()) {
      fragments += region.fragments.size;
      activeFragments += this.getAwakeFragments(region).length;
    }
    this.stats.fragments = fragments;
    this.stats.activeFragments = activeFragments;
  }
}
