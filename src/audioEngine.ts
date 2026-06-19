import {
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  type AudioSettings
} from "./audioSettings";
import { BLOCKS } from "./blocks";
import type { EngineEventBus } from "./engineEvents";
import { clamp } from "./math";

type AudioCategory = "sfx" | "ui";
type BrowserAudioContextConstructor = new () => AudioContext;
type BrowserAudioGlobal = typeof globalThis & {
  readonly webkitAudioContext?: BrowserAudioContextConstructor;
};

export type PlayerAudioSnapshot = {
  readonly active: boolean;
  readonly onGround: boolean;
  readonly flying: boolean;
  readonly speedMetersPerSecond: number;
  readonly verticalVelocity: number;
};

type ToneOptions = {
  readonly frequency: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly category: AudioCategory;
  readonly type?: OscillatorType;
  readonly frequencyEnd?: number;
};

type NoiseOptions = {
  readonly durationSeconds: number;
  readonly gain: number;
  readonly category: AudioCategory;
  readonly filterFrequency?: number;
  readonly pitch?: number;
};

const DAMAGE_SOUND_MIN_INTERVAL_MS = 42;
const RUBBLE_SOUND_MIN_INTERVAL_MS = 65;
const FOOTSTEP_MIN_INTERVAL_SECONDS = 0.22;
const WALK_STEP_DISTANCE_METERS = 1.7;
const LANDING_SOUND_MIN_AIR_TIME_SECONDS = 0.16;

export class GameAudio {
  private readonly events: EngineEventBus;
  private readonly unsubscribers: Array<() => void> = [];
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private settings = DEFAULT_AUDIO_SETTINGS;
  private lastDamageSoundAt = 0;
  private lastRubbleSoundAt = 0;
  private stepDistance = 0;
  private airborneSeconds = 0;
  private wasOnGround = false;

  constructor(options: { readonly events: EngineEventBus; readonly settings: AudioSettings }) {
    this.events = options.events;
    this.settings = normalizeAudioSettings(options.settings);
    this.subscribeToEngineEvents();
  }

  applySettings(settings: AudioSettings): void {
    this.settings = normalizeAudioSettings(settings, this.settings);
    this.syncGainNodes();
  }

