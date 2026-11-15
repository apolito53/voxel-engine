import {
  BIRD_CLEARANCE_RADIUS,
  type BirdWildlifePosition,
  type BirdWildlifeWorld
} from "./birdWildlifeCollision";
import { WORLD_HEIGHT } from "./voxelConstants";
import { SOLO_BIRD_COUNT, SoloBirdSimulation } from "./birdSolo";

export type { BirdTreePerch, BirdWildlifePosition, BirdWildlifeWorld } from "./birdWildlifeCollision";
export { SOLO_BIRD_ACCELERATION, SOLO_BIRD_COUNT, SOLO_BIRD_CRUISE_SPEED, SOLO_BIRD_MAX_SPEED, SOLO_BIRD_PERCH_BODY_HEIGHT } from "./birdSolo";
export const BIRD_FLOCK_COUNT = 2;
export const BIRDS_PER_FLOCK = 6;
export const BIRD_POPULATION_CAP = BIRD_FLOCK_COUNT * BIRDS_PER_FLOCK + SOLO_BIRD_COUNT;
export const BIRD_MAX_SPEED = 24;
export const BIRD_CRUISE_SPEED = 19;
export const BIRD_ACCELERATION = 6;
export const BIRD_SKY_RENDER_SCALE = 1.65;
// Sky formations never query terrain. Their complete enlarged wing envelope
// stays above the tallest possible authored voxel, independently of streaming.
export const BIRD_FLOCK_ALTITUDE = Math.max(132, WORLD_HEIGHT + BIRD_CLEARANCE_RADIUS * BIRD_SKY_RENDER_SCALE + 2);
export const BIRD_PASS_FADE_START = 300;
export const BIRD_PASS_FADE_END = 380;
export const BIRD_PASS_ENTRY_DISTANCE = 420;
export const BIRD_PASS_INITIAL_STAGGER = 22;
export const BIRD_PASS_TELEPORT_DISTANCE = 96;

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
export type BirdWildlifePassSnapshot = {
  readonly state: "waiting" | "flying";
  readonly start: BirdWildlifePosition;
  readonly closestPoint: BirdWildlifePosition;
  readonly end: BirdWildlifePosition;
  readonly direction: BirdWildlifePosition;
  readonly distanceTravelled: number;
  readonly length: number;
  readonly secondsUntilNext: number;
  readonly index: number;
};
export type BirdWildlifeFlockSnapshot = {
  readonly id: number;
  readonly center: BirdWildlifePosition;
  readonly visible: boolean;
  readonly recycleCount: number;
  readonly flightTarget: BirdWildlifePosition;
  readonly habitatCenter: BirdWildlifePosition;
  readonly pass: BirdWildlifePassSnapshot;
};
export type BirdWildlifeSnapshot = {
  readonly birds: readonly BirdWildlifePose[];
  readonly flocks: readonly BirdWildlifeFlockSnapshot[];
  readonly elapsedSeconds: number;
  readonly populationCap: number;
};

type Position = { x: number; y: number; z: number };
type FlockPass = {
  readonly id: number;
  state: BirdWildlifePassSnapshot["state"];
  start: Position;
  closestPoint: Position;
  end: Position;
  direction: Position;
  distanceTravelled: number;
  length: number;
  speed: number;
  waitSeconds: number;
  index: number;
  hasFlown: boolean;
};

/** High formations cross clear sky on latched lines; solo birds own local terrain flight. */
export class BirdWildlifeSimulation {
  private readonly initialSeed: number;
  private flocks: FlockPass[] = [];
  private elapsedSeconds = 0;
  private seedForward = { x: 0, y: 0, z: -1 };
  private travelForward = { x: 0, y: 0, z: -1 };
  private previousPlayer: Position | null = null;
  private observer = { x: 0, y: 0, z: 0 };
  private readonly solos = new SoloBirdSimulation();

  constructor(seed = 631) {
    this.initialSeed = seed | 0 || 631;
  }

  seed(world: BirdWildlifeWorld, playerFeet: BirdWildlifePosition,
    forward: BirdWildlifePosition = { x: 0, y: 0, z: -1 }): BirdWildlifeSnapshot {
    this.clear();
    if (!finite(playerFeet)) return this.snapshot();
    const length = Math.hypot(forward.x, forward.z);
    if (Number.isFinite(length) && length > 0.001) this.seedForward = { x: forward.x / length, y: 0, z: forward.z / length };
    this.travelForward = { ...this.seedForward };
    this.previousPlayer = { ...playerFeet };
    this.observer = { ...playerFeet };
    for (let id = 0; id < BIRD_FLOCK_COUNT; id += 1) {
      const flock: FlockPass = {
        id, state: id === 0 ? "flying" : "waiting", start: { ...playerFeet }, closestPoint: { ...playerFeet },
        end: { ...playerFeet }, direction: { x: 0, y: 0, z: 1 }, distanceTravelled: 0,
        length: BIRD_PASS_ENTRY_DISTANCE * 2, speed: 0, waitSeconds: id * BIRD_PASS_INITIAL_STAGGER,
        index: 0, hasFlown: id === 0
      };
      this.configurePass(flock, playerFeet);
      flock.waitSeconds = id * BIRD_PASS_INITIAL_STAGGER;
      this.flocks.push(flock);
    }
    this.solos.seed(world, playerFeet, this.seedForward);
    return this.snapshot();
  }

