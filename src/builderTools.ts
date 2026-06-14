import { BLOCK, type BlockId } from "./blocks";

export const BUILDER_MODE_TOGGLE_KEY = "KeyG";
export const BUILDER_BRUSH_MIN_SIZE = 1;
export const BUILDER_BRUSH_MAX_SIZE = 7;
export const BUILDER_BRUSH_STEP = 2;

export type BuilderLane = "items" | "blocks";

export type BuilderBrushCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type BuilderBrushFaceNormal = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type BuilderBrushWorld = {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, block: number): void;
};

export type BuilderBrushOptions = {
  readonly world: BuilderBrushWorld;
  readonly center: BuilderBrushCell;
  readonly size: number;
  readonly block: BlockId;
  readonly shouldSkipCell?: (cell: BuilderBrushCell) => boolean;
  readonly onChangedCell?: (cell: BuilderBrushCell) => void;
};

export function normalizeBuilderBrushSize(value: unknown, fallback = BUILDER_BRUSH_MIN_SIZE): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  const rawSize = Number.isFinite(numericValue) ? numericValue : fallback;
  const steppedSize = Math.round((rawSize - BUILDER_BRUSH_MIN_SIZE) / BUILDER_BRUSH_STEP) *
    BUILDER_BRUSH_STEP + BUILDER_BRUSH_MIN_SIZE;
  const clampedSize = Math.min(BUILDER_BRUSH_MAX_SIZE, Math.max(BUILDER_BRUSH_MIN_SIZE, steppedSize));

  // Builder brushes are centered on a voxel. Odd dimensions keep the target
  // cell stable instead of letting even-sized brushes wobble around the cursor.
  return clampedSize % 2 === 0
    ? Math.max(BUILDER_BRUSH_MIN_SIZE, clampedSize - 1)
    : clampedSize;
}

export function formatBuilderBrushSize(size: number): string {
  const normalizedSize = normalizeBuilderBrushSize(size);
  return `${normalizedSize}x${normalizedSize}x${normalizedSize}`;
}

export function collectBuilderBrushCells(center: BuilderBrushCell, size: number): BuilderBrushCell[] {
  const normalizedSize = normalizeBuilderBrushSize(size);
  const radius = Math.floor(normalizedSize / 2);
  const cells: BuilderBrushCell[] = [];
  const origin = {
    x: Math.floor(center.x),
    y: Math.floor(center.y),
    z: Math.floor(center.z)
  };

  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let z = origin.z - radius; z <= origin.z + radius; z += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        cells.push({ x, y, z });
      }
    }
  }

  return cells;
}

export function getBuilderBrushCenterForTarget(
  target: BuilderBrushCell,
  normal: BuilderBrushFaceNormal,
  operation: "place" | "erase"
): BuilderBrushCell {
  if (operation === "erase") {
    return {
      x: Math.floor(target.x),
      y: Math.floor(target.y),
      z: Math.floor(target.z)
    };
  }

  return {
    x: Math.floor(target.x + normal.x),
    y: Math.floor(target.y + normal.y),
    z: Math.floor(target.z + normal.z)
  };
}

export function applyBuilderBrush(options: BuilderBrushOptions): number {
  const block = options.block;
  let changedCells = 0;

  for (const cell of collectBuilderBrushCells(options.center, options.size)) {
    if (options.shouldSkipCell?.(cell)) continue;
    if (options.world.getBlock(cell.x, cell.y, cell.z) === block) continue;

    options.world.setBlock(cell.x, cell.y, cell.z, block);
    options.onChangedCell?.(cell);
    changedCells += 1;
  }

  return changedCells;
}

export function eraseBuilderBrush(options: Omit<BuilderBrushOptions, "block">): number {
  return applyBuilderBrush({
    ...options,
    block: BLOCK.air
  });
}
