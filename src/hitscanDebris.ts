import * as THREE from "three";

type VectorLike = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type HitscanDebrisTarget = {
  readonly isInstancedFragment: boolean;
  readonly isExpired: boolean;
  readonly radius: number;
  readonly mesh: {
    readonly position: VectorLike;
  };
};

export const HITSCAN_DEBRIS_CLEAR_RADIUS = 0.18;

export function collectHitscanDebrisTargets<T extends HitscanDebrisTarget>(
  toys: readonly T[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  beamRadius = HITSCAN_DEBRIS_CLEAR_RADIUS
): T[] {
  const touched: T[] = [];
  for (const toy of toys) {
    if (!toy.isInstancedFragment || toy.isExpired) continue;
    if (doesHitscanBeamTouchDebris(start, end, toy.mesh.position, toy.radius, beamRadius)) {
      touched.push(toy);
    }
  }
  return touched;
}

export function doesHitscanBeamTouchDebris(
  start: THREE.Vector3,
  end: THREE.Vector3,
  position: VectorLike,
  debrisRadius: number,
  beamRadius = HITSCAN_DEBRIS_CLEAR_RADIUS
): boolean {
  const radius = Math.max(0, debrisRadius) + Math.max(0, beamRadius);
  return getPointSegmentDistanceSq(start, end, position) <= radius * radius;
}

function getPointSegmentDistanceSq(start: THREE.Vector3, end: THREE.Vector3, point: VectorLike): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentZ = end.z - start.z;
  const segmentLengthSq = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  if (segmentLengthSq <= 0.000001) {
    return (
      (point.x - start.x) ** 2 +
      (point.y - start.y) ** 2 +
      (point.z - start.z) ** 2
    );
  }

  const t = Math.max(0, Math.min(1, (
    (point.x - start.x) * segmentX +
    (point.y - start.y) * segmentY +
    (point.z - start.z) * segmentZ
  ) / segmentLengthSq));

  const closestX = start.x + segmentX * t;
  const closestY = start.y + segmentY * t;
  const closestZ = start.z + segmentZ * t;
  return (
    (point.x - closestX) ** 2 +
    (point.y - closestY) ** 2 +
    (point.z - closestZ) ** 2
  );
}
