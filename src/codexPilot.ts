import * as THREE from "three";
import type { AdminCommandResult } from "./adminCommands";
import { clamp } from "./math";
import type { PerformanceHitchLogPass, PerformanceHitchRecord } from "./performanceHitchLog";
import type { PlayerController } from "./player";
import { PLAYER_HEIGHT } from "./playerMovement";
import type { VoxelWorld } from "./world";

export const CODEX_PILOT_GLOBAL_NAME = "__VOXEL_CODEX_PILOT__";

const DEFAULT_MOVE_SECONDS = 0.6;
const MAX_MOVE_SECONDS = 8;
const DEFAULT_FIRE_COUNT = 1;
const MAX_FIRE_COUNT = 40;
const DEFAULT_FIRE_INTERVAL_MS = 120;
const MIN_FIRE_INTERVAL_MS = 16;
const MAX_FIRE_INTERVAL_MS = 3000;
const DEFAULT_ARENA_SETTLE_MS = 850;
const DEFAULT_PLAY_STEP_MS = 180;
const TARGET_EYE_OFFSET = 0.45;

export type CodexPilotWeapon = "selected" | "physics-core" | "hitscan-core";
export const CODEX_PILOT_PLAY_SCRIPTS = [
  "wall-range",
  "debris-grounding",
  "hitscan-tunnel",
  "builder-fixture",
  "free-roam"
] as const;
export type CodexPilotPlayScriptId = typeof CODEX_PILOT_PLAY_SCRIPTS[number];

export type CodexPilotPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type CodexPilotLookInput = {
  readonly yaw?: number;
  readonly pitch?: number;
};

export type CodexPilotLookAtInput = CodexPilotPosition & {
  readonly eyeOffset?: number;
};

export type CodexPilotMoveInput = {
  readonly forward?: number;
  readonly right?: number;
  readonly up?: number;
  readonly seconds?: number;
  readonly sprint?: boolean;
  readonly flight?: boolean;
};

export type CodexPilotFireInput = {
  readonly weapon?: CodexPilotWeapon;
  readonly count?: number;
  readonly intervalMs?: number;
  readonly ads?: boolean;
};

export type CodexPilotScenarioInput = {
  readonly name?: CodexPilotPlayScriptId;
  readonly freshSuperflat?: boolean;
};

export type CodexPilotSnapshot = {
  readonly active: boolean;
  readonly status: string;
  readonly worldActive: boolean;
  readonly selectedItem: string;
  readonly feetPosition: CodexPilotPosition | null;
  readonly cameraPosition: CodexPilotPosition;
  readonly yaw: number;
  readonly pitch: number;
  readonly flying: boolean;
  readonly speedMetersPerSecond: number;
  readonly heldKeys: readonly string[];
  readonly hitches: readonly PerformanceHitchRecord[];
};

export type CodexPilotPlayResult = {
  readonly script: CodexPilotPlayScriptId;
  readonly startedPass: PerformanceHitchLogPass | null;
  readonly steps: readonly string[];
  readonly snapshot: CodexPilotSnapshot;
};

export type CodexPilotApi = {
  snapshot(): CodexPilotSnapshot;
  startPass(label?: string): PerformanceHitchLogPass | null;
  run(command: string): AdminCommandResult;
  superflat(): Promise<CodexPilotSnapshot>;
  scenario(input?: CodexPilotScenarioInput | CodexPilotPlayScriptId): Promise<CodexPilotSnapshot>;
  teleportFeet(position: CodexPilotPosition, look?: CodexPilotLookInput): CodexPilotSnapshot;
  look(look: CodexPilotLookInput): CodexPilotSnapshot;
  lookAt(target: CodexPilotLookAtInput): CodexPilotSnapshot;
  move(input?: CodexPilotMoveInput): Promise<CodexPilotSnapshot>;
  fire(input?: CodexPilotFireInput): Promise<CodexPilotSnapshot>;
  play(script?: CodexPilotPlayScriptId): Promise<CodexPilotPlayResult>;
  stop(): CodexPilotSnapshot;
};

