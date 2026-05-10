import * as THREE from "three";
import { BLOCK, BLOCKS, type BlockId } from "./blocks";
import type { PlayerController } from "./player";
import type { VoxelWorld } from "./world";

export const ADMIN_COMMAND_TOGGLE_KEY = "F9";

const DEFAULT_SPAWN_DISTANCE = 5;
const DEFAULT_TARGET_WIDTH = 4;
const DEFAULT_TARGET_HEIGHT = 4;
const DEFAULT_WALL_WIDTH = 8;
const DEFAULT_WALL_HEIGHT = 5;
const DEFAULT_PILLAR_HEIGHT = 8;
const DEFAULT_PLATFORM_SIZE = 7;

export type AdminCommandResult = {
  readonly ok: boolean;
  readonly message: string;
};

export type AdminCommandApi = {
  run(command: string): AdminCommandResult;
  open(): void;
  close(): void;
  toggle(): void;
};

export type AdminCommandHooks = {
  isWorldActive(): boolean;
  getWorld(): VoxelWorld;
  getPlayer(): PlayerController;
  getCamera(): THREE.PerspectiveCamera;
  createSuperflatWorld(): Promise<void>;
  noteActivity(): void;
};

export type ParsedAdminCommand = {
  readonly name: string;
  readonly args: readonly string[];
};

type SpawnHooks = Pick<AdminCommandHooks, "getWorld" | "getCamera">;

type AdminCommandElements = {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly output: HTMLElement;
};

type SpawnArgs = {
  readonly block: BlockId;
  readonly numbers: readonly string[];
};

export class AdminCommandConsole {
  private readonly hooks: AdminCommandHooks;
  private readonly elements: AdminCommandElements;
  private resumePlayerOnClose = false;

  constructor(hooks: AdminCommandHooks) {
    this.hooks = hooks;
    this.elements = createAdminCommandElements();
    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const command = this.elements.input.value.trim();
      if (!command) return;
      this.elements.input.value = "";
      const result = this.run(command);
      this.writeLine(`> ${command}`);
      this.writeLine(result.message, result.ok ? "ok" : "error");
    });
    this.elements.root.addEventListener("keydown", (event) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      this.close();
    });
  }

  get api(): AdminCommandApi {
    return {
      run: (command) => this.run(command),
      open: () => this.open(),
      close: () => this.close(),
      toggle: () => this.toggle()
    };
  }

  open(): void {
    this.elements.root.hidden = false;
    this.elements.input.focus();
    if (this.hooks.isWorldActive()) {
      const player = this.hooks.getPlayer();
      this.resumePlayerOnClose = player.isLooking();
      player.suspendForTextInput();
    }
  }

  close(): void {
    this.elements.root.hidden = true;
    if (this.resumePlayerOnClose && this.hooks.isWorldActive()) this.hooks.getPlayer().resume();
    this.resumePlayerOnClose = false;
  }

  toggle(): void {
    if (this.elements.root.hidden) {
      this.open();
    } else {
      this.close();
    }
  }

  run(commandText: string): AdminCommandResult {
    this.hooks.noteActivity();
    const command = parseAdminCommand(commandText);
    if (!command) return { ok: false, message: "No command entered." };

    if (command.name === "help") return createHelpResult();
    if (command.name === "superflat" || command.name === "new-superflat") {
      void this.hooks.createSuperflatWorld();
      return { ok: true, message: "Creating a new Superflat Lab world." };
    }

    if (!this.hooks.isWorldActive()) {
      return { ok: false, message: "Load a world before spawning terrain fixtures." };
    }

    if (command.name === "spawn") return this.runSpawnCommand(command.args);
    return { ok: false, message: `Unknown command "${command.name}". Try "help".` };
  }

  dispose(): void {
    this.elements.root.remove();
  }

  private runSpawnCommand(args: readonly string[]): AdminCommandResult {
    const feature = args[0] ?? "target";
    const spawnArgs = readSpawnArgs(args.slice(1), BLOCK.stone);

    if (feature === "target") {
      const count = spawnWallFixture(this.hooks, spawnArgs.block, DEFAULT_TARGET_WIDTH, DEFAULT_TARGET_HEIGHT);
      return { ok: true, message: `Spawned target wall (${count} ${getBlockName(spawnArgs.block)} blocks).` };
    }

    if (feature === "wall") {
      const width = readPositiveInt(spawnArgs.numbers[0], DEFAULT_WALL_WIDTH, 1, 24);
      const height = readPositiveInt(spawnArgs.numbers[1], DEFAULT_WALL_HEIGHT, 1, 16);
      const count = spawnWallFixture(this.hooks, spawnArgs.block, width, height);
      return { ok: true, message: `Spawned ${width}x${height} ${getBlockName(spawnArgs.block)} wall.` };
    }

    if (feature === "pillar") {
      const height = readPositiveInt(spawnArgs.numbers[0], DEFAULT_PILLAR_HEIGHT, 1, 32);
      const count = spawnPillarFixture(this.hooks, spawnArgs.block, height);
      return { ok: true, message: `Spawned ${height}m ${getBlockName(spawnArgs.block)} pillar (${count} blocks).` };
    }

    if (feature === "platform") {
      const size = readPositiveInt(spawnArgs.numbers[0], DEFAULT_PLATFORM_SIZE, 1, 24);
      const count = spawnPlatformFixture(this.hooks, spawnArgs.block, size);
      return { ok: true, message: `Spawned ${size}x${size} ${getBlockName(spawnArgs.block)} platform.` };
    }

    return {
      ok: false,
      message: `Unknown spawn feature "${feature}". Try "spawn target", "spawn wall stone 8 5", "spawn pillar 8", or "spawn platform dirt 7".`
    };
  }

  private writeLine(message: string, state: "ok" | "error" | "normal" = "normal"): void {
    const line = document.createElement("div");
    line.className = `admin-command-line is-${state}`;
    line.textContent = message;
    this.elements.output.append(line);
    while (this.elements.output.childElementCount > 8) {
      this.elements.output.firstElementChild?.remove();
    }
    this.elements.output.scrollTop = this.elements.output.scrollHeight;
  }
}

