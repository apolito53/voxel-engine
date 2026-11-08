import {
  isBirdVolumeClear,
  sweepBirdFlight,
  type BirdWildlifePosition,
  type BirdWildlifeWorld
} from "./birdWildlifeCollision";
import { SOLO_BIRD_COUNT, SoloBirdSimulation } from "./birdSolo";

export type { BirdTreePerch, BirdWildlifePosition, BirdWildlifeWorld } from "./birdWildlifeCollision";
export { SOLO_BIRD_COUNT, SOLO_BIRD_MAX_SPEED, SOLO_BIRD_PERCH_BODY_HEIGHT } from "./birdSolo";
export const BIRD_FLOCK_COUNT = 2;
export const BIRDS_PER_FLOCK = 6;
export const BIRD_POPULATION_CAP = BIRD_FLOCK_COUNT * BIRDS_PER_FLOCK + SOLO_BIRD_COUNT;
export const BIRD_MAX_SPEED = 12;
export const BIRD_FLOCK_ALTITUDE = 132;
export const BIRD_RECYCLE_DISTANCE = 76;

export type BirdWildlifePose = {
  readonly role: "flock" | "solo";
  readonly state: "flying" | "landing" | "perched" | "taking-off";
  readonly perch: BirdWildlifePosition | null;
  readonly foldedWings: boolean;
  readonly flightTarget: BirdWildlifePosition;
  readonly habitatCenter: BirdWildlifePosition;
  readonly id: number;
  readonly flockId: number;
  readonly position: BirdWildlifePosition;
  readonly velocity: BirdWildlifePosition;
  readonly yaw: number;
  readonly pitch: number;
  readonly bank: number;
  readonly wingAngle: number;
  readonly flapping: boolean;
  readonly visible: boolean;
  readonly opacity: number;
};
export type BirdWildlifeFlockSnapshot = {
  readonly id: number;
  readonly center: BirdWildlifePosition;
  readonly visible: boolean;
  readonly recycleCount: number;
  readonly flightTarget: BirdWildlifePosition;
  readonly habitatCenter: BirdWildlifePosition;
};
export type BirdWildlifeSnapshot = {
  readonly birds: readonly BirdWildlifePose[];
  readonly flocks: readonly BirdWildlifeFlockSnapshot[];
  readonly elapsedSeconds: number;
  readonly populationCap: number;
};

type MutablePosition = { x: number; y: number; z: number };
type BirdRecord = {
  readonly id: number;
  readonly flockId: number;
  readonly member: number;
  position: MutablePosition;
  velocity: MutablePosition;
  yaw: number;
  pitch: number;
  bank: number;
  wingAngle: number;
  flapping: boolean;
  visible: boolean;
  opacity: number;
  recoverySeconds: number;
  stuckSeconds: number;
};
type FlockRecord = {
  readonly id: number;
  anchor: MutablePosition;
  center: MutablePosition;
  phase: number;
  routePosition: MutablePosition;
  routeVelocity: MutablePosition;
  routeTarget: MutablePosition;
  routeStart: MutablePosition;
  routeLeg: number;
  routeSeconds: number;
  routeRetrySeconds: number;
  recycleCount: number;
  heightProbeSeconds: number;
  terrainHeight: number;
  placementPlayer: MutablePosition;
};

/** Small local flocks with deterministic motion; terrain and scene ownership stay outside. */
export class BirdWildlifeSimulation {
  private readonly initialSeed: number;
  private randomState: number;
  private birds: BirdRecord[] = [];
  private flocks: FlockRecord[] = [];
  private elapsedSeconds = 0;
  private forward = { x: 0, y: 0, z: -1 };
  private previousPlayer: MutablePosition | null = null;
  private readonly solos = new SoloBirdSimulation();

  constructor(seed = 631) {
    this.initialSeed = seed | 0 || 631;
    this.randomState = this.initialSeed;
  }

