import * as THREE from "three";
import {
  BLOCK_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_COLLISION_RADIUS,
  BLOCK_FRAGMENT_GRID_SIZE,
  BLOCK_FRAGMENT_SPACING,
  BLOCK_RUBBLE_MATERIAL_UNITS,
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  normalizeBlockFragmentCount
} from "../src/blockFragments";
import { BLOCK, BLOCKS, PLACEABLE_BLOCKS } from "../src/blocks";
import {
  BLOCK_COLOR_VARIANT_COUNT,
  createBlockMeshKey,
  getBlockColorVariant,
  getBlockColorVariantFromMeshKey,
  getBlockFromMeshKey,
  getTintedBlockColor
} from "../src/blockColors";
import { Chunk } from "../src/chunk";
import type { ChunkGeneratedResult } from "../src/chunkProtocol";
import type { CollisionBounds } from "../src/collision";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PHYSICS_CORE_BLOCK_DAMAGE,
  PhysicsToy,
  PhysicsToyCollider,
  createEmptyPhysicsToyCollisionStats
} from "../src/physics";
import { PhysicsFragmentInstancer } from "../src/physicsInstancing";
import { RUBBLE_BLOCK_PROMOTION_PIECES, RubbleField, type RubbleFieldWorld } from "../src/rubble";
import {
  CROUCH_OR_DESCEND_KEY,
  CROUCH_SPEED,
  CROUCH_VIEW_DROP,
  CROUCH_VIEW_RESPONSE,
  FLIGHT_ACCELERATION,
  FLIGHT_BOOST_ACCELERATION,
  FLIGHT_BOOST_SPEED,
  FLIGHT_DRAG,
  FLIGHT_TOGGLE_KEY,
  GROUND_ACCELERATION,
  GROUND_FRICTION,
  GROUND_SPRINT_CRUISE_SPEED,
  JUMP_SPEED,
  PREVIOUS_SPRINT_SPEED,
  SLIDE_END_SPEED,
  SLIDE_DECELERATION_RATE_MULTIPLIER,
  SLIDE_ENTRY_SPEED_MULTIPLIER,
  SLIDE_ENTRY_SPEED_CAP,
  SLIDE_FORWARD_FRICTION,
  SLIDE_JUMP_SPRING_BONUS,
  SLIDE_JUMP_SPEED,
  SLIDE_JUMP_SPRING_MULTIPLIER,
  SLIDE_MIN_DURATION,
  SLIDE_PRIME_SPEED,
  SLIDE_RELEASE_FRICTION,
  SPRINT_SPEED,
  SPRINT_SPEED_MULTIPLIER,
  WALK_SPEED,
  getAirMovementSpeed,
  getCrouchViewTargetOffset,
  getFlightMovementAcceleration,
  getFlightMovementSpeed,
  getGroundMovementSpeed,
  getJumpSpeed,
  getSlideEntrySpeed,
  getSlideFriction,
  getSlideSpeedLimit,
  isSlideMinimumLocked,
  smoothCrouchViewOffset,
  shouldContinueSlide,
  shouldPreserveSlideJumpMomentum,
  shouldStartLandingSlide,
  shouldStartSlide
} from "../src/playerMovement";
import { isCatchablePointerLockRequest } from "../src/player";
import {
  DEFAULT_PHYSICS_OBJECT_BUDGET,
  MAX_PHYSICS_OBJECT_BUDGET,
  MIN_PHYSICS_OBJECT_BUDGET,
  normalizePhysicsObjectBudget,
  PHYSICS_OBJECT_BUDGET_STEP,
  stepPhysicsObjectBudget
} from "../src/physicsBudget";
import { shouldShowSuperUltraOptIn } from "../src/qualityController";
import {
  CUSTOM_PRESET_ID,
  QUALITY_PRESET_ORDER,
  QUALITY_PRESETS,
  SUPER_ULTRA_PRESET_ID
} from "../src/qualityPresets";
import {
  BLOCK_FRAGMENT_MAX_COUNT,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  SHADOW_QUALITY_MAX_LEVEL,
  createDefaultQualitySettings,
  formatBlockFragmentCount,
  formatRenderDistance,
  formatShadowQuality,
  getShadowMapSizeForQualityLevel,
  normalizeQualitySettings,
  normalizeRenderDistance,
  normalizeShadowQualityLevel
} from "../src/qualitySettings";
import { voxelRaycast } from "../src/raycast";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "../src/shadows";
import {
  BASE_CAMERA_FOV,
  SPRINT_FOV_MULTIPLIER,
  SPRINT_FOV_RESPONSE,
  getSprintFeedbackTargetFov,
  smoothSprintFeedbackFov
} from "../src/sprintFeedback";
import {
  formatPlayerSpeedMetersPerSecond,
  getPlayerSpeedMetersPerSecond
} from "../src/playerSpeed";
import {
  createMemorySaveDatabase,
  createWorldRegistry,
  type ChunkStorage
} from "../src/chunkStorage";
import { createDeleteWorldDialogCopy } from "../src/deleteWorldDialog";
import {
  DEBRIS_REGION_COLLISION_SECONDS,
  DEBRIS_REGION_FINALIZE_SECONDS,
  DEBRIS_REGION_GLUE_BREAKUP_SECONDS,
  DEBRIS_REGION_MAX_SECONDS,
  DEBRIS_REGION_PAIR_BUDGET,
  DEBRIS_REGION_SETTLED_FINALIZE_SECONDS,
  DebrisSettler
} from "../src/debrisSettler";
import { createEngineEventBus } from "../src/engineEvents";
import { EventBus } from "../src/eventBus";
import {
  IDLE_RESUME_GAP_SECONDS,
  MAX_SIMULATION_DELTA_SECONDS,
  clampSimulationDelta,
  shouldSkipExpensiveFrame
} from "../src/frameLoop";
import { createEmptyFrameTimings, smoothFrameTimings } from "../src/frameTimings";
import { shouldAbsorbFragmentIntoRubble } from "../src/fragmentRubble";
import {
  canDestroyBlockWithHotbarItem,
  canPlaceBlockWithHotbarItem,
  canThrowCoreWithHotbarItem,
  createHotbarItems,
  getHotbarIndexFromDigitCode,
  getHotbarItemLabel,
  getHotbarPrimaryAction,
  getHotbarScrollDirection,
  getHotbarSecondaryAction,
  stepHotbarIndex
} from "../src/hotbar";
import {
  EMPTY_HANDS_ITEM_ID,
  PHYSICS_CORE_ITEM_ID,
  createBlockItemId,
  createItemStack,
  createVoxelSandboxItemRegistry,
  getItemAction,
  getItemDefinition,
  getItemLabel
} from "../src/items";
import { SUN_OFFSET, getSunElevationDegrees } from "../src/lighting";
import {
  appendNovaChatMessage,
  createNovaChatReply,
  type NovaChatMessage
} from "../src/novaChat";
import { NovaContextJournal } from "../src/novaContext";
import { NovaPilot, createNovaPilotCoreLaunch, getNovaPilotDesiredPosition } from "../src/novaPilot";
import { NovaPilotReactions, type NovaPilotMessageTarget } from "../src/novaPilotReactions";
import { TargetBlockHighlighter } from "../src/targetHighlighter";
import { createTerrainContext, generateChunkBlocks, getTerrainHeight } from "../src/terrain";
import { getSunlitFaceShade } from "../src/voxelLighting";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../src/voxelConstants";
import { VoxelWorld } from "../src/world";
import { getSkyboxAlignedSunDirection } from "../src/skybox";

type TestCase = {
  readonly name: string;
  readonly run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}. Expected ${expectedJson}, got ${actualJson}.`);
  }
}

function assertUint8ArraysEqual(actual: Uint8Array, expected: Uint8Array, message: string): void {
  assertEqual(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${message}. First difference at ${index}: ${actual[index]} !== ${expected[index]}.`);
    }
  }
}

function hasAnyDifference(left: Uint8Array, right: Uint8Array): boolean {
  assertEqual(left.length, right.length, "Compared chunk payloads should have equal length");
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true;
  }
  return false;
}

function createFakeNovaMessageTarget(): NovaPilotMessageTarget & { readonly isVisible: () => boolean } {
  const classes = new Set<string>();
  return {
    textContent: "",
    classList: {
      add(token: string): void {
        classes.add(token);
      },
      remove(token: string): void {
        classes.delete(token);
      }
    },
    isVisible(): boolean {
      return classes.has("is-visible");
    }
  };
}

test("event bus emits typed payloads and unregisters handlers", () => {
  type CounterEvents = {
    "counter:add": { readonly amount: number };
  };
  const bus = new EventBus<CounterEvents>();
  let total = 0;

  const unsubscribe = bus.on("counter:add", (event) => {
    total += event.amount;
  });

  bus.emit("counter:add", { amount: 3 });
  unsubscribe();
  bus.emit("counter:add", { amount: 7 });

  assertEqual(total, 3, "unsubscribed handlers should not receive later events");
});

test("nova pilot reactions turn engine events into rate-limited HUD messages", () => {
  let now = 1000;
  const events = createEngineEventBus();
  const pilot = new NovaPilot();
  const target = createFakeNovaMessageTarget();
  const reactions = new NovaPilotReactions({
    events,
    pilot,
    output: target,
    getNow: () => now
  });

  events.emit("world:loaded", {
    worldId: "default",
    name: "Default World",
    seed: "classic"
  });
  assert(
    target.textContent?.includes("Nova online in Default World"),
    "world load should surface a Nova status message"
  );
  assert(target.isVisible(), "Nova messages should become visible");

  const initialMessage = target.textContent;
  events.emit("block:destroyed", {
    position: { x: 1, y: 2, z: 3 },
    block: BLOCK.stone,
    impactSpeed: 4,
    fragmentCount: 7
  });
  assertEqual(target.textContent, initialMessage, "non-forced reactions should respect the message gap");

  now += 2000;
  events.emit("block:destroyed", {
    position: { x: 1, y: 2, z: 3 },
    block: BLOCK.stone,
    impactSpeed: 4,
    fragmentCount: 7
  });
  assert(
    target.textContent?.includes("Stone chose fragments"),
    "later destruction events should produce contextual chatter"
  );

  now += 5000;
  reactions.update();
  assert(!target.isVisible(), "expired Nova messages should hide themselves");

  reactions.dispose();
  pilot.dispose();
});

test("nova context journal records world, runtime, and event state", () => {
  let now = 0;
  const events = createEngineEventBus();
  const journal = new NovaContextJournal(events, () => now);

  events.emit("world:loaded", {
    worldId: "default",
    name: "Default World",
    seed: "classic"
  });
  now += 10;
  events.emit("quality:changed", {
    presetId: "normal",
    label: "Normal",
    source: "preset",
    renderDistance: 6,
    physicsObjectBudget: 192,
    blockFragmentCount: 7
  });
  now += 10;
  events.emit("palette:selected", {
    block: BLOCK.grass,
    name: "Grass"
  });
  events.emit("physics:core-thrown", { source: "player" });
  events.emit("block:destroyed", {
    position: { x: 1, y: 2, z: 3 },
    block: BLOCK.grass,
    impactSpeed: 4,
    fragmentCount: 7
  });
  journal.updateRuntimeTelemetry({
    selectedItemLabel: "Grass",
    movementMode: "flight",
    speedMetersPerSecond: 12.5,
    novaActive: true,
    physicsObjectCount: 3,
    rubblePatchCount: 2,
    rubblePieceCount: 11
  });

  const snapshot = journal.snapshot();

  assertEqual(snapshot.world?.name, "Default World", "context should remember the loaded world");
  assertEqual(snapshot.qualityLabel, "Normal", "context should remember quality changes");
  assertEqual(snapshot.runtime.selectedItemLabel, "Grass", "runtime telemetry should carry the selected item");
  assertEqual(snapshot.runtime.movementMode, "flight", "runtime telemetry should carry player movement mode");
  assertEqual(snapshot.counters.playerCoreThrows, 1, "context should count player-thrown cores");
  assertEqual(snapshot.counters.blocksDestroyed, 1, "context should count destroyed blocks");
  assert(
    snapshot.recentEvents.some((event) => event.summary.includes("Grass fractured")),
    "recent event summaries should include block destruction"
  );

  journal.dispose();
});

test("nova chat replies use context and chat logs stay bounded", () => {
  const events = createEngineEventBus();
  const journal = new NovaContextJournal(events, () => 100);
  events.emit("world:loaded", {
    worldId: "default",
    name: "Default World",
    seed: "classic"
  });
  events.emit("quality:changed", {
    presetId: "custom",
    label: "Custom",
    source: "settings",
    renderDistance: 9,
    physicsObjectBudget: 512,
    blockFragmentCount: 13
  });
  events.emit("physics:core-thrown", { source: "player" });
  journal.updateRuntimeTelemetry({
    selectedItemLabel: "Physics Core",
    movementMode: "walk",
    speedMetersPerSecond: 0,
    novaActive: true,
    physicsObjectCount: 1,
    rubblePatchCount: 0,
    rubblePieceCount: 0
  });

  const physicsReply = createNovaChatReply("what about the physics core?", journal.snapshot());
  assert(physicsReply.includes("1 core"), "physics replies should use core counters from context");

  const performanceReply = createNovaChatReply("are we lagging?", journal.snapshot());
  assert(performanceReply.includes("Custom"), "performance replies should mention current quality context");

  const messages: readonly NovaChatMessage[] = [
    { role: "player", text: "one", timestamp: 1 },
    { role: "nova", text: "two", timestamp: 2 }
  ];
  const boundedMessages = appendNovaChatMessage(
    messages,
    { role: "player", text: "three", timestamp: 3 },
    2
  );
  assertEqual(boundedMessages.length, 2, "chat log should stay within its configured cap");
  assertEqual(boundedMessages[0]?.text, "two", "oldest chat message should drop first");

  journal.dispose();
});