export function parseAdminCommand(commandText: string): ParsedAdminCommand | null {
  const parts = commandText.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return {
    name: parts[0].toLowerCase(),
    args: parts.slice(1).map((part) => part.toLowerCase())
  };
}

export function spawnWallFixture(
  hooks: SpawnHooks,
  block: BlockId,
  width: number,
  height: number
): number {
  const world = hooks.getWorld();
  const frame = createSpawnFrame(hooks.getCamera(), DEFAULT_SPAWN_DISTANCE);
  const centerX = Math.floor(frame.center.x);
  const centerZ = Math.floor(frame.center.z);
  world.ensureChunksAround(centerX, centerZ, 1);
  const baseY = world.highestSolidY(centerX, centerZ) + 1;
  let count = 0;

  for (let xOffset = -Math.floor(width / 2); xOffset < Math.ceil(width / 2); xOffset += 1) {
    for (let yOffset = 0; yOffset < height; yOffset += 1) {
      const position = frame.center.clone().addScaledVector(frame.right, xOffset).floor();
      world.setBlock(position.x, baseY + yOffset, position.z, block);
      count += 1;
    }
  }

  return count;
}

export function spawnPillarFixture(hooks: SpawnHooks, block: BlockId, height: number): number {
  const world = hooks.getWorld();
  const frame = createSpawnFrame(hooks.getCamera(), DEFAULT_SPAWN_DISTANCE);
  const x = Math.floor(frame.center.x);
  const z = Math.floor(frame.center.z);
  world.ensureChunksAround(x, z, 1);
  const baseY = world.highestSolidY(x, z) + 1;

  for (let yOffset = 0; yOffset < height; yOffset += 1) {
    world.setBlock(x, baseY + yOffset, z, block);
  }
  return height;
}

export function spawnPlatformFixture(hooks: SpawnHooks, block: BlockId, size: number): number {
  const world = hooks.getWorld();
  const frame = createSpawnFrame(hooks.getCamera(), DEFAULT_SPAWN_DISTANCE);
  const half = Math.floor(size / 2);
  const centerX = Math.floor(frame.center.x);
  const centerZ = Math.floor(frame.center.z);
  world.ensureChunksAround(centerX, centerZ, 1);
  const y = world.highestSolidY(centerX, centerZ) + 1;
  let count = 0;

  for (let rightOffset = -half; rightOffset <= size - half - 1; rightOffset += 1) {
    for (let forwardOffset = -half; forwardOffset <= size - half - 1; forwardOffset += 1) {
      const position = frame.center
        .clone()
        .addScaledVector(frame.right, rightOffset)
        .addScaledVector(frame.forward, forwardOffset)
        .floor();
      world.setBlock(position.x, y, position.z, block);
      count += 1;
    }
  }

  return count;
}

function createSpawnFrame(camera: THREE.PerspectiveCamera, distance: number): {
  readonly center: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly right: THREE.Vector3;
} {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();

  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  return {
    center: camera.position.clone().addScaledVector(forward, distance),
    forward,
    right
  };
}

function readSpawnArgs(args: readonly string[], defaultBlock: BlockId): SpawnArgs {
  const maybeBlock = readBlockArg(args[0]);
  if (maybeBlock !== null) {
    return { block: maybeBlock, numbers: args.slice(1) };
  }
  return { block: defaultBlock, numbers: args };
}

function readBlockArg(value: string | undefined): BlockId | null {
  if (!value) return null;
  for (const block of Object.values(BLOCK)) {
    if (block === BLOCK.air) continue;
    if (BLOCKS[block].name.toLowerCase() === value) return block as BlockId;
  }
  return null;
}

function readPositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function getBlockName(block: number): string {
  return BLOCKS[block]?.name ?? `Block ${block}`;
}

function createHelpResult(): AdminCommandResult {
  return {
    ok: true,
    message: "Commands: superflat | spawn target [block] | spawn wall [block] [width] [height] | spawn pillar [block] [height] | spawn platform [block] [size]"
  };
}

function createAdminCommandElements(): AdminCommandElements {
  const root = document.createElement("section");
  root.className = "admin-command-panel";
  root.hidden = true;
  root.dataset.testid = "admin-command-panel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Admin command console");

  const title = document.createElement("strong");
  title.textContent = "Admin Commands";
  const hint = document.createElement("div");
  hint.className = "admin-command-hint";
  hint.textContent = "Try: spawn target | spawn wall stone 8 5 | superflat";
  const output = document.createElement("div");
  output.className = "admin-command-output";
  const form = document.createElement("form");
  form.className = "admin-command-form";
  const input = document.createElement("input");
  input.className = "admin-command-input";
  input.type = "text";
  input.placeholder = "admin command";
  input.autocomplete = "off";
  const submit = document.createElement("button");
  submit.className = "admin-command-submit";
  submit.type = "submit";
  submit.textContent = "Run";

  form.append(input, submit);
  root.append(title, hint, output, form);
  document.body.append(root);

  return { root, form, input, output };
}
