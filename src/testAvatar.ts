import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks";
import { PARTIAL_BLOCK_CORE_DAMAGE } from "./partialBlocks";
import { PLAYER_HEIGHT } from "./playerMovement";
import type { PlayerController } from "./player";
import type { VoxelWorld } from "./world";

export const TEST_AVATAR_TOGGLE_KEY = "F8";
export const TEST_AVATAR_QUERY_PARAM = "testAvatar";
export const DEFAULT_TEST_AVATAR_SCENARIO: TestAvatarScenarioId = "core-break";

const CORE_BREAK_SHOT_DELAY_SECONDS = 0.35;
const CORE_BREAK_OBSERVE_SECONDS = 1.15;
const CORE_BREAK_DONE_SECONDS = 1.6;
const CORE_BREAK_STAGED_BLOCK = BLOCK.stone;

export type TestAvatarScenarioId = "core-break";
type TestAvatarStep = "idle" | "setup" | "aiming" | `shot-${number}` | `observe-${number}` | "done" | "failed";

export type TestAvatarPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type CoreBreakTestPlan = {
  readonly target: TestAvatarPosition;
  readonly aimPoint: THREE.Vector3;
  readonly feetPosition: TestAvatarPosition;
  readonly yaw: number;
  readonly pitch: number;
};

export type TestAvatarSnapshot = {
  readonly active: boolean;
  readonly scenario: TestAvatarScenarioId | null;
  readonly step: TestAvatarStep;
  readonly shotsFired: number;
  readonly status: string;
  readonly target: TestAvatarPosition | null;
  readonly observations: readonly string[];
};

export type TestAvatarApi = {
  start(scenario?: TestAvatarScenarioId): TestAvatarSnapshot;
  stop(): TestAvatarSnapshot;
  toggle(scenario?: TestAvatarScenarioId): TestAvatarSnapshot;
  snapshot(): TestAvatarSnapshot;
};

export type TestAvatarHooks = {
  isWorldActive(): boolean;
  getWorld(): VoxelWorld;
  getPlayer(): PlayerController;
  getCamera(): THREE.PerspectiveCamera;
  throwPlayerCore(): void;
  noteActivity(): void;
};

type CoreBreakScenarioState = {
  readonly plan: CoreBreakTestPlan;
  readonly requiredShots: number;
  secondsInStep: number;
  shotsFired: number;
};

type OverlayFields = {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly scenario: HTMLElement;
  readonly step: HTMLElement;
  readonly target: HTMLElement;
  readonly observations: HTMLElement;
};

export class TestAvatar {
  private readonly hooks: TestAvatarHooks;
  private readonly overlay: OverlayFields;
  private activeScenario: TestAvatarScenarioId | null = null;
  private step: TestAvatarStep = "idle";
  private status = "Idle";
  private observations: string[] = [];
  private coreBreak: CoreBreakScenarioState | null = null;

  constructor(hooks: TestAvatarHooks) {
    this.hooks = hooks;
    this.overlay = createOverlay();
    this.renderOverlay();
  }

  get api(): TestAvatarApi {
    return {
      start: (scenario = DEFAULT_TEST_AVATAR_SCENARIO) => this.start(scenario),
      stop: () => this.stop(),
      toggle: (scenario = DEFAULT_TEST_AVATAR_SCENARIO) => this.toggle(scenario),
      snapshot: () => this.snapshot()
    };
  }

  start(scenario: TestAvatarScenarioId = DEFAULT_TEST_AVATAR_SCENARIO): TestAvatarSnapshot {
    this.activeScenario = scenario;
    this.step = "setup";
    this.status = "Preparing scripted run";
    this.observations = [];
    this.coreBreak = null;
    this.overlay.root.hidden = false;
    this.hooks.noteActivity();
    this.renderOverlay();
    return this.snapshot();
  }

  stop(): TestAvatarSnapshot {
    this.activeScenario = null;
    this.step = "idle";
    this.status = "Stopped";
    this.coreBreak = null;
    this.renderOverlay();
    return this.snapshot();
  }

  toggle(scenario: TestAvatarScenarioId = DEFAULT_TEST_AVATAR_SCENARIO): TestAvatarSnapshot {
    return this.activeScenario ? this.stop() : this.start(scenario);
  }