  seed(world: BirdWildlifeWorld, playerFeet: BirdWildlifePosition,
    forward: BirdWildlifePosition = { x: 0, y: 0, z: -1 }): BirdWildlifeSnapshot {
    this.clear();
    if (!finite(playerFeet)) return this.snapshot();
    const length = Math.hypot(forward.x, forward.z);
    if (Number.isFinite(length) && length > 0.001) this.forward = { x: forward.x / length, y: 0, z: forward.z / length };
    this.previousPlayer = { ...playerFeet };
    for (let id = 0; id < BIRD_FLOCK_COUNT; id += 1) {
      const flock: FlockRecord = {
        id, anchor: { ...playerFeet }, center: { ...playerFeet }, phase: id * 2.3,
        routePosition: { ...playerFeet }, routeVelocity: { x: 0, y: 0, z: 0 },
        routeTarget: { ...playerFeet }, routeStart: { ...playerFeet }, routeLeg: 0, routeSeconds: 0, routeRetrySeconds: 0,
        recycleCount: 0, heightProbeSeconds: 0, terrainHeight: 0,
        placementPlayer: { ...playerFeet }
      };
      this.flocks.push(flock);
      this.placeFlock(world, flock, playerFeet, false);
    }
    this.solos.seed(world, playerFeet, this.forward);
    return this.snapshot();
  }

