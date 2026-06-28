import { BLOCK, type BlockId } from "./blocks";

export type LocalLightDefinition = {
  readonly block: BlockId;
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
};

export type LocalLightSource = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: BlockId;
};

export type LocalLightSelection = LocalLightSource & {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly distanceSq: number;
  readonly sourceCount: number;
  readonly intensityScale: number;
  readonly distanceScale: number;
};

export const LAMP_LIGHT_DEFINITION: LocalLightDefinition = {
  block: BLOCK.lamp,
  color: 0xffb45f,
  intensity: 2.25,
  distance: 12,
  decay: 1.75
};

export const LOCAL_LIGHT_DEFINITIONS: ReadonlyMap<BlockId, LocalLightDefinition> = new Map([
  [BLOCK.lamp, LAMP_LIGHT_DEFINITION]
]);

export function isLocalLightBlock(block: number): block is BlockId {
  return LOCAL_LIGHT_DEFINITIONS.has(block as BlockId);
}

export function getLocalLightDefinition(block: number): LocalLightDefinition | null {
  return LOCAL_LIGHT_DEFINITIONS.get(block as BlockId) ?? null;
}

const LOCAL_LIGHT_CLUSTER_NEIGHBORS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
] as const;

const LOCAL_LIGHT_CLUSTER_MAX_INTENSITY_SCALE = 1.85;
const LOCAL_LIGHT_CLUSTER_MAX_DISTANCE_SCALE = 1.35;

export function selectNearestLocalLightSources(
  sources: Iterable<LocalLightSource>,
  origin: Pick<LocalLightSource, "x" | "y" | "z">,
  radiusMeters: number,
  maxSources: number
): readonly LocalLightSelection[] {
  const budget = Math.max(0, Math.floor(maxSources));
  if (budget <= 0 || radiusMeters <= 0) return [];

  const radiusSq = radiusMeters * radiusMeters;
  const selections: LocalLightSelection[] = [];
  const sourceMap = new Map<string, LocalLightSource>();
  for (const source of sources) {
    sourceMap.set(createLocalLightSourceKey(source), source);
  }

  const visited = new Set<string>();
  for (const [sourceKey, source] of sourceMap) {
    if (visited.has(sourceKey)) continue;

    const cluster = collectLocalLightCluster(source, sourceMap, visited, origin);
    if (cluster.nearestDistanceSq > radiusSq) continue;

    const scale = getLocalLightClusterScale(cluster.sourceCount);
    selections.push({
      ...cluster.representative,
      centerX: cluster.centerX,
      centerY: cluster.centerY,
      centerZ: cluster.centerZ,
      distanceSq: cluster.centerDistanceSq,
      sourceCount: cluster.sourceCount,
      intensityScale: scale.intensityScale,
      distanceScale: scale.distanceScale
    });
  }

  // Budgets are spent on connected lamp clusters instead of individual lamp
  // blocks. That keeps large player-built fixtures stable as the camera moves
  // instead of making nearby lamp voxels flicker in and out of the light pool.
  selections.sort((a, b) => a.distanceSq - b.distanceSq || b.sourceCount - a.sourceCount);
  return selections.slice(0, budget);
}

type LocalLightCluster = {
  readonly representative: LocalLightSource;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly centerDistanceSq: number;
  readonly nearestDistanceSq: number;
  readonly sourceCount: number;
};

function collectLocalLightCluster(
  firstSource: LocalLightSource,
  sourceMap: ReadonlyMap<string, LocalLightSource>,
  visited: Set<string>,
  origin: Pick<LocalLightSource, "x" | "y" | "z">
): LocalLightCluster {
  const queue: LocalLightSource[] = [firstSource];
  visited.add(createLocalLightSourceKey(firstSource));

  let representative = firstSource;
  let sourceCount = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  while (queue.length > 0) {
    const source = queue.pop();
    if (!source) continue;

    sourceCount += 1;
    const centerX = source.x + 0.5;
    const centerY = source.y + 0.5;
    const centerZ = source.z + 0.5;
    sumX += centerX;
    sumY += centerY;
    sumZ += centerZ;

    const memberDistanceSq = getDistanceSq(centerX, centerY, centerZ, origin);
    if (memberDistanceSq < nearestDistanceSq) {
      nearestDistanceSq = memberDistanceSq;
      representative = source;
    }

    for (const [dx, dy, dz] of LOCAL_LIGHT_CLUSTER_NEIGHBORS) {
      const neighborKey = createLocalLightSourceKey({
        x: source.x + dx,
        y: source.y + dy,
        z: source.z + dz,
        block: source.block
      });
      if (visited.has(neighborKey)) continue;

      const neighbor = sourceMap.get(neighborKey);
      if (!neighbor) continue;
      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  const centerX = sumX / sourceCount;
  const centerY = sumY / sourceCount;
  const centerZ = sumZ / sourceCount;
  return {
    representative,
    centerX,
    centerY,
    centerZ,
    centerDistanceSq: getDistanceSq(centerX, centerY, centerZ, origin),
    nearestDistanceSq,
    sourceCount
  };
}

function getLocalLightClusterScale(sourceCount: number): {
  readonly intensityScale: number;
  readonly distanceScale: number;
} {
  if (sourceCount <= 1) {
    return { intensityScale: 1, distanceScale: 1 };
  }

  // A block-built lamp should read a little stronger than one lamp voxel, but
  // the cap prevents dense fixtures from becoming a surprise orange sun.
  const logarithmicSize = Math.log2(sourceCount + 1);
  return {
    intensityScale: Math.min(LOCAL_LIGHT_CLUSTER_MAX_INTENSITY_SCALE, 1 + logarithmicSize * 0.18),
    distanceScale: Math.min(LOCAL_LIGHT_CLUSTER_MAX_DISTANCE_SCALE, 1 + logarithmicSize * 0.06)
  };
}

function createLocalLightSourceKey(source: LocalLightSource): string {
  return `${source.block}:${source.x},${source.y},${source.z}`;
}

function getDistanceSq(
  x: number,
  y: number,
  z: number,
  origin: Pick<LocalLightSource, "x" | "y" | "z">
): number {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const dz = z - origin.z;
  return dx * dx + dy * dy + dz * dz;
}