  update(deltaSeconds: number): void {
    if (!this.activeScenario) return;
    if (!this.hooks.isWorldActive()) {
      this.status = "Waiting for an active world";
      this.renderOverlay();
      return;
    }

    if (this.activeScenario === "core-break") {
      this.updateCoreBreak(deltaSeconds);
    }
  }

  snapshot(): TestAvatarSnapshot {
    return {
      active: this.activeScenario !== null,
      scenario: this.activeScenario,
      step: this.step,
      shotsFired: this.coreBreak?.shotsFired ?? 0,
      status: this.status,
      target: this.coreBreak?.plan.target ?? null,
      observations: [...this.observations]
    };
  }

  dispose(): void {
    this.overlay.root.remove();
  }

  private updateCoreBreak(deltaSeconds: number): void {
    if (this.step === "setup") {
      this.setupCoreBreak();
      return;
    }

    const state = this.coreBreak;
    if (!state) {
      this.fail("Core break scenario has no plan");
      return;
    }

    state.secondsInStep += deltaSeconds;
    if (this.step === "aiming" && state.secondsInStep >= CORE_BREAK_SHOT_DELAY_SECONDS) {
      this.fireCore();
      return;
    }

    if (this.step.startsWith("observe-") && state.secondsInStep >= CORE_BREAK_OBSERVE_SECONDS) {
      this.recordCoreBreakObservation(`after shot ${state.shotsFired}`);
      if (this.hasCoreBreakTargetFinished() || state.shotsFired >= state.requiredShots) {
        this.step = "done";
        state.secondsInStep = 0;
        this.status = "Scenario complete";
        this.renderOverlay();
        return;
      }
      this.fireCore();
      this.renderOverlay();
      return;
    }

    if (this.step === "done" && state.secondsInStep >= CORE_BREAK_DONE_SECONDS) {
      this.status = "Complete; leaving results visible";
      this.renderOverlay();
    }
  }

  private setupCoreBreak(): void {
    const world = this.hooks.getWorld();
    world.ensureChunksAround(this.hooks.getCamera().position.x, this.hooks.getCamera().position.z, 1);
    const plan = createCoreBreakTestPlan(world, this.hooks.getCamera().position);
    if (!plan) {
      this.fail("Could not find a safe terrain test target");
      return;
    }

    // The avatar stages one ordinary voxel above live terrain, then uses the
    // real player/core path so this stays an integration test instead of a mock.
    world.setBlock(plan.target.x, plan.target.y, plan.target.z, CORE_BREAK_STAGED_BLOCK);
    this.hooks.getPlayer().teleportToFeetPosition(plan.feetPosition, plan.yaw, plan.pitch);
    this.coreBreak = {
      plan,
      requiredShots: getRequiredCoreBreakShots(),
      secondsInStep: 0,
      shotsFired: 0
    };
    this.step = "aiming";
    this.status = "Aiming at staged terrain target";
    this.observations.push(formatTarget(plan.target));
    this.renderOverlay();
  }

  private fireCore(): void {
    const state = this.coreBreak;
    if (!state) {
      this.fail("Cannot fire without a target plan");
      return;
    }

    const shotNumber = state.shotsFired + 1;
    this.step = `shot-${shotNumber}`;
    this.status = `Shot ${shotNumber} fired`;
    this.hooks.throwPlayerCore();
    state.shotsFired += 1;
    state.secondsInStep = 0;
    this.step = `observe-${shotNumber}`;
    this.renderOverlay();
  }

  private hasCoreBreakTargetFinished(): boolean {
    const state = this.coreBreak;
    if (!state) return false;
    const target = state.plan.target;
    return this.hooks.getWorld().getBlock(target.x, target.y, target.z) === BLOCK.air;
  }

  private recordCoreBreakObservation(label: string): void {
    const state = this.coreBreak;
    if (!state) return;

    const world = this.hooks.getWorld();
    const target = state.plan.target;
    const block = world.getBlock(target.x, target.y, target.z);
    const damage = world.getBlockDamage(target.x, target.y, target.z);
    const blockName = BLOCKS[block]?.name ?? `Block ${block}`;
    this.observations.push(`${label}: ${blockName}, damage ${damage}`);
  }

  private fail(message: string): void {
    this.step = "failed";
    this.status = message;
    this.activeScenario = null;
    this.renderOverlay();
  }

