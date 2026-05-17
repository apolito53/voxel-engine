import type { CollisionWorld } from "./collision";

type VectorLike = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type DebrisCleanupWorld = Pick<CollisionWorld, "isSolid"> & {
  readonly isPartialBlock?: (x: number, y: number, z: number) => boolean;
};

export type DebrisCleanupToy = {
  readonly isInstancedFragment: boolean;
  readonly isExpired: boolean;
  readonly radius: number;
  readonly velocity: VectorLike;
  readonly angularVelocity: VectorLike;
  readonly mesh: {
    readonly position: VectorLike;
  };
  readonly age: number;
};

type DebrisCleanupState = {
  readonly lastPosition: { x: number; y: number; z: number };
  stillSeconds: number;
};

export const STUCK_DEBRIS_GRACE_SECONDS = 0.45;
export const STUCK_DEBRIS_REQUIRED_STILL_SECONDS = 0.32;
export const STUCK_DEBRIS_LINEAR_SPEED = 0.16;
export const STUCK_DEBRIS_ANGULAR_SPEED = 0.9;
export const STUCK_DEBRIS_MOVEMENT_EPSILON = 0.025;
export const STUCK_DEBRIS_MIN_SAMPLE_DISTANCE = 0.16;

const STUCK_DEBRIS_ENCLOSED_SAMPLE_COUNT = 4;

export class DebrisStuckCleanupTracker {
  private readonly states = new WeakMap<DebrisCleanupToy, DebrisCleanupState>();

  shouldExpire(toy: DebrisCleanupToy, delta: number, world: DebrisCleanupWorld): boolean {
    if (!toy.isInstancedFragment || toy.isExpired || toy.age < STUCK_DEBRIS_GRACE_SECONDS) {
      this.states.delete(toy);
      return false;
    }

    const state = this.getState(toy);
    const movedSq = getDistanceSq(toy.mesh.position, state.lastPosition);
    const isQuiet =
      getLengthSq(toy.velocity) <= STUCK_DEBRIS_LINEAR_SPEED ** 2 &&
      getLengthSq(toy.angularVelocity) <= STUCK_DEBRIS_ANGULAR_SPEED ** 2 &&
      movedSq <= STUCK_DEBRIS_MOVEMENT_EPSILON ** 2;
    const isTrapped = isDebrisTrappedForCleanup(world, toy.mesh.position, toy.radius);

    state.lastPosition.x = toy.mesh.position.x;
    state.lastPosition.y = toy.mesh.position.y;
    state.lastPosition.z = toy.mesh.position.z;

    if (!isQuiet || !isTrapped) {
      state.stillSeconds = 0;
      return false;
    }

    state.stillSeconds += Math.max(0, delta);
    return state.stillSeconds >= STUCK_DEBRIS_REQUIRED_STILL_SECONDS;
  }

  private getState(toy: DebrisCleanupToy): DebrisCleanupState {
    const existingState = this.states.get(toy);
    if (existingState) return existingState;

    const state: DebrisCleanupState = {
      lastPosition: {
        x: toy.mesh.position.x,
        y: toy.mesh.position.y,
        z: toy.mesh.position.z
      },
      stillSeconds: 0
    };
    this.states.set(toy, state);
    return state;
  }
}

export function isDebrisTrappedForCleanup(
  world: DebrisCleanupWorld,
  position: VectorLike,
  radius: number
): boolean {
  if (isBlockingDebrisCleanupSample(world, position)) return true;

  const sampleDistance = Math.max(STUCK_DEBRIS_MIN_SAMPLE_DISTANCE, radius * 1.7);
  let blockingSamples = 0;
  for (const offset of DEBRIS_TRAP_SAMPLE_OFFSETS) {
    const sample = {
      x: position.x + offset.x * sampleDistance,
      y: position.y + offset.y * sampleDistance,
      z: position.z + offset.z * sampleDistance
    };
    if (isBlockingDebrisCleanupSample(world, sample)) blockingSamples += 1;
  }

  return blockingSamples >= STUCK_DEBRIS_ENCLOSED_SAMPLE_COUNT;
}

function isBlockingDebrisCleanupSample(world: DebrisCleanupWorld, position: VectorLike): boolean {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  const z = Math.floor(position.z);
  return world.isSolid(x, y, z) || Boolean(world.isPartialBlock?.(x, y, z));
}

function getLengthSq(vector: VectorLike): number {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
}

function getDistanceSq(left: VectorLike, right: VectorLike): number {
  return (
    (left.x - right.x) ** 2 +
    (left.y - right.y) ** 2 +
    (left.z - right.z) ** 2
  );
}

const DEBRIS_TRAP_SAMPLE_OFFSETS: readonly VectorLike[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];
