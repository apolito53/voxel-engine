import { BLOCKS } from "./blocks";
import type { EngineEventBus, EngineEvents } from "./engineEvents";
import type { NovaPilot } from "./novaPilot";

const MESSAGE_VISIBLE_CLASS = "is-visible";
const MESSAGE_DURATION_MS = 4200;
const MIN_MESSAGE_GAP_MS = 1800;
const FRAME_SPIKE_COOLDOWN_MS = 10000;
const CORE_SPAM_WINDOW_MS = 3600;
const CORE_SPAM_COUNT = 5;

type MessageClassList = {
  add(token: string): void;
  remove(token: string): void;
};

export type NovaPilotMessageTarget = {
  textContent: string | null;
  readonly classList: MessageClassList;
};

type NovaPilotReactionsOptions = {
  readonly events: EngineEventBus;
  readonly pilot: NovaPilot;
  readonly output: NovaPilotMessageTarget;
  readonly getNow?: () => number;
};

type MessageOptions = {
  readonly force?: boolean;
  readonly pulse?: boolean;
};

export class NovaPilotReactions {
  private readonly events: EngineEventBus;
  private readonly pilot: NovaPilot;
  private readonly output: NovaPilotMessageTarget;
  private readonly getNow: () => number;
  private readonly unsubscribers: (() => void)[] = [];
  private recentCoreThrows: number[] = [];
  private messageExpiresAt = 0;
  private nextMessageAt = 0;
  private nextFrameSpikeAt = 0;

  constructor({ events, pilot, output, getNow = () => performance.now() }: NovaPilotReactionsOptions) {
    this.events = events;
    this.pilot = pilot;
    this.output = output;
    this.getNow = getNow;
    this.subscribe();
  }

  update(): void {
    if (this.messageExpiresAt > 0 && this.getNow() >= this.messageExpiresAt) {
      this.output.classList.remove(MESSAGE_VISIBLE_CLASS);
      this.messageExpiresAt = 0;
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.output.classList.remove(MESSAGE_VISIBLE_CLASS);
  }

  private subscribe(): void {
    this.unsubscribers.push(
      this.events.on("world:loaded", (event) => this.onWorldLoaded(event)),
      this.events.on("world:exited", () => this.say("I'll hold orbit until you pick the next world.", { force: true, pulse: false })),
      this.events.on("nova:toggled", (event) => {
        this.say(event.active ? "Back in formation." : "Fine. I'll lurk quietly.", { force: true });
      }),
      this.events.on("physics:core-thrown", (event) => this.onCoreThrown(event)),
      this.events.on("physics:cores-cleared", (event) => {
        if (event.count > 0) this.say(`Cleared ${event.count} active core${event.count === 1 ? "" : "s"}.`);
      }),
      this.events.on("block:damaged", (event) => this.onBlockDamaged(event)),
      this.events.on("block:destroyed", (event) => this.onBlockDestroyed(event)),
      this.events.on("rubble:formed", () => this.say("That debris is becoming cover now.")),
      this.events.on("quality:changed", (event) => this.onQualityChanged(event)),
      this.events.on("settings:physics-budget-changed", (event) => {
        if (event.physicsObjectBudget >= 2048) {
          this.say("That object budget is very optimistic. I respect the chaos.");
        }
      }),
      this.events.on("palette:selected", (event) => {
        this.say(`${event.name} selected.`);
      }),
      this.events.on("performance:frame-spike", (event) => this.onFrameSpike(event))
    );
  }

  private onWorldLoaded(event: EngineEvents["world:loaded"]): void {
    this.recentCoreThrows = [];
    this.say(`Nova online in ${event.name}. Try not to terraform it immediately.`, { force: true });
  }

  private onCoreThrown(event: EngineEvents["physics:core-thrown"]): void {
    const now = this.getNow();
    this.recentCoreThrows = this.recentCoreThrows
      .filter((timestamp) => now - timestamp <= CORE_SPAM_WINDOW_MS)
      .concat(now);

    if (event.source === "nova") {
      this.say("My shot.", { pulse: true });
      return;
    }

    if (this.recentCoreThrows.length >= CORE_SPAM_COUNT) {
      this.recentCoreThrows = [];
      this.say("We are stress-testing again, I see.");
    }
  }

  private onBlockDamaged(event: EngineEvents["block:damaged"]): void {
    if (event.remainingHealth !== 1) return;
    this.say(`${getBlockName(event.block)} is cracked.`);
  }

  private onBlockDestroyed(event: EngineEvents["block:destroyed"]): void {
    this.say(`${getBlockName(event.block)} chose fragments.`);
  }

  private onQualityChanged(event: EngineEvents["quality:changed"]): void {
    if (event.label === "Super Ultra") {
      this.say("Super Ultra. Bold. Reckless. On brand.", { force: true });
      return;
    }

    if (event.source === "settings" && event.presetId === "custom") {
      this.say("Custom tuning applied. Try to leave the frame time alive.");
    }
  }

  private onFrameSpike(event: EngineEvents["performance:frame-spike"]): void {
    const now = this.getNow();
    if (now < this.nextFrameSpikeAt) return;

    this.nextFrameSpikeAt = now + FRAME_SPIKE_COOLDOWN_MS;
    this.say(`Frame hitch: ${event.frameMs.toFixed(1)} ms. Something made the engine sweat.`, {
      force: true
    });
  }

  private say(message: string, { force = false, pulse = true }: MessageOptions = {}): void {
    const now = this.getNow();
    if (!force && now < this.nextMessageAt) return;

    this.output.textContent = `Nova: ${message}`;
    this.output.classList.add(MESSAGE_VISIBLE_CLASS);
    this.messageExpiresAt = now + MESSAGE_DURATION_MS;
    this.nextMessageAt = now + MIN_MESSAGE_GAP_MS;
    if (pulse) this.pilot.pulse();
  }
}

function getBlockName(block: number): string {
  return BLOCKS[block]?.name ?? "Block";
}
