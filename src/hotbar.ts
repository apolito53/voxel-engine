import type { BlockId } from "./blocks";
import {
  EMPTY_HANDS_ITEM_ID,
  PHYSICS_CORE_ITEM_ID,
  createBlockItemId,
  createItemStack,
  getItemAction,
  getItemDefinition,
  getItemLabel,
  type ItemAction,
  type ItemCategory,
  type ItemRegistry,
  type ItemStack
} from "./items";

export type HotbarItem = ItemStack;

export type HotbarScrollDirection = -1 | 1;

export function createHotbarItems(placeableBlocks: readonly BlockId[]): readonly HotbarItem[] {
  // The hotbar stores stacks, not behavior. Item definitions decide what a
  // primary or secondary click means, which keeps this selection lane reusable
  // when the engine grows actual tools, weapons, or game-specific commands.
  return [
    createItemStack(EMPTY_HANDS_ITEM_ID),
    ...placeableBlocks.map((block) => createItemStack(createBlockItemId(block))),
    createItemStack(PHYSICS_CORE_ITEM_ID)
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

export function getHotbarIndexFromDigitCode(code: string): number | null {
  if (!/^Digit[1-9]$/.test(code)) return null;

  return Number(code.slice(-1)) - 1;
}

export function getHotbarItemLabel(item: HotbarItem, registry: ItemRegistry): string {
  return getItemLabel(registry, item);
}

export function getHotbarItemCategory(item: HotbarItem, registry: ItemRegistry): ItemCategory {
  return getItemDefinition(registry, item).category;
}

export function getHotbarPrimaryAction(item: HotbarItem, registry: ItemRegistry): ItemAction {
  return getItemAction(registry, item, "primary");
}

export function getHotbarSecondaryAction(item: HotbarItem, registry: ItemRegistry): ItemAction {
  return getItemAction(registry, item, "secondary");
}

export function canDestroyBlockWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarPrimaryAction(item, registry).kind === "terrain:destroy-block";
}

export function canPlaceBlockWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarSecondaryAction(item, registry).kind === "terrain:place-block";
}

export function canThrowCoreWithHotbarItem(item: HotbarItem, registry: ItemRegistry): boolean {
  return getHotbarPrimaryAction(item, registry).kind === "physics:throw-core";
}