test("item registry describes reusable held-item actions", () => {
  const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
  const grassItemId = createBlockItemId(BLOCK.grass);
  const grassSecondaryAction = getItemAction(itemRegistry, grassItemId, "secondary");

  assertEqual(getItemLabel(itemRegistry, EMPTY_HANDS_ITEM_ID), "Unarmed", "empty hands should be an explicit item");
  assertEqual(
    getItemDefinition(itemRegistry, PHYSICS_CORE_ITEM_ID).category,
    "tool",
    "physics core should be described as a tool item"
  );
  assertEqual(
    getItemDefinition(itemRegistry, grassItemId).maxStack,
    99,
    "placeable blocks should already carry stack metadata for later inventory work"
  );
  assertEqual(
    getItemAction(itemRegistry, grassItemId, "primary").kind,
    "terrain:destroy-block",
    "selected block primary action should describe terrain destruction"
  );
  assertEqual(
    grassSecondaryAction.kind,
    "terrain:place-block",
    "selected block secondary action should describe terrain placement"
  );
  if (grassSecondaryAction.kind === "terrain:place-block") {
    assertEqual(grassSecondaryAction.block, BLOCK.grass, "block placement action should preserve the block id");
  }
  assertEqual(
    getItemAction(itemRegistry, PHYSICS_CORE_ITEM_ID, "primary").kind,
    "physics:throw-core",
    "physics core primary action should describe throwing a core"
  );
});

test("hotbar scroll lane includes unarmed, placeable blocks, and physics core", () => {
  const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
  const hotbarItems = createHotbarItems(PLACEABLE_BLOCKS);
  const firstItem = hotbarItems[0];
  const lastItem = hotbarItems[hotbarItems.length - 1];
  const grassItem = createItemStack(createBlockItemId(BLOCK.grass));

  assertEqual(firstItem?.itemId, EMPTY_HANDS_ITEM_ID, "hotbar should start in the explicit unarmed state");
  assertEqual(lastItem?.itemId, PHYSICS_CORE_ITEM_ID, "hotbar should end with the physics core item");
  assertEqual(
    hotbarItems.length,
    PLACEABLE_BLOCKS.length + 2,
    "hotbar should contain unarmed, every placeable block, and the core"
  );
  assertEqual(
    getHotbarItemLabel(firstItem ?? createItemStack(EMPTY_HANDS_ITEM_ID), itemRegistry),
    "Unarmed",
    "unarmed slot should have a readable HUD label"
  );
  assertEqual(
    getHotbarItemLabel(lastItem ?? createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "Physics Core",
    "core slot should have a readable HUD label"
  );
  assert(
    !canDestroyBlockWithHotbarItem(createItemStack(EMPTY_HANDS_ITEM_ID), itemRegistry),
    "unarmed should leave left click inert until tools exist"
  );
  assert(
    canDestroyBlockWithHotbarItem(grassItem, itemRegistry),
    "selected blocks should own left-click terrain destruction"
  );
  assert(
    !canDestroyBlockWithHotbarItem(createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "holding a core should not also break targeted blocks on left click"
  );
  assert(
    canPlaceBlockWithHotbarItem(grassItem, itemRegistry),
    "selected blocks should place on right click"
  );
  assert(
    canThrowCoreWithHotbarItem(createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "selected physics core should throw on left click"
  );
  assertEqual(
    getHotbarPrimaryAction(grassItem, itemRegistry).kind,
    "terrain:destroy-block",
    "hotbar primary action should resolve through the item registry"
  );
  assertEqual(
    getHotbarSecondaryAction(grassItem, itemRegistry).kind,
    "terrain:place-block",
    "hotbar secondary action should resolve through the item registry"
  );
});

test("hotbar scrolling wraps predictably", () => {
  const hotbarItems = createHotbarItems(PLACEABLE_BLOCKS);

  assertEqual(getHotbarScrollDirection(120), 1, "scrolling down should move forward through hotbar items");
  assertEqual(getHotbarScrollDirection(-120), -1, "scrolling up should move backward through hotbar items");
  assertEqual(getHotbarScrollDirection(0), null, "zero-delta wheel events should not change selection");
  assertEqual(getHotbarIndexFromDigitCode("Digit1"), 0, "digit one should select the first hotbar slot");
  assertEqual(getHotbarIndexFromDigitCode("Digit7"), 6, "digit seven should select the seventh hotbar slot");
  assertEqual(getHotbarIndexFromDigitCode("KeyB"), null, "non-digit hotkeys should not select hotbar slots");
  assertEqual(
    stepHotbarIndex(0, -1, hotbarItems.length),
    hotbarItems.length - 1,
    "scrolling backward from first slot should wrap to the last slot"
  );
  assertEqual(
    stepHotbarIndex(hotbarItems.length - 1, 1, hotbarItems.length),
    0,
    "scrolling forward from last slot should wrap to the first slot"
  );
});

test("world chunk coordinates wrap cleanly across zero", () => {
  const world = new VoxelWorld({ seed: "coord-test" });

  assertDeepEqual(world.toChunkCoords(0, 0), { cx: 0, cz: 0, lx: 0, lz: 0 }, "origin coordinate");
  assertDeepEqual(world.toChunkCoords(15.9, 15.9), { cx: 0, cz: 0, lx: 15, lz: 15 }, "positive chunk edge");
  assertDeepEqual(world.toChunkCoords(16, 16), { cx: 1, cz: 1, lx: 0, lz: 0 }, "next positive chunk");
  assertDeepEqual(world.toChunkCoords(-0.1, -0.1), { cx: -1, cz: -1, lx: 15, lz: 15 }, "negative fractional edge");
  assertDeepEqual(world.toChunkCoords(-16, -16), { cx: -1, cz: -1, lx: 0, lz: 0 }, "negative exact chunk edge");
  assertDeepEqual(world.toChunkCoords(-16.1, 32), { cx: -2, cz: 2, lx: 15, lz: 0 }, "mixed-sign coordinates");
});

test("chunk top-column cache follows block edits", () => {
  const chunk = new Chunk(0, 0);

  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.air, y: 0 }, "empty column top");
  assert(chunk.setLocal(2, 4, 3, BLOCK.stone), "placing a block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.stone, y: 4 }, "placed block becomes top");
  assert(chunk.setLocal(2, 7, 3, BLOCK.grass), "higher block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.grass, y: 7 }, "higher block wins top");
  assert(chunk.setLocal(2, 7, 3, BLOCK.air), "removing the top block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.stone, y: 4 }, "top falls back to next solid block");
  assert(chunk.setLocal(2, 4, 3, BLOCK.air), "removing final block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.air, y: 0 }, "empty column returns air again");
});

test("terrain generation is deterministic by seed", () => {
  const alphaTerrainA = createTerrainContext("alpha");
  const alphaTerrainB = createTerrainContext("alpha");
  const betaTerrain = createTerrainContext("beta");

  assertDeepEqual(alphaTerrainA, alphaTerrainB, "same seed should produce same terrain context");
  assert(
    getTerrainHeight(11, -7, alphaTerrainA) !== getTerrainHeight(11, -7, betaTerrain) ||
      getTerrainHeight(41, 19, alphaTerrainA) !== getTerrainHeight(41, 19, betaTerrain),
    "different seeds should affect at least one sampled terrain height"
  );

  const alphaChunkA = generateChunkBlocks(1, -2, alphaTerrainA);
  const alphaChunkB = generateChunkBlocks(1, -2, alphaTerrainB);
  const betaChunk = generateChunkBlocks(1, -2, betaTerrain);
  assertUint8ArraysEqual(alphaChunkA, alphaChunkB, "same seed should generate identical chunk blocks");
  assert(hasAnyDifference(alphaChunkA, betaChunk), "different seed should generate a different chunk payload");
});

test("block color variants are deterministic and stay tied to block identity", () => {
  const firstKey = createBlockMeshKey(BLOCK.grass, 12, 7, -4);
  const secondKey = createBlockMeshKey(BLOCK.grass, 12, 7, -4);
  const sampledVariants = new Set<number>();

  for (let x = 0; x < 24; x += 1) {
    sampledVariants.add(getBlockColorVariant(BLOCK.grass, x, 7, -4));
  }

  assertEqual(firstKey, secondKey, "same block coordinate should always produce the same mesh key");
  assertEqual(getBlockFromMeshKey(firstKey), BLOCK.grass, "mesh key should preserve the block id");
  assert(
    getBlockColorVariantFromMeshKey(firstKey) >= 0 &&
      getBlockColorVariantFromMeshKey(firstKey) < BLOCK_COLOR_VARIANT_COUNT,
    "mesh key variant should stay inside the configured variant bucket range"
  );
  assert(sampledVariants.size > 1, "nearby blocks should receive visible color variation buckets");

  const darkGrass = getTintedBlockColor(BLOCK.grass | (0 << 8), 1);
  const brightGrass = getTintedBlockColor(BLOCK.grass | ((BLOCK_COLOR_VARIANT_COUNT - 1) << 8), 1);

  assert(
    darkGrass.some((channel, index) => Math.abs(channel - brightGrass[index]) > 0.01),
    "different variant buckets should produce different rendered colors"
  );
  assert(
    [...darkGrass, ...brightGrass].every((channel) => channel >= 0 && channel <= 1),
    "tinted vertex colors should remain valid normalized color channels"
  );
});

test("raycast returns hit block and entry face", () => {
  const solids = new Set(["3,1,0", "0,0,0"]);
  const world = {
    isSolid(x: number, y: number, z: number): boolean {
      return solids.has(`${x},${y},${z}`);
    }
  };

  assertDeepEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 8),
    { block: { x: 3, y: 1, z: 0 }, normal: { x: -1, y: 0, z: 0 }, distance: 2.5 },
    "positive x raycast should hit the west face of the target block"
  );
  assertDeepEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 8),
    { block: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 0.5 },
    "downward raycast should hit the top face of the target block"
  );
  assertEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 0, y: 0, z: 1 }, 2),
    null,
    "raycast should miss when no solid is within reach"
  );
});

test("raycast handles grid boundaries and exact edge crossings", () => {
  const boundaryWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "3,0,0";
    }
  };

  assertDeepEqual(
    voxelRaycast(boundaryWorld, { x: 2, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 8),
    { block: { x: 3, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 }, distance: 1 },
    "starting exactly on a grid line should not hit the next block at zero distance"
  );

  const diagonalDirection = new THREE.Vector3(1, 0, 1).normalize();
  const sideOnlyWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "0,0,1";
    }
  };
  const diagonalWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "1,0,1";
    }
  };

  assertEqual(
    voxelRaycast(sideOnlyWorld, { x: 0.5, y: 0.5, z: 0.5 }, diagonalDirection, 2),
    null,
    "edge-crossing rays should not hit side-neighbors they only graze"
  );
  assertDeepEqual(
    voxelRaycast(diagonalWorld, { x: 0.5, y: 0.5, z: 0.5 }, diagonalDirection, 2),
    { block: { x: 1, y: 0, z: 1 }, normal: { x: -1, y: 0, z: 0 }, distance: Math.SQRT1_2 },
    "edge-crossing rays should advance into the diagonal voxel"
  );
});