export type CodexPilotHooks = {
  isWorldActive(): boolean;
  getWorld(): VoxelWorld;
  getPlayer(): PlayerController;
  getCamera(): THREE.PerspectiveCamera;
  getSelectedItemLabel(): string;
  runAdminCommand(command: string): AdminCommandResult;
  createSuperflatWorld(): Promise<void>;
  selectWeapon(weapon: CodexPilotWeapon): boolean;
  fireSelectedPrimary(): void;
  setAdsActive(active: boolean): void;
  resumePlayer(): void;
  startHitchPass(label?: string): PerformanceHitchLogPass;
  getRecentHitches(): readonly PerformanceHitchRecord[];
  noteActivity(): void;
};

export type NormalizedCodexPilotMove = Required<CodexPilotMoveInput>;

export class CodexPilot {
  private readonly hooks: CodexPilotHooks;
  private readonly heldKeys = new Set<string>();
  private active = false;
  private status = "Idle";

  constructor(hooks: CodexPilotHooks) {
    this.hooks = hooks;
  }

  get api(): CodexPilotApi {
    return {
      snapshot: () => this.snapshot(),
      startPass: (label) => this.startPass(label),
      run: (command) => this.run(command),
      superflat: () => this.superflat(),
      scenario: (input) => this.scenario(input),
      teleportFeet: (position, look) => this.teleportFeet(position, look),
      look: (look) => this.look(look),
      lookAt: (target) => this.lookAt(target),
      move: (input) => this.move(input),
      fire: (input) => this.fire(input),
      play: (script) => this.play(script),
      stop: () => this.stop()
    };
  }

  snapshot(): CodexPilotSnapshot {
    const camera = this.hooks.getCamera();
    const player = this.tryGetPlayer();
    return {
      active: this.active,
      status: this.status,
      worldActive: this.hooks.isWorldActive(),
      selectedItem: this.hooks.getSelectedItemLabel(),
      feetPosition: player ? vectorToPosition(camera.position.clone().setY(player.getFeetY())) : null,
      cameraPosition: vectorToPosition(camera.position),
      yaw: player?.yaw ?? 0,
      pitch: player?.pitch ?? 0,
      flying: player?.flying ?? false,
      speedMetersPerSecond: player?.velocity.length() ?? 0,
      heldKeys: [...this.heldKeys].sort(),
      hitches: this.hooks.getRecentHitches()
    };
  }

  startPass(label = "codex-pilot"): PerformanceHitchLogPass | null {
    if (!this.hooks.isWorldActive()) return null;
    this.hooks.noteActivity();
    return this.hooks.startHitchPass(label);
  }

  run(command: string): AdminCommandResult {
    this.hooks.noteActivity();
    const result = this.hooks.runAdminCommand(command);
    this.status = result.message;
    return result;
  }

  async superflat(): Promise<CodexPilotSnapshot> {
    this.active = true;
    this.status = "Creating Superflat Lab for pilot play";
    this.hooks.noteActivity();
    await this.hooks.createSuperflatWorld();
    await wait(DEFAULT_ARENA_SETTLE_MS);
    this.status = "Superflat Lab ready";
    return this.snapshot();
  }

  async scenario(input: CodexPilotScenarioInput | CodexPilotPlayScriptId = {}): Promise<CodexPilotSnapshot> {
    const scenario = typeof input === "string" ? { name: input } : input;
    const name = scenario.name ?? "wall-range";
    if (scenario.freshSuperflat ?? !this.hooks.isWorldActive()) {
      await this.superflat();
    }

    this.ensureWorldActive();
    this.status = `Preparing ${name}`;
    this.hooks.noteActivity();
    if (name === "wall-range" || name === "debris-grounding" || name === "hitscan-tunnel") {
      this.run(name === "hitscan-tunnel" ? "spawn wall stone 9 4" : "spawn wall stone 8 4");
    } else if (name === "builder-fixture") {
      this.run("spawn platform grass 9");
    } else if (name === "free-roam") {
      this.run("spawn platform grass 9");
    }
    await wait(DEFAULT_ARENA_SETTLE_MS);
    return this.snapshot();
  }

