import type { BlockDefinition, BlockId } from "./blocks";

export type HotbarBlockItem = {
  readonly kind: "block";
  readonly block: BlockId;
};

export type HotbarUnarmedItem = {
  readonly kind: "unarmed";
};

export type HotbarPhysicsCoreItem = {
  readonly kind: "physics-core";
};

export type HotbarItem = HotbarUnarmedItem | HotbarBlockItem | HotbarPhysicsCoreItem;

export type HotbarScrollDirection = -1 | 1;

export function createHotbarItems(placeableBlocks: readonly BlockId[]): readonly HotbarItem[] {
  // The physics core lives in the same selection lane as placeable blocks, so
  // right click can become "use selected" instead of a pile of special keys.
  return [
    { kind: "unarmed" },
    ...placeableBlocks.map((block): HotbarBlockItem => ({ kind: "block", block })),
    { kind: "physics-core" }
  ];
}

export function getHotbarScrollDirection(deltaY: number): HotbarScrollDirection | null {
  if (deltaY > 0) return 1;
  if (deltaY < 0) return -1;
  return null;
}

export function stepHotbarIndex(
  currentIndex: number,
  direction: HotbarScrollDirection,
  itemCount: number
): number {
  if (itemCount <= 0) return 0;

  return normalizeHotbarIndex(currentIndex + direction, itemCount);
}

export function normalizeHotbarIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;

  // JavaScript's remainder keeps the sign, so normalize twice to make scroll-up
  // from slot zero wrap to the last item instead of producing -1.
  return ((Math.trunc(index) % itemCount) + itemCount) % itemCount;
}

export function getHotbarItemLabel(
  item: HotbarItem,
  blocks: Readonly<Record<number, BlockDefinition>>
): string {
  if (item.kind === "block") return blocks[item.block]?.name ?? "Block";
  if (item.kind === "physics-core") return "Physics Core";
  return "Unarmed";
}

export function canBreakBlockWithHotbarItem(item: HotbarItem): boolean {
  // Tools can plug into this predicate later. For now, unarmed is the only
  // intentional terrain-breaking state; holding a block/core means left click
  // should not silently demolish whatever the crosshair touches.
  return item.kind === "unarmed";
}
