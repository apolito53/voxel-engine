import {
  isBirdLandingVolumeClear,
  isBirdPerchSupported,
  isBirdVolumeClear,
  SOLO_BIRD_PERCH_BODY_HEIGHT,
  sweepBirdFlight,
  sweepBirdLanding,
  type BirdTreePerch,
  type BirdWildlifePosition,
  type BirdWildlifeWorld
} from "./birdWildlifeCollision";
import type { BirdWildlifePose } from "./birdWildlife";

export { SOLO_BIRD_PERCH_BODY_HEIGHT } from "./birdWildlifeCollision";
export const SOLO_BIRD_COUNT = 3;
export const SOLO_BIRD_MAX_SPEED = 15;
const PERCH_QUERY_BUDGET = 24;
const PERCH_SEARCH_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const offsets: [number, number][] = [];
  for (let radius = 0; radius <= 20; radius += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(z)) === radius) offsets.push([x, z]);
      }
    }
  }
  return offsets;
})();
type Position = { x: number; y: number; z: number };
type SoloRecord = {
  readonly id: number;
  readonly member: number;
  position: Position;
  velocity: Position;
  home: Position;
  placementPlayer: Position;
  altitude: number;
  terrainAltitude: number;
  phase: number;
  yaw: number;
  pitch: number;
  bank: number;
  state: BirdWildlifePose["state"];
  perch: BirdTreePerch | null;
  folded: boolean;
  landingFinal: boolean;
  takeoffTarget: Position | null;
  visible: boolean;
  opacity: number;
  recoverySeconds: number;
  searchSeconds: number;
  searchCursor: number;
  perchCooldown: number;
  restSeconds: number;
  altitudeProbeSeconds: number;
};

/** Three independent canopy birds; all perch discovery stays local and budgeted. */
export class SoloBirdSimulation {
  private birds: SoloRecord[] = [];
  private elapsedSeconds = 0;

  seed(world: BirdWildlifeWorld, player: BirdWildlifePosition, forward: BirdWildlifePosition): void {
    this.clear();
    for (let member = 0; member < SOLO_BIRD_COUNT; member += 1) {
      const bird: SoloRecord = {
        id: 12 + member, member, position: { ...player }, velocity: { x: 0, y: 0, z: 0 },
        home: { ...player }, placementPlayer: { ...player }, altitude: 0, terrainAltitude: 0, phase: 0,
        yaw: 0, pitch: 0, bank: 0, state: "flying", perch: null, folded: false, landingFinal: false,
        takeoffTarget: null, visible: false, opacity: 1, recoverySeconds: 1,
        searchSeconds: 0.7 + member * 0.3, searchCursor: member * 211, perchCooldown: 0,
        restSeconds: 0, altitudeProbeSeconds: 0
      };
      this.place(world, bird, player, forward, false);
      this.birds.push(bird);
    }
  }

  update(delta: number, world: BirdWildlifeWorld, player: BirdWildlifePosition, forward: BirdWildlifePosition): void {
    this.elapsedSeconds += delta;
    for (const bird of this.birds) {
      if (Math.hypot(bird.position.x - player.x, bird.position.z - player.z) > 58 &&
        Math.hypot(bird.placementPlayer.x - player.x, bird.placementPlayer.z - player.z) > 20) {
        this.place(world, bird, player, forward, true);
      }
      bird.perchCooldown = Math.max(0, bird.perchCooldown - delta);
      if (!bird.visible) {
        bird.recoverySeconds -= delta;
        if (bird.recoverySeconds > 0) continue;
        bird.recoverySeconds = 1;
        const position = this.safeFlightPosition(world, this.flightTarget(bird));
        if (!position) continue;
        bird.position = position;
        bird.visible = true;
        bird.opacity = 0;
        bird.state = "flying";
        bird.folded = false;
        bird.perch = null;
        bird.perchCooldown = 2;
      }
      const clear = bird.folded ? isBirdLandingVolumeClear(world, bird.position, bird.yaw)
        : isBirdVolumeClear(world, bird.position);
      if (!clear) {
        this.hide(bird);
        continue;
      }
      bird.opacity = Math.min(1, bird.opacity + delta * 1.2);
      if (bird.state === "perched") {
        bird.restSeconds -= delta;
        if (!bird.perch || !isBirdPerchSupported(world, bird.perch, bird.yaw) || bird.restSeconds <= 0) this.takeOff(bird);
        continue;
      }
      if (bird.state === "landing") {
        this.land(bird, world, delta);
        continue;
      }
      if (bird.state === "taking-off") {
        this.lift(bird, world, delta);
        continue;
      }
      this.fly(bird, world, delta);
      bird.searchSeconds -= delta;
      if (bird.visible && bird.perchCooldown === 0 && bird.searchSeconds <= 0) {
        bird.searchSeconds = 1.2;
        const perch = this.findPerch(bird, world);
        if (perch) {
          bird.perch = perch;
          bird.state = "landing";
          bird.landingFinal = false;
          bird.yaw = Math.atan2(perch.x - bird.position.x, perch.z - bird.position.z);
          bird.pitch = 0;
          bird.bank = 0;
        }
      }
    }
  }

