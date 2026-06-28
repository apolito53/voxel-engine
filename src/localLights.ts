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
  readonly lightX?: number;
  readonly lightY?: number;
  readonly lightZ?: number;
  readonly sourceKey?: string;
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

export function selectNearestLocalLightSources(
  sources: Iterable<LocalLightSource>,
  origin: Pick<LocalLightSource, "x" | "y" | "z">,
  radiusMeters: number
): readonly LocalLightSelection[] {
  if (radiusMeters <= 0) return [];

  const radiusSq = radiusMeters * radiusMeters;
  const selections: LocalLightSelection[] = [];
  const seenSourceKeys = new Set<string>();
  for (const source of sources) {
    const sourceKey = createLocalLightSourceKey(source);
    if (seenSourceKeys.has(sourceKey)) continue;
    seenSourceKeys.add(sourceKey);

    const centerX = getLocalLightSourceX(source);
    const centerY = getLocalLightSourceY(source);
    const centerZ = getLocalLightSourceZ(source);
    const distanceSq = getDistanceSq(centerX, centerY, centerZ, origin);
    if (distanceSq > radiusSq) continue;

    selections.push({
      ...source,
      centerX,
      centerY,
      centerZ,
      distanceSq,
      sourceCount: 1,
      intensityScale: 1,
      distanceScale: 1
    });
  }

  // Lamps are emitted as surface sources now, not cluster centers. Sorting
  // nearest-first keeps the renderer deterministic while avoiding a hidden
  // "nearest N lights" cap; everything inside the radius is returned.
  selections.sort((a, b) => a.distanceSq - b.distanceSq || createLocalLightSourceKey(a).localeCompare(createLocalLightSourceKey(b)));
  return selections;
}

function createLocalLightSourceKey(source: LocalLightSource): string {
  return source.sourceKey ?? `${source.block}:${source.x},${source.y},${source.z}`;
}

function getLocalLightSourceX(source: LocalLightSource): number {
  return source.lightX ?? source.x + 0.5;
}

function getLocalLightSourceY(source: LocalLightSource): number {
  return source.lightY ?? source.y + 0.5;
}

function getLocalLightSourceZ(source: LocalLightSource): number {
  return source.lightZ ?? source.z + 0.5;
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