  update(deltaSeconds: number, world: BirdWildlifeWorld, playerEye: BirdWildlifePosition): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !finite(playerEye)) return;
    const delta = Math.min(deltaSeconds, 0.1);
    this.elapsedSeconds += delta;
    let teleported = false;
    if (this.previousPlayer) {
      const dx = playerEye.x - this.previousPlayer.x;
      const dy = playerEye.y - this.previousPlayer.y;
      const dz = playerEye.z - this.previousPlayer.z;
      const horizontalDistance = Math.hypot(dx, dz);
      if (horizontalDistance > delta * 0.2) this.travelForward = { x: dx / horizontalDistance, y: 0, z: dz / horizontalDistance };
      teleported = Math.hypot(dx, dy, dz) > BIRD_PASS_TELEPORT_DISTANCE;
    }
    this.previousPlayer = { ...playerEye };
    this.observer = { ...playerEye };
    for (const flock of this.flocks) {
      // A camera jump never retargets a still-visible formation. Only an
      // already invisible pass can be replaced outside the new observer's view.
      if (teleported && !this.flockVisible(flock)) {
        flock.state = "waiting";
        flock.speed = 0;
        flock.waitSeconds = 1 + flock.id * BIRD_PASS_INITIAL_STAGGER;
      }
      if (flock.state === "waiting") {
        flock.waitSeconds = Math.max(0, flock.waitSeconds - delta);
        if (flock.waitSeconds > 0) continue;
        if (flock.hasFlown) flock.index += 1;
        flock.hasFlown = true;
        this.configurePass(flock, playerEye);
        flock.state = "flying";
      }
      flock.speed = Math.min(BIRD_CRUISE_SPEED, flock.speed + BIRD_ACCELERATION * delta);
      flock.distanceTravelled += flock.speed * delta;
      // Continue beyond the nominal endpoint if someone follows the birds.
      // They retire only after every member has genuinely faded out.
      if (flock.distanceTravelled >= flock.length && !this.flockVisible(flock)) {
        flock.state = "waiting";
        flock.speed = 0;
        flock.waitSeconds = 14 + flock.id * 8 + this.passNoise(flock, 83) * 8;
      }
    }
    this.solos.update(delta, world, playerEye, this.travelForward);
  }

  clear(): void {
    this.flocks = [];
    this.elapsedSeconds = 0;
    this.seedForward = { x: 0, y: 0, z: -1 };
    this.travelForward = { x: 0, y: 0, z: -1 };
    this.previousPlayer = null;
    this.observer = { x: 0, y: 0, z: 0 };
    this.solos.clear();
  }

  snapshot(): BirdWildlifeSnapshot {
    const birds: BirdWildlifePose[] = [];
    for (const flock of this.flocks) {
      for (let member = 0; member < BIRDS_PER_FLOCK; member += 1) birds.push(this.memberPose(flock, member));
    }
    return {
      birds: [...birds, ...this.solos.snapshot()],
      flocks: this.flocks.map((flock) => ({
        id: flock.id, center: this.passPosition(flock), visible: this.flockVisible(flock),
        recycleCount: flock.index, flightTarget: { ...flock.end }, habitatCenter: { ...flock.closestPoint },
        pass: {
          state: flock.state, start: { ...flock.start }, closestPoint: { ...flock.closestPoint },
          end: { ...flock.end }, direction: { ...flock.direction }, distanceTravelled: flock.distanceTravelled,
          length: flock.length, secondsUntilNext: flock.waitSeconds, index: flock.index
        }
      })),
      elapsedSeconds: this.elapsedSeconds,
      populationCap: BIRD_POPULATION_CAP
    };
  }

  private configurePass(flock: FlockPass, observer: BirdWildlifePosition): void {
    const initialBearing = Math.atan2(this.seedForward.x, this.seedForward.z);
    const bearing = initialBearing + (flock.index === 0 ? -flock.id * 0.35 : (this.passNoise(flock, 17) - 0.5) * Math.PI * 2);
    const towardStart = { x: Math.sin(bearing), z: Math.cos(bearing) };
    const side = flock.index === 0 ? (flock.id === 0 ? -26 : 34) : (this.passNoise(flock, 29) - 0.5) * 70;
    const halfLength = flock.index === 0 ? BIRD_PASS_ENTRY_DISTANCE : 380 + this.passNoise(flock, 47) * 40;
    flock.closestPoint = {
      x: observer.x + towardStart.z * side,
      y: BIRD_FLOCK_ALTITUDE + flock.id * 6,
      z: observer.z - towardStart.x * side
    };
    flock.start = {
      x: flock.closestPoint.x + towardStart.x * halfLength, y: flock.closestPoint.y,
      z: flock.closestPoint.z + towardStart.z * halfLength
    };
    flock.end = {
      x: flock.closestPoint.x - towardStart.x * halfLength, y: flock.closestPoint.y,
      z: flock.closestPoint.z - towardStart.z * halfLength
    };
    flock.direction = { x: -towardStart.x, y: 0, z: -towardStart.z };
    flock.length = halfLength * 2;
    flock.distanceTravelled = 0;
    flock.speed = 0;
    flock.waitSeconds = 0;
  }

  private passPosition(flock: FlockPass): Position {
    return {
      x: flock.start.x + flock.direction.x * flock.distanceTravelled,
      y: flock.start.y,
      z: flock.start.z + flock.direction.z * flock.distanceTravelled
    };
  }

  private memberPosition(flock: FlockPass, member: number): Position {
    const center = this.passPosition(flock);
    const rank = Math.floor(member / 2) + 0.5;
    const side = member % 2 === 0 ? -1 : 1;
    const lateral = rank * side * 1.65 * BIRD_SKY_RENDER_SCALE;
    const trailing = rank * 1.3 * BIRD_SKY_RENDER_SCALE;
    return {
      x: center.x + flock.direction.z * lateral - flock.direction.x * trailing,
      y: center.y + Math.sin(member * 1.9 + flock.id) * 0.35,
      z: center.z - flock.direction.x * lateral - flock.direction.z * trailing
    };
  }

  private memberOpacity(flock: FlockPass, position: BirdWildlifePosition): number {
    if (flock.state !== "flying") return 0;
    const distance = Math.hypot(position.x - this.observer.x, position.y - this.observer.y, position.z - this.observer.z);
    const fade = Math.max(0, Math.min(1, (distance - BIRD_PASS_FADE_START) / (BIRD_PASS_FADE_END - BIRD_PASS_FADE_START)));
    return 1 - fade * fade * (3 - 2 * fade);
  }

  private flockVisible(flock: FlockPass): boolean {
    if (flock.state !== "flying") return false;
    for (let member = 0; member < BIRDS_PER_FLOCK; member += 1) {
      if (this.memberOpacity(flock, this.memberPosition(flock, member)) > 0) return true;
    }
    return false;
  }

  private memberPose(flock: FlockPass, member: number): BirdWildlifePose {
    const id = flock.id * BIRDS_PER_FLOCK + member;
    const position = this.memberPosition(flock, member);
    const opacity = this.memberOpacity(flock, position);
    const phase = this.elapsedSeconds + id * 0.31;
    const flapping = phase % 5.6 < 3.2;
    return {
      id, flockId: flock.id, role: "flock", state: "flying", perch: null, foldedWings: false,
      flightTarget: { ...flock.end }, habitatCenter: { ...flock.closestPoint }, position,
      velocity: flock.state === "flying"
        ? { x: flock.direction.x * flock.speed, y: 0, z: flock.direction.z * flock.speed } : { x: 0, y: 0, z: 0 },
      yaw: Math.atan2(flock.direction.x, flock.direction.z), pitch: 0,
      bank: Math.sin(phase * 1.2) * 0.035,
      wingAngle: flapping ? 0.18 + Math.sin(this.elapsedSeconds * 11 + id * 1.8) * 0.72
        : 0.07 + Math.sin(this.elapsedSeconds * 2 + id) * 0.035,
      flapping, visible: opacity > 0, opacity
    };
  }

  private passNoise(flock: FlockPass, salt: number): number {
    let value = this.initialSeed ^ Math.imul(flock.id + 1, 73856093) ^ Math.imul(flock.index + 1, 19349663) ^ Math.imul(salt, 83492791);
    value ^= value >>> 16;
    value = Math.imul(value, 2246822519);
    value ^= value >>> 13;
    return (value >>> 0) / 4294967296;
  }
}

function finite(position: BirdWildlifePosition): boolean {
  return [position.x, position.y, position.z].every(Number.isFinite);
}