  clear(): void {
    this.birds = [];
    this.elapsedSeconds = 0;
  }

  snapshot(): BirdWildlifePose[] {
    return this.birds.map((bird) => {
      const flapping = !bird.folded && bird.state !== "perched" &&
        (bird.state === "taking-off" || (this.elapsedSeconds + bird.id) % 4 < 3);
      return {
        id: bird.id, flockId: -1, role: "solo", state: bird.state, foldedWings: bird.folded,
        perch: bird.perch ? { ...bird.perch } : null,
        position: { ...bird.position }, velocity: { ...bird.velocity },
        yaw: bird.yaw, pitch: bird.pitch, bank: bird.bank, visible: bird.visible, opacity: bird.opacity,
        flapping,
        wingAngle: bird.folded ? 0 : flapping ? 0.15 + Math.sin(this.elapsedSeconds * 17 + bird.id) * 0.7
          : 0.07 + Math.sin(this.elapsedSeconds * 2 + bird.id) * 0.025
      };
    });
  }

  private place(world: BirdWildlifeWorld, bird: SoloRecord, player: BirdWildlifePosition,
    forward: BirdWildlifePosition, recycled: boolean): void {
    bird.home = { ...player };
    bird.placementPlayer = { ...player };
    bird.phase = Math.atan2(forward.x, forward.z) + bird.member * 2.1;
    const target = this.flightTarget(bird);
    const top = world.isColumnLoaded(target.x, target.z) ? world.getColumnTopHeight(target.x, target.z) : null;
    bird.altitude = top !== null && Number.isFinite(top) ? top + 3.3 + bird.member * 0.5 : Math.max(4, player.y + 3);
    bird.terrainAltitude = 0;
    target.y = bird.altitude;
    const position = this.safeFlightPosition(world, target);
    bird.position = position ?? target;
    bird.velocity = { x: Math.cos(bird.phase) * 11, y: 0, z: -Math.sin(bird.phase) * 11 };
    bird.yaw = Math.atan2(bird.velocity.x, bird.velocity.z);
    bird.state = "flying";
    bird.perch = null;
    bird.folded = false;
    bird.landingFinal = false;
    bird.takeoffTarget = null;
    bird.visible = position !== null;
    bird.opacity = recycled ? 0 : 1;
    bird.recoverySeconds = 1;
    bird.altitudeProbeSeconds = 0;
    bird.searchSeconds = 0.7 + bird.member * 0.3;
    bird.perchCooldown = 0;
  }

