import * as THREE from "three";
import {
  BLOCK_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_COLLISION_RADIUS,
  BLOCK_FRAGMENT_GRID_SIZE,
  BLOCK_FRAGMENT_SPACING,
  BLOCK_FRAGMENT_VISUAL_SIZE,
  BLOCK_RUBBLE_MATERIAL_UNITS,
  TERRAIN_CHIP_FRAGMENT_MAX_COUNT,
  getBlockRubbleMaterialUnitsForHealth,
  getEjectedBlockRubbleMaterialUnits,
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  getTerrainImpactFragmentCount,
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
import type { CollisionBounds, CollisionWorld } from "../src/collision";
import { predictPhysicsCoreTrajectory } from "../src/coreAimPreview";
import {
  createDebrisShape,
  createDebrisShapeForBlock,
  getDebrisShapeGeometry
} from "../src/debrisShapes";
import { DebrisPoofRenderer, getDebrisPoofLifetimeSeconds } from "../src/debrisPoof";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PHYSICS_CORE_BLOCK_DAMAGE,
  PhysicsToy,
  PhysicsToyCollider,
  createEmptyPhysicsToyCollisionStats,
  type PhysicsImpact
} from "../src/physics";
import {
  PLAYER_CORE_MUZZLE_FORWARD_METERS,
  PLAYER_CORE_MUZZLE_SCREEN_DOWN_FRACTION,
  PLAYER_CORE_MUZZLE_SCREEN_RIGHT_FRACTION,
  PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED,
  createPlayerCoreMuzzleLocalOffset,
  createPlayerCoreShotDirection,
  createPlayerPhysicsCoreLaunchVelocity
} from "../src/physicsCoreLaunch";
import { PhysicsFragmentInstancer } from "../src/physicsInstancing";
import {
  RUBBLE_BLOCK_PROMOTION_PIECES,
  RUBBLE_FULL_BLOCK_HEALTH,
  RubbleField,
  type RubbleFieldWorld
} from "../src/rubble";
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
  PLAYER_HEIGHT,
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
import {
  DEFAULT_PHYSICS_CORE_SETTINGS,
  PHYSICS_CORE_BASE_RADIUS,
  PHYSICS_CORE_DEFAULT_SIZE_PERCENT,
  PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT,
  PHYSICS_CORE_SIZE_MAX_PERCENT,
  PHYSICS_CORE_SIZE_MIN_PERCENT,
  PHYSICS_CORE_VELOCITY_MAX_PERCENT,
  PHYSICS_CORE_VELOCITY_MIN_PERCENT,
  formatPhysicsCorePercent,
  getPhysicsCoreRadius,
  getPhysicsCoreVelocityMultiplier,
  normalizePhysicsCoreSettings
} from "../src/physicsCoreSettings";
import {
  IMPACT_CRATER_MAX_STAMPS,
  ImpactCraterField,
  createImpactCraterStampForTerrainImpact
} from "../src/impactCraterField";
import {
  PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
  PARTIAL_BLOCK_CORE_DAMAGE,
  PartialBlockMeshField,
  getPartialBlockRemainingVisualCellCount,
  getPartialBlockRemovedVisualCellCount,
  type PartialBlockCell
} from "../src/partialBlocks";
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
  DEFAULT_GROUND_DEBRIS_BUDGET,
  GROUND_DEBRIS_BUDGET_STEP,
  MAX_GROUND_DEBRIS_BUDGET,
  MAX_RIGID_DEBRIS_BODY_BUDGET,
  MIN_GROUND_DEBRIS_BUDGET,
  MIN_RIGID_DEBRIS_BODY_BUDGET,
  formatGroundDebrisBudget,
  getEffectiveRigidDebrisBodyBudget,
  normalizeGroundDebrisBudget,
  getRigidDebrisBodyBudget
} from "../src/rigidDebrisBudget";
import {
  DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS,
  FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS,
  MAX_GROUND_DEBRIS_LIFETIME_SECONDS,
  formatGroundDebrisLifetime,
  getEffectiveGroundDebrisLifetimeSeconds,
  normalizeGroundDebrisLifetime
} from "../src/debrisLifetime";
import { RigidDebrisSimulation } from "../src/rigidDebris";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "../src/shadows";
import {
  ADS_FOV_MULTIPLIER,
  BASE_CAMERA_FOV,
  SPRINT_FOV_MULTIPLIER,
  SPRINT_FOV_RESPONSE,
  getPlayerCameraTargetFov,
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
import { parseChangelogEntries } from "../src/changelog";
import { createDeleteWorldDialogCopy } from "../src/deleteWorldDialog";
import {
  DEBRIS_REGION_CONTACT_BREAKUP_SECONDS,
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
  IDLE_HIBERNATE_AFTER_SECONDS,
  IDLE_RESUME_GAP_SECONDS,
  MAX_SIMULATION_DELTA_SECONDS,
  clampSimulationDelta,
  shouldHibernateAnimationLoop,
  shouldSkipExpensiveFrame
} from "../src/frameLoop";
import { createEmptyFrameTimings, smoothFrameTimings } from "../src/frameTimings";
import {
  createPerformanceHitchRecord,
  formatPerformanceHitchRecord,
  PerformanceHitchLog,
  type PerformanceHitchStatsSnapshot
} from "../src/performanceHitchLog";
import {
  REMOTE_HITCH_LOG_MAX_RECORDS,
  createRemoteHitchLogBlobPath,
  isRemoteHitchLogAllowedOrigin,
  normalizeRemoteHitchLogPayload
} from "../src/remoteHitchLog";
import { shouldAbsorbFragmentIntoRubble } from "../src/fragmentRubble";
import {
  canFireHitscanCoreWithHotbarItem,
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
  HITSCAN_CORE_ITEM_ID,
  PHYSICS_CORE_ITEM_ID,
  createBlockItemId,
  createItemStack,
  createVoxelSandboxItemRegistry,
  getItemAction,
  getItemDefinition,
  getItemLabel
} from "../src/items";
import {
  HITSCAN_CORE_IMPACT_SPEED,
  HITSCAN_CORE_RADIUS,
  raycastHitscanCore
} from "../src/hitscanCore";
import { getHitscanBoltLifetimeSeconds } from "../src/hitscanBoltTracer";
import { SUN_OFFSET, getSunElevationDegrees } from "../src/lighting";
import {
  appendNovaChatMessage,
  createNovaChatReply,
  createNovaTerminalRoute,
  type NovaChatMessage
} from "../src/novaChat";
import { NovaContextJournal } from "../src/novaContext";
import { NovaPilot, createNovaPilotCoreLaunch, getNovaPilotDesiredPosition } from "../src/novaPilot";
import { NovaPilotReactions, type NovaPilotMessageTarget } from "../src/novaPilotReactions";
import { TargetBlockHighlighter } from "../src/targetHighlighter";
import {
  SUPERFLAT_TERRAIN_HEIGHT,
  SUPERFLAT_WORLD_SEED,
  createTerrainContext,
  generateChunkBlocks,
  getTerrainHeight,
  isSuperflatSeed
} from "../src/terrain";
import {
  parseAdminCommand,
  spawnPillarFixture,
  spawnPlatformFixture,
  spawnWallFixture
} from "../src/adminCommands";
import {
  createCodexPilotLookAtAngles,
  createCodexPilotMoveKeys,
  normalizeCodexPilotFireInput,
  normalizeCodexPilotMove,
  normalizeCodexPilotWeapon
} from "../src/codexPilot";
import { createCoreBreakTestPlan, createYawPitchToward } from "../src/testAvatar";
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

function assertClose(actual: number, expected: number, epsilon: number, message: string): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
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

function decodeTestLatticeIndex(index: number): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: index % BLOCK_FRAGMENT_GRID_SIZE,
    y: Math.floor(index / BLOCK_FRAGMENT_GRID_SIZE) % BLOCK_FRAGMENT_GRID_SIZE,
    z: Math.floor(index / (BLOCK_FRAGMENT_GRID_SIZE ** 2)) % BLOCK_FRAGMENT_GRID_SIZE
  };
}