  update(deltaSeconds: number, world: BirdWildlifeWorld, playerEye: BirdWildlifePosition): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !finite(playerEye)) return;
    const delta = Math.min(deltaSeconds, 0.1);
    this.elapsedSeconds += delta;
    if (this.previousPlayer) {
      const dx = playerEye.x - this.previousPlayer.x;
      const dz = playerEye.z - this.previousPlayer.z;
      const distance = Math.hypot(dx, dz);
      if (distance > delta * 0.2) this.forward = { x: dx / distance, y: 0, z: dz / distance };
    }
    this.previousPlayer = { ...playerEye };
    for (const flock of this.flocks) {
      // A terrain-adjusted flock can be far above a player beneath a roof.
      // Recycle only after actual player travel, rather than reseeding that
      // same stationary altitude mismatch on every frame.
      if (Math.hypot(flock.center.x - playerEye.x, flock.center.z - playerEye.z) > BIRD_RECYCLE_DISTANCE &&
        Math.hypot(flock.placementPlayer.x - playerEye.x, flock.placementPlayer.z - playerEye.z) > 32) {
        flock.recycleCount += 1;
        this.placeFlock(world, flock, playerEye, true);
      }
      flock.phase += delta * 0.6;
      this.advanceFlockRoute(flock, world, delta);
      flock.heightProbeSeconds -= delta;
      if (flock.heightProbeSeconds <= 0) {
        flock.heightProbeSeconds = 0.6;
        const target = this.flockTarget(flock);
        const top = world.isColumnLoaded(target.x, target.z) ? world.getColumnTopHeight(target.x, target.z) : null;
        flock.terrainHeight = top !== null && Number.isFinite(top) ? top + 3.5 : 0;
      }
      for (const bird of this.birds) {
        if (bird.flockId !== flock.id) continue;
        this.updateBird(bird, flock, world, delta);
      }
      this.updateFlockCenter(flock);
    }
    this.solos.update(delta, world, playerEye, this.forward);
  }

  clear(): void {
    this.birds = [];
    this.flocks = [];
    this.elapsedSeconds = 0;
    this.randomState = this.initialSeed;
    this.forward = { x: 0, y: 0, z: -1 };
    this.previousPlayer = null;
    this.solos.clear();
  }

  snapshot(): BirdWildlifeSnapshot {
    return {
      birds: [...this.birds.map<BirdWildlifePose>((bird) => ({
        role: "flock", state: "flying", perch: null, foldedWings: false,
        flightTarget: { ...this.flocks[bird.flockId].routeTarget }, habitatCenter: { ...this.flocks[bird.flockId].anchor },
        id: bird.id, flockId: bird.flockId, position: { ...bird.position }, velocity: { ...bird.velocity },
        yaw: bird.yaw, pitch: bird.pitch, bank: bird.bank, wingAngle: bird.wingAngle,
        flapping: bird.flapping, visible: bird.visible, opacity: bird.opacity
      })), ...this.solos.snapshot()],
      flocks: this.flocks.map((flock) => ({
        id: flock.id, center: { ...flock.center }, visible: this.birds.some((bird) => bird.flockId === flock.id && bird.visible),
        recycleCount: flock.recycleCount,
        flightTarget: { ...flock.routeTarget }, habitatCenter: { ...flock.anchor }
      })),
      elapsedSeconds: this.elapsedSeconds,
      populationCap: BIRD_POPULATION_CAP
    };
  }

  private placeFlock(world: BirdWildlifeWorld, flock: FlockRecord, player: BirdWildlifePosition, recycled: boolean): void {
    this.birds = this.birds.filter((bird) => bird.flockId !== flock.id);
    const direction = recycled && flock.id === 1 ? -1 : 1;
    const ahead = recycled ? 36 + flock.id * 4 : 13 + flock.id * 9;
    const side = recycled ? (flock.id === 0 ? 21 : -24) : (flock.id === 0 ? 3 : -9);
    const centerX = player.x + this.forward.x * ahead * direction + this.forward.z * side;
    const centerZ = player.z + this.forward.z * ahead * direction - this.forward.x * side;
    flock.phase = flock.id * 0.4;
    flock.anchor = {
      x: Math.floor(centerX / 16) * 16 + 8,
      y: BIRD_FLOCK_ALTITUDE + flock.id * 6,
      z: Math.floor(centerZ / 16) * 16 + 8
    };
    flock.routePosition = { x: centerX, y: flock.anchor.y, z: centerZ };
    flock.center = { ...flock.routePosition };
    flock.placementPlayer = { ...player };
    flock.heightProbeSeconds = 0;
    const top = world.isColumnLoaded(centerX, centerZ) ? world.getColumnTopHeight(centerX, centerZ) : null;
    if (top !== null && Number.isFinite(top)) flock.anchor.y = Math.max(flock.anchor.y, top + 4.5);
    flock.terrainHeight = 0;
    flock.routePosition.y = flock.anchor.y;
    flock.routeLeg = 0;
    flock.routeRetrySeconds = 0;
    flock.routeVelocity = { x: this.forward.x * 9.5, y: 0, z: this.forward.z * 9.5 };
    this.chooseFlockWaypoint(flock, world);
    const routeDistance = Math.max(0.001, Math.hypot(flock.routeTarget.x - centerX, flock.routeTarget.z - centerZ));
    flock.routeVelocity = { x: (flock.routeTarget.x - centerX) / routeDistance * 9.5, y: 0,
      z: (flock.routeTarget.z - centerZ) / routeDistance * 9.5 };
    for (let member = 0; member < BIRDS_PER_FLOCK; member += 1) {
      const target = this.memberTarget(flock, member);
      const position = this.findSafePosition(world, target);
      const yaw = Math.atan2(flock.routeVelocity.x, flock.routeVelocity.z);
      this.birds.push({
        id: flock.id * BIRDS_PER_FLOCK + member, flockId: flock.id, member,
        position: position ?? target, velocity: { x: Math.sin(yaw) * 9.5, y: 0, z: Math.cos(yaw) * 9.5 },
        yaw, pitch: 0, bank: 0, wingAngle: 0, flapping: true,
        visible: position !== null, opacity: recycled ? 0 : 1,
        recoverySeconds: 0.8 + this.random() * 0.5, stuckSeconds: 0
      });
    }
    this.updateFlockCenter(flock);
  }

  private updateBird(bird: BirdRecord, flock: FlockRecord, world: BirdWildlifeWorld, delta: number): void {
    if (bird.visible && !isBirdVolumeClear(world, bird.position)) {
      this.hideBird(bird);
      return;
    }
    if (!bird.visible) {
      bird.recoverySeconds -= delta;
      if (bird.recoverySeconds > 0) return;
      bird.recoverySeconds = 1;
      const candidate = this.findSafePosition(world, this.memberTarget(flock, bird.member));
      if (!candidate) return;
      bird.position = candidate;
      bird.velocity = { x: 0, y: 0, z: 0 };
      bird.visible = true;
      bird.opacity = 0;
    }
    bird.opacity = Math.min(1, bird.opacity + delta * 1.2);
    const target = this.memberTarget(flock, bird.member);
    const tangent = flock.routeVelocity;
    const desired = {
      x: tangent.x + (target.x - bird.position.x) * 0.9,
      y: (target.y - bird.position.y) * 1.1,
      z: tangent.z + (target.z - bird.position.z) * 0.9
    };
    // Only six flockmates participate; the hard population cap bounds this work.
    for (const other of this.birds) {
      if (other === bird || other.flockId !== bird.flockId || !other.visible) continue;
      const dx = bird.position.x - other.position.x;
      const dy = bird.position.y - other.position.y;
      const dz = bird.position.z - other.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > 0.001 && distance < 2.2) {
        const strength = (2.2 - distance) * 1.8 / distance;
        desired.x += dx * strength;
        desired.y += dy * strength;
        desired.z += dz * strength;
      }
    }
    const speed = Math.hypot(desired.x, desired.y, desired.z);
    if (speed > BIRD_MAX_SPEED) scale(desired, BIRD_MAX_SPEED / speed);
    const blend = 1 - Math.exp(-delta * 2.8);
    const velocity = {
      x: bird.velocity.x + (desired.x - bird.velocity.x) * blend,
      y: bird.velocity.y + (desired.y - bird.velocity.y) * blend,
      z: bird.velocity.z + (desired.z - bird.velocity.z) * blend
    };
    const safeVelocity = this.avoidTerrain(world, bird.position, velocity, delta);
    if (!safeVelocity) {
      bird.stuckSeconds += delta;
      if (bird.stuckSeconds > 0.6) this.hideBird(bird);
      return;
    }
    bird.stuckSeconds = 0;
    bird.velocity = safeVelocity;
    bird.position = plus(bird.position, safeVelocity, delta);
    const newYaw = Math.atan2(safeVelocity.x, safeVelocity.z);
    const turn = Math.atan2(Math.sin(newYaw - bird.yaw), Math.cos(newYaw - bird.yaw));
    bird.yaw += turn * Math.min(1, delta * 8);
    bird.bank += (clamp(-turn * 1.4, -0.45, 0.45) - bird.bank) * Math.min(1, delta * 5);
    const horizontalSpeed = Math.hypot(safeVelocity.x, safeVelocity.z);
    bird.pitch = clamp(-Math.atan2(safeVelocity.y, Math.max(0.2, horizontalSpeed)), -0.4, 0.4);
    const cycle = (this.elapsedSeconds + bird.id * 0.31) % 5.6;
    bird.flapping = cycle < 3.2 || safeVelocity.y > 0.7;
    bird.wingAngle = bird.flapping ? 0.18 + Math.sin(this.elapsedSeconds * 11 + bird.id * 1.8) * 0.72
      : 0.07 + Math.sin(this.elapsedSeconds * 2 + bird.id) * 0.035;
  }

  private avoidTerrain(world: BirdWildlifeWorld, position: BirdWildlifePosition,
    velocity: MutablePosition, delta: number): MutablePosition | null {
    const aheadSeconds = Math.min(0.6, 3.5 / Math.max(1, Math.hypot(velocity.x, velocity.y, velocity.z)));
    if (sweepBirdFlight(world, position, plus(position, velocity, aheadSeconds)) &&
      sweepBirdFlight(world, position, plus(position, velocity, delta))) return velocity;
    for (const [angle, rise] of [[0, 2.5], [0.65, 1], [-0.65, 1], [1.3, 0.4], [-1.3, 0.4], [Math.PI, 1]] as const) {
      const candidate = {
        x: velocity.x * Math.cos(angle) - velocity.z * Math.sin(angle),
        y: Math.max(velocity.y, rise),
        z: velocity.z * Math.cos(angle) + velocity.x * Math.sin(angle)
      };
      const speed = Math.hypot(candidate.x, candidate.y, candidate.z);
      if (speed > BIRD_MAX_SPEED) scale(candidate, BIRD_MAX_SPEED / speed);
      const candidateSeconds = Math.min(0.5, 3.5 / Math.max(1, Math.hypot(candidate.x, candidate.y, candidate.z)));
      if (sweepBirdFlight(world, position, plus(position, candidate, candidateSeconds)) &&
        sweepBirdFlight(world, position, plus(position, candidate, delta))) return candidate;
    }
    return null;
  }

  private findSafePosition(world: BirdWildlifeWorld, target: MutablePosition): MutablePosition | null {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const angle = attempt * Math.PI / 4;
      const radius = attempt === 0 ? 0 : 2;
      const x = target.x + Math.sin(angle) * radius;
      const z = target.z + Math.cos(angle) * radius;
      if (!world.isColumnLoaded(x, z)) continue;
      const top = world.getColumnTopHeight(x, z);
      const candidate = { x, y: Math.max(target.y, top !== null && Number.isFinite(top) ? top + 3 : 2), z };
      if (isBirdVolumeClear(world, candidate)) return candidate;
    }
    return null;
  }

  private advanceFlockRoute(flock: FlockRecord, world: BirdWildlifeWorld, delta: number): void {
    flock.routeRetrySeconds = Math.max(0, flock.routeRetrySeconds - delta);
    if (!isBirdVolumeClear(world, flock.routePosition)) {
      flock.routeVelocity = { x: 0, y: 0, z: 0 };
      if (flock.routeRetrySeconds > 0) return;
      flock.routeRetrySeconds = 0.75;
      this.recoverFlockRoute(flock, world);
      return;
    }
    flock.routeSeconds += delta;
    const dx = flock.routeTarget.x - flock.routePosition.x;
    const dz = flock.routeTarget.z - flock.routePosition.z;
    const passedGoal = dx * (flock.routeTarget.x - flock.routeStart.x) +
      dz * (flock.routeTarget.z - flock.routeStart.z) <= 0;
    if ((Math.hypot(dx, dz) < 4.5 || passedGoal || flock.routeSeconds > 7 ||
      !world.isColumnLoaded(flock.routeTarget.x, flock.routeTarget.z)) && flock.routeRetrySeconds === 0) this.chooseFlockWaypoint(flock, world);
    const targetX = flock.routeTarget.x - flock.routePosition.x;
    const targetZ = flock.routeTarget.z - flock.routePosition.z;
    const distance = Math.max(0.001, Math.hypot(targetX, targetZ));
    const blend = 1 - Math.exp(-delta * 3.4);
    const velocity = {
      x: flock.routeVelocity.x + (targetX / distance * 9.5 - flock.routeVelocity.x) * blend,
      y: 0,
      z: flock.routeVelocity.z + (targetZ / distance * 9.5 - flock.routeVelocity.z) * blend
    };
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.001) scale(velocity, 9.5 / speed);
    const next = plus(flock.routePosition, velocity, delta);
    if (!sweepBirdFlight(world, flock.routePosition, next)) {
      if (flock.routeRetrySeconds === 0) {
        this.chooseFlockWaypoint(flock, world);
        flock.routeRetrySeconds = 0.4;
      }
      flock.routeVelocity = { x: 0, y: 0, z: 0 };
      return;
    }
    flock.routePosition = next;
    flock.routeVelocity = velocity;
  }

  private recoverFlockRoute(flock: FlockRecord, world: BirdWildlifeWorld): void {
    // A lost column invalidates the invisible route leader too. Retry a few
    // fixed world points; visible flockmates retain continuous swept movement,
    // and hidden ones rejoin through their existing fade/recovery path.
    const placementHabitat = {
      x: Math.floor(flock.placementPlayer.x / 16) * 16 + 8,
      y: flock.anchor.y,
      z: Math.floor(flock.placementPlayer.z / 16) * 16 + 8
    };
    const bases = [flock.routeTarget, placementHabitat, flock.anchor];
    for (const base of bases) {
      for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const candidate = { x: base.x + dx, y: flock.anchor.y, z: base.z + dz };
        if ([[5, 0], [-5, 0], [0, 5], [0, -5]].some(([ox, oz]) => !world.isColumnLoaded(candidate.x + ox, candidate.z + oz))) continue;
        if (!isBirdVolumeClear(world, candidate)) continue;
        flock.routePosition = candidate;
        flock.anchor = {
          x: Math.floor(candidate.x / 16) * 16 + 8, y: flock.anchor.y,
          z: Math.floor(candidate.z / 16) * 16 + 8
        };
        this.chooseFlockWaypoint(flock, world);
        return;
      }
    }
  }

  private chooseFlockWaypoint(flock: FlockRecord, world: BirdWildlifeWorld): void {
    flock.routeLeg += 1;
    flock.routeSeconds = 0;
    flock.routeStart = { ...flock.routePosition };
    let fallback: MutablePosition | null = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const salt = this.initialSeed + flock.id * 137 + flock.routeLeg * 977 + attempt * 71;
      const x = flock.anchor.x + (routeNoise(flock.anchor, salt) - 0.5) * 56;
      const z = flock.anchor.z + (routeNoise(flock.anchor, salt + 37) - 0.5) * 56;
      const distance = Math.hypot(x - flock.routePosition.x, z - flock.routePosition.z);
      if (distance < 18 || distance > 54 || !world.isColumnLoaded(x, z)) continue;
      if ([[5, 0], [-5, 0], [0, 5], [0, -5]].some(([dx, dz]) => !world.isColumnLoaded(x + dx, z + dz))) continue;
      const target = { x, y: flock.anchor.y, z };
      if (!isBirdVolumeClear(world, target)) continue;
      fallback = target;
      const speed = Math.hypot(flock.routeVelocity.x, flock.routeVelocity.z);
      const alignment = speed > 0.1 ? ((x - flock.routePosition.x) * flock.routeVelocity.x +
        (z - flock.routePosition.z) * flock.routeVelocity.z) / distance / speed : 1;
      if (alignment > -0.6 || attempt >= 10) {
        flock.routeTarget = target;
        return;
      }
    }
    flock.routeTarget = fallback ?? { ...flock.anchor };
  }

  private flockTarget(flock: FlockRecord): MutablePosition {
    return {
      x: flock.routePosition.x,
      y: Math.max(flock.anchor.y + Math.sin(flock.phase * 1.7) * 1.1, flock.terrainHeight),
      z: flock.routePosition.z
    };
  }

  private memberTarget(flock: FlockRecord, member: number): MutablePosition {
    const center = this.flockTarget(flock);
    const rank = Math.floor(member / 2) + 0.5;
    const side = member % 2 === 0 ? -1 : 1;
    const lateral = rank * side * 1.65;
    const trailing = rank * 1.3;
    const yaw = Math.hypot(flock.routeVelocity.x, flock.routeVelocity.z) > 0.1
      ? Math.atan2(flock.routeVelocity.x, flock.routeVelocity.z)
      : Math.atan2(flock.routeTarget.x - center.x, flock.routeTarget.z - center.z);
    return {
      x: center.x + Math.cos(yaw) * lateral - Math.sin(yaw) * trailing,
      y: center.y + Math.sin(member * 1.9 + flock.phase) * 0.45,
      z: center.z - Math.sin(yaw) * lateral - Math.cos(yaw) * trailing
    };
  }

  private updateFlockCenter(flock: FlockRecord): void {
    const members = this.birds.filter((bird) => bird.flockId === flock.id && bird.visible);
    if (members.length === 0) return;
    flock.center = { x: 0, y: 0, z: 0 };
    for (const bird of members) {
      flock.center.x += bird.position.x / members.length;
      flock.center.y += bird.position.y / members.length;
      flock.center.z += bird.position.z / members.length;
    }
  }

  private hideBird(bird: BirdRecord): void {
    bird.visible = false;
    bird.opacity = 0;
    bird.recoverySeconds = 0.8;
    bird.stuckSeconds = 0;
  }

  private random(): number {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4294967296;
  }
}

function plus(position: BirdWildlifePosition, velocity: BirdWildlifePosition, seconds: number): MutablePosition {
  return { x: position.x + velocity.x * seconds, y: position.y + velocity.y * seconds, z: position.z + velocity.z * seconds };
}

function finite(position: BirdWildlifePosition): boolean {
  return [position.x, position.y, position.z].every(Number.isFinite);
}

function scale(vector: MutablePosition, factor: number): void {
  vector.x *= factor;
  vector.y *= factor;
  vector.z *= factor;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function routeNoise(home: MutablePosition, salt: number): number {
  let value = Math.imul(Math.floor(home.x), 73856093) ^ Math.imul(Math.floor(home.z), 19349663) ^ Math.imul(salt, 83492791);
  value ^= value >>> 16;
  value = Math.imul(value, 2246822519);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}