  teleportFeet(position: CodexPilotPosition, look: CodexPilotLookInput = {}): CodexPilotSnapshot {
    this.ensureWorldActive();
    const player = this.hooks.getPlayer();
    player.teleportToFeetPosition(position, look.yaw ?? player.yaw, look.pitch ?? player.pitch);
    this.status = "Teleported pilot";
    this.hooks.noteActivity();
    return this.snapshot();
  }

  look(look: CodexPilotLookInput): CodexPilotSnapshot {
    this.ensureWorldActive();
    const player = this.hooks.getPlayer();
    setPlayerLook(
      player,
      Number.isFinite(look.yaw) ? look.yaw ?? player.yaw : player.yaw,
      Number.isFinite(look.pitch) ? look.pitch ?? player.pitch : player.pitch
    );
    this.status = "Pilot look adjusted";
    this.hooks.noteActivity();
    return this.snapshot();
  }

  lookAt(target: CodexPilotLookAtInput): CodexPilotSnapshot {
    this.ensureWorldActive();
    const player = this.hooks.getPlayer();
    const camera = this.hooks.getCamera();
    const targetPoint = new THREE.Vector3(
      target.x,
      target.y + (target.eyeOffset ?? TARGET_EYE_OFFSET),
      target.z
    );
    const { yaw, pitch } = createCodexPilotLookAtAngles(camera.position, targetPoint);
    setPlayerLook(player, yaw, pitch);
    this.status = "Pilot aimed at target";
    this.hooks.noteActivity();
    return this.snapshot();
  }

  async move(input: CodexPilotMoveInput = {}): Promise<CodexPilotSnapshot> {
    this.ensureWorldActive();
    const movement = normalizeCodexPilotMove(input);
    const keys = createCodexPilotMoveKeys(movement);
    const player = this.hooks.getPlayer();
    this.active = true;
    this.status = "Pilot moving";
    this.hooks.resumePlayer();
    player.setFlightEnabled(movement.flight || player.flying);
    this.pressKeys(keys);
    this.hooks.noteActivity();
    await wait(movement.seconds * 1000);
    this.releaseKeys(keys);
    this.status = "Pilot move complete";
    this.hooks.noteActivity();
    return this.snapshot();
  }

  async fire(input: CodexPilotFireInput = {}): Promise<CodexPilotSnapshot> {
    this.ensureWorldActive();
    const fireInput = normalizeCodexPilotFireInput(input);
    const selected = fireInput.weapon === "selected" || this.hooks.selectWeapon(fireInput.weapon);
    if (!selected) {
      this.status = `Could not select ${fireInput.weapon}`;
      return this.snapshot();
    }

    this.active = true;
    this.status = `Firing ${fireInput.weapon}`;
    this.hooks.resumePlayer();
    this.hooks.setAdsActive(fireInput.ads);
    this.hooks.noteActivity();

    for (let shot = 0; shot < fireInput.count; shot += 1) {
      this.hooks.fireSelectedPrimary();
      if (shot < fireInput.count - 1) await wait(fireInput.intervalMs);
    }

    this.hooks.setAdsActive(false);
    this.status = "Pilot fire complete";
    return this.snapshot();
  }