function expectedRubbleHealthForPieces(pieces: number): number {
  return (pieces / BLOCK_RUBBLE_MATERIAL_UNITS) * RUBBLE_FULL_BLOCK_HEALTH;
}
const TEST_FRAGMENT_MATERIAL_UNITS = BLOCK_RUBBLE_MATERIAL_UNITS / BLOCK_FRAGMENT_COUNT;

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
  events.emit("rubble:damaged", {
    position: { x: 2.5, y: 1.2, z: 3.5 },
    block: BLOCK.dirt,
    remainingHealth: 2.5,
    maxHealth: 6,
    destroyed: false,
    collateral: true
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
  assert(
    snapshot.recentEvents.some((event) => event.summary.includes("Collateral rubble hit")),
    "recent event summaries should include rubble damage"
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

test("nova terminal routes chat, slash commands, and bare admin commands", () => {
  const routedCommands: string[] = [];
  const routeOptions = {
    getChatReply: (message: string) => `chat:${message}`,
    runCommand: (command: string) => {
      routedCommands.push(command);
      return { ok: command !== "explode", message: `ran:${command}` };
    },
    isCommand: (message: string) => message === "help" || message.startsWith("spawn ")
  };

  const chatRoute = createNovaTerminalRoute("hello nova", routeOptions);
  assertDeepEqual(
    chatRoute,
    {
      kind: "chat",
      echoRole: "player",
      echoText: "hello nova",
      responseRole: "nova",
      responseText: "chat:hello nova"
    },
    "ordinary terminal input should stay conversational"
  );

  const forcedChatRoute = createNovaTerminalRoute("/chat help", routeOptions);
  assertEqual(forcedChatRoute.kind, "chat", "forced chat should avoid command routing");
  assertEqual(forcedChatRoute.echoText, "help", "forced chat should strip the /chat prefix");

  const bareCommandRoute = createNovaTerminalRoute("spawn target", routeOptions);
  assertEqual(bareCommandRoute.kind, "command", "known bare admin commands should run as commands");
  assertEqual(bareCommandRoute.echoText, "$ spawn target", "command echoes should look terminal-like");
  assertEqual(bareCommandRoute.responseText, "ran:spawn target", "successful commands should return their message");

  const slashCommandRoute = createNovaTerminalRoute("/explode", routeOptions);
  assertEqual(slashCommandRoute.kind, "command", "slash-prefixed input should always run as a command");
  assertEqual(
    slashCommandRoute.responseText,
    "Command failed: ran:explode",
    "failed commands should be clearly labeled"
  );
  assertDeepEqual(
    routedCommands,
    ["spawn target", "explode"],
    "terminal command router should pass normalized commands to the runner"
  );
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
  assertEqual(
    getItemAction(itemRegistry, HITSCAN_CORE_ITEM_ID, "primary").kind,
    "physics:fire-hitscan-core",
    "hitscan core primary action should describe instant core fire"
  );
  assertEqual(
    getItemDefinition(itemRegistry, HITSCAN_CORE_ITEM_ID).category,
    "weapon",
    "hitscan core should be registered as a weapon item"
  );
});

test("hotbar scroll lane includes unarmed, placeable blocks, projectile core, and hitscan core", () => {
  const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
  const hotbarItems = createHotbarItems(PLACEABLE_BLOCKS);
  const firstItem = hotbarItems[0];
  const projectileCoreItem = hotbarItems[hotbarItems.length - 2];
  const hitscanCoreItem = hotbarItems[hotbarItems.length - 1];
  const grassItem = createItemStack(createBlockItemId(BLOCK.grass));

  assertEqual(firstItem?.itemId, EMPTY_HANDS_ITEM_ID, "hotbar should start in the explicit unarmed state");
  assertEqual(
    projectileCoreItem?.itemId,
    PHYSICS_CORE_ITEM_ID,
    "hotbar should keep the projectile physics core before the hitscan core"
  );
  assertEqual(
    hitscanCoreItem?.itemId,
    HITSCAN_CORE_ITEM_ID,
    "hotbar should end with the hitscan core item"
  );
  assertEqual(
    hotbarItems.length,
    PLACEABLE_BLOCKS.length + 3,
    "hotbar should contain unarmed, every placeable block, and both core weapons"
  );
  assertEqual(
    getHotbarItemLabel(firstItem ?? createItemStack(EMPTY_HANDS_ITEM_ID), itemRegistry),
    "Unarmed",
    "unarmed slot should have a readable HUD label"
  );
  assertEqual(
    getHotbarItemLabel(projectileCoreItem ?? createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "Physics Core",
    "projectile core slot should have a readable HUD label"
  );
  assertEqual(
    getHotbarItemLabel(hitscanCoreItem ?? createItemStack(HITSCAN_CORE_ITEM_ID), itemRegistry),
    "Hitscan Core",
    "hitscan core slot should have a readable HUD label"
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
    !canDestroyBlockWithHotbarItem(createItemStack(HITSCAN_CORE_ITEM_ID), itemRegistry),
    "holding a hitscan core should not also break targeted blocks on left click"
  );
  assert(
    canPlaceBlockWithHotbarItem(grassItem, itemRegistry),
    "selected blocks should place on right click"
  );
  assert(
    canThrowCoreWithHotbarItem(createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "selected physics core should throw on left click"
  );
  assert(
    canFireHitscanCoreWithHotbarItem(createItemStack(HITSCAN_CORE_ITEM_ID), itemRegistry),
    "selected hitscan core should fire on left click"
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

test("superflat terrain seed creates a flat test lab surface", () => {
  const terrain = createTerrainContext("  SUPERFLAT  ");
  const chunk = generateChunkBlocks(0, 0, terrain);
  const at = (x: number, y: number, z: number): number => chunk[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)];

  assert(isSuperflatSeed(SUPERFLAT_WORLD_SEED), "superflat seed helper should recognize the lab seed");
  assertEqual(terrain.seed, SUPERFLAT_WORLD_SEED, "superflat terrain context should normalize its seed");
  assertEqual(terrain.mode, "superflat", "superflat terrain should declare its terrain mode");
  assertEqual(
    getTerrainHeight(-200, 375, terrain),
    SUPERFLAT_TERRAIN_HEIGHT,
    "superflat terrain height should be constant across the map"
  );
  assertEqual(at(0, SUPERFLAT_TERRAIN_HEIGHT + 1, 0), BLOCK.air, "space above superflat terrain should be air");
  assertEqual(at(0, SUPERFLAT_TERRAIN_HEIGHT, 0), BLOCK.grass, "top superflat layer should be grass");
  assertEqual(at(0, SUPERFLAT_TERRAIN_HEIGHT - 1, 0), BLOCK.dirt, "near-surface superflat layer should be dirt");
  assertEqual(at(0, SUPERFLAT_TERRAIN_HEIGHT - 3, 0), BLOCK.stone, "deep superflat layer should be stone");
});

test("admin command parsing keeps command names and arguments predictable", () => {
  assertDeepEqual(
    parseAdminCommand("  spawn wall Stone 8 5  "),
    { name: "spawn", args: ["wall", "stone", "8", "5"] },
    "admin command parser should trim and lowercase commands"
  );
  assertDeepEqual(
    parseAdminCommand(""),
    null,
    "empty admin commands should not produce a parsed command"
  );
});

test("admin spawn fixtures place reusable terrain targets in front of the camera", () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0.5, 8, 0.5);
  camera.lookAt(0.5, 5, -5);
  camera.updateMatrixWorld();

  const wallWorld = new VoxelWorld({ seed: SUPERFLAT_WORLD_SEED });
  const wallHooks = {
    getWorld: () => wallWorld,
    getCamera: () => camera
  };
  assertEqual(spawnWallFixture(wallHooks, BLOCK.stone, 3, 2), 6, "spawned wall should report placed block count");
  assertEqual(wallWorld.getBlock(0, SUPERFLAT_TERRAIN_HEIGHT + 1, -5), BLOCK.stone, "wall should use the target block");
  assertEqual(wallWorld.getBlock(-1, SUPERFLAT_TERRAIN_HEIGHT + 2, -5), BLOCK.stone, "wall should span sideways");

  const pillarWorld = new VoxelWorld({ seed: SUPERFLAT_WORLD_SEED });
  const pillarHooks = {
    getWorld: () => pillarWorld,
    getCamera: () => camera
  };
  assertEqual(spawnPillarFixture(pillarHooks, BLOCK.ember, 4), 4, "spawned pillar should report placed block count");
  assertEqual(pillarWorld.getBlock(0, SUPERFLAT_TERRAIN_HEIGHT + 3, -5), BLOCK.ember, "pillar should stack vertically");

  const platformWorld = new VoxelWorld({ seed: SUPERFLAT_WORLD_SEED });
  const platformHooks = {
    getWorld: () => platformWorld,
    getCamera: () => camera
  };
  assertEqual(spawnPlatformFixture(platformHooks, BLOCK.sand, 3), 9, "spawned platform should report placed block count");
  assertEqual(platformWorld.getBlock(0, SUPERFLAT_TERRAIN_HEIGHT + 1, -5), BLOCK.sand, "platform should sit above the surface");
});

test("test avatar planning aims a staged target from a safe vantage", () => {
  const world = new VoxelWorld({ seed: SUPERFLAT_WORLD_SEED });
  world.ensureChunksAround(0, 0, 1);
  const plan = createCoreBreakTestPlan(world, new THREE.Vector3(0.5, 8, 0.5));
  assert(plan, "test avatar should find a superflat target plan");
  assertEqual(
    world.getBlock(plan.target.x, plan.target.y, plan.target.z),
    BLOCK.air,
    "test avatar should choose an empty target cell above the ground"
  );

  const eye = new THREE.Vector3(
    plan.feetPosition.x,
    plan.feetPosition.y + PLAYER_HEIGHT,
    plan.feetPosition.z
  );
  const direction = plan.aimPoint.clone().sub(eye).normalize();
  const reconstructed = new THREE.Vector3(
    -Math.sin(plan.yaw) * Math.cos(plan.pitch),
    Math.sin(plan.pitch),
    -Math.cos(plan.yaw) * Math.cos(plan.pitch)
  );
  assert(direction.dot(reconstructed) > 0.999, "test avatar yaw/pitch should face its aim point");

  const directAim = createYawPitchToward(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
  assertNearlyEqual(directAim.yaw, 0, 0.000001, "zero-yaw aim should face negative z");
  assertNearlyEqual(directAim.pitch, 0, 0.000001, "flat aim should have zero pitch");
});

test("codex pilot normalizes high-level play commands into safe controller inputs", () => {
  const move = normalizeCodexPilotMove({
    forward: 4,
    right: -2,
    up: 0.75,
    seconds: 99,
    sprint: true,
    flight: true
  });
  assertDeepEqual(
    move,
    {
      forward: 1,
      right: -1,
      up: 0.75,
      seconds: 8,
      sprint: true,
      flight: true
    },
    "pilot movement should clamp axes and duration before touching the player controller"
  );
  assertDeepEqual(
    createCodexPilotMoveKeys(move),
    ["KeyW", "KeyA", "Space", "ShiftLeft"],
    "pilot movement should translate intent into ordinary player key holds"
  );

  const fire = normalizeCodexPilotFireInput({
    weapon: "hitscan-core",
    count: 500,
    intervalMs: 1,
    ads: true
  });
  assertDeepEqual(
    fire,
    {
      weapon: "hitscan-core",
      count: 40,
      intervalMs: 16,
      ads: true
    },
    "pilot firing should clamp bursts and preserve explicit ADS"
  );
  assertEqual(normalizeCodexPilotWeapon("bad idea"), "selected", "unknown pilot weapons should fail closed");

  const aim = createCodexPilotLookAtAngles(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5));
  assertNearlyEqual(aim.yaw, 0, 0.000001, "pilot zero-yaw aim should face negative z");
  assertNearlyEqual(aim.pitch, 0, 0.000001, "pilot flat aim should keep pitch level");
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
  const adsFov = BASE_CAMERA_FOV * ADS_FOV_MULTIPLIER;

  assertEqual(getSprintFeedbackTargetFov(false), BASE_CAMERA_FOV, "inactive sprint feedback should use base FOV");
  assertEqual(getSprintFeedbackTargetFov(true), sprintFov, "active sprint feedback should widen FOV by 15 percent");
  assertEqual(getPlayerCameraTargetFov(false, false), BASE_CAMERA_FOV, "inactive camera feedback should use base FOV");
  assertEqual(getPlayerCameraTargetFov(false, true), adsFov, "ADS should zoom camera FOV inward by 15 percent");
  assertEqual(
    getPlayerCameraTargetFov(true, true),
    sprintFov * ADS_FOV_MULTIPLIER,
    "ADS should layer onto the current movement feedback target"
  );
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

  const firstAdsStep = smoothSprintFeedbackFov(BASE_CAMERA_FOV, adsFov, 1 / 60);
  assert(
    firstAdsStep > adsFov && firstAdsStep < BASE_CAMERA_FOV,
    "ADS zoom should ease inward instead of snapping"
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

test("performance hitch diagnosis names the dominant subsystem and pressure counters", () => {
  const timings = {
    playerMs: 1,
    chunkMs: 2,
    physicsMs: 31,
    meshMs: 7,
    minimapMs: 0.5,
    renderMs: 5,
    otherMs: 2,
    frameMs: 52
  };
  const record = createPerformanceHitchRecord(1, 250, {
    frameMs: timings.frameMs,
    timings,
    stats: createTestHitchStats({
      rigidDebris: {
        initialized: true,
        bodies: 120,
        sleepingBodies: 20,
        terrainColliders: 600,
        rubbleSupportColliders: 24
      },
      fragmentRender: {
        batches: 8,
        instances: 120,
        capacity: 160
      }
    })
  });

  assertEqual(record.primaryBucket, "physics", "largest timing bucket should become the reported hitch cause");
  assert(
    record.details.some((detail) => detail.includes("rigid debris bodies awake")),
    "physics hitches should call out awake rigid debris pressure"
  );
  assert(
    formatPerformanceHitchRecord(record).includes("physics led"),
    "formatted hitch summaries should be readable from Nova Terminal"
  );

  const warnedMessages: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...data: unknown[]) => {
    warnedMessages.push(String(data[0]));
  };
  try {
    const log = new PerformanceHitchLog({
      getNow: () => 250,
      maxRecords: 1,
      consoleLogIntervalMs: Number.POSITIVE_INFINITY
    });
    log.record({ frameMs: timings.frameMs, timings, stats: createTestHitchStats() });
    log.record({ frameMs: timings.frameMs, timings, stats: createTestHitchStats() });

    assertEqual(log.getRecent().length, 1, "hitch log should stay bounded");
    assertEqual(warnedMessages.length, 1, "console logging should throttle repeated hitch spam");
    assert(
      warnedMessages[0]?.includes("[Voxel Hitch]") ?? false,
      "console hitch logs should be easy to filter"
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("performance hitch log versions records by debugging pass", () => {
  const timings = {
    playerMs: 1,
    chunkMs: 2,
    physicsMs: 31,
    meshMs: 7,
    minimapMs: 0.5,
    renderMs: 5,
    otherMs: 2,
    frameMs: 52
  };
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    let now = 100;
    const log = new PerformanceHitchLog({
      getNow: () => now,
      maxRecords: 4,
      sessionId: "test-session",
      initialPassLabel: "first pass"
    });
    const firstRecord = log.record({ frameMs: timings.frameMs, timings, stats: createTestHitchStats() });
    now = 200;
    const secondPass = log.startPass("debris sleep repro");
    const secondRecord = log.record({ frameMs: timings.frameMs, timings, stats: createTestHitchStats() });

    assertEqual(firstRecord.logPass.passIndex, 1, "initial hitch records should include their pass index");
    assertEqual(log.getRecent().length, 1, "starting a new pass should clear stale in-memory records");
    assertEqual(secondRecord.id, 1, "record ids should restart inside each debugging pass");
    assertEqual(secondRecord.logPass.passId, secondPass.passId, "new hitch records should carry the active pass id");
    assert(
      secondRecord.logPass.passId !== firstRecord.logPass.passId &&
        secondRecord.logPass.passId.includes("debris-sleep-repro"),
      "manual repro passes should get distinct readable ids for file splitting"
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("remote hitch log payloads preserve version and deployment metadata", () => {
  const timings = {
    playerMs: 1,
    chunkMs: 2,
    physicsMs: 31,
    meshMs: 7,
    minimapMs: 0.5,
    renderMs: 5,
    otherMs: 2,
    frameMs: 52
  };
  const record = createPerformanceHitchRecord(4, 500, {
    frameMs: timings.frameMs,
    timings,
    stats: createTestHitchStats()
  });

  const normalized = normalizeRemoteHitchLogPayload({
    source: "browser",
    appVersion: "0.6.8",
    href: "https://voxel-engine-coral.vercel.app/",
    userAgent: "unit-test",
    records: [record]
  }, {
    receivedAtIso: "2026-05-16T23:01:02.003Z",
    deployment: {
      vercelEnv: "production",
      vercelUrl: "voxel-engine-coral.vercel.app",
      gitCommitSha: "abcdef1234567890",
      gitCommitRef: "main",
      gitCommitMessage: "Add remote logs"
    }
  });

  assert(normalized.ok, "valid remote hitch payloads should normalize");
  assertEqual(normalized.recordCount, 1, "one hitch record should stay one JSONL row");
  const line = JSON.parse(normalized.jsonLines.trim()) as {
    readonly appVersion: string;
    readonly deployment: { readonly gitCommitSha: string };
    readonly hitch: { readonly summary: string };
  };
  assertEqual(line.appVersion, "0.6.8", "remote hitch lines should carry the app version");
  assertEqual(line.deployment.gitCommitSha, "abcdef1234567890", "remote hitch lines should carry deployment metadata");
  assert(
    line.hitch.summary.includes("frame hitch"),
    "remote hitch lines should retain the original diagnosis payload"
  );

  const path = createRemoteHitchLogBlobPath(normalized.envelope);
  assert(
    path.startsWith("hitches/2026-05-16/v0-6-8/abcdef123456/"),
    "remote hitch blob paths should be grouped by date, version, and commit"
  );
});

test("remote hitch log endpoint rejects oversized batches and unknown origins", () => {
  assert(
    isRemoteHitchLogAllowedOrigin(
      "https://voxel-engine-coral.vercel.app",
      "voxel-engine-coral.vercel.app"
    ),
    "the production alias should be allowed to write its own hitch logs"
  );
  assert(
    isRemoteHitchLogAllowedOrigin(
      "https://voxel-engine-preview-abc.vercel.app",
      "voxel-engine-preview-abc.vercel.app"
    ),
    "same-host Vercel preview deployments should be allowed"
  );
  assert(
    !isRemoteHitchLogAllowedOrigin(
      "https://example.com",
      "voxel-engine-coral.vercel.app"
    ),
    "unrelated origins should not be allowed to fill the Blob store"
  );

  const tooManyRecords = normalizeRemoteHitchLogPayload({
    appVersion: "0.6.8",
    records: Array.from({ length: REMOTE_HITCH_LOG_MAX_RECORDS + 1 }, (_, index) => ({ id: index }))
  }, {
    receivedAtIso: "2026-05-16T23:01:02.003Z",
    deployment: {
      vercelEnv: "production",
      vercelUrl: "voxel-engine-coral.vercel.app",
      gitCommitSha: "abcdef1234567890",
      gitCommitRef: "main",
      gitCommitMessage: "Add remote logs"
    }
  });

  assert(!tooManyRecords.ok, "remote hitch batches should have a hard record cap");
  assertEqual(tooManyRecords.status, 413, "oversized remote hitch batches should report a payload error");
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
  assert(
    shouldHibernateAnimationLoop({
      pageHidden: true,
      inactiveSeconds: 0,
      hasActiveWork: true
    }),
    "hidden pages should hibernate instead of trusting RAF throttling during lock-screen sessions"
  );
  assert(
    shouldHibernateAnimationLoop({
      pageHidden: false,
      inactiveSeconds: IDLE_HIBERNATE_AFTER_SECONDS + 1,
      hasActiveWork: false
    }),
    "idle visible worlds with no pending work should stop their animation loop"
  );
  assert(
    !shouldHibernateAnimationLoop({
      pageHidden: false,
      inactiveSeconds: IDLE_HIBERNATE_AFTER_SECONDS + 1,
      hasActiveWork: true
    }),
    "pending chunk, physics, or save work should keep the loop alive until it drains"
  );
  assert(
    !shouldHibernateAnimationLoop({
      pageHidden: false,
      inactiveSeconds: IDLE_HIBERNATE_AFTER_SECONDS - 1,
      hasActiveWork: false
    }),
    "normal short idle pauses should not hibernate the engine"
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
  assertEqual(
    highlighter.object.material.color.getHex(),
    0x050505,
    "terrain block targets should use the normal dark outline"
  );
  assertVectorNearlyEqual(
    highlighter.object.position,
    new THREE.Vector3(4.5, 12.5, -2.5),
    "target highlighter should sit on the target block center"
  );

  highlighter.showBlock({ x: 1, y: 2, z: 3 }, "rubble");
  assertEqual(
    highlighter.object.material.color.getHex(),
    0xffffff,
    "settled rubble targets should use the white object outline"
  );
  assertVectorNearlyEqual(
    highlighter.object.position,
    new THREE.Vector3(1.5, 2.5, 3.5),
    "rubble target outlines should still occupy the full cube space"
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
  assertEqual(launch.velocity.y, 0, "Nova-thrown cores should not add an upward arc away from the aim direction");
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

test("world reports pending runtime work before idle hibernation", () => {
  const world = new VoxelWorld({ seed: "pending-work-test" });

  assert(!world.hasPendingRuntimeWork(), "a fresh unloaded world should not block idle hibernation");

  world.chunkLoadQueue.set("1,0", { cx: 1, cz: 0 });
  assert(world.hasPendingRuntimeWork(), "queued chunk loads should keep the frame loop awake");
  world.chunkLoadQueue.clear();

  world.pendingSavedChunkWrites.set("0,0", new Uint8Array(4));
  assert(world.hasPendingRuntimeWork(), "pending save writes should keep the heartbeat alive until storage drains");
  world.pendingSavedChunkWrites.clear();

  assert(!world.hasPendingRuntimeWork(), "cleared queues should let the idle guard hibernate again");
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

test("changelog entries sort newest first for the version modal", () => {
  const entries = parseChangelogEntries(`
# Changelog

## 0.4.9 - 2026-05-06

### Fixed

- older patch

## Unreleased

### Added

- upcoming work

## 0.10.0 - 2026-05-08

### Changed

- newest numbered release

## 0.5.0 - 2026-05-07

### Added

- current stable release with \`code\`
`);

  assertDeepEqual(
    entries.map((entry) => entry.title),
    ["Unreleased", "0.10.0", "0.5.0", "0.4.9"],
    "release notes should sort Unreleased first, then semantic versions descending"
  );
  assertEqual(entries[2]?.date, "2026-05-07", "release dates should be parsed from headings");
  assert(
    entries[2]?.body.includes("current stable release"),
    "entry bodies should preserve their markdown content for rendering"
  );
});

test("changelog parser skips an empty Unreleased placeholder", () => {
  const entries = parseChangelogEntries(`
# Changelog

## Unreleased

## 0.6.0 - 2026-05-12

### Added

- shiny gameplay slice
`);

  assertDeepEqual(
    entries.map((entry) => entry.title),
    ["0.6.0"],
    "empty Unreleased placeholders should not hide the current release notes"
  );
});

test("block damage tracks health before removing voxels", () => {
  const world = new VoxelWorld({ seed: "damage-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const maxHealth = BLOCKS[BLOCK.stone].health;
  assert(maxHealth >= 8, "ordinary terrain blocks should have room for repeated chip hits");

  const firstHit = world.damageBlock(2, 3, 4, 1);
  assertDeepEqual(
    firstHit,
    {
      block: BLOCK.stone,
      position: { x: 2, y: 3, z: 4 },
      remainingHealth: maxHealth - 1,
      maxHealth,
      destroyed: false
    },
    "first meaningful hit should damage but not remove a sturdy terrain block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.stone, "damaged block should remain in the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "world should remember sparse block damage");
  assertEqual(world.getStats().damagedBlocks, 1, "debug stats should count damaged blocks");

  const secondHit = world.damageBlock(2, 3, 4, maxHealth - 1);
  assertDeepEqual(
    secondHit,
    {
      block: BLOCK.stone,
      position: { x: 2, y: 3, z: 4 },
      remainingHealth: 0,
      maxHealth,
      destroyed: true
    },
    "enough accumulated damage should destroy the sturdy terrain block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "destroyed block should leave the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 0, "destroyed blocks should clear transient damage state");
});

test("physics core carving chips ordinary terrain before fracture", () => {
  const world = new VoxelWorld({ seed: "core-damage-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const maxHealth = BLOCKS[BLOCK.stone].health;

  assertEqual(PARTIAL_BLOCK_CORE_DAMAGE, 1, "terrain-core hits should carve one health step at a time");
  assertEqual(PHYSICS_CORE_BLOCK_DAMAGE, 30, "full core damage stays available for rubble cover impacts");

  const firstHit = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(firstHit && !firstHit.destroyed, "the first core hit should leave a partial terrain cell");
  assertClose(
    firstHit.ejectedRubbleMaterialUnits,
    getEjectedBlockRubbleMaterialUnits(0, PARTIAL_BLOCK_CORE_DAMAGE, maxHealth),
    0.000001,
    "the first carve step should eject only its material slice"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.stone, "partially carved terrain should stay in the voxel grid");
  assert(world.isSolid(2, 3, 4), "partial terrain should keep full collision for the first pass");
  assert(!world.isRenderableSolid(2, 3, 4), "normal terrain meshing should hand carved cells to custom geometry");
  assertEqual(world.getPartialBlock(2, 3, 4)?.cuts.length, 1, "the carved block should remember its visual cut");
  assertEqual(
    firstHit.bitePoofPositions?.length,
    world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes?.length,
    "the first carve should report one bite poof position for each newly destroyed presentation cell"
  );
  world.clearDamageForChunk(0, 0);
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "partial terrain should keep its damage while chunks stream out");

  let finalHit = firstHit;
  for (let hit = 2; hit <= maxHealth; hit += 1) {
    finalHit = world.carveBlock({
      x: 2,
      y: 3,
      z: 4,
      point: new THREE.Vector3(2, 3.45 + hit * 0.01, 4.45),
      normal: new THREE.Vector3(-1, 0, 0),
      speed: 18,
      amount: PARTIAL_BLOCK_CORE_DAMAGE
    });
    if (hit < maxHealth) {
      assert(finalHit && !finalHit.destroyed, "ordinary terrain should survive intermediate chip hits");
    }
  }

  assert(finalHit?.destroyed, "the final carved health step should fracture the terrain block");
  assertClose(
    finalHit.ejectedRubbleMaterialUnits,
    getEjectedBlockRubbleMaterialUnits(maxHealth - PARTIAL_BLOCK_CORE_DAMAGE, maxHealth, maxHealth),
    0.000001,
    "the final fracture should eject only the material still left inside the block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "fractured terrain should leave the voxel grid");
  assert(!world.isSolid(2, 3, 4), "fractured terrain should stop behaving like a full collision cube");
  const surfaceCell = world.getPartialBlock(2, 3, 4);
  assertEqual(surfaceCell, null, "final fracture should clear the bite mesh instead of leaving a surface puddle");
  const supportHeight = world.getSupportHeight({
    minX: 2.15,
    maxX: 2.85,
    minY: 3,
    maxY: 3.7,
    minZ: 4.15,
    maxZ: 4.85
  });
  assertEqual(supportHeight, null, "destroyed carved terrain should leave air instead of break-time support");
});

test("partial block carve results expose material poof positions for newly destroyed bite cells", () => {
  const world = new VoxelWorld({ seed: "partial-bite-poof-position-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  const firstHit = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const firstRemovedCells = [...(world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])];

  assert(firstHit && !firstHit.destroyed, "first hit should keep the block alive for partial bite feedback");
  assertEqual(
    firstHit.bitePoofPositions?.length,
    firstRemovedCells.length,
    "the first bite should spawn poofs for every newly removed lattice cell"
  );
  assert(
    (firstHit.bitePoofPositions ?? []).every((position) =>
      position.x >= 2 &&
      position.x <= 3 &&
      position.y >= 3 &&
      position.y <= 4 &&
      position.z >= 4 &&
      position.z <= 5
    ),
    "bite poof positions should stay inside the damaged voxel envelope"
  );

  const secondHit = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const firstRemovedSet = new Set(firstRemovedCells);
  const newlyRemovedCells = (world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])
    .filter((index) => !firstRemovedSet.has(index));

  assert(secondHit && !secondHit.destroyed, "second hit should still be a partial bite for this sturdy block");
  assertEqual(
    secondHit.bitePoofPositions?.length,
    newlyRemovedCells.length,
    "later bites should only report poofs for cells that disappeared on that hit"
  );
});

test("damage brushes carve neighboring macro blocks across seams", () => {
  const world = new VoxelWorld({ seed: "damage-brush-seam-test" });
  for (let z = 4; z <= 5; z += 1) {
    for (let x = 1; x <= 3; x += 1) {
      world.setBlock(x, 3, z, BLOCK.air);
    }
  }
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(2, 3, 5, BLOCK.stone);

  const result = world.carveBlockBrush({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.96),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const damagedPositions = new Set(
    result?.results.map((hit) => `${hit.position.x},${hit.position.y},${hit.position.z}`) ?? []
  );

  assert(result, "a seam brush should produce damage results");
  assertEqual(result.results.length, 2, "a seam hit should wake only the two overlapped macro blocks");
  assert(damagedPositions.has("2,3,4"), "the directly hit macro block should be damaged");
  assert(damagedPositions.has("2,3,5"), "the neighboring macro block across the seam should be damaged");
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "the primary block should take one carve step");
  assertEqual(world.getBlockDamage(2, 3, 5), 1, "the seam neighbor should take one carve step");
  assert(world.getPartialBlock(2, 3, 4), "the primary block should get a sparse micro-damage lattice");
  assert(world.getPartialBlock(2, 3, 5), "the seam neighbor should get a sparse micro-damage lattice");
  assertDeepEqual(
    result.primaryResult?.position,
    { x: 2, y: 3, z: 4 },
    "the brush should remember which damaged block owns piercing and projectile continuation"
  );
});

test("damage brushes stay sparse when an impact is centered away from seams", () => {
  const world = new VoxelWorld({ seed: "damage-brush-sparse-center-test" });
  for (let z = 4; z <= 5; z += 1) {
    for (let x = 1; x <= 3; x += 1) {
      world.setBlock(x, 3, z, BLOCK.air);
    }
  }
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(2, 3, 5, BLOCK.stone);

  const result = world.carveBlockBrush({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(result, "a centered brush should still damage the target block");
  assertEqual(result.results.length, 1, "centered hits should not allocate neighboring micro lattices");
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "the centered target should be chipped");
  assertEqual(world.getBlockDamage(2, 3, 5), 0, "the untouched neighbor should stay fully asleep");
  assertEqual(world.getPartialBlock(2, 3, 5), null, "the untouched neighbor should not get sparse partial state");
});

test("damage brush previews report bite cells without mutating terrain", () => {
  const world = new VoxelWorld({ seed: "damage-brush-preview-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const input = {
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2.5, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  };

  const preview = world.previewBlockDamageBrush(input);
  assert(preview, "a valid core impact should produce a brush preview");
  assertEqual(preview.targets.length, 1, "a centered preview should target only the primary block");
  assertEqual(preview.targets[0]?.primary, true, "the preview should mark the direct hit target");
  assert(
    (preview.targets[0]?.affectedVisualCellIndexes.length ?? 0) > 0,
    "the preview should expose the lattice cells that would be removed"
  );
  assertEqual(world.getBlockDamage(2, 3, 4), 0, "previewing should not spend block health");
  assertEqual(world.getPartialBlock(2, 3, 4), null, "previewing should not allocate partial terrain state");

  const actual = world.carveBlockBrush(input);
  assertEqual(
    actual?.results[0]?.bitePoofPositions?.length,
    preview.targets[0]?.affectedVisualCellIndexes.length,
    "previewed bite cells should match the next real carve's new bite poofs"
  );
});

test("damage brush previews include sparse seam neighbors", () => {
  const world = new VoxelWorld({ seed: "damage-brush-preview-seam-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(2, 3, 5, BLOCK.stone);

  const preview = world.previewBlockDamageBrush({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2.5, 3.5, 4.96),
    normal: new THREE.Vector3(0, 0, -1),
    incomingDirection: new THREE.Vector3(0, 0, 1),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const targetKeys = new Set(preview?.targets.map((target) =>
    `${target.position.x},${target.position.y},${target.position.z}`
  ));

  assert(preview, "a seam impact should produce a brush preview");
  assertEqual(preview.targets.length, 2, "the preview should show the same sparse neighbor fan-out as carving");
  assert(targetKeys.has("2,3,4"), "the directly hit block should be previewed");
  assert(targetKeys.has("2,3,5"), "the seam neighbor should be previewed");
  assertEqual(world.getBlockDamage(2, 3, 4), 0, "previewing seam damage should not mutate primary health");
  assertEqual(world.getBlockDamage(2, 3, 5), 0, "previewing seam damage should not mutate neighbor health");
});

test("partial block field renders faceted custom terrain cells", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 2,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      radius: 0.42,
      depth: 0.5,
      seed: 1234
    }]
  };

  field.update([cell], () => true);
  const positionAttribute = field.mesh.geometry.getAttribute("position");
  const bounds = new THREE.Box3().setFromBufferAttribute(positionAttribute);

  assertEqual(scene.children[0], field.mesh, "partial block field should own one shared scene mesh");
  assert(field.mesh.visible, "custom partial terrain should become visible when cells exist");
  assertEqual(field.getStats().cells, 1, "one cell should be represented in the partial terrain mesh");
  assert(positionAttribute.count > 24, "carved cells should have more geometry than a plain six-face cube");
  assert(bounds.min.x >= 1 && bounds.max.x <= 2, "partial block geometry should stay inside its voxel x bounds");
  assert(bounds.min.y >= 2 && bounds.max.y <= 3, "partial block geometry should stay inside its voxel y bounds");
  assert(bounds.min.z >= 3 && bounds.max.z <= 4, "partial block geometry should stay inside its voxel z bounds");

  field.dispose();
  assertEqual(scene.children.length, 0, "disposing should remove the partial block mesh from the scene");
});

test("partial block damage lattice approximates remaining material fraction", () => {
  const sevenTenthsRemaining = { damage: 3, maxHealth: 10 };
  const threeTenthsRemaining = { damage: 7, maxHealth: 10 };

  assertEqual(
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
    BLOCK_FRAGMENT_COUNT,
    "partial-block visual damage should reuse the 3x3x3 fracture lattice as presentation resolution"
  );
  assertEqual(
    getPartialBlockRemovedVisualCellCount(sevenTenthsRemaining),
    8,
    "30 percent damage should remove roughly 30 percent of the hidden visual cells"
  );
  assertEqual(
    getPartialBlockRemainingVisualCellCount(sevenTenthsRemaining),
    19,
    "7/10 HP should keep about 70 percent of the hidden visual cells"
  );
  assert(
    Math.abs(getPartialBlockRemainingVisualCellCount(threeTenthsRemaining) / BLOCK_FRAGMENT_COUNT - 0.3) <
      1 / BLOCK_FRAGMENT_COUNT,
    "remaining visual cells should track remaining HP within one lattice-cell of precision"
  );
});

test("partial block bite footprint follows tiny core trajectory through the lattice", () => {
  const world = new VoxelWorld({ seed: "partial-bite-tiny-footprint-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const removedCells = (world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])
    .map(decodeTestLatticeIndex);

  assertEqual(removedCells.length, 3, "one 10-HP carve step should remove three presentation cells");
  assert(
    removedCells.every((cell) => cell.y === 1 && cell.z === 1),
    "tiny cores should remove a narrow same-column tunnel through the lattice"
  );
  assertDeepEqual(
    removedCells.map((cell) => cell.x).sort(),
    [0, 1, 2],
    "tiny core tunnel should reach all three depths along the impact axis"
  );
});

test("partial block bite footprint widens for large cores before drilling deep", () => {
  const world = new VoxelWorld({ seed: "partial-bite-large-footprint-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: 0.42,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const removedCells = (world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])
    .map(decodeTestLatticeIndex);
  const entryPlaneCells = removedCells.filter((cell) => cell.x === 0);
  const lateralSlots = new Set(entryPlaneCells.map((cell) => `${cell.y},${cell.z}`));

  assertEqual(removedCells.length, 3, "one 10-HP carve step should still remove three presentation cells");
  assert(
    entryPlaneCells.length >= 2 && lateralSlots.size >= 2,
    "large cores should spend early damage on a wider entry-face footprint"
  );
});

test("partial block bite lattice keeps older damage from visually refilling", () => {
  const world = new VoxelWorld({ seed: "partial-bite-no-refill-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const firstBites = [...(world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])];
  assert(firstBites.length > 0, "the first damage step should remove visible bite cells");

  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(3, 3.5, 4.5),
    normal: new THREE.Vector3(1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const secondBites = new Set(world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? []);

  assert(secondBites.size >= firstBites.length, "later damage should add bite cells instead of shrinking the bite set");
  assert(
    firstBites.every((index) => secondBites.has(index)),
    "a later hit from a different side should not make earlier removed bite cells reappear"
  );
});

test("tiny fast partial-block bites can pierce through an open tunnel", () => {
  const world = new VoxelWorld({ seed: "partial-bite-pierce-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.air);

  const result = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(result?.pierceContinuation, "tiny fast cores should continue after opening a complete lattice tunnel");
  assert(result.pierceContinuation.position.x > 3, "piercing should place the core just beyond the exit face");
  assertClose(result.pierceContinuation.speed, 18 - 3 * 2.8, 0.000001, "exit speed should pay tunnel material cost");
  assert(result.pierceContinuation.velocity.x > 0, "pierce continuation should keep forward velocity");
});

test("tiny fast off-center bites still reserve a continuous pierce tunnel", () => {
  const world = new VoxelWorld({ seed: "partial-bite-off-center-pierce-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.air);

  const result = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.34, 4.34),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.2,
    speed: PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * (PHYSICS_CORE_VELOCITY_MAX_PERCENT / 100),
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const removedCells = (world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])
    .map(decodeTestLatticeIndex);

  assert(result?.pierceContinuation, "tiny fast cores should pierce even when the aim point is near lattice seams");
  assertEqual(removedCells.length, 3, "one tiny pierce should still spend one carve step of visual material");
  assertDeepEqual(
    removedCells.map((cell) => cell.x).sort(),
    [0, 1, 2],
    "off-center tiny cores should reserve one continuous through-depth tunnel"
  );
});

test("large fast partial-block bites gouge instead of piercing", () => {
  const world = new VoxelWorld({ seed: "partial-bite-large-no-pierce-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  const result = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: 0.42,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(!result?.pierceContinuation, "wide cores should not pierce even when they are fast");
});

test("tiny slow partial-block bites chip without piercing", () => {
  const world = new VoxelWorld({ seed: "partial-bite-slow-no-pierce-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  const result = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 13,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(!result?.pierceContinuation, "slow cores should not pierce even when the footprint is tiny");
});

test("tiny fast partial-block bites stop when the exit space is solid", () => {
  const world = new VoxelWorld({ seed: "partial-bite-solid-exit-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);

  const result = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: PHYSICS_CORE_BASE_RADIUS * 0.3,
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(!result?.pierceContinuation, "tiny fast cores should not pierce into an immediately solid exit cell");
});

test("partial block bites open wrinkled interior faces at the impact point", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 3,
    maxHealth: 10,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      radius: 0.46,
      depth: 0.55,
      seed: 9876
    }]
  };

  field.update([cell], () => true);
  const positions = field.mesh.geometry.getAttribute("position");
  const normals = field.mesh.geometry.getAttribute("normal");
  let interiorBiteVertices = 0;
  let wrinkledBiteVertices = 0;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const normalX = normals.getX(index);
    if (normalX < -0.35 && x > 1.05 && x < 1.7) {
      interiorBiteVertices += 1;
      if (Math.abs(x - (1 + 1 / 3)) > 0.002 && Math.abs(x - (1 + 2 / 3)) > 0.002) {
        wrinkledBiteVertices += 1;
      }
    }
  }

  assert(interiorBiteVertices > 0, "damage should reveal internal bite faces instead of only denting the outer cube");
  assert(wrinkledBiteVertices > 0, "exposed bite faces should get faceted wrinkle vertices instead of staying planar");

  field.dispose();
});

test("partial block cuts chew into neighboring exposed faces near edges", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 2,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.96, z: 0.5 },
      radius: 0.48,
      depth: 0.5,
      seed: 4321
    }]
  };

  field.update([cell], () => true);
  const positions = field.mesh.geometry.getAttribute("position");
  const normals = field.mesh.geometry.getAttribute("normal");
  let pulledTopFaceVertices = 0;

  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const normalY = normals.getY(index);
    if (normalY > 0.35 && y > 2.55 && y < 2.995) {
      pulledTopFaceVertices += 1;
    }
  }

  assert(
    pulledTopFaceVertices > 0,
    "edge-adjacent cuts should pull neighboring exposed faces inward instead of only denting the impact face"
  );

  field.dispose();
});

test("partial block field renders broken cells as wrinkled support surfaces", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const cell: PartialBlockCell = {
    block: BLOCK.grass,
    position: { x: 4, y: 5, z: 6 },
    damage: 2,
    maxHealth: 2,
    cuts: [],
    surfaceSamples: [
      { localX: 0.2, localZ: 0.3, height: 0.16, weight: 1 },
      { localX: 0.78, localZ: 0.62, height: 0.42, weight: 1.2 }
    ]
  };

  field.update([cell], () => true);
  const positions = field.mesh.geometry.getAttribute("position");
  const bounds = new THREE.Box3().setFromBufferAttribute(positions);

  assert(field.mesh.visible, "broken partial terrain should render as a visible surface patch");
  assert(positions.count > 40, "surface patches should use a low-poly heightfield instead of a single quad");
  assert(bounds.min.y >= 5, "partial support surfaces should stay inside their source cell base");
  assert(bounds.max.y > 5.25 && bounds.max.y < 6, "surface samples should create a partial-height walkable patch");

  field.dispose();
});

test("fractured terrain does not stamp a break-time surface puddle", () => {
  const world = new VoxelWorld({ seed: "partial-surface-patch-test" });
  const target = { x: 8, y: 3, z: 8 };
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      world.setBlock(target.x + dx, target.y - 1, target.z + dz, BLOCK.stone);
      world.setBlock(target.x + dx, target.y, target.z + dz, BLOCK.air);
      world.setBlock(target.x + dx, target.y + 1, target.z + dz, BLOCK.air);
    }
  }
  world.setBlock(target.x, target.y, target.z, BLOCK.stone);

  for (let hit = 0; hit < BLOCKS[BLOCK.stone].health; hit += 1) {
    world.carveBlock({
      x: target.x,
      y: target.y,
      z: target.z,
      point: new THREE.Vector3(target.x, target.y + 0.52, target.z + 0.48),
      normal: new THREE.Vector3(-1, 0, 0),
      speed: 20,
      amount: PARTIAL_BLOCK_CORE_DAMAGE
    });
  }

  const surfaceCells = world.getPartialBlocks().filter((cell) =>
    cell.surfaceSamples?.length &&
    cell.position.y === target.y &&
    Math.abs(cell.position.x - target.x) <= 1 &&
    Math.abs(cell.position.z - target.z) <= 1
  );
  assertEqual(surfaceCells.length, 0, "a final terrain fracture should not create a multi-cell wrinkled patch");

  const neighborSupportHeight = world.getSupportHeight({
    minX: target.x - 0.85,
    maxX: target.x - 0.15,
    minY: target.y,
    maxY: target.y + 0.7,
    minZ: target.z + 0.15,
    maxZ: target.z + 0.85
  });
  assertEqual(neighborSupportHeight, null, "final break should leave neighboring terrain support untouched");
});

test("chunk meshing skips carved cells and exposes adjacent terrain faces", () => {
  const chunk = new Chunk(0, 0);
  chunk.setLocal(1, 1, 1, BLOCK.stone);
  chunk.setLocal(2, 1, 1, BLOCK.stone);

  const meshWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      if (y < 0) return true;
      return chunk.getLocal(Math.floor(x), Math.floor(y), Math.floor(z)) !== BLOCK.air;
    },
    isRenderableSolid(x: number, y: number, z: number): boolean {
      if (Math.floor(x) === 1 && Math.floor(y) === 1 && Math.floor(z) === 1) return false;
      return this.isSolid(x, y, z);
    }
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const mesh = chunk.rebuildMesh(meshWorld, material);
  const positions = mesh.geometry.getAttribute("position");
  const bounds = new THREE.Box3().setFromBufferAttribute(positions);

  assert(positions.count > 0, "the neighbor of a carved cell should expose a visible terrain face");
  assert(
    bounds.min.x >= 2,
    "the carved block itself should be absent from normal chunk geometry so the custom mesh can own it"
  );

  mesh.geometry.dispose();
  material.dispose();
});

test("impact crater field stamps faceted scars on impacted block faces", () => {
  const scene = new THREE.Scene();
  const craters = new ImpactCraterField(scene);

  assert(craters.stamp({
    block: BLOCK.stone,
    blockPosition: { x: 1, y: 2, z: 3 },
    normal: new THREE.Vector3(-1, 0, 0),
    point: new THREE.Vector3(0.92, 2.5, 3.5),
    speed: 16,
    destroyed: true
  }), "meaningful block impacts should create a crater stamp");

  const stats = craters.getStats();
  const positionAttribute = craters.mesh.geometry.getAttribute("position");
  const colorAttribute = craters.mesh.geometry.getAttribute("color");
  const bounds = new THREE.Box3().setFromBufferAttribute(positionAttribute);

  assertEqual(scene.children[0], craters.mesh, "crater field should own one scene mesh");
  assert(craters.mesh.visible, "stamped crater mesh should become visible");
  assertEqual(stats.craters, 1, "one impact should add one crater sample");
  assert(stats.vertices > 0 && stats.triangles > 0, "crater stamps should build visible static geometry");
  assertEqual(
    colorAttribute.count,
    positionAttribute.count,
    "crater geometry should carry per-vertex scar colors"
  );
  assert(
    bounds.max.x < 1,
    "negative-X impact scars should sit just outside the hit block face instead of drifting into the voxel"
  );
  assert(
    bounds.min.y > 2 && bounds.max.y < 3,
    "face-clamped crater geometry should stay within the hit block's vertical face span"
  );
  assert(
    bounds.min.z > 3 && bounds.max.z < 4,
    "face-clamped crater geometry should stay within the hit block's horizontal face span"
  );

  craters.dispose();
});

test("impact crater field caps old stamps and clears its static mesh", () => {
  const scene = new THREE.Scene();
  const craters = new ImpactCraterField(scene);

  for (let index = 0; index < IMPACT_CRATER_MAX_STAMPS + 8; index += 1) {
    craters.stamp({
      block: BLOCK.dirt,
      blockPosition: { x: index, y: 4, z: 0 },
      normal: new THREE.Vector3(0, 1, 0),
      point: new THREE.Vector3(index + 0.5, 5, 0.5),
      speed: 10,
      destroyed: false
    });
  }

  assertEqual(
    craters.getStats().craters,
    IMPACT_CRATER_MAX_STAMPS,
    "crater field should cap stale static scars before they become unbounded visual baggage"
  );
  craters.clear();
  assertEqual(craters.getStats().craters, 0, "clearing should drop crater stats");
  assert(!craters.mesh.visible, "clearing should hide the shared crater mesh");

  craters.dispose();
  assertEqual(scene.children.length, 0, "disposing should remove the crater mesh from the scene");
});

test("impact crater stamps destroyed hits onto surviving exposed faces", () => {
  const hostWorld = {
    getBlock(x: number, y: number, z: number): number {
      return x === 2 && y === 2 && z === 3 ? BLOCK.stone : BLOCK.air;
    }
  };

  const craterStamp = createImpactCraterStampForTerrainImpact(
    hostWorld,
    {
      block: BLOCK.grass,
      position: { x: 1, y: 2, z: 3 },
      destroyed: true
    },
    {
      normal: new THREE.Vector3(-1, 0, 0),
      position: new THREE.Vector3(0.94, 2.55, 3.45),
      speed: 14
    }
  );

  assert(craterStamp, "destroyed block impacts should look for a surviving exposed host face");
  assertDeepEqual(
    craterStamp.blockPosition,
    { x: 2, y: 2, z: 3 },
    "the crater host should be the solid cell behind the destroyed voxel, not the air cell that just disappeared"
  );
  assertEqual(craterStamp.block, BLOCK.stone, "destroyed-block craters should inherit the surviving host material");
  assertVectorNearlyEqual(
    craterStamp.normal,
    new THREE.Vector3(-1, 0, 0),
    "the surviving host face should point back into the destroyed voxel"
  );

  const scene = new THREE.Scene();
  const craters = new ImpactCraterField(scene);
  craters.stamp(craterStamp);
  const bounds = new THREE.Box3().setFromBufferAttribute(craters.mesh.geometry.getAttribute("position"));
  assert(
    bounds.max.x < 2,
    "destroyed-block crater geometry should sit against the surviving host face instead of floating at the removed voxel face"
  );
  craters.dispose();
});

test("impact crater field removes scars hosted by destroyed blocks", () => {
  const scene = new THREE.Scene();
  const craters = new ImpactCraterField(scene);
  const host = { x: 3, y: 1, z: 2 };

  craters.stamp({
    block: BLOCK.stone,
    blockPosition: host,
    normal: new THREE.Vector3(0, 0, -1),
    point: new THREE.Vector3(3.5, 1.5, 2),
    speed: 8
  });
  assertEqual(craters.getStats().craters, 1, "setup should create one hosted crater");

  craters.removeBlock(host);
  assertEqual(craters.getStats().craters, 0, "destroying a crater host should remove its scar geometry");
  assert(!craters.mesh.visible, "removing the final hosted crater should hide the mesh");
  craters.dispose();
});

test("destroyed impact craters skip empty back faces instead of leaving floating decals", () => {
  const emptyWorld = {
    getBlock(): number {
      return BLOCK.air;
    }
  };
  const craterStamp = createImpactCraterStampForTerrainImpact(
    emptyWorld,
    {
      block: BLOCK.grass,
      position: { x: 1, y: 2, z: 3 },
      destroyed: true
    },
    {
      normal: new THREE.Vector3(-1, 0, 0),
      position: new THREE.Vector3(0.94, 2.55, 3.45),
      speed: 14
    }
  );

  assertEqual(
    craterStamp,
    null,
    "destroyed-block impacts without a surviving host face should not leave unsupported crater geometry"
  );
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
    const shapeIds = new Set<string>();
    for (let index = 0; index < fragmentCount; index += 1) {
      totalMaterialUnits += getBlockFragmentMaterialUnits(index, fragmentCount);
      shapeIds.add(createDebrisShapeForBlock(BLOCK.stone, {
        fragmentIndex: index,
        distributedFragmentIndex: getDistributedBlockFragmentIndex(index, fragmentCount),
        origin: { x: 4, y: 8, z: 12 }
      }).shapeId);
    }
    assertClose(
      totalMaterialUnits,
      BLOCK_RUBBLE_MATERIAL_UNITS,
      0.000001,
      "quality-scaled visible fragments should still carry one full block of rubble material"
    );
    assert(shapeIds.size >= 1, "shape assignment should not affect fragment material accounting");
    if (fragmentCount === BLOCK_FRAGMENT_COUNT) {
      assert(shapeIds.size > 1, "full-quality fractures should visibly mix shard shapes");
    }
  }
});

test("terrain impact fragment counts eject chips without duplicating material", () => {
  assertClose(
    getBlockRubbleMaterialUnitsForHealth(7, 10),
    BLOCK_RUBBLE_MATERIAL_UNITS * 0.7,
    0.000001,
    "7/10 HP should leave exactly 70 percent of one block-volume material budget"
  );
  assertClose(
    getEjectedBlockRubbleMaterialUnits(0, 1, 10),
    BLOCK_RUBBLE_MATERIAL_UNITS * 0.1,
    0.000001,
    "the first 10-HP chip should eject the difference between 100% and 90% material"
  );
  assertClose(
    getEjectedBlockRubbleMaterialUnits(9, 10, 10),
    BLOCK_RUBBLE_MATERIAL_UNITS * 0.1,
    0.000001,
    "the final 10-HP chip should eject the last remaining material"
  );
  let tenHitMaterialTotal = 0;
  for (let damage = 0; damage < 10; damage += 1) {
    tenHitMaterialTotal += getEjectedBlockRubbleMaterialUnits(damage, damage + 1, 10);
  }
  assertClose(
    tenHitMaterialTotal,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    0.000001,
    "ten one-damage chips should still emit exactly one full block of material"
  );

  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS, true),
    BLOCK_FRAGMENT_COUNT,
    "a whole-block fracture can use the full visible debris budget"
  );
  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS * 0.1, true),
    3,
    "a nearly-empty final fracture should only spawn debris for the remaining material"
  );
  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS, false),
    TERRAIN_CHIP_FRAGMENT_MAX_COUNT,
    "non-final chip hits should stay visually small even when they remove a large material slice"
  );
  assertEqual(
    getTerrainImpactFragmentCount(QUALITY_PRESETS.potato.blockFragmentCount, BLOCK_RUBBLE_MATERIAL_UNITS, false),
    1,
    "Potato chip hits should still spawn a visible shard without flooding the CPU"
  );

  for (const materialUnits of [0.04, 0.1, 0.27, 0.5, BLOCK_RUBBLE_MATERIAL_UNITS]) {
    const fragmentCount = getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, materialUnits, materialUnits <= 0.1);
    let carriedUnits = 0;
    for (let index = 0; index < fragmentCount; index += 1) {
      carriedUnits += getBlockFragmentMaterialUnits(index, fragmentCount, materialUnits);
    }
    assertClose(
      carriedUnits,
      materialUnits,
      0.000001,
      "proportional terrain debris should carry exactly the material slice it ejected"
    );
  }
});

test("block fragments render through instanced batches instead of scene children", () => {
  const scene = new THREE.Scene();
  const instancer = new PhysicsFragmentInstancer(scene);
  const chunkyShape = createDebrisShape("chunky-chip");
  const slabShape = createDebrisShape("flat-slab");
  const grassFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    chunkyShape
  );
  const secondGrassFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(1, 2, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    slabShape
  );
  const stoneFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(2, 2, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    chunkyShape
  );

  assert(grassFragment.isInstancedFragment, "block debris should opt into instanced rendering");
  assertEqual(grassFragment.fragmentBlock, BLOCK.grass, "fragment should remember its source block");
  assertEqual(grassFragment.debrisShape?.shapeId, "chunky-chip", "fragment should remember its shard shape");
  instancer.update([grassFragment, secondGrassFragment, stoneFragment]);

  const instancedMeshes = scene.children.filter((child) => child instanceof THREE.InstancedMesh);
  assertEqual(
    instancedMeshes.length,
    3,
    "fragments should batch into one instanced mesh per block and shard shape"
  );
  assertDeepEqual(
    instancer.getStats(),
    { batches: 3, instances: 3, capacity: 3 },
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
  assertVectorNearlyEqual(
    instanceScale,
    chunkyShape.visualScale,
    "instanced debris should render each fragment's non-uniform shard scale"
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
    "flying shard debris should spin visibly during the short settling theater"
  );
});

test("settled debris cleanup blinks before expiring", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  sleepTestFragment(fragment);

  fragment.updateGroundDebrisCleanup(0.2, 1);
  assert(!fragment.isExpired, "freshly settled cleanup debris should remain visible at first");
  assert(fragment.isFragmentRenderVisible, "cleanup debris should not blink until the final lifetime window");

  fragment.updateGroundDebrisCleanup(0.5, 1);
  assert(!fragment.isExpired, "cleanup debris should still wait for the shorter final blink window");
  assert(fragment.isFragmentRenderVisible, "cleanup debris should stay steady before the shortened blink window");

  fragment.updateGroundDebrisCleanup(0.2, 1);
  assert(!fragment.isExpired, "cleanup debris should blink before it disappears");
  assert(!fragment.isFragmentRenderVisible, "cleanup debris should hide on one of the accelerating blink beats");

  fragment.updateGroundDebrisCleanup(0.15, 1);
  assert(fragment.isExpired, "cleanup debris should expire once its grounded lifetime elapses");
});

test("forever debris lifetime keeps settled fragments renderable", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  sleepTestFragment(fragment);

  fragment.updateGroundDebrisCleanup(120, null);

  assert(!fragment.isExpired, "forever cleanup should not expire settled debris");
  assert(fragment.isFragmentRenderVisible, "forever cleanup should keep debris visible");
});

test("debris cleanup starts after first grounded contact", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 3.1, 0.5);

  fragment.updateGroundDebrisCleanup(10, 1, false);
  assert(!fragment.isExpired, "airborne debris should not consume its cleanup lifetime");
  assert(fragment.isFragmentRenderVisible, "airborne debris should stay renderable before first ground contact");

  fragment.updateGroundDebrisCleanup(0.5, 1, true);
  assert(!fragment.isExpired, "grounded debris should start its cleanup clock");

  fragment.updateGroundDebrisCleanup(0.6, 1, false);
  assert(fragment.isExpired, "cleanup should continue after debris has first touched the ground");
});

test("stale airborne debris eventually uses cleanup as a floater fallback", () => {
  const airWorld = {
    isSolid(_x: number, _y: number, _z: number): boolean {
      return false;
    }
  };
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 8.1, 0.5);

  fragment.update(5.9, airWorld);
  fragment.updateGroundDebrisCleanup(1, 3, false);
  assert(!fragment.isExpired, "fresh airborne debris should survive the fallback grace window");

  fragment.update(0.2, airWorld);
  fragment.updateGroundDebrisCleanup(3.1, 3, false);
  assert(fragment.isExpired, "stale never-grounded debris should not float forever");
});

test("debris cleanup poof renders as a short-lived material-tinted burst", () => {
  const scene = new THREE.Scene();
  const poofs = new DebrisPoofRenderer(scene);

  poofs.spawn(new THREE.Vector3(1, 2, 3), BLOCK.grass);
  assertEqual(poofs.getStats().activePoofs, 1, "cleanup should spawn one short-lived poof");
  assert(
    poofs.getStats().activeParticles > 0,
    "cleanup poof should contain multiple visible dust particles"
  );
  assertEqual(scene.children.length, 1, "cleanup poof should attach one render group to the scene");

  poofs.update(getDebrisPoofLifetimeSeconds() * 0.5);
  assertEqual(poofs.getStats().activePoofs, 1, "cleanup poof should survive the first half of its lifetime");

  poofs.update(getDebrisPoofLifetimeSeconds());
  assertEqual(poofs.getStats().activePoofs, 0, "cleanup poof should remove itself after its lifetime");
  assertEqual(scene.children.length, 0, "expired cleanup poof should leave no scene children behind");
  poofs.dispose();
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
  assertNearlyEqual(
    rubbleStats.health,
    RUBBLE_FULL_BLOCK_HEALTH,
    "expired quality-scaled shards should preserve one block worth of rubble durability"
  );
  assertEqual(scene.children.length, 1, "expired quality-scaled debris should still render as one rubble proxy");
});

test("orphan fragments respect the active debris bubble before rubble absorption", () => {
  const activeCenter = new THREE.Vector3(0.5, 1.1, 0.5);
  const nearFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(1, 1.1, 0.5),
    new THREE.Vector3(0, 0, 0)
  );
  const farFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(20, 1.1, 0.5),
    new THREE.Vector3(0, 0, 0)
  );
  const farSleepingFragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(20, 1.1, 0.5),
    new THREE.Vector3(0, 0, 0)
  );

  sleepTestFragment(nearFragment);
  sleepTestFragment(farSleepingFragment);

  assert(
    !shouldAbsorbFragmentIntoRubble(nearFragment, { activeCenter, activeRadius: 8 }),
    "sleeping orphan debris should stay physical while still inside the player bubble"
  );
  assert(
    !shouldAbsorbFragmentIntoRubble(farFragment, { activeCenter, activeRadius: 8 }),
    "awake orphan debris outside the player bubble should not freeze into rubble mid-flight"
  );
  assert(
    shouldAbsorbFragmentIntoRubble(farSleepingFragment, { activeCenter, activeRadius: 8 }),
    "sleeping orphan debris outside the player bubble should become cheap rubble"
  );
});

test("rigid debris adapter steps a falling cuboid onto terrain and lets it sleep", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  rigidDebris.registerFragment(fragment);
  for (let frame = 0; frame < 360 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
  }

  assert(fragment.isRigidDebrisDriven, "registered block debris should be driven by the rigid-body adapter");
  assert(fragment.isSleeping, "rigid debris should use Rapier sleep instead of spinning forever");
  assert(
    fragment.mesh.position.y - BLOCK_FRAGMENT_VISUAL_SIZE * 0.5 >= -0.02,
    "rigid cuboid debris should settle on top of the terrain collider"
  );
  assertEqual(rigidDebris.getStats().bodies, 1, "the adapter should keep the active fragment body registered");

  rigidDebris.clear();
  assertEqual(rigidDebris.getStats().bodies, 0, "clearing rigid debris should remove dynamic bodies");
});

test("rigid debris adapter wakes sleeping shards when active debris hits them", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const sleepingFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.2, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  rigidDebris.registerFragment(sleepingFragment);
  for (let frame = 0; frame < 360 && !sleepingFragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
  }
  assert(sleepingFragment.isSleeping, "target shard should start parked as sleeping rigid debris");

  const startX = sleepingFragment.mesh.position.x;
  const striker = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(startX - 0.45, sleepingFragment.mesh.position.y + 0.01, 0.5),
    new THREE.Vector3(10, 0, 0),
    1
  );

  rigidDebris.registerFragment(striker);
  let wokeFromDebrisContact = false;
  for (let frame = 0; frame < 90 && !wokeFromDebrisContact; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
    wokeFromDebrisContact =
      !sleepingFragment.isSleeping &&
      sleepingFragment.mesh.position.x > startX + 0.005;
  }

  assert(wokeFromDebrisContact, "an active shard should wake and shove sleeping rigid debris on contact");
  rigidDebris.clear();
});

test("rigid debris adapter keeps fast falling shards from outrunning terrain colliders", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 4.5, 0.5),
    new THREE.Vector3(0, -42, 0),
    1,
    createDebrisShape("flat-slab")
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  rigidDebris.registerFragment(fragment);
  for (let frame = 0; frame < 180 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
  }

  assert(
    fragment.mesh.position.y > -0.2,
    "fast falling rigid debris should not tunnel through the terrain collider bubble"
  );
  assert(
    rigidDebris.getStats().terrainColliders > 0,
    "fast falling rigid debris should build temporary terrain colliders along its predicted path"
  );
  rigidDebris.clear();
});

test("rigid debris adapter registers per-fragment cuboid half extents", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shardShape = createDebrisShape("long-splinter");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    1,
    shardShape
  );

  rigidDebris.registerFragment(fragment);
  const registeredHalfExtents = rigidDebris.getRegisteredColliderHalfExtents(fragment);
  assert(registeredHalfExtents, "registered rigid debris should expose its cuboid envelope");
  assertVectorNearlyEqual(
    registeredHalfExtents,
    shardShape.colliderHalfExtents,
    "rigid debris should use the fragment's own cuboid envelope instead of one global cuboid size"
  );

  rigidDebris.clear();
});

test("rigid debris adapter builds temporary support colliders from rubble height queries", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const supportY = 0.5;
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 2, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );
  const supportWorld: CollisionWorld = {
    isSolid(): boolean {
      return false;
    },
    getSupportHeight(bounds): number | null {
      return bounds.minX <= 0.5 && bounds.maxX >= 0.5 && bounds.minZ <= 0.5 && bounds.maxZ >= 0.5
        ? supportY
        : null;
    }
  };

  rigidDebris.registerFragment(fragment);
  for (let frame = 0; frame < 360 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, supportWorld);
  }

  assert(fragment.isSleeping, "rigid debris should settle on generated rubble support colliders");
  assert(
    fragment.mesh.position.y - BLOCK_FRAGMENT_VISUAL_SIZE * 0.5 >= supportY - 0.02,
    "rigid debris should not sink through partial-height rubble support"
  );
  assert(
    rigidDebris.getStats().rubbleSupportColliders > 0,
    "the adapter should expose temporary rubble-support colliders near active debris"
  );
  rigidDebris.clear();
});

