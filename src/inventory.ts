import type { BlockId } from "./blocks";
import {
  EMPTY_HANDS_ITEM_ID,
  HITSCAN_CORE_ITEM_ID,
  MINING_TOOL_ITEM_ID,
  PHYSICS_CORE_ITEM_ID,
  createBlockItemId,
  type ItemDefinition,
  type ItemId,
  type ItemRegistry,
  type ItemStack
} from "./items";

export const DEFAULT_BACKPACK_SLOT_COUNT = 18;

export type InventoryLane = "items" | "blocks";
export type InventorySlot = ItemStack | null;

export type InventoryContainer = {
  readonly slots: readonly InventorySlot[];
};

// This state is intentionally plain structured-clone data. Saved worlds can
// persist it directly, tests can JSON-clone it, and gameplay code never needs
// to serialize class instances or registry indexes.
export type InventoryState = {
  readonly activeLane: InventoryLane;
  readonly selectedItemId: ItemId;
  readonly selectedBlockItemId: ItemId;
  readonly backpack: InventoryContainer;
};

export type InventoryStateOptions = {
  readonly registry: ItemRegistry;
  readonly itemCatalogIds: readonly ItemId[];
  readonly blockCatalogIds: readonly ItemId[];
  readonly defaultItemId: ItemId;
  readonly defaultBlockItemId: ItemId;
  readonly backpackSlotCount: number;
};

export type InventoryRejectionReason =
  | "unknown-item"
  | "unstorable-item"
  | "invalid-quantity"
  | "invalid-slot"
  | "empty-slot"
  | "occupied-slot"
  | "incompatible-item"
  | "same-slot"
  | "stack-too-small"
  | "stack-full";

export type InventoryInsertResult = {
  readonly container: InventoryContainer;
  readonly insertedQuantity: number;
  readonly remainder: ItemStack | null;
  readonly changed: boolean;
  readonly rejection: InventoryRejectionReason | null;
};

export type InventoryRemoveResult = {
  readonly container: InventoryContainer;
  readonly removed: ItemStack | null;
  readonly changed: boolean;
  readonly rejection: InventoryRejectionReason | null;
};

export type InventoryMoveResult = {
  readonly container: InventoryContainer;
  readonly movedQuantity: number;
  readonly changed: boolean;
  readonly rejection: InventoryRejectionReason | null;
};

export function createVoxelSandboxInventoryOptions(
  registry: ItemRegistry,
  placeableBlocks: readonly BlockId[],
  backpackSlotCount = DEFAULT_BACKPACK_SLOT_COUNT
): InventoryStateOptions {
  const blockCatalogIds = placeableBlocks.map(createBlockItemId);
  return {
    registry,
    itemCatalogIds: [
      EMPTY_HANDS_ITEM_ID,
      MINING_TOOL_ITEM_ID,
      PHYSICS_CORE_ITEM_ID,
      HITSCAN_CORE_ITEM_ID
    ],
    blockCatalogIds,
    defaultItemId: EMPTY_HANDS_ITEM_ID,
    defaultBlockItemId: blockCatalogIds[0] ?? "",
    backpackSlotCount
  };
}

export function createEmptyInventoryContainer(slotCount: number): InventoryContainer {
  return {
    slots: Array.from({ length: normalizeSlotCount(slotCount) }, () => null)
  };
}

export function cloneInventoryContainer(container: InventoryContainer): InventoryContainer {
  return {
    slots: container.slots.map((stack) => stack ? cloneItemStack(stack) : null)
  };
}

export function normalizeInventoryContainer(
  value: unknown,
  registry: ItemRegistry,
  slotCount: number
): InventoryContainer {
  const sourceSlots = readInventorySlots(value);
  const normalizedSlotCount = normalizeSlotCount(slotCount);
  return {
    slots: Array.from(
      { length: normalizedSlotCount },
      (_, index) => normalizeInventoryStack(sourceSlots[index], registry)
    )
  };
}

export function normalizeInventoryStack(value: unknown, registry: ItemRegistry): ItemStack | null {
  if (!isRecord(value) || typeof value.itemId !== "string") return null;

  const definition = registry.get(value.itemId);
  if (!definition || !isFiniteContainerItem(definition)) return null;

  const quantity = normalizeRequestedQuantity(value.quantity);
  if (quantity === null) return null;

  return {
    itemId: definition.id,
    quantity: Math.min(quantity, getItemMaxStack(definition))
  };
}