  async play(script: CodexPilotPlayScriptId = "wall-range"): Promise<CodexPilotPlayResult> {
    const steps: string[] = [];
    let startedPass = this.hooks.isWorldActive()
      ? this.hooks.startHitchPass(`codex-pilot-${script}`)
      : null;
    this.active = true;
    this.status = `Playing ${script}`;
    steps.push("started");

    if (script === "wall-range") {
      await this.scenario({ name: "wall-range", freshSuperflat: true });
      startedPass = this.hooks.startHitchPass(`codex-pilot-${script}`);
      steps.push("superflat wall-range");
      await this.move({ forward: -1, seconds: 0.45, flight: true });
      steps.push("backed up");
      await this.fire({ weapon: "physics-core", count: 3, intervalMs: 260 });
      steps.push("physics core burst");
      await this.fire({ weapon: "hitscan-core", count: 5, intervalMs: 120, ads: true });
      steps.push("ads hitscan burst");
      await this.move({ right: 1, seconds: 0.35, flight: true });
      await this.move({ right: -1, seconds: 0.35, flight: true });
      steps.push("strafe check");
    } else if (script === "debris-grounding") {
      await this.scenario({ name: "debris-grounding", freshSuperflat: true });
      startedPass = this.hooks.startHitchPass(`codex-pilot-${script}`);
      steps.push("superflat debris wall");
      await this.move({ forward: -1, seconds: 0.55, flight: true });
      steps.push("backed up for debris view");
      await this.fire({ weapon: "physics-core", count: 7, intervalMs: 220 });
      steps.push("physics debris burst");
      await wait(1250);
      steps.push("settle watch");
      await this.move({ right: 1, seconds: 0.45, flight: true });
      await this.move({ right: -1, seconds: 0.45, flight: true });
      steps.push("grounding parallax sweep");
    } else if (script === "hitscan-tunnel") {
      await this.scenario({ name: "hitscan-tunnel", freshSuperflat: true });
      startedPass = this.hooks.startHitchPass(`codex-pilot-${script}`);
      steps.push("superflat tunnel wall");
      await this.move({ forward: -1, seconds: 0.45, flight: true });
      steps.push("backed up for beam view");
      await this.fire({ weapon: "hitscan-core", count: 16, intervalMs: 75, ads: true });
      steps.push("ads hitscan drilling burst");
      await wait(700);
      await this.move({ right: 1, seconds: 0.35, flight: true });
      await this.move({ right: -1, seconds: 0.35, flight: true });
      steps.push("tunnel/debris visibility sweep");
    } else if (script === "builder-fixture") {
      await this.scenario({ name: "builder-fixture", freshSuperflat: true });
      startedPass = this.hooks.startHitchPass(`codex-pilot-${script}`);
      steps.push("superflat builder platform");
      this.run("spawn wall stone 6 3");
      steps.push("spawned builder wall fixture");
      await wait(450);
      await this.move({ right: 1, seconds: 0.55, flight: true });
      this.run("spawn pillar dirt 5");
      steps.push("spawned offset pillar fixture");
      await wait(450);
      await this.move({ right: -1, seconds: 0.55, flight: true });
      steps.push("builder fixture sweep");
    } else {
      if (!this.hooks.isWorldActive()) {
        await this.superflat();
        steps.push("superflat free-roam fallback");
      }
      await this.move({ forward: 1, seconds: 1.2, sprint: true, flight: true });
      await this.fire({ weapon: "hitscan-core", count: 3, intervalMs: 160 });
      steps.push("free roam burst");
    }

    await wait(DEFAULT_PLAY_STEP_MS);
    this.status = `Finished ${script}`;
    return {
      script,
      startedPass,
      steps,
      snapshot: this.snapshot()
    };
  }

  stop(): CodexPilotSnapshot {
    this.releaseKeys([...this.heldKeys]);
    this.hooks.setAdsActive(false);
    this.active = false;
    this.status = "Stopped";
    this.hooks.noteActivity();
    return this.snapshot();
  }

  dispose(): void {
    this.stop();
  }

  private ensureWorldActive(): void {
    if (!this.hooks.isWorldActive()) {
      throw new Error("Codex Pilot needs an active world. Call superflat() or load a world first.");
    }
  }