function createTestFragment(
  block: number,
  x: number,
  y: number,
  z: number,
  rubbleMaterialUnits = TEST_FRAGMENT_MATERIAL_UNITS
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
  const sameRegionStats = settler.update(DEBRIS_REGION_CONTACT_BREAKUP_SECONDS + 0.01, rubble);

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
  const right = createTestFragment(BLOCK.grass, 0.62, 1.5, 0.5);
  left.angularVelocity.set(3, 0, 0);
  right.angularVelocity.set(0, 3, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.56, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS - 0.02, rubble);

  assertEqual(stats.resolvedPairs, 1, "fresh near-touching debris should still use local contact resolution");
  assert(
    left.angularVelocity.lengthSq() + right.angularVelocity.lengthSq() > 0,
    "fresh debris should keep tumbling briefly instead of gluing into the original block silhouette"
  );
});

test("debris settler lets dense fracture grids spread before contact damping starts", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.62, 1.5, 0.5);
  left.velocity.set(-2, 0, 0);
  right.velocity.set(2, 0, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.56, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_CONTACT_BREAKUP_SECONDS - 0.01, rubble);

  assertEqual(stats.pairChecks, 0, "the earliest breakup frames should not damp dense grid contacts yet");
  assert(
    left.velocity.x <= -1.95 && right.velocity.x >= 1.95,
    "overlapped fresh grid debris should keep its launch energy before local contact solving starts"
  );
});