  private fly(bird: SoloRecord, world: BirdWildlifeWorld, delta: number): void {
    bird.phase += delta * 11 / (14 + bird.member * 2);
    const target = this.flightTarget(bird);
    bird.altitudeProbeSeconds -= delta;
    if (bird.altitudeProbeSeconds <= 0) {
      bird.altitudeProbeSeconds = 0.6;
      if (world.isColumnLoaded(target.x, target.z)) {
        const top = world.getColumnTopHeight(target.x, target.z);
        bird.terrainAltitude = top !== null && Number.isFinite(top) ? top + 2.5 : 0;
      }
    }
    target.y = Math.max(target.y, bird.terrainAltitude);
    const desired = {
      x: Math.cos(bird.phase) * 11 + (target.x - bird.position.x) * 0.8,
      y: (target.y - bird.position.y) * 1.7,
      z: -Math.sin(bird.phase) * 11 + (target.z - bird.position.z) * 0.8
    };
    limit(desired, SOLO_BIRD_MAX_SPEED);
    const blend = 1 - Math.exp(-delta * 4);
    const velocity = {
      x: bird.velocity.x + (desired.x - bird.velocity.x) * blend,
      y: bird.velocity.y + (desired.y - bird.velocity.y) * blend,
      z: bird.velocity.z + (desired.z - bird.velocity.z) * blend
    };
    const safe = this.avoid(world, bird.position, velocity, delta);
    if (!safe) {
      this.hide(bird);
      return;
    }
    bird.position = plus(bird.position, safe, delta);
    bird.velocity = safe;
    const yaw = Math.atan2(safe.x, safe.z);
    const turn = Math.atan2(Math.sin(yaw - bird.yaw), Math.cos(yaw - bird.yaw));
    bird.yaw += turn * Math.min(1, delta * 10);
    bird.bank += (Math.max(-0.55, Math.min(0.55, -turn * 1.5)) - bird.bank) * Math.min(1, delta * 6);
    bird.pitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(safe.y, Math.max(0.2, Math.hypot(safe.x, safe.z)))));
  }

  private findPerch(bird: SoloRecord, world: BirdWildlifeWorld): BirdTreePerch | null {
    if (!world.getTreePerch) return null;
    let best: BirdTreePerch | null = null;
    let distance = Infinity;
    for (let query = 0; query < PERCH_QUERY_BUDGET; query += 1) {
      let x: number;
      let z: number;
      if (query < PERCH_QUERY_BUDGET / 2) {
        // Sample the upcoming actual orbit as well as the home neighborhood;
        // birds pass trees at radii 14–18m outside the original entry square.
        const radius = Math.max(1, Math.hypot(bird.position.x - bird.home.x, bird.position.z - bird.home.z));
        const phase = Math.atan2(bird.position.x - bird.home.x, bird.position.z - bird.home.z);
        const ahead = query * 1.2 / (PERCH_QUERY_BUDGET / 2 - 1);
        const predictedPhase = phase + ahead * Math.hypot(bird.velocity.x, bird.velocity.z) / radius;
        x = Math.floor(bird.home.x + Math.sin(predictedPhase) * radius) + 0.5;
        z = Math.floor(bird.home.z + Math.cos(predictedPhase) * radius) + 0.5;
      } else {
        const [dx, dz] = PERCH_SEARCH_OFFSETS[bird.searchCursor++ % PERCH_SEARCH_OFFSETS.length];
        x = Math.floor(bird.home.x) + dx + 0.5;
        z = Math.floor(bird.home.z) + dz + 0.5;
      }
      if (!world.isColumnLoaded(x, z)) continue;
      const perch = world.getTreePerch(x, z);
      if (!perch || ![perch.x, perch.y, perch.z].every(Number.isFinite)) continue;
      const candidateDistance = Math.hypot(perch.x - bird.position.x, perch.y - bird.position.y, perch.z - bird.position.z);
      if (candidateDistance > 40 || candidateDistance >= distance || this.birds.some((other) =>
        other !== bird && other.perch && Math.hypot(other.perch.x - perch.x, other.perch.z - perch.z) < 1.5)) continue;
      const position = { x: perch.x, y: perch.y + SOLO_BIRD_PERCH_BODY_HEIGHT, z: perch.z };
      const yaw = Math.atan2(perch.x - bird.position.x, perch.z - bird.position.z);
      if (!isBirdPerchSupported(world, perch, yaw) || !isBirdLandingVolumeClear(world, position, yaw)) continue;
      best = { ...perch };
      distance = candidateDistance;
    }
    return best;
  }

  private land(bird: SoloRecord, world: BirdWildlifeWorld, delta: number): void {
    const perch = bird.perch;
    if (!perch || !isBirdPerchSupported(world, perch, bird.yaw)) {
      this.takeOff(bird);
      return;
    }
    const target = { x: perch.x, y: perch.y + (bird.landingFinal ? SOLO_BIRD_PERCH_BODY_HEIGHT : 2.4), z: perch.z };
    const distance = Math.hypot(target.x - bird.position.x, target.y - bird.position.y, target.z - bird.position.z);
    const speed = bird.landingFinal ? 2.4 : 9;
    const fraction = distance > 0 ? Math.min(1, speed * delta / distance) : 1;
    const next = {
      x: bird.position.x + (target.x - bird.position.x) * fraction,
      y: bird.position.y + (target.y - bird.position.y) * fraction,
      z: bird.position.z + (target.z - bird.position.z) * fraction
    };
    const clear = bird.folded ? sweepBirdLanding(world, bird.position, next, bird.yaw) : sweepBirdFlight(world, bird.position, next);
    if (!clear) {
      this.takeOff(bird);
      return;
    }
    bird.velocity = { x: (next.x - bird.position.x) / delta, y: (next.y - bird.position.y) / delta, z: (next.z - bird.position.z) / delta };
    bird.position = next;
    if (fraction < 1) return;
    if (!bird.landingFinal) {
      bird.landingFinal = true;
      bird.folded = true;
      return;
    }
    bird.state = "perched";
    bird.velocity = { x: 0, y: 0, z: 0 };
    bird.restSeconds = 4.5 + bird.member;
    bird.pitch = 0;
    bird.bank = 0;
  }

  private takeOff(bird: SoloRecord): void {
    bird.state = "taking-off";
    bird.takeoffTarget = { x: bird.position.x, y: bird.position.y + 2.2, z: bird.position.z };
    bird.perchCooldown = 8;
    bird.pitch = 0;
    bird.bank = 0;
  }

  private lift(bird: SoloRecord, world: BirdWildlifeWorld, delta: number): void {
    const target = bird.takeoffTarget;
    if (!target) {
      this.hide(bird);
      return;
    }
    if (bird.folded && isBirdVolumeClear(world, bird.position)) bird.folded = false;
    const next = { ...bird.position, y: Math.min(target.y, bird.position.y + delta * 4.5) };
    const clear = bird.folded ? sweepBirdLanding(world, bird.position, next, bird.yaw) : sweepBirdFlight(world, bird.position, next);
    if (!clear) {
      this.hide(bird);
      return;
    }
    bird.velocity = { x: 0, y: (next.y - bird.position.y) / delta, z: 0 };
    bird.position = next;
    if (next.y < target.y) return;
    if (!isBirdVolumeClear(world, next)) {
      // A side wall may allow the folded lift but still cover open wings.
      // Continue a bounded folded climb instead of exposing one clipped frame.
      const surface = bird.perch?.y ?? target.y - 2.2;
      if (target.y - surface < 8) {
        target.y += 1;
        bird.folded = true;
      } else {
        this.hide(bird);
      }
      return;
    }
    bird.state = "flying";
    bird.folded = false;
    bird.perch = null;
    bird.takeoffTarget = null;
    bird.velocity = { x: Math.sin(bird.yaw) * 9, y: 2, z: Math.cos(bird.yaw) * 9 };
  }

  private avoid(world: BirdWildlifeWorld, position: Position, velocity: Position, delta: number): Position | null {
    for (const [angle, rise] of [[0, 0], [0, 5], [0.8, 2], [-0.8, 2], [1.6, 1], [-1.6, 1], [Math.PI, 3]] as const) {
      const candidate = {
        x: velocity.x * Math.cos(angle) - velocity.z * Math.sin(angle),
        y: rise === 0 ? velocity.y : Math.max(velocity.y, rise),
        z: velocity.z * Math.cos(angle) + velocity.x * Math.sin(angle)
      };
      limit(candidate, SOLO_BIRD_MAX_SPEED);
      const ahead = Math.min(0.4, 3.5 / Math.max(1, Math.hypot(candidate.x, candidate.y, candidate.z)));
      if (sweepBirdFlight(world, position, plus(position, candidate, ahead)) &&
        sweepBirdFlight(world, position, plus(position, candidate, delta))) return candidate;
    }
    return null;
  }

  private safeFlightPosition(world: BirdWildlifeWorld, target: Position): Position | null {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const angle = attempt * Math.PI / 4;
      const radius = attempt === 0 ? 0 : 2;
      const x = target.x + Math.sin(angle) * radius;
      const z = target.z + Math.cos(angle) * radius;
      if (!world.isColumnLoaded(x, z)) continue;
      const top = world.getColumnTopHeight(x, z);
      const position = { x, y: Math.max(target.y, top !== null && Number.isFinite(top) ? top + 2.4 : 2), z };
      if (isBirdVolumeClear(world, position)) return position;
    }
    return null;
  }

  private flightTarget(bird: SoloRecord): Position {
    const radius = 14 + bird.member * 2;
    return {
      x: bird.home.x + Math.sin(bird.phase) * radius,
      y: bird.altitude + Math.sin(bird.phase * 1.7) * 1.1,
      z: bird.home.z + Math.cos(bird.phase) * radius
    };
  }

  private hide(bird: SoloRecord): void {
    bird.visible = false;
    bird.opacity = 0;
    bird.recoverySeconds = 0.8;
    bird.state = "flying";
    bird.perch = null;
    bird.folded = false;
    bird.takeoffTarget = null;
  }
}

function plus(position: BirdWildlifePosition, velocity: BirdWildlifePosition, seconds: number): Position {
  return { x: position.x + velocity.x * seconds, y: position.y + velocity.y * seconds, z: position.z + velocity.z * seconds };
}

function limit(vector: Position, maximum: number): void {
  const speed = Math.hypot(vector.x, vector.y, vector.z);
  if (speed <= maximum) return;
  const factor = maximum / speed;
  vector.x *= factor;
  vector.y *= factor;
  vector.z *= factor;
}
