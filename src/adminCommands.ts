import * as THREE from "three";
import { BLOCK, BLOCKS, type BlockId } from "./blocks";
import type { VoxelWorld } from "./world";

export const ADMIN_COMMAND_TOGGLE_KEY = "F9";
const ADMIN_COMMAND_NAMES = new Set(["help", "superflat", "new-superflat", "spawn"]);

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
};

export type AdminCommandHooks = {
  isWorldActive(): boolean;
  getWorld(): VoxelWorld;
  getCamera(): THREE.PerspectiveCamera;
  createSuperflatWorld(): Promise<void>;
  noteActivity(): void;
};

export type ParsedAdminCommand = {
  readonly name: string;
  readonly args: readonly string[];
};

type SpawnHooks = Pick<AdminCommandHooks, "getWorld" | "getCamera">;

type SpawnArgs = {
  readonly block: BlockId;
  readonly numbers: readonly string[];
};

export function parseAdminCommand(commandText: string): ParsedAdminCommand | null {
  const parts = commandText.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return {
    name: parts[0].toLowerCase(),
    args: parts.slice(1).map((part) => part.toLowerCase())
  };
}

export function isAdminCommandInput(commandText: string): boolean {
  const parsed = parseAdminCommand(commandText);
  return parsed !== null && ADMIN_COMMAND_NAMES.has(parsed.name);
}

export function runAdminCommand(hooks: AdminCommandHooks, commandText: string): AdminCommandResult {
  hooks.noteActivity();
  const command = parseAdminCommand(commandText);
  if (!command) return { ok: false, message: "No command entered." };

  if (command.name === "help") return createHelpResult();
  if (command.name === "superflat" || command.name === "new-superflat") {
    void hooks.createSuperflatWorld();
    return { ok: true, message: "Creating a new Superflat Lab world." };
  }

  if (!hooks.isWorldActive()) {
    return { ok: false, message: "Load a world before spawning terrain fixtures." };
  }

  if (command.name === "spawn") return runAdminSpawnCommand(hooks, command.args);
  return { ok: false, message: `Unknown command "${command.name}". Try "help".` };
}

function runAdminSpawnCommand(hooks: AdminCommandHooks, args: readonly string[]): AdminCommandResult {
  const feature = args[0] ?? "target";
  const spawnArgs = readSpawnArgs(args.slice(1), BLOCK.stone);

  if (feature === "target") {
    const count = spawnWallFixture(hooks, spawnArgs.block, DEFAULT_TARGET_WIDTH, DEFAULT_TARGET_HEIGHT);
    return { ok: true, message: `Spawned target wall (${count} ${getBlockName(spawnArgs.block)} blocks).` };
  }

  if (feature === "wall") {
    const width = readPositiveInt(spawnArgs.numbers[0], DEFAULT_WALL_WIDTH, 1, 24);
    const height = readPositiveInt(spawnArgs.numbers[1], DEFAULT_WALL_HEIGHT, 1, 16);
    const count = spawnWallFixture(hooks, spawnArgs.block, width, height);
    return { ok: true, message: `Spawned ${width}x${height} ${getBlockName(spawnArgs.block)} wall.` };
  }

  if (feature === "pillar") {
    const height = readPositiveInt(spawnArgs.numbers[0], DEFAULT_PILLAR_HEIGHT, 1, 32);
    const count = spawnPillarFixture(hooks, spawnArgs.block, height);
    return { ok: true, message: `Spawned ${height}m ${getBlockName(spawnArgs.block)} pillar (${count} blocks).` };
  }

  if (feature === "platform") {
    const size = readPositiveInt(spawnArgs.numbers[0], DEFAULT_PLATFORM_SIZE, 1, 24);
    const count = spawnPlatformFixture(hooks, spawnArgs.block, size);
    return { ok: true, message: `Spawned ${size}x${size} ${getBlockName(spawnArgs.block)} platform.` };
  }

  return {
    ok: false,
    message: `Unknown spawn feature "${feature}". Try "spawn target", "spawn wall stone 8 5", "spawn pillar 8", or "spawn platform dirt 7".`
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