test("player movement tuning supports sprint, flight, crouch, and slide states", () => {
  assertEqual(FLIGHT_TOGGLE_KEY, "KeyF", "flight should toggle with the F key");
  assertEqual(CROUCH_OR_DESCEND_KEY, "KeyC", "crouch and flight descent should use the C key");
  assertEqual(
    SPRINT_SPEED_MULTIPLIER,
    1.5 * 1.5,
    "sprint tuning should stack the earlier 50 percent bump with another 50 percent bump"
  );
  assertEqual(
    SPRINT_SPEED,
    PREVIOUS_SPRINT_SPEED * SPRINT_SPEED_MULTIPLIER,
    "sprint speed should follow the documented sprint multiplier"
  );
  assertEqual(FLIGHT_BOOST_SPEED, SPRINT_SPEED * 2, "flight boost should be twice the ground sprint speed");
  assert(CROUCH_VIEW_RESPONSE > 0, "crouch view smoothing should move toward its target");
  assertEqual(getCrouchViewTargetOffset(false), 0, "standing view should have no crouch offset");
  assertEqual(getCrouchViewTargetOffset(true), CROUCH_VIEW_DROP, "crouched view should target the full crouch drop");
  const firstCrouchStep = smoothCrouchViewOffset(0, CROUCH_VIEW_DROP, 1 / 60);
  assert(
    firstCrouchStep > 0 && firstCrouchStep < CROUCH_VIEW_DROP,
    "crouch view should ease down instead of snapping to the target"
  );
  const firstStandStep = smoothCrouchViewOffset(CROUCH_VIEW_DROP, 0, 1 / 60);
  assert(
    firstStandStep > 0 && firstStandStep < CROUCH_VIEW_DROP,
    "crouch view should ease back up instead of snapping to standing"
  );
  assertEqual(
    smoothCrouchViewOffset(CROUCH_VIEW_DROP - 0.0001, CROUCH_VIEW_DROP, 1 / 60),
    CROUCH_VIEW_DROP,
    "tiny crouch-view gaps should settle exactly on the target"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: false, crouching: false, sliding: false }),
    WALK_SPEED,
    "plain movement should use walk speed"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: true, crouching: false, sliding: false }),
    SPRINT_SPEED,
    "sprinting should use boosted sprint speed"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: true, crouching: true, sliding: false }),
    CROUCH_SPEED,
    "crouch should slow grounded movement even if sprint is held"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: false, crouching: true, sliding: true }),
    SPRINT_SPEED,
    "active slides should keep the fast horizontal cap while friction bleeds speed"
  );
  assertEqual(
    getAirMovementSpeed(),
    WALK_SPEED,
    "ordinary airborne control should ignore sprint boost; only flight mode uses boosted Shift movement"
  );
  assertEqual(getFlightMovementSpeed(false), WALK_SPEED, "plain flight should use walk speed");
  assertEqual(getFlightMovementSpeed(true), FLIGHT_BOOST_SPEED, "boosted flight should use the larger flight cap");
  assertEqual(
    getFlightMovementAcceleration(false),
    FLIGHT_ACCELERATION,
    "plain flight should use floaty baseline acceleration"
  );
  assertEqual(
    getFlightMovementAcceleration(true),
    FLIGHT_BOOST_ACCELERATION,
    "boosted flight should use enough acceleration to overcome flight drag"
  );
  assert(
    FLIGHT_BOOST_SPEED > SPRINT_SPEED,
    "boosted flight cap should be faster than ground sprint"
  );
  assert(
    FLIGHT_BOOST_ACCELERATION / FLIGHT_DRAG > FLIGHT_BOOST_SPEED,
    "boosted flight acceleration should be high enough to actually reach its cap through drag"
  );

  assert(
    shouldStartSlide(true, true, true, true, SLIDE_PRIME_SPEED),
    "grounded sprint-crouch movement should prime a slide once speed reaches the sprint-relative threshold"
  );
  assert(
    !shouldStartSlide(true, true, true, true, SLIDE_PRIME_SPEED - 0.01),
    "slow movement should not prime a slide"
  );
  assert(
    !shouldStartSlide(true, false, true, true, SLIDE_PRIME_SPEED),
    "holding crouch before sprinting should not retroactively start a slide"
  );
  assert(
    shouldStartLandingSlide(true, true, SLIDE_PRIME_SPEED),
    "landing while crouched with enough speed should enter the slide lock"
  );
  assert(
    !shouldStartLandingSlide(true, true, SLIDE_PRIME_SPEED - 0.01),
    "slow crouched landings should stay crouched without forcing a slide"
  );
  assert(
    !shouldStartLandingSlide(true, false, SLIDE_PRIME_SPEED),
    "landing upright should not enter a slide"
  );
  assert(
    shouldContinueSlide(true, SLIDE_MIN_DURATION - 0.01, SLIDE_END_SPEED * 0.5),
    "slides should remain locked for the minimum duration even after bleeding below crouch speed"
  );
  assert(
    shouldContinueSlide(true, SLIDE_MIN_DURATION + 0.01, SLIDE_END_SPEED + 0.01),
    "slides should continue after the minimum duration until speed reaches crouch pace"
  );
  assert(
    !shouldContinueSlide(true, SLIDE_MIN_DURATION + 0.01, SLIDE_END_SPEED),
    "slides should end after the lock once they reach crouch speed"
  );
  assert(
    !shouldContinueSlide(false, SLIDE_MIN_DURATION - 0.01, SLIDE_END_SPEED + 1),
    "leaving the ground should hand slide state to airborne momentum preservation"
  );
  assertEqual(getSlideFriction(true), SLIDE_FORWARD_FRICTION, "holding forward should keep the longer slide glide");
  assertEqual(getSlideFriction(false), SLIDE_RELEASE_FRICTION, "releasing forward should bleed slide speed faster");
  assertEqual(SLIDE_DECELERATION_RATE_MULTIPLIER, 2, "slide deceleration should use the half-time tuning pass");
  assertEqual(
    SLIDE_FORWARD_FRICTION,
    0.95 * SLIDE_DECELERATION_RATE_MULTIPLIER,
    "holding forward should bleed slide speed twice as quickly as the previous tuning"
  );
  assertEqual(
    SLIDE_RELEASE_FRICTION,
    2.25 * SLIDE_DECELERATION_RATE_MULTIPLIER,
    "released-input slides should keep the same relative half-time deceleration bump"
  );
  assert(
    SLIDE_RELEASE_FRICTION > SLIDE_FORWARD_FRICTION,
    "releasing forward should still slow a slide faster than holding forward"
  );
  assertEqual(SLIDE_MIN_DURATION, 0.5, "slide lock duration should be cut in half");
  assertEqual(
    SLIDE_ENTRY_SPEED_MULTIPLIER,
    1.8,
    "slide entry pop should boost the player's current speed by 80 percent"
  );
  assertEqual(
    GROUND_SPRINT_CRUISE_SPEED,
    GROUND_ACCELERATION / GROUND_FRICTION,
    "slide reachability should track the movement controller's sustained sprint speed"
  );
  assert(
    SLIDE_PRIME_SPEED < GROUND_SPRINT_CRUISE_SPEED,
    "slide entry threshold should be reachable during sustained flat-ground sprinting"
  );
  assert(
    SLIDE_PRIME_SPEED > WALK_SPEED,
    "slide entry threshold should still require sprint momentum, not ordinary walking speed"
  );
  assertEqual(
    getSlideEntrySpeed(SLIDE_PRIME_SPEED, true),
    SLIDE_PRIME_SPEED * SLIDE_ENTRY_SPEED_MULTIPLIER,
    "starting a slide should multiply current momentum for a stronger entry pop"
  );
  assertEqual(
    getSlideEntrySpeed(SLIDE_ENTRY_SPEED_CAP / SLIDE_ENTRY_SPEED_MULTIPLIER + 0.01, true),
    SLIDE_ENTRY_SPEED_CAP,
    "slide entry pop should cap ordinary entries before becoming a launch exploit"
  );
  assertEqual(
    getSlideEntrySpeed(SLIDE_ENTRY_SPEED_CAP * 2, true),
    SLIDE_ENTRY_SPEED_CAP * 2,
    "slide entry cap should not cut down speed earned before the slide"
  );
  assertEqual(
    getSlideEntrySpeed(SLIDE_PRIME_SPEED, false),
    SLIDE_PRIME_SPEED,
    "landing back into a slide should preserve momentum without awarding another entry boost"
  );
  assertEqual(
    getSlideSpeedLimit(SPRINT_SPEED * 1.25),
    SPRINT_SPEED * 1.25,
    "slides should preserve above-sprint entry speed instead of clamping momentum away"
  );
  assertEqual(
    getSlideSpeedLimit(SPRINT_SPEED * 0.75),
    SPRINT_SPEED,
    "ordinary slides should still use the sprint cap as their baseline speed limit"
  );
  assertEqual(getJumpSpeed(false), JUMP_SPEED, "normal jumps should use baseline jump speed");
  assertEqual(
    SLIDE_JUMP_SPRING_BONUS,
    0.18 * 1.5,
    "slide jump spring bonus should be 50 percent stronger than the previous bonus"
  );
  assertEqual(
    SLIDE_JUMP_SPRING_MULTIPLIER,
    1 + SLIDE_JUMP_SPRING_BONUS,
    "slide jump spring multiplier should apply the tuned bonus on top of the base jump"
  );
  assertEqual(
    SLIDE_JUMP_SPEED,
    JUMP_SPEED * SLIDE_JUMP_SPRING_MULTIPLIER,
    "slide jump spring speed should derive from the baseline jump speed"
  );
  assertEqual(
    getJumpSpeed(true),
    SLIDE_JUMP_SPEED,
    "jumping out of an active slide should spring a bit higher"
  );
  assert(
    SLIDE_JUMP_SPRING_MULTIPLIER > 1 && SLIDE_JUMP_SPRING_MULTIPLIER < 1.3,
    "slide jump spring should be noticeable without becoming a vertical launch exploit"
  );
  assert(
    isSlideMinimumLocked(SLIDE_MIN_DURATION * 0.5),
    "slides should be locked during the shortened minimum duration"
  );
  assert(
    !isSlideMinimumLocked(SLIDE_MIN_DURATION),
    "slide minimum lock should release exactly at the configured duration"
  );
  assert(
    shouldPreserveSlideJumpMomentum(true, true),
    "jumping from an active slide should preserve horizontal momentum until landing"
  );
  assert(
    !shouldPreserveSlideJumpMomentum(false, true),
    "normal jumps should not enter slide momentum preservation"
  );
});

test("sprint feedback widens FOV smoothly without touching base camera setup", () => {
  const sprintFov = BASE_CAMERA_FOV * SPRINT_FOV_MULTIPLIER;

  assertEqual(getSprintFeedbackTargetFov(false), BASE_CAMERA_FOV, "inactive sprint feedback should use base FOV");
  assertEqual(getSprintFeedbackTargetFov(true), sprintFov, "active sprint feedback should widen FOV by 15 percent");
  assert(SPRINT_FOV_RESPONSE > 0, "sprint feedback FOV smoothing should move toward its target");

  const firstSprintStep = smoothSprintFeedbackFov(BASE_CAMERA_FOV, sprintFov, 1 / 60);
  assert(
    firstSprintStep > BASE_CAMERA_FOV && firstSprintStep < sprintFov,
    "sprint feedback should ease outward instead of snapping"
  );

  const firstReleaseStep = smoothSprintFeedbackFov(sprintFov, BASE_CAMERA_FOV, 1 / 60);
  assert(
    firstReleaseStep > BASE_CAMERA_FOV && firstReleaseStep < sprintFov,
    "sprint feedback should ease back to base FOV"
  );
});

test("player speed readout reports velocity in meters per second", () => {
  const diagonalVelocity = { x: 3, y: 4, z: 12 };

  assertEqual(
    getPlayerSpeedMetersPerSecond(diagonalVelocity),
    13,
    "player speed should use the full velocity magnitude for walk, jump, slide, and flight"
  );
  assertEqual(
    formatPlayerSpeedMetersPerSecond({ x: 1, y: 0, z: 0 }),
    "1.0 m/s",
    "HUD speed readout should show one decimal place and metric units"
  );
  assertEqual(
    formatPlayerSpeedMetersPerSecond({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }),
    "0.0 m/s",
    "non-finite velocity samples should fail closed instead of putting nonsense in the HUD"
  );
});

test("frame timing smoothing keeps debug profiler values readable", () => {
  const empty = createEmptyFrameTimings();
  const sample = {
    playerMs: 2,
    chunkMs: 4,
    physicsMs: 8,
    meshMs: 1,
    minimapMs: 0.5,
    renderMs: 3,
    otherMs: 1.5,
    frameMs: 20
  };

  assertDeepEqual(
    smoothFrameTimings(empty, sample, false),
    sample,
    "first timing sample should initialize without smoothing away the numbers"
  );

  const smoothed = smoothFrameTimings(sample, empty, true, 0.25);
  assertNearlyEqual(smoothed.playerMs, 1.5, "player timing should ease toward the latest sample");
  assertNearlyEqual(smoothed.physicsMs, 6, "physics timing should ease toward the latest sample");
  assertNearlyEqual(smoothed.frameMs, 15, "total frame timing should use the same smoothing");

  assertEqual(
    smoothFrameTimings(sample, empty, true, 2).frameMs,
    0,
    "blend values above one should clamp to the latest sample"
  );
  assertEqual(
    smoothFrameTimings(sample, empty, true, -1).frameMs,
    sample.frameMs,
    "blend values below zero should clamp to the previous sample"
  );
});

test("frame loop clamps simulation time and skips overnight resume frames", () => {
  assertEqual(clampSimulationDelta(-1), 0, "negative frame deltas should fail closed");
  assertEqual(
    clampSimulationDelta(Number.NaN),
    0,
    "non-finite frame deltas should not enter simulation state"
  );
  assertEqual(
    clampSimulationDelta(MAX_SIMULATION_DELTA_SECONDS * 4),
    MAX_SIMULATION_DELTA_SECONDS,
    "simulation should keep the existing fixed upper delta clamp"
  );
  assert(
    shouldSkipExpensiveFrame(true, 1 / 60),
    "hidden pages should skip chunk, physics, minimap, and render work"
  );
  assert(
    shouldSkipExpensiveFrame(false, IDLE_RESUME_GAP_SECONDS + 0.01),
    "long resume gaps should skip one expensive frame even if visibility events were throttled"
  );
  assert(
    !shouldSkipExpensiveFrame(false, 1 / 30),
    "normal visible frames should continue through the engine loop"
  );
});

test("pointer lock request detection supports promise and void browser APIs", () => {
  assert(
    isCatchablePointerLockRequest(Promise.resolve()),
    "promise-returning pointer lock requests should attach rejection handling"
  );
  assert(
    isCatchablePointerLockRequest({ catch: () => undefined }),
    "promise-like pointer lock requests should attach rejection handling"
  );
  assert(
    !isCatchablePointerLockRequest(undefined),
    "void-returning pointer lock requests should rely on the pending-lock timeout"
  );
  assert(
    !isCatchablePointerLockRequest({ then: () => undefined }),
    "then-only values should not be treated as catchable pointer lock requests"
  );
});

test("target block highlighter follows targeted block positions", () => {
  const highlighter = new TargetBlockHighlighter();

  assert(!highlighter.object.visible, "target highlighter should start hidden");
  highlighter.showBlock({ x: 4, y: 12, z: -3 });
  assert(highlighter.object.visible, "target highlighter should become visible when a block is targeted");
  assertVectorNearlyEqual(
    highlighter.object.position,
    new THREE.Vector3(4.5, 12.5, -2.5),
    "target highlighter should sit on the target block center"
  );

  highlighter.hide();
  assert(!highlighter.object.visible, "target highlighter should hide when no block is targeted");
});

test("nova pilot keeps a readable companion offset and throws forward", () => {
  const playerPosition = new THREE.Vector3(10, 20, 10);
  const desired = getNovaPilotDesiredPosition(
    playerPosition,
    new THREE.Vector3(0, 0, -1),
    18,
    1.25
  );

  assert(desired.distanceTo(playerPosition) > 2, "Nova should hover visibly away from the player");
  assert(desired.y > 21, "Nova should stay above the player or nearby terrain");

  const fallbackDesired = getNovaPilotDesiredPosition(
    playerPosition,
    new THREE.Vector3(0, 1, 0),
    0,
    0
  );
  assert(
    Number.isFinite(fallbackDesired.x) && Number.isFinite(fallbackDesired.z),
    "Nova should choose a stable side position even when the player looks straight up"
  );

  const launch = createNovaPilotCoreLaunch(
    new THREE.Vector3(1, 2, 3),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(2, 0, 0)
  );
  assert(launch.position.z < 3, "Nova-thrown cores should spawn in front of the pilot");
  assert(launch.velocity.z < -10, "Nova-thrown cores should travel along the pilot aim direction");
  assert(launch.velocity.x > 0, "Nova-thrown cores should inherit a little pilot movement");
});

test("world fallback streaming loads and unloads bounded chunk windows", () => {
  const world = new VoxelWorld({ seed: "stream-test" });
  const scene = new THREE.Scene();

  world.streamChunksAround(0, 0, scene, 1, 2, 32);
  assertEqual(world.getStats().loadedChunks, 9, "radius-one stream should load a 3x3 chunk window without a worker");
  assertEqual(world.getStats().queuedChunks, 0, "large fallback budget should drain the queue");

  world.streamChunksAround(CHUNK_SIZE * 8, 0, scene, 1, 2, 32);
  const stats = world.getStats();
  assertEqual(stats.loadedChunks, 9, "unload radius should keep the new 3x3 window bounded");
  assertEqual(stats.pendingChunkLoads, 0, "fallback streaming should not leave pending worker loads");
});