  private renderOverlay(): void {
    const snapshot = this.snapshot();
    this.overlay.root.hidden = snapshot.step === "idle" && !snapshot.active;
    this.overlay.root.dataset.state = snapshot.step;
    this.overlay.status.textContent = snapshot.status;
    this.overlay.scenario.textContent = snapshot.scenario ?? "none";
    this.overlay.step.textContent = `${snapshot.step} | shots ${snapshot.shotsFired}`;
    this.overlay.target.textContent = snapshot.target ? formatTarget(snapshot.target) : "no target";
    this.overlay.observations.textContent = snapshot.observations.slice(-4).join("\n") || "No observations yet";
  }
}

export function createCoreBreakTestPlan(
  world: Pick<VoxelWorld, "getBlock" | "highestSolidY">,
  cameraPosition: THREE.Vector3
): CoreBreakTestPlan | null {
  const originX = Math.floor(cameraPosition.x);
  const originZ = Math.floor(cameraPosition.z);
  const candidateOffsets = [
    [5, 0],
    [0, 5],
    [-5, 0],
    [0, -5],
    [5, 3],
    [-5, 3],
    [5, -3],
    [-5, -3]
  ] as const;

  for (const [dx, dz] of candidateOffsets) {
    const targetX = originX + dx;
    const targetZ = originZ + dz;
    const groundY = world.highestSolidY(targetX, targetZ);
    const targetY = groundY + 1;
    if (targetY < 1 || world.getBlock(targetX, targetY, targetZ) !== BLOCK.air) continue;

    const feetPosition = createVantageFeetPosition(world, targetX, targetY, targetZ);
    const eyePosition = new THREE.Vector3(
      feetPosition.x,
      feetPosition.y + PLAYER_HEIGHT,
      feetPosition.z
    );
    const aimPoint = new THREE.Vector3(targetX + 0.5, targetY + 0.12, targetZ + 0.5);
    const distance = eyePosition.distanceTo(aimPoint);
    if (distance < 2 || distance > 12) continue;

    const { yaw, pitch } = createYawPitchToward(eyePosition, aimPoint);
    return {
      target: { x: targetX, y: targetY, z: targetZ },
      aimPoint,
      feetPosition,
      yaw,
      pitch
    };
  }

  return null;
}

export function createYawPitchToward(origin: THREE.Vector3, target: THREE.Vector3): {
  readonly yaw: number;
  readonly pitch: number;
} {
  const direction = target.clone().sub(origin).normalize();
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.atan2(direction.y, Math.hypot(direction.x, direction.z))
  };
}

function getRequiredCoreBreakShots(): number {
  const health = BLOCKS[CORE_BREAK_STAGED_BLOCK]?.health ?? 1;
  return Math.max(1, Math.ceil(health / Math.max(0.001, PARTIAL_BLOCK_CORE_DAMAGE)));
}

function createVantageFeetPosition(
  world: Pick<VoxelWorld, "highestSolidY">,
  targetX: number,
  targetY: number,
  targetZ: number
): TestAvatarPosition {
  const viewX = targetX + 3.35;
  const viewZ = targetZ + 2.6;
  const viewGroundY = world.highestSolidY(Math.floor(viewX), Math.floor(viewZ));
  return {
    x: viewX,
    y: Math.max(viewGroundY + 1.05, targetY - 0.2),
    z: viewZ
  };
}

function createOverlay(): OverlayFields {
  const root = document.createElement("section");
  root.className = "test-avatar-panel";
  root.hidden = true;
  root.dataset.testid = "test-avatar-panel";
  root.setAttribute("aria-live", "polite");

  const title = document.createElement("strong");
  title.textContent = "Test Avatar";
  const status = createOverlayRow(root, "Status");
  const scenario = createOverlayRow(root, "Scenario");
  const step = createOverlayRow(root, "Step");
  const target = createOverlayRow(root, "Target");
  const observations = document.createElement("pre");
  observations.className = "test-avatar-observations";

  root.prepend(title);
  root.append(observations);
  document.body.append(root);

  return {
    root,
    status,
    scenario,
    step,
    target,
    observations
  };
}

function createOverlayRow(root: HTMLElement, label: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "test-avatar-row";
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("b");
  row.append(labelNode, valueNode);
  root.append(row);
  return valueNode;
}

function formatTarget(target: TestAvatarPosition): string {
  return `${target.x}, ${target.y}, ${target.z}`;
}