test("debris settler does not pull fresh breakup debris back into intact-block formation", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.2, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.8, 1.5, 0.5);
  left.velocity.set(-2, 0, 0);
  right.velocity.set(2, 0, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.5, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS * 0.5, rubble);

  assertEqual(stats.resolvedPairs, 0, "separated fresh debris should not resolve into a sticky contact yet");
  assert(
    left.velocity.x <= -1.95 && right.velocity.x >= 1.95,
    "fresh breakup debris should keep its outward velocity instead of being pulled back toward the original voxel grid"
  );
});

test("debris settler glue contacts arrest rotation and hold same-region fragments together", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.62, 1.5, 0.5);
  left.velocity.set(-1.5, 0, 0);
  right.velocity.set(1.5, 0, 0);
  left.angularVelocity.set(3, 1, 0);
  right.angularVelocity.set(-2, 0, 1);

  const distanceBefore = left.mesh.position.distanceTo(right.mesh.position);
  const relativeSpeedBefore = right.velocity.clone().sub(left.velocity).length();
  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.56, 1.5, 0.5), [left, right]);
  const stats = settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble);
  const distanceAfter = left.mesh.position.distanceTo(right.mesh.position);
  const relativeSpeedAfter = right.velocity.clone().sub(left.velocity).length();

  assertEqual(stats.pairChecks, 1, "near-touching same-region debris should still get one local pair check");
  assertEqual(stats.resolvedPairs, 1, "near-touching same-region debris should resolve as a sticky contact");
  assert(
    distanceAfter <= distanceBefore + BLOCK_FRAGMENT_VISUAL_SIZE,
    "glued debris contacts should only separate tiny overlaps enough to make a readable clump"
  );
  assert(
    relativeSpeedAfter < relativeSpeedBefore * 0.5,
    "glued debris contacts should bleed separating speed so fragments clump instead of skating apart"
  );
  assertEqual(
    left.angularVelocity.lengthSq() + right.angularVelocity.lengthSq(),
    0,
    "glued debris contacts should stop independent shard spin once fragments stick together"
  );
});