  private tryGetPlayer(): PlayerController | null {
    try {
      return this.hooks.isWorldActive() ? this.hooks.getPlayer() : null;
    } catch {
      return null;
    }
  }

  private pressKeys(keys: readonly string[]): void {
    const player = this.hooks.getPlayer();
    for (const key of keys) {
      player.keys.add(key);
      this.heldKeys.add(key);
    }
  }

  private releaseKeys(keys: readonly string[]): void {
    const player = this.tryGetPlayer();
    for (const key of keys) {
      player?.keys.delete(key);
      this.heldKeys.delete(key);
    }
  }
}

export function normalizeCodexPilotMove(input: CodexPilotMoveInput = {}): NormalizedCodexPilotMove {
  return {
    forward: normalizeAxis(input.forward),
    right: normalizeAxis(input.right),
    up: normalizeAxis(input.up),
    seconds: clampFinite(input.seconds, DEFAULT_MOVE_SECONDS, 0, MAX_MOVE_SECONDS),
    sprint: input.sprint === true,
    flight: input.flight === true
  };
}

export function normalizeCodexPilotPlayScriptId(value: unknown): CodexPilotPlayScriptId {
  if (typeof value !== "string") return "wall-range";
  const normalized = value.trim().toLowerCase();
  return CODEX_PILOT_PLAY_SCRIPTS.includes(normalized as CodexPilotPlayScriptId)
    ? normalized as CodexPilotPlayScriptId
    : "wall-range";
}

export function createCodexPilotMoveKeys(move: NormalizedCodexPilotMove): readonly string[] {
  const keys: string[] = [];
  if (move.forward > 0) keys.push("KeyW");
  if (move.forward < 0) keys.push("KeyS");
  if (move.right > 0) keys.push("KeyD");
  if (move.right < 0) keys.push("KeyA");
  if (move.up > 0) keys.push("Space");
  if (move.up < 0) keys.push("KeyC");
  if (move.sprint) keys.push("ShiftLeft");
  return keys;
}

export function normalizeCodexPilotFireInput(input: CodexPilotFireInput = {}): Required<CodexPilotFireInput> {
  return {
    weapon: normalizeCodexPilotWeapon(input.weapon),
    count: Math.round(clampFinite(input.count, DEFAULT_FIRE_COUNT, 1, MAX_FIRE_COUNT)),
    intervalMs: Math.round(clampFinite(input.intervalMs, DEFAULT_FIRE_INTERVAL_MS, MIN_FIRE_INTERVAL_MS, MAX_FIRE_INTERVAL_MS)),
    ads: input.ads === true
  };
}

export function normalizeCodexPilotWeapon(weapon: unknown): CodexPilotWeapon {
  if (weapon === "physics-core" || weapon === "hitscan-core" || weapon === "selected") return weapon;
  return "selected";
}

export function createCodexPilotLookAtAngles(
  origin: THREE.Vector3,
  target: THREE.Vector3
): { readonly yaw: number; readonly pitch: number } {
  const direction = target.clone().sub(origin);
  if (direction.lengthSq() <= 0.000001) {
    return { yaw: 0, pitch: 0 };
  }
  direction.normalize();
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.atan2(direction.y, Math.hypot(direction.x, direction.z))
  };
}

function setPlayerLook(player: PlayerController, yaw: number, pitch: number): void {
  player.yaw = Number.isFinite(yaw) ? yaw : player.yaw;
  player.pitch = clamp(
    Number.isFinite(pitch) ? pitch : player.pitch,
    -Math.PI / 2 + 0.02,
    Math.PI / 2 - 0.02
  );
  player.camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
}

function normalizeAxis(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function vectorToPosition(vector: THREE.Vector3): CodexPilotPosition {
  return {
    x: roundSnapshotNumber(vector.x),
    y: roundSnapshotNumber(vector.y),
    z: roundSnapshotNumber(vector.z)
  };
}

function roundSnapshotNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
