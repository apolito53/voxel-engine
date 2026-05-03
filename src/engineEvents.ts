import type { BlockId } from "./blocks";
import { EventBus } from "./eventBus";
import type { FrameTimings } from "./frameTimings";
import type { QualityChangeSource } from "./qualityController";
import type { QualityPresetId } from "./qualityPresets";

export type VoxelEventPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PhysicsCoreSource = "player" | "nova";

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
    readonly role: "player" | "nova";
    readonly text: string;
  };
  "physics:core-thrown": {
    readonly source: PhysicsCoreSource;
  };
  "physics:cores-cleared": {
    readonly count: number;
  };
  "block:damaged": {
    readonly position: VoxelEventPosition;
    readonly block: number;
    readonly impactSpeed: number;
    readonly remainingHealth: number;
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
