import type { BlockId } from "./blocks";
import { EventBus } from "./eventBus";
import type { FrameTimings } from "./frameTimings";
import type { ItemCategory, ItemId } from "./items";
import type { NovaChatRole } from "./novaContext";
import type { QualityChangeSource } from "./qualityController";
import type { QualityPresetId } from "./qualityPresets";

export type VoxelEventPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PhysicsCoreSource = "player" | "nova";
export type PhysicsCoreMode = "projectile" | "hitscan";

export type EngineEvents = {
  "world:loaded": {
    readonly worldId: string;
    readonly name: string;
    readonly seed: string;
  };
  "world:exited": {
    readonly worldId: string | null;
  };
  "nova:toggled": {
    readonly active: boolean;
  };
  "nova:chat-message": {
    readonly role: NovaChatRole;
    readonly text: string;
  };
  "physics:core-thrown": {
    readonly source: PhysicsCoreSource;
    readonly mode?: PhysicsCoreMode;
  };
  "physics:cores-cleared": {
    readonly count: number;
  };
  "block:damaged": {
    readonly position: VoxelEventPosition;
    readonly block: number;
    readonly impactSpeed: number;
    readonly remainingHealth: number;
    readonly maxHealth: number;
  };
  "block:destroyed": {
    readonly position: VoxelEventPosition;
    readonly block: number;
    readonly impactSpeed: number;
    readonly fragmentCount: number;
  };
  "rubble:formed": {
    readonly position: VoxelEventPosition;
    readonly block: number;
    readonly pieces: number;
  };
  "rubble:damaged": {
    readonly position: VoxelEventPosition;
    readonly block: number;
    readonly remainingHealth: number;
    readonly maxHealth: number;
    readonly destroyed: boolean;
    readonly collateral: boolean;
  };
  "quality:changed": {
    readonly presetId: QualityPresetId;
    readonly label: string;
    readonly source: QualityChangeSource;
    readonly renderDistance: number;
    readonly physicsObjectBudget: number;
    readonly blockFragmentCount: number;
  };
  "settings:physics-budget-changed": {
    readonly physicsObjectBudget: number;
  };
  "item:selected": {
    readonly itemId: ItemId;
    readonly name: string;
    readonly category: ItemCategory;
    readonly slotIndex: number;
  };
  "palette:selected": {
    readonly block: BlockId;
    readonly name: string;
  };
  "performance:frame-spike": {
    readonly frameMs: number;
    readonly timings: FrameTimings;
  };
};

export type EngineEventBus = EventBus<EngineEvents>;

export function createEngineEventBus(): EngineEventBus {
  return new EventBus<EngineEvents>();
}