export function insertInventoryStack(
  container: InventoryContainer,
  stack: ItemStack,
  registry: ItemRegistry
): InventoryInsertResult {
  const normalizedContainer = normalizeOperationContainer(container, registry);
  const itemId = isRecord(stack) && typeof stack.itemId === "string" ? stack.itemId : "";
  const quantity = isRecord(stack) ? normalizeRequestedQuantity(stack.quantity) : null;
  const definition = registry.get(itemId);

  if (!definition) {
    return rejectedInsert(normalizedContainer, "unknown-item", itemId, quantity);
  }
  if (!isFiniteContainerItem(definition)) {
    return rejectedInsert(normalizedContainer, "unstorable-item", itemId, quantity);
  }
  if (quantity === null) {
    return rejectedInsert(normalizedContainer, "invalid-quantity", itemId, null);
  }

  const slots = cloneMutableSlots(normalizedContainer);
  const maxStack = getItemMaxStack(definition);
  let remaining = quantity;

  // Merge first so inserting loot does not leave avoidable half-stacks scattered
  // through a container. Empty slots are filled only after every merge target.
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    const current = slots[index];
    if (!current || current.itemId !== itemId || current.quantity >= maxStack) continue;

    const moved = Math.min(maxStack - current.quantity, remaining);
    slots[index] = { itemId, quantity: current.quantity + moved };
    remaining -= moved;
  }

  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index] !== null) continue;

    const moved = Math.min(maxStack, remaining);
    slots[index] = { itemId, quantity: moved };
    remaining -= moved;
  }

  const insertedQuantity = quantity - remaining;
  return {
    container: { slots },
    insertedQuantity,
    // Remainders represent a bulk request and may exceed one stack. The next
    // container can feed the same value back through insert without data loss.
    remainder: remaining > 0 ? { itemId, quantity: remaining } : null,
    changed: insertedQuantity > 0,
    rejection: insertedQuantity === 0 && remaining > 0 ? "stack-full" : null
  };
}

export function removeInventoryStack(
  container: InventoryContainer,
  slotIndex: number,
  quantity: number,
  registry: ItemRegistry
): InventoryRemoveResult {
  const normalizedContainer = normalizeOperationContainer(container, registry);
  const normalizedQuantity = normalizeRequestedQuantity(quantity);
  if (normalizedQuantity === null) {
    return rejectedRemove(normalizedContainer, "invalid-quantity");
  }
  if (!isValidSlotIndex(slotIndex, normalizedContainer.slots.length)) {
    return rejectedRemove(normalizedContainer, "invalid-slot");
  }

  const current = normalizedContainer.slots[slotIndex] ?? null;
  if (!current) return rejectedRemove(normalizedContainer, "empty-slot");

  const removedQuantity = Math.min(current.quantity, normalizedQuantity);
  const slots = cloneMutableSlots(normalizedContainer);
  const remaining = current.quantity - removedQuantity;
  slots[slotIndex] = remaining > 0 ? { itemId: current.itemId, quantity: remaining } : null;
  return {
    container: { slots },
    removed: { itemId: current.itemId, quantity: removedQuantity },
    changed: removedQuantity > 0,
    rejection: null
  };
}

export function splitInventoryStack(
  container: InventoryContainer,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  quantity: number,
  registry: ItemRegistry
): InventoryMoveResult {
  const normalizedContainer = normalizeOperationContainer(container, registry);
  const indexesError = validateMoveIndexes(normalizedContainer, sourceSlotIndex, targetSlotIndex);
  if (indexesError) return rejectedMove(normalizedContainer, indexesError);

  const normalizedQuantity = normalizeRequestedQuantity(quantity);
  if (normalizedQuantity === null) return rejectedMove(normalizedContainer, "invalid-quantity");

  const source = normalizedContainer.slots[sourceSlotIndex] ?? null;
  if (!source) return rejectedMove(normalizedContainer, "empty-slot");
  if (normalizedContainer.slots[targetSlotIndex] !== null) {
    return rejectedMove(normalizedContainer, "occupied-slot");
  }
  if (normalizedQuantity >= source.quantity) {
    return rejectedMove(normalizedContainer, "stack-too-small");
  }

  const slots = cloneMutableSlots(normalizedContainer);
  slots[sourceSlotIndex] = {
    itemId: source.itemId,
    quantity: source.quantity - normalizedQuantity
  };
  slots[targetSlotIndex] = {
    itemId: source.itemId,
    quantity: normalizedQuantity
  };
  return {
    container: { slots },
    movedQuantity: normalizedQuantity,
    changed: true,
    rejection: null
  };
}