test("world reuses queued chunk windows while player stays in the same chunk", () => {
  const world = new VoxelWorld({ seed: "stream-window-cache-test" });
  const scene = new THREE.Scene();
  const loadRadius = 3;
  const expectedCandidateChecks = (loadRadius * 2 + 1) ** 2;

  world.streamChunksAround(0, 0, scene, loadRadius, loadRadius + 1, 1);
  let diagnostics = world.getStreamingDiagnostics();
  const queuedAfterFirstFrame = world.getStats().queuedChunks;

  assertEqual(diagnostics.queueWindowRefreshes, 1, "first stream frame should populate the queue window");
  assertEqual(diagnostics.queueWindowSkips, 0, "first stream frame should not be treated as reusable");
  assertEqual(
    diagnostics.lastQueueCandidateChecks,
    expectedCandidateChecks,
    "initial queue fill should scan the cached radius offsets once"
  );

  world.streamChunksAround(CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.25, scene, loadRadius, loadRadius + 1, 1);
  diagnostics = world.getStreamingDiagnostics();

  assertEqual(diagnostics.queueWindowRefreshes, 1, "same chunk center should reuse the existing queue window");
  assertEqual(diagnostics.queueWindowSkips, 1, "same chunk center should count as a skipped queue refresh");
  assertEqual(diagnostics.lastQueueCandidateChecks, 0, "reused queue window should avoid radius candidate checks");
  assert(
    world.getStats().queuedChunks < queuedAfterFirstFrame,
    "unchanged-center streaming should still drain already-queued chunk work"
  );

  world.streamChunksAround(CHUNK_SIZE, 0, scene, loadRadius, loadRadius + 1, 1);
  diagnostics = world.getStreamingDiagnostics();

  assertEqual(diagnostics.queueWindowRefreshes, 2, "crossing into a new chunk should refresh the queue window");
  assertEqual(
    diagnostics.lastQueueCandidateChecks,
    expectedCandidateChecks,
    "new chunk center should scan the cached radius offsets again"
  );
});

test("world skips unload scans while player stays in a settled chunk window", () => {
  const world = new VoxelWorld({ seed: "unload-window-cache-test" });
  const scene = new THREE.Scene();

  world.streamChunksAround(0, 0, scene, 1, 2, 32);
  let diagnostics = world.getStreamingDiagnostics();
  assertEqual(diagnostics.unloadWindowRefreshes, 1, "first stream frame should scan loaded chunks for unloads");
  assertEqual(diagnostics.lastUnloadCandidateChecks, 9, "radius-one settled window should check nine loaded chunks");

  world.streamChunksAround(CHUNK_SIZE * 0.25, CHUNK_SIZE * 0.25, scene, 1, 2, 32);
  diagnostics = world.getStreamingDiagnostics();
  assertEqual(diagnostics.unloadWindowRefreshes, 1, "same chunk center should reuse the unload window");
  assertEqual(diagnostics.unloadWindowSkips, 1, "same chunk center should count as a skipped unload scan");
  assertEqual(diagnostics.lastUnloadCandidateChecks, 0, "reused unload window should not scan loaded chunks");

  world.streamChunksAround(CHUNK_SIZE * 8, 0, scene, 1, 2, 32);
  diagnostics = world.getStreamingDiagnostics();
  assertEqual(diagnostics.unloadWindowRefreshes, 2, "moving to a new chunk window should rescan unload candidates");
  assert(
    diagnostics.lastUnloadCandidateChecks > 9,
    "chunk-window move should scan old and new loaded chunks before pruning"
  );
  assertEqual(world.getStats().loadedChunks, 9, "unload pruning should still keep the loaded window bounded");
});

test("world tracks dirty and modified chunks with chunk-key indexes", () => {
  const world = new VoxelWorld({ seed: "dirty-index-test" });
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();

  world.ensureChunksAround(0, 0, 0);
  assertEqual(world.getStats().dirtyChunks, 1, "newly generated chunk should start dirty");
  assertEqual(world.getStreamingDiagnostics().trackedDirtyChunks, 1, "dirty index should track generated chunks");

  world.rebuildDirty(scene, material, 1);
  assertEqual(world.getStats().dirtyChunks, 0, "rebuilt chunk should leave the dirty count");
  assertEqual(world.getStreamingDiagnostics().trackedDirtyChunks, 0, "dirty index should clear rebuilt chunks");

  world.setBlock(1, WORLD_HEIGHT - 1, 1, BLOCK.ember);
  let diagnostics = world.getStreamingDiagnostics();
  let stats = world.getStats();
  assertEqual(stats.dirtyChunks, 1, "editing a clean chunk should mark it dirty");
  assertEqual(stats.modifiedChunks, 1, "editing a clean chunk should mark it modified");
  assertEqual(diagnostics.trackedDirtyChunks, 1, "dirty index should track edited chunks");
  assertEqual(diagnostics.trackedModifiedChunks, 1, "modified index should track edited chunks");

  world.rebuildDirty(scene, material, 1);
  diagnostics = world.getStreamingDiagnostics();
  stats = world.getStats();
  assertEqual(stats.dirtyChunks, 0, "rebuilt edited chunk should no longer be dirty");
  assertEqual(stats.modifiedChunks, 1, "rebuilt edited chunk should remain modified for saving");
  assertEqual(diagnostics.trackedDirtyChunks, 0, "dirty index should clear rebuilt edited chunks");
  assertEqual(diagnostics.trackedModifiedChunks, 1, "modified index should keep rebuilt edited chunks");

  material.dispose();
});

test("world applies completed generated chunks within the frame budget", () => {
  const world = new VoxelWorld({ seed: "worker-result-budget-test" });
  const chunkByteLength = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

  for (let cx = 0; cx < 5; cx += 1) {
    const requestId = cx + 1;
    const key = world.key(cx, 0);
    world.pendingChunkKeys.add(key);
    world.pendingChunkLoads.set(requestId, { key, cx, cz: 0 });
    world.workerResults.push({
      type: "generated",
      requestId,
      cx,
      cz: 0,
      blocks: new Uint8Array(chunkByteLength)
    } satisfies ChunkGeneratedResult);
  }

  world.setPriority(4, 0);
  world.processGeneratedChunkResults(2);

  assertEqual(world.getStats().loadedChunks, 2, "only the budgeted generated chunks should be applied");
  assert(Boolean(world.getChunk(4, 0)), "the closest completed result should be applied first");
  assert(Boolean(world.getChunk(3, 0)), "the next closest completed result should use the remaining budget");
  assertEqual(world.workerResults.length, 3, "extra generated chunks should remain queued for later frames");
});

test("world block reads, writes, and solidity follow bounds", async () => {
  const world = new VoxelWorld({ seed: "block-test" });
  world.ensureChunksAround(0, 0, 0);

  world.setBlock(1, 2, 3, BLOCK.ember);
  assertEqual(world.getBlock(1, 2, 3), BLOCK.ember, "setBlock should update world reads");
  assert(world.isSolid(1.2, 2.1, 3.8), "solid placed block should collide");
  assert(world.isSolid(1, -1, 3), "space below the world is solid collision ground");
  assertEqual(world.getBlock(1, WORLD_HEIGHT, 3), BLOCK.air, "reads above world height return air");

  await world.flushStorageWrites();
  assertEqual(world.getStats().savedChunks, 1, "edited chunk should be tracked as saved");
});

test("world coalesces repeated chunk saves before flushing storage", async () => {
  const savedSnapshots: Uint8Array[] = [];
  const storage: ChunkStorage = {
    worldId: "coalesce-test",
    async listChunkKeys(): Promise<string[]> {
      return [];
    },
    async loadChunk(): Promise<Uint8Array | null> {
      return null;
    },
    async saveChunk(_key: string, blocks: Uint8Array): Promise<void> {
      savedSnapshots.push(blocks.slice());
    },
    async deleteChunk(): Promise<void> {}
  };
  const world = new VoxelWorld({ seed: "save-coalesce-test", storage });
  world.ensureChunksAround(0, 0, 0);

  world.setBlock(1, WORLD_HEIGHT - 2, 3, BLOCK.ember);
  world.setBlock(1, WORLD_HEIGHT - 2, 4, BLOCK.sand);

  assertEqual(world.getStats().pendingChunkSaves, 1, "multiple edits in one chunk should queue one latest save");
  assertEqual(savedSnapshots.length, 0, "debounced chunk saves should not write every intermediate edit");

  await world.flushStorageWrites();

  assertEqual(savedSnapshots.length, 1, "flushing should persist the coalesced chunk snapshot once");
  const snapshot = savedSnapshots[0];
  assert(snapshot instanceof Uint8Array, "flush should provide a concrete saved chunk snapshot");
  assertEqual(
    snapshot[1 + CHUNK_SIZE * (4 + CHUNK_SIZE * (WORLD_HEIGHT - 2))],
    BLOCK.sand,
    "coalesced save should contain the latest edit"
  );
});

test("world registry deletes saved worlds and their edited chunks", async () => {
  const database = createMemorySaveDatabase();
  const registry = await createWorldRegistry(database);
  const defaultWorld = await registry.getActiveWorld();
  const firstWorld = await registry.createWorld("Delete Me", "first-seed");
  const secondWorld = await registry.createWorld("Keep Me", "second-seed");
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  blocks[0] = BLOCK.grass;

  await database.saveChunk(firstWorld.id, "0,0", blocks);
  await database.saveChunk(secondWorld.id, "1,0", blocks);
  await registry.setActiveWorld(firstWorld.id);

  const replacementWorld = await registry.deleteWorld(firstWorld.id);

  assertEqual(await database.getWorld(firstWorld.id), null, "deleted world metadata should be removed");
  assertDeepEqual(
    await database.listChunkKeys(firstWorld.id),
    [],
    "deleted world chunk payloads should be removed with the save"
  );
  assertEqual(
    (await database.listChunkKeys(secondWorld.id)).length,
    1,
    "deleting one world should leave other world chunks intact"
  );
  assertEqual(
    replacementWorld.id,
    secondWorld.id,
    "deleting the active world should promote the newest remaining world"
  );
  assertEqual(
    await registry.getActiveWorldId(),
    secondWorld.id,
    "active-world metadata should follow the promoted world"
  );

  await registry.deleteWorld(secondWorld.id);
  await registry.deleteWorld(defaultWorld.id);
  assertEqual(
    (await registry.listWorlds()).length,
    1,
    "deleting every save should recreate one default world so the menu never goes empty"
  );
});

test("world registry stores player location with saved-world metadata", async () => {
  const database = createMemorySaveDatabase();
  const registry = await createWorldRegistry(database);
  const world = await registry.createWorld("Location Test", "location-seed");

  await registry.updatePlayerState(world.id, {
    feetPosition: { x: 12.5, y: 32.25, z: -7.75 },
    yaw: 1.125,
    pitch: -0.35
  });

  const savedWorld = await registry.getActiveWorld();
  const playerState = savedWorld.playerState;
  assert(playerState, "player-state save should be attached to the active world");
  assertDeepEqual(
    playerState.feetPosition,
    { x: 12.5, y: 32.25, z: -7.75 },
    "saved location should preserve player feet position"
  );
  assertEqual(playerState.yaw, 1.125, "saved location should preserve horizontal look angle");
  assertEqual(playerState.pitch, -0.35, "saved location should preserve vertical look angle");
  assert(playerState.savedAt > 0, "saved location should include a write timestamp");
  assert(
    savedWorld.updatedAt >= playerState.savedAt,
    "saving player location should refresh the world's updated timestamp"
  );

  (playerState as unknown as { feetPosition: { x: number } }).feetPosition.x = 99;
  assertEqual(
    (await registry.getActiveWorld()).playerState?.feetPosition.x,
    12.5,
    "registry reads should deep-clone player location metadata"
  );
});

test("delete-world dialog copy names the save and warns about permanence", () => {
  const copy = createDeleteWorldDialogCopy({
    id: "world-copy-test",
    name: "Definitely Important",
    seed: "copy-seed",
    createdAt: 1,
    updatedAt: 2
  });

  assert(copy.includes("Definitely Important"), "delete confirmation should name the target save");
  assert(copy.includes("permanently removes"), "delete confirmation should warn about permanent removal");
  assert(copy.includes("cannot be undone"), "delete confirmation should say the deletion cannot be undone");
});

