export type RigidDebrisAdmissionVector = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type RigidDebrisAdmissionFragment = {
  readonly position: RigidDebrisAdmissionVector;
  readonly velocity: RigidDebrisAdmissionVector;
  readonly materialUnits: number;
  readonly halfExtents?: RigidDebrisAdmissionVector;
};

export type RigidDebrisAdmissionContext = {
  readonly cameraPosition: RigidDebrisAdmissionVector;
  readonly burstCenter: RigidDebrisAdmissionVector;
  readonly activeRadiusMeters: number;
  readonly supportHeightFor?: (fragment: RigidDebrisAdmissionFragment) => number | null;
  readonly corePositions?: readonly RigidDebrisAdmissionVector[];
};

export type RigidDebrisAdmissionPartition<T> = {
  readonly admitted: readonly T[];
  readonly denied: readonly T[];
};

type ScoredAdmissionFragment = {
  readonly index: number;
  readonly octantKey: string;
  readonly score: number;
};

const ADMISSION_SPEED_REFERENCE_MPS = 16;
const ADMISSION_SUPPORT_LOOKAHEAD_METERS = 1.5;
const ADMISSION_CORE_INTERACTION_METERS = 3.5;

export function selectRigidDebrisAdmissionIndices(
  fragments: readonly RigidDebrisAdmissionFragment[],
  availableSlots: number,
  context: RigidDebrisAdmissionContext
): ReadonlySet<number> {
  const safeSlots = Math.max(0, Math.floor(availableSlots));
  if (safeSlots <= 0 || fragments.length === 0) return new Set();
  if (safeSlots >= fragments.length) {
    return new Set(fragments.map((_, index) => index));
  }

  const maxMaterialUnits = fragments.reduce(
    (maxUnits, fragment) => Math.max(maxUnits, Math.max(0, fragment.materialUnits)),
    0
  );
  const scored = fragments
    .map((fragment, index) => ({
      index,
      octantKey: getAdmissionOctantKey(fragment.position, context.burstCenter),
      score: scoreRigidDebrisAdmissionFragment(fragment, context, maxMaterialUnits)
    }))
    .sort(compareScoredAdmissionFragments);

  // First pass takes the best shard from each burst octant. That keeps the
  // admitted rigid bodies distributed through the visible spray instead of
  // spending every Rapier slot on one dense corner of the fractured block.
  const selected = new Set<number>();
  const usedOctants = new Set<string>();
  for (const candidate of scored) {
    if (selected.size >= safeSlots) return selected;
    if (usedOctants.has(candidate.octantKey)) continue;

    selected.add(candidate.index);
    usedOctants.add(candidate.octantKey);
  }

  for (const candidate of scored) {
    if (selected.size >= safeSlots) break;
    selected.add(candidate.index);
  }

  return selected;
}

export function partitionRigidDebrisAdmission<T>(
  fragments: readonly T[],
  selectedIndices: ReadonlySet<number>
): RigidDebrisAdmissionPartition<T> {
  const admitted: T[] = [];
  const denied: T[] = [];

  fragments.forEach((fragment, index) => {
    if (selectedIndices.has(index)) {
      admitted.push(fragment);
    } else {
      denied.push(fragment);
    }
  });

  return { admitted, denied };
}

export function scoreRigidDebrisAdmissionFragment(
  fragment: RigidDebrisAdmissionFragment,
  context: RigidDebrisAdmissionContext,
  maxMaterialUnits = Math.max(0, fragment.materialUnits)
): number {
  const cameraDistance = distanceBetween(fragment.position, context.cameraPosition);
  const activeRadius = Math.max(1, context.activeRadiusMeters);
  const nearPlayerScore = clamp01(1 - cameraDistance / activeRadius) * 3;
  const speedScore = clamp01(vectorLength(fragment.velocity) / ADMISSION_SPEED_REFERENCE_MPS) * 2;
  const downwardScore = fragment.velocity.y < -0.5 ? 1 : 0;
  const supportScore = getSupportAdmissionScore(fragment, context);
  const coreScore = getCoreInteractionScore(fragment, context.corePositions ?? []);
  const materialScore = maxMaterialUnits > 0
    ? clamp01(Math.max(0, fragment.materialUnits) / maxMaterialUnits) * 0.8
    : 0;

  return nearPlayerScore + speedScore + downwardScore + supportScore + coreScore + materialScore;
}

function compareScoredAdmissionFragments(left: ScoredAdmissionFragment, right: ScoredAdmissionFragment): number {
  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) > 0.000001) return scoreDelta;
  return left.index - right.index;
}

function getSupportAdmissionScore(
  fragment: RigidDebrisAdmissionFragment,
  context: RigidDebrisAdmissionContext
): number {
  if (!context.supportHeightFor) return 0;

  const supportHeight = context.supportHeightFor(fragment);
  if (supportHeight === null || !Number.isFinite(supportHeight)) return 0;

  const halfY = fragment.halfExtents?.y ?? 0;
  const clearance = fragment.position.y - halfY - supportHeight;
  if (clearance < -0.1 || clearance > ADMISSION_SUPPORT_LOOKAHEAD_METERS) return 0;

  return (1 - clearance / ADMISSION_SUPPORT_LOOKAHEAD_METERS) * 1.2;
}

function getCoreInteractionScore(
  fragment: RigidDebrisAdmissionFragment,
  corePositions: readonly RigidDebrisAdmissionVector[]
): number {
  for (const corePosition of corePositions) {
    if (distanceSqBetween(fragment.position, corePosition) <= ADMISSION_CORE_INTERACTION_METERS ** 2) {
      return 1.4;
    }
  }
  return 0;
}

function getAdmissionOctantKey(
  position: RigidDebrisAdmissionVector,
  center: RigidDebrisAdmissionVector
): string {
  return [
    position.x >= center.x ? "x+" : "x-",
    position.y >= center.y ? "y+" : "y-",
    position.z >= center.z ? "z+" : "z-"
  ].join("/");
}

function distanceBetween(left: RigidDebrisAdmissionVector, right: RigidDebrisAdmissionVector): number {
  return Math.sqrt(distanceSqBetween(left, right));
}

function distanceSqBetween(left: RigidDebrisAdmissionVector, right: RigidDebrisAdmissionVector): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
}

function vectorLength(vector: RigidDebrisAdmissionVector): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