test("debris settler keeps glued fragments from sleeping with visible overlap", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const activeCenter = new THREE.Vector3(0.56, 1.5, 0.5);
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.6, 1.5, 0.5);
  left.velocity.set(0, 0, 0);
  right.velocity.set(0, 0, 0);

  settler.registerFracture(BLOCK.grass, activeCenter, [left, right]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  const distanceAfterContact = left.mesh.position.distanceTo(right.mesh.position);

  settler.update(DEBRIS_REGION_COLLISION_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });
  const distanceAfterGlueSettles = left.mesh.position.distanceTo(right.mesh.position);
  const minimumReadableSeparation = BLOCK_FRAGMENT_VISUAL_SIZE * 0.95;

  assert(
    distanceAfterContact >= minimumReadableSeparation,
    "overlapped debris should separate before contact glue records the clump pose"
  );
  assert(
    distanceAfterGlueSettles >= minimumReadableSeparation,
    "glue enforcement should not pull separated debris back into an overlapping pose"
  );
});

test("debris settler sleeps quiet glued bubble fragments so clumps stop spinning", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const activeCenter = new THREE.Vector3(0.56, 1.08, 0.5);
  const left = createTestFragment(BLOCK.grass, 0.5, 1.08, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.62, 1.08, 0.5);
  const floorWorld = {
    isSolid(_x: number, y: number, _z: number): boolean {
      return y === 0;
    }
  };

  left.velocity.set(-1.2, 0, 0);
  right.velocity.set(1.2, 0, 0);

  settler.registerFracture(BLOCK.grass, activeCenter, [left, right]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  left.update(1 / 120, floorWorld);
  right.update(1 / 120, floorWorld);
  assert(left.hadSupportContactLastUpdate, "left shard should report support before the clump sleeps");
  assert(right.hadSupportContactLastUpdate, "right shard should report support before the clump sleeps");
  right.velocity.set(0.1, 0, 0);
  right.angularVelocity.set(0.1, 0, 0);

  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });
  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });

  assert(right.isSleeping, "quiet glued debris inside the active bubble should sleep instead of spinning forever");
  assertEqual(rubble.getStats().pieces, 0, "nearby quiet bubble debris should sleep in place instead of finalizing");
});

test("debris settler sleeps quiet supported clumps even when upper shards are still spinning", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const activeCenter = new THREE.Vector3(0.54, 1.15, 0.5);
  const lower = createTestFragment(BLOCK.grass, 0.5, 1.08, 0.5);
  const upper = createTestFragment(BLOCK.grass, 0.55, 1.18, 0.5);
  const floorWorld = {
    isSolid(_x: number, y: number, _z: number): boolean {
      return y === 0;
    }
  };

  lower.velocity.set(0, 0, 0);
  upper.velocity.set(0.08, 0, 0);
  upper.angularVelocity.set(8, 0, 0);
  lower.update(1 / 120, floorWorld);
  assert(!lower.isSleeping, "one support tick should anchor the clump without pre-sleeping the lower shard");
  assert(lower.hadSupportContactLastUpdate, "lower shard should report terrain support to the settling region");

  settler.registerFracture(BLOCK.grass, activeCenter, [lower, upper]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });

  assert(lower.isSleeping, "supported glued clumps should sleep in place once their linear motion is quiet");
  assert(upper.isSleeping, "upper shards resting on the clump should stop spinning instead of waiting for terrain contact");
  assertEqual(upper.angularVelocity.lengthSq(), 0, "settled upper shards should have no leftover visual spin");
  assertEqual(rubble.getStats().pieces, 0, "nearby supported clumps should remain physical inside the active bubble");
});

test("debris settler only sleeps the supported component inside a mixed settling region", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const activeCenter = new THREE.Vector3(0.54, 1.15, 0.5);
  const supportedLower = createTestFragment(BLOCK.grass, 0.5, 1.08, 0.5);
  const supportedUpper = createTestFragment(BLOCK.grass, 0.55, 1.18, 0.5);
  const unsupportedFloater = createTestFragment(BLOCK.grass, 0.86, 1.18, 0.5);
  const floorWorld = {
    isSolid(_x: number, y: number, _z: number): boolean {
      return y === 0;
    }
  };

  supportedLower.velocity.set(0, 0, 0);
  supportedUpper.velocity.set(0.06, 0, 0);
  unsupportedFloater.velocity.set(0.04, 0, 0);
  unsupportedFloater.angularVelocity.set(7, 0, 0);
  supportedLower.update(1 / 120, floorWorld);

  settler.registerFracture(BLOCK.grass, activeCenter, [supportedLower, supportedUpper, unsupportedFloater]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });

  assert(supportedLower.isSleeping, "the terrain-supported clump should sleep");
  assert(supportedUpper.isSleeping, "the glued upper shard should inherit support from its component");
  assert(
    !unsupportedFloater.isSleeping,
    "a side-linked unsupported fragment in the same region should not freeze in midair"
  );
});