test("block damage tracks health before removing voxels", () => {
  const world = new VoxelWorld({ seed: "damage-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  const firstHit = world.damageBlock(2, 3, 4, 1);
  assertDeepEqual(
    firstHit,
    { block: BLOCK.stone, position: { x: 2, y: 3, z: 4 }, remainingHealth: 1, destroyed: false },
    "first meaningful hit should damage but not remove a two-health block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.stone, "damaged block should remain in the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "world should remember sparse block damage");
  assertEqual(world.getStats().damagedBlocks, 1, "debug stats should count damaged blocks");

  const secondHit = world.damageBlock(2, 3, 4, 1);
  assertDeepEqual(
    secondHit,
    { block: BLOCK.stone, position: { x: 2, y: 3, z: 4 }, remainingHealth: 0, destroyed: true },
    "second meaningful hit should destroy a two-health block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "destroyed block should leave the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 0, "destroyed blocks should clear transient damage state");
});

test("physics core impact damage overwhelms ordinary terrain health", () => {
  const world = new VoxelWorld({ seed: "core-damage-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.rubble);

  assertEqual(PHYSICS_CORE_BLOCK_DAMAGE, 30, "physics cores should deal the tuned impact damage");
  assert(
    PHYSICS_CORE_BLOCK_DAMAGE > BLOCKS[BLOCK.stone].health,
    "core impact damage should one-shot ordinary two-health terrain blocks"
  );
  assert(
    PHYSICS_CORE_BLOCK_DAMAGE > BLOCKS[BLOCK.rubble].health,
    "core impact damage should also one-shot generated rubble terrain blocks"
  );

  const stoneHit = world.damageBlock(2, 3, 4, PHYSICS_CORE_BLOCK_DAMAGE);
  const rubbleHit = world.damageBlock(3, 3, 4, PHYSICS_CORE_BLOCK_DAMAGE);

  assert(stoneHit?.destroyed, "a core hit should destroy a normal terrain block in one impact");
  assert(rubbleHit?.destroyed, "a core hit should destroy a generated rubble block in one impact");
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "destroyed stone should leave the voxel grid");
  assertEqual(world.getBlock(3, 3, 4), BLOCK.air, "destroyed rubble terrain should leave the voxel grid");
});

test("block fracture pattern produces a centered 3x3x3 debris grid", () => {
  assertEqual(BLOCK_FRAGMENT_GRID_SIZE, 3, "block fracture grid should be three pieces per axis");
  assertEqual(BLOCK_FRAGMENT_COUNT, 27, "block fracture grid should create 27 loose pieces");

  const uniqueOffsets = new Set<string>();
  const uniqueX = new Set<number>();
  const uniqueY = new Set<number>();
  const uniqueZ = new Set<number>();

  for (let index = 0; index < BLOCK_FRAGMENT_COUNT; index += 1) {
    const offset = getBlockFragmentOffset(index);
    uniqueOffsets.add(`${offset.x},${offset.y},${offset.z}`);
    uniqueX.add(offset.x);
    uniqueY.add(offset.y);
    uniqueZ.add(offset.z);
  }

  assertEqual(uniqueOffsets.size, BLOCK_FRAGMENT_COUNT, "each debris piece should get a unique local offset");
  assertEqual(uniqueX.size, BLOCK_FRAGMENT_GRID_SIZE, "x axis should span the full fracture grid");
  assertEqual(uniqueY.size, BLOCK_FRAGMENT_GRID_SIZE, "y axis should span the full fracture grid");
  assertEqual(uniqueZ.size, BLOCK_FRAGMENT_GRID_SIZE, "z axis should span the full fracture grid");
  assertDeepEqual(
    getBlockFragmentOffset(Math.floor(BLOCK_FRAGMENT_COUNT / 2)),
    { x: 0, y: 0, z: 0 },
    "odd fracture grids should include a centered shard"
  );
  assertDeepEqual(
    getBlockFragmentOffset(0),
    {
      x: -BLOCK_FRAGMENT_SPACING,
      y: -BLOCK_FRAGMENT_SPACING,
      z: -BLOCK_FRAGMENT_SPACING
    },
    "first shard should sit at the low corner of the centered grid"
  );
});

test("quality-scaled block fracture counts sample the full debris grid", () => {
  assertEqual(normalizeBlockFragmentCount(-1), 1, "fragment count should keep at least one shard");
  assertEqual(normalizeBlockFragmentCount(99), BLOCK_FRAGMENT_COUNT, "fragment count should clamp to the full grid");

  assertEqual(getDistributedBlockFragmentIndex(0, BLOCK_FRAGMENT_COUNT), 0, "full debris should keep first grid index");
  assertEqual(
    getDistributedBlockFragmentIndex(BLOCK_FRAGMENT_COUNT - 1, BLOCK_FRAGMENT_COUNT),
    BLOCK_FRAGMENT_COUNT - 1,
    "full debris should keep final grid index"
  );
  assertEqual(
    getDistributedBlockFragmentIndex(3, 7),
    Math.floor(BLOCK_FRAGMENT_COUNT / 2),
    "normal-quality debris should include the center shard"
  );

  const highQualityIndexes = new Set<number>();
  for (let index = 0; index < QUALITY_PRESETS.high.blockFragmentCount; index += 1) {
    highQualityIndexes.add(getDistributedBlockFragmentIndex(index, QUALITY_PRESETS.high.blockFragmentCount));
  }
  assertEqual(
    highQualityIndexes.size,
    QUALITY_PRESETS.high.blockFragmentCount,
    "high-quality debris should choose unique grid indexes"
  );

  for (const fragmentCount of [2, 4, 7, 14, BLOCK_FRAGMENT_COUNT]) {
    let totalMaterialUnits = 0;
    for (let index = 0; index < fragmentCount; index += 1) {
      totalMaterialUnits += getBlockFragmentMaterialUnits(index, fragmentCount);
    }
    assertEqual(
      totalMaterialUnits,
      BLOCK_RUBBLE_MATERIAL_UNITS,
      "quality-scaled visible fragments should still carry one full block of rubble material"
    );
  }
});

test("block fragments render through instanced batches instead of scene children", () => {
  const scene = new THREE.Scene();
  const instancer = new PhysicsFragmentInstancer(scene);
  const grassFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(0, 0, 0)
  );
  const secondGrassFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(1, 2, 0),
    new THREE.Vector3(0, 0, 0)
  );
  const stoneFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(2, 2, 0),
    new THREE.Vector3(0, 0, 0)
  );

  assert(grassFragment.isInstancedFragment, "block debris should opt into instanced rendering");
  assertEqual(grassFragment.fragmentBlock, BLOCK.grass, "fragment should remember its source block");
  instancer.update([grassFragment, secondGrassFragment, stoneFragment]);

  const instancedMeshes = scene.children.filter((child) => child instanceof THREE.InstancedMesh);
  assertEqual(instancedMeshes.length, 2, "fragments should batch into one instanced mesh per block type");
  assertDeepEqual(
    instancer.getStats(),
    { batches: 2, instances: 3, capacity: 3 },
    "instanced renderer should report visible fragment pressure"
  );
  grassFragment.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  instancer.update([grassFragment]);
  const grassBatch = scene.children.find((child) => child instanceof THREE.InstancedMesh);
  assert(grassBatch instanceof THREE.InstancedMesh, "fragment batch should still be available for matrix inspection");
  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const instanceRotation = new THREE.Quaternion();
  const instanceScale = new THREE.Vector3();
  grassBatch.getMatrixAt(0, instanceMatrix);
  instanceMatrix.decompose(instancePosition, instanceRotation, instanceScale);
  assert(
    instanceRotation.angleTo(grassFragment.mesh.quaternion) < 0.001,
    "instanced debris should render each fragment's tumble rotation, not just its position"
  );

  instancer.clear();
  assertEqual(instancer.getStats().instances, 0, "clearing should hide all fragment instances");
  instancer.dispose();
  assertEqual(scene.children.length, 0, "disposing should remove all instanced fragment batches from the scene");

  const freshFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(3, 2, 0),
    new THREE.Vector3(0, 0, 0)
  );
  instancer.update([freshFragment]);
  assertEqual(
    scene.children.filter((child) => child instanceof THREE.InstancedMesh).length,
    1,
    "disposed fragment batches should lazily recreate when new debris appears"
  );
  instancer.dispose();
});

test("block fragments visually tumble while flying", () => {
  const airWorld = {
    isSolid(_x: number, _y: number, _z: number): boolean {
      return false;
    }
  };
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 2, 0.5),
    new THREE.Vector3(2, 1, 0)
  );
  const startingRotation = fragment.mesh.quaternion.clone();

  fragment.update(1 / 30, airWorld);

  assert(
    fragment.mesh.quaternion.angleTo(startingRotation) > 0.001,
    "flying cube debris should spin visibly during the short settling theater"
  );
});

test("block fragments lose ground speed and sleep near the fracture site", () => {
  const floorWorld = {
    isSolid(_x: number, y: number, _z: number): boolean {
      return y === 0;
    }
  };
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 1.08, 0.5),
    new THREE.Vector3(3, 0, 0)
  );

  for (let frame = 0; frame < 90 && !fragment.isSleeping; frame += 1) {
    fragment.update(1 / 60, floorWorld);
  }

  assert(fragment.isSleeping, "grounded block fragments should settle quickly enough to become rubble");
  assert(
    fragment.mesh.position.x < 1.2,
    "ground friction should keep fragments close enough to visibly clump into nearby piles"
  );
  assertEqual(fragment.velocity.lengthSq(), 0, "sleeping fragments should stop contributing motion");
});

test("expired quality-scaled fragments still graduate into rubble", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  const fragmentCount = QUALITY_PRESETS.potato.blockFragmentCount;

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragment = PhysicsToy.createBlockFragment(
      BLOCK.dirt,
      new THREE.Vector3(0.45 + index * 0.08, 0.2, 0.5),
      new THREE.Vector3(0, 0, 0),
      getBlockFragmentMaterialUnits(index, fragmentCount)
    );

    assert(
      !shouldAbsorbFragmentIntoRubble(fragment),
      "active flying debris should not become rubble until it settles or ages out"
    );
    fragment.expire();
    assert(
      shouldAbsorbFragmentIntoRubble(fragment),
      "expired low-quality debris should still deposit its carried material before pruning"
    );
    assert(rubble.absorbFragment(fragment), "expired fragment material should be eligible for rubble absorption");
  }

  const rubbleStats = rubble.getStats();
  assertEqual(
    rubbleStats.pieces,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    "Potato's two visible shards should still deposit one full block of rubble material"
  );
  assertEqual(
    rubbleStats.health,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    "expired quality-scaled shards should preserve full rubble health"
  );
  assertEqual(scene.children.length, 1, "expired quality-scaled debris should still render as one rubble proxy");
});

function createTestFragment(
  block: number,
  x: number,
  y: number,
  z: number,
  rubbleMaterialUnits = 1
): PhysicsToy {
  return PhysicsToy.createBlockFragment(
    block,
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(0, 0, 0),
    rubbleMaterialUnits
  );
}

function sleepTestFragment(fragment: PhysicsToy): void {
  const floorY = Math.floor(fragment.mesh.position.y) - 1;
  const floorWorld = {
    isSolid(_x: number, y: number, _z: number): boolean {
      return y === floorY;
    }
  };

  // Put the sphere-ish fragment in a tiny, stable floor overlap and let the
  // real sleep logic trip. Tests should use the same "settled" signal as the
  // browser loop instead of poking private settler state.
  fragment.mesh.position.y = floorY + 1 + fragment.radius * 0.5;
  fragment.velocity.set(0, 0, 0);
  for (let frame = 0; frame < 30 && !fragment.isSleeping; frame += 1) {
    fragment.update(1 / 60, floorWorld);
  }
  assert(fragment.isSleeping, "test fragment should reach the same sleeping state as settled browser debris");
}

function sleepTestFragments(fragments: readonly PhysicsToy[]): void {
  for (const fragment of fragments) {
    sleepTestFragment(fragment);
  }
}

test("debris settler merges adjacent fractures into one region", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());

  settler.registerFracture(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 1.5, 0.5),
    [createTestFragment(BLOCK.dirt, 0.45, 1.5, 0.45)]
  );
  settler.registerFracture(
    BLOCK.dirt,
    new THREE.Vector3(2.2, 1.5, 0.5),
    [createTestFragment(BLOCK.dirt, 2.15, 1.5, 0.45)]
  );

  const stats = settler.update(0, rubble);
  assertEqual(stats.regions, 1, "nearby destroyed blocks should feed one settling region");
  assertEqual(stats.fragments, 2, "merged settling region should own both visible fragments");
});

test("debris settler keeps distant fractures in separate regions", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());

  settler.registerFracture(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 1.5, 0.5),
    [createTestFragment(BLOCK.dirt, 0.45, 1.5, 0.45)]
  );
  settler.registerFracture(
    BLOCK.dirt,
    new THREE.Vector3(5.5, 1.5, 0.5),
    [createTestFragment(BLOCK.dirt, 5.45, 1.5, 0.45)]
  );

  const stats = settler.update(0, rubble);
  assertEqual(stats.regions, 2, "distant fractures should not collapse into one fake mega-pile");
});

test("debris settler resolves same-region fragments but not cross-region fragments", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.stone, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.stone, 0.58, 1.5, 0.5);
  left.velocity.set(1, 0, 0);
  right.velocity.set(-1, 0, 0);

  settler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 1.5, 0.5), [left, right]);
  const sameRegionStats = settler.update(0.01, rubble);

  assertEqual(sameRegionStats.pairChecks, 1, "same-region debris should get one local pair check");
  assertEqual(sameRegionStats.resolvedPairs, 1, "overlapping same-region debris should separate");
  assert(left.mesh.position.x < 0.5, "left same-region fragment should be pushed outward");
  assert(right.mesh.position.x > 0.58, "right same-region fragment should be pushed outward");

  const isolatedSettler = new DebrisSettler();
  const isolatedRubble = new RubbleField(new THREE.Scene());
  const first = createTestFragment(BLOCK.stone, 0.5, 1.5, 0.5);
  const second = createTestFragment(BLOCK.stone, 0.58, 1.5, 0.5);
  isolatedSettler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 1.5, 0.5), [first]);
  isolatedSettler.registerFracture(BLOCK.stone, new THREE.Vector3(4.5, 1.5, 0.5), [second]);

  const crossRegionStats = isolatedSettler.update(0.01, isolatedRubble);
  assertEqual(crossRegionStats.pairChecks, 0, "cross-region debris should not collide even if toy positions overlap");
  assertEqual(crossRegionStats.resolvedPairs, 0, "cross-region debris should remain cheap");
});

test("debris settler lets fresh fractures break silhouette before glue can form", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.75, 1.5, 0.5);
  left.angularVelocity.set(3, 0, 0);
  right.angularVelocity.set(0, 3, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.64, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS - 0.02, rubble);

  assertEqual(stats.resolvedPairs, 1, "fresh near-touching debris should still use local contact resolution");
  assert(
    left.angularVelocity.lengthSq() + right.angularVelocity.lengthSq() > 0,
    "fresh debris should keep tumbling briefly instead of gluing into the original block silhouette"
  );
});

test("debris settler glue contacts arrest rotation and hold same-region fragments together", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.75, 1.5, 0.5);
  left.velocity.set(-1.5, 0, 0);
  right.velocity.set(1.5, 0, 0);
  left.angularVelocity.set(3, 1, 0);
  right.angularVelocity.set(-2, 0, 1);

  const distanceBefore = left.mesh.position.distanceTo(right.mesh.position);
  const relativeSpeedBefore = right.velocity.clone().sub(left.velocity).length();
  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.64, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble);
  const distanceAfter = left.mesh.position.distanceTo(right.mesh.position);
  const relativeSpeedAfter = right.velocity.clone().sub(left.velocity).length();

  assertEqual(stats.pairChecks, 1, "near-touching same-region debris should still get one local pair check");
  assertEqual(stats.resolvedPairs, 1, "near-touching same-region debris should resolve as a sticky contact");
  assert(
    distanceAfter <= distanceBefore,
    "glued debris contacts should not let touching fragments drift apart before rubble finalization"
  );
  assert(
    relativeSpeedAfter < relativeSpeedBefore * 0.5,
    "glued debris contacts should bleed separating speed so fragments clump instead of skating apart"
  );
  assertEqual(
    left.angularVelocity.lengthSq() + right.angularVelocity.lengthSq(),
    0,
    "glued debris contacts should stop independent cube spin once fragments stick together"
  );
});