export function transferInventoryStack(
  container: InventoryContainer,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  quantity: number,
  registry: ItemRegistry
): InventoryMoveResult {
  const normalizedContainer = normalizeOperationContainer(container, registry);
  const indexesError = validateMoveIndexes(normalizedContainer, sourceSlotIndex, targetSlotIndex);
  if (indexesError) return rejectedMove(normalizedContainer, indexesError);

  const normalizedQuantity = normalizeRequestedQuantity(quantity);
  if (normalizedQuantity === null) return rejectedMove(normalizedContainer, "invalid-quantity");

  const source = normalizedContainer.slots[sourceSlotIndex] ?? null;
  const target = normalizedContainer.slots[targetSlotIndex] ?? null;
  if (!source) return rejectedMove(normalizedContainer, "empty-slot");
  if (target && target.itemId !== source.itemId) {
    return rejectedMove(normalizedContainer, "incompatible-item");
  }

  const definition = registry.get(source.itemId);
  if (!definition || !isFiniteContainerItem(definition)) {
    return rejectedMove(normalizedContainer, definition ? "unstorable-item" : "unknown-item");
  }

  const capacity = getItemMaxStack(definition) - (target?.quantity ?? 0);
  if (capacity <= 0) return rejectedMove(normalizedContainer, "stack-full");

  const movedQuantity = Math.min(source.quantity, normalizedQuantity, capacity);
  const slots = cloneMutableSlots(normalizedContainer);
  const sourceRemaining = source.quantity - movedQuantity;
  slots[sourceSlotIndex] = sourceRemaining > 0
    ? { itemId: source.itemId, quantity: sourceRemaining }
    : null;
  slots[targetSlotIndex] = {
    itemId: source.itemId,
    quantity: (target?.quantity ?? 0) + movedQuantity
  };
  return {
    container: { slots },
    movedQuantity,
    changed: movedQuantity > 0,
    rejection: null
  };
}

export function swapInventorySlots(
  container: InventoryContainer,
  firstSlotIndex: number,
  secondSlotIndex: number,
  registry: ItemRegistry
): InventoryMoveResult {
  const normalizedContainer = normalizeOperationContainer(container, registry);
  const indexesError = validateMoveIndexes(normalizedContainer, firstSlotIndex, secondSlotIndex);
  if (indexesError) return rejectedMove(normalizedContainer, indexesError);

  const slots = cloneMutableSlots(normalizedContainer);
  const first = slots[firstSlotIndex] ?? null;
  const second = slots[secondSlotIndex] ?? null;
  slots[firstSlotIndex] = second;
  slots[secondSlotIndex] = first;
  return {
    container: { slots },
    movedQuantity: (first?.quantity ?? 0) + (second?.quantity ?? 0),
    changed: first !== null || second !== null,
    rejection: null
  };
}

export function createDefaultInventoryState(options: InventoryStateOptions): InventoryState {
  const itemCatalogIds = normalizeCatalogIds(options.itemCatalogIds, options.registry, "items");
  const blockCatalogIds = normalizeCatalogIds(options.blockCatalogIds, options.registry, "blocks");
  return {
    activeLane: "items",
    selectedItemId: resolveCatalogFallback(options.defaultItemId, itemCatalogIds),
    selectedBlockItemId: resolveCatalogFallback(options.defaultBlockItemId, blockCatalogIds),
    backpack: createEmptyInventoryContainer(options.backpackSlotCount)
  };
}

export function normalizeInventoryState(value: unknown, options: InventoryStateOptions): InventoryState {
  const defaults = createDefaultInventoryState(options);
  if (!isRecord(value)) return defaults;

  const itemCatalogIds = normalizeCatalogIds(options.itemCatalogIds, options.registry, "items");
  const blockCatalogIds = normalizeCatalogIds(options.blockCatalogIds, options.registry, "blocks");
  return {
    activeLane: value.activeLane === "blocks" ? "blocks" : "items",
    selectedItemId: normalizeCatalogSelection(
      value.selectedItemId,
      itemCatalogIds,
      defaults.selectedItemId
    ),
    selectedBlockItemId: normalizeCatalogSelection(
      value.selectedBlockItemId,
      blockCatalogIds,
      defaults.selectedBlockItemId
    ),
    backpack: normalizeInventoryContainer(
      value.backpack,
      options.registry,
      options.backpackSlotCount
    )
  };
}

export function cloneInventoryState(state: InventoryState): InventoryState {
  return {
    activeLane: state.activeLane,
    selectedItemId: state.selectedItemId,
    selectedBlockItemId: state.selectedBlockItemId,
    backpack: cloneInventoryContainer(state.backpack)
  };
}