test("debris settler does not sleep quiet unsupported clumps in midair", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const activeCenter = new THREE.Vector3(0.64, 3.5, 0.5);
  const left = createTestFragment(BLOCK.grass, 0.5, 3.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.62, 3.5, 0.5);

  left.velocity.set(0.05, 0, 0);
  right.velocity.set(-0.05, 0, 0);
  left.angularVelocity.set(6, 0, 0);
  right.angularVelocity.set(0, 6, 0);

  settler.registerFracture(BLOCK.grass, activeCenter, [left, right]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });

  assert(!left.isSleeping, "unsupported low-motion clumps should keep simulating instead of freezing in midair");
  assert(!right.isSleeping, "support contact is required before the settler can sleep a glued clump");
});

test("debris settler keeps glue links shaping the heap after pair checks stop", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const left = createTestFragment(BLOCK.grass, 0.5, 1.5, 0.5);
  const right = createTestFragment(BLOCK.grass, 0.62, 1.5, 0.5);
  left.velocity.set(-0.4, 0, 0);
  right.velocity.set(0.4, 0, 0);

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.56, 1.5, 0.5), [left, right]);
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
    upper.mesh.position.y - lower.mesh.position.y > BLOCK_FRAGMENT_VISUAL_SIZE * 0.85,
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
  assertClose(afterFinalize.finalizedPieces, BLOCK_RUBBLE_MATERIAL_UNITS, 0.000001, "two Potato shards should expand into full rubble material");
  assertClose(rubble.getStats().pieces, BLOCK_RUBBLE_MATERIAL_UNITS, 0.000001, "rubble field should receive all gameplay material");
  assert(fragments.every((fragment) => fragment.isExpired), "finalized visible fragments should be marked for pruning");
  assert(
    fragments.every((fragment) => settler.owns(fragment)),
    "finalized fragments should stay settler-owned until pruning so orphan fallback cannot absorb them twice"
  );
  settler.forget(fragments[0]);
  assert(!settler.owns(fragments[0]), "normal toy removal should clear the stale finalized-fragment ownership marker");
});

test("debris settler keeps nearby bubble debris active past the old hard cap", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  sleepTestFragment(fragment);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), [fragment]);
  const stats = settler.update(DEBRIS_REGION_MAX_SECONDS + 0.5, rubble, {
    activeCenter: new THREE.Vector3(0.5, 1.1, 0.5),
    activeRadius: 1
  });

  assertEqual(stats.finalizedBatches, 0, "near-player debris should not hard-finalize while inside the active bubble");
  assertEqual(stats.regions, 1, "the settling region should stay owned while nearby");
  assert(!fragment.isExpired, "nearby sleeping debris should remain shoveable by later physics cores");
});

test("debris settler converts far bubble debris into rubble", () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const fragment = createTestFragment(BLOCK.stone, 0.5, 1.1, 0.5, 3);
  sleepTestFragment(fragment);

  settler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 1.1, 0.5), [fragment]);
  const beforeGrace = settler.update(DEBRIS_REGION_FINALIZE_SECONDS - 0.01, rubble, {
    activeCenter: new THREE.Vector3(20, 1.1, 0.5),
    activeRadius: 4
  });
  assertEqual(beforeGrace.finalizedBatches, 0, "far sleeping debris should keep the normal settle grace before baking");

  const stats = settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS + 0.02, rubble, {
    activeCenter: new THREE.Vector3(20, 1.1, 0.5),
    activeRadius: 4
  });

  assertEqual(stats.finalizedBatches, 1, "debris outside the active bubble should bake into rubble");
  assertEqual(rubble.getStats().pieces, 3, "far finalization should preserve fragment material");
  assert(fragment.isExpired, "finalized far debris should be marked for normal toy pruning");
  assertEqual(scene.children.length, 1, "far debris should become one persistent rubble mesh");
});

test("debris settler VFX mode expires far debris without rubble conversion", () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const fragment = createTestFragment(BLOCK.stone, 0.5, 1.1, 0.5, 3);
  sleepTestFragment(fragment);

  settler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 1.1, 0.5), [fragment]);
  const beforeGrace = settler.update(DEBRIS_REGION_FINALIZE_SECONDS - 0.01, rubble, {
    activeCenter: new THREE.Vector3(20, 1.1, 0.5),
    activeRadius: 4,
    finalizationMode: "vfx"
  });
  assertEqual(beforeGrace.finalizedBatches, 0, "VFX debris should keep the normal visible grace before cleanup");
  assert(!fragment.isExpired, "far VFX debris should not expire before the settle grace");

  const stats = settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS + 0.02, rubble, {
    activeCenter: new THREE.Vector3(20, 1.1, 0.5),
    activeRadius: 4,
    finalizationMode: "vfx"
  });

  assertEqual(stats.finalizedBatches, 0, "VFX cleanup should not report rubble finalization batches");
  assertEqual(rubble.getStats().pieces, 0, "VFX cleanup should not create gameplay rubble material");
  assertEqual(scene.children.length, 0, "VFX cleanup should not leave a persistent rubble mesh");
  assert(fragment.isExpired, "far VFX debris should be marked for normal pruning");
});

test("debris settler bakes far sleeping rigid debris without losing material", async () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    5
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };
  let finalized = false;

  rigidDebris.registerFragment(fragment);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 2.5, 0.5), [fragment]);
  for (let frame = 0; frame < 420 && !finalized; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
    const stats = settler.update(1 / 60, rubble, {
      activeCenter: new THREE.Vector3(20, 2.5, 0.5),
      activeRadius: 4
    });
    finalized = stats.finalizedBatches > 0;
  }

  assert(finalized, "sleeping rigid debris outside the bubble should bake into rubble");
  assert(fragment.isExpired, "baked rigid debris should be marked for normal toy pruning");
  assertEqual(rubble.getStats().pieces, 5, "rigid bake-out should preserve carried material units");
  rigidDebris.clear();
});

test("debris settler keeps nearby sleeping rigid debris wakeable", async () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0.5, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    4
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };
  let finalized = false;

  rigidDebris.registerFragment(fragment);
  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.5, 2.5, 0.5), [fragment]);
  for (let frame = 0; frame < 420 && !finalized; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
    const stats = settler.update(1 / 60, rubble, {
      activeCenter: new THREE.Vector3(0.5, 2.5, 0.5),
      activeRadius: 8
    });
    finalized = stats.finalizedBatches > 0;
  }

  assert(!finalized, "nearby sleeping rigid debris should not bake just because it settled");
  assert(fragment.isSleeping, "nearby rigid debris should still be aggressively parked by Rapier sleep");
  assert(!fragment.isExpired, "settled nearby rigid debris should remain wakeable instead of becoming rubble");
  assert(settler.owns(fragment), "the settling region should keep ownership while debris is inside the bubble");
  assertEqual(rigidDebris.getStats().bodies, 1, "the rigid body should remain registered for later wakeup");
  assertEqual(rubble.getStats().pieces, 0, "active-bubble sleep should not create destructible rubble material");
  rigidDebris.clear();
});

test("debris settler keeps far airborne bubble debris alive until it settles", () => {
  const scene = new THREE.Scene();
  const settler = new DebrisSettler();
  const rubble = new RubbleField(scene);
  const fragment = createTestFragment(BLOCK.stone, 0.5, 2.1, 0.5, 3);
  fragment.velocity.set(2, 1, 0);

  settler.registerFracture(BLOCK.stone, new THREE.Vector3(0.5, 2.1, 0.5), [fragment]);
  const stats = settler.update(DEBRIS_REGION_FINALIZE_SECONDS + 0.5, rubble, {
    activeCenter: new THREE.Vector3(20, 2.1, 0.5),
    activeRadius: 4
  });

  assertEqual(stats.finalizedBatches, 0, "outside-bubble debris should not bake while still airborne");
  assert(settler.owns(fragment), "airborne debris should remain owned by its settling region");
  assert(!fragment.isExpired, "airborne debris should not disappear mid-flight");
  assertEqual(rubble.getStats().pieces, 0, "airborne debris should not create static rubble chunks yet");
});

test("debris settler pressure relief finalizes farthest regions first", () => {
  const settler = new DebrisSettler();
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  const nearFragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  const farFragment = createTestFragment(BLOCK.stone, 30.5, 1.1, 0.5);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), [nearFragment]);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(30.5, 1.1, 0.5), [farFragment]);

  const removed = settler.finalizeRegionsForPressure(rubble, new THREE.Vector3(0.5, 1.1, 0.5), 1);
  const stats = settler.getStats();

  assertEqual(removed, 1, "pressure relief should report the bodies it converted");
  assertEqual(stats.regions, 1, "one nearby region should remain active after farthest-region relief");
  assert(settler.owns(nearFragment), "near debris should be preserved when a farther region can relieve pressure");
  assert(farFragment.isExpired, "the farthest debris region should be the one converted");
  assertClose(
    rubble.getStats().pieces,
    TEST_FRAGMENT_MATERIAL_UNITS,
    0.000001,
    "pressure relief should preserve the far region's material"
  );
  assertEqual(rubble.getStats().visualChunks, 1, "pressure relief should keep a static shard pose instead of making invisible support-only rubble");
});

test("debris settler pressure discard expires farthest regions without rubble", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const nearFragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  const farFragment = createTestFragment(BLOCK.stone, 30.5, 1.1, 0.5);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), [nearFragment]);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(30.5, 1.1, 0.5), [farFragment]);

  const removed = settler.discardRegionsForPressure(new THREE.Vector3(0.5, 1.1, 0.5), 1);
  const stats = settler.getStats();

  assertEqual(removed, 1, "VFX pressure relief should report the debris bodies it expired");
  assertEqual(stats.finalizedBatches, 0, "VFX pressure relief should not emit rubble batches");
  assertEqual(rubble.getStats().pieces, 0, "VFX pressure relief should not deposit material into rubble");
  assert(settler.owns(nearFragment), "near debris should be preserved when a farther region can relieve pressure");
  assert(farFragment.isExpired, "the farthest debris region should be expired for pruning");
});

test("debris settler pressure relief prefers sleeping regions before awake debris", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const nearSleepingFragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  const farAwakeFragment = createTestFragment(BLOCK.stone, 30.5, 1.1, 0.5);
  sleepTestFragment(nearSleepingFragment);
  farAwakeFragment.velocity.set(2, 0, 0);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), [nearSleepingFragment]);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(30.5, 1.1, 0.5), [farAwakeFragment]);

  const removed = settler.finalizeRegionsForPressure(rubble, new THREE.Vector3(0.5, 1.1, 0.5), 1);

  assertEqual(removed, 1, "pressure relief should convert one sleeping region when that is enough");
  assert(nearSleepingFragment.isExpired, "sleeping debris should be the first pressure-relief candidate");
  assert(settler.owns(farAwakeFragment), "awake debris should stay active while sleeping material can relieve pressure");
  assertClose(
    rubble.getStats().pieces,
    TEST_FRAGMENT_MATERIAL_UNITS,
    0.000001,
    "sleeping pressure relief should still preserve material"
  );
});

test("debris settler settled discard removes ground debris without making instant rubble", () => {
  const settler = new DebrisSettler();
  const rubble = new RubbleField(new THREE.Scene());
  const nearFragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  const farFragment = createTestFragment(BLOCK.stone, 30.5, 1.1, 0.5);
  sleepTestFragment(farFragment);

  settler.registerFracture(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), [nearFragment]);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(30.5, 1.1, 0.5), [farFragment]);

  const removed = settler.discardSettledRegionsForPressure(new THREE.Vector3(0.5, 1.1, 0.5), 1);
  const stats = settler.getStats();

  assertEqual(removed, 1, "visual debris budget relief should report the discarded body count");
  assertEqual(stats.regions, 1, "discarding for debris budget should preserve the nearby region");
  assert(settler.owns(nearFragment), "near debris should remain active when farther debris can be discarded");
  assert(settler.owns(farFragment), "discarded fragments should stay owned until normal pruning avoids orphan absorption");
  assert(farFragment.isExpired, "the farthest debris region should be expired for pruning");
  assertEqual(rubble.getStats().pieces, 0, "debris budget discard should not create ground lumps");
  assertEqual(rubble.getStats().visualChunks, 0, "debris budget discard should not freeze airborne visual chunks");
});

test("debris settler settled discard ignores airborne debris", () => {
  const settler = new DebrisSettler();
  const fragment = createTestFragment(BLOCK.stone, 30.5, 3.1, 0.5);
  fragment.velocity.set(0, 2, 0);
  settler.registerFracture(BLOCK.stone, new THREE.Vector3(30.5, 3.1, 0.5), [fragment]);

  const removed = settler.discardSettledRegionsForPressure(new THREE.Vector3(0.5, 1.1, 0.5), 1);

  assertEqual(removed, 0, "ground-debris pressure should not erase shards while they are still flying");
  assert(settler.owns(fragment), "airborne debris should remain in its active settling region");
  assert(!fragment.isExpired, "airborne debris should not be expired by the settled-only cap");
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

test("debris settler throttles old local contacts when pair pressure exceeds the cap", () => {
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

  const stats = settler.update(DEBRIS_REGION_CONTACT_BREAKUP_SECONDS + 0.01, rubble);
  assertEqual(DEBRIS_REGION_PAIR_BUDGET, 768, "test should track the intended debris pair budget");
  assertEqual(stats.forcedFinalizations, 0, "pair pressure should not bake airborne debris into static rubble");
  assertEqual(stats.regions, 2, "both regions should stay alive after local contact throttling");
  assertEqual(rubble.getStats().pieces, 0, "pair-pressure throttling should not create mid-flight rubble");
  assert(oldestFragments.every((fragment) => !fragment.isExpired), "oldest debris should keep flying instead of despawning");

  const nextFrame = settler.update(0.01, rubble);
  assert(
    nextFrame.pairChecks <= DEBRIS_REGION_PAIR_BUDGET,
    "pair-pressure throttling should keep the remaining debris-debris work under the hard cap"
  );
  assertEqual(
    nextFrame.forcedFinalizations,
    0,
    "continued pair-pressure throttling should not bake live debris into static rubble"
  );
  assertEqual(rubble.getStats().pieces, 0, "continued contact throttling should still avoid mid-flight rubble");
});

test("batched rubble absorption preserves material and scales health", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  rubble.absorbBatch([
    { block: BLOCK.stone, position: new THREE.Vector3(0.25, 1.1, 0.25), pieces: 0.6 },
    { block: BLOCK.stone, position: new THREE.Vector3(0.75, 1.1, 0.75), pieces: 0.5 }
  ]);
  rubble.settle(world);

  const stats = rubble.getStats();
  assertClose(stats.pieces, 1.1, 0.000001, "batched rubble should preserve material volume totals");
  assertNearlyEqual(
    stats.health,
    expectedRubbleHealthForPieces(1.1),
    "batched rubble health should scale separately from material totals"
  );
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
  firstFragment.sleepInPlace();
  secondFragment.sleepInPlace();

  assert(rubble.absorbFragment(firstFragment), "settled debris should be eligible for rubble absorption");
  assert(rubble.absorbFragment(secondFragment), "nearby debris of the same block should merge into one pile");
  assertEqual(scene.children.length, 1, "merged rubble should render as one cheap cover proxy");
  const rubbleStats = rubble.getStats();
  assertEqual(rubbleStats.clusters, 1, "absorbed fragments should merge into one cluster");
  assertClose(
    rubbleStats.pieces,
    TEST_FRAGMENT_MATERIAL_UNITS * 2,
    0.000001,
    "absorbed fragments should count their carried material volume"
  );
  assertEqual(rubbleStats.visualChunks, 2, "absorbed fragments should leave baked visual chunks for the hybrid pile");
  assertNearlyEqual(
    rubbleStats.health,
    expectedRubbleHealthForPieces(TEST_FRAGMENT_MATERIAL_UNITS * 2),
    "absorbed fragments should add scaled destructible cover health"
  );
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

test("hybrid rubble meshes render baked chunks while keeping cheap support", () => {
  const smoothScene = new THREE.Scene();
  const smoothRubble = new RubbleField(smoothScene);
  smoothRubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5), 1);
  smoothRubble.getStats();
  const smoothMesh = smoothScene.children[0];
  assert(smoothMesh instanceof THREE.Mesh, "setup should keep a support-only rubble mesh object");
  const smoothVertexCount = smoothMesh.geometry.getAttribute("position").count;
  assertEqual(smoothVertexCount, 0, "support-only rubble should not render the parked draped sheet");

  const hybridScene = new THREE.Scene();
  const hybridRubble = new RubbleField(hybridScene);
  const shardShape = createDebrisShape("wedge");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(0.5, 0.2, 0.5),
    new THREE.Vector3(0, 0, 0),
    1,
    shardShape
  );
  fragment.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 5);
  fragment.sleepInPlace();

  assert(hybridRubble.absorbFragment(fragment), "a visual fragment should be absorbable into hybrid rubble");
  const hybridStats = hybridRubble.getStats();
  const hybridMesh = hybridScene.children[0];
  assert(hybridMesh instanceof THREE.Mesh, "hybrid rubble should still render as one mesh");
  const hybridVertexCount = hybridMesh.geometry.getAttribute("position").count;
  const chunkNormals = hybridMesh.geometry.getAttribute("normal");
  const chunkPositions = hybridMesh.geometry.getAttribute("position");

  assertEqual(hybridStats.visualChunks, 1, "hybrid rubble should store a capped static chunk sample");
  assertEqual(
    hybridVertexCount,
    getDebrisShapeGeometry(shardShape.shapeId).getAttribute("position").count,
    "hybrid rubble should preserve the baked shard shape instead of reverting to a cube"
  );
  for (let index = 0; index < hybridVertexCount; index += 1) {
    const outward = new THREE.Vector3(
      chunkPositions.getX(index) - fragment.mesh.position.x,
      chunkPositions.getY(index) - fragment.mesh.position.y,
      chunkPositions.getZ(index) - fragment.mesh.position.z
    );
    const normal = new THREE.Vector3(
      chunkNormals.getX(index),
      chunkNormals.getY(index),
      chunkNormals.getZ(index)
    );

    assert(
      outward.dot(normal) > 0,
      "baked rubble chunk faces should be wound outward so the renderer does not cull the exterior"
    );
  }
  assert(
    hybridRubble.getSupportHeight({
      minX: 0.4,
      maxX: 0.6,
      minY: 0,
      maxY: 1.5,
      minZ: 0.4,
      maxZ: 0.6
    }) !== null,
    "hybrid visual chunks should not replace the cheap walkable support surface"
  );

  hybridRubble.clear();
  assertEqual(hybridRubble.getStats().visualChunks, 0, "full rubble cleanup should clear baked visual chunk data");
  assertEqual(hybridScene.children.length, 0, "full rubble cleanup should remove hybrid rubble meshes");
});