test("debris settler keeps glue links shaping the heap after pair checks stop", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.75, 1.5, 0.5);
  left.velocity.set(-0.4, 0, 0);
  right.velocity.set(0.4, 0, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.64, 1.5, 0.5), [left, right]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble);

  const linkedDistance = left.mesh.position.distanceTo(right.mesh.position);
  right.mesh.position.x += 0.35;
  const stretchedDistance = left.mesh.position.distanceTo(right.mesh.position);
  const afterPairWindow = settler.update(DEBRIS_REGION_COLLISION_SECONDS + 0.02, rubble);
  const repairedDistance = left.mesh.position.distanceTo(right.mesh.position);

  assertEqual(afterPairWindow.pairChecks, 0, "old settling regions should stop doing new pair checks");
  assert(
    repairedDistance < stretchedDistance && repairedDistance <= linkedDistance + 0.2,
    "existing glue links should keep the clump from melting flat after the pair window closes"
  );
});

test("debris settler supports short-lived stacked fragment contacts", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const lower = createTestFragment(BLOCK.dirt, 0.5, 1.0, 0.5);
  const upper = createTestFragment(BLOCK.dirt, 0.51, 1.1, 0.51);
  upper.velocity.set(0, -2, 0);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.0, 0.5), [lower, upper]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble);

  assertEqual(stats.resolvedPairs, 1, "stacked same-region debris should use the local pair pass");
  assert(
    upper.mesh.position.y - lower.mesh.position.y > 0.2,
    "upper debris should be held above lower debris instead of passing straight through"
  );
  assert(
    upper.velocity.y > -1,
    "temporary stacked contact should bleed downward speed so the pile can settle before finalization"
  );
});

test("debris settler finalizes potato fragments into full rubble material", () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const fragmentCount = QUALITY_PRESETS.potato.blockFragmentCount;
  const fragments: PhysicsToy[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    fragments.push(createTestFragment(
      BLOCK.dirt,
      0.45 + index * 0.08,
      1.1,
      0.5,
      getBlockFragmentMaterialUnits(index, fragmentCount)
    ));
  }
  sleepTestFragments(fragments);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), fragments);
  settler.update(0, rubble);
  const beforeFinalize = settler.update(DEBRIS_REGION_FINALIZE_SECONDS - 0.01, rubble);
  assertEqual(beforeFinalize.finalizedBatches, 0, "region should stay visible before the finalize delay");

  const afterFinalize = settler.update(0.02, rubble);
  assertEqual(afterFinalize.finalizedBatches, 1, "region should finalize shortly after the delay");
  assertEqual(afterFinalize.finalizedPieces, BLOCK_RUBBLE_MATERIAL_UNITS, "two Potato shards should expand into full rubble material");
  assertEqual(rubble.getStats().pieces, BLOCK_RUBBLE_MATERIAL_UNITS, "rubble field should receive all gameplay material");
  assert(fragments.every((fragment) => fragment.isExpired), "finalized visible fragments should be marked for pruning");
  assert(
    fragments.every((fragment) => settler.owns(fragment)),
    "finalized fragments should stay settler-owned until pruning so orphan fallback cannot absorb them twice"
  );
  settler.forget(fragments[0]);
  assert(!settler.owns(fragments[0]), "normal toy removal should clear the stale finalized-fragment ownership marker");
});

test("debris settler waits for quiet fragments before soft finalization", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const fragments = [
    createTestFragment(BLOCK.dirt, 0.5, 1.2, 0.5),
    createTestFragment(BLOCK.dirt, 0.6, 1.2, 0.5)
  ];
  fragments[0]?.velocity.set(1.2, 0.4, 0);
  fragments[1]?.velocity.set(-1.2, 0.4, 0);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.2, 0.5), fragments);
  const afterSoftDeadline = settler.update(DEBRIS_REGION_FINALIZE_SECONDS + 0.02, rubble);
  assertEqual(
    afterSoftDeadline.finalizedBatches,
    0,
    "active debris should not freeze into rubble just because the fracture timer elapsed"
  );

  sleepTestFragments(fragments);
  const settledFrame = settler.update(0, rubble);
  assertEqual(settledFrame.finalizedBatches, 0, "settle detection should mark quiet debris without finalizing immediately");
  const justSettled = settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS - 0.01, rubble);
  assertEqual(justSettled.finalizedBatches, 0, "newly quiet debris should get a short settle grace");

  const afterQuietGrace = settler.update(0.02, rubble);
  assertEqual(afterQuietGrace.finalizedBatches, 1, "quiet debris should finalize after the settle grace");
});

test("debris settler hard-caps region lifetime after repeated nearby fractures", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());

  settler.registerFracture(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.1, 0.5),
    [createTestFragment(BLOCK.stone, 0.5, 1.1, 0.5)]
  );
  settler.update(0.59, rubble);
  settler.registerFracture(
    BLOCK.stone,
    new THREE.Vector3(1.1, 1.1, 0.5),
    [createTestFragment(BLOCK.stone, 1.1, 1.1, 0.5)]
  );
  settler.update(0.3, rubble);
  settler.registerFracture(
    BLOCK.stone,
    new THREE.Vector3(1.4, 1.1, 0.5),
    [createTestFragment(BLOCK.stone, 1.4, 1.1, 0.5)]
  );

  const justBeforeCap = settler.update(DEBRIS_REGION_MAX_SECONDS - 0.89 - 0.01, rubble);
  assertEqual(justBeforeCap.finalizedBatches, 0, "new fractures can delay finalization but not past the hard cap");
  const afterCap = settler.update(0.02, rubble);
  assertEqual(afterCap.finalizedBatches, 1, "region should finalize once the first-fracture cap is reached");
});

test("debris settler finalizes oldest regions when pair pressure exceeds the cap", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const oldestFragments: PhysicsToy[] = [];
  const newestFragments: PhysicsToy[] = [];

  for (let index = 0; index < 8; index += 1) {
    oldestFragments.push(createTestFragment(BLOCK.dirt, 0.5 + index * 0.01, 1.5, 0.5));
  }
  for (let index = 0; index < 39; index += 1) {
    newestFragments.push(createTestFragment(BLOCK.stone, 8 + index * 0.01, 1.5, 0.5));
  }

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.5, 0.5), oldestFragments);
  settler.update(0.05, rubble);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(8, 1.5, 0.5), newestFragments);

  const stats = settler.update(0.01, rubble);
  assertEqual(DEBRIS_REGION_PAIR_BUDGET, 768, "test should track the intended debris pair budget");
  assertEqual(stats.forcedFinalizations, 1, "pair pressure should force the oldest active region to finalize");
  assertEqual(stats.regions, 1, "newer under-budget region should stay alive after pressure relief");
  assertEqual(rubble.getStats().pieces, oldestFragments.length, "forced finalization should preserve oldest-region rubble material");
});

test("batched rubble absorption preserves totals and walkable support", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  rubble.absorbBatch([
    { block: BLOCK.stone, position: new THREE.Vector3(0.25, 1.1, 0.25), pieces: 6 },
    { block: BLOCK.stone, position: new THREE.Vector3(0.75, 1.1, 0.75), pieces: 5 }
  ]);
  rubble.settle(world);

  const stats = rubble.getStats();
  assertEqual(stats.pieces, 11, "batched rubble should preserve piece totals");
  assertEqual(stats.health, 11, "batched rubble should preserve health totals");
  assertEqual(stats.clusters, 1, "batched nearby samples should merge into one cover patch");
  assert(
    rubble.getSupportHeight({
      minX: 0.3,
      maxX: 0.7,
      minY: 1,
      maxY: 2.8,
      minZ: 0.3,
      maxZ: 0.7
    }) !== null,
    "batched rubble should expose the same walkable support as individual absorbs"
  );
});

test("rubble field absorbs settled fragments into cover proxies", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  const firstFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.35, 0.2, 0.35),
    new THREE.Vector3(0, 0, 0)
  );
  const secondFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.72, 0.24, 0.65),
    new THREE.Vector3(0, 0, 0)
  );

  assert(rubble.absorbFragment(firstFragment), "settled debris should be eligible for rubble absorption");
  assert(rubble.absorbFragment(secondFragment), "nearby debris of the same block should merge into one pile");
  assertEqual(scene.children.length, 1, "merged rubble should render as one cheap cover proxy");
  const rubbleStats = rubble.getStats();
  assertEqual(rubbleStats.clusters, 1, "absorbed fragments should merge into one cluster");
  assertEqual(rubbleStats.pieces, 2, "absorbed fragments should count as rubble pieces");
  assertEqual(rubbleStats.health, 2, "absorbed fragments should add destructible cover health");
  assert(
    rubbleStats.maxCoverHeight > 0.2 && rubbleStats.maxCoverHeight < 0.4,
    "absorbed fragments should report the draped surface height over the visible debris"
  );

  const hit = rubble.raycast(
    new THREE.Vector3(0.5, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );
  assert(hit, "rubble cover proxies should participate in future line-of-sight checks");
  assertEqual(hit.block, BLOCK.stone, "rubble hit should preserve the source material");

  assert(rubble.damageNearest(new THREE.Vector3(0.5, 0.1, 0.5), 2), "rubble should be destructible by gameplay damage");
  assertEqual(rubble.getStats().clusters, 0, "destroyed rubble should leave the scene and cover index");
  assertEqual(scene.children.length, 0, "destroyed rubble should remove its visible proxy");
});

test("adjacent rubble cells merge into one broad patch", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5));
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(1.5, 0.2, 0.5));

  const rubbleStats = rubble.getStats();
  assertEqual(rubbleStats.clusters, 1, "neighboring rubble cells should become one patch");
  assertEqual(rubbleStats.pieces, 2, "merged patches should keep the total material count");
  assertEqual(scene.children.length, 1, "multi-cell rubble patches should render as one mesh");

  const hit = rubble.raycast(
    new THREE.Vector3(1.5, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );
  assert(hit, "the merged patch should still cover the neighboring cell");
  assertEqual(hit.block, BLOCK.dirt, "merged patches should preserve their source material");
});

test("quality-reduced fragments still settle into full rubble material", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  const fragmentCount = QUALITY_PRESETS.potato.blockFragmentCount;

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragment = PhysicsToy.createBlockFragment(
      BLOCK.stone,
      new THREE.Vector3(0.5 + index * 0.05, 0.2, 0.5),
      new THREE.Vector3(0, 0, 0),
      getBlockFragmentMaterialUnits(index, fragmentCount)
    );

    assert(rubble.absorbFragment(fragment), "visible debris should carry its gameplay material into rubble");
  }

  const rubbleStats = rubble.getStats();
  assertEqual(
    rubbleStats.pieces,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    "low visible debris counts should still produce one full block of rubble material"
  );
  assertEqual(
    rubbleStats.health,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    "rubble health should follow material units instead of visible shard count"
  );
  assertEqual(scene.children.length, 1, "weighted rubble should still render as one merged proxy");
});

test("rubble damage targets the impacted pile instead of the healthiest neighbor", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5), 1);
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(1.5, 0.2, 0.5), 6);
  assertEqual(rubble.getStats().clusters, 1, "adjacent setup should merge into one broad rubble patch");

  assert(
    rubble.damageNearest(new THREE.Vector3(0.5, 0.1, 0.5), 1, 0.5),
    "nearby damage should find the directly targeted low-health pile"
  );

  const targetCellHit = rubble.raycast(
    new THREE.Vector3(0.5, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );
  const neighborCellHit = rubble.raycast(
    new THREE.Vector3(1.5, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );

  assertEqual(targetCellHit, null, "the impacted pile should be removed first");
  assert(neighborCellHit, "the healthier neighboring pile should not be damaged just because it shares a cluster");
  assertEqual(rubble.getStats().pieces, 6, "remaining rubble material should belong to the neighboring pile");
});

test("single-piece rubble stays in a local footprint instead of filling the whole cell", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5), 1);

  const centerHit = rubble.raycast(
    new THREE.Vector3(0.5, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );
  const edgeHit = rubble.raycast(
    new THREE.Vector3(0.08, 0.08, -2),
    new THREE.Vector3(0, 0, 1),
    6
  );

  assert(centerHit, "a lone rubble shard should still leave a visible/collidable mound where it landed");
  assertEqual(edgeHit, null, "one shard should not inflate into a full-cell bumpy pile");
});

test("rubble field lets moving cores collide with and chip cover proxies", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  for (let index = 0; index < 6; index += 1) {
    rubble.absorb(
      BLOCK.dirt,
      new THREE.Vector3(0.48 + index * 0.01, 0.18, 0.52)
    );
  }

  const core = new PhysicsToy(
    new THREE.Vector3(0.5, 0.12, 0.2),
    new THREE.Vector3(0, 0, 6)
  );
  const healthBefore = rubble.getStats().health;
  const collided = rubble.resolveCoreCollision(core);

  assert(collided, "moving cores should collide with rubble cover");
  assert(
    rubble.getStats().health < healthBefore,
    "meaningful core impacts should chip destructible rubble"
  );
  assertEqual(rubble.getStats().clusters, 0, "core impact damage should destroy a small rubble pile outright");
  assert(core.isExpired, "a core should self-destruct when it destroys the impacted rubble pile");
});

class TestRubbleWorld implements RubbleFieldWorld {
  private readonly blocks = new Map<string, number>();

  getBlock(x: number, y: number, z: number): number {
    return this.blocks.get(this.key(x, y, z)) ?? BLOCK.air;
  }

  setBlock(x: number, y: number, z: number, block: number): void {
    const key = this.key(x, y, z);
    if (block === BLOCK.air) {
      this.blocks.delete(key);
      return;
    }
    this.blocks.set(key, block);
  }

  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    return (BLOCKS[this.getBlock(x, y, z)] ?? BLOCKS[BLOCK.air]).solid;
  }

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }
}

