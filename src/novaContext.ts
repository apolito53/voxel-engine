import { BLOCKS } from "./blocks";
import type { EngineEventBus, EngineEvents } from "./engineEvents";
import type { FrameTimings } from "./frameTimings";
import type { PlayerMovementMode } from "./player";

const MAX_RECENT_EVENTS = 14;

export type NovaChatRole = "player" | "nova";

export type NovaContextEvent = {
  readonly label: string;
  readonly summary: string;
  readonly timestamp: number;
};

export type NovaWorldContext = {
  readonly id: string;
  readonly name: string;
  readonly seed: string;
};

export type NovaRuntimeTelemetry = {
  readonly selectedItemLabel: string;
  readonly movementMode: PlayerMovementMode;
  readonly speedMetersPerSecond: number;
  readonly novaActive: boolean;
  readonly physicsObjectCount: number;
  readonly rubblePatchCount: number;
  readonly rubblePieceCount: number;
};

export type NovaContextCounters = {
  readonly playerCoreThrows: number;
  readonly novaCoreThrows: number;
  readonly blocksDamaged: number;
  readonly blocksDestroyed: number;
  readonly rubbleFormed: number;
  readonly frameSpikes: number;
};

export type NovaContextSnapshot = {
  readonly world: NovaWorldContext | null;
  readonly runtime: NovaRuntimeTelemetry;
  readonly qualityLabel: string;
  readonly renderDistance: number;
  readonly physicsObjectBudget: number;
  readonly blockFragmentCount: number;
  readonly lastFrameSpikeMs: number | null;
  readonly lastFrameTimings: FrameTimings | null;
  readonly counters: NovaContextCounters;
  readonly recentEvents: readonly NovaContextEvent[];
};

const DEFAULT_RUNTIME_TELEMETRY: NovaRuntimeTelemetry = {
  selectedItemLabel: "Unarmed",
  movementMode: "walk",
  speedMetersPerSecond: 0,
  novaActive: false,
  physicsObjectCount: 0,
  rubblePatchCount: 0,
  rubblePieceCount: 0
};

export class NovaContextJournal {
  private readonly events: EngineEventBus;
  private readonly getNow: () => number;
  private readonly unsubscribers: (() => void)[] = [];
  private world: NovaWorldContext | null = null;
  private runtime: NovaRuntimeTelemetry = DEFAULT_RUNTIME_TELEMETRY;
  private qualityLabel = "Normal";
  private renderDistance = 0;
  private physicsObjectBudget = 0;
  private blockFragmentCount = 0;
  private lastFrameSpikeMs: number | null = null;
  private lastFrameTimings: FrameTimings | null = null;
  private counters: NovaContextCounters = createEmptyCounters();
  private recentEvents: NovaContextEvent[] = [];

  constructor(events: EngineEventBus, getNow = () => performance.now()) {
    this.events = events;
    this.getNow = getNow;
    this.subscribe();
  }

  updateRuntimeTelemetry(telemetry: NovaRuntimeTelemetry): void {
    this.runtime = telemetry;
  }

  snapshot(): NovaContextSnapshot {
    return {
      world: this.world,
      runtime: this.runtime,
      qualityLabel: this.qualityLabel,
      renderDistance: this.renderDistance,
      physicsObjectBudget: this.physicsObjectBudget,
      blockFragmentCount: this.blockFragmentCount,
      lastFrameSpikeMs: this.lastFrameSpikeMs,
      lastFrameTimings: this.lastFrameTimings,
      counters: this.counters,
      recentEvents: [...this.recentEvents]
    };
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }

  private subscribe(): void {
    this.unsubscribers.push(
      this.events.on("world:loaded", (event) => this.onWorldLoaded(event)),
      this.events.on("world:exited", () => this.onWorldExited()),
      this.events.on("nova:toggled", (event) => {
        this.runtime = { ...this.runtime, novaActive: event.active };
        this.remember("Nova", event.active ? "Nova joined formation." : "Nova stepped back into spectator mode.");
      }),
      this.events.on("physics:core-thrown", (event) => this.onCoreThrown(event)),
      this.events.on("physics:cores-cleared", (event) => {
        this.remember("Physics", `Cleared ${event.count} active physics core${event.count === 1 ? "" : "s"}.`);
      }),
      this.events.on("block:damaged", (event) => this.onBlockDamaged(event)),
      this.events.on("block:destroyed", (event) => this.onBlockDestroyed(event)),
      this.events.on("rubble:formed", (event) => this.onRubbleFormed(event)),
      this.events.on("quality:changed", (event) => this.onQualityChanged(event)),
      this.events.on("settings:physics-budget-changed", (event) => {
        this.physicsObjectBudget = event.physicsObjectBudget;
        this.remember("Settings", `Physics budget set to ${event.physicsObjectBudget} bodies.`);
      }),
      this.events.on("palette:selected", (event) => {
        this.runtime = { ...this.runtime, selectedItemLabel: event.name };
        this.remember("Palette", `${event.name} selected.`);
      }),
      this.events.on("performance:frame-spike", (event) => this.onFrameSpike(event)),
      this.events.on("nova:chat-message", (event) => {
        this.remember(event.role === "player" ? "Player" : "Nova", event.text);
      })
    );
  }

  private onWorldLoaded(event: EngineEvents["world:loaded"]): void {
    this.world = {
      id: event.worldId,
      name: event.name,
      seed: event.seed
    };
    this.counters = createEmptyCounters();
    this.recentEvents = [];
    this.remember("World", `Loaded ${event.name} with seed ${event.seed}.`);
  }

  private onWorldExited(): void {
    this.remember("World", "Exited to the world list.");
    this.world = null;
  }

  private onCoreThrown(event: EngineEvents["physics:core-thrown"]): void {
    this.counters = {
      ...this.counters,
      playerCoreThrows: this.counters.playerCoreThrows + (event.source === "player" ? 1 : 0),
      novaCoreThrows: this.counters.novaCoreThrows + (event.source === "nova" ? 1 : 0)
    };
    this.remember("Physics", event.source === "nova" ? "Nova threw a physics core." : "Player threw a physics core.");
  }

  private onBlockDamaged(event: EngineEvents["block:damaged"]): void {
    this.counters = {
      ...this.counters,
      blocksDamaged: this.counters.blocksDamaged + 1
    };
    this.remember(
      "Damage",
      `${getBlockName(event.block)} cracked at ${formatPosition(event.position)} with ${event.remainingHealth} health left.`
    );
  }

  private onBlockDestroyed(event: EngineEvents["block:destroyed"]): void {
    this.counters = {
      ...this.counters,
      blocksDestroyed: this.counters.blocksDestroyed + 1
    };
    this.remember(
      "Damage",
      `${getBlockName(event.block)} fractured into ${event.fragmentCount} visible piece${event.fragmentCount === 1 ? "" : "s"}.`
    );
  }

  private onRubbleFormed(event: EngineEvents["rubble:formed"]): void {
    this.counters = {
      ...this.counters,
      rubbleFormed: this.counters.rubbleFormed + event.pieces
    };
    this.remember("Rubble", `${getBlockName(event.block)} debris settled into cover.`);
  }

  private onQualityChanged(event: EngineEvents["quality:changed"]): void {
    this.qualityLabel = event.label;
    this.renderDistance = event.renderDistance;
    this.physicsObjectBudget = event.physicsObjectBudget;
    this.blockFragmentCount = event.blockFragmentCount;
    this.remember("Quality", `${event.label} quality active at ${event.renderDistance} chunks.`);
  }

  private onFrameSpike(event: EngineEvents["performance:frame-spike"]): void {
    this.lastFrameSpikeMs = event.frameMs;
    this.lastFrameTimings = event.timings;
    this.counters = {
      ...this.counters,
      frameSpikes: this.counters.frameSpikes + 1
    };
    this.remember("Performance", `Frame hitch recorded at ${event.frameMs.toFixed(1)} ms.`);
  }

  private remember(label: string, summary: string): void {
    this.recentEvents.unshift({
      label,
      summary,
      timestamp: this.getNow()
    });
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.length = MAX_RECENT_EVENTS;
    }
  }
}

function createEmptyCounters(): NovaContextCounters {
  return {
    playerCoreThrows: 0,
    novaCoreThrows: 0,
    blocksDamaged: 0,
    blocksDestroyed: 0,
    rubbleFormed: 0,
    frameSpikes: 0
  };
}

function getBlockName(block: number): string {
  return BLOCKS[block]?.name ?? "Block";
}

function formatPosition(position: { readonly x: number; readonly y: number; readonly z: number }): string {
  return `${position.x},${position.y},${position.z}`;
}