test("forced rubble absorption keeps awake shard visuals for budget relief", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);
  const shardShape = createDebrisShape("narrow-shard");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 0.45, 0.5),
    new THREE.Vector3(1.5, 0.2, 0),
    1,
    shardShape
  );

  assert(rubble.absorbFragment(fragment, { forceVisualChunk: true }), "budget relief should be able to bake an awake fragment");
  const stats = rubble.getStats();
  const mesh = scene.children[0];
  assert(mesh instanceof THREE.Mesh, "forced budget rubble should still render through the rubble mesh");
  assertEqual(stats.visualChunks, 1, "forced budget bake-out should preserve the visible shard pose");
  const positionAttribute = mesh.geometry.getAttribute("position");
  assert(positionAttribute.count > 0, "forced budget bake-out should not disappear now that the draped sheet is disabled");
  const bounds = new THREE.Box3().setFromBufferAttribute(positionAttribute);
  const boundsSize = new THREE.Vector3();
  bounds.getSize(boundsSize);
  assert(
    boundsSize.length() > BLOCK_FRAGMENT_VISUAL_SIZE * 0.5,
    "forced budget bake-out should create a sane visible shard bound"
  );
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
  assertDeepEqual(hit.cell, { x: 1, y: 0, z: 0 }, "rubble raycasts should report the targeted cube cell");
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
  assertNearlyEqual(
    rubbleStats.health,
    RUBBLE_FULL_BLOCK_HEALTH,
    "rubble health should follow full-block durability instead of visible shard count"
  );
  assertEqual(scene.children.length, 1, "weighted rubble should still render as one merged proxy");
});

test("rubble damage removes the impacted pile and only chips immediate neighbors", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5), 0.25);
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(1.5, 0.2, 0.5), 1.5);
  assertEqual(rubble.getStats().clusters, 1, "adjacent setup should merge into one broad rubble patch");

  assert(
    rubble.damageNearest(new THREE.Vector3(0.5, 0.1, 0.5), 1, 0.5),
    "nearby damage should find the directly targeted low-health pile"
  );
  const damageEvents = rubble.consumeDamageEvents();

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
  assert(neighborCellHit, "the healthier neighboring pile should survive sharing a cluster");
  assertClose(
    rubble.getStats().pieces,
    1.5 - (0.25 / RUBBLE_FULL_BLOCK_HEALTH),
    0.000001,
    "the neighboring pile should only lose a small collateral chip"
  );
  assertEqual(damageEvents.length, 2, "destroying one pile should emit direct and collateral damage events");
  assertEqual(damageEvents[0]?.destroyed, true, "the first event should describe the direct destroyed pile");
  assertEqual(damageEvents[0]?.collateral, false, "the direct hit should not be marked as collateral");
  assertEqual(damageEvents[1]?.collateral, true, "neighboring chip damage should be marked as collateral");
  assertNearlyEqual(
    damageEvents[1]?.remainingHealth,
    expectedRubbleHealthForPieces(1.5) - 0.25,
    "collateral damage should chip neighboring rubble instead of deleting it"
  );
  assertEqual(
    rubble.consumeDamageEvents().length,
    0,
    "damage events should be consumed once so the HUD does not replay stale bars"
  );
});

test("single-piece rubble stays in a local footprint instead of filling the whole cell", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 0.2, 0.5), TEST_FRAGMENT_MATERIAL_UNITS);

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
      new THREE.Vector3(0.48 + index * 0.01, 0.18, 0.52),
      TEST_FRAGMENT_MATERIAL_UNITS
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

test("terrain impacts resolve before adjacent rubble can take same-frame damage", () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld({ seed: "terrain-rubble-impact-priority-test" });
  const rubble = new RubbleField(scene);
  const impacts: PhysicsImpact[] = [];
  const targetY = 34;

  world.setBlock(0, targetY, 0, BLOCK.stone);
  world.setBlock(1, targetY - 1, 0, BLOCK.stone);
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(1.12, targetY + 0.16, 0.5), 1.5);
  rubble.settle(world);

  const rubbleHealthBefore = rubble.getStats().health;
  const core = new PhysicsToy(
    new THREE.Vector3(1.2, targetY + 0.2, 0.5),
    new THREE.Vector3(-6, 0, 0)
  );
  const terrainAndRubbleCollisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return world.isSolid(x, y, z);
    },
    getSupportHeight(bounds: CollisionBounds): number | null {
      return rubble.getSupportHeight(bounds);
    }
  };

  const terrainImpactStartIndex = impacts.length;
  core.update(1 / 60, terrainAndRubbleCollisionWorld, impacts);
  const terrainImpactsForCore = impacts.slice(terrainImpactStartIndex).filter((impact) => impact.source === core);
  assert(
    terrainImpactsForCore.length >= 1,
    "the core should report terrain hits before rubble is considered"
  );

  for (const impact of terrainImpactsForCore) {
    const result = world.damageBlock(
      impact.block.x,
      impact.block.y,
      impact.block.z,
      PHYSICS_CORE_BLOCK_DAMAGE
    );
    if (result?.destroyed) core.expire();
  }
  if (!core.isExpired) rubble.resolveCoreCollision(core);

  assert(core.isExpired, "the terrain destruction should consume the core");
  assertEqual(world.getBlock(0, targetY, 0), BLOCK.air, "the directly impacted terrain block should be destroyed");
  assertEqual(
    rubble.getStats().health,
    rubbleHealthBefore,
    "adjacent rubble should survive when the core already spent its hit on terrain"
  );
});

test("supported rubble survives manual removal of adjacent terrain", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);
  world.setBlock(1, 1, 0, BLOCK.stone);

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), 1.5);
  rubble.settle(world);
  const healthBefore = rubble.getStats().health;

  world.setBlock(1, 1, 0, BLOCK.air);
  rubble.settle(world);

  assertEqual(
    rubble.getStats().health,
    healthBefore,
    "removing a same-height neighboring block should not delete a pile with terrain under it"
  );
  assert(
    rubble.raycast(new THREE.Vector3(0.5, 1.08, -2), new THREE.Vector3(0, 0, 1), 6),
    "the supported pile should still have a visible/collidable cover proxy"
  );
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
      new THREE.Vector3(0.42 + column * 0.05, 1.1, 0.42 + row * 0.06),
      BLOCK_RUBBLE_MATERIAL_UNITS / 12
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

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), 1.5);
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

  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 1.1, 0.5), 0.5);
  rubble.absorb(BLOCK.dirt, new THREE.Vector3(0.5, 2.1, 0.5), 0.5);

  assertEqual(rubble.getStats().clusters, 2, "setup should start with stacked rubble piles");
  rubble.settle(world);

  assertEqual(rubble.getStats().clusters, 1, "unsupported upper pile should merge into the pile below");
  assertEqual(rubble.getStats().pieces, 1, "merged rubble should keep the total material volume");
  assertEqual(scene.children.length, 1, "merged rubble should render as one cover proxy");
  assertEqual(world.getBlock(0, 1, 0), BLOCK.air, "small merged piles should stay as proxies, not terrain");
});

test("one full block worth of rubble stays as cover instead of refilling terrain", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);
  world.setBlock(0, 0, 0, BLOCK.stone);

  assert(
    RUBBLE_BLOCK_PROMOTION_PIECES > BLOCK_RUBBLE_MATERIAL_UNITS,
    "rubble promotion should require more than one full block of material"
  );

  rubble.absorb(BLOCK.stone, new THREE.Vector3(0.5, 1.1, 0.5), BLOCK_RUBBLE_MATERIAL_UNITS);

  rubble.settle(world);

  assertEqual(world.getBlock(0, 1, 0), BLOCK.air, "one destroyed block should leave an open space");
  assertEqual(rubble.getStats().clusters, 1, "sub-threshold rubble should remain as a cover proxy");
  assertEqual(rubble.getStats().pieces, BLOCK_RUBBLE_MATERIAL_UNITS, "the proxy should keep the full block material");
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
  assertEqual(fastImpacts[0].radius, fastToy.radius, "impact payloads should carry the core footprint radius");
  assertDeepEqual(
    fastImpacts[0].incomingVelocity.toArray(),
    [BLOCK_DAMAGE_IMPACT_SPEED + 0.5, 0, 0],
    "impact payloads should preserve incoming velocity before terrain bounce"
  );
});

test("fast small physics cores hit the first block along their swept path", () => {
  const collisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return y === 0 && z === 0 && (x === 1 || x === 2);
    }
  };
  const fastSmallCore = new PhysicsToy(
    new THREE.Vector3(0.2, 0.5, 0.5),
    new THREE.Vector3(123, 0, 0),
    { radius: 0.105 }
  );

  const impacts = fastSmallCore.update(1 / 60, collisionWorld);

  assertEqual(impacts.length, 1, "swept core contact should report one front-block impact");
  assertDeepEqual(
    impacts[0].block,
    { x: 1, y: 0, z: 0 },
    "tiny fast cores should not tunnel through the front block and hit the one behind it"
  );
  assert(
    fastSmallCore.mesh.position.x < 1,
    "swept core contact should leave the core in front of the impacted block"
  );
});

test("physics core trajectory preview predicts the first swept terrain hit", () => {
  const wallWorld: CollisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return x === 4 && z === 0 && y >= 0 && y <= 3;
    }
  };

  const prediction = predictPhysicsCoreTrajectory(wallWorld, {
    origin: new THREE.Vector3(0.5, 2.5, 0.5),
    velocity: new THREE.Vector3(18, 0, 0),
    radius: 0.1,
    maxSeconds: 1
  });

  assert(prediction.impact, "trajectory preview should report the first terrain impact");
  assertEqual(prediction.impact.block.x, 4, "preview should hit the same front wall block column as the projectile sweep");
  assert(prediction.points.length > 2, "preview should keep enough points to draw a readable dotted arc");
  assert(
    prediction.impact.speed > BLOCK_DAMAGE_IMPACT_SPEED,
    "previewed impact speed should be usable for the damage lattice overlay"
  );
});

test("small fast physics cores pass through existing visual holes in partial blocks", () => {
  const world = new VoxelWorld({ seed: "small-core-existing-hole-test" });
  const tinyFastSettings = {
    sizePercent: PHYSICS_CORE_SIZE_MIN_PERCENT,
    velocityPercent: PHYSICS_CORE_VELOCITY_MAX_PERCENT
  };
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: getPhysicsCoreRadius(tinyFastSettings),
    speed: PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings),
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const core = new PhysicsToy(
    new THREE.Vector3(1.6, 3.5, 4.5),
    new THREE.Vector3(
      PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings),
      0,
      0
    ),
    { radius: getPhysicsCoreRadius(tinyFastSettings) }
  );
  const impacts = core.update(1 / 20, world);

  assertEqual(impacts.length, 1, "the open visual tunnel should not consume the next core impact");
  assertDeepEqual(
    impacts[0].block,
    { x: 3, y: 3, z: 4 },
    "the next core should hit the visible block behind the already-open bite tunnel"
  );
});

test("small fast physics cores still hit remaining partial-block material", () => {
  const world = new VoxelWorld({ seed: "small-core-partial-material-test" });
  const tinyFastSettings = {
    sizePercent: PHYSICS_CORE_SIZE_MIN_PERCENT,
    velocityPercent: PHYSICS_CORE_VELOCITY_MAX_PERCENT
  };
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: getPhysicsCoreRadius(tinyFastSettings),
    speed: PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings),
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const core = new PhysicsToy(
    new THREE.Vector3(1.6, 3.84, 4.84),
    new THREE.Vector3(
      PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings),
      0,
      0
    ),
    { radius: getPhysicsCoreRadius(tinyFastSettings) }
  );
  const impacts = core.update(1 / 20, world);

  assertEqual(impacts.length, 1, "remaining visual material should still collide with tiny cores");
  assertDeepEqual(
    impacts[0].block,
    { x: 2, y: 3, z: 4 },
    "partial terrain should only open the removed tunnel, not the whole voxel"
  );
});

test("small fast physics cores hit visible partial-block material from inside the old cube shell", () => {
  const world = new VoxelWorld({ seed: "small-core-partial-shell-start-test" });
  const tinyFastSettings = {
    sizePercent: PHYSICS_CORE_SIZE_MIN_PERCENT,
    velocityPercent: PHYSICS_CORE_VELOCITY_MAX_PERCENT
  };
  const coreRadius = getPhysicsCoreRadius(tinyFastSettings);
  const coreSpeed = PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings);
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius,
    speed: coreSpeed,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const core = new PhysicsToy(
    // This starts inside the damaged voxel's old expanded whole-cube shell,
    // but it is visibly aligned with a remaining upper-corner bite cell.
    new THREE.Vector3(2 - coreRadius * 0.5, 3.84, 4.84),
    new THREE.Vector3(coreSpeed, 0, 0),
    { radius: coreRadius }
  );
  const impacts = core.update(1 / 20, world);

  assertEqual(impacts.length, 1, "visible partial-block material should still consume the core impact");
  assertDeepEqual(
    impacts[0].block,
    { x: 2, y: 3, z: 4 },
    "starting inside the old full-cube shell should not skip the visible bite piece and hit the block behind it"
  );
});

test("hitscan cores pass through existing visual holes in partial blocks", () => {
  const world = new VoxelWorld({ seed: "hitscan-existing-hole-test" });
  world.setBlock(1, 3, 4, BLOCK.air);
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: HITSCAN_CORE_RADIUS,
    speed: HITSCAN_CORE_IMPACT_SPEED,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const hit = raycastHitscanCore(
    world,
    new THREE.Vector3(1.6, 3.5, 4.5),
    new THREE.Vector3(1, 0, 0)
  );

  assert(hit, "hitscan setup should find a terrain target behind the opened tunnel");
  assertDeepEqual(
    hit.block,
    { x: 3, y: 3, z: 4 },
    "hitscan cores should use the bite-lattice projectile query instead of the chipped block's full cube"
  );
});

