import type { BlockId } from "./blocks";
import {
  EMPTY_HANDS_ITEM_ID,
  HITSCAN_CORE_ITEM_ID,
  MINING_TOOL_ITEM_ID,
  PHYSICS_CORE_ITEM_ID,
  createBlockItemId,
  getItemAction,
  getItemDefinition,
  getItemLabel,
  type ItemAction,
  type ItemCategory,
  type ItemId,
  type ItemRegistry
} from "./items";

export type HotbarItem = {
  readonly itemId: ItemId;
  // Creative catalog entries are unlimited and deliberately carry null instead
  // of pretending to be a finite stack of one. Numeric quantities remain
  // available for future finite hotbar/equipment sources.
  readonly quantity: number | null;
};

export type HotbarScrollDirection = -1 | 1;

export function createToolHotbarItems(): readonly HotbarItem[] {
  return [
    createCreativeHotbarItem(EMPTY_HANDS_ITEM_ID),
    createCreativeHotbarItem(MINING_TOOL_ITEM_ID),
    createCreativeHotbarItem(PHYSICS_CORE_ITEM_ID),
    createCreativeHotbarItem(HITSCAN_CORE_ITEM_ID)
  ];
}

export function createBlockHotbarItems(placeableBlocks: readonly BlockId[]): readonly HotbarItem[] {
  return placeableBlocks.map((block) => createCreativeHotbarItem(createBlockItemId(block)));
}

export function createHotbarItems(placeableBlocks: readonly BlockId[]): readonly HotbarItem[] {
  // The hotbar stores stable item ids, not behavior or registry positions. Item
  // definitions decide what a click means, while quantity distinguishes future
  // finite equipment from the current unlimited creative catalog.
  return [
    ...createToolHotbarItems(),
    ...createBlockHotbarItems(placeableBlocks)
  ];
}

export function createCreativeHotbarItem(itemId: ItemId): HotbarItem {
  return { itemId, quantity: null };
}

export function getHotbarItemIndexById(items: readonly HotbarItem[], itemId: ItemId): number {
  return items.findIndex((item) => item.itemId === itemId);
}

export function getHotbarItemById(
  items: readonly HotbarItem[],
  itemId: ItemId
): HotbarItem | null {
  const index = getHotbarItemIndexById(items, itemId);
  return index >= 0 ? items[index] ?? null : null;
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

export function getHotbarIndexFromDigitCode(code: string): number | null {
  if (!/^Digit[1-9]$/.test(code)) return null;

  return Number(code.slice(-1)) - 1;
}

export function getHotbarItemLabel(item: HotbarItem, registry: ItemRegistry): string {
  return getItemLabel(registry, item.itemId);
}

export function getHotbarItemCategory(item: HotbarItem, registry: ItemRegistry): ItemCategory {
  return getItemDefinition(registry, item.itemId).category;
}

export function getHotbarPrimaryAction(item: HotbarItem, registry: ItemRegistry): ItemAction {
  return getItemAction(registry, item.itemId, "primary");
}

export function getHotbarSecondaryAction(item: HotbarItem, registry: ItemRegistry): ItemAction {
  return getItemAction(registry, item.itemId, "secondary");
}

export function canMineBlockWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarPrimaryAction(item, registry).kind === "terrain:mine-block";
}

export function canPlaceBlockWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarSecondaryAction(item, registry).kind === "terrain:place-block";
}

export function canThrowCoreWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarPrimaryAction(item, registry).kind === "physics:throw-core";
}

export function canFireHitscanCoreWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarPrimaryAction(item, registry).kind === "physics:fire-hitscan-core";
}
