import type { BlockDefinition, BlockId } from "./blocks";

export const EMPTY_HANDS_ITEM_ID = "core:empty-hands";
export const MINING_TOOL_ITEM_ID = "tool:mining-tool";
export const PHYSICS_CORE_ITEM_ID = "tool:physics-core";
export const HITSCAN_CORE_ITEM_ID = "tool:hitscan-core";

export type ItemId = string;

export type ItemCategory =
  | "empty-hands"
  | "block"
  | "tool"
  | "weapon"
  | "resource"
  | "consumable";

export type ItemUseButton = "primary" | "secondary";

export type NoItemAction = {
  readonly kind: "none";
};

export type MineBlockItemAction = {
  readonly kind: "terrain:mine-block";
};

export type EraseBlockItemAction = {
  readonly kind: "terrain:erase-block";
};

export type PlaceBlockItemAction = {
  readonly kind: "terrain:place-block";
  readonly block: BlockId;
};

export type ThrowPhysicsCoreItemAction = {
  readonly kind: "physics:throw-core";
};

export type FireHitscanCoreItemAction = {
  readonly kind: "physics:fire-hitscan-core";
};

export type ItemAction =
  | NoItemAction
  | MineBlockItemAction
  | EraseBlockItemAction
  | PlaceBlockItemAction
  | ThrowPhysicsCoreItemAction
  | FireHitscanCoreItemAction;

export type ItemDefinition = {
  readonly id: ItemId;
  readonly name: string;
  readonly category: ItemCategory;
  readonly maxStack: number;
  readonly tags: readonly string[];
  readonly actions: Readonly<Record<ItemUseButton, ItemAction>>;
};

export type ItemStack = {
  readonly itemId: ItemId;
  readonly quantity: number;
};

export type ItemRegistry = ReadonlyMap<ItemId, ItemDefinition>;

export const NO_ITEM_ACTION: NoItemAction = { kind: "none" };

export function createItemRegistry(definitions: readonly ItemDefinition[]): ItemRegistry {
  const registry = new Map<ItemId, ItemDefinition>();

  for (const definition of definitions) {
    if (registry.has(definition.id)) {
      throw new Error(`Duplicate item id registered: ${definition.id}`);
    }

    registry.set(definition.id, definition);
  }

  return registry;
}

export function createItemStack(itemId: ItemId, quantity = 1): ItemStack {
  return {
    itemId,
    quantity: Math.max(1, Math.trunc(quantity))
  };
}

export function createBlockItemId(block: BlockId): ItemId {
  return `block:${block}`;
}

export function getItemDefinition(registry: ItemRegistry, item: ItemStack | ItemId): ItemDefinition {
  const itemId = typeof item === "string" ? item : item.itemId;
  const definition = registry.get(itemId);

  if (!definition) {
    throw new Error(`Unknown item id: ${itemId}`);
  }

  return definition;
}

export function getItemAction(
  registry: ItemRegistry,
  item: ItemStack | ItemId,
  button: ItemUseButton
): ItemAction {
  return getItemDefinition(registry, item).actions[button];
}

export function getItemLabel(registry: ItemRegistry, item: ItemStack | ItemId): string {
  return getItemDefinition(registry, item).name;
}

export function createEmptyHandsItemDefinition(): ItemDefinition {
  return {
    id: EMPTY_HANDS_ITEM_ID,
    name: "Unarmed",
    category: "empty-hands",
    maxStack: 1,
    tags: ["body", "baseline"],
    actions: {
      primary: NO_ITEM_ACTION,
      secondary: NO_ITEM_ACTION
    }
  };
}

export function createPlaceableBlockItemDefinition(
  block: BlockId,
  definition: BlockDefinition
): ItemDefinition {
  return {
    id: createBlockItemId(block),
    name: definition.name,
    category: "block",
    maxStack: 99,
    tags: ["voxel", "placeable", definition.solid ? "solid" : "non-solid"],
    actions: {
      // Block entries are direct build controls, not mining tools: primary
      // erases the targeted build brush while secondary places the material.
      primary: { kind: "terrain:erase-block" },
      secondary: { kind: "terrain:place-block", block }
    }
  };
}

export function createMiningToolItemDefinition(): ItemDefinition {
  return {
    id: MINING_TOOL_ITEM_ID,
    name: "Terraformer",
    category: "tool",
    maxStack: 1,
    tags: ["tool", "terrain", "terraforming"],
    actions: {
      primary: { kind: "terrain:mine-block" },
      secondary: NO_ITEM_ACTION
    }
  };
}

export function createPhysicsCoreItemDefinition(): ItemDefinition {
  return {
    id: PHYSICS_CORE_ITEM_ID,
    name: "Physics Core",
    category: "tool",
    maxStack: 1,
    tags: ["physics", "projectile", "damage-source"],
    actions: {
      primary: { kind: "physics:throw-core" },
      secondary: NO_ITEM_ACTION
    }
  };
}

export function createHitscanCoreItemDefinition(): ItemDefinition {
  return {
    id: HITSCAN_CORE_ITEM_ID,
    name: "Hitscan Core",
    category: "weapon",
    maxStack: 1,
    tags: ["physics", "hitscan", "damage-source"],
    actions: {
      primary: { kind: "physics:fire-hitscan-core" },
      secondary: NO_ITEM_ACTION
    }
  };
}

export function createVoxelSandboxItemDefinitions(
  blocks: Readonly<Record<number, BlockDefinition>>,
  placeableBlocks: readonly BlockId[]
): readonly ItemDefinition[] {
  return [
    createEmptyHandsItemDefinition(),
    createMiningToolItemDefinition(),
    ...placeableBlocks.map((block) => createPlaceableBlockItemDefinition(block, blocks[block])),
    createPhysicsCoreItemDefinition(),
    createHitscanCoreItemDefinition()
  ];
}

export function createVoxelSandboxItemRegistry(
  blocks: Readonly<Record<number, BlockDefinition>>,
  placeableBlocks: readonly BlockId[]
): ItemRegistry {
  return createItemRegistry(createVoxelSandboxItemDefinitions(blocks, placeableBlocks));
}