test("hitscan cores still hit remaining partial-block material", () => {
  const world = new VoxelWorld({ seed: "hitscan-partial-material-test" });
  world.setBlock(1, 3, 4, BLOCK.air);
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    coreRadius: HITSCAN_CORE_RADIUS,
    speed: HITSCAN_CORE_IMPACT_SPEED,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const hit = raycastHitscanCore(
    world,
    new THREE.Vector3(1.6, 3.84, 4.84),
    new THREE.Vector3(1, 0, 0)
  );

  assert(hit, "hitscan setup should still find terrain when the ray crosses remaining bite material");
  assertDeepEqual(
    hit.block,
    { x: 2, y: 3, z: 4 },
    "hitscan cores should only pass through removed bite cells, not every chipped voxel"
  );
});

test("hitscan bolt tracer lifetime stays quick but readable", () => {
  assertNearlyEqual(
    getHitscanBoltLifetimeSeconds(),
    0.14,
    "hitscan beams should linger long enough to read without feeling like projectiles"
  );
});

test("small fast physics cores can pierce a block and damage one behind an air gap", () => {
  const world = new VoxelWorld({ seed: "small-core-pierce-runtime-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.air);
  world.setBlock(4, 3, 4, BLOCK.stone);
  world.setBlock(5, 3, 4, BLOCK.air);
  const tinyFastSettings = {
    sizePercent: PHYSICS_CORE_SIZE_MIN_PERCENT,
    velocityPercent: PHYSICS_CORE_VELOCITY_MAX_PERCENT
  };
  const core = new PhysicsToy(
    new THREE.Vector3(1.6, 3.34, 4.34),
    new THREE.Vector3(
      PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(tinyFastSettings),
      0,
      0
    ),
    { radius: getPhysicsCoreRadius(tinyFastSettings) }
  );
  const damagedThisFrame = new Set<string>();

  for (let frame = 0; frame < 10 && world.getBlockDamage(4, 3, 4) === 0; frame += 1) {
    damagedThisFrame.clear();
    const impacts = core.update(1 / 30, world);
    const continuedSources = new Set<PhysicsToy>();

    for (const impact of impacts) {
      if (continuedSources.has(impact.source)) continue;
      const key = world.damageKey(impact.block.x, impact.block.y, impact.block.z);
      if (damagedThisFrame.has(key)) continue;
      damagedThisFrame.add(key);
      const result = world.carveBlock({
        x: impact.block.x,
        y: impact.block.y,
        z: impact.block.z,
        point: impact.position,
        normal: impact.normal,
        incomingDirection: impact.incomingVelocity,
        coreRadius: impact.radius,
        speed: impact.speed,
        amount: PARTIAL_BLOCK_CORE_DAMAGE
      });
      if (result?.pierceContinuation) {
        core.continueAfterPierce(
          new THREE.Vector3(
            result.pierceContinuation.position.x,
            result.pierceContinuation.position.y,
            result.pierceContinuation.position.z
          ),
          new THREE.Vector3(
            result.pierceContinuation.velocity.x,
            result.pierceContinuation.velocity.y,
            result.pierceContinuation.velocity.z
          )
        );
        continuedSources.add(impact.source);
      } else if (result) {
        core.expire();
      }
    }
  }

  assertEqual(world.getBlockDamage(2, 3, 4), 1, "front block should take the first piercing chip");
  assertEqual(world.getBlockDamage(4, 3, 4), 1, "back block should be hit after the core crosses the air gap");
  assert(!core.isExpired, "a successfully piercing core should not be expired by the first terrain hit");
  assert(core.velocity.x > 0, "a successfully piercing core should keep forward velocity");
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
    new THREE.Vector3(0.4, 2, 0),
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
  assertEqual(formatBlockFragmentCount(0), "1 shard", "debris count label should show the clamped shard count");
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
  assertEqual(
    getRigidDebrisBodyBudget(QUALITY_PRESETS.potato.physicsObjectBudget),
    48,
    "Potato should allow only a small Rapier debris slice"
  );
  assertEqual(
    getRigidDebrisBodyBudget(QUALITY_PRESETS.normal.physicsObjectBudget),
    144,
    "Normal should keep rigid debris below the total physics toy budget"
  );
  assertEqual(
    getRigidDebrisBodyBudget(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].physicsObjectBudget),
    MAX_RIGID_DEBRIS_BODY_BUDGET,
    "Super Ultra should hard-cap CPU-heavy rigid debris bodies"
  );
  assertEqual(
    getRigidDebrisBodyBudget(Number.NaN),
    MIN_RIGID_DEBRIS_BODY_BUDGET,
    "invalid rigid debris budgets should fall back to the minimum safety rail"
  );
  assertEqual(
    normalizeGroundDebrisBudget(null),
    DEFAULT_GROUND_DEBRIS_BUDGET,
    "missing ground debris setting should use the practical default cap"
  );
  assertEqual(
    normalizeGroundDebrisBudget(MIN_GROUND_DEBRIS_BUDGET - GROUND_DEBRIS_BUDGET_STEP),
    MIN_GROUND_DEBRIS_BUDGET,
    "ground debris setting should allow fully disabling persistent active debris"
  );
  assertEqual(
    normalizeGroundDebrisBudget(MAX_GROUND_DEBRIS_BUDGET + GROUND_DEBRIS_BUDGET_STEP),
    MAX_GROUND_DEBRIS_BUDGET,
    "ground debris setting should clamp to the rigid-body safety cap"
  );
  assertEqual(
    getEffectiveRigidDebrisBodyBudget(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].physicsObjectBudget, 96),
    96,
    "ground debris slider should cap even a high physics object budget"
  );
  assertEqual(
    formatGroundDebrisBudget(0),
    "0 shards",
    "ground debris label should keep the disabled state readable"
  );
  assertEqual(
    formatGroundDebrisBudget(16),
    "16 shards",
    "ground debris label should stay terse for normal slider values"
  );
  assertEqual(
    normalizeGroundDebrisLifetime(null),
    DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS,
    "missing ground debris lifetime should use the readable default"
  );
  assertEqual(
    normalizeGroundDebrisLifetime(MAX_GROUND_DEBRIS_LIFETIME_SECONDS + 10),
    MAX_GROUND_DEBRIS_LIFETIME_SECONDS,
    "ground debris lifetime should clamp to the safety upper bound"
  );
  assertEqual(
    normalizeGroundDebrisLifetime(FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS),
    FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS,
    "ground debris lifetime should keep zero as the forever setting"
  );
  assertEqual(
    getEffectiveGroundDebrisLifetimeSeconds(FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS),
    null,
    "forever lifetime should disable timer cleanup"
  );
  assertEqual(
    formatGroundDebrisLifetime(0),
    "Forever",
    "ground debris lifetime label should make the zero setting obvious"
  );
  assertEqual(
    formatGroundDebrisLifetime(12),
    "12s",
    "ground debris lifetime label should stay compact for timed cleanup"
  );
});

test("physics core settings clamp slider values", () => {
  assertEqual(PHYSICS_CORE_SIZE_MIN_PERCENT, 10, "smallest projectile core setting should support bullet-scale shots");
  assertEqual(PHYSICS_CORE_VELOCITY_MAX_PERCENT, 500, "fastest projectile core setting should support bullet-scale shots");
  assertNearlyEqual(
    HITSCAN_CORE_RADIUS,
    PHYSICS_CORE_BASE_RADIUS * 0.1,
    "hitscan cores should use the smallest core footprint"
  );
  assertEqual(
    HITSCAN_CORE_IMPACT_SPEED,
    PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * 5,
    "hitscan cores should use the highest core impact speed"
  );
  assertDeepEqual(
    DEFAULT_PHYSICS_CORE_SETTINGS,
    {
      sizePercent: PHYSICS_CORE_DEFAULT_SIZE_PERCENT,
      velocityPercent: PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT
    },
    "default core tuning should expose the smaller faster first-pass feel"
  );

  const tinyFastCore = normalizePhysicsCoreSettings({
    sizePercent: -40,
    velocityPercent: 999
  });
  assertEqual(
    tinyFastCore.sizePercent,
    PHYSICS_CORE_SIZE_MIN_PERCENT,
    "core size slider should clamp to the smallest safe percentage"
  );
  assertEqual(
    tinyFastCore.velocityPercent,
    PHYSICS_CORE_VELOCITY_MAX_PERCENT,
    "core velocity slider should clamp to the fastest safe percentage"
  );

  const largeSlowCore = normalizePhysicsCoreSettings({
    sizePercent: 999,
    velocityPercent: -40
  });
  assertEqual(
    largeSlowCore.sizePercent,
    PHYSICS_CORE_SIZE_MAX_PERCENT,
    "core size slider should clamp to the largest safe percentage"
  );
  assertEqual(
    largeSlowCore.velocityPercent,
    PHYSICS_CORE_VELOCITY_MIN_PERCENT,
    "core velocity slider should clamp to the slowest safe percentage"
  );
  assertNearlyEqual(
    getPhysicsCoreRadius(DEFAULT_PHYSICS_CORE_SETTINGS),
    PHYSICS_CORE_BASE_RADIUS * (PHYSICS_CORE_DEFAULT_SIZE_PERCENT / 100),
    0.000001,
    "core size percent should scale the thrown core radius"
  );
  assertNearlyEqual(
    getPhysicsCoreVelocityMultiplier(DEFAULT_PHYSICS_CORE_SETTINGS),
    PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT / 100,
    0.000001,
    "core velocity percent should become a launch multiplier"
  );
  assertEqual(formatPhysicsCorePercent(140), "140%", "core slider labels should be terse percentages");
});

test("player physics core launch inherits player velocity", () => {
  const inheritedVelocity = new THREE.Vector3(3, -2, 5);
  const launchVelocity = createPlayerPhysicsCoreLaunchVelocity(
    new THREE.Vector3(0, 0, -2),
    inheritedVelocity,
    DEFAULT_PHYSICS_CORE_SETTINGS
  );

  assertVectorNearlyEqual(
    launchVelocity,
    new THREE.Vector3(
      inheritedVelocity.x,
      inheritedVelocity.y,
      inheritedVelocity.z -
        PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED *
        getPhysicsCoreVelocityMultiplier(DEFAULT_PHYSICS_CORE_SETTINGS)
    ),
    "player-thrown cores should add muzzle velocity on top of player base velocity"
  );
});

test("player core muzzle offset supports hip-fire and reticle ADS origins", () => {
  const localOffset = createPlayerCoreMuzzleLocalOffset(90, 2);
  assert(
    localOffset.x > 0 && localOffset.y < 0,
    "hip-fire muzzle should sit to the right and below the reticle in camera space"
  );
  assertNearlyEqual(
    localOffset.x,
    PLAYER_CORE_MUZZLE_FORWARD_METERS * 2 * PLAYER_CORE_MUZZLE_SCREEN_RIGHT_FRACTION,
    "hip-fire muzzle horizontal offset should follow the requested screen fraction"
  );
  assertNearlyEqual(
    localOffset.y,
    -PLAYER_CORE_MUZZLE_FORWARD_METERS * PLAYER_CORE_MUZZLE_SCREEN_DOWN_FRACTION,
    "hip-fire muzzle vertical offset should follow the requested screen fraction"
  );
  assertNearlyEqual(
    localOffset.z,
    -PLAYER_CORE_MUZZLE_FORWARD_METERS,
    "hip-fire muzzle should still start in front of the camera"
  );

  const adsOrigin = new THREE.Vector3(0, 0, 0)
    .addScaledVector(new THREE.Vector3(0, 0, -1), PLAYER_CORE_MUZZLE_FORWARD_METERS);
  assertVectorNearlyEqual(
    adsOrigin,
    new THREE.Vector3(0, 0, -PLAYER_CORE_MUZZLE_FORWARD_METERS),
    "ADS origin should stay centered on the reticle line"
  );
});

test("player core hip-fire direction converges back through the reticle aim point", () => {
  const cameraPosition = new THREE.Vector3(0, 0, 0);
  const cameraForward = new THREE.Vector3(0, 0, -1);
  const muzzlePosition = createPlayerCoreMuzzleLocalOffset(90, 1);
  const shotDirection = createPlayerCoreShotDirection(
    muzzlePosition,
    cameraPosition,
    cameraForward,
    20
  );
  const aimPoint = cameraPosition.clone().addScaledVector(cameraForward, 20);
  const expectedDirection = aimPoint.sub(muzzlePosition).normalize();

  assertVectorNearlyEqual(
    shotDirection,
    expectedDirection,
    "hip-fire shots should originate off-center but still aim back through the crosshair target"
  );
  assert(
    shotDirection.x < 0 && shotDirection.y > 0 && shotDirection.z < 0,
    "off-center hip-fire should visibly angle from the lowered right-side muzzle toward the reticle"
  );
});

test("quality presets keep scheduler and render-distance invariants", () => {
  const presetIds = [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID];
  let previousPhysicsBudget = 0;
  let previousDebrisActiveRadius = 0;

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
      getRigidDebrisBodyBudget(preset.physicsObjectBudget) <= MAX_RIGID_DEBRIS_BODY_BUDGET,
      `${preset.label} rigid debris budget should stay within the CPU safety cap`
    );
    assert(
      preset.blockFragmentCount >= 1 && preset.blockFragmentCount <= BLOCK_FRAGMENT_COUNT,
      `${preset.label} debris count should stay within the fracture grid`
    );
    assert(
      preset.debrisActiveRadiusMeters >= previousDebrisActiveRadius,
      `${preset.label} active debris bubble should not shrink as quality increases`
    );
    previousPhysicsBudget = preset.physicsObjectBudget;
    previousDebrisActiveRadius = preset.debrisActiveRadiusMeters;
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
  assertEqual(QUALITY_PRESETS.potato.debrisActiveRadiusMeters, 8, "Potato should use the smallest active debris bubble");
  assertEqual(QUALITY_PRESETS.low.debrisActiveRadiusMeters, 12, "Low should keep debris active a little farther out");
  assertEqual(QUALITY_PRESETS.normal.debrisActiveRadiusMeters, 20, "Normal should keep a practical active debris radius");
  assertEqual(QUALITY_PRESETS.high.debrisActiveRadiusMeters, 32, "High should keep nearby craters active longer");
  assertEqual(QUALITY_PRESETS.ultra.debrisActiveRadiusMeters, 48, "Ultra should keep a broad active debris bubble");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].debrisActiveRadiusMeters,
    72,
    "Super Ultra should use the largest active debris bubble"
  );
  assertEqual(
    QUALITY_PRESETS[CUSTOM_PRESET_ID].debrisActiveRadiusMeters,
    QUALITY_PRESETS.normal.debrisActiveRadiusMeters,
    "Custom should inherit Normal's active debris bubble baseline"
  );
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

function createTestHitchStats(
  overrides: Partial<PerformanceHitchStatsSnapshot> = {}
): PerformanceHitchStatsSnapshot {
  return {
    qualityLabel: "Test",
    physicsObjectCount: 0,
    physicsObjectBudget: 192,
    rigidDebrisBodyBudget: 128,
    world: {
      loadedChunks: 0,
      visibleChunks: 0,
      culledChunks: 0,
      savedChunks: 0,
      queuedChunks: 0,
      loadedThisFrame: 0,
      requestedLoadsThisFrame: 0,
      pendingChunkLoads: 0,
      meshedThisFrame: 0,
      requestedMeshesThisFrame: 0,
      pendingMeshBuilds: 0,
      dirtyChunks: 0,
      visibleDirtyChunks: 0,
      culledDirtyChunks: 0,
      modifiedChunks: 0,
      damagedBlocks: 0,
      pendingChunkSaves: 0
    },
    physics: {
      activeBodies: 0,
      sleepingBodies: 0,
      broadphaseCells: 0,
      sleepingBroadphaseCells: 0,
      candidatePairs: 0,
      resolvedContacts: 0,
      skippedDebrisPairs: 0
    },
    rigidDebris: {
      initialized: true,
      bodies: 0,
      sleepingBodies: 0,
      terrainColliders: 0,
      rubbleSupportColliders: 0
    },
    fragmentRender: {
      batches: 0,
      instances: 0,
      capacity: 0
    },
    debrisSettler: {
      regions: 0,
      fragments: 0,
      activeFragments: 0,
      pairChecks: 0,
      resolvedPairs: 0,
      finalizedBatches: 0,
      finalizedFragments: 0,
      finalizedPieces: 0,
      forcedFinalizations: 0
    },
    rubble: {
      clusters: 0,
      pieces: 0,
      health: 0,
      maxCoverHeight: 0,
      visualChunks: 0
    },
    ...overrides
  };
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