export function setInventoryActiveLane(
  state: InventoryState,
  lane: InventoryLane,
  options: InventoryStateOptions
): InventoryState {
  const normalized = normalizeInventoryState(state, options);
  return {
    ...normalized,
    activeLane: lane === "blocks" ? "blocks" : "items"
  };
}

export function selectInventoryCatalogItem(
  state: InventoryState,
  lane: InventoryLane,
  itemId: ItemId,
  options: InventoryStateOptions
): InventoryState {
  const normalized = normalizeInventoryState(state, options);
  const catalogIds = lane === "blocks"
    ? normalizeCatalogIds(options.blockCatalogIds, options.registry, "blocks")
    : normalizeCatalogIds(options.itemCatalogIds, options.registry, "items");
  if (!catalogIds.includes(itemId)) return normalized;

  return lane === "blocks"
    ? { ...normalized, activeLane: lane, selectedBlockItemId: itemId }
    : { ...normalized, activeLane: lane, selectedItemId: itemId };
}

export function getSelectedInventoryItemId(state: InventoryState): ItemId {
  return state.activeLane === "blocks" ? state.selectedBlockItemId : state.selectedItemId;
}

function normalizeOperationContainer(
  container: InventoryContainer,
  registry: ItemRegistry
): InventoryContainer {
  return normalizeInventoryContainer(container, registry, readInventorySlots(container).length);
}

function normalizeCatalogIds(
  ids: readonly ItemId[],
  registry: ItemRegistry,
  lane: InventoryLane
): ItemId[] {
  const seen = new Set<ItemId>();
  const result: ItemId[] = [];
  for (const id of ids) {
    const definition = registry.get(id);
    const laneMatches = lane === "blocks"
      ? definition?.category === "block"
      : Boolean(definition && definition.category !== "block");
    if (!laneMatches || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeCatalogSelection(value: unknown, catalogIds: readonly ItemId[], fallback: ItemId): ItemId {
  return typeof value === "string" && catalogIds.includes(value) ? value : fallback;
}

function resolveCatalogFallback(requested: ItemId, catalogIds: readonly ItemId[]): ItemId {
  return catalogIds.includes(requested) ? requested : catalogIds[0] ?? requested;
}

function readInventorySlots(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.slots)) return value.slots;
  return [];
}

function normalizeSlotCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.trunc(value), 4096);
}

function normalizeRequestedQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const quantity = Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER);
  return quantity > 0 ? quantity : null;
}

function getItemMaxStack(definition: ItemDefinition): number {
  if (!Number.isFinite(definition.maxStack) || definition.maxStack <= 0) return 1;
  return Math.min(Math.trunc(definition.maxStack), Number.MAX_SAFE_INTEGER);
}

function isFiniteContainerItem(definition: ItemDefinition): boolean {
  // Empty hands is a virtual stance, not an object that can be picked up,
  // dropped, duplicated, or smuggled into a serialized backpack slot.
  return definition.category !== "empty-hands";
}

function cloneMutableSlots(container: InventoryContainer): InventorySlot[] {
  return container.slots.map((stack) => stack ? cloneItemStack(stack) : null);
}

function cloneItemStack(stack: ItemStack): ItemStack {
  return { itemId: stack.itemId, quantity: stack.quantity };
}

function validateMoveIndexes(
  container: InventoryContainer,
  sourceSlotIndex: number,
  targetSlotIndex: number
): InventoryRejectionReason | null {
  if (
    !isValidSlotIndex(sourceSlotIndex, container.slots.length)
    || !isValidSlotIndex(targetSlotIndex, container.slots.length)
  ) {
    return "invalid-slot";
  }
  return sourceSlotIndex === targetSlotIndex ? "same-slot" : null;
}

function isValidSlotIndex(index: number, slotCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < slotCount;
}

function rejectedInsert(
  container: InventoryContainer,
  rejection: InventoryRejectionReason,
  itemId: string,
  quantity: number | null
): InventoryInsertResult {
  return {
    container,
    insertedQuantity: 0,
    remainder: itemId && quantity !== null ? { itemId, quantity } : null,
    changed: false,
    rejection
  };
}

function rejectedRemove(
  container: InventoryContainer,
  rejection: InventoryRejectionReason
): InventoryRemoveResult {
  return {
    container,
    removed: null,
    changed: false,
    rejection
  };
}

function rejectedMove(
  container: InventoryContainer,
  rejection: InventoryRejectionReason
): InventoryMoveResult {
  return {
    container,
    movedQuantity: 0,
    changed: false,
    rejection
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