test("block fragments rest on rubble support instead of sinking into finalized piles", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  for (let index = 0; index < 12; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    rubble.absorb(
      BLOCK.dirt,
      new THREE.Vector3(0.42 + column * 0.05, 1.1, 0.42 + row * 0.06)
    );
  }
  rubble.settle(world);

  const supportBounds = {
    minX: 0.44,
    maxX: 0.56,
    minY: 1,
    maxY: 2.8,
    minZ: 0.44,
    maxZ: 0.56
  };
  const supportY = rubble.getSupportHeight(supportBounds);
  assert(supportY !== null, "setup should create a partial-height rubble support surface");

  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0.5, supportY + BLOCK_FRAGMENT_COLLISION_RADIUS + 0.03, 0.5),
    new THREE.Vector3(0, -2, 0)
  );
  const collisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return world.isSolid(x, y, z);
    },
    getSupportHeight(bounds: CollisionBounds): number | null {
      return rubble.getSupportHeight(bounds);
    }
  };
  let lowestBottomY = Number.POSITIVE_INFINITY;

  // This is the regression the browser showed: loose debris could visually
  // land on a finalized pile, then gravity kept pulling it down because only
  // full voxel blocks counted as toy support.
  for (let frame = 0; frame < 90 && !fragment.isSleeping; frame += 1) {
    fragment.update(1 / 60, collisionWorld);
    lowestBottomY = Math.min(lowestBottomY, fragment.mesh.position.y - fragment.radius);
  }

  assert(fragment.isSleeping, "debris should settle on rubble support instead of falling through it");
  assert(
    lowestBottomY >= supportY - 0.04,
    "debris should not visibly clip down into finalized rubble while settling"
  );
  assert(
    fragment.mesh.position.y - fragment.radius >= supportY - 0.02,
    "sleeping debris should finish on top of the rubble surface"
  );
});

test("rubble support height produces walkable slopes toward nearby terrain", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);
  world.setBlock(1, 1, 0, BLOCK.stone);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), 6);
  rubble.settle(world);

  const westSupportY = rubble.getSupportHeight({
    minX: 0.25,
    maxX: 0.35,
    minY: 1,
    maxY: 2.8,
    minZ: 0.45,
    maxZ: 0.55
  });
  const eastSupportY = rubble.getSupportHeight({
    minX: 0.65,
    maxX: 0.75,
    minY: 1,
    maxY: 2.8,
    minZ: 0.45,
    maxZ: 0.55
  });
  const playerFootprintSupportY = rubble.getSupportHeight({
    minX: 0.2,
    maxX: 0.8,
    minY: 1,
    maxY: 2.8,
    minZ: 0.2,
    maxZ: 0.8
  });

  assert(westSupportY !== null, "rubble should expose support on the low side of a pile");
  assert(eastSupportY !== null, "rubble should expose support on the side facing nearby terrain");
  assert(
    eastSupportY > westSupportY + 0.01,
    "rubble support should slope upward toward a neighboring solid block instead of staying flat"
  );
  assert(
    playerFootprintSupportY !== null && playerFootprintSupportY > 1 && playerFootprintSupportY < 1.6,
    "a player-sized footprint should be able to stand on partial-height rubble cover"
  );
});

test("unsupported rubble piles fall and merge with piles below", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5));
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 2.1, 0.5));

  assertEqual(rubble.getStats().clusters, 2, "setup should start with stacked rubble piles");
  rubble.settle(world);

  assertEqual(rubble.getStats().clusters, 1, "unsupported upper pile should merge into the pile below");
  assertEqual(rubble.getStats().pieces, 2, "merged rubble should keep the total piece count");
  assertEqual(scene.children.length, 1, "merged rubble should render as one cover proxy");
  assertEqual(world.getBlock(0, 1, 0), BLOCK.air, "small merged piles should stay as proxies, not terrain");
});

test("one full block worth of rubble stays as cover instead of refilling terrain", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  assert(
    RUBBLE_BLOCK_PROMOTION_PIECES > BLOCK_FRAGMENT_COUNT,
    "rubble promotion should require more pieces than one maximum-quality block fracture"
  );

  for (let index = 0; index < BLOCK_FRAGMENT_COUNT; index += 1) {
    rubble.absorb(BLOCK.stone, new THREE.Vector3(0.5, 1.1, 0.5));
  }

  rubble.settle(world);

  assertEqual(world.getBlock(0, 1, 0), BLOCK.air, "one destroyed block should leave an open space");
  assertEqual(rubble.getStats().clusters, 1, "sub-threshold rubble should remain as a cover proxy");
  assertEqual(rubble.getStats().pieces, BLOCK_FRAGMENT_COUNT, "the proxy should keep the full debris count");
  assertEqual(scene.children.length, 1, "sub-threshold rubble should keep its proxy mesh");
});

test("large supported rubble piles compact into terrain blocks", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  for (let index = 0; index < RUBBLE_BLOCK_PROMOTION_PIECES; index += 1) {
    rubble.absorb(BLOCK.stone, new THREE.Vector3(0.5, 1.1, 0.5));
  }

  rubble.settle(world);

  assertEqual(world.getBlock(0, 1, 0), BLOCK.rubble, "large rubble piles should compact into a solid rubble block");
  assertEqual(rubble.getStats().clusters, 0, "promoted rubble should leave the proxy field");
  assertEqual(scene.children.length, 0, "promoted rubble should remove its proxy mesh");
  assert(BLOCKS[BLOCK.rubble].solid, "rubble terrain block should collide like terrain");
  assert(
    !PLACEABLE_BLOCKS.includes(BLOCK.rubble),
    "rubble blocks are generated by destruction for now, not selected from the player palette"
  );
});

test("physics impacts report speed so block damage can be thresholded", () => {
  const collisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "2,2,2";
    }
  };
  const slowToy = new PhysicsToy(
    new THREE.Vector3(1.7, 2.5, 2.5),
    new THREE.Vector3(BLOCK_DAMAGE_IMPACT_SPEED, 0, 0)
  );
  const fastToy = new PhysicsToy(
    new THREE.Vector3(1.7, 2.5, 2.5),
    new THREE.Vector3(BLOCK_DAMAGE_IMPACT_SPEED + 0.5, 0, 0)
  );

  const slowImpacts = slowToy.update(0, collisionWorld);
  const fastImpacts = fastToy.update(0, collisionWorld);

  assertEqual(slowImpacts.length, 1, "slow contact should still report the collision for tuning");
  assertEqual(fastImpacts.length, 1, "fast contact should report the collision for damage handling");
  assert(
    slowImpacts[0].speed <= BLOCK_DAMAGE_IMPACT_SPEED,
    "exactly-threshold impacts should remain below the current damage gate"
  );
  assert(
    fastImpacts[0].speed > BLOCK_DAMAGE_IMPACT_SPEED,
    "faster impacts should clear the current block damage gate"
  );
  assertEqual(fastImpacts[0].source, fastToy, "impact payloads should carry the core that caused them");
});

test("destroying an impacted block can consume the source physics core", () => {
  const collisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "2,2,2";
    }
  };
  const world = new VoxelWorld({ seed: "core-expire-test" });
  const core = new PhysicsToy(
    new THREE.Vector3(1.7, 2.5, 2.5),
    new THREE.Vector3(BLOCK_DAMAGE_IMPACT_SPEED + 0.5, 0, 0)
  );
  world.setBlock(2, 2, 2, BLOCK.stone);

  const impacts = core.update(0, collisionWorld);
  const impact = impacts[0];
  assert(impact, "setup should produce one core impact against the test block");
  const result = world.damageBlock(
    impact.block.x,
    impact.block.y,
    impact.block.z,
    PHYSICS_CORE_BLOCK_DAMAGE
  );
  if (result?.destroyed) impact.source.expire();

  assert(core.isExpired, "a core should be markable for pruning after it destroys its impact block");
  assertEqual(core.update(1 / 60, collisionWorld).length, 0, "expired cores should stop reporting impacts");
});

test("physics toy collider resolves nearby core and debris contacts through broadphase", () => {
  const collider = new PhysicsToyCollider();
  const leftCore = new PhysicsToy(
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(6, 0, 0)
  );
  const rightCore = new PhysicsToy(
    new THREE.Vector3(0.6, 2, 0),
    new THREE.Vector3(-6, 0, 0)
  );

  const coreStats = collider.resolve([leftCore, rightCore]);

  assertEqual(coreStats.activeBodies, 2, "core-core broadphase should track both active bodies");
  assertEqual(coreStats.sleepingBodies, 0, "awake core-core broadphase should not count sleeping bodies");
  assertEqual(coreStats.candidatePairs, 1, "overlapping cores should produce one unique candidate pair");
  assertEqual(coreStats.resolvedContacts, 1, "overlapping cores should resolve one contact");
  assert(
    leftCore.velocity.x < 0 && rightCore.velocity.x > 0,
    "head-on core collision should bounce velocities apart"
  );

  const core = new PhysicsToy(
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(6, 0, 0)
  );
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0.45, 2, 0),
    new THREE.Vector3(0, 0, 0)
  );
  const fragmentStats = collider.resolve([core, fragment]);

  assertEqual(fragmentStats.candidatePairs, 1, "core-fragment broadphase should produce one candidate pair");
  assertEqual(fragmentStats.resolvedContacts, 1, "core-fragment contact should resolve");
  assertEqual(fragmentStats.skippedDebrisPairs, 0, "core-fragment contact should not be treated as debris-debris");
  assert(
    fragment.velocity.x > core.velocity.x,
    "light debris should get shoved harder than the heavier core"
  );
});

test("physics toy collider skips debris-debris and far-apart work", () => {
  const collider = new PhysicsToyCollider();
  const firstFragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(3, 0, 0)
  );
  const secondFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.2, 2, 0),
    new THREE.Vector3(-3, 0, 0)
  );

  const debrisStats = collider.resolve([firstFragment, secondFragment]);

  assertEqual(debrisStats.candidatePairs, 0, "overlapping debris should not become narrowphase work");
  assertEqual(debrisStats.skippedDebrisPairs, 0, "debris-debris contacts should be avoided before pair creation");
  assertEqual(debrisStats.resolvedContacts, 0, "debris-debris contacts should not resolve yet");
  assertEqual(firstFragment.velocity.x, 3, "skipped debris contact should leave first fragment velocity alone");
  assertEqual(secondFragment.velocity.x, -3, "skipped debris contact should leave second fragment velocity alone");

  const farLeft = new PhysicsToy(
    new THREE.Vector3(-20, 2, 0),
    new THREE.Vector3(1, 0, 0)
  );
  const farRight = new PhysicsToy(
    new THREE.Vector3(20, 2, 0),
    new THREE.Vector3(-1, 0, 0)
  );
  const farStats = collider.resolve([farLeft, farRight]);

  assertEqual(farStats.activeBodies, 2, "far broadphase should still count active bodies");
  assertEqual(farStats.candidatePairs, 0, "far-apart bodies should not become narrowphase work");
  assertEqual(farStats.resolvedContacts, 0, "far-apart bodies should not resolve contacts");
  assertDeepEqual(
    createEmptyPhysicsToyCollisionStats(),
    {
      activeBodies: 0,
      sleepingBodies: 0,
      broadphaseCells: 0,
      sleepingBroadphaseCells: 0,
      candidatePairs: 0,
      resolvedContacts: 0,
      skippedDebrisPairs: 0
    },
    "empty collision stats should be stable for HUD initialization"
  );
});

test("physics toy collider avoids quadratic debris piles", () => {
  const collider = new PhysicsToyCollider();
  const denseFragments: PhysicsToy[] = [];

  for (let index = 0; index < 80; index += 1) {
    denseFragments.push(
      PhysicsToy.createBlockFragment(
        BLOCK.grass,
        new THREE.Vector3(0.5 + (index % 4) * 0.02, 2, 0.5 + Math.floor(index / 4) * 0.002),
        new THREE.Vector3(0, 0, 0)
      )
    );
  }

  const debrisOnlyStats = collider.resolve(denseFragments);
  assertEqual(debrisOnlyStats.broadphaseCells, 0, "debris-only piles should not build collision buckets");
  assertEqual(debrisOnlyStats.candidatePairs, 0, "dense debris-only piles should not create pair work");
  assertEqual(debrisOnlyStats.resolvedContacts, 0, "dense debris-only piles should not resolve contacts");

  const core = new PhysicsToy(
    new THREE.Vector3(0.5, 2, 0.5),
    new THREE.Vector3(4, 0, 0)
  );
  const coreStats = collider.resolve([core, ...denseFragments]);

  assert(coreStats.broadphaseCells > 0, "active cores should still build broadphase buckets");
  assertEqual(
    coreStats.candidatePairs,
    denseFragments.length,
    "one core should only query each nearby debris fragment once"
  );
});

