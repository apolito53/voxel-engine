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
  readonly distanceSq: number;
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
  radiusMeters: number,
  maxSources: number
): readonly LocalLightSelection[] {
  const budget = Math.max(0, Math.floor(maxSources));
  if (budget <= 0 || radiusMeters <= 0) return [];

  const radiusSq = radiusMeters * radiusMeters;
  const selections: LocalLightSelection[] = [];
  for (const source of sources) {
    const centerX = source.x + 0.5;
    const centerY = source.y + 0.5;
    const centerZ = source.z + 0.5;
    const dx = centerX - origin.x;
    const dy = centerY - origin.y;
    const dz = centerZ - origin.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > radiusSq) continue;
    selections.push({ ...source, distanceSq });
  }

  // This is intentionally nearest-first, not insertion-order. Streaming can
  // load chunks in worker-completion order, but local light budget should always
  // favor what the player can actually see and stand near.
  selections.sort((a, b) => a.distanceSq - b.distanceSq);
  return selections.slice(0, budget);
}