  async unlockFromUserGesture(): Promise<void> {
    if (!this.settings.enabled) return;
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  playUiClick(): void {
    this.playTone({
      frequency: 720,
      frequencyEnd: 920,
      durationSeconds: 0.045,
      gain: 0.035,
      category: "ui",
      type: "triangle"
    });
  }

  updatePlayerMotion(deltaSeconds: number, snapshot: PlayerAudioSnapshot): void {
    if (!snapshot.active || snapshot.flying) {
      this.stepDistance = 0;
      this.airborneSeconds = 0;
      this.wasOnGround = snapshot.onGround;
      return;
    }

    if (!snapshot.onGround) {
      this.airborneSeconds += Math.max(0, deltaSeconds);
      this.wasOnGround = false;
      return;
    }

    if (!this.wasOnGround && this.airborneSeconds >= LANDING_SOUND_MIN_AIR_TIME_SECONDS) {
      this.playLanding(Math.abs(snapshot.verticalVelocity));
    }

    this.airborneSeconds = 0;
    this.wasOnGround = true;
    if (snapshot.speedMetersPerSecond < 0.85) {
      this.stepDistance = 0;
      return;
    }

    this.stepDistance += snapshot.speedMetersPerSecond * Math.max(0, deltaSeconds);
    const stepDistance = Math.max(1.05, WALK_STEP_DISTANCE_METERS - clamp(snapshot.speedMetersPerSecond, 0, 9) * 0.06);
    const minimumStepIntervalDistance = snapshot.speedMetersPerSecond * FOOTSTEP_MIN_INTERVAL_SECONDS;
    if (this.stepDistance < Math.max(stepDistance, minimumStepIntervalDistance)) return;

    this.stepDistance = 0;
    this.playFootstep(snapshot.speedMetersPerSecond);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.masterGain?.disconnect();
    this.sfxGain?.disconnect();
    this.uiGain?.disconnect();
    this.masterGain = null;
    this.sfxGain = null;
    this.uiGain = null;
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
    this.context = null;
  }

  private subscribeToEngineEvents(): void {
    this.unsubscribers.push(
      this.events.on("world:loaded", () => this.playWorldLoaded()),
      this.events.on("world:exited", () => this.playUiClick()),
      this.events.on("item:selected", (event) => this.playItemSelected(event.slotIndex)),
      this.events.on("palette:selected", () => this.playUiClick()),
      this.events.on("quality:changed", () => this.playUiClick()),
      this.events.on("settings:physics-budget-changed", () => this.playUiClick()),
      this.events.on("physics:core-thrown", (event) => this.playCoreThrown(event.mode ?? "projectile")),
      this.events.on("physics:cores-cleared", (event) => {
        if (event.count > 0) this.playNoise({ durationSeconds: 0.08, gain: 0.055, category: "sfx", filterFrequency: 440 });
      }),
      this.events.on("block:damaged", (event) => this.playBlockDamaged(event.block, event.impactSpeed)),
      this.events.on("block:destroyed", (event) => this.playBlockDestroyed(event.block, event.fragmentCount)),
      this.events.on("rubble:formed", () => this.playRubbleFormed()),
      this.events.on("rubble:damaged", (event) => this.playRubbleDamaged(event.destroyed)),
      this.events.on("nova:toggled", (event) => this.playTone({
        frequency: event.active ? 520 : 360,
        frequencyEnd: event.active ? 760 : 240,
        durationSeconds: 0.08,
        gain: 0.04,
        category: "ui",
        type: "sine"
      })),
      this.events.on("nova:chat-message", (event) => {
        if (event.role === "nova") {
          this.playTone({ frequency: 620, durationSeconds: 0.035, gain: 0.022, category: "ui", type: "triangle" });
        }
      })
    );
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;

    const audioGlobal = globalThis as BrowserAudioGlobal;
    const AudioContextConstructor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const context = new AudioContextConstructor();
    this.context = context;
    this.masterGain = context.createGain();
    this.sfxGain = context.createGain();
    this.uiGain = context.createGain();
    this.sfxGain.connect(this.masterGain);
    this.uiGain.connect(this.masterGain);
    this.masterGain.connect(context.destination);
    this.syncGainNodes();
    return context;
  }

  private syncGainNodes(): void {
    if (!this.context || !this.masterGain || !this.sfxGain || !this.uiGain) return;

    const now = this.context.currentTime;
    const masterVolume = this.settings.enabled ? this.settings.masterVolume : 0;
    this.rampGain(this.masterGain.gain, masterVolume, now, 0.02);
    this.rampGain(this.sfxGain.gain, this.settings.sfxVolume, now, 0.02);
    this.rampGain(this.uiGain.gain, this.settings.uiVolume, now, 0.02);
  }

  private playWorldLoaded(): void {
    this.playTone({ frequency: 220, frequencyEnd: 330, durationSeconds: 0.11, gain: 0.035, category: "ui", type: "sine" });
    this.playTone({ frequency: 330, frequencyEnd: 495, durationSeconds: 0.14, gain: 0.026, category: "ui", type: "sine" });
  }

  private playItemSelected(slotIndex: number): void {
    this.playTone({
      frequency: 440 + slotIndex * 38,
      frequencyEnd: 660 + slotIndex * 22,
      durationSeconds: 0.055,
      gain: 0.028,
      category: "ui",
      type: "triangle"
    });
  }

  private playCoreThrown(mode: "projectile" | "hitscan"): void {
    if (mode === "hitscan") {
      this.playTone({
        frequency: 880,
        frequencyEnd: 260,
        durationSeconds: 0.095,
        gain: 0.06,
        category: "sfx",
        type: "sawtooth"
      });
      return;
    }

    this.playTone({
      frequency: 180,
      frequencyEnd: 80,
      durationSeconds: 0.12,
      gain: 0.065,
      category: "sfx",
      type: "triangle"
    });
    this.playNoise({ durationSeconds: 0.06, gain: 0.025, category: "sfx", filterFrequency: 900, pitch: 1.2 });
  }

  private playBlockDamaged(blockId: number, impactSpeed: number): void {
    const now = performance.now();
    if (now - this.lastDamageSoundAt < DAMAGE_SOUND_MIN_INTERVAL_MS) return;
    this.lastDamageSoundAt = now;

    const block = BLOCKS[blockId];
    const pitch = 110 + (block?.health ?? 1) * 6 + clamp(impactSpeed, 0, 16) * 8;
    this.playNoise({ durationSeconds: 0.045, gain: 0.035, category: "sfx", filterFrequency: pitch * 6, pitch });
  }

  private playBlockDestroyed(blockId: number, fragmentCount: number): void {
    const block = BLOCKS[blockId];
    const hardness = block?.health ?? 1;
    this.playNoise({
      durationSeconds: 0.12,
      gain: clamp(0.045 + fragmentCount * 0.00015, 0.045, 0.11),
      category: "sfx",
      filterFrequency: 180 + hardness * 45,
      pitch: 0.75
    });
    this.playTone({
      frequency: 72 + hardness * 8,
      frequencyEnd: 44,
      durationSeconds: 0.09,
      gain: 0.045,
      category: "sfx",
      type: "triangle"
    });
  }

  private playRubbleFormed(): void {
    const now = performance.now();
    if (now - this.lastRubbleSoundAt < RUBBLE_SOUND_MIN_INTERVAL_MS) return;
    this.lastRubbleSoundAt = now;
    this.playNoise({ durationSeconds: 0.07, gain: 0.035, category: "sfx", filterFrequency: 260, pitch: 0.6 });
  }

  private playRubbleDamaged(destroyed: boolean): void {
    const now = performance.now();
    if (now - this.lastRubbleSoundAt < RUBBLE_SOUND_MIN_INTERVAL_MS) return;
    this.lastRubbleSoundAt = now;
    this.playNoise({
      durationSeconds: destroyed ? 0.1 : 0.05,
      gain: destroyed ? 0.05 : 0.03,
      category: "sfx",
      filterFrequency: destroyed ? 230 : 360,
      pitch: 0.7
    });
  }

  private playFootstep(speedMetersPerSecond: number): void {
    this.playNoise({
      durationSeconds: 0.035,
      gain: clamp(0.018 + speedMetersPerSecond * 0.002, 0.018, 0.04),
      category: "sfx",
      filterFrequency: 300,
      pitch: 0.55
    });
  }

  private playLanding(verticalSpeed: number): void {
    this.playNoise({
      durationSeconds: 0.08,
      gain: clamp(0.025 + verticalSpeed * 0.006, 0.025, 0.09),
      category: "sfx",
      filterFrequency: 220,
      pitch: 0.45
    });
  }

  private playTone(options: ToneOptions): void {
    const context = this.getPlayableContext();
    const output = this.getCategoryGain(options.category);
    if (!context || !output) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(options.frequency, now);
    if (options.frequencyEnd !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.frequencyEnd), now + options.durationSeconds);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.durationSeconds);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(now);
    oscillator.stop(now + options.durationSeconds + 0.012);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  private playNoise(options: NoiseOptions): void {
    const context = this.getPlayableContext();
    const output = this.getCategoryGain(options.category);
    if (!context || !output) return;

    const now = context.currentTime;
    const buffer = this.createNoiseBuffer(context, options.durationSeconds, options.pitch ?? 1);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(options.filterFrequency ?? 500, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.durationSeconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(now);
    source.stop(now + options.durationSeconds + 0.012);
    source.addEventListener("ended", () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  private createNoiseBuffer(context: AudioContext, durationSeconds: number, pitch: number): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = 1 - index / frameCount;
      const stepped = Math.floor(index * Math.max(0.25, pitch));
      channel[index] = (hashNoise(stepped) * 2 - 1) * envelope;
    }
    return buffer;
  }

  private getPlayableContext(): AudioContext | null {
    if (!this.settings.enabled) return null;
    const context = this.ensureContext();
    if (!context || context.state !== "running") return null;
    return context;
  }

  private getCategoryGain(category: AudioCategory): GainNode | null {
    return category === "ui" ? this.uiGain : this.sfxGain;
  }

  private rampGain(param: AudioParam, value: number, now: number, duration: number): void {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(clamp(value, 0, 1), now, duration);
  }
}

function hashNoise(index: number): number {
  const hashed = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return hashed - Math.floor(hashed);
}