test("physics toy collider keeps sleeping debris out of active pair work", () => {
  const collider = new PhysicsToyCollider();
  const floorWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return x === 0 && y === 0 && z === 0;
    }
  };
  const sleepingFragment = new PhysicsToy(
    new THREE.Vector3(0.5, 1.1, 0.5),
    new THREE.Vector3(0, 0, 0),
    {
      radius: 0.16,
      damagesBlocks: false,
      sleepSpeed: 100,
      sleepAfterSeconds: 0.01,
      castShadow: false
    }
  );
  sleepingFragment.update(0.02, floorWorld);
  const sleepingNeighbor = new PhysicsToy(
    new THREE.Vector3(0.5, 1.1, 0.9),
    new THREE.Vector3(0, 0, 0),
    {
      radius: 0.16,
      damagesBlocks: false,
      sleepSpeed: 100,
      sleepAfterSeconds: 0.01,
      castShadow: false
    }
  );
  sleepingNeighbor.update(0.02, floorWorld);

  assert(sleepingFragment.isSleeping, "test fragment should settle into sleep before broadphase indexing");
  assert(sleepingNeighbor.isSleeping, "neighbor fragment should also settle into sleep before broadphase indexing");

  const sleepingOnlyStats = collider.resolve([sleepingFragment, sleepingNeighbor]);

  assertEqual(sleepingOnlyStats.activeBodies, 0, "sleeping-only resolve should not build active bodies");
  assertEqual(sleepingOnlyStats.sleepingBodies, 2, "sleeping-only resolve should count cached sleeping debris");
  assertEqual(sleepingOnlyStats.candidatePairs, 0, "sleeping-only debris should not produce contact pairs");
  assert(
    sleepingOnlyStats.sleepingBroadphaseCells > 0,
    "sleeping debris should live in the static broadphase for later wakeup"
  );

  const farCore = new PhysicsToy(
    new THREE.Vector3(12, 2, 12),
    new THREE.Vector3(0, 0, 0)
  );
  const farStats = collider.resolve([sleepingFragment, sleepingNeighbor, farCore]);

  assertEqual(farStats.candidatePairs, 0, "far active bodies should not query sleeping debris cells");
  assert(sleepingFragment.isSleeping, "far active bodies should leave sleeping debris asleep");

  const nearCore = new PhysicsToy(
    new THREE.Vector3(0.5, 1.1, 0.16),
    new THREE.Vector3(0, 0, 4)
  );
  const wakeStats = collider.resolve([sleepingFragment, sleepingNeighbor, nearCore]);

  assertEqual(wakeStats.candidatePairs, 2, "near active body should consider every sleeping toy in the shared cell");
  assertEqual(wakeStats.resolvedContacts, 1, "near active body should resolve contact with sleeping debris");
  assert(!sleepingFragment.isSleeping, "resolved contact should wake sleeping debris for later frames");
  assert(sleepingNeighbor.isSleeping, "non-overlapping sleeping debris should stay asleep after the shared-cell query");

  collider.forget(sleepingFragment);
  collider.forget(sleepingNeighbor);
  const cleanedStats = collider.resolve([nearCore]);
  assertEqual(cleanedStats.sleepingBroadphaseCells, 0, "forgotten debris should leave the static broadphase");
});

test("quality settings clamp custom menu overrides", () => {
  const normalDefaults = createDefaultQualitySettings(QUALITY_PRESETS.normal);

  assertDeepEqual(
    normalDefaults,
    { loadRadius: 6, shadowMapSize: 2048, blockFragmentCount: 7 },
    "normal preset should expose its default tunable settings"
  );
  assertEqual(normalizeRenderDistance(-20), RENDER_DISTANCE_MIN, "render distance should keep a lower bound");
  assertEqual(normalizeRenderDistance(999), RENDER_DISTANCE_MAX, "render distance should keep an upper bound");
  assertEqual(getShadowMapSizeForQualityLevel(0), 0, "shadow quality level zero should disable shadows");
  assertEqual(
    getShadowMapSizeForQualityLevel(SHADOW_QUALITY_MAX_LEVEL),
    8192,
    "highest shadow quality level should use the largest supported map"
  );
  assertEqual(
    normalizeShadowQualityLevel(99),
    SHADOW_QUALITY_MAX_LEVEL,
    "shadow quality level should clamp to the slider range"
  );

  const normalized = normalizeQualitySettings(
    { loadRadius: 999, shadowMapSize: 3333, blockFragmentCount: 999 },
    normalDefaults
  );

  assertEqual(normalized.loadRadius, RENDER_DISTANCE_MAX, "custom render distance should clamp high");
  assertEqual(normalized.shadowMapSize, 4096, "custom shadow map size should snap to the nearest option");
  assertEqual(
    normalized.blockFragmentCount,
    BLOCK_FRAGMENT_MAX_COUNT,
    "custom debris count should clamp to the fracture-grid limit"
  );
  assertEqual(formatRenderDistance(6), "6 chunks", "render distance label should stay human-readable");
  assertEqual(formatShadowQuality(0), "Off", "shadow quality label should call out disabled shadows");
  assertEqual(formatBlockFragmentCount(0), "1 cube", "debris count label should show the clamped shard count");
});

test("physics object budget clamps and steps predictably", () => {
  assertEqual(MAX_PHYSICS_OBJECT_BUDGET, 4096, "physics object slider should expose the new 4096 cap");
  assertEqual(
    normalizePhysicsObjectBudget(null, QUALITY_PRESETS.high.physicsObjectBudget),
    QUALITY_PRESETS.high.physicsObjectBudget,
    "missing stored budget should use the active quality fallback"
  );
  assertEqual(
    normalizePhysicsObjectBudget(null),
    DEFAULT_PHYSICS_OBJECT_BUDGET,
    "missing fallback should use the default budget"
  );
  assertEqual(
    normalizePhysicsObjectBudget(MIN_PHYSICS_OBJECT_BUDGET - PHYSICS_OBJECT_BUDGET_STEP),
    MIN_PHYSICS_OBJECT_BUDGET,
    "budget should clamp to the lower safety bound"
  );
  assertEqual(
    normalizePhysicsObjectBudget(MAX_PHYSICS_OBJECT_BUDGET + PHYSICS_OBJECT_BUDGET_STEP),
    MAX_PHYSICS_OBJECT_BUDGET,
    "budget should clamp to the upper safety bound"
  );
  assertEqual(
    stepPhysicsObjectBudget(96, "increase"),
    96 + PHYSICS_OBJECT_BUDGET_STEP,
    "increase should move by one configured step"
  );
  assertEqual(
    stepPhysicsObjectBudget(96, "decrease"),
    96 - PHYSICS_OBJECT_BUDGET_STEP,
    "decrease should move by one configured step"
  );
});

test("quality presets keep scheduler and render-distance invariants", () => {
  const presetIds = [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID];
  let previousPhysicsBudget = 0;

  for (const presetId of presetIds) {
    const preset = QUALITY_PRESETS[presetId];
    assert(preset.unloadRadius > preset.loadRadius, `${preset.label} unload radius should exceed load radius`);
    assert(preset.chunkLoads >= 1, `${preset.label} should request at least one chunk load`);
    assert(preset.chunkRebuilds >= 1, `${preset.label} should request at least one chunk rebuild`);
    assert(preset.cameraFar > preset.fogNear, `${preset.label} camera far should exceed fog near`);
    assert(preset.fogFar > preset.fogNear, `${preset.label} fog far should exceed fog near`);
    assert(isPowerOfTwo(preset.shadowMapSize), `${preset.label} shadow map size should stay GPU-friendly`);
    if (preset.shadows) {
      assert(
        getShadowTexelSize(preset) <= 0.12,
        `${preset.label} shadow texel size should stay tight enough for readable nearby block shadows`
      );
      assert(
        preset.shadowNormalBias <= 0.08,
        `${preset.label} normal bias should avoid visibly detached block shadows`
      );
      assert(
        preset.shadowIntensity > 0 && preset.shadowIntensity <= 1,
        `${preset.label} shadow intensity should be explicit and normalized`
      );
    } else {
      assertEqual(preset.shadowIntensity, 0, `${preset.label} disabled shadows should not keep an intensity`);
    }
    assert(preset.minimapRowsPerFrame >= 1, `${preset.label} minimap should process at least one row`);
    assert(
      preset.physicsObjectBudget >= MIN_PHYSICS_OBJECT_BUDGET,
      `${preset.label} physics budget should respect the lower safety bound`
    );
    assert(
      preset.physicsObjectBudget <= MAX_PHYSICS_OBJECT_BUDGET,
      `${preset.label} physics budget should respect the upper safety bound`
    );
    assertEqual(
      preset.physicsObjectBudget % PHYSICS_OBJECT_BUDGET_STEP,
      0,
      `${preset.label} physics budget should stay step-aligned`
    );
    assert(
      preset.physicsObjectBudget >= previousPhysicsBudget,
      `${preset.label} physics budget should not shrink as quality increases`
    );
    assert(
      preset.blockFragmentCount >= 1 && preset.blockFragmentCount <= BLOCK_FRAGMENT_COUNT,
      `${preset.label} debris count should stay within the fracture grid`
    );
    previousPhysicsBudget = preset.physicsObjectBudget;
  }

  assertEqual(QUALITY_PRESETS.potato.distanceScale, 0.5, "Potato should remain the 0.5x baseline");
  assertEqual(QUALITY_PRESETS.normal.distanceScale, 2, "Normal should remain 2x distance");
  assertEqual(QUALITY_PRESETS[CUSTOM_PRESET_ID].label, "Custom", "Custom preset should be available for slider edits");
  assertEqual(
    QUALITY_PRESETS[CUSTOM_PRESET_ID].physicsObjectBudget,
    QUALITY_PRESETS.normal.physicsObjectBudget,
    "Custom should start from Normal's practical baseline before slider edits"
  );
  assertEqual(QUALITY_PRESETS.high.distanceScale, 4, "High should remain 4x distance");
  assertEqual(QUALITY_PRESETS.ultra.distanceScale, 6, "Ultra should remain 6x distance");
  assertEqual(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].distanceScale, 12, "Super Ultra should remain the 12x stress preset");
  assertEqual(QUALITY_PRESETS.potato.physicsObjectBudget, 64, "Potato should allow 64 physics bodies by default");
  assertEqual(QUALITY_PRESETS.low.physicsObjectBudget, 128, "Low should allow 128 physics bodies by default");
  assertEqual(QUALITY_PRESETS.normal.physicsObjectBudget, 192, "Normal should allow 192 physics bodies by default");
  assertEqual(QUALITY_PRESETS.high.physicsObjectBudget, 512, "High should allow 512 physics bodies by default");
  assertEqual(QUALITY_PRESETS.ultra.physicsObjectBudget, 1024, "Ultra should allow 1024 physics bodies by default");
  assert(
    getShadowTexelSize(QUALITY_PRESETS.high) < getShadowTexelSize(QUALITY_PRESETS.normal),
    "High should spend more shadow texels near the player than Normal"
  );
  assert(
    getShadowTexelSize(QUALITY_PRESETS.ultra) < getShadowTexelSize(QUALITY_PRESETS.normal),
    "Ultra should spend more shadow texels near the player than Normal"
  );
  assert(
    getShadowTexelSize(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID]) < getShadowTexelSize(QUALITY_PRESETS.ultra),
    "Super Ultra should have the sharpest nearby shadows"
  );
  assertEqual(QUALITY_PRESETS.potato.blockFragmentCount, 2, "Potato should spawn only two shards per destroyed block");
  assertEqual(QUALITY_PRESETS.low.blockFragmentCount, 4, "Low should spawn four shards per destroyed block");
  assertEqual(QUALITY_PRESETS.normal.blockFragmentCount, 7, "Normal should spawn seven shards per destroyed block");
  assertEqual(QUALITY_PRESETS.high.blockFragmentCount, 14, "High should spawn about half of the full shard count");
  assertEqual(QUALITY_PRESETS.ultra.blockFragmentCount, 27, "Ultra should keep the full fracture grid");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount,
    27,
    "Super Ultra should keep the full fracture grid"
  );
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].physicsObjectBudget,
    4096,
    "Super Ultra should carry the largest physics-object stress budget"
  );
  assertEqual(
    QUALITY_PRESET_ORDER.filter(shouldShowSuperUltraOptIn).join(","),
    "ultra",
    "Super Ultra opt-in should only appear once normal cycling reaches Ultra"
  );
  assert(
    shouldShowSuperUltraOptIn(SUPER_ULTRA_PRESET_ID),
    "Super Ultra opt-in should remain visible while active so players can disable it"
  );
});

test("skybox sun direction lines up with the real directional light", () => {
  const realSunDirection = SUN_OFFSET.clone().normalize();
  const skyboxSunDirection = getSkyboxAlignedSunDirection(SUN_OFFSET);
  const sunElevation = getSunElevationDegrees(SUN_OFFSET);

  assertVectorNearlyEqual(
    skyboxSunDirection,
    realSunDirection,
    "generated skybox sun should align with the directional light vector"
  );
  assert(
    sunElevation > 35 && sunElevation < 45,
    `sun elevation should stay visually readable instead of overhead; got ${sunElevation.toFixed(2)} degrees`
  );
});

test("voxel face shading follows the real sun direction", () => {
  const top = getSunlitFaceShade([0, 1, 0]);
  const bottom = getSunlitFaceShade([0, -1, 0]);
  const sunwardEast = getSunlitFaceShade([1, 0, 0]);
  const shadedWest = getSunlitFaceShade([-1, 0, 0]);
  const sunwardNorth = getSunlitFaceShade([0, 0, -1]);
  const shadedSouth = getSunlitFaceShade([0, 0, 1]);

  assert(top > sunwardEast, "top faces should keep the strongest sky fill");
  assert(sunwardEast > shadedWest, "east-facing walls should be brighter because the sun has positive X");
  assert(sunwardNorth > shadedSouth, "north-facing walls should be brighter because the sun has negative Z");
  assert(shadedWest > bottom, "undersides should stay darker than walls");
  assert(top <= 1 && bottom >= 0.42, "face shading should remain inside the vertex-color safety range");
});

test("directional shadow anchor snaps to stable light-space texels", () => {
  const basis = createDirectionalShadowBasis(SUN_OFFSET);
  const texelSize = getShadowTexelSize(QUALITY_PRESETS.normal);
  const anchor = new THREE.Vector3(12.345, 0, -7.89);
  const snappedAnchor = snapShadowAnchorToTexelGrid(anchor, basis, texelSize);
  const subTexelAnchor = snappedAnchor.clone().addScaledVector(basis.right, texelSize * 0.2);
  const snappedSubTexelAnchor = snapShadowAnchorToTexelGrid(subTexelAnchor, basis, texelSize);

  assertNearlyInteger(snappedAnchor.dot(basis.right) / texelSize, "right shadow coordinate");
  assertNearlyInteger(snappedAnchor.dot(basis.up) / texelSize, "up shadow coordinate");
  assertVectorNearlyEqual(
    snappedSubTexelAnchor,
    snappedAnchor,
    "sub-texel motion should not move the stabilized shadow anchor"
  );
});

let passed = 0;
for (const { name, run } of tests) {
  await run();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

console.log(`\n${passed}/${tests.length} engine robustness tests passed`);

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function assertNearlyInteger(value: number, message: string): void {
  const nearest = Math.round(value);
  assert(
    Math.abs(value - nearest) < 0.000001,
    `${message} should land on an integer texel coordinate`
  );
}

function assertNearlyEqual(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 0.000001, `${message}. Expected ${expected}, got ${actual}.`);
}

function assertVectorNearlyEqual(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  message: string
): void {
  const distance = actual.distanceTo(expected);
  assert(distance < 0.000001, `${message}. Distance was ${distance}.`);
}
