import * as THREE from "three";
import {
  BLOCK_DEBRIS_MAX_FRAGMENT_COUNT,
  BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT,
  BLOCK_DEBRIS_MAX_VISUAL_AXIS,
  BLOCK_DEBRIS_MIN_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_COLLISION_RADIUS,
  BLOCK_FRAGMENT_GRID_SIZE,
  BLOCK_FRAGMENT_SPACING,
  BLOCK_FRAGMENT_VISUAL_SIZE,
  BLOCK_RUBBLE_MATERIAL_UNITS,
  getBlockRubbleMaterialUnitsForHealth,
  getEjectedBlockRubbleMaterialUnits,
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  getMinimumDebrisFragmentCountForMaterialUnits,
  getTerrainImpactFragmentCount,
  normalizeBlockFragmentCount
} from "../src/blockFragments";
import { BLOCK, BLOCKS, PLACEABLE_BLOCKS, type BlockId } from "../src/blocks";
import {
  BLOCK_MATERIAL_RULES,
  TERRAFORMER_SUBCELL_DAMAGE_SCALE,
  TERRAIN_DAMAGE_SCALE,
  getBlockMaterialRule,
  getDebrisSpawnProfile,
  getMiningDamageAmount,
  getMiningTickSeconds,
  getTerrainMaxHealth,
  getTerraformerSubCellHealth
} from "../src/blockMaterialRules";
import {
  getLocalLightDefinition,
  isLocalLightBlock,
  selectNearestLocalLightSources
} from "../src/localLights";
import {
  LOCAL_LIGHT_POINT_PROXY_CAPACITY,
  LocalLightRenderer
} from "../src/localLightRenderer";
import {
  BLOCK_COLOR_VARIANT_COUNT,
  createBlockMeshKey,
  getBlockColorVariant,
  getBlockColorVariantFromMeshKey,
  getBlockFromMeshKey,
  getMaterialBlockColor,
  getTintedBlockColor
} from "../src/blockColors";
import {
  ENCLOSED_LIGHT_BUCKET,
  SKY_EXPOSED_LIGHT_BUCKET,
  createChunkSkyExposure,
  createLitBlockMeshKey,
  getBaseBlockMeshKey,
  getLitBlockFaceShade,
  getLitBlockShadeMultiplier
} from "../src/chunkLightOcclusion";
import {
  BLOCK_LIGHT_BUILD_JOB,
  BLOCK_LIGHT_BUILT_RESULT,
  buildBlockLightBuildJob,
  getBlockLightBuildJobTransfers
} from "../src/blockLightJobs";
import {
  BLOCK_LIGHT_MAX_LEVEL,
  BLOCK_LIGHT_RADIUS,
  buildChunkBlockLight,
  createBlockLightNeighborKey,
  createEmptyChunkBlockLight,
  getBlockLightEmission,
  getBlockLightAt,
  getBlockLightIndex,
  getDirtyBlockLightChunkCoordsForEdit,
  isBlockLightOpaque,
  normalizeBlockLightLevel,
  readChunkBlockLightBuffers
} from "../src/voxelBlockLight";
import {
  BLOCK_TEXTURE_TILE,
  getBlockTextureBaseTileId,
  getBlockTextureTileId
} from "../src/blockTextureTiles";
import { applyWorldBlockShaderPatches } from "../src/blockTextureAtlas";
import {
  applyBuilderBrush,
  collectBuilderBrushCells,
  eraseBuilderBrush,
  formatBuilderBrushSize,
  getBuilderBrushCenterForTarget,
  normalizeBuilderBrushSize
} from "../src/builderTools";
import { Chunk } from "../src/chunk";
import type { ChunkGeneratedResult, ChunkMeshedResult } from "../src/chunkProtocol";
import {
  CHUNK_GENERATE_JOB,
  CHUNK_MESH_JOB,
  buildChunkGenerateJob,
  buildChunkMeshJob
} from "../src/chunkJobs";
import type { CollisionBounds, CollisionWorld } from "../src/collision";
import {
  PhysicsCoreAimPreview,
  isAimPreviewLatticeCellVisibleFromPoint,
  predictHitscanCoreTrajectory,
  predictPhysicsCoreTrajectory,
  splitAimPreviewLatticeCellsByVisibility
} from "../src/coreAimPreview";
import {
  createDebrisShape,
  createDebrisShapeForBlock,
  fitDebrisShapeToVolumeBudget,
  getDebrisShapeGeometry,
  selectDebrisShapeIdForBlock
} from "../src/debrisShapes";
import {
  DebrisStuckCleanupTracker,
  isDebrisTrappedForCleanup
} from "../src/debrisCleanup";
import {
  createEmptyDebrisLifecycleDiagnostics,
  wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells
} from "../src/debrisSupportInvalidation";
import {
  DEBRIS_PRESSURE_MIN_BUDGET_RATIO,
  createDebrisPerformancePressureState,
  getDebrisPressureEffectiveRigidDebrisBodyBudget,
  updateDebrisPerformancePressureState
} from "../src/debrisPerformanceGovernor";
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
import {
  PhysicsFragmentInstancer,
  applyPhysicsFragmentBlockLightShaderPatch
} from "../src/physicsInstancing";
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
import { PlayerController, doesPlayerBoundsCollideWithWorld, isCatchablePointerLockRequest } from "../src/player";
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
  PHYSICS_CORE_BOUNCE_MAX_COUNT,
  PHYSICS_CORE_BOUNCE_MIN_COUNT,
  PHYSICS_CORE_DEFAULT_BOUNCE_COUNT,
  PHYSICS_CORE_DEFAULT_HUE_DEGREES,
  PHYSICS_CORE_DEFAULT_SIZE_PERCENT,
  PHYSICS_CORE_DEFAULT_TRAIL_ENABLED,
  PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT,
  PHYSICS_CORE_HUE_MAX_DEGREES,
  PHYSICS_CORE_HUE_MIN_DEGREES,
  PHYSICS_CORE_SIZE_MAX_PERCENT,
  PHYSICS_CORE_SIZE_MIN_PERCENT,
  PHYSICS_CORE_VELOCITY_MAX_PERCENT,
  PHYSICS_CORE_VELOCITY_MIN_PERCENT,
  formatPhysicsCoreBounceCount,
  formatPhysicsCoreHue,
  formatPhysicsCorePercent,
  getPhysicsCoreRadius,
  getPhysicsCoreVelocityMultiplier,
  normalizePhysicsCoreBounceCount,
  normalizePhysicsCoreHueDegrees,
  normalizePhysicsCoreSettings
} from "../src/physicsCoreSettings";
import { PhysicsCoreTrail } from "../src/physicsCoreTrail";
import { createPhysicsCoreColor, createPhysicsCoreMaterial } from "../src/physicsCoreVisuals";
import {
  IMPACT_CRATER_MAX_STAMPS,
  ImpactCraterField,
  createImpactCraterStampForTerrainImpact
} from "../src/impactCraterField";
import {
  PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
  PARTIAL_BLOCK_CORE_DAMAGE,
  arePartialBlockVisualCellIndexesConnected,
  buildPartialBlockMeshGeometryData,
  createPartialBlockCollisionBoxes,
  createPartialBlockFaceVisibilityMasks,
  createPartialBlockMeshRegionKey,
  getPartialBlockPlayerFootprintSupport,
  createPartialBlockRemovedVisualCellIndexes,
  getPartialBlockRemainingVisualCellCount,
  getPartialBlockRemovedVisualCellCount,
  type PartialBlockCell
} from "../src/partialBlocks";
import { PartialBlockMeshField } from "../src/partialBlockMeshField";
import {
  PARTIAL_BLOCK_MESH_MIN_UPDATE_INTERVAL_MS,
  shouldDeferPartialBlockMeshUpdate
} from "../src/partialBlockMeshBudget";
import {
  buildPartialBlockMeshBuildJob,
  createPartialBlockMeshBuildJobPayload,
  getPartialBlockMeshBuildJobPayloadTransfers
} from "../src/partialBlockMeshWorkerProtocol";
import { RollingFrameRateMeter } from "../src/frameRateMeter";
import { shouldShowSuperUltraOptIn } from "../src/qualityController";
import {
  CUSTOM_PRESET_ID,
  DEFAULT_BLOCK_LIGHT_MIN_LEVEL,
  FOG_RENDER_SAFETY_CHUNKS,
  QUALITY_PRESET_ORDER,
  QUALITY_PRESETS,
  SUPER_ULTRA_PRESET_ID
} from "../src/qualityPresets";
import {
  BLOCK_FRAGMENT_MAX_COUNT,
  BLOCK_LIGHT_LEVEL_MAX,
  BLOCK_LIGHT_LEVEL_MIN,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  SHADOW_QUALITY_MAX_LEVEL,
  createDefaultQualitySettings,
  formatBlockLightLevel,
  formatBlockFragmentCount,
  formatRenderDistance,
  formatShadowQuality,
  getShadowMapSizeForQualityLevel,
  normalizeBlockLightLevelRange,
  normalizeBlockLightLevelSetting,
  normalizeQualitySettings,
  normalizeRenderDistance,
  normalizeShadowQualityLevel
} from "../src/qualitySettings";
import { voxelRaycast } from "../src/raycast";
import {
  DEFAULT_GROUND_DEBRIS_BUDGET,
  GROUND_DEBRIS_BUDGET_BURST_GRACE_SECONDS,
  GROUND_DEBRIS_BUDGET_STEP,
  MAX_GROUND_DEBRIS_BUDGET,
  MAX_RIGID_DEBRIS_BODY_BUDGET,
  MIN_GROUND_DEBRIS_BUDGET,
  MIN_RIGID_DEBRIS_BODY_BUDGET,
  formatGroundDebrisBudget,
  getEffectiveRigidDebrisBodyBudget,
  isGroundDebrisBudgetCleanupEligible,
  normalizeGroundDebrisBudget,
  getRigidDebrisBodyBudget
} from "../src/rigidDebrisBudget";
import {
  DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS,
  GROUND_DEBRIS_CLEANUP_BURST_GRACE_SECONDS,
  FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS,
  MAX_GROUND_DEBRIS_LIFETIME_SECONDS,
  formatGroundDebrisLifetime,
  getEffectiveGroundDebrisLifetimeSeconds,
  normalizeGroundDebrisLifetime
} from "../src/debrisLifetime";
import {
  createEmptyRigidDebrisStats,
  RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET,
  RigidDebrisSimulation
} from "../src/rigidDebris";
import {
  partitionRigidDebrisAdmission,
  selectRigidDebrisAdmissionIndices,
  type RigidDebrisAdmissionFragment
} from "../src/rigidDebrisAdmission";
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
  formatPlayerVelocityComponentsMetersPerSecond,
  getPlayerSpeedMetersPerSecond
} from "../src/playerSpeed";
import {
  createChunkStorage,
  createMemorySaveDatabase,
  createWorldRegistry,
  getLegacyWorldHeightOffset,
  getNewWorldTerrainProfile,
  migrateSavedPlayerStateHeight,
  normalizeSavedTerrainProfile,
  type ChunkStorage,
  type SavedChunkSnapshot,
  type SavedWorld
} from "../src/chunkStorage";
import {
  DAY_NIGHT_DEFAULT_CYCLE_SECONDS,
  DAY_NIGHT_DEFAULT_TIME_OF_DAY,
  DAY_NIGHT_FRAME_DELTA_CLAMP_SECONDS,
  DAY_NIGHT_MAX_CYCLE_SECONDS,
  DAY_NIGHT_MIN_CYCLE_SECONDS,
  advanceDayNightState,
  createDayNightDebugSnapshot,
  createDayNightVisualState,
  createDefaultDayNightState,
  createSavedDayNightState,
  formatCycleLengthSeconds,
  formatTimeOfDay,
  normalizeCycleLengthSeconds,
  normalizeDayNightState,
  normalizeSavedDayNightState,
  normalizeTimeOfDay,
  type RgbColorTuple
} from "../src/dayNightCycle";
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
import type { FrameDiagnosticsSnapshot } from "../src/frameDiagnostics";
import {
  createEmptyFrameTimings,
  createEmptyPhysicsTimingStats,
  smoothFrameTimings
} from "../src/frameTimings";
import {
  LOW_FPS_LOG_INTERVAL_MS,
  createPerformanceHitchRecord,
  formatPerformanceHitchRecord,
  PerformanceHitchLog,
  type PerformanceHitchRecord,
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
  canMineBlockWithHotbarItem,
  canPlaceBlockWithHotbarItem,
  canThrowCoreWithHotbarItem,
  createBlockHotbarItems,
  createHotbarItems,
  createToolHotbarItems,
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
  MINING_TOOL_ITEM_ID,
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
import {
  collectHitscanDebrisTargets,
  doesHitscanBeamTouchDebris
} from "../src/hitscanDebris";
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
  TERRAFORMER_SIZE_MAX,
  TERRAFORMER_SIZE_MIN,
  formatTerraformerSize,
  normalizeTerraformerSize,
  stepTerraformerSize
} from "../src/terraformerSettings";
import {
  SUPERFLAT_TERRAIN_HEIGHT,
  SUPERFLAT_WORLD_SEED,
  createTerrainContext,
  generateChunkBlocks,
  getTerrainHeight,
  getTerrainSurfaceBlock,
  isSuperflatSeed
} from "../src/terrain";
import {
  parseAdminCommand,
  spawnPillarFixture,
  spawnPlatformFixture,
  spawnWallFixture
} from "../src/adminCommands";
import {
  CODEX_PILOT_PLAY_SCRIPTS,
  createCodexPilotLookAtAngles,
  createCodexPilotMoveKeys,
  normalizeCodexPilotPlayScriptId,
  normalizeCodexPilotFireInput,
  normalizeCodexPilotMove,
  normalizeCodexPilotWeapon
} from "../src/codexPilot";
import {
  CombatLog,
  createCombatLogSubCell,
  formatCombatLogEntry
} from "../src/combatLog";
import {
  DEFAULT_CLICK_FIRE_MODE,
  formatClickFireMode,
  formatClickFireModeShort,
  normalizeClickFireMode,
  toggleClickFireMode
} from "../src/clickFireMode";
import {
  DEFAULT_AUDIO_SETTINGS,
  audioVolumeFromPercent,
  audioVolumeToPercent,
  formatAudioVolumePercent,
  normalizeAudioSettings,
  normalizeAudioVolumePercent
} from "../src/audioSettings";
import {
  VISUAL_TEST_SCENARIO_SNAPSHOT_MAX_HITCHES,
  normalizeVisualPilotRecordOptions,
  normalizeVisualTestRecorderOptions,
  summarizeVisualTestScenarioHitches
} from "../src/visualTestRecorder";
import {
  getVisualTestScenario,
  listVisualTestScenarios,
  normalizeVisualTestScenarioId
} from "../src/visualTestScenarios";
import { createCoreBreakTestPlan, createYawPitchToward } from "../src/testAvatar";
import { getSunlitFaceShade } from "../src/voxelLighting";
import {
  CHUNK_SIZE,
  EXPANDED_TERRAIN_SURFACE_OFFSET,
  LEGACY_WORLD_HEIGHT,
  WORLD_HEIGHT
} from "../src/voxelConstants";
import { VoxelWorld, type BlockDamageBrushPreview } from "../src/world";
import { WorkerPool, getDefaultWorkerPoolSize, normalizeWorkerPoolSize } from "../src/workerPool";
import {
  SKYBOX_LOWER_FOG_MASK_END_Y,
  SKYBOX_LOWER_FOG_MASK_START_Y,
  getSkyboxAlignedSunDirection
} from "../src/skybox";
import {
  HORIZON_MATTE_EXTENSION_CHUNKS,
  HORIZON_MATTE_INSET_CHUNKS,
  getHorizonMatteRadii,
  shouldShowHorizonMatte
} from "../src/horizonMatte";

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

function assertFloat32ArraysEqual(actual: Float32Array, expected: Float32Array, message: string): void {
  assertEqual(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${message}. First difference at ${index}: ${actual[index]} !== ${expected[index]}.`);
    }
  }
}

function createTestPartialBlockCell(
  position: { readonly x: number; readonly y: number; readonly z: number },
  removedVisualCellIndexes: readonly number[]
): PartialBlockCell {
  return {
    block: BLOCK.stone,
    position,
    cuts: [],
    removedVisualCellIndexes,
    damage: 1,
    maxHealth: 1
  };
}

function createRemovedPartialColumns(columns: readonly { readonly x: number; readonly z: number }[]): number[] {
  const removed: number[] = [];
  for (const { x, z } of columns) {
    for (let y = 0; y < 3; y += 1) {
      removed.push(x + y * 3 + z * 9);
    }
  }
  return removed;
}

test("combat log caps entries and reports latest events first", () => {
  const combatLog = new CombatLog(2);
  combatLog.record({
    atMs: 1,
    source: { kind: "terraformer", label: "Terraformer" },
    action: "edit size 1",
    targets: []
  });
  combatLog.record({
    atMs: 2,
    source: { kind: "physics-core", label: "Physics Core" },
    action: "impact 12.0 m/s",
    targets: []
  });
  combatLog.record({
    atMs: 3,
    source: { kind: "hitscan-core", label: "Hitscan Core" },
    action: "impact 20.0 m/s",
    targets: []
  });

  const entries = combatLog.getRecentEntries(3);
  assertEqual(entries.length, 2, "combat log should keep its configured ring-buffer cap");
  assertEqual(entries[0]?.source.kind, "hitscan-core", "most recent combat event should be first in HUD reads");
  assertEqual(entries[1]?.source.kind, "physics-core", "older capped event should still be available");
});

test("combat log formats terrain sub-cell damage with local and global cells", () => {
  const line = formatCombatLogEntry({
    id: 12,
    atMs: 25,
    source: { kind: "terraformer", label: "Terraformer" },
    action: "edit size 1",
    targets: [{
      kind: "terrain",
      block: BLOCK.sand,
      blockName: "Sand",
      x: 4,
      y: 5,
      z: 6,
      damageApplied: 50,
      damageBefore: 100,
      damageAfter: 150,
      remainingHealth: 1200,
      maxHealth: 1350,
      destroyed: false,
      subCells: [createCombatLogSubCell(13, { x: 13, y: 16, z: 19 })]
    }]
  });

  assert(
    line.includes("Terraformer edit size 1"),
    "formatted combat event should include the source tool and action"
  );
  assert(line.includes("Sand@4,5,6 -50"), "formatted combat event should include block and damage");
  assert(line.includes("cells 111[13,16,19]"), "formatted combat event should include local/global sub-cell coordinates");
});

test("combat log persistent flushing batches damage events for disk logging", async () => {
  const originalFetch = globalThis.fetch;
  const payloads: unknown[] = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    payloads.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
    return new Response(JSON.stringify({ logPath: "logs/combat/test.jsonl" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const combatLog = new CombatLog(4, {
      persistence: {
        endpoints: ["/__voxel_combat_log"],
        flushDelayMs: 60_000,
        maxBatchEntries: 1,
        getContext: () => ({ worldId: "test-world", selectedItem: "Terraformer" })
      }
    });

    combatLog.record({
      atMs: 1,
      source: { kind: "terraformer", label: "Terraformer" },
      action: "edit size 1",
      targets: [{
        kind: "terrain",
        block: BLOCK.grass,
        blockName: "Grass",
        x: 1,
        y: 2,
        z: 3,
        damageApplied: 60,
        remainingHealth: 1560,
        maxHealth: 1620,
        destroyed: false,
        subCells: [createCombatLogSubCell(0, { x: 3, y: 6, z: 9 })]
      }]
    });
    combatLog.record({
      atMs: 2,
      source: { kind: "physics-core", label: "Physics Core" },
      action: "impact 10.0 m/s",
      targets: []
    });

    await combatLog.flushPersistent();

    assertEqual(payloads.length, 2, "manual combat log flush should drain every queued batch");
    const firstPayload = payloads[0] as {
      readonly type?: unknown;
      readonly context?: { readonly worldId?: unknown };
      readonly entries?: readonly { readonly targets?: readonly unknown[] }[];
    };
    assertEqual(firstPayload.type, "voxel.combat-log.batch", "persistent payloads should identify their schema");
    assertEqual(firstPayload.context?.worldId, "test-world", "persistent payloads should include repro context");
    assertEqual(firstPayload.entries?.[0]?.targets?.length, 1, "persistent payloads should include terrain damage targets");
    assert(
      combatLog.getPersistenceStatusLine().includes("disk sent 2"),
      "debug HUD persistence status should report successful disk sends"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function decodeTestLatticeIndex(index: number): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: index % BLOCK_FRAGMENT_GRID_SIZE,
    y: Math.floor(index / BLOCK_FRAGMENT_GRID_SIZE) % BLOCK_FRAGMENT_GRID_SIZE,
    z: Math.floor(index / (BLOCK_FRAGMENT_GRID_SIZE ** 2)) % BLOCK_FRAGMENT_GRID_SIZE
  };
}

function encodeTestLatticeIndex(x: number, y: number, z: number): number {
  return x + y * BLOCK_FRAGMENT_GRID_SIZE + z * BLOCK_FRAGMENT_GRID_SIZE ** 2;
}

function createTestGlobalMicroCellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function getPreviewGlobalBiteCellKeys(preview: BlockDamageBrushPreview | null): readonly string[] {
  const keys: string[] = [];
  for (const target of preview?.targets ?? []) {
    for (const cellIndex of target.affectedVisualCellIndexes) {
      const cell = decodeTestLatticeIndex(cellIndex);
      keys.push(createTestGlobalMicroCellKey(
        target.position.x * BLOCK_FRAGMENT_GRID_SIZE + cell.x,
        target.position.y * BLOCK_FRAGMENT_GRID_SIZE + cell.y,
        target.position.z * BLOCK_FRAGMENT_GRID_SIZE + cell.z
      ));
    }
  }
  return keys;
}

function getWorldPartialBlockGlobalBiteCellKeys(
  world: VoxelWorld,
  positions: readonly { readonly x: number; readonly y: number; readonly z: number }[]
): readonly string[] {
  const keys: string[] = [];
  for (const position of positions) {
    for (const cellIndex of world.getPartialBlock(position.x, position.y, position.z)?.removedVisualCellIndexes ?? []) {
      const cell = decodeTestLatticeIndex(cellIndex);
      keys.push(createTestGlobalMicroCellKey(
        position.x * BLOCK_FRAGMENT_GRID_SIZE + cell.x,
        position.y * BLOCK_FRAGMENT_GRID_SIZE + cell.y,
        position.z * BLOCK_FRAGMENT_GRID_SIZE + cell.z
      ));
    }
  }
  return keys;
}

function areTestGlobalMicroCellsConnected(keys: readonly string[]): boolean {
  const cellKeys = new Set(keys);
  if (cellKeys.size <= 1) return true;

  const firstKey = cellKeys.values().next().value as string | undefined;
  if (!firstKey) return true;

  const visited = new Set<string>([firstKey]);
  const queue = [firstKey];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const [x, y, z] = current.split(",").map(Number);
    for (const neighbor of [
      createTestGlobalMicroCellKey(x + 1, y, z),
      createTestGlobalMicroCellKey(x - 1, y, z),
      createTestGlobalMicroCellKey(x, y + 1, z),
      createTestGlobalMicroCellKey(x, y - 1, z),
      createTestGlobalMicroCellKey(x, y, z + 1),
      createTestGlobalMicroCellKey(x, y, z - 1)
    ]) {
      if (!cellKeys.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return visited.size === cellKeys.size;
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

function countBlockInPayload(blocks: Uint8Array, block: number): number {
  let count = 0;
  for (const payloadBlock of blocks) {
    if (payloadBlock === block) count += 1;
  }
  return count;
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

test("WorkerPool priority drains urgent jobs ahead of background jobs", async () => {
  const pool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const started: string[] = [];
  const completed: string[] = [];
  const releases: Array<() => void> = [];

  function enqueue(label: string, priority: number): void {
    pool.enqueue<null, string>({
      type: label,
      payload: null,
      priority,
      run: () => {
        started.push(label);
        return new Promise<string>((resolve) => {
          releases.push(() => {
            completed.push(label);
            resolve(label);
          });
        });
      }
    });
  }

  enqueue("background", 90);
  enqueue("middle", 50);
  enqueue("urgent", 0);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assertDeepEqual(started, ["background"], "the first job should start immediately");
  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertDeepEqual(started, ["background", "urgent"], "urgent queued work should run before older lower-priority work");

  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertDeepEqual(started, ["background", "urgent", "middle"], "remaining work should continue by priority");

  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertDeepEqual(completed, ["background", "urgent", "middle"], "all queued priority work should complete");
});

test("WorkerPool stats separate job types and upload timing", async () => {
  const pool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2, getNow: () => 10 });
  const handle = pool.enqueue<null, string>({
    type: "chunk:mesh",
    payload: null,
    priority: 5,
    run: () => "done"
  });

  const result = await handle.promise;
  assertEqual(result.status, "completed", "test worker job should complete");
  pool.recordMainThreadUpload(4, "chunk:mesh");

  const stats = pool.getStats();
  const meshStats = stats.jobsByType.find((entry) => entry.type === "chunk:mesh");
  assert(meshStats, "per-type stats should include the completed mesh job");
  assertEqual(meshStats.completedJobs, 1, "per-type stats should count completed jobs");
  assertEqual(meshStats.runningJobs, 0, "per-type stats should clear running jobs");
  assertEqual(meshStats.averageMainThreadUploadMs, 4, "per-type stats should include upload timing");
});

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
    blockFragmentCount: 7,
    blockLightMinLevel: 1,
    blockLightMaxLevel: 15
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
    blockFragmentCount: 13,
    blockLightMinLevel: 4,
    blockLightMaxLevel: 12
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
  const grassPrimaryAction = getItemAction(itemRegistry, grassItemId, "primary");
  const grassSecondaryAction = getItemAction(itemRegistry, grassItemId, "secondary");
  const miningToolDefinition = getItemDefinition(itemRegistry, MINING_TOOL_ITEM_ID);

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
    getItemLabel(itemRegistry, MINING_TOOL_ITEM_ID),
    "Terraformer",
    "Terraformer should have a readable item label"
  );
  assertEqual(
    miningToolDefinition.category,
    "tool",
    "Terraformer should be described as a tool item"
  );
  assertEqual(
    miningToolDefinition.maxStack,
    1,
    "Terraformer should be a single held tool instead of a stackable block"
  );
  assertDeepEqual(
    miningToolDefinition.tags,
    ["tool", "terrain", "terraforming"],
    "Terraformer should advertise tool, terrain, and terraforming tags"
  );
  assertEqual(
    getItemAction(itemRegistry, MINING_TOOL_ITEM_ID, "primary").kind,
    "terrain:mine-block",
    "Terraformer primary action should describe terrain editing"
  );
  assertEqual(
    getItemAction(itemRegistry, MINING_TOOL_ITEM_ID, "secondary").kind,
    "none",
    "Terraformer secondary action should be inert"
  );
  assertEqual(
    grassPrimaryAction.kind,
    "terrain:erase-block",
    "placeable block primary action should erase the targeted build brush"
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

test("hotbar lanes separate gameplay tools from build blocks", () => {
  const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
  const toolHotbarItems = createToolHotbarItems();
  const blockHotbarItems = createBlockHotbarItems(PLACEABLE_BLOCKS);
  const combinedHotbarItems = createHotbarItems(PLACEABLE_BLOCKS);
  const firstItem = toolHotbarItems[0];
  const miningToolItem = toolHotbarItems[1];
  const projectileCoreItem = toolHotbarItems[2];
  const hitscanCoreItem = toolHotbarItems[3];
  const firstBlockItem = blockHotbarItems[0];
  const grassItem = createItemStack(createBlockItemId(BLOCK.grass));

  assertEqual(firstItem?.itemId, EMPTY_HANDS_ITEM_ID, "tool lane should start in the explicit unarmed state");
  assertEqual(
    miningToolItem?.itemId,
    MINING_TOOL_ITEM_ID,
    "tool lane should put the Terraformer immediately after unarmed"
  );
  assertEqual(
    projectileCoreItem?.itemId,
    PHYSICS_CORE_ITEM_ID,
    "tool lane should keep the projectile physics core after the Terraformer"
  );
  assertEqual(
    hitscanCoreItem?.itemId,
    HITSCAN_CORE_ITEM_ID,
    "tool lane should end with the hitscan core item"
  );
  assertEqual(toolHotbarItems.length, 4, "tool lane should contain unarmed, Terraformer, and core tools");
  assertEqual(
    blockHotbarItems.length,
    PLACEABLE_BLOCKS.length,
    "block lane should contain every placeable block without core weapons mixed in"
  );
  assertEqual(
    firstBlockItem?.itemId,
    createBlockItemId(BLOCK.grass),
    "block lane should start with the first placeable block"
  );
  assertEqual(
    combinedHotbarItems.length,
    toolHotbarItems.length + blockHotbarItems.length,
    "legacy combined hotbar helper should still expose every selectable stack"
  );
  assertEqual(
    getHotbarItemLabel(firstItem ?? createItemStack(EMPTY_HANDS_ITEM_ID), itemRegistry),
    "Unarmed",
    "unarmed slot should have a readable HUD label"
  );
  assertEqual(
    getHotbarItemLabel(miningToolItem ?? createItemStack(MINING_TOOL_ITEM_ID), itemRegistry),
    "Terraformer",
    "Terraformer slot should have a readable HUD label"
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
    !canMineBlockWithHotbarItem(createItemStack(EMPTY_HANDS_ITEM_ID), itemRegistry),
    "unarmed should leave left click inert until tools exist"
  );
  assert(
    canMineBlockWithHotbarItem(createItemStack(MINING_TOOL_ITEM_ID), itemRegistry),
    "selected Terraformer should edit terrain on left click"
  );
  assert(
    !canMineBlockWithHotbarItem(grassItem, itemRegistry),
    "selected blocks should erase build targets rather than using material mining cadence"
  );
  assert(
    !canMineBlockWithHotbarItem(createItemStack(PHYSICS_CORE_ITEM_ID), itemRegistry),
    "holding a core should not also break targeted blocks on left click"
  );
  assert(
    !canMineBlockWithHotbarItem(createItemStack(HITSCAN_CORE_ITEM_ID), itemRegistry),
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
    "terrain:erase-block",
    "block hotbar primary action should resolve as build erase"
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

test("click fire mode toggles between semi and full auto", () => {
  assertEqual(DEFAULT_CLICK_FIRE_MODE, "semi", "click actions should default to one action per press");
  assertEqual(normalizeClickFireMode("full"), "full", "stored full-auto mode should normalize");
  assertEqual(
    normalizeClickFireMode("nonsense", "full"),
    "full",
    "invalid stored click mode should fall back without inventing a mode"
  );
  assertEqual(toggleClickFireMode("semi"), "full", "T should step semi-auto into full-auto");
  assertEqual(toggleClickFireMode("full"), "semi", "T should step full-auto back into semi-auto");
  assertEqual(formatClickFireMode("semi"), "Semi Auto", "Nova status copy should spell out semi-auto mode");
  assertEqual(formatClickFireModeShort("full"), "FULL", "hotbar copy should keep full-auto compact");
});

test("audio settings normalize persisted volume controls", () => {
  assertDeepEqual(
    normalizeAudioSettings({
      enabled: false,
      masterVolume: 2,
      sfxVolume: "-1",
      uiVolume: "0.25"
    }),
    {
      enabled: false,
      masterVolume: 1,
      sfxVolume: 0,
      uiVolume: 0.25
    },
    "audio settings should preserve the toggle and clamp each volume lane"
  );
  assertEqual(
    normalizeAudioSettings({ enabled: "sure" }).enabled,
    DEFAULT_AUDIO_SETTINGS.enabled,
    "invalid audio toggles should fall back to the default"
  );
  assertEqual(audioVolumeToPercent(0.655), 66, "volume display should round to the nearest percent");
  assertEqual(audioVolumeFromPercent("42", 0.8), 0.42, "slider percentages should convert back to 0..1 volume");
  assertEqual(normalizeAudioVolumePercent(120, 65), 100, "volume slider values should clamp high");
  assertEqual(normalizeAudioVolumePercent(Number.NaN, 65), 65, "invalid volume slider values should preserve fallback");
  assertEqual(formatAudioVolumePercent(0.5), "50%", "audio volume labels should stay compact");
  assertEqual(
    formatAudioVolumePercent(DEFAULT_AUDIO_SETTINGS.masterVolume),
    "80%",
    "default master volume should be audible without forcing the system mixer to max"
  );
  assertEqual(
    formatAudioVolumePercent(DEFAULT_AUDIO_SETTINGS.sfxVolume),
    "100%",
    "default SFX volume should give quiet movement and terrain cues room to breathe"
  );
  assertEqual(
    formatAudioVolumePercent(DEFAULT_AUDIO_SETTINGS.uiVolume),
    "90%",
    "default UI volume should be present without relying on the louder SFX lane"
  );
});

test("builder brush sizing stays odd and centered", () => {
  assertEqual(normalizeBuilderBrushSize(0), 1, "builder brush should clamp tiny values to one block");
  assertEqual(normalizeBuilderBrushSize(2), 3, "builder brush should round to odd centered dimensions");
  assertEqual(normalizeBuilderBrushSize(99), 7, "builder brush should cap large admin edits");
  assertEqual(formatBuilderBrushSize(5), "5x5x5", "builder brush labels should show cube dimensions");

  const cells = collectBuilderBrushCells({ x: 10.8, y: 5.2, z: -2.1 }, 3);
  assertEqual(cells.length, 27, "3x3x3 builder brushes should touch 27 cells");
  assert(
    cells.some((cell) => cell.x === 10 && cell.y === 5 && cell.z === -3),
    "builder brushes should stay centered on the floored target cell"
  );
});

test("builder brush target centers match place and erase previews", () => {
  const target = { x: 4.9, y: 8.1, z: -2.4 };
  const normal = { x: 0, y: 1, z: 0 };

  assertDeepEqual(
    getBuilderBrushCenterForTarget(target, normal, "erase"),
    { x: 4, y: 8, z: -3 },
    "erase previews should stay centered on the hit block"
  );
  assertDeepEqual(
    getBuilderBrushCenterForTarget(target, normal, "place"),
    { x: 4, y: 9, z: -3 },
    "place previews should move to the adjacent block space"
  );
});

test("builder brush applies and erases blocks while respecting skipped player cells", () => {
  const blocks = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    getBlock: (x: number, y: number, z: number) => blocks.get(key(x, y, z)) ?? BLOCK.air,
    setBlock: (x: number, y: number, z: number, block: number) => {
      blocks.set(key(x, y, z), block);
    }
  };

  const placed = applyBuilderBrush({
    world,
    center: { x: 0, y: 0, z: 0 },
    size: 3,
    block: BLOCK.stone,
    shouldSkipCell: (cell) => cell.x === 0 && cell.y === 0 && cell.z === 0
  });
  assertEqual(placed, 26, "builder place brush should skip protected occupied cells");
  assertEqual(world.getBlock(0, 0, 0), BLOCK.air, "skipped cells should remain unchanged");
  assertEqual(world.getBlock(1, 0, 0), BLOCK.stone, "unskipped cells should receive the selected block");

  const erased = eraseBuilderBrush({
    world,
    center: { x: 0, y: 0, z: 0 },
    size: 3
  });
  assertEqual(erased, 26, "builder erase brush should remove the placed cells");
  assertEqual(world.getBlock(1, 0, 0), BLOCK.air, "erased cells should become air");
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

test("chunk streaming horizon trims square corners to match circular fog", () => {
  const world = new VoxelWorld({ seed: "circular-horizon-test" });

  world.queueChunksAround(0, 0, 2);

  assert(world.chunkLoadQueue.has(world.key(2, 0)), "radial horizon should keep the positive X edge");
  assert(world.chunkLoadQueue.has(world.key(2, 1)), "half-chunk margin should keep near-corner edge chunks");
  assert(!world.chunkLoadQueue.has(world.key(2, 2)), "radial horizon should drop the old square corner");
  assert(!world.chunkLoadQueue.has(world.key(-2, -2)), "radial horizon should be symmetric in negative space");
  assertEqual(
    world.chunkLoadQueue.size,
    21,
    "radius-2 horizon should queue the circular footprint plus chunk-boundary safety margin"
  );
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

test("chunk generation worker job matches direct terrain generation", () => {
  const terrain = createTerrainContext("chunk-job-seed", "varied");
  const result = buildChunkGenerateJob({
    requestId: 17,
    cx: 2,
    cz: -3,
    seed: "chunk-job-seed",
    terrainProfile: terrain.profile
  });

  assertEqual(result.type, "generated", "chunk generation job should return a generated result");
  assertEqual(result.requestId, 17, "chunk generation job should preserve request id");
  assertUint8ArraysEqual(
    result.blocks,
    generateChunkBlocks(2, -3, terrain),
    "chunk generation worker job should match direct terrain generation"
  );
});

test("chunk generation worker job matches direct floating-island generation", () => {
  const terrain = createTerrainContext("chunk-floating-seed", "floating-islands");
  const result = buildChunkGenerateJob({
    requestId: 171,
    cx: 0,
    cz: 0,
    seed: "chunk-floating-seed",
    terrainProfile: terrain.profile
  });

  assertEqual(result.type, "generated", "floating-island chunk job should return a generated result");
  assertUint8ArraysEqual(
    result.blocks,
    generateChunkBlocks(0, 0, terrain),
    "floating-island worker generation should match direct terrain generation"
  );
});

test("chunk mesh worker job honors partial render masks", () => {
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const partialMask = new Uint8Array(blocks.length);
  const blockLight = createEmptyBlockLightChunkSnapshot();
  const centerIndex = 1 + CHUNK_SIZE * (1 + CHUNK_SIZE * 1);
  blocks[centerIndex] = BLOCK.stone;
  blockLight[getBlockLightIndex(2, 1, 1)] = 14;

  const visibleResult = buildChunkMeshJob({
    requestId: 18,
    cx: 0,
    cz: 0,
    revision: 1,
    blocks: blocks.buffer.slice(0),
    neighbors: {
      negativeX: null,
      positiveX: null,
      negativeZ: null,
      positiveZ: null
    },
    partialBlockMasks: {
      current: null,
      neighbors: {
        negativeX: null,
        positiveX: null,
        negativeZ: null,
        positiveZ: null
      }
    },
    blockLights: createChunkMeshBlockLightBuffers(blockLight)
  });

  partialMask[centerIndex] = 1;
  const hiddenResult = buildChunkMeshJob({
    requestId: 19,
    cx: 0,
    cz: 0,
    revision: 2,
    blocks: blocks.buffer.slice(0),
    neighbors: {
      negativeX: null,
      positiveX: null,
      negativeZ: null,
      positiveZ: null
    },
    partialBlockMasks: {
      current: partialMask.buffer,
      neighbors: {
        negativeX: null,
        positiveX: null,
        negativeZ: null,
        positiveZ: null
      }
    },
    blockLights: createChunkMeshBlockLightBuffers(blockLight)
  });

  assert(visibleResult.positions.length > 0, "unmasked solid blocks should emit chunk mesh geometry");
  assertEqual(hiddenResult.positions.length, 0, "partial-masked blocks should be hidden from normal chunk mesh");
  assertEqual(visibleResult.uvs.length / 2, visibleResult.positions.length / 3, "chunk mesh job should emit UVs");
  assertEqual(
    visibleResult.blockLights.length,
    visibleResult.positions.length / 3,
    "chunk mesh job should emit one block-light value per vertex"
  );
  assert(
    visibleResult.blockLights.some((value) => value > 0),
    "chunk mesh job should sample dedicated block-light data into vertex attributes"
  );
  assertEqual(
    visibleResult.textureTiles.length,
    visibleResult.positions.length / 3,
    "chunk mesh job should emit per-vertex texture tile ids"
  );
});

test("chunk mesh block light smooths face corner values", () => {
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blocks[1 + CHUNK_SIZE * (1 + CHUNK_SIZE * 1)] = BLOCK.stone;
  blockLight[getBlockLightIndex(2, 1, 1)] = 14;

  const result = buildChunkMeshJob({
    requestId: 181,
    cx: 0,
    cz: 0,
    revision: 1,
    blocks: blocks.buffer.slice(0),
    neighbors: {
      negativeX: null,
      positiveX: null,
      negativeZ: null,
      positiveZ: null
    },
    partialBlockMasks: {
      current: null,
      neighbors: {
        negativeX: null,
        positiveX: null,
        negativeZ: null,
        positiveZ: null
      }
    },
    blockLights: createChunkMeshBlockLightBuffers(blockLight)
  });

  const positiveXFaceLights = getBlockLightValuesForMeshNormal(result, [1, 0, 0]);
  assertEqual(positiveXFaceLights.length, 4, "single-block positive-X face should emit four vertices");
  assert(
    positiveXFaceLights.every((value) => value === 3.5),
    "isolated face-adjacent light should be averaged into each touching corner instead of stamped flat"
  );
  assert(
    !positiveXFaceLights.includes(14),
    "smoothed terrain vertices should avoid the old checker-pattern full-cell light stamp"
  );
});

test("chunk mesh worker job is deterministic for the same payload", () => {
  const terrain = createTerrainContext("chunk-mesh-deterministic", "varied");
  const blocks = generateChunkBlocks(0, 0, terrain);
  const payload = {
    requestId: 20,
    cx: 0,
    cz: 0,
    revision: 1,
    blocks: blocks.buffer.slice(0),
    neighbors: {
      negativeX: null,
      positiveX: null,
      negativeZ: null,
      positiveZ: null
    },
    partialBlockMasks: {
      current: null,
      neighbors: {
        negativeX: null,
        positiveX: null,
        negativeZ: null,
        positiveZ: null
      }
    },
    blockLights: createChunkMeshBlockLightBuffers()
  };

  const first = buildChunkMeshJob(payload);
  const second = buildChunkMeshJob({
    ...payload,
    requestId: 21,
    blocks: blocks.buffer.slice(0)
  });

  assertFloat32ArraysEqual(first.positions, second.positions, "same chunk mesh payload should produce same positions");
  assertFloat32ArraysEqual(first.colors, second.colors, "same chunk mesh payload should produce same colors");
  assertFloat32ArraysEqual(first.blockLights, second.blockLights, "same chunk mesh payload should produce same block lights");
  assertFloat32ArraysEqual(first.textureTiles, second.textureTiles, "same chunk mesh payload should produce same texture tiles");
});

test("classic terrain profile preserves legacy seeded terrain separately from varied terrain", () => {
  const classicTerrain = createTerrainContext("legacy-profile-seed", "classic");
  const variedTerrain = createTerrainContext("legacy-profile-seed", "varied");
  const floatingTerrain = createTerrainContext("legacy-profile-seed", "floating-islands");

  assertEqual(classicTerrain.profile, "classic", "explicit classic profile should stay on the old generator lane");
  assertEqual(variedTerrain.profile, "varied", "explicit varied profile should stay on the new generator lane");
  assertEqual(floatingTerrain.profile, "floating-islands", "explicit floating-islands profile should stay on its own generator lane");
  assert(
    getTerrainHeight(11, -7, classicTerrain) !== getTerrainHeight(11, -7, variedTerrain) ||
      getTerrainHeight(41, 19, classicTerrain) !== getTerrainHeight(41, 19, variedTerrain),
    "terrain profile should affect generated height for the same seed"
  );

  const classicChunk = generateChunkBlocks(1, -2, classicTerrain);
  const variedChunk = generateChunkBlocks(1, -2, variedTerrain);
  const floatingChunk = generateChunkBlocks(1, -2, floatingTerrain);
  assert(hasAnyDifference(classicChunk, variedChunk), "terrain profiles should not collapse to the same chunk payload");
  assert(hasAnyDifference(variedChunk, floatingChunk), "floating islands should not collapse to the varied chunk payload");
});

test("seeded terrain generation creates varied landforms and surfaces", () => {
  const terrain = createTerrainContext("landform-test");
  const heights: number[] = [];
  const surfaceBlocks = new Set<BlockId>();
  const surfaceCounts = new Map<BlockId, number>();
  let cliffEdges = 0;

  assertEqual(terrain.profile, "varied", "non-special generated seeds should use the varied terrain profile");

  for (let z = -160; z <= 160; z += 8) {
    for (let x = -160; x <= 160; x += 8) {
      const height = getTerrainHeight(x, z, terrain);
      const surfaceBlock = getTerrainSurfaceBlock(x, z, height, terrain);
      const eastHeight = getTerrainHeight(x + 8, z, terrain);
      const southHeight = getTerrainHeight(x, z + 8, terrain);
      heights.push(height);
      surfaceBlocks.add(surfaceBlock);
      surfaceCounts.set(surfaceBlock, (surfaceCounts.get(surfaceBlock) ?? 0) + 1);
      if (Math.abs(height - eastHeight) >= 6 || Math.abs(height - southHeight) >= 6) cliffEdges += 1;
    }
  }

  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const grassSurfaces = surfaceCounts.get(BLOCK.grass) ?? 0;
  const sandSurfaces = surfaceCounts.get(BLOCK.sand) ?? 0;

  assert(minHeight >= 2, "varied terrain should leave a solid lower bound above the world floor");
  assert(maxHeight <= WORLD_HEIGHT - 6, "varied terrain should leave air above the tallest generated land");
  assert(
    maxHeight - minHeight >= 26,
    `varied terrain should have mountain-scale range beyond endless rolling hills, got ${maxHeight - minHeight}`
  );
  assert(cliffEdges > 0, "varied terrain should include cliff-like slope breaks");
  assert(surfaceBlocks.has(BLOCK.grass), "varied terrain should still produce grassy playable ground");
  assert(surfaceBlocks.has(BLOCK.sand), "varied terrain should create sandy lowlands or washes");
  assert(surfaceBlocks.has(BLOCK.stone), "varied terrain should expose rocky highland surfaces");
  assert(grassSurfaces > sandSurfaces, "varied terrain should not let sandy washes dominate the common surface");
});

test("floating-islands terrain creates spawn-safe islands with real void below", () => {
  const terrain = createTerrainContext("skyland-test", "floating-islands");
  const chunk = generateChunkBlocks(0, 0, terrain);
  const at = (x: number, y: number, z: number): number => chunk[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)];
  const spawnColumnX = 2;
  const spawnColumnZ = 2;
  const spawnTop = getTerrainHeight(spawnColumnX, spawnColumnZ, terrain);
  let firstSolidY = -1;
  let solidCount = 0;
  let sampledVoidColumns = 0;
  let sampledSolidColumns = 0;
  let maxSampledSolidCount = 0;
  let minSampledSolidCount = WORLD_HEIGHT;
  let sampledMossBlocks = 0;

  for (let y = 0; y <= spawnTop; y += 1) {
    if (at(spawnColumnX, y, spawnColumnZ) === BLOCK.air) continue;
    if (firstSolidY < 0) firstSolidY = y;
    solidCount += 1;
  }

  for (let cz = -3; cz <= 3; cz += 1) {
    for (let cx = -3; cx <= 3; cx += 1) {
      const sampledChunk = generateChunkBlocks(cx, cz, terrain);
      const sampledAt = (x: number, y: number, z: number): number =>
        sampledChunk[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)];
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          let columnSolidCount = 0;
          for (let y = 0; y < WORLD_HEIGHT; y += 1) {
            const block = sampledAt(x, y, z);
            if (block === BLOCK.air) continue;
            columnSolidCount += 1;
            if (block === BLOCK.moss) sampledMossBlocks += 1;
          }
          if (columnSolidCount > 0) {
            sampledSolidColumns += 1;
            maxSampledSolidCount = Math.max(maxSampledSolidCount, columnSolidCount);
            minSampledSolidCount = Math.min(minSampledSolidCount, columnSolidCount);
          }
          else sampledVoidColumns += 1;
        }
      }
    }
  }

  assertEqual(terrain.profile, "floating-islands", "floating-islands context should preserve the requested profile");
  assert(spawnTop > 20 && spawnTop < WORLD_HEIGHT - 8, "floating-islands spawn island should sit in open air");
  assert(at(spawnColumnX, spawnTop, spawnColumnZ) !== BLOCK.air, "spawn column should have a playable island top");
  assert(firstSolidY > 1, "floating islands should leave true void below the landmass");
  assert(solidCount >= 3, "spawn island should have enough thickness to read as terrain");
  assert(sampledSolidColumns > 0, "floating-island worlds should generate actual land columns");
  assert(sampledVoidColumns > 0, "floating-island worlds should contain open void columns between landmasses");
  assert(maxSampledSolidCount >= 18, "floating islands should include thick central bellies instead of only slabs");
  assert(minSampledSolidCount <= 6, "floating islands should taper to thin ragged rims at their edges");
  assert(sampledMossBlocks > 0, "floating-island crowns should use the darker moss surface material");
  assertEqual(at(spawnColumnX, spawnTop + 1, spawnColumnZ), BLOCK.air, "space above a floating island should stay open");
});

test("expanded world height gives varied terrain more vertical room", () => {
  const terrain = createTerrainContext("expanded-height-test", "varied");
  const heights: number[] = [];

  for (let z = -192; z <= 192; z += 12) {
    for (let x = -192; x <= 192; x += 12) {
      heights.push(getTerrainHeight(x, z, terrain));
    }
  }

  assertEqual(WORLD_HEIGHT, LEGACY_WORLD_HEIGHT * 2, "world height should be doubled from the old 48m limit");
  assert(
    Math.min(...heights) >= EXPANDED_TERRAIN_SURFACE_OFFSET,
    "expanded varied terrain should keep enough material below ordinary surfaces for deeper underground play"
  );
  assert(
    Math.max(...heights) > LEGACY_WORLD_HEIGHT,
    "expanded varied terrain should use the upper half of the taller world instead of leaving it as empty sky"
  );
  assert(
    Math.max(...heights) <= WORLD_HEIGHT - 6,
    "expanded varied terrain should still leave buildable headroom above the tallest generated land"
  );
});

test("varied terrain decorates deterministic voxel trees", () => {
  const terrain = createTerrainContext("tree-test-forest", "varied");
  let woodBlocks = 0;
  let leafBlocks = 0;

  for (let cz = -4; cz <= 4; cz += 1) {
    for (let cx = -4; cx <= 4; cx += 1) {
      const chunk = generateChunkBlocks(cx, cz, terrain);
      woodBlocks += countBlockInPayload(chunk, BLOCK.wood);
      leafBlocks += countBlockInPayload(chunk, BLOCK.leaves);
    }
  }

  const firstChunk = generateChunkBlocks(0, 0, terrain);
  const repeatedChunk = generateChunkBlocks(0, 0, terrain);
  const classicChunk = generateChunkBlocks(0, 0, createTerrainContext("tree-test-forest", "classic"));
  const superflatChunk = generateChunkBlocks(0, 0, createTerrainContext(SUPERFLAT_WORLD_SEED));

  assert(woodBlocks > 0, "varied terrain should generate tree trunks somewhere in the sampled world");
  assert(leafBlocks > woodBlocks, "varied terrain trees should produce leafy canopies around trunks");
  assertUint8ArraysEqual(firstChunk, repeatedChunk, "tree placement should be deterministic for the same seed/profile");
  assertEqual(countBlockInPayload(classicChunk, BLOCK.wood), 0, "classic terrain should not backfill trees into old saves");
  assertEqual(countBlockInPayload(classicChunk, BLOCK.leaves), 0, "classic terrain should not backfill leaves into old saves");
  assertEqual(countBlockInPayload(superflatChunk, BLOCK.wood), 0, "superflat labs should stay clear of generated trees");
  assertEqual(countBlockInPayload(superflatChunk, BLOCK.leaves), 0, "superflat labs should stay clear of generated leaves");
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
  assert(CODEX_PILOT_PLAY_SCRIPTS.includes("debris-grounding"), "pilot script list should include the debris visual repro");
  assert(CODEX_PILOT_PLAY_SCRIPTS.includes("preview-parity"), "pilot script list should include the aim-preview parity run");
  assert(CODEX_PILOT_PLAY_SCRIPTS.includes("debris-pressure"), "pilot script list should include the debris pressure run");
  assert(CODEX_PILOT_PLAY_SCRIPTS.includes("partial-seam-carve"), "pilot script list should include the partial seam carve run");
  assertEqual(
    normalizeCodexPilotPlayScriptId("preview-parity"),
    "preview-parity",
    "pilot script normalizer should accept the preview parity review run"
  );
  assertEqual(
    normalizeCodexPilotPlayScriptId("hitscan-tunnel"),
    "hitscan-tunnel",
    "pilot script normalizer should accept scripted visual review runs"
  );
  assertEqual(
    normalizeCodexPilotPlayScriptId("bad idea"),
    "wall-range",
    "unknown pilot scripts should fall back to the baseline range"
  );
});

test("visual test scenarios expose stable scripted review catalog", () => {
  const scenarios = listVisualTestScenarios();
  const ids = scenarios.map((scenario) => scenario.id);
  assert(ids.includes("preview-parity"), "visual scenario catalog should include the aim-preview parity repro");
  assert(ids.includes("debris-pressure"), "visual scenario catalog should include the debris pressure repro");
  assert(ids.includes("partial-seam-carve"), "visual scenario catalog should include the seam-carve repro");
  assert(ids.includes("debris-grounding"), "visual scenario catalog should include the debris grounding repro");
  assert(ids.includes("hitscan-tunnel"), "visual scenario catalog should include the hitscan tunnel repro");
  assert(ids.includes("builder-fixture"), "visual scenario catalog should include a builder/admin fixture shot");

  const previewScenario = getVisualTestScenario("aim-preview");
  assertEqual(previewScenario.id, "preview-parity", "preview aliases should resolve to the parity scenario");
  assertEqual(previewScenario.pilotScript, "preview-parity", "preview scenario should route to its matching pilot script");
  assertEqual(
    previewScenario.defaultOptions.label,
    "scenario-preview-parity",
    "preview scenario defaults should carry a review-friendly label"
  );

  const pressureScenario = getVisualTestScenario("debris-stress");
  assertEqual(pressureScenario.id, "debris-pressure", "pressure aliases should resolve to the debris pressure scenario");
  assertEqual(pressureScenario.pilotScript, "debris-pressure", "pressure scenario should route to its matching pilot script");
  assert(
    (pressureScenario.defaultOptions.maxSeconds ?? 0) > (getVisualTestScenario("debris").defaultOptions.maxSeconds ?? 0),
    "pressure review should reserve more time than the smaller debris grounding repro"
  );

  const seamScenario = getVisualTestScenario("corner-carve");
  assertEqual(seamScenario.id, "partial-seam-carve", "seam aliases should resolve to the partial seam carve scenario");
  assertEqual(seamScenario.pilotScript, "partial-seam-carve", "seam scenario should route to its matching pilot script");
  assert(seamScenario.tags.includes("partial-blocks"), "seam scenario should advertise the partial-block system it protects");

  const debrisScenario = getVisualTestScenario("debris");
  assertEqual(debrisScenario.id, "debris-grounding", "scenario aliases should resolve to the canonical id");
  assertEqual(debrisScenario.pilotScript, "debris-grounding", "scenario should route to its matching pilot script");
  assertEqual(
    debrisScenario.defaultOptions.label,
    "scenario-debris-grounding",
    "scenario defaults should carry a review-friendly label"
  );
  assert(
    (debrisScenario.defaultOptions.maxSeconds ?? 0) >= 20,
    "debris review should reserve enough recording time for impacts and settling"
  );

  assertEqual(
    normalizeVisualTestScenarioId("drill"),
    "hitscan-tunnel",
    "tunnel aliases should normalize for quick console calls"
  );
  assertEqual(
    normalizeVisualTestScenarioId("mystery-run"),
    "debris-grounding",
    "unknown scenarios should default to the debris review instead of silently doing nothing"
  );
});

test("visual test recorder normalizes capture options safely", () => {
  const recorderOptions = normalizeVisualTestRecorderOptions({
    label: " Debris Clip Repro!!! ",
    fps: 500,
    frameSampleFps: -4,
    maxSeconds: 999,
    metadata: { purpose: "motion review" }
  });

  assertEqual(recorderOptions.label, "debris-clip-repro", "visual test labels should become filesystem-safe tokens");
  assertEqual(recorderOptions.fps, 60, "visual recording FPS should clamp to a sane browser capture ceiling");
  assertEqual(recorderOptions.frameSampleFps, 0, "negative frame sampling should clamp off instead of scheduling nonsense");
  assertEqual(recorderOptions.maxSeconds, 120, "visual recordings should keep a max-duration safety stop");
  assertDeepEqual(recorderOptions.metadata, { purpose: "motion review" }, "visual recorder metadata should survive normalization");

  const pilotOptions = normalizeVisualPilotRecordOptions({
    label: "",
    fps: 1,
    frameSampleFps: 10,
    maxSeconds: -1,
    settleMs: 50000
  });
  assertEqual(pilotOptions.label, "visual-test", "empty visual labels should fall back to a stable name");
  assertEqual(pilotOptions.fps, 5, "visual recording FPS should keep a useful lower bound");
  assertEqual(pilotOptions.frameSampleFps, 4, "frame samples should cap before screenshots become the performance bug");
  assertEqual(pilotOptions.maxSeconds, 1, "maxSeconds should keep a one-second lower bound");
  assertEqual(pilotOptions.settleMs, 10000, "pilot recordings should clamp post-run settle time");
});

test("visual test scenario hitch summaries stay compact for manifests", () => {
  const records: PerformanceHitchRecord[] = [];
  for (let index = 0; index < VISUAL_TEST_SCENARIO_SNAPSHOT_MAX_HITCHES + 2; index += 1) {
    records.push(createPerformanceHitchRecord(index, 1000 + index, {
      kind: index % 2 === 0 ? "frame-hitch" : "low-fps",
      frameMs: 47.123 + index,
      observedFps: 48.456 - index,
      timings: {
        ...createEmptyFrameTimings(),
        physicsMs: 35 + index,
        frameMs: 47.123 + index
      },
      stats: createTestHitchStats({
        fragmentRender: {
          batches: 2,
          instances: 100 + index,
          capacity: 128
        }
      })
    }));
  }

  const summaries = summarizeVisualTestScenarioHitches(records);
  assertEqual(
    summaries.length,
    VISUAL_TEST_SCENARIO_SNAPSHOT_MAX_HITCHES,
    "scenario manifests should keep only the latest compact hitch summaries"
  );
  assertEqual(summaries[0]?.id, 2, "summary trimming should keep the newest records");
  assertEqual(summaries[summaries.length - 1]?.id, records.length - 1, "summary trimming should include the latest record");
  assertEqual(
    summaries[summaries.length - 1]?.frameMs,
    56.12,
    "manifest hitch frame times should be rounded for compact JSON"
  );
  assert(!("stats" in (summaries[0] ?? {})), "manifest hitch summaries should omit heavy nested stats");
  assertEqual(summarizeVisualTestScenarioHitches(records, 0).length, 0, "zero summary limit should return no hitches");
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

test("block texture tile mapping keeps material faces distinct", () => {
  const grassKey = createBlockMeshKey(BLOCK.grass, 2, 5, 7);
  const woodKey = createBlockMeshKey(BLOCK.wood, 2, 5, 7);
  const mossKey = createBlockMeshKey(BLOCK.moss, 2, 5, 7);

  assertEqual(
    getBlockTextureBaseTileId(grassKey, [0, 1, 0]),
    BLOCK_TEXTURE_TILE.grassTop,
    "grass tops should use their leafy texture tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(grassKey, [0, -1, 0]),
    BLOCK_TEXTURE_TILE.dirt,
    "grass undersides should read as dirt when exposed"
  );
  assertEqual(
    getBlockTextureBaseTileId(grassKey, [1, 0, 0]),
    BLOCK_TEXTURE_TILE.grassSide,
    "grass sides should use the dirt-and-grass edge tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(woodKey, [0, 1, 0]),
    BLOCK_TEXTURE_TILE.woodTop,
    "wood caps should use end-grain rings"
  );
  assertEqual(
    getBlockTextureBaseTileId(woodKey, [0, 0, 1]),
    BLOCK_TEXTURE_TILE.woodSide,
    "wood sides should use vertical grain"
  );
  assertEqual(
    getBlockTextureBaseTileId(createBlockMeshKey(BLOCK.leaves, 0, 0, 0), [0, 1, 0]),
    BLOCK_TEXTURE_TILE.leaves,
    "leaves should keep their own noisy leaf tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(mossKey, [0, 1, 0]),
    BLOCK_TEXTURE_TILE.mossTop,
    "moss tops should use their darker overgrowth tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(mossKey, [0, -1, 0]),
    BLOCK_TEXTURE_TILE.dirt,
    "moss undersides should still expose dirt when carved from below"
  );
  assertEqual(
    getBlockTextureBaseTileId(mossKey, [1, 0, 0]),
    BLOCK_TEXTURE_TILE.mossSide,
    "moss sides should use the moss-over-dirt edge tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(createBlockMeshKey(BLOCK.bush, 0, 0, 0), [0, 1, 0]),
    BLOCK_TEXTURE_TILE.bush,
    "bush voxels should use their own dark foliage tile"
  );
  assertEqual(
    getBlockTextureBaseTileId(createBlockMeshKey(BLOCK.lamp, 0, 0, 0), [0, 1, 0]),
    BLOCK_TEXTURE_TILE.lamp,
    "lamp voxels should use their warm emissive-looking tile"
  );
  assert(
    BLOCKS[BLOCK.leaves].color[1] < BLOCKS[BLOCK.grass].color[1],
    "leaf block color should stay darker than grass so trees do not wash out"
  );
});

test("world block shader damps specular through baked diffuse shade", () => {
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main() {\n#include <uv_vertex>\n#include <worldpos_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <map_fragment>\n#include <lights_fragment_end>\n#include <fog_fragment>\n}"
  } as Parameters<typeof applyWorldBlockShaderPatches>[0];

  applyWorldBlockShaderPatches(shader);

  assert(
    shader.fragmentShader.includes("diffuseColor *= sampledDiffuseColor;"),
    "block atlas sampling should still tint the diffuse terrain color"
  );
  assert(
    shader.fragmentShader.includes("voxelTextureDiffuseColor = sampledDiffuseColor.rgb;"),
    "block atlas sampling should preserve raw texture color for self-lit lamp faces"
  );
  assert(
    shader.fragmentShader.includes("blockTextureBaseTile * blockTextureVariantsPerBaseTile + blockTextureVariant"),
    "block atlas sampling should choose texture variants in the shader instead of splitting greedy faces"
  );
  assert(
    shader.fragmentShader.includes("floor(vMapUv)"),
    "shader texture variation should be derived from world-space meter cells"
  );
  assert(
    shader.fragmentShader.includes("voxelSealedLightMask"),
    "terrain shader should detect sealed baked-light faces"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, diffuseColor.rgb, voxelSealedLightMask);"),
    "sealed terrain faces should replace sky/hemisphere fill with their baked dark diffuse color"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.directDiffuse *= voxelSealedDirectLightScale;"),
    "sealed terrain faces should restore direct diffuse lamp light after the baked darkness clamp"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.directSpecular *= diffuseColor.rgb;"),
    "terrain direct specular should be damped by baked vertex and texture darkness"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.indirectSpecular *= diffuseColor.rgb;"),
    "terrain indirect specular should be damped by baked vertex and texture darkness"
  );
  assert(
    shader.vertexShader.includes("vVoxelWorldPosition = worldPosition.xyz;"),
    "terrain shader should pass world-space positions to the fragment fog path"
  );
  assert(
    shader.fragmentShader.includes("voxelHorizontalFogDistance"),
    "terrain fog should use horizontal world distance so the hard fog wall matches the radial chunk horizon"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, reflectedLight.indirectDiffuse * voxelOutdoorCycleScale, voxelOutdoorCycleMask);"),
    "day-night outdoor exposure should still tint sky and hemisphere fill"
  );
  assert(
    !shader.fragmentShader.includes("reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, reflectedLight.directDiffuse * voxelOutdoorCycleScale"),
    "day-night outdoor exposure should not crush direct local lamp spill in open rooms"
  );
  assert(
    shader.fragmentShader.includes("voxelLampTileMask"),
    "terrain shader should detect lamp tiles for material-level glow"
  );
  assert(
    shader.vertexShader.includes("attribute float blockLight;") &&
    shader.vertexShader.includes("varying float vBlockLight;"),
    "terrain shader should receive Lamp block light through a dedicated vertex attribute"
  );
  assert(
    shader.fragmentShader.includes("uniform vec2 voxelBlockLightLevelRange;") &&
      shader.fragmentShader.includes("float voxelClampedBlockLight = clamp(voxelRawBlockLight, voxelBlockLightMinLevel, voxelBlockLightMaxLevel);"),
    "terrain shader should clamp dedicated block-light values through the settings-controlled range"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.indirectDiffuse += voxelTextureDiffuseColor * voxelBlockLightColor"),
    "terrain shader should add warm Lamp block-light spill through a separate additive path"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(0.0), voxelLampTileMask);"),
    "lamp faces should opt out of camera-dependent point-light diffuse hot spots"
  );
  assert(
    shader.fragmentShader.includes("totalEmissiveRadiance = mix(totalEmissiveRadiance, voxelLampEmission, voxelLampTileMask);"),
    "lamp faces should replace lighting with warm material emission so every visible lamp block matches"
  );
  assert(
    !shader.fragmentShader.includes("smoothstep( fogNear, fogFar, vFogDepth )"),
    "terrain fog should not fall back to camera-depth fog that creates a rectangular horizon from high altitude"
  );
});

function createEmptyBlockLightChunkSnapshot(): Uint8Array {
  return new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
}

function createChunkMeshBlockLightBuffers(
  current: Uint8Array | null = null,
  neighbors: {
    readonly negativeX?: Uint8Array | null;
    readonly positiveX?: Uint8Array | null;
    readonly negativeZ?: Uint8Array | null;
    readonly positiveZ?: Uint8Array | null;
  } = {}
): {
  readonly current: ArrayBuffer | null;
  readonly neighbors: {
    readonly negativeX: ArrayBuffer | null;
    readonly positiveX: ArrayBuffer | null;
    readonly negativeZ: ArrayBuffer | null;
    readonly positiveZ: ArrayBuffer | null;
  };
} {
  return {
    current: current ? current.buffer.slice(0) : null,
    neighbors: {
      negativeX: neighbors.negativeX ? neighbors.negativeX.buffer.slice(0) : null,
      positiveX: neighbors.positiveX ? neighbors.positiveX.buffer.slice(0) : null,
      negativeZ: neighbors.negativeZ ? neighbors.negativeZ.buffer.slice(0) : null,
      positiveZ: neighbors.positiveZ ? neighbors.positiveZ.buffer.slice(0) : null
    }
  };
}

type TestPartialBlockVertexSample = {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly blockLight: number;
};

function getPartialBlockVertexSamples(
  geometry: ReturnType<typeof buildPartialBlockMeshGeometryData>
): readonly TestPartialBlockVertexSample[] {
  const samples: TestPartialBlockVertexSample[] = [];
  for (let vertexIndex = 0; vertexIndex < geometry.positions.length / 3; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    samples.push({
      position: [
        geometry.positions[offset] ?? 0,
        geometry.positions[offset + 1] ?? 0,
        geometry.positions[offset + 2] ?? 0
      ],
      normal: [
        geometry.normals[offset] ?? 0,
        geometry.normals[offset + 1] ?? 0,
        geometry.normals[offset + 2] ?? 0
      ],
      blockLight: geometry.blockLights[vertexIndex] ?? 0
    });
  }
  return samples;
}

async function drainWorldRenderWork(
  world: VoxelWorld,
  scene: THREE.Scene,
  material: THREE.Material,
  iterations = 12
): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    world.rebuildDirty(scene, material, 32);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function getMaxBlockLightAttribute(geometry: THREE.BufferGeometry): number {
  const attribute = geometry.getAttribute("blockLight");
  assert(attribute, "geometry should expose a blockLight attribute");
  let maxBlockLight = 0;
  for (let index = 0; index < attribute.count; index += 1) {
    maxBlockLight = Math.max(maxBlockLight, attribute.getX(index));
  }
  return maxBlockLight;
}

function updatePartialBlockMeshFieldFromWorld(
  world: VoxelWorld,
  field: PartialBlockMeshField,
  maxRegions = 64
): void {
  const updates = world.consumePartialBlockMeshRegionUpdates({ maxRegions });
  field.beginUpdate(world.getDirtyPartialBlockMeshRegionCount() + updates.length);

  for (const update of updates) {
    const faceVisibilityMasks = createPartialBlockFaceVisibilityMasks(
      update,
      (cell, normal) => world.shouldRenderPartialBlockFace(cell, normal)
    );
    const lightInput = world.snapshotPartialBlockMeshRegionBlockLightInput(update);

    // This mirrors the browser-side upload path without needing a DOM render
    // loop. The important contract is that partial meshes consume the same
    // cached block-light snapshots as normal chunk terrain.
    field.updateRegionGeometry(
      update.key,
      update.cells.length,
      buildPartialBlockMeshGeometryData({
        update,
        faceVisibilityMasks,
        blockLights: lightInput?.blockLights,
        blockLightChunkOrigin: lightInput?.blockLightChunkOrigin
      })
    );
  }

  field.setDirtyRegionCount(world.getDirtyPartialBlockMeshRegionCount());
}

function getBlockLightValuesForMeshNormal(
  result: ChunkMeshedResult,
  normal: readonly [number, number, number]
): number[] {
  const values: number[] = [];
  for (let vertexIndex = 0; vertexIndex < result.blockLights.length; vertexIndex += 1) {
    const normalIndex = vertexIndex * 3;
    if (
      result.normals[normalIndex] !== normal[0] ||
      result.normals[normalIndex + 1] !== normal[1] ||
      result.normals[normalIndex + 2] !== normal[2]
    ) {
      continue;
    }
    values.push(result.blockLights[vertexIndex] ?? 0);
  }
  return values;
}

test("voxel block light emits lamp sources and falls off through open air", () => {
  const blocks = createEmptyBlockLightChunkSnapshot();
  const lampIndex = getBlockLightIndex(4, 10, 4);
  blocks[lampIndex] = BLOCK.lamp;

  const result = buildChunkBlockLight({ blocks });

  assertEqual(getBlockLightEmission(BLOCK.lamp), BLOCK_LIGHT_MAX_LEVEL, "Lamp blocks should emit max block light");
  assertEqual(getBlockLightEmission(BLOCK.stone), 0, "non-light terrain should not emit block light");
  assertEqual(result.sourceCount, 1, "one lamp source should be discovered in the chunk snapshot");
  assertEqual(result.blockLight[lampIndex], 15, "the lamp cell should keep its source light level");
  assertEqual(result.blockLight[getBlockLightIndex(5, 10, 4)], 14, "adjacent cells should receive one-step falloff");
  assertEqual(result.blockLight[getBlockLightIndex(6, 10, 4)], 13, "two orthogonal steps should lose two levels");
  assertEqual(result.blockLight[getBlockLightIndex(5, 11, 4)], 13, "Manhattan falloff should include vertical steps");
  assert(result.litCellCount > 0, "open-air propagation should light at least the source cell");
  assert(result.maxQueueDepth > 0, "propagation should report queue pressure for diagnostics");
  assert(
    result.blockLight.every((level) => Number.isInteger(level) && level >= 0 && level <= BLOCK_LIGHT_MAX_LEVEL),
    "block-light output should stay in the 0..15 integer range"
  );
  assertEqual(normalizeBlockLightLevel(20.4), 15, "light normalization should clamp high inputs");
  assertEqual(normalizeBlockLightLevel(Number.NaN), 0, "light normalization should treat invalid inputs as darkness");
});

test("voxel block light treats terrain and partial cells as opaque", () => {
  const blocks = createEmptyBlockLightChunkSnapshot();
  const lampIndex = getBlockLightIndex(1, 12, 8);
  blocks[lampIndex] = BLOCK.lamp;

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      blocks[getBlockLightIndex(2, y, z)] = BLOCK.stone;
    }
  }

  const result = buildChunkBlockLight({ blocks });

  assert(isBlockLightOpaque(BLOCK.stone), "solid terrain should be opaque to block light");
  assert(!isBlockLightOpaque(BLOCK.air), "air should stay transparent to block light");
  assertEqual(result.blockLight[lampIndex], 15, "a lamp source should stay lit even though lamp blocks are solid");
  assertEqual(
    result.blockLight[getBlockLightIndex(3, 12, 8)],
    0,
    "a full solid wall should stop direct block-light propagation"
  );

  const partialBlocks = createEmptyBlockLightChunkSnapshot();
  const partialMask = createEmptyChunkBlockLight();
  partialBlocks[lampIndex] = BLOCK.lamp;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      partialBlocks[getBlockLightIndex(2, y, z)] = BLOCK.grass;
      partialMask[getBlockLightIndex(2, y, z)] = 1;
    }
  }

  const partialResult = buildChunkBlockLight({ blocks: partialBlocks, partialBlockMask: partialMask });
  assert(isBlockLightOpaque(BLOCK.grass, 1), "first-pass partial terrain should be opaque to block light");
  assertEqual(
    partialResult.blockLight[getBlockLightIndex(3, 12, 8)],
    0,
    "partial terrain masks should stop block-light propagation until sub-cell leakage is deliberately implemented"
  );
});

test("voxel block light reads neighbor halo sources across chunk borders", () => {
  const currentBlocks = createEmptyBlockLightChunkSnapshot();
  const westBlocks = createEmptyBlockLightChunkSnapshot();
  westBlocks[getBlockLightIndex(CHUNK_SIZE - 1, 9, 6)] = BLOCK.lamp;

  const result = buildChunkBlockLight({
    blocks: currentBlocks,
    neighbors: {
      [createBlockLightNeighborKey(-1, 0)]: westBlocks
    }
  });

  assertEqual(result.sourceCount, 1, "neighbor halo lamp should be discovered once");
  assertEqual(result.blockLight[getBlockLightIndex(0, 9, 6)], 14, "light should cross from the west neighbor into x=0");
  assertEqual(result.blockLight[getBlockLightIndex(1, 9, 6)], 13, "cross-border light should keep Manhattan falloff");
});

test("instanced debris shader adds cached voxel block light independently of PointLights", () => {
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <lights_fragment_end>\n}"
  } as Parameters<typeof applyPhysicsFragmentBlockLightShaderPatch>[0];

  applyPhysicsFragmentBlockLightShaderPatch(shader);

  assert(
    shader.vertexShader.includes("attribute float fragmentBlockLight;"),
    "debris batches should expose one cached block-light level per instance"
  );
  assert(
    shader.fragmentShader.includes("voxelFragmentLightCurve = voxelFragmentLight * voxelFragmentLight"),
    "debris should use the same squared 0..15 Lamp falloff curve as terrain"
  );
  assert(
    shader.fragmentShader.includes("reflectedLight.indirectDiffuse += diffuseColor.rgb * voxelFragmentLightColor"),
    "debris Lamp spill should be additive so ordinary scene and PointLights remain intact"
  );
});

test("mesh-time block light samples only one exact cardinal halo cell", () => {
  const currentLight = createEmptyBlockLightChunkSnapshot();
  const westLight = createEmptyBlockLightChunkSnapshot();
  westLight[getBlockLightIndex(CHUNK_SIZE - 1, 9, 6)] = 12;
  const blockLights = readChunkBlockLightBuffers(
    createChunkMeshBlockLightBuffers(currentLight, { negativeX: westLight })
  );

  assertEqual(getBlockLightAt(blockLights, -1, 9, 6), 12, "exact west halo reads should use the cloned neighbor buffer");
  assertEqual(getBlockLightAt(blockLights, -2, 9, 6), 0, "far west halo reads should fall back to darkness");
  assertEqual(getBlockLightAt(blockLights, -1, 9, -1), 0, "diagonal west/north halo reads should not smear edge light");
  assertEqual(
    getBlockLightAt(blockLights, -1, 9, CHUNK_SIZE),
    0,
    "diagonal west/south halo reads should not smear edge light"
  );
});

test("block-light build worker job matches the solver and transfers its buffer", () => {
  const blocks = createEmptyBlockLightChunkSnapshot();
  blocks[getBlockLightIndex(4, 8, 4)] = BLOCK.lamp;

  const result = buildBlockLightBuildJob({
    requestId: 44,
    cx: 2,
    cz: -1,
    revision: 7,
    blocks: blocks.buffer.slice(0),
    neighbors: {},
    partialBlockMask: null,
    neighborPartialBlockMasks: {}
  });
  const direct = buildChunkBlockLight({ blocks });
  const transfers = getBlockLightBuildJobTransfers(result);

  assertEqual(BLOCK_LIGHT_BUILD_JOB, "block-light:build", "block-light build job should use its dedicated worker type");
  assertEqual(result.type, BLOCK_LIGHT_BUILT_RESULT, "block-light build job should return a typed light result");
  assertEqual(result.requestId, 44, "block-light build job should preserve request id");
  assertEqual(result.revision, 7, "block-light build job should preserve chunk revision");
  assertUint8ArraysEqual(result.blockLight, direct.blockLight, "block-light worker job should match the direct solver");
  assertEqual(transfers.length, 1, "block-light job should transfer only the derived light buffer");
  assertEqual(transfers[0], result.blockLight.buffer, "block-light job should transfer the derived light ArrayBuffer");
});

test("voxel block light rebuilds without stale removed lamp data", () => {
  const blocks = createEmptyBlockLightChunkSnapshot();
  blocks[getBlockLightIndex(8, 8, 8)] = BLOCK.lamp;

  const lit = buildChunkBlockLight({ blocks });
  blocks[getBlockLightIndex(8, 8, 8)] = BLOCK.air;
  const dark = buildChunkBlockLight({ blocks });

  assert(lit.litCellCount > 0, "lamp snapshot should produce lit cells before removal");
  assertEqual(dark.sourceCount, 0, "removing the lamp should remove the source from a fresh build");
  assertEqual(dark.litCellCount, 0, "fresh builds should not preserve stale light after source removal");
  assert(dark.blockLight.every((level) => level === 0), "removed-source output should be all darkness");
});

test("voxel block light dirty bounds cover the full 15-block source radius", () => {
  const centered = getDirtyBlockLightChunkCoordsForEdit(CHUNK_SIZE, CHUNK_SIZE);
  assertDeepEqual(
    centered,
    [
      { cx: 0, cz: 0 },
      { cx: 1, cz: 0 },
      { cx: 0, cz: 1 },
      { cx: 1, cz: 1 }
    ],
    "an edit one block inside chunk 1,1 should dirty the four chunks touched by a 15-block radius"
  );

  const edge = getDirtyBlockLightChunkCoordsForEdit(0, 0);
  assertEqual(edge.length, 4, "an edit at world origin should touch the four chunks reached by a corner radius");
  assert(edge.some((coord) => coord.cx === -1 && coord.cz === -1), "negative neighbor chunk should be included");
  assert(edge.some((coord) => coord.cx === 0 && coord.cz === 0), "the owning corner chunk should be included");
  const midChunk = getDirtyBlockLightChunkCoordsForEdit(8, 8);
  assertEqual(midChunk.length, 9, "a mid-chunk edit should touch the full 3x3 dirty-light chunk square");
  assert(midChunk.some((coord) => coord.cx === 1 && coord.cz === 1), "positive neighbor chunk should be included");
  assertEqual(
    getDirtyBlockLightChunkCoordsForEdit(4, 4, BLOCK_LIGHT_RADIUS).length,
    9,
    "explicit default radius should match the exported block-light radius"
  );
});

test("Lamp removal clears rendered chunk block-light attributes", async () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "lamp-removal-render-light-test", workerPool });
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });

  world.setBlock(1, 80, 1, BLOCK.lamp);
  world.setBlock(3, 80, 1, BLOCK.stone);
  await drainWorldRenderWork(world, scene, material);

  const litChunk = world.getChunk(0, 0);
  assert(litChunk?.mesh, "rendered lamp-removal fixture should build a chunk mesh");
  assert(
    getMaxBlockLightAttribute(litChunk.mesh.geometry) >= 12,
    "stone terrain beside a Lamp should receive bright smoothed rendered block-light data"
  );
  assertEqual(
    world.getBlockLightLevel(2.5, 80.5, 1.5),
    14,
    "moving render proxies should read the accepted integer light level at their world cell"
  );

  world.setBlock(1, 80, 1, BLOCK.air);
  await drainWorldRenderWork(world, scene, material);

  const darkChunk = world.getChunk(0, 0);
  assert(darkChunk?.mesh, "chunk mesh should still exist after removing the Lamp source");
  assertEqual(
    getMaxBlockLightAttribute(darkChunk.mesh.geometry),
    0,
    "removing a Lamp should clear stale rendered block-light attributes"
  );
  assertEqual(
    world.getBlockLightLevel(2.5, 80.5, 1.5),
    0,
    "moving render proxies should not read stale cached Lamp light after source removal"
  );

  world.dispose(scene);
  workerPool.dispose();
  material.dispose();
});

test("stale block-light worker results do not overwrite newer chunk revisions", () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "stale-block-light-result-test", workerPool });
  world.setBlock(1, 80, 1, BLOCK.stone);
  const chunk = world.getChunk(0, 0);
  assert(chunk, "stale block-light test should create an owning chunk");
  const requestId = 512;
  const oldRevision = chunk.revision;
  const staleLight = createEmptyBlockLightChunkSnapshot();
  staleLight[getBlockLightIndex(1, 80, 1)] = 15;

  world.pendingBlockLightBuilds.set(requestId, {
    key: "0,0",
    revision: oldRevision,
    jobId: 999
  });
  world.pendingBlockLightKeys.add("0,0");
  chunk.revision += 1;
  world.workerResults.push({
    type: BLOCK_LIGHT_BUILT_RESULT,
    requestId,
    cx: 0,
    cz: 0,
    revision: oldRevision,
    blockLight: staleLight,
    sourceCount: 1,
    litCellCount: 1,
    maxQueueDepth: 1
  });

  world.processBlockLightResults(1);

  assertEqual(world.pendingBlockLightBuilds.has(requestId), false, "stale block-light requests should be retired");
  assertEqual(world.pendingBlockLightKeys.has("0,0"), false, "stale block-light keys should leave the pending set");
  assertEqual(
    world.snapshotChunkBlockLightBuffers(0, 0).current,
    null,
    "stale block-light buffers should not be cached for later chunk or partial mesh builds"
  );

  workerPool.dispose();
});

test("Lamp removal clears uploaded partial block-light attributes", async () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "partial-lamp-removal-render-light-test", workerPool });
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const field = new PartialBlockMeshField(scene, material);
  const partialPosition = { x: 3, y: 80, z: 1 };
  const regionKey = createPartialBlockMeshRegionKey(partialPosition);

  world.setBlock(1, 80, 1, BLOCK.lamp);
  world.setBlock(partialPosition.x, partialPosition.y, partialPosition.z, BLOCK.stone);
  const carveResult = world.carveBlock({
    x: partialPosition.x,
    y: partialPosition.y,
    z: partialPosition.z,
    point: new THREE.Vector3(partialPosition.x + 0.02, partialPosition.y + 0.5, partialPosition.z + 0.5),
    normal: new THREE.Vector3(-1, 0, 0),
    amount: PARTIAL_BLOCK_CORE_DAMAGE,
    speed: 18
  });
  assert(carveResult, "partial Lamp test setup should carve a damaged terrain cell");

  await drainWorldRenderWork(world, scene, material);
  updatePartialBlockMeshFieldFromWorld(world, field);

  const litRegion = field.getRegionMesh(regionKey);
  assert(litRegion, "partial Lamp test should upload the damaged terrain region");
  assert(
    getMaxBlockLightAttribute(litRegion.geometry) > 0,
    "uploaded partial terrain beside a Lamp should receive cached block-light values"
  );

  world.setBlock(1, 80, 1, BLOCK.air);
  await drainWorldRenderWork(world, scene, material);
  updatePartialBlockMeshFieldFromWorld(world, field);

  const darkRegion = field.getRegionMesh(regionKey);
  assert(darkRegion, "partial terrain region should still exist after removing the Lamp");
  assertEqual(
    getMaxBlockLightAttribute(darkRegion.geometry),
    0,
    "removing a Lamp should clear stale uploaded partial block-light values"
  );

  field.dispose();
  world.dispose(scene);
  workerPool.dispose();
  material.dispose();
});

test("cross-chunk Lamp light reaches rendered terrain through cached neighbor halos", async () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "cross-chunk-render-light-test", workerPool });
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });

  world.setBlock(CHUNK_SIZE - 1, 80, 1, BLOCK.lamp);
  world.setBlock(CHUNK_SIZE + 1, 80, 1, BLOCK.stone);
  await drainWorldRenderWork(world, scene, material);

  const eastChunk = world.getChunk(1, 0);
  assert(eastChunk?.mesh, "east neighbor chunk should build a mesh for the cross-chunk light test");
  assert(
    getMaxBlockLightAttribute(eastChunk.mesh.geometry) >= 12,
    "terrain in the east chunk should sample smoothed Lamp light propagated from the west chunk halo"
  );

  world.dispose(scene);
  workerPool.dispose();
  material.dispose();
});

test("cross-chunk Lamp light reaches uploaded partial block meshes", async () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "cross-chunk-partial-render-light-test", workerPool });
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const field = new PartialBlockMeshField(scene, material);
  const partialPosition = { x: CHUNK_SIZE + 1, y: 80, z: 1 };
  const regionKey = createPartialBlockMeshRegionKey(partialPosition);

  world.setBlock(CHUNK_SIZE - 1, 80, 1, BLOCK.lamp);
  world.setBlock(partialPosition.x, partialPosition.y, partialPosition.z, BLOCK.stone);
  const carveResult = world.carveBlock({
    x: partialPosition.x,
    y: partialPosition.y,
    z: partialPosition.z,
    point: new THREE.Vector3(partialPosition.x + 0.02, partialPosition.y + 0.5, partialPosition.z + 0.5),
    normal: new THREE.Vector3(-1, 0, 0),
    amount: PARTIAL_BLOCK_CORE_DAMAGE,
    speed: 18
  });
  assert(carveResult, "cross-chunk partial Lamp test setup should carve a damaged terrain cell");

  await drainWorldRenderWork(world, scene, material);
  updatePartialBlockMeshFieldFromWorld(world, field);

  const litRegion = field.getRegionMesh(regionKey);
  assert(litRegion, "cross-chunk partial Lamp test should upload the damaged terrain region");
  assert(
    getMaxBlockLightAttribute(litRegion.geometry) > 0,
    "uploaded partial terrain should sample cached Lamp light from the cardinal neighbor chunk"
  );

  field.dispose();
  world.dispose(scene);
  workerPool.dispose();
  material.dispose();
});

test("lamp blocks register as local light sources", () => {
  const lampDefinition = getLocalLightDefinition(BLOCK.lamp);
  const selections = selectNearestLocalLightSources(
    [
      { x: 10, y: 4, z: 0, block: BLOCK.lamp },
      { x: 2, y: 4, z: 0, block: BLOCK.lamp },
      { x: 200, y: 4, z: 0, block: BLOCK.lamp }
    ],
    { x: 0, y: 4.5, z: 0 },
    32
  );

  assert(PLACEABLE_BLOCKS.includes(BLOCK.lamp), "lamp should be available from the block loadout");
  assert(isLocalLightBlock(BLOCK.lamp), "lamp should be recognized by the local-light registry");
  assert(lampDefinition !== null, "lamp should have a renderer light definition");
  assertEqual(lampDefinition?.block, BLOCK.lamp, "lamp light definition should point back to the lamp block id");
  assertEqual(selections.length, 2, "local-light selection should filter by radius");
  assertEqual(selections[0]?.x, 2, "local-light selection should prioritize the nearest lamp");
  assertEqual(selections[0]?.sourceCount, 1, "isolated lamp lights should remain single-source selections");
  assert(selections[0]?.distanceSq < selections[1]?.distanceSq, "local lights should be sorted nearest-first");
});

test("lamp fixtures emit from exposed surfaces instead of buried centers", () => {
  const world = new VoxelWorld({ seed: "lamp-surface-emitter-test" });
  const baseY = 80;

  for (let y = baseY - 1; y <= baseY + 3; y += 1) {
    for (let z = -1; z <= 3; z += 1) {
      for (let x = -1; x <= 3; x += 1) {
        world.setBlock(x, y, z, BLOCK.air);
      }
    }
  }

  for (let y = baseY; y < baseY + 3; y += 1) {
    for (let z = 0; z < 3; z += 1) {
      for (let x = 0; x < 3; x += 1) {
        world.setBlock(x, y, z, BLOCK.lamp);
      }
    }
  }

  const selections = world.getLocalLightSources({ x: 1.5, y: baseY + 1.5, z: -4 }, 64);
  assert(selections.length > 1, "large lamp fixtures should expose multiple surface emitters");
  assert(
    selections.some((selection) => selection.centerZ < 0),
    "front surface lamps should emit just outside the visible face instead of from the buried block center"
  );
  assert(
    !selections.some((selection) => selection.x === 1 && selection.y === baseY + 1 && selection.z === 1),
    "fully buried lamp filler should not create a local light source"
  );
});

test("local light selection keeps every nearby lamp source inside the radius", () => {
  const selections = selectNearestLocalLightSources(
    Array.from({ length: 12 }, (_, index) => ({
      x: index * 2,
      y: 4,
      z: 0,
      block: BLOCK.lamp
    })),
    { x: 0, y: 4.5, z: 0 },
    64
  );

  assertEqual(selections.length, 12, "nearby lamps should not be sliced by a hidden quality budget");
  assert(selections.every((selection) => selection.sourceCount === 1), "separated lamps should stay independent");
});

test("local light renderer keeps fixed point-light proxies while overflow lamps stay emissive-only", () => {
  const scene = new THREE.Scene();
  const renderer = new LocalLightRenderer(scene);
  const overflowSourceCount = LOCAL_LIGHT_POINT_PROXY_CAPACITY + 8;
  const sources = selectNearestLocalLightSources(
    Array.from({ length: overflowSourceCount }, (_, index) => ({
      x: (index % 17) * 2,
      y: 8,
      z: Math.floor(index / 17) * 2,
      block: BLOCK.lamp
    })),
    { x: 16, y: 8.5, z: 8 },
    64
  );

  renderer.update(sources, QUALITY_PRESETS.normal);
  const pointLights = scene.children.filter((child): child is THREE.PointLight => child instanceof THREE.PointLight);
  const initialStats = renderer.getStats();
  assertEqual(pointLights.length, LOCAL_LIGHT_POINT_PROXY_CAPACITY, "renderer should keep a fixed point-light proxy pool");
  assertEqual(pointLights.filter((light) => light.visible).length, pointLights.length, "pooled lights stay visible to avoid shader-count churn");
  assertEqual(
    pointLights.filter((light) => light.intensity > 0).length,
    LOCAL_LIGHT_POINT_PROXY_CAPACITY,
    "only proxy-backed nearest lamps should create real PointLight spill"
  );
  assertEqual(initialStats.sourceCount, sources.length, "renderer stats should report every selected lamp source");
  assertEqual(initialStats.activePointLights, LOCAL_LIGHT_POINT_PROXY_CAPACITY, "stats should report the active proxy count");
  assertEqual(
    initialStats.emissiveOnlySources,
    overflowSourceCount - LOCAL_LIGHT_POINT_PROXY_CAPACITY,
    "overflow lamps should be reported as emissive-only instead of disappearing"
  );
  assertEqual(
    pointLights.filter((light) => light.castShadow).length,
    0,
    "local lamp shadows stay disabled until emitter volumes can be excluded from their own shadow maps"
  );

  renderer.update(sources.slice(0, 2), QUALITY_PRESETS.normal);
  const reducedStats = renderer.getStats();
  assertEqual(pointLights.length, LOCAL_LIGHT_POINT_PROXY_CAPACITY, "the fixed pool should not shrink and force another point-light shader variant");
  assertEqual(
    pointLights.filter((light) => light.intensity > 0).length,
    2,
    "unused high-water pool slots should remain zero-intensity placeholders"
  );
  assertEqual(reducedStats.emissiveOnlySources, 0, "all remaining lamps should fit in the proxy layer");
  assertEqual(
    pointLights.filter((light) => light.castShadow).length,
    0,
    "disabled local lamp shadows should stay disabled after pool reuse"
  );

  renderer.dispose();
  assertEqual(
    scene.children.filter((child) => child instanceof THREE.PointLight).length,
    0,
    "disposing the renderer should remove pooled local lights from the scene"
  );
});

test("local light renderer gives dense visible lamp fields real spill below the lifted cap", () => {
  const scene = new THREE.Scene();
  const renderer = new LocalLightRenderer(scene);
  const denseLampCount = 72;
  const sources = selectNearestLocalLightSources(
    Array.from({ length: denseLampCount }, (_, index) => ({
      x: (index % 9) * 2,
      y: 8,
      z: Math.floor(index / 9) * 2,
      block: BLOCK.lamp
    })),
    { x: 8, y: 8.5, z: 7 },
    64
  );

  renderer.update(sources, QUALITY_PRESETS.superUltra);

  const pointLights = scene.children.filter((child): child is THREE.PointLight => child instanceof THREE.PointLight);
  const stats = renderer.getStats();
  assertEqual(sources.length, denseLampCount, "the dense lamp fixture should fit inside the local-light radius");
  assertEqual(stats.sourceCount, denseLampCount, "renderer stats should count every dense-fixture source");
  assertEqual(stats.activePointLights, denseLampCount, "every below-cap lamp source should get real point-light spill");
  assertEqual(stats.emissiveOnlySources, 0, "below-cap dense lamps should not be reduced to emissive-only glow");
  assertEqual(
    pointLights.filter((light) => light.intensity > 0).length,
    denseLampCount,
    "below-cap lamps should activate one warm spill proxy per selected source"
  );

  renderer.dispose();
});

test("block texture tile mapping varies repeated material surfaces", () => {
  const sampledTiles = new Set<number>();

  for (let x = 0; x < 24; x += 1) {
    sampledTiles.add(getBlockTextureTileId(createBlockMeshKey(BLOCK.grass, x, 4, 0), [0, 1, 0]));
  }

  assert(sampledTiles.size > 1, "nearby repeated grass tops should sample multiple atlas variants");
});

test("chunk greedy meshing ignores visual variants on flat terrain faces", () => {
  const chunk = new Chunk(0, 0);
  for (let x = 2; x < 8; x += 1) {
    for (let z = 3; z < 9; z += 1) {
      chunk.setLocal(x, 0, z, BLOCK.stone);
    }
  }

  const meshWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      if (y < 0) return true;
      return chunk.getLocal(Math.floor(x), Math.floor(y), Math.floor(z)) !== BLOCK.air;
    },
    isRenderableSolid(x: number, y: number, z: number): boolean {
      return this.isSolid(x, y, z);
    }
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const mesh = chunk.rebuildMesh(meshWorld, material);
  const positions = mesh.geometry.getAttribute("position");
  const normals = mesh.geometry.getAttribute("normal");
  const colors = mesh.geometry.getAttribute("color");
  const expectedStoneTopColor = getMaterialBlockColor(BLOCK.stone, getLitBlockFaceShade(
    createLitBlockMeshKey(BLOCK.stone, SKY_EXPOSED_LIGHT_BUCKET),
    [0, 1, 0],
    getSunlitFaceShade([0, 1, 0])
  ));
  let topVertices = 0;
  let matchingTopColors = 0;

  for (let index = 0; index < normals.count; index += 1) {
    if (normals.getX(index) !== 0 || normals.getY(index) !== 1 || normals.getZ(index) !== 0) continue;
    if (positions.getY(index) !== 1) continue;
    topVertices += 1;
    if (
      Math.abs(colors.getX(index) - expectedStoneTopColor[0]) < 0.0001 &&
      Math.abs(colors.getY(index) - expectedStoneTopColor[1]) < 0.0001 &&
      Math.abs(colors.getZ(index) - expectedStoneTopColor[2]) < 0.0001
    ) {
      matchingTopColors += 1;
    }
  }

  assertEqual(
    topVertices,
    4,
    "one flat stone patch should emit one greedy top quad instead of T-junction-prone color-variant tiles"
  );
  assertEqual(
    matchingTopColors,
    4,
    "chunk vertex colors should use the material base tint while shader-side texture variants provide visual noise"
  );

  mesh.geometry.dispose();
  material.dispose();
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

test("player debug readout reports velocity in meters per second", () => {
  const diagonalVelocity = { x: 3, y: 4, z: 12 };

  assertEqual(
    getPlayerSpeedMetersPerSecond(diagonalVelocity),
    13,
    "player speed should use the full velocity magnitude for walk, jump, slide, and flight"
  );
  assertEqual(
    formatPlayerSpeedMetersPerSecond({ x: 1, y: 0, z: 0 }),
    "1.0 m/s",
    "debug speed readout should show one decimal place and metric units"
  );
  assertEqual(
    formatPlayerSpeedMetersPerSecond({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }),
    "0.0 m/s",
    "non-finite velocity samples should fail closed instead of putting nonsense in the HUD"
  );
  assertEqual(
    formatPlayerVelocityComponentsMetersPerSecond({ x: 1.25, y: -2.5, z: 0 }),
    "x 1.3 | y -2.5 | z 0.0 m/s",
    "debug velocity components should show signed axis values with the same metric precision"
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

test("rolling frame rate meter reports elapsed-time FPS instead of pretty instant averages", () => {
  const meter = new RollingFrameRateMeter(1);
  let sample = meter.push(0.005);
  for (let index = 0; index < 19; index += 1) {
    sample = meter.push(index % 2 === 0 ? 0.05 : 0.005);
  }

  const naiveInstantAverageFps = (10 * 200 + 10 * 20) / 20;
  assertNearlyEqual(
    sample.fps,
    20 / 0.55,
    "rolling FPS should be frames divided by elapsed window time"
  );
  assert(
    naiveInstantAverageFps > sample.fps * 2,
    "the old style of averaging instantaneous FPS would hide uneven frame pacing"
  );
  assert(
    sample.lowFps < sample.fps,
    "low FPS should expose the slow side of the frame window"
  );
});

test("worker pool clamps capacity and runs sync fallback jobs with revision guards", async () => {
  assertEqual(normalizeWorkerPoolSize(0), 1, "worker pool should always keep at least one fallback lane");
  assertEqual(normalizeWorkerPoolSize(99), 4, "worker pool should cap default browser worker pressure");
  assertEqual(getDefaultWorkerPoolSize(8), 4, "eight-core machines should reserve one core but clamp to four workers");
  assertEqual(getDefaultWorkerPoolSize(2), 1, "two-core machines should keep one worker lane");

  const pool = new WorkerPool({ maxWorkers: 1, getNow: () => 100 });
  const first = pool.enqueue({
    type: "double",
    payload: 3,
    run: (value: number) => value * 2
  });
  const second = pool.enqueue({
    type: "double",
    payload: 4,
    run: (value: number) => value * 2
  });
  assert(pool.cancel(second.id), "queued worker jobs should be cancelable before fallback execution starts");

  const firstResult = await first.promise;
  const secondResult = await second.promise;
  assertEqual(firstResult.status, "completed", "first queued job should complete normally");
  if (firstResult.status === "completed") {
    assertEqual(firstResult.result, 6, "sync fallback job should return its result");
  }
  assertEqual(secondResult.status, "canceled", "canceled queued job should resolve as canceled");

  const stale = await pool.enqueue({
    type: "revision",
    payload: 1,
    revision: 2,
    isRevisionStale: (revision) => revision < 3,
    run: (value: number) => value
  }).promise;
  assertEqual(stale.status, "stale", "stale revision results should be rejected before upload");

  const transferBuffer = new ArrayBuffer(8);
  const transferred = await pool.enqueue({
    type: "transfer",
    payload: 5,
    transfer: [transferBuffer],
    run: (value: number) => value
  }).promise;
  assertEqual(transferred.status, "completed", "jobs with transfer metadata should still run in sync fallback");

  pool.recordMainThreadUpload(5);
  pool.recordMainThreadUpload(15);
  const stats = pool.getStats();
  assertEqual(stats.mode, "sync-fallback", "v0.10.0 worker scaffold should report sync fallback mode");
  assertEqual(stats.maxWorkers, 1, "pool stats should report effective worker capacity");
  assertEqual(stats.completedJobs, 2, "pool should count completed non-stale jobs");
  assertEqual(stats.canceledJobs, 1, "pool should count canceled jobs");
  assertEqual(stats.staleJobs, 1, "pool should count stale revision rejections");
  assertEqual(stats.transferredBuffers, 1, "pool should count transferable buffers scheduled for jobs");
  assertEqual(stats.averageMainThreadUploadMs, 10, "pool should average main-thread upload timing samples");
});

test("worker pool dispatches jobs through browser workers when available", async () => {
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(message: unknown): void {
      const request = message as { readonly id: number; readonly type: string; readonly revision: number; readonly payload: number };
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            status: "completed",
            id: request.id,
            type: request.type,
            revision: request.revision,
            result: request.payload * 3,
            workerTimeMs: 7
          }
        } as MessageEvent);
      });
    }

    terminate(): void {
      // The fake worker has no native resources; the method exists so WorkerPool
      // can exercise the same lifecycle surface it uses for browser workers.
    }
  }

  const pool = new WorkerPool({
    maxWorkers: 1,
    createWorker: () => new FakeWorker() as unknown as Worker
  });

  const result = await pool.enqueue({
    type: "triple",
    payload: 4,
    revision: 2,
    run: (value: number) => value
  }).promise;

  assertEqual(result.status, "completed", "worker-backed jobs should resolve through the worker response path");
  if (result.status === "completed") {
    assertEqual(result.result, 12, "worker response should provide the completed job result");
  }

  const stats = pool.getStats();
  assertEqual(stats.mode, "web-worker", "pool should report web-worker mode when a worker factory succeeds");
  assertEqual(stats.completedJobs, 1, "worker-backed completion should update completion stats");
  assertEqual(stats.averageWorkerTimeMs, 7, "worker-backed completion should use worker-reported timing");
  pool.dispose();
  assertEqual(pool.getStats().mode, "sync-fallback", "disposed pools should not report live worker mode");
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
      physicsTiming: {
        ...createEmptyPhysicsTimingStats(),
        rigidDebrisStepMs: 18.5,
        framePhysicsMeasuredMs: 31
      },
      rigidDebris: {
        ...createEmptyRigidDebrisStats(),
        initialized: true,
        bodies: 120,
        sleepingBodies: 20,
        awakeBodies: 100,
        terrainColliders: 600,
        rubbleSupportColliders: 24,
        staticRefreshRan: true,
        staticRefreshReason: "dirty",
        candidateCellsScanned: 800,
        candidateCellsAccepted: 624,
        staticColliderCreatedThisFrame: 12,
        staticColliderRemovedThisFrame: 4
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
    record.details.some((detail) => detail.includes("rigid debris step 18.5ms")),
    "physics hitches should name the dominant measured physics subphase"
  );
  assertEqual(
    record.stats.physicsTiming.rigidDebrisStepMs,
    18.5,
    "hitch records should retain cloned physics subphase timings for later log parsing"
  );
  assert(
    formatPerformanceHitchRecord(record).includes("physics led"),
    "formatted hitch summaries should be readable from Nova Terminal"
  );

  const baseMeshStats = createTestHitchStats();
  const meshRecord = createPerformanceHitchRecord(2, 300, {
    frameMs: 48,
    timings: {
      playerMs: 1,
      chunkMs: 2,
      physicsMs: 5,
      meshMs: 34,
      minimapMs: 0.5,
      renderMs: 4,
      otherMs: 1.5,
      frameMs: 48
    },
    stats: {
      ...baseMeshStats,
      world: {
        ...baseMeshStats.world,
        damagedBlocks: 4,
        partialBlocks: 4,
        partialDamageBlocks: 3,
        partialRemovedSubvoxels: 21,
        partialRemainingSubvoxels: 60,
        partialTotalSubvoxels: 81
      },
      partialMesh: {
        cells: 4,
        vertices: 360,
        triangles: 180,
        regions: 2,
        dirtyRegions: 1,
        rebuiltRegions: 1,
        maxRegionTriangles: 120
      }
    }
  });
  assert(
    meshRecord.details.some((detail) => detail.includes("60/81 subvoxels")),
    "mesh hitches should include visible partial-lattice pressure"
  );
  assert(
    meshRecord.details.some((detail) => detail.includes("partial-mesh tris")),
    "mesh hitches should include custom partial mesh triangle pressure"
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

test("performance hitch diagnosis calls out RAF gaps and browser frame clues", () => {
  const timings = {
    playerMs: 1,
    chunkMs: 0.5,
    physicsMs: 0.8,
    meshMs: 0.3,
    minimapMs: 0.2,
    renderMs: 1.1,
    otherMs: 0.6,
    frameMs: 5
  };
  const diagnostics = createTestFrameDiagnostics({
    rafGapMs: 220,
    jsFrameMs: 5,
    measuredBucketTotalMs: 4.5,
    rafGapOverJsMs: 215,
    renderer: {
      calls: 42,
      triangles: 12000,
      points: 0,
      lines: 0,
      geometries: 18,
      textures: 4
    }
  });
  const pressuredLocalLights = {
    sourceCount: LOCAL_LIGHT_POINT_PROXY_CAPACITY + 6,
    activePointLights: LOCAL_LIGHT_POINT_PROXY_CAPACITY,
    pointLightCapacity: LOCAL_LIGHT_POINT_PROXY_CAPACITY,
    emissiveOnlySources: 6,
    shadowCastingPointLights: 0
  };
  const record = createPerformanceHitchRecord(7, 700, {
    kind: "low-fps",
    frameMs: 220,
    observedFps: 4.5,
    timings,
    diagnostics,
    stats: createTestHitchStats({
      localLights: pressuredLocalLights
    })
  });

  assert(
    record.details.some((detail) => detail.includes("RAF gap") && detail.includes("measured JS")),
    "large RAF gaps with tiny measured JS should be called out as browser/GPU/GC suspects"
  );
  assertEqual(record.diagnostics?.renderer.calls, 42, "hitch records should preserve renderer diagnostics");
  assert(
    formatPerformanceHitchRecord(record).includes("RAF gap"),
    "Nova-readable low-FPS summaries should still surface the missing-frame-time clue"
  );

  const renderRecord = createPerformanceHitchRecord(8, 800, {
    frameMs: 52,
    timings: {
      ...timings,
      renderMs: 40,
      frameMs: 52
    },
    diagnostics: createTestFrameDiagnostics({
      jsFrameMs: 52,
      measuredBucketTotalMs: 43.5,
      unaccountedFrameMs: 8.5,
      renderCallMs: 40,
      longTasks: {
        observerSupported: true,
        frameCount: 0,
        frameTotalMs: 0,
        frameMaxMs: 0,
        recentCount: 1,
        recentTotalMs: 96,
        recentMaxMs: 96
      },
      renderer: {
        calls: 1800,
        triangles: 920000,
        points: 0,
        lines: 0,
        geometries: 3200,
        textures: 6
      }
    }),
    stats: createTestHitchStats({
      localLights: pressuredLocalLights
    })
  });
  assert(
    renderRecord.details.some((detail) => detail.includes("1800 draw calls")),
    "render hitches should carry draw-call and triangle receipts"
  );
  assert(
    renderRecord.details[0]?.includes("1800 draw calls") ?? false,
    "render-led hitches should lead with current-frame renderer counters"
  );
  assert(
    renderRecord.details.some((detail) => detail.includes("seen recently")),
    "stale recent long-task context should remain available as supporting evidence"
  );
  assert(
    renderRecord.details.some((detail) =>
      detail.includes(`${LOCAL_LIGHT_POINT_PROXY_CAPACITY + 6} lamp sources`) &&
      detail.includes("emissive-only")
    ),
    "render hitches should explain when lamp sources exceed the fixed point-light proxy layer"
  );
  assertEqual(
    renderRecord.stats.localLights.emissiveOnlySources,
    6,
    "hitch snapshots should clone local light pressure stats"
  );
  assert(
    renderRecord.details.some((detail) => detail.includes("outside measured buckets")),
    "unaccounted JS-frame time should be visible in hitch details"
  );
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

test("performance hitch log samples sub-60 FPS at most once per second", () => {
  const timings = {
    playerMs: 2,
    chunkMs: 3,
    physicsMs: 8,
    meshMs: 4,
    minimapMs: 0.5,
    renderMs: 6,
    otherMs: 1,
    frameMs: 21
  };
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    let now = 100;
    const log = new PerformanceHitchLog({
      getNow: () => now,
      maxRecords: 5,
      sessionId: "low-fps-test"
    });

    const firstRecord = log.recordLowFpsSample({
      frameMs: timings.frameMs,
      observedFps: 55,
      timings,
      stats: createTestHitchStats()
    });
    assert(firstRecord, "the first sub-60 FPS frame should emit a low-FPS sample");
    assertEqual(firstRecord.kind, "low-fps", "low-FPS samples should be distinguishable from hard frame hitches");
    assert(
      firstRecord.summary.includes("55 fps low FPS sample"),
      "low-FPS sample summaries should name the observed FPS"
    );
    assert(
      formatPerformanceHitchRecord(firstRecord).includes("low FPS"),
      "Nova Terminal summaries should make low-FPS samples readable"
    );

    now += LOW_FPS_LOG_INTERVAL_MS - 1;
    const suppressedRecord = log.recordLowFpsSample({
      frameMs: timings.frameMs,
      observedFps: 54,
      timings,
      stats: createTestHitchStats()
    });
    assertEqual(suppressedRecord, null, "sub-60 FPS samples should not spam faster than once per second");

    now += 1;
    const secondRecord = log.recordLowFpsSample({
      frameMs: timings.frameMs,
      observedFps: 53,
      timings,
      stats: createTestHitchStats()
    });
    assert(secondRecord, "sustained sub-60 FPS should emit another sample after one second");

    now += LOW_FPS_LOG_INTERVAL_MS;
    const aboveThresholdRecord = log.recordLowFpsSample({
      frameMs: 15,
      observedFps: 60,
      timings: { ...timings, frameMs: 15 },
      stats: createTestHitchStats()
    });
    assertEqual(aboveThresholdRecord, null, "60 FPS and above should not create low-FPS diagnostics");
  } finally {
    console.warn = originalWarn;
  }
});

test("debris pressure governor lowers the rigid-body cap under loaded low FPS", () => {
  let state = createDebrisPerformancePressureState(768);

  for (let frame = 0; frame < 30; frame += 1) {
    state = updateDebrisPerformancePressureState(state, {
      deltaSeconds: 1 / 30,
      observedFps: 42,
      nominalRigidDebrisBodyBudget: 768,
      activeRigidDebrisBodies: 768,
      fragmentInstances: 768,
      partialMeshTriangles: 15000
    });
  }

  assert(state.stress > 0.5, "sustained overloaded low FPS should build meaningful debris pressure");
  assert(
    state.effectiveRigidDebrisBodyBudget < state.nominalRigidDebrisBodyBudget,
    "debris pressure should temporarily lower the effective rigid-body cap"
  );
  assert(
    state.effectiveRigidDebrisBodyBudget >= MIN_RIGID_DEBRIS_BODY_BUDGET,
    "pressure relief should never drop below the rigid-debris minimum"
  );
});

test("debris pressure governor recovers when frames are healthy again", () => {
  let state = createDebrisPerformancePressureState(512);

  for (let frame = 0; frame < 20; frame += 1) {
    state = updateDebrisPerformancePressureState(state, {
      deltaSeconds: 1 / 20,
      observedFps: 40,
      nominalRigidDebrisBodyBudget: 512,
      activeRigidDebrisBodies: 512,
      fragmentInstances: 512,
      partialMeshTriangles: 12000
    });
  }
  const stressedBudget = state.effectiveRigidDebrisBodyBudget;

  for (let frame = 0; frame < 160; frame += 1) {
    state = updateDebrisPerformancePressureState(state, {
      deltaSeconds: 1 / 60,
      observedFps: 75,
      nominalRigidDebrisBodyBudget: 512,
      activeRigidDebrisBodies: 80,
      fragmentInstances: 80,
      partialMeshTriangles: 2000
    });
  }

  assert(stressedBudget < 512, "the setup should enter pressure relief before recovery is tested");
  assertEqual(state.stress, 0, "healthy frames with light debris should fully recover pressure");
  assertEqual(
    state.effectiveRigidDebrisBodyBudget,
    512,
    "the healthy-frame ceiling should return to the nominal budget after recovery"
  );
});

test("debris pressure governor ignores low FPS when loose debris is not loaded", () => {
  let state = createDebrisPerformancePressureState(512);

  for (let frame = 0; frame < 90; frame += 1) {
    state = updateDebrisPerformancePressureState(state, {
      deltaSeconds: 1 / 30,
      observedFps: 30,
      nominalRigidDebrisBodyBudget: 512,
      activeRigidDebrisBodies: 0,
      fragmentInstances: 0,
      partialMeshTriangles: 20000
    });
  }

  assertEqual(state.stress, 0, "debris pressure should not blame empty debris systems for unrelated low FPS");
  assertEqual(state.effectiveRigidDebrisBodyBudget, 512, "the debris cap should stay untouched without debris load");
});

test("debris pressure effective cap bottoms out at the conservative budget ratio", () => {
  const nominalBudget = 768;
  const effectiveBudget = getDebrisPressureEffectiveRigidDebrisBodyBudget(nominalBudget, 1);
  const expectedMaximum = Math.floor(
    (nominalBudget * DEBRIS_PRESSURE_MIN_BUDGET_RATIO) / PHYSICS_OBJECT_BUDGET_STEP
  ) * PHYSICS_OBJECT_BUDGET_STEP;

  assertEqual(effectiveBudget, expectedMaximum, "full pressure should clamp to the conservative stepped ratio");
  assertEqual(
    getDebrisPressureEffectiveRigidDebrisBodyBudget(nominalBudget, 0),
    nominalBudget,
    "zero pressure should leave the user's configured debris cap alone"
  );
});

test("debris pressure can shed below the smallest normal slider step", () => {
  const pressuredSmallCap = getDebrisPressureEffectiveRigidDebrisBodyBudget(32, 1);

  assertEqual(
    pressuredSmallCap,
    MIN_RIGID_DEBRIS_BODY_BUDGET,
    "full pressure should use the emergency floor for tiny custom debris caps"
  );
  assert(
    pressuredSmallCap < 32,
    "a stressed 32-body cap should still have room to shed active Rapier debris"
  );
});

test("partial block mesh updates coalesce dense damage bursts", () => {
  assert(
    shouldDeferPartialBlockMeshUpdate({
      cellCount: 400,
      lastUpdateMs: 1000,
      nowMs: 1000 + PARTIAL_BLOCK_MESH_MIN_UPDATE_INTERVAL_MS - 1,
      hasRenderedMesh: true
    }),
    "dense partial terrain should defer immediate repeated regional mesh rebuilds"
  );
  assert(
    !shouldDeferPartialBlockMeshUpdate({
      cellCount: 400,
      lastUpdateMs: 1000,
      nowMs: 1000 + PARTIAL_BLOCK_MESH_MIN_UPDATE_INTERVAL_MS,
      hasRenderedMesh: true
    }),
    "the coalescing window should still allow periodic visual refreshes"
  );
  assert(
    !shouldDeferPartialBlockMeshUpdate({
      cellCount: 12,
      lastUpdateMs: 1000,
      nowMs: 1001,
      hasRenderedMesh: true
    }),
    "small edits should stay immediate so normal mining/building feels responsive"
  );
});

test("partial terrain separates visual dirtiness from chunk-mask dirtiness", () => {
  const world = new VoxelWorld({ seed: "partial-dirty-split-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const chunk = world.getChunk(0, 0);
  assert(chunk, "placing the fixture block should create its chunk");

  const revisionBeforeFirstCut = chunk.revision;
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2.05, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 20,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  assert(
    chunk.revision > revisionBeforeFirstCut,
    "the first partial cut should dirty the normal chunk mesh because the worker mask changed"
  );
  assert(world.hasUrgentPartialBlockMeshRegions(), "new partial cells should get an urgent visual rebuild lane");

  const mask = world.createPartialBlockMask(0, 0);
  assert(mask, "a chunk containing partial terrain should expose a sparse worker render mask");
  assertEqual(mask[2 + CHUNK_SIZE * (4 + CHUNK_SIZE * 3)], 1, "the worker mask should mark the carved macro voxel");

  world.consumePartialBlockMeshRegionUpdates({ maxRegions: 64 });
  const revisionBeforeSecondCut = chunk.revision;
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2.05, 3.55, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 20,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assertEqual(
    chunk.revision,
    revisionBeforeSecondCut,
    "repeated damage to an existing partial cell should not remesh the normal chunk"
  );
  assert(
    world.getDirtyPartialBlockMeshRegionCount() > 0,
    "repeated damage should still dirty only the regional custom partial mesh"
  );
});

test("partial terrain mesh region updates include halo context", () => {
  const world = new VoxelWorld({ seed: "partial-region-halo-test" });
  world.setBlock(3, 3, 3, BLOCK.stone);
  world.setBlock(4, 3, 3, BLOCK.stone);

  world.carveBlock({
    x: 3,
    y: 3,
    z: 3,
    point: new THREE.Vector3(3.95, 3.5, 3.5),
    normal: new THREE.Vector3(1, 0, 0),
    speed: 20,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  world.carveBlock({
    x: 4,
    y: 3,
    z: 3,
    point: new THREE.Vector3(4.05, 3.5, 3.5),
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 20,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  const updates = world.consumePartialBlockMeshRegionUpdates({ maxRegions: 64 });
  const boundaryUpdate = updates.find((update) =>
    update.cells.some((cell) => cell.position.x === 3) &&
    update.contextCells.some((cell) => cell.position.x === 4)
  );

  assert(
    boundaryUpdate,
    "dirty partial mesh regions should receive one-block halo cells for face visibility and stitching"
  );
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
  const blockOutline = highlighter.object.children[0] as THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;

  assert(!highlighter.object.visible, "target highlighter should start hidden");
  highlighter.showBlock({ x: 4, y: 12, z: -3 });
  assert(highlighter.object.visible, "target highlighter should become visible when a block is targeted");
  assertEqual(
    blockOutline.material.color.getHex(),
    0x050505,
    "terrain block targets should use the normal dark outline"
  );
  assertVectorNearlyEqual(
    blockOutline.position,
    new THREE.Vector3(4.5, 12.5, -2.5),
    "target highlighter should sit on the target block center"
  );

  highlighter.showBlock({ x: 1, y: 2, z: 3 }, "rubble");
  assertEqual(
    blockOutline.material.color.getHex(),
    0xffffff,
    "settled rubble targets should use the white object outline"
  );
  assertVectorNearlyEqual(
    blockOutline.position,
    new THREE.Vector3(1.5, 2.5, 3.5),
    "rubble target outlines should still occupy the full cube space"
  );

  highlighter.showSubCells([{ minX: 1, maxX: 4 / 3, minY: 2, maxY: 7 / 3, minZ: 3, maxZ: 10 / 3 }]);
  const subCellOutline = highlighter.object.children[1] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  assert(subCellOutline.visible, "Terraformer sub-cell highlights should use the sub-cell outline layer");
  assertEqual(
    subCellOutline.geometry.getAttribute("position").count,
    24,
    "one highlighted sub-cell should render twelve line segments"
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

test("world hides opaque-fog horizon chunks without unloading the stream window", () => {
  const world = new VoxelWorld({ seed: "render-horizon-test" });
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();

  world.streamChunksAround(0, 0, scene, 2, 3, 32);
  world.rebuildDirty(scene, material, 32);
  world.updateChunkRenderVisibility(0, 0, 1);

  const stats = world.getStats();
  assertEqual(stats.loadedChunks, 21, "render culling should keep the radial loaded horizon available for streaming");
  assertEqual(stats.frustumChunks, 21, "without a priority frustum, every loaded chunk should count as in-frustum");
  assertEqual(stats.renderedChunks, 9, "radius-one render visibility should draw the nearest 3x3 chunk window");
  assertEqual(stats.fogHiddenChunks, 12, "outer radial chunks should be hidden behind opaque fog");
  assertEqual(stats.visibleChunks, stats.frustumChunks, "legacy visible chunk stats should remain frustum-compatible");

  world.updateChunkRenderVisibility(0, 0, 2);
  const restoredStats = world.getStats();
  assertEqual(restoredStats.renderedChunks, 21, "approaching or widening the horizon should restore hidden chunk meshes");
  assertEqual(restoredStats.fogHiddenChunks, 0, "no chunks should remain fog-hidden inside the render radius");
});

test("world reuses queued chunk windows while player stays in the same chunk", () => {
  const world = new VoxelWorld({ seed: "stream-window-cache-test" });
  const scene = new THREE.Scene();
  const loadRadius = 3;
  const expectedCandidateChecks = 37;

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

  world.pendingSavedChunkWrites.set("0,0", {
    blocks: new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE),
    partialBlocks: []
  });
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
    world.pendingChunkLoads.set(requestId, { key, cx, cz: 0, jobId: requestId + 100 });
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

test("world buffers WorkerPool-generated chunks before frame-budgeted apply", async () => {
  const workerPool = new WorkerPool({ maxWorkers: 1, hardwareConcurrency: 2 });
  const world = new VoxelWorld({ seed: "worker-pool-stream-test", workerPool });

  world.chunkLoadQueue.set("0,0", { cx: 0, cz: 0 });
  assertEqual(world.requestQueuedChunkLoads(0, 0, 1), 1, "world should request one WorkerPool chunk load");
  assertEqual(world.getStats().loadedChunks, 0, "WorkerPool completion should not synchronously apply terrain");

  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEqual(world.workerResults.length, 1, "completed WorkerPool generation should wait in the world result buffer");

  world.processGeneratedChunkResults(1);
  assert(Boolean(world.getChunk(0, 0)), "buffered WorkerPool generation should apply through the normal result drain");

  const generateStats = workerPool.getStats().jobsByType.find((entry) => entry.type === CHUNK_GENERATE_JOB);
  assert(generateStats, "WorkerPool stats should track chunk generation jobs by type");
  assertEqual(generateStats.completedJobs, 1, "chunk generation job should complete through the shared pool");
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
  const savedSnapshots: SavedChunkSnapshot[] = [];
  const storage: ChunkStorage = {
    worldId: "coalesce-test",
    async listChunkKeys(): Promise<string[]> {
      return [];
    },
    async loadChunkSnapshot(): Promise<SavedChunkSnapshot | null> {
      return null;
    },
    async saveChunkSnapshot(_key: string, snapshot: SavedChunkSnapshot): Promise<void> {
      savedSnapshots.push({
        blocks: snapshot.blocks.slice(),
        partialBlocks: [...snapshot.partialBlocks]
      });
    },
    async loadChunk(): Promise<Uint8Array | null> {
      return null;
    },
    async saveChunk(_key: string, blocks: Uint8Array): Promise<void> {
      savedSnapshots.push({
        blocks: blocks.slice(),
        partialBlocks: []
      });
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
  assert(snapshot?.blocks instanceof Uint8Array, "flush should provide a concrete saved chunk snapshot");
  assertEqual(
    snapshot.blocks[1 + CHUNK_SIZE * (4 + CHUNK_SIZE * (WORLD_HEIGHT - 2))],
    BLOCK.sand,
    "coalesced save should contain the latest edit"
  );
  assertDeepEqual(snapshot.partialBlocks, [], "ordinary full-block edits should not invent partial cells");
});

test("chunk storage round-trips saved partial chunk snapshots", async () => {
  const database = createMemorySaveDatabase();
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const index = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  blocks[index(2, 3, 4)] = BLOCK.stone;

  const partialBlock = {
    block: BLOCK.stone,
    position: { x: 2, y: 3, z: 4 },
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      trajectory: { x: 1, y: 0, z: 0 },
      coreRadius: 0.25,
      exactRemovedVisualCellIndexes: [0, 13, 26],
      radius: 0.45,
      depth: 0.35,
      seed: 12345
    }],
    removedVisualCellIndexes: [0, 13, 26],
    surfaceSamples: [{ localX: 0.5, localZ: 0.5, height: 0.25, weight: 1 }],
    damage: 60,
    maxHealth: 1620
  };

  await database.saveChunkSnapshot("partial-storage-world", "0,0", {
    blocks,
    partialBlocks: [partialBlock]
  });

  const snapshot = await database.loadChunkSnapshot("partial-storage-world", "0,0");
  assert(snapshot, "saved chunk snapshots should load back from storage");
  assertEqual(snapshot.blocks[index(2, 3, 4)], BLOCK.stone, "snapshot should round-trip block bytes");
  assertEqual(snapshot.partialBlocks.length, 1, "snapshot should round-trip one partial terrain cell");
  assertDeepEqual(
    snapshot.partialBlocks[0]?.removedVisualCellIndexes ?? [],
    [0, 13, 26],
    "snapshot should preserve removed sub-cell indexes"
  );
  assertDeepEqual(
    snapshot.partialBlocks[0]?.cuts[0]?.exactRemovedVisualCellIndexes ?? [],
    [0, 13, 26],
    "snapshot should preserve deterministic Terraformer-style cuts"
  );
  assertEqual(
    snapshot.partialBlocks[0]?.surfaceSamples?.[0]?.height,
    0.25,
    "snapshot should preserve surface samples for rebuilt partial visuals"
  );
  assertEqual(snapshot.partialBlocks[0]?.damage, 60, "snapshot should preserve saved partial damage");
  assertEqual(snapshot.partialBlocks[0]?.maxHealth, 1620, "snapshot should preserve saved partial max health");

  const legacyBlocks = await database.loadChunk("partial-storage-world", "0,0");
  assert(legacyBlocks, "legacy block-only wrapper should still load the block bytes");
  assertEqual(
    legacyBlocks[index(2, 3, 4)],
    BLOCK.stone,
    "legacy block-only wrapper should ignore partial payloads without corrupting blocks"
  );
});

test("world restores carved partial blocks from saved chunk snapshots", async () => {
  const database = createMemorySaveDatabase();
  const worldId = "partial-persist-core-world";
  const storage = await createChunkStorage(worldId, database);
  const world = new VoxelWorld({ seed: "partial-persist-core", storage });
  const maskIndex = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);

  world.setBlock(2, 3, 4, BLOCK.stone);
  const firstHit = world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  const partialBefore = world.getPartialBlock(2, 3, 4);
  assert(firstHit && !firstHit.destroyed, "the setup core hit should create saved partial terrain");
  assert(partialBefore, "the setup core hit should leave a runtime partial cell");

  await world.flushStorageWrites();
  const storedSnapshot = await database.loadChunkSnapshot(worldId, "0,0");
  assertEqual(storedSnapshot?.partialBlocks.length, 1, "flushed storage should include the partial cell");

  const reloadedStorage = await createChunkStorage(worldId, database);
  const reloadedWorld = new VoxelWorld({ seed: "partial-persist-core", storage: reloadedStorage });
  await reloadedWorld.loadSavedChunkIndex();
  await reloadedWorld.loadSavedChunkNow("0,0");
  reloadedWorld.ensureChunk(0, 0);

  const partialAfter = reloadedWorld.getPartialBlock(2, 3, 4);
  assertEqual(reloadedWorld.getBlock(2, 3, 4), BLOCK.stone, "reloaded partial terrain keeps its block byte");
  assertEqual(
    reloadedWorld.getBlockDamage(2, 3, 4),
    firstHit.damageAfter,
    "reloaded partial terrain restores its shared block damage"
  );
  assert(partialAfter, "reloaded partial terrain should hydrate the partial cell");
  assertDeepEqual(
    partialAfter?.removedVisualCellIndexes ?? [],
    partialBefore.removedVisualCellIndexes ?? [],
    "reloaded partial terrain should preserve the removed presentation cells"
  );
  assertDeepEqual(
    partialAfter?.cuts ?? [],
    partialBefore.cuts,
    "reloaded partial terrain should preserve cut history for visual reconstruction"
  );
  assertEqual(
    reloadedWorld.createPartialBlockMask(0, 0)?.[maskIndex(2, 3, 4)],
    1,
    "reloaded partial terrain should suppress the normal full-cube mesh"
  );
});

test("world restores Terraformer exact sub-cell edits from saved chunk snapshots", async () => {
  const database = createMemorySaveDatabase();
  const worldId = "partial-persist-terraformer-world";
  const storage = await createChunkStorage(worldId, database);
  const world = new VoxelWorld({ seed: "partial-persist-terraformer", storage });
  const input = {
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 1
  };

  world.setBlock(2, 3, 4, BLOCK.stone);
  const preview = world.previewTerraformerEdit(input);
  const edit = world.applyTerraformerEdit(input);
  const removedIndex = preview?.cells[0]?.cellIndex;
  assert(edit, "the setup Terraformer edit should remove one exact sub-cell");
  assert(typeof removedIndex === "number", "the setup Terraformer preview should expose its sub-cell index");
  await world.flushStorageWrites();

  const reloadedStorage = await createChunkStorage(worldId, database);
  const reloadedWorld = new VoxelWorld({ seed: "partial-persist-terraformer", storage: reloadedStorage });
  await reloadedWorld.loadSavedChunkIndex();
  await reloadedWorld.loadSavedChunkNow("0,0");
  reloadedWorld.ensureChunk(0, 0);

  const partialAfter = reloadedWorld.getPartialBlock(2, 3, 4);
  assert(partialAfter, "Terraformer partial cells should hydrate after reload");
  assertDeepEqual(
    partialAfter?.removedVisualCellIndexes ?? [],
    [removedIndex],
    "Terraformer removed sub-cell indexes should survive reload exactly"
  );
  assertDeepEqual(
    partialAfter?.cuts[0]?.exactRemovedVisualCellIndexes ?? [],
    [removedIndex],
    "Terraformer exact-cut metadata should survive reload for deterministic reconstruction"
  );
  assertEqual(
    reloadedWorld.getBlockDamage(2, 3, 4),
    getTerraformerSubCellHealth(BLOCK.stone),
    "Terraformer reload should restore the shared terrain damage pool"
  );
});

test("world clears stale saved partial cells when a damaged block is destroyed", async () => {
  const database = createMemorySaveDatabase();
  const worldId = "partial-persist-destroyed-world";
  const storage = await createChunkStorage(worldId, database);
  const world = new VoxelWorld({ seed: "partial-persist-destroyed", storage });

  world.setBlock(2, 3, 4, BLOCK.grass);
  const result = world.applyTerraformerEdit({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 3
  });
  assert(result?.results[0]?.destroyed, "the setup Terraformer edit should fully clear the block");
  await world.flushStorageWrites();

  const storedSnapshot = await database.loadChunkSnapshot(worldId, "0,0");
  assertEqual(storedSnapshot?.partialBlocks.length, 0, "destroyed blocks should not leave stale saved partial cells");

  const reloadedStorage = await createChunkStorage(worldId, database);
  const reloadedWorld = new VoxelWorld({ seed: "partial-persist-destroyed", storage: reloadedStorage });
  await reloadedWorld.loadSavedChunkIndex();
  await reloadedWorld.loadSavedChunkNow("0,0");
  reloadedWorld.ensureChunk(0, 0);

  assertEqual(reloadedWorld.getBlock(2, 3, 4), BLOCK.air, "destroyed partial blocks should reload as air");
  assertEqual(reloadedWorld.getBlockDamage(2, 3, 4), 0, "destroyed partial blocks should reload with no damage");
  assertEqual(reloadedWorld.getPartialBlock(2, 3, 4), null, "destroyed partial blocks should reload with no partial cell");
  assertEqual(reloadedWorld.createPartialBlockMask(0, 0), null, "destroyed partial blocks should not leave a mask");
});

test("partial terrain edits coalesce into the existing pending chunk save", async () => {
  const savedSnapshots: SavedChunkSnapshot[] = [];
  const storage: ChunkStorage = {
    worldId: "partial-coalesce-test",
    async listChunkKeys(): Promise<string[]> {
      return [];
    },
    async loadChunkSnapshot(): Promise<SavedChunkSnapshot | null> {
      return null;
    },
    async saveChunkSnapshot(_key: string, snapshot: SavedChunkSnapshot): Promise<void> {
      savedSnapshots.push({
        blocks: snapshot.blocks.slice(),
        partialBlocks: [...snapshot.partialBlocks]
      });
    },
    async loadChunk(): Promise<Uint8Array | null> {
      return null;
    },
    async saveChunk(_key: string, blocks: Uint8Array): Promise<void> {
      savedSnapshots.push({
        blocks: blocks.slice(),
        partialBlocks: []
      });
    },
    async deleteChunk(): Promise<void> {}
  };
  const world = new VoxelWorld({ seed: "partial-save-coalesce-test", storage });
  world.setBlock(2, 3, 4, BLOCK.stone);

  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });
  world.carveBlock({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.55, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 18,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assertEqual(world.getStats().pendingChunkSaves, 1, "rapid partial edits should coalesce to one pending save");
  await world.flushStorageWrites();

  assertEqual(savedSnapshots.length, 1, "flushing partial edits should persist one coalesced snapshot");
  assertEqual(savedSnapshots[0]?.partialBlocks.length, 1, "the coalesced snapshot should contain the latest partial cell");
  assertEqual(
    savedSnapshots[0]?.partialBlocks[0]?.cuts.length,
    2,
    "the coalesced snapshot should contain the latest partial cut history"
  );
});

test("chunk storage expands legacy 48m chunk payloads without offset by default", async () => {
  const database = createMemorySaveDatabase();
  const legacyBlocks = new Uint8Array(CHUNK_SIZE * LEGACY_WORLD_HEIGHT * CHUNK_SIZE);
  const legacyIndex = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  const currentIndex = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);

  legacyBlocks[legacyIndex(2, 4, 3)] = BLOCK.wood;
  legacyBlocks[legacyIndex(5, LEGACY_WORLD_HEIGHT - 1, 6)] = BLOCK.ember;

  await database.saveChunk("legacy-height-world", "0,0", legacyBlocks);
  const loaded = await database.loadChunk("legacy-height-world", "0,0");

  assert(loaded, "legacy chunk payload should load instead of being discarded as corrupt");
  assertEqual(
    loaded.length,
    CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE,
    "legacy chunk payload should expand to the current world-height byte length"
  );
  assertEqual(
    loaded[currentIndex(2, 4, 3)],
    BLOCK.wood,
    "legacy low-elevation edits should keep their original world-space Y coordinate"
  );
  assertEqual(
    loaded[currentIndex(5, LEGACY_WORLD_HEIGHT - 1, 6)],
    BLOCK.ember,
    "legacy top-layer edits should survive at the old 48m ceiling"
  );
  assertEqual(
    loaded[currentIndex(5, WORLD_HEIGHT - 1, 6)],
    BLOCK.air,
    "new upper-half chunk space should start empty after legacy migration"
  );
});

test("varied saved-world storage lifts legacy 48m chunks to match expanded terrain", async () => {
  const database = createMemorySaveDatabase();
  const legacyBlocks = new Uint8Array(CHUNK_SIZE * LEGACY_WORLD_HEIGHT * CHUNK_SIZE);
  const legacyIndex = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  const currentIndex = (x: number, y: number, z: number): number => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  const legacyOffset = getLegacyWorldHeightOffset("varied");

  legacyBlocks[legacyIndex(2, 4, 3)] = BLOCK.wood;
  legacyBlocks[legacyIndex(5, LEGACY_WORLD_HEIGHT - 1, 6)] = BLOCK.ember;

  await database.saveChunk("legacy-varied-height-world", "0,0", legacyBlocks);
  const storage = await createChunkStorage("legacy-varied-height-world", database, {
    legacyHeightOffset: legacyOffset
  });
  const loaded = await storage.loadChunk("0,0");

  assert(loaded, "varied legacy chunk payload should load through the world storage adapter");
  assertEqual(
    loaded[currentIndex(2, 4 + legacyOffset, 3)],
    BLOCK.wood,
    "varied legacy chunk edits should lift by the same offset as regenerated terrain"
  );
  assertEqual(
    loaded[currentIndex(2, 4, 3)],
    BLOCK.air,
    "varied legacy chunk reads should not leave a duplicate copy at the old low elevation"
  );
  assertEqual(
    loaded[currentIndex(5, LEGACY_WORLD_HEIGHT - 1 + legacyOffset, 6)],
    BLOCK.ember,
    "the old legacy ceiling should map upward by the varied-world lift without claiming all new build headroom"
  );
  assertEqual(
    loaded[currentIndex(5, WORLD_HEIGHT - 1, 6)],
    BLOCK.air,
    "new build headroom above lifted legacy chunks should stay empty"
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

test("world registry stores terrain profile provenance", async () => {
  const database = createMemorySaveDatabase();
  const registry = await createWorldRegistry(database);
  const defaultWorld = await registry.getActiveWorld();
  const variedWorld = await registry.createWorld("Varied Terrain", "new-terrain-seed");
  const floatingWorld = await registry.createWorld("Sky Islands", "new-sky-seed", "floating-islands");
  const classicWorld = await registry.createWorld("Classic Terrain", "classic-terrain-seed", "classic");
  const superflatWorld = await registry.createWorld("Flat Lab", SUPERFLAT_WORLD_SEED);

  assertEqual(defaultWorld.terrainProfile, "classic", "the built-in default world should remain classic");
  assertEqual(variedWorld.terrainProfile, "varied", "new ordinary worlds should opt into varied terrain");
  assertEqual(floatingWorld.terrainProfile, "floating-islands", "explicit floating-island worlds should store their profile");
  assertEqual(classicWorld.terrainProfile, "classic", "explicit classic worlds should store their profile");
  assertEqual(superflatWorld.terrainProfile, "classic", "superflat lab worlds should stay on the classic test profile");
  assertEqual(getNewWorldTerrainProfile("fresh-seed"), "varied", "new seeded worlds should use varied terrain");
  assertEqual(
    getNewWorldTerrainProfile("fresh-seed", "floating-islands"),
    "floating-islands",
    "new worlds should honor explicit floating-island profile selection"
  );
  assertEqual(getNewWorldTerrainProfile(SUPERFLAT_WORLD_SEED), "classic", "superflat seed should keep the lab profile");
  assertEqual(
    getNewWorldTerrainProfile(SUPERFLAT_WORLD_SEED, "floating-islands"),
    "classic",
    "reserved superflat seed should keep the lab generator even if a profile is requested"
  );
  assertEqual(
    normalizeSavedTerrainProfile("floating-islands", "old-sky-seed", 1),
    "floating-islands",
    "saved floating-island worlds should normalize as first-class terrain profile metadata"
  );
  assertEqual(
    normalizeSavedTerrainProfile(undefined, "legacy-seed", 1),
    "classic",
    "older saved worlds without metadata should stay on the legacy terrain profile"
  );
  assertEqual(
    normalizeSavedTerrainProfile(undefined, "fresh-seed", Date.UTC(2026, 4, 25, 4, 32, 0)),
    "varied",
    "worlds created during the brief pre-metadata varied terrain window should stay varied"
  );
});

test("legacy varied-world player locations migrate into the expanded height band", () => {
  const legacyVariedWorld: SavedWorld = {
    id: "legacy-player-height",
    name: "Legacy Player Height",
    seed: "legacy-player-seed",
    terrainProfile: "varied",
    createdAt: 1,
    updatedAt: 2,
    playerState: {
      feetPosition: { x: 12, y: 18, z: -4 },
      yaw: 0.25,
      pitch: -0.125,
      savedAt: 3,
      worldHeight: LEGACY_WORLD_HEIGHT
    }
  };
  const migrated = migrateSavedPlayerStateHeight(legacyVariedWorld);

  assert(migrated, "legacy varied player state should still produce a playable spawn state");
  assertDeepEqual(
    migrated.feetPosition,
    { x: 12, y: 18 + EXPANDED_TERRAIN_SURFACE_OFFSET, z: -4 },
    "legacy varied player feet should lift by the same offset as legacy edited chunks"
  );
  assertEqual(migrated.yaw, 0.25, "height migration should preserve yaw");
  assertEqual(migrated.pitch, -0.125, "height migration should preserve pitch");

  const currentVariedWorld: SavedWorld = {
    ...legacyVariedWorld,
    playerState: {
      ...legacyVariedWorld.playerState,
      feetPosition: { x: 12, y: 58, z: -4 },
      worldHeight: WORLD_HEIGHT
    }
  };
  assertDeepEqual(
    migrateSavedPlayerStateHeight(currentVariedWorld)?.feetPosition,
    { x: 12, y: 58, z: -4 },
    "current-height varied player state should not be lifted a second time"
  );

  const legacyClassicWorld: SavedWorld = {
    ...legacyVariedWorld,
    terrainProfile: "classic"
  };
  assertDeepEqual(
    migrateSavedPlayerStateHeight(legacyClassicWorld)?.feetPosition,
    { x: 12, y: 18, z: -4 },
    "classic legacy player state should keep absolute world-space height"
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
  assertEqual(playerState.worldHeight, WORLD_HEIGHT, "saved location should record the current world height");
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

test("world registry stores day-night state with saved-world metadata", async () => {
  const database = createMemorySaveDatabase();
  const registry = await createWorldRegistry(database);
  const world = await registry.createWorld("Clock Test", "clock-seed");

  const written = await registry.updateDayNightState(world.id, createSavedDayNightState({
    timeOfDay: 0.73,
    cycleEnabled: false,
    cycleLengthSeconds: 900
  }, 12345));

  assert(written, "day-night save should update an existing world");
  assertEqual(written.dayNightState?.timeOfDay, 0.73, "saved world should expose the new time of day");
  assertEqual(written.dayNightState?.cycleEnabled, false, "saved world should expose the cycle toggle");
  assertEqual(written.dayNightState?.cycleLengthSeconds, 900, "saved world should expose the cycle length");
  assert((written.dayNightState?.savedAt ?? 0) > 0, "saved world should expose a write timestamp");

  const savedWorld = await registry.getActiveWorld();
  assertEqual(savedWorld.dayNightState?.timeOfDay, 0.73, "registry reads should retain saved world time");
  (savedWorld.dayNightState as { timeOfDay: number }).timeOfDay = 0.1;
  assertEqual(
    (await registry.getActiveWorld()).dayNightState?.timeOfDay,
    0.73,
    "registry reads should deep-clone day-night metadata"
  );
});

test("delete-world dialog copy names the save and warns about permanence", () => {
  const copy = createDeleteWorldDialogCopy({
    id: "world-copy-test",
    name: "Definitely Important",
    seed: "copy-seed",
    terrainProfile: "varied",
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

## 0.10.0.1 - 2026-05-09

### Fixed

- newest settings-only release

## 0.5.0 - 2026-05-07

### Added

- current stable release with \`code\`
`);

  assertDeepEqual(
    entries.map((entry) => entry.title),
    ["Unreleased", "0.10.0.1", "0.10.0", "0.5.0", "0.4.9"],
    "release notes should sort Unreleased first, then semantic and revision versions descending"
  );
  assertEqual(entries[3]?.date, "2026-05-07", "release dates should be parsed from headings");
  assert(
    entries[3]?.body.includes("current stable release"),
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
  const maxHealth = getTerrainMaxHealth(BLOCK.stone);
  assert(maxHealth >= 270, "ordinary terrain blocks should have room for sub-cell edit hits");

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
  const maxHealth = getTerrainMaxHealth(BLOCK.stone);

  assertEqual(
    PARTIAL_BLOCK_CORE_DAMAGE,
    TERRAIN_DAMAGE_SCALE,
    "terrain-core hits should spend one old material HP on the scaled terrain pool"
  );
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
  const firstRemovedVisualCellCount = world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes?.length ?? 0;
  const firstStats = world.getStats();
  assertEqual(firstStats.partialBlocks, 1, "debug stats should count active custom partial cells");
  assertEqual(firstStats.partialDamageBlocks, 1, "debug stats should separate damage-lattice cells from surface cells");
  assertEqual(firstStats.partialSurfaceBlocks, 0, "ordinary core damage should not count as a surface partial cell");
  assertEqual(
    firstStats.partialTotalSubvoxels,
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
    "one damaged block should expose one 3x3x3 lattice worth of debug capacity"
  );
  assertEqual(
    firstStats.partialRemovedSubvoxels,
    firstRemovedVisualCellCount,
    "debug stats should report how many presentation subvoxels have been cut away"
  );
  assertEqual(
    firstStats.partialRemainingSubvoxels,
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT - firstRemovedVisualCellCount,
    "debug stats should report how many presentation subvoxels are still visible"
  );
  assertEqual(
    firstHit.bitePoofPositions?.length,
    firstRemovedVisualCellCount,
    "the first carve should report one bite poof position for each newly destroyed presentation cell"
  );
  assertEqual(
    firstHit.damageApplied,
    PARTIAL_BLOCK_CORE_DAMAGE,
    "core carve results should expose applied damage for the combat log"
  );
  assertDeepEqual(
    firstHit.affectedVisualCellIndexes,
    world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [],
    "core carve results should expose the exact newly removed lattice cells for the combat log"
  );
  world.clearDamageForChunk(0, 0);
  assertEqual(
    world.getBlockDamage(2, 3, 4),
    PARTIAL_BLOCK_CORE_DAMAGE,
    "partial terrain should keep its scaled core damage while chunks stream out"
  );

  let finalHit = firstHit;
  for (let hit = PARTIAL_BLOCK_CORE_DAMAGE * 2; hit <= maxHealth; hit += PARTIAL_BLOCK_CORE_DAMAGE) {
    finalHit = world.carveBlock({
      x: 2,
      y: 3,
      z: 4,
      point: new THREE.Vector3(2, 3.45 + (hit / PARTIAL_BLOCK_CORE_DAMAGE) * 0.01, 4.45),
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
  assertEqual(
    finalHit.bitePoofPositions?.length,
    finalHit.affectedVisualCellIndexes?.length,
    "final fracture should poof every remaining presentation cell that disappears with the block"
  );
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
  const finalStats = world.getStats();
  assertEqual(finalStats.partialBlocks, 0, "final fracture should clear partial-cell debug pressure");
  assertEqual(finalStats.partialRemainingSubvoxels, 0, "final fracture should clear remaining subvoxel pressure");
});

test("Terraformer edits exact sub-cells on the shared terrain damage path", () => {
  const world = new VoxelWorld({ seed: "terraformer-sub-cell-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const input = {
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 1
  };

  const preview = world.previewTerraformerEdit(input);
  assert(preview, "Terraformer should preview the targeted sub-cell before editing");
  assertEqual(preview.cells.length, 1, "size 1 should target exactly one sub-cell");
  const previewedCellIndex = preview.cells[0]?.cellIndex;
  assert(typeof previewedCellIndex === "number", "Terraformer size-1 preview should expose its exact cell index");

  const result = world.applyTerraformerEdit(input);
  const subCellHp = getTerraformerSubCellHealth(BLOCK.stone);
  const partialCell = world.getPartialBlock(2, 3, 4);
  assert(result, "Terraformer should edit the previewed sub-cell");
  assertEqual(result.results.length, 1, "one macro block should receive the size-1 edit");
  assertEqual(
    result.results[0]?.damageApplied,
    subCellHp,
    "Terraformer edit results should report the exact sub-cell HP spent"
  );
  assertDeepEqual(
    result.results[0]?.affectedVisualCellIndexes,
    [previewedCellIndex],
    "Terraformer edit results should report only the exact affected sub-cell"
  );
  assertEqual(
    result.results[0]?.supportInvalidationCells?.length,
    1,
    "Terraformer edit results should carry the exact support cell that disappeared"
  );
  assertDeepEqual(
    result.results[0]?.supportInvalidationCells?.[0]?.bounds,
    preview.cells[0]?.bounds,
    "support invalidation should use the same sub-cell bounds as the Terraformer highlight"
  );
  assertEqual(world.getBlockDamage(2, 3, 4), subCellHp, "Terraformer damage should spend exactly one sub-cell HP");
  assertEqual(
    partialCell?.removedVisualCellIndexes?.length,
    1,
    "Terraformer should store the exact removed sub-cell"
  );
  assert(partialCell, "Terraformer should leave a partial terrain cell after one sub-cell edit");
  assertDeepEqual(
    partialCell.cuts[0]?.exactRemovedVisualCellIndexes ?? [],
    [previewedCellIndex],
    "Terraformer cuts should carry exact cells instead of using ranked neighbor spreading"
  );
  assertDeepEqual(
    createPartialBlockRemovedVisualCellIndexes({
      cuts: partialCell.cuts,
      damage: partialCell.damage,
      maxHealth: partialCell.maxHealth
    }),
    [previewedCellIndex],
    "Terraformer fallback reconstruction should not damage adjacent sub-cells"
  );
  assert(!world.isRenderableSolid(2, 3, 4), "Terraformer-edited blocks should use the partial mesh/mask path");

  const repeatedPreview = world.previewTerraformerEdit(input);
  assertEqual(repeatedPreview, null, "already removed Terraformer sub-cells should be skipped on retarget");
  assertEqual(world.getBlockDamage(2, 3, 4), subCellHp, "retargeting an empty sub-cell should not add phantom damage");
});

test("Terraformer raycasts retarget exposed partial sub-cells", () => {
  const world = new VoxelWorld({ seed: "terraformer-partial-retarget-test" });
  world.setBlock(1, 3, 4, BLOCK.air);
  world.setBlock(2, 3, 4, BLOCK.stone);

  const origin = new THREE.Vector3(1.5, 3.5, 4.5);
  const direction = new THREE.Vector3(1, 0, 0);
  const reachThroughTargetBlock = 1.49;
  for (const expectedLocalX of [0, 1, 2]) {
    const hit = world.raycastTerraformerTarget(origin, direction, reachThroughTargetBlock);
    assert(hit, "Terraformer raycast should find the next visible partial sub-cell");
    assertDeepEqual(hit.block, { x: 2, y: 3, z: 4 }, "retargeted sub-cell should stay in the chipped block");
    assertClose(
      hit.point.x,
      2 + expectedLocalX / BLOCK_FRAGMENT_GRID_SIZE,
      0.00001,
      "partial-aware Terraformer hit should move inward to the exposed sub-cell face"
    );

    const preview = world.previewTerraformerEdit({
      x: hit.block.x,
      y: hit.block.y,
      z: hit.block.z,
      point: hit.point,
      normal: hit.normal,
      incomingDirection: direction,
      speed: 6,
      size: 1
    });
    assert(preview, "retargeted partial-cell hit should produce an editable Terraformer preview");
    assertEqual(preview.cells.length, 1, "size 1 should keep targeting one visible sub-cell at a time");
    assertEqual(
      decodeTestLatticeIndex(preview.cells[0]?.cellIndex ?? -1).x,
      expectedLocalX,
      "retargeted preview should advance through the opened tunnel instead of anchoring to the old cube shell"
    );

    const result = world.applyTerraformerEdit({
      x: hit.block.x,
      y: hit.block.y,
      z: hit.block.z,
      point: hit.point,
      normal: hit.normal,
      incomingDirection: direction,
      speed: 6,
      size: 1
    });
    assert(result, "retargeted Terraformer edit should remove the highlighted sub-cell");
  }

  assertEqual(
    world.raycastTerraformerTarget(origin, direction, reachThroughTargetBlock),
    null,
    "Terraformer raycast should pass through a fully opened sub-cell tunnel instead of hitting the old full cube"
  );
});

test("Terraformer brush sizes operate on the global sub-cell grid", () => {
  const size2World = new VoxelWorld({ seed: "terraformer-size-2-test" });
  size2World.setBlock(2, 3, 4, BLOCK.grass);
  const size2Input = {
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 2
  };
  const size2Preview = size2World.previewTerraformerEdit(size2Input);
  assertEqual(size2Preview?.cells.length, 8, "size 2 should target 2x2x2 sub-cells");
  assert(
    size2Preview?.cells.every((cell) => cell.position.x === 2),
    "size 2 from a face should grow inward before spilling through the back side"
  );
  size2World.applyTerraformerEdit(size2Input);
  assertEqual(
    size2World.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes?.length,
    8,
    "size 2 should remove the exact previewed eight sub-cells"
  );

  const size3World = new VoxelWorld({ seed: "terraformer-size-3-test" });
  size3World.setBlock(2, 3, 4, BLOCK.grass);
  const size3Input = { ...size2Input, size: 3 };
  const size3Preview = size3World.previewTerraformerEdit(size3Input);
  assertEqual(size3Preview?.cells.length, 27, "size 3 should target one full block from a face");
  assertEqual(
    new Set(size3Preview?.cells.map((cell) => cell.cellIndex % 3) ?? []).size,
    3,
    "size 3 from a face should include all three depth layers instead of only the outer shell"
  );
  const size3Result = size3World.applyTerraformerEdit(size3Input);
  assert(size3Result?.results[0]?.destroyed, "size 3 should be able to delete one entire main block");
  assertEqual(
    size3Result?.results[0]?.bitePoofPositions?.length,
    27,
    "whole-block Terraformer edits should poof every targeted sub-cell as it disappears"
  );
  assertEqual(size3World.getBlock(2, 3, 4), BLOCK.air, "all 27 removed sub-cells should clear the main block");
  assertEqual(size3World.getPartialBlock(2, 3, 4), null, "full Terraformer deletion should clear partial state");

  const size4World = new VoxelWorld({ seed: "terraformer-size-4-test" });
  for (let y = 3; y <= 4; y += 1) {
    for (let z = 4; z <= 5; z += 1) {
      for (let x = 2; x <= 3; x += 1) {
        size4World.setBlock(x, y, z, BLOCK.dirt);
      }
    }
  }
  const size4Preview = size4World.previewTerraformerEdit({ ...size2Input, size: 4 });
  const size4BlockKeys = new Set(size4Preview?.cells.map((cell) =>
    `${cell.position.x},${cell.position.y},${cell.position.z}`
  ) ?? []);

  assertEqual(size4Preview?.cells.length, 64, "size 4 should target 4x4x4 sub-cells when enough blocks exist");
  assert(size4BlockKeys.size > 1, "size 4 should spill across neighboring main blocks on the global grid");
});

test("Terraformer face brushes grow inward along the targeted normal", () => {
  const leftFaceWorld = new VoxelWorld({ seed: "terraformer-left-face-depth-test" });
  leftFaceWorld.setBlock(2, 3, 4, BLOCK.stone);
  const leftFacePreview = leftFaceWorld.previewTerraformerEdit({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 3
  });
  assertEqual(leftFacePreview?.cells.length, 27, "left-face size 3 should stay inside the target block");

  const rightFaceWorld = new VoxelWorld({ seed: "terraformer-right-face-depth-test" });
  rightFaceWorld.setBlock(2, 3, 4, BLOCK.stone);
  const rightFacePreview = rightFaceWorld.previewTerraformerEdit({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(3, 3.5, 4.5),
    normal: new THREE.Vector3(1, 0, 0),
    incomingDirection: new THREE.Vector3(-1, 0, 0),
    speed: 6,
    size: 3
  });
  assertEqual(rightFacePreview?.cells.length, 27, "right-face size 3 should also stay inside the target block");
  assertEqual(
    new Set(rightFacePreview?.cells.map((cell) => cell.cellIndex % 3) ?? []).size,
    3,
    "right-face size 3 should grow inward through every local x depth layer"
  );
});

test("Terraformer final damage poofs untouched sub-cells removed by block cleanup", () => {
  const world = new VoxelWorld({ seed: "terraformer-final-despawn-poof-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);
  const maxHealth = getTerrainMaxHealth(BLOCK.stone);
  const subCellHealth = getTerraformerSubCellHealth(BLOCK.stone);
  world.damageBlock(2, 3, 4, maxHealth - subCellHealth);

  const result = world.applyTerraformerEdit({
    x: 2,
    y: 3,
    z: 4,
    point: new THREE.Vector3(2, 3.5, 4.5),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, 0, 0),
    speed: 6,
    size: 1
  });

  assert(result?.results[0]?.destroyed, "the single Terraformer cell should finish the damaged block");
  assertEqual(
    result?.results[0]?.bitePoofPositions?.length,
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
    "final cleanup should poof directly edited and indirectly despawned sub-cells"
  );
  assertEqual(
    result?.results[0]?.affectedVisualCellIndexes?.length,
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
    "final cleanup should expose every removed sub-cell for support/debug consumers"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "final Terraformer cleanup should clear the macro block");
  assertEqual(world.getPartialBlock(2, 3, 4), null, "final Terraformer cleanup should not leave stale partial state");
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

test("partial block debris ejection hints prefer exposed openings", () => {
  const world = new VoxelWorld({ seed: "partial-ejection-opening-test" });
  world.setBlock(1, 3, 4, BLOCK.air);
  world.setBlock(2, 3, 4, BLOCK.stone);

  const result = world.carveBlock({
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

  assert(result?.debrisEjectionHint, "partial bites should report debris ejection hints");
  assert(
    result.debrisEjectionHint.preferredDirections.some((direction) => direction.x < -0.9),
    "side hits should bias chips through the exposed face opening"
  );
  assert(
    result.debrisEjectionHint.biteCellCenters.every((center) =>
      center.x >= 2 && center.x <= 3 &&
      center.y >= 3 && center.y <= 4 &&
      center.z >= 4 && center.z <= 5
    ),
    "ejection bite centers should stay inside the damaged macro voxel"
  );
});

test("partial block debris ejection hints can use a drilled tunnel exit", () => {
  const world = new VoxelWorld({ seed: "partial-ejection-tunnel-test" });
  world.setBlock(1, 3, 4, BLOCK.air);
  world.setBlock(2, 3, 4, BLOCK.ember);
  world.setBlock(3, 3, 4, BLOCK.air);

  const result = world.carveBlock({
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

  assert(result?.debrisEjectionHint, "tunnel bites should still report ejection hints");
  assert(
    result.debrisEjectionHint.preferredDirections.some((direction) => direction.x > 0.9),
    "complete tiny-core tunnels should allow debris to spray toward the exit opening too"
  );
});

test("partial block debris ejection hints fall back to impact normal when surrounded", () => {
  const world = new VoxelWorld({ seed: "partial-ejection-surrounded-test" });
  world.setBlock(1, 3, 4, BLOCK.stone);
  world.setBlock(2, 3, 4, BLOCK.stone);
  world.setBlock(3, 3, 4, BLOCK.stone);
  world.setBlock(2, 2, 4, BLOCK.stone);
  world.setBlock(2, 4, 4, BLOCK.stone);
  world.setBlock(2, 3, 3, BLOCK.stone);
  world.setBlock(2, 3, 5, BLOCK.stone);

  const result = world.carveBlock({
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

  assert(result?.debrisEjectionHint, "surrounded bites should still report a fallback ejection hint");
  assert(
    result.debrisEjectionHint.preferredDirections.some((direction) => direction.x < -0.9),
    "surrounded bites should fall back to the impact normal"
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
  const primaryDamage = world.getBlockDamage(2, 3, 4);
  const neighborDamage = world.getBlockDamage(2, 3, 5);
  assert(
    primaryDamage > 0 && primaryDamage < PARTIAL_BLOCK_CORE_DAMAGE,
    "the primary block should receive a share of the one impact damage budget"
  );
  assert(
    neighborDamage > 0 && neighborDamage < PARTIAL_BLOCK_CORE_DAMAGE,
    "the seam neighbor should receive a share of the one impact damage budget"
  );
  assert(
    primaryDamage > neighborDamage,
    "an off-seam hit should still favor the directly struck macro block"
  );
  assertClose(
    primaryDamage + neighborDamage,
    PARTIAL_BLOCK_CORE_DAMAGE,
    0.000001,
    "seam fan-out should distribute one carve step instead of multiplying damage"
  );
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
  assertEqual(
    world.getBlockDamage(2, 3, 4),
    PARTIAL_BLOCK_CORE_DAMAGE,
    "the centered target should be chipped by one scaled core step"
  );
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

test("damage brush previews keep affected micro-cells adjacent across seams", () => {
  const world = new VoxelWorld({ seed: "damage-brush-preview-connected-test" });
  const connectedFootprintDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
  for (let y = 2; y <= 3; y += 1) {
    for (let z = 1; z <= 2; z += 1) {
      for (let x = 0; x <= 1; x += 1) {
        world.setBlock(x, y, z, BLOCK.stone);
      }
    }
  }

  const preview = world.previewBlockDamageBrush({
    x: 1,
    y: 3,
    z: 1,
    point: new THREE.Vector3(1, 3.02, 1.66),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, -0.02, 0.01),
    coreRadius: 0.42,
    speed: 18,
    amount: connectedFootprintDamage
  });
  const cellKeys = getPreviewGlobalBiteCellKeys(preview);

  assert(preview, "an edge/corner brush should still produce a preview");
  assert(preview.targets.length > 1, "the connected-footprint preview should still span seam neighbors");
  assert(cellKeys.length > 1, "the preview should expose multiple affected micro-cells");
  assert(
    areTestGlobalMicroCellsConnected(cellKeys),
    "previewed affected micro-cells should form one face-connected footprint in world space"
  );
});

test("damage brush carving keeps affected micro-cells adjacent across seams", () => {
  const world = new VoxelWorld({ seed: "damage-brush-carve-connected-test" });
  const connectedFootprintDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
  for (let y = 2; y <= 3; y += 1) {
    for (let z = 1; z <= 2; z += 1) {
      for (let x = 0; x <= 1; x += 1) {
        world.setBlock(x, y, z, BLOCK.stone);
      }
    }
  }

  const result = world.carveBlockBrush({
    x: 1,
    y: 3,
    z: 1,
    point: new THREE.Vector3(1, 3.02, 1.66),
    normal: new THREE.Vector3(-1, 0, 0),
    incomingDirection: new THREE.Vector3(1, -0.02, 0.01),
    coreRadius: 0.42,
    speed: 18,
    amount: connectedFootprintDamage
  });
  const positions = result?.results.map((hit) => hit.position) ?? [];
  const cellKeys = getWorldPartialBlockGlobalBiteCellKeys(world, positions);

  assert(result, "an edge/corner brush should carve terrain");
  assert(result.results.length > 1, "the connected-footprint carve should still span seam neighbors");
  assert(cellKeys.length > 1, "the carve should remove multiple micro-cells");
  assert(
    areTestGlobalMicroCellsConnected(cellKeys),
    "actual removed micro-cells should form one face-connected footprint in world space"
  );
});

test("partial block mesh builder uses face visibility masks without world callbacks", () => {
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 9,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(
    update,
    (_cell, normal) => normal.x === 1
  );
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight[getBlockLightIndex(2, 2, 3)] = 14;
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });

  assertEqual(geometry.positions.length / 3, 4, "one visible macro face should emit one quad");
  assertEqual(geometry.indices.length / 3, 2, "one visible macro face should emit two triangles");
  assertEqual(geometry.blockLights.length, 4, "partial mesh builder should emit one block-light value per vertex");
  assert(
    geometry.blockLights.every((value) => value === 3.5),
    "partial mesh macro faces should average isolated light across touching face-corner cells instead of stamping raw 14"
  );
  for (let index = 0; index < geometry.normals.length; index += 3) {
    assertEqual(geometry.normals[index], 1, "visibility mask should emit only the positive-X face normal");
    assertEqual(geometry.normals[index + 1], 0, "visibility mask should not leak Y normals");
    assertEqual(geometry.normals[index + 2], 0, "visibility mask should not leak Z normals");
  }
});

test("partial block exterior vertex colors match chunk material colors", () => {
  const normal = [1, 0, 0] as const;
  const shade = getSunlitFaceShade(normal);
  const expectedColor = getMaterialBlockColor(BLOCK.grass, shade);
  let position: { readonly x: number; readonly y: number; readonly z: number } | null = null;

  for (let x = 0; x < 64; x += 1) {
    const meshKey = createBlockMeshKey(BLOCK.grass, x, 2, 3);
    const oldTintedColor = getTintedBlockColor(meshKey, shade);
    if (oldTintedColor.some((channel, index) => Math.abs(channel - expectedColor[index]) > 0.01)) {
      position = { x, y: 2, z: 3 };
      break;
    }
  }

  assert(position, "fixture should find a coordinate whose old vertex tint would visibly diverge");
  const cell: PartialBlockCell = {
    block: BLOCK.grass,
    position,
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 15,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, faceNormal) => faceNormal.x === 1);
  const geometry = buildPartialBlockMeshGeometryData({ update, faceVisibilityMasks: masks });

  assertEqual(geometry.colors.length, 12, "one visible partial quad should emit four RGB vertex colors");
  for (let index = 0; index < geometry.colors.length; index += 3) {
    assertClose(geometry.colors[index] ?? 0, expectedColor[0], 0.000001, "partial red channel should match chunks");
    assertClose(geometry.colors[index + 1] ?? 0, expectedColor[1], 0.000001, "partial green channel should match chunks");
    assertClose(geometry.colors[index + 2] ?? 0, expectedColor[2], 0.000001, "partial blue channel should match chunks");
  }
});

test("partial block subdivisions preserve the chunk macro-face light gradient", () => {
  const removedCenter = encodeTestLatticeIndex(1, 1, 1);
  const cell: PartialBlockCell = {
    block: BLOCK.sand,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 27,
    removedVisualCellIndexes: [removedCenter],
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0.5, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: [removedCenter],
      radius: 0.12,
      depth: 0.12,
      seed: 8642
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 16,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === 1);
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight[getBlockLightIndex(2, 1, 2)] = 0;
  blockLight[getBlockLightIndex(2, 2, 2)] = 4;
  blockLight[getBlockLightIndex(2, 1, 3)] = 8;
  blockLight[getBlockLightIndex(2, 2, 3)] = 12;
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const targetValues: number[] = [];

  for (let vertexIndex = 0; vertexIndex < geometry.positions.length / 3; vertexIndex += 1) {
    const positionOffset = vertexIndex * 3;
    const x = geometry.positions[positionOffset] ?? 0;
    const y = geometry.positions[positionOffset + 1] ?? 0;
    const z = geometry.positions[positionOffset + 2] ?? 0;
    const nx = geometry.normals[positionOffset] ?? 0;
    const ny = geometry.normals[positionOffset + 1] ?? 0;
    const nz = geometry.normals[positionOffset + 2] ?? 0;
    if (
      Math.abs(x - 2) <= 0.000001 &&
      Math.abs(y - (2 + 1 / 3)) <= 0.000001 &&
      Math.abs(z - (3 + 1 / 3)) <= 0.000001 &&
      Math.abs(nx - 1) <= 0.000001 &&
      Math.abs(ny) <= 0.000001 &&
      Math.abs(nz) <= 0.000001
    ) {
      targetValues.push(geometry.blockLights[vertexIndex] ?? 0);
    }
  }

  assert(targetValues.length > 0, "damaged exterior fixture should contain the chosen fractional face vertex");
  for (const value of targetValues) {
    assertClose(
      value,
      5,
      0.000001,
      "fractional partial vertices should follow the chunk quad gradient instead of snapping to raw light 12"
    );
  }
});

test("partial block mesh builder keeps missing block-light buffers dark", () => {
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 10,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === 1);
  const geometry = buildPartialBlockMeshGeometryData({ update, faceVisibilityMasks: masks });

  assertEqual(geometry.blockLights.length, 4, "partial mesh should still emit shader-compatible block-light slots");
  assert(
    geometry.blockLights.every((value) => value === 0),
    "missing partial mesh block-light buffers should fall back to darkness"
  );
});

test("partial block mesh worker payload transfers and samples block-light buffers", () => {
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 11,
    cells: [cell],
    contextCells: [cell]
  };
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight[getBlockLightIndex(2, 2, 3)] = 14;
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === 1);
  const payload = createPartialBlockMeshBuildJobPayload(update, masks, {
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const transfers = getPartialBlockMeshBuildJobPayloadTransfers(payload);
  const result = buildPartialBlockMeshBuildJob(payload);

  assertEqual(transfers.length, 1, "partial mesh worker payload should transfer the cloned current block-light buffer");
  assertEqual(transfers[0], payload.blockLights?.current, "partial mesh worker should transfer the payload light buffer");
  assert(
    result.geometry.blockLights.every((value) => value === 3.5),
    "partial mesh worker builds should sample transferred block-light buffers"
  );
});

test("Lamp removal clears rendered partial block-light attributes on rebuild", () => {
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 12,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === 1);
  const litBlocks = createEmptyBlockLightChunkSnapshot();
  litBlocks[getBlockLightIndex(2, 2, 3)] = BLOCK.lamp;
  const lit = buildChunkBlockLight({ blocks: litBlocks }).blockLight;
  litBlocks[getBlockLightIndex(2, 2, 3)] = BLOCK.air;
  const dark = buildChunkBlockLight({ blocks: litBlocks }).blockLight;

  const litGeometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(lit),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const darkGeometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(dark),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });

  assert(litGeometry.blockLights.some((value) => value > 0), "lamp cache should light the partial face before removal");
  assert(
    darkGeometry.blockLights.every((value) => value === 0),
    "rebuilt partial mesh attributes should clear after the lamp cache goes dark"
  );
});

test("cross-chunk Lamp block light reaches partial terrain through neighbor buffers", () => {
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: CHUNK_SIZE, y: 2, z: 3 },
    damage: 0,
    maxHealth: 2,
    cuts: []
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 13,
    cells: [cell],
    contextCells: [cell]
  };
  const westLight = createEmptyBlockLightChunkSnapshot();
  westLight[getBlockLightIndex(CHUNK_SIZE - 1, 2, 3)] = 14;
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === -1);
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(createEmptyBlockLightChunkSnapshot(), {
      negativeX: westLight
    }),
    blockLightChunkOrigin: { cx: 1, cz: 0 }
  });

  assert(
    geometry.blockLights.every((value) => value === 3.5),
    "partial terrain on a chunk edge should read the cloned cardinal neighbor block-light buffer"
  );
});

test("visible partial apertures illuminate exact-cut cavity walls", () => {
  const removedCells = [
    encodeTestLatticeIndex(0, 1, 1),
    encodeTestLatticeIndex(1, 1, 1)
  ];
  const cell: PartialBlockCell = {
    block: BLOCK.sand,
    position: { x: 1, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 0.2,
      depth: 2 / 3,
      seed: 4101
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 17,
    cells: [cell],
    contextCells: [cell]
  };
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight.fill(12);
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    ),
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const endWallX = cell.position.x + 2 / 3;
  const endWallSamples = getPartialBlockVertexSamples(geometry).filter(({ position, normal }) => (
    Math.abs(position[0] - endWallX) <= 0.000001 &&
    Math.abs(normal[0] + 1) <= 0.000001 &&
    Math.abs(normal[1]) <= 0.000001 &&
    Math.abs(normal[2]) <= 0.000001
  ));

  assert(endWallSamples.length > 0, "exact-cut fixture should expose a clean wall at the back of the cavity");
  for (const sample of endWallSamples) {
    assert(sample.blockLight > 0, "a visible lit aperture should illuminate its exact-cut cavity wall");
    assert(sample.blockLight <= 12, "cavity light should never exceed its aperture seed");
  }
});

test("wrinkled cavity light attenuates by one third per connected subcell", () => {
  const removedCells = [0, 1, 2].map((x) => encodeTestLatticeIndex(x, 1, 1));
  const cell: PartialBlockCell = {
    block: BLOCK.sand,
    position: { x: 1, y: 2, z: 3 },
    damage: 3,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      radius: 0.3,
      depth: 1,
      seed: 4102
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 18,
    cells: [cell],
    contextCells: [cell]
  };
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight.fill(12);
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    ),
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const samples = getPartialBlockVertexSamples(geometry);
  const depthLevels: number[] = [];

  for (let depth = 0; depth < 3; depth += 1) {
    const centerX = cell.position.x + (depth + 0.5) / 3;
    const centerSamples = samples.filter(({ position, normal }) => {
      const tangentNormal = Math.abs(normal[1]) + Math.abs(normal[2]);
      return Math.abs(position[0] - centerX) <= 0.000001 && tangentNormal > 0.5;
    });
    assert(centerSamples.length > 0, `wrinkled depth ${depth} should emit center vertices`);
    const level = centerSamples[0]?.blockLight ?? 0;
    for (const sample of centerSamples) {
      assertClose(sample.blockLight, level, 0.000001, "one cavity subcell should share one center light level");
    }
    depthLevels.push(level);
  }

  assert(depthLevels[0]! > 0, "the wrinkled cavity lip should receive light through its visible aperture");
  assertClose(depthLevels[0]!, 12 - 1 / 3, 0.000001, "the aperture subcell should lose one third level at entry");
  assertClose(depthLevels[1]!, 12 - 2 / 3, 0.000001, "the second subcell should lose another one third level");
  assertClose(depthLevels[2]!, 11, 0.000001, "the third subcell should lose one full level from the exterior lip");
  assert(depthLevels.every((level) => level <= 12), "cavity propagation should never exceed the aperture seed");
});

test("neighboring partial apertures smooth unequal cavity light across their shared edge", () => {
  const removedCells = [
    encodeTestLatticeIndex(0, 0, 1),
    encodeTestLatticeIndex(0, 1, 1)
  ];
  const cell: PartialBlockCell = {
    block: BLOCK.sand,
    position: { x: 1, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 1 / 3, z: 0.5 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 1 / 3,
      depth: 1 / 3,
      seed: 4106
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 22,
    cells: [cell],
    contextCells: [cell]
  };
  const blockLight = createEmptyBlockLightChunkSnapshot();
  // Build a vertical macro-face gradient so the two neighboring aperture
  // centers start at different levels instead of accidentally testing a flat
  // field that would hide a discontinuity.
  for (let z = 2; z <= 4; z += 1) {
    blockLight[getBlockLightIndex(0, 1, z)] = 4;
    blockLight[getBlockLightIndex(0, 2, z)] = 8;
    blockLight[getBlockLightIndex(0, 3, z)] = 12;
  }
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    ),
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const samples = getPartialBlockVertexSamples(geometry);
  const wallX = cell.position.x + 1 / 3;
  const wallZ = cell.position.z + 1 / 3;
  const sampleWallVertex = (y: number): readonly TestPartialBlockVertexSample[] => samples.filter(({ position, normal }) => (
    Math.abs(position[0] - wallX) <= 0.000001 &&
    Math.abs(position[1] - y) <= 0.000001 &&
    Math.abs(position[2] - wallZ) <= 0.000001 &&
    Math.abs(normal[0]) <= 0.000001 &&
    Math.abs(normal[1]) <= 0.000001 &&
    Math.abs(normal[2] - 1) <= 0.000001
  ));
  const lowerSamples = sampleWallVertex(cell.position.y);
  const sharedSamples = sampleWallVertex(cell.position.y + 1 / 3);
  const upperSamples = sampleWallVertex(cell.position.y + 2 / 3);

  assert(lowerSamples.length > 0, "the lower aperture should expose its outer cavity-wall vertex");
  assert(sharedSamples.length >= 2, "neighboring cavity walls should duplicate their shared-edge vertex");
  assert(upperSamples.length > 0, "the upper aperture should expose its outer cavity-wall vertex");
  const lowerLevel = lowerSamples[0]?.blockLight ?? 0;
  const sharedLevel = sharedSamples[0]?.blockLight ?? 0;
  const upperLevel = upperSamples[0]?.blockLight ?? 0;
  assert(upperLevel > lowerLevel, "the asymmetric aperture fixture should preserve its vertical light gradient");
  assert(
    sharedLevel > lowerLevel && sharedLevel < upperLevel,
    "the shared cavity edge should interpolate between its unequal neighboring aperture levels"
  );
  for (const sample of sharedSamples) {
    assertClose(
      sample.blockLight,
      sharedLevel,
      0.000001,
      "both cavity quads should emit the same smoothed light at their shared edge"
    );
  }
});

test("diagonally touching partial cavities do not transfer light through an intact corner", () => {
  const apertureCell = encodeTestLatticeIndex(0, 0, 0);
  const sealedCell = encodeTestLatticeIndex(1, 1, 1);
  const removedCells = [apertureCell, sealedCell];
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 1 / 6, z: 1 / 6 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 0.2,
      depth: 2 / 3,
      seed: 4107
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 23,
    cells: [cell],
    contextCells: [cell]
  };
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight.fill(12);
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    ),
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const samples = getPartialBlockVertexSamples(geometry);
  const openWallX = cell.position.x + 1 / 3;
  const sealedWallX = cell.position.x + 2 / 3;
  const openWallSamples = samples.filter(({ position, normal }) => (
    Math.abs(position[0] - openWallX) <= 0.000001 && Math.abs(normal[0] + 1) <= 0.000001
  ));
  const sealedWallSamples = samples.filter(({ position, normal }) => (
    Math.abs(position[0] - sealedWallX) <= 0.000001 &&
    position[1] >= cell.position.y + 1 / 3 - 0.000001 &&
    position[1] <= cell.position.y + 2 / 3 + 0.000001 &&
    position[2] >= cell.position.z + 1 / 3 - 0.000001 &&
    position[2] <= cell.position.z + 2 / 3 + 0.000001 &&
    Math.abs(normal[0] + 1) <= 0.000001
  ));

  assert(openWallSamples.length > 0, "the visible aperture should expose a lit inner wall");
  assert(openWallSamples.some((sample) => sample.blockLight > 0), "the face-connected aperture should receive light");
  assert(sealedWallSamples.length > 0, "the isolated center cell should expose a cavity wall");
  assert(
    sealedWallSamples.every((sample) => sample.blockLight === 0),
    "a diagonal-only cavity must remain dark because no face-connected path reaches it"
  );
});

test("partial cavity lighting stays dark when block-light buffers are missing", () => {
  const removedCells = [
    encodeTestLatticeIndex(0, 1, 1),
    encodeTestLatticeIndex(1, 1, 1)
  ];
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 0.2,
      depth: 2 / 3,
      seed: 4103
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 19,
    cells: [cell],
    contextCells: [cell]
  };
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    )
  });

  assert(geometry.blockLights.length > 0, "missing-buffer cavity fixture should emit partial geometry");
  assert(
    geometry.blockLights.every((level) => level === 0),
    "missing cached light buffers should leave exterior and cavity attributes dark"
  );
});

test("Lamp removal clears propagated partial cavity light", () => {
  const removedCells = [
    encodeTestLatticeIndex(2, 1, 1),
    encodeTestLatticeIndex(1, 1, 1)
  ];
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: 1, y: 0, z: 0 },
      localPoint: { x: 1, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 0.2,
      depth: 2 / 3,
      seed: 4104
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 20,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, (_cell, normal) => normal.x === 1);
  const blocks = createEmptyBlockLightChunkSnapshot();
  blocks[getBlockLightIndex(2, 2, 3)] = BLOCK.lamp;
  const lit = buildChunkBlockLight({ blocks }).blockLight;
  blocks[getBlockLightIndex(2, 2, 3)] = BLOCK.air;
  const dark = buildChunkBlockLight({ blocks }).blockLight;
  const litGeometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(lit),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });
  const darkGeometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(dark),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });

  assert(litGeometry.blockLights.some((level) => level > 0), "the Lamp should illuminate the open cavity");
  assert(
    darkGeometry.blockLights.every((level) => level === 0),
    "rebuilding after Lamp removal should clear propagated cavity light"
  );
});

test("chunk-edge partial apertures seed cavity light from cardinal neighbor buffers", () => {
  const removedCells = [
    encodeTestLatticeIndex(0, 1, 1),
    encodeTestLatticeIndex(1, 1, 1)
  ];
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: CHUNK_SIZE, y: 2, z: 3 },
    damage: 2,
    maxHealth: 27,
    removedVisualCellIndexes: removedCells,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: removedCells,
      radius: 0.2,
      depth: 2 / 3,
      seed: 4105
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 21,
    cells: [cell],
    contextCells: [cell]
  };
  const westLight = createEmptyBlockLightChunkSnapshot();
  westLight.fill(12);
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: createPartialBlockFaceVisibilityMasks(
      update,
      (_cell, normal) => normal.x === -1
    ),
    blockLights: createChunkMeshBlockLightBuffers(createEmptyBlockLightChunkSnapshot(), {
      negativeX: westLight
    }),
    blockLightChunkOrigin: { cx: 1, cz: 0 }
  });
  const endWallX = cell.position.x + 2 / 3;
  const cavityEndWall = getPartialBlockVertexSamples(geometry).filter(({ position, normal }) => (
    Math.abs(position[0] - endWallX) <= 0.000001 && Math.abs(normal[0] + 1) <= 0.000001
  ));

  assert(cavityEndWall.length > 0, "chunk-edge cavity fixture should expose its inner end wall");
  assert(
    cavityEndWall.every((sample) => sample.blockLight > 0 && sample.blockLight <= 12),
    "a visible chunk-edge aperture should seed bounded cavity light from the west buffer"
  );
});

test("accepted block-light cache results dirty current and cardinal partial mesh regions", () => {
  const world = new VoxelWorld({ seed: "partial-light-dirty-test" });
  world.setBlock(1, 2, 3, BLOCK.stone);
  world.setBlock(CHUNK_SIZE, 2, 3, BLOCK.stone);
  world.carveBlock({
    x: 1,
    y: 2,
    z: 3,
    point: { x: 1, y: 2.5, z: 3.5 },
    normal: { x: -1, y: 0, z: 0 },
    amount: PARTIAL_BLOCK_CORE_DAMAGE,
    speed: 18
  });
  world.carveBlock({
    x: CHUNK_SIZE,
    y: 2,
    z: 3,
    point: { x: CHUNK_SIZE, y: 2.5, z: 3.5 },
    normal: { x: -1, y: 0, z: 0 },
    amount: PARTIAL_BLOCK_CORE_DAMAGE,
    speed: 18
  });
  assert(world.consumePartialBlockMeshRegionUpdates().length > 0, "setup should create initial partial mesh dirtiness");
  assertEqual(world.getDirtyPartialBlockMeshRegionCount(), 0, "setup should drain initial partial mesh dirtiness");

  const chunk = world.getChunk(0, 0);
  assert(chunk, "test world should have an owning chunk");
  const requestId = 711;
  world.pendingBlockLightBuilds.set(requestId, {
    key: "0,0",
    revision: chunk.revision,
    jobId: 123
  });
  world.pendingBlockLightKeys.add("0,0");
  world.workerResults.push({
    type: BLOCK_LIGHT_BUILT_RESULT,
    requestId,
    cx: 0,
    cz: 0,
    revision: chunk.revision,
    blockLight: createEmptyBlockLightChunkSnapshot(),
    sourceCount: 0,
    litCellCount: 0,
    maxQueueDepth: 0
  });

  world.processBlockLightResults(1);

  const dirtyUpdates = world.consumePartialBlockMeshRegionUpdates();
  const dirtyRegionKeys = new Set(dirtyUpdates.map((update) => update.key));
  assert(
    dirtyRegionKeys.has(createPartialBlockMeshRegionKey({ x: 1, y: 2, z: 3 })),
    "accepted light cache should dirty partial mesh regions in the current chunk"
  );
  assert(
    dirtyRegionKeys.has(createPartialBlockMeshRegionKey({ x: CHUNK_SIZE, y: 2, z: 3 })),
    "accepted light cache should dirty partial mesh regions in cardinal neighbor chunks"
  );
});

test("closed partial cavities stay dark without a visible aperture", () => {
  const exactRemovedCell = encodeTestLatticeIndex(1, 1, 1);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 27,
    removedVisualCellIndexes: [exactRemovedCell],
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0.5, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: [exactRemovedCell],
      radius: 0.12,
      depth: 0.12,
      seed: 2468
    }]
  };
  const update = {
    key: createPartialBlockMeshRegionKey(cell.position),
    revision: 14,
    cells: [cell],
    contextCells: [cell]
  };
  const masks = createPartialBlockFaceVisibilityMasks(update, () => false);
  const blockLight = createEmptyBlockLightChunkSnapshot();
  blockLight[getBlockLightIndex(1, 2, 3)] = 14;
  const geometry = buildPartialBlockMeshGeometryData({
    update,
    faceVisibilityMasks: masks,
    blockLights: createChunkMeshBlockLightBuffers(blockLight),
    blockLightChunkOrigin: { cx: 0, cz: 0 }
  });

  assert(geometry.blockLights.length > 0, "exact-cut interior geometry should be present for the test fixture");
  assert(
    geometry.blockLights.every((value) => value === 0),
    "a removed pocket with no visible macro-face connection should remain dark"
  );
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
  const regionKey = createPartialBlockMeshRegionKey(cell.position);

  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "partial block field should create a mesh for the dirty region");
  const positionAttribute = regionMesh.geometry.getAttribute("position");
  const uvAttribute = regionMesh.geometry.getAttribute("uv");
  const textureTileAttribute = regionMesh.geometry.getAttribute("blockTextureTile");
  const blockLightAttribute = regionMesh.geometry.getAttribute("blockLight");
  const bounds = new THREE.Box3().setFromBufferAttribute(positionAttribute);

  assertEqual(scene.children[0], field.mesh, "partial block field should own one shared scene root");
  assert(field.mesh.visible, "custom partial terrain should become visible when cells exist");
  assertEqual(field.getStats().cells, 1, "one cell should be represented in the partial terrain mesh");
  assertEqual(field.getStats().regions, 1, "one dirty region should be represented by one child mesh");
  assert(positionAttribute.count > 24, "carved cells should have more geometry than a plain six-face cube");
  assertEqual(uvAttribute.count, positionAttribute.count, "partial terrain should emit atlas UVs for every vertex");
  assertEqual(
    textureTileAttribute.count,
    positionAttribute.count,
    "partial terrain should emit atlas tile ids for every vertex"
  );
  assertEqual(
    blockLightAttribute.count,
    positionAttribute.count,
    "partial terrain should emit shader-compatible block-light attributes for every vertex"
  );
  for (let index = 0; index < blockLightAttribute.count; index += 1) {
    assertEqual(blockLightAttribute.getX(index), 0, "partial terrain without light buffers should render dark");
  }
  assert(bounds.min.x >= 1 && bounds.max.x <= 2, "partial block geometry should stay inside its voxel x bounds");
  assert(bounds.min.y >= 2 && bounds.max.y <= 3, "partial block geometry should stay inside its voxel y bounds");
  assert(bounds.min.z >= 3 && bounds.max.z <= 4, "partial block geometry should stay inside its voxel z bounds");

  field.dispose();
  assertEqual(scene.children.length, 0, "disposing should remove the partial block mesh from the scene");
});

test("Terraformer exact cuts render clean sub-cell walls", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const exactRemovedCell = encodeTestLatticeIndex(0, 1, 1);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 27,
    removedVisualCellIndexes: [exactRemovedCell],
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 1 / 6, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: [exactRemovedCell],
      radius: 0.12,
      depth: 0.12,
      seed: 2468
    }]
  };
  const regionKey = createPartialBlockMeshRegionKey(cell.position);

  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "Terraformer exact-cut test should create a regional mesh");
  const positions = regionMesh.geometry.getAttribute("position");
  const normals = regionMesh.geometry.getAttribute("normal");
  const expectedWallX = cell.position.x + 1 / BLOCK_FRAGMENT_GRID_SIZE;
  let exactWallVertices = 0;
  let wrinkledExactWallVertices = 0;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const normalX = normals.getX(index);
    if (normalX < -0.35 && x > cell.position.x + 0.05 && x < cell.position.x + 0.5) {
      exactWallVertices += 1;
      if (Math.abs(x - expectedWallX) > 0.002) wrinkledExactWallVertices += 1;
    }
  }

  assert(exactWallVertices > 0, "Terraformer should expose the clean wall of the deleted sub-cell");
  assertEqual(
    wrinkledExactWallVertices,
    0,
    "Terraformer exact cuts should not wrinkle neighboring sub-cells like impact damage"
  );

  field.dispose();
});

test("Terraformer exact cuts cap sub-cell boundaries hidden by neighboring chunks", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const exactRemovedCell = encodeTestLatticeIndex(0, 1, 1);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 27,
    removedVisualCellIndexes: [exactRemovedCell],
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 1 / 6, y: 0.5, z: 0.5 },
      exactRemovedVisualCellIndexes: [exactRemovedCell],
      radius: 0.12,
      depth: 0.12,
      seed: 8642
    }]
  };
  const regionKey = createPartialBlockMeshRegionKey(cell.position);

  field.beginUpdate(1);
  // Simulate the Terraformer cut sitting against neighboring normal chunk
  // geometry. The macro face is not visible, but sub-cell caps bordering the
  // exact cut still need a tiny inset face so the carved ledge does not read as
  // a hollow shell from inside the opening.
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => false);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "neighbor-backed exact-cut test should create a regional mesh");
  const positions = regionMesh.geometry.getAttribute("position");
  const normals = regionMesh.geometry.getAttribute("normal");
  let insetBoundaryCapVertices = 0;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const normalX = normals.getX(index);
    if (normalX < -0.9 && x > cell.position.x && x < cell.position.x + 0.01) {
      insetBoundaryCapVertices += 1;
    }
  }

  assert(
    insetBoundaryCapVertices > 0,
    "exact cuts should keep inset caps for sub-cell faces backed by neighboring full chunk geometry"
  );

  field.dispose();
});

test("partial block field rebuilds only the requested region", () => {
  const scene = new THREE.Scene();
  const field = new PartialBlockMeshField(scene);
  const firstCell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 1, y: 2, z: 3 },
    damage: 1,
    maxHealth: 2,
    cuts: [{
      normal: { x: -1, y: 0, z: 0 },
      localPoint: { x: 0, y: 0.5, z: 0.5 },
      radius: 0.42,
      depth: 0.5,
      seed: 111
    }]
  };
  const secondCell: PartialBlockCell = {
    ...firstCell,
    position: { x: 9, y: 2, z: 3 },
    cuts: [{ ...firstCell.cuts[0]!, seed: 222 }]
  };
  const firstRegionKey = createPartialBlockMeshRegionKey(firstCell.position);
  const secondRegionKey = createPartialBlockMeshRegionKey(secondCell.position);

  field.beginUpdate(2);
  field.updateRegion({ key: firstRegionKey, cells: [firstCell], contextCells: [firstCell] }, () => true);
  field.updateRegion({ key: secondRegionKey, cells: [secondCell], contextCells: [secondCell] }, () => true);
  const firstRegionGeometry = field.getRegionMesh(firstRegionKey)?.geometry;

  field.beginUpdate(1);
  field.updateRegion({ key: secondRegionKey, cells: [{ ...secondCell, damage: 2 }], contextCells: [secondCell] }, () => true);

  assertEqual(
    field.getRegionMesh(firstRegionKey)?.geometry,
    firstRegionGeometry,
    "updating one partial mesh region should not rebuild unrelated region geometry"
  );
  assertEqual(field.getStats().regions, 2, "both regional meshes should remain alive");

  field.dispose();
});

test("partial block field disposes empty regions", () => {
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
      seed: 333
    }]
  };
  const regionKey = createPartialBlockMeshRegionKey(cell.position);

  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  assert(field.getRegionMesh(regionKey), "setup should create a regional partial mesh");

  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [], contextCells: [] }, () => true);

  assertEqual(field.getRegionMesh(regionKey), null, "empty partial mesh regions should be removed");
  assertEqual(field.getStats().regions, 0, "empty partial mesh regions should not count as live draw regions");

  field.dispose();
});

test("partial block collision boxes represent remaining lattice cells", () => {
  const removedCells = Array.from({ length: PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT }, (_value, index) => index)
    .filter((index) => index !== PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT - 1);
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 4, y: 5, z: 6 },
    damage: 9,
    maxHealth: 10,
    cuts: [],
    removedVisualCellIndexes: removedCells
  };

  const boxes = createPartialBlockCollisionBoxes(cell);

  assertEqual(boxes.length, 1, "only remaining partial-block lattice cells should produce debris collision boxes");
  assertClose(boxes[0].minX, 4 + 2 / 3, 0.000001, "remaining lattice box should keep its local x offset");
  assertClose(boxes[0].minY, 5 + 2 / 3, 0.000001, "remaining lattice box should keep its local y offset");
  assertClose(boxes[0].minZ, 6 + 2 / 3, 0.000001, "remaining lattice box should keep its local z offset");
  assertClose(boxes[0].maxX, 5, 0.000001, "remaining lattice box should end at the voxel x edge");
  assertClose(boxes[0].maxY, 6, 0.000001, "remaining lattice box should end at the voxel y edge");
  assertClose(boxes[0].maxZ, 7, 0.000001, "remaining lattice box should end at the voxel z edge");
});

test("partial block collision boxes merge contiguous cells without covering removed bites", () => {
  const removedCenterIndex = 13;
  const cell: PartialBlockCell = {
    block: BLOCK.stone,
    position: { x: 0, y: 0, z: 0 },
    damage: 1,
    maxHealth: 10,
    cuts: [],
    removedVisualCellIndexes: [removedCenterIndex]
  };

  const boxes = createPartialBlockCollisionBoxes(cell);
  const latticeSize = 3;
  const cellSize = 1 / latticeSize;

  assert(
    boxes.length < PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT - 1,
    "adjacent surviving lattice cells should be merged into fewer Rapier support boxes"
  );

  for (let z = 0; z < latticeSize; z += 1) {
    for (let y = 0; y < latticeSize; y += 1) {
      for (let x = 0; x < latticeSize; x += 1) {
        const index = x + y * latticeSize + z * latticeSize ** 2;
        const center = {
          x: (x + 0.5) * cellSize,
          y: (y + 0.5) * cellSize,
          z: (z + 0.5) * cellSize
        };
        const containingBoxes = boxes.filter((box) =>
          center.x > box.minX &&
          center.x < box.maxX &&
          center.y > box.minY &&
          center.y < box.maxY &&
          center.z > box.minZ &&
          center.z < box.maxZ
        );
        assertEqual(
          containingBoxes.length,
          index === removedCenterIndex ? 0 : 1,
          "merged collision boxes should exactly cover surviving lattice cells once"
        );
      }
    }
  }
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
  const oneTenthStoneDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
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
    amount: oneTenthStoneDamage
  });

  const removedCellIndexes = world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [];
  const removedCells = removedCellIndexes.map(decodeTestLatticeIndex);

  assertEqual(removedCells.length, 3, "one tenth of stone HP should remove three presentation cells");
  assert(
    arePartialBlockVisualCellIndexesConnected(removedCellIndexes),
    "tiny core tunnel bites should be face-connected instead of isolated missing cells"
  );
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
  const oneTenthStoneDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
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
    amount: oneTenthStoneDamage
  });

  const removedCellIndexes = world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [];
  const removedCells = removedCellIndexes.map(decodeTestLatticeIndex);
  const entryPlaneCells = removedCells.filter((cell) => cell.x === 0);
  const lateralSlots = new Set(entryPlaneCells.map((cell) => `${cell.y},${cell.z}`));

  assertEqual(removedCells.length, 3, "one tenth of stone HP should still remove three presentation cells");
  assert(
    arePartialBlockVisualCellIndexesConnected(removedCellIndexes),
    "large core bites should still remove one connected chunk with no gaps"
  );
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
  assert(
    arePartialBlockVisualCellIndexesConnected([...secondBites]),
    "later hits should grow the old wound through adjacent cells instead of opening disconnected gaps"
  );
});

test("tiny fast partial-block bites can pierce through an open tunnel", () => {
  const world = new VoxelWorld({ seed: "partial-bite-pierce-test" });
  const oneTenthStoneDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
  const impactSpeed = 24;
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
    speed: impactSpeed,
    amount: oneTenthStoneDamage
  });

  assert(result?.pierceContinuation, "tiny fast cores should continue after opening a complete lattice tunnel");
  assert(result.pierceContinuation.position.x > 3, "piercing should place the core just beyond the exit face");
  assertClose(
    result.pierceContinuation.speed,
    impactSpeed - 3 * 2.8 * (getBlockMaterialRule(BLOCK.stone).health / 10),
    0.000001,
    "exit speed should pay tunnel material cost scaled by material HP"
  );
  assert(result.pierceContinuation.velocity.x > 0, "pierce continuation should keep forward velocity");
});

test("tiny fast off-center bites still reserve a continuous pierce tunnel", () => {
  const world = new VoxelWorld({ seed: "partial-bite-off-center-pierce-test" });
  const oneTenthStoneDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
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
    amount: oneTenthStoneDamage
  });
  const removedCells = (world.getPartialBlock(2, 3, 4)?.removedVisualCellIndexes ?? [])
    .map(decodeTestLatticeIndex);

  assert(result?.pierceContinuation, "tiny fast cores should pierce even when the aim point is near lattice seams");
  assertEqual(removedCells.length, 3, "one tiny pierce should still spend one tenth of stone visual material");
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

  const regionKey = createPartialBlockMeshRegionKey(cell.position);
  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "partial bite test should create a regional mesh");
  const positions = regionMesh.geometry.getAttribute("position");
  const normals = regionMesh.geometry.getAttribute("normal");
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

  const regionKey = createPartialBlockMeshRegionKey(cell.position);
  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "partial edge-cut test should create a regional mesh");
  const positions = regionMesh.geometry.getAttribute("position");
  const normals = regionMesh.geometry.getAttribute("normal");
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

  const regionKey = createPartialBlockMeshRegionKey(cell.position);
  field.beginUpdate(1);
  field.updateRegion({ key: regionKey, cells: [cell], contextCells: [cell] }, () => true);
  const regionMesh = field.getRegionMesh(regionKey);
  assert(regionMesh, "partial support-surface test should create a regional mesh");
  const positions = regionMesh.geometry.getAttribute("position");
  const textureTiles = regionMesh.geometry.getAttribute("blockTextureTile");
  const bounds = new THREE.Box3().setFromBufferAttribute(positions);
  const baseTiles = new Set<number>();
  for (let index = 0; index < textureTiles.count; index += 1) {
    baseTiles.add(textureTiles.getX(index));
  }

  assert(field.mesh.visible, "broken partial terrain should render as a visible surface patch");
  assert(positions.count > 40, "surface patches should use a low-poly heightfield instead of a single quad");
  assert(baseTiles.has(BLOCK_TEXTURE_TILE.grassTop), "grass partial top surfaces should keep grass texture tiles");
  assert(baseTiles.has(BLOCK_TEXTURE_TILE.grassSide), "grass partial side skirts should keep grass-side texture tiles");
  assert(bounds.min.y >= 5, "partial support surfaces should stay inside their source cell base");
  assert(bounds.max.y > 5.25 && bounds.max.y < 6, "surface samples should create a partial-height walkable patch");

  field.dispose();
});

test("player footprint support falls through a three-sub-block cross-block shaft", () => {
  const cells = [
    createTestPartialBlockCell({ x: 0, y: 0, z: 0 }, createRemovedPartialColumns([{ x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 }])),
    createTestPartialBlockCell({ x: 1, y: 0, z: 0 }, createRemovedPartialColumns([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 1, z: 2 }
    ]))
  ];
  const result = getPartialBlockPlayerFootprintSupport(cells, {
    minX: 0.85,
    maxX: 1.49,
    minY: 1,
    maxY: 1.05,
    minZ: 0.18,
    maxZ: 0.82
  });

  assertEqual(result.supportY, null, "a connected one-block-wide cross-block shaft should not support the player");
  assert(result.hasPassableAperture, "the footprint query should report the three-sub-block aperture as passable");
});

test("player footprint support preserves narrower cross-block seams", () => {
  const cells = [
    createTestPartialBlockCell({ x: 0, y: 0, z: 0 }, createRemovedPartialColumns([{ x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 }])),
    createTestPartialBlockCell({ x: 1, y: 0, z: 0 }, createRemovedPartialColumns([{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }]))
  ];
  const result = getPartialBlockPlayerFootprintSupport(cells, {
    minX: 0.85,
    maxX: 1.49,
    minY: 1,
    maxY: 1.05,
    minZ: 0.18,
    maxZ: 0.82
  });

  assertEqual(result.supportY, 1, "a seam below the one-block-wide passability threshold should still support the player");
  assert(!result.hasPassableAperture, "two sub-blocks of connected opening should remain too narrow to fall through");
});

test("player collision uses partial-block boxes instead of ghost full cubes", () => {
  const lowSurvivingPartialBox: CollisionBounds = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const partialWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [lowSurvivingPartialBox] : null;
    }
  };

  assert(
    !doesPlayerBoundsCollideWithWorld({
      minX: 0.15,
      maxX: 0.85,
      minY: 0.5,
      maxY: 2.25,
      minZ: 0.15,
      maxZ: 0.85
    }, partialWorld),
    "a player above the surviving low lattice slab should not collide with the old invisible full cube"
  );

  assert(
    doesPlayerBoundsCollideWithWorld({
      minX: 0.15,
      maxX: 0.85,
      minY: 0.2,
      maxY: 1.95,
      minZ: 0.15,
      maxZ: 0.85
    }, partialWorld),
    "a player overlapping the surviving lattice slab should still collide with damaged terrain"
  );
});

test("player movement steps up after contacting a low partial-block ledge", () => {
  const originalDocument = (globalThis as { document?: Document }).document;
  const globals = globalThis as { document?: Document };
  globals.document = {
    pointerLockElement: null,
    body: {
      classList: {
        toggle(): boolean {
          return false;
        }
      }
    },
    addEventListener(): void {},
    exitPointerLock(): void {}
  } as unknown as Document;

  const lowLedgeBox: CollisionBounds = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const ledgeWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [lowLedgeBox] : null;
    },
    getPlayerFootprintSupportHeight(bounds): number | null {
      const overlapsLedge =
        bounds.maxX > lowLedgeBox.minX &&
        bounds.minX < lowLedgeBox.maxX &&
        bounds.maxZ > lowLedgeBox.minZ &&
        bounds.minZ < lowLedgeBox.maxZ;
      return overlapsLedge ? lowLedgeBox.maxY : null;
    }
  };
  const fakeCanvas = {
    tabIndex: 0,
    style: { cursor: "" },
    addEventListener(): void {},
    requestPointerLock(): void {},
    focus(): void {}
  } as unknown as HTMLElement;

  try {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const player = new PlayerController(camera, fakeCanvas, ledgeWorld);

    player.moveAxis("x", 0.6);

    assert(camera.position.x > 0.1, "horizontal motion should survive stepping onto a low partial ledge");
    assertClose(player.getFeetY(), 0, 0.000001, "low partial ledges should not snap the view upward immediately");

    player.active = true;
    player.update(0.03);
    assert(
      player.getFeetY() > 0 && player.getFeetY() < 1 / 3,
      "low partial ledges should ease upward during the short step animation"
    );

    player.update(1);
    assertClose(player.getFeetY(), 1 / 3, 0.000001, "player feet should finish on the one-sub-block ledge");
    player.dispose();
  } finally {
    if (originalDocument) globals.document = originalDocument;
    else delete globals.document;
  }
});

test("player movement climbs sequential one-sub-block partial stairs without jumping", () => {
  const originalDocument = (globalThis as { document?: Document }).document;
  const globals = globalThis as { document?: Document };
  globals.document = {
    pointerLockElement: null,
    body: {
      classList: {
        toggle(): boolean {
          return false;
        }
      }
    },
    addEventListener(): void {},
    exitPointerLock(): void {}
  } as unknown as Document;

  const stairBoxes: readonly CollisionBounds[] = [
    { minX: 0, maxX: 1, minY: 0, maxY: 1 / 3, minZ: 0, maxZ: 1 },
    { minX: 1, maxX: 2, minY: 0, maxY: 2 / 3, minZ: 0, maxZ: 1 },
    { minX: 2, maxX: 3, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }
  ];
  const stairWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return y === 0 && z === 0 && x >= 0 && x <= 2;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      if (y !== 0 || z !== 0 || x < 0 || x >= stairBoxes.length) return null;
      return [stairBoxes[x]];
    }
  };
  const fakeCanvas = {
    tabIndex: 0,
    style: { cursor: "" },
    addEventListener(): void {},
    requestPointerLock(): void {},
    focus(): void {}
  } as unknown as HTMLElement;

  try {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const player = new PlayerController(camera, fakeCanvas, stairWorld);
    player.active = true;

    player.moveAxis("x", 0.6);
    player.update(0.03);
    assert(
      player.getFeetY() > 0 && player.getFeetY() < 1 / 3,
      "first one-sub-block stair should begin with a smooth lift instead of a snap"
    );
    player.update(1);
    assertClose(player.getFeetY(), 1 / 3, 0.000001, "first one-sub-block stair should step up");

    player.moveAxis("x", 0.7);
    player.update(0.03);
    assert(
      player.getFeetY() > 1 / 3 && player.getFeetY() < 2 / 3,
      "second one-sub-block stair should also ease upward"
    );
    player.update(1);
    assertClose(player.getFeetY(), 2 / 3, 0.000001, "second one-sub-block stair should step up");

    player.moveAxis("x", 1);
    player.update(0.03);
    assert(
      player.getFeetY() > 2 / 3 && player.getFeetY() < 1,
      "third one-sub-block stair should ease into the full-block height"
    );
    player.update(1);
    assertClose(player.getFeetY(), 1, 0.000001, "third one-sub-block stair should complete the block climb");
    assert(camera.position.x > 1.8, "horizontal movement should keep advancing across the partial stair run");
    player.dispose();
  } finally {
    if (originalDocument) globals.document = originalDocument;
    else delete globals.document;
  }
});

test("player movement vaults medium ledges only while sprinting", () => {
  const originalDocument = (globalThis as { document?: Document }).document;
  const globals = globalThis as { document?: Document };
  globals.document = {
    pointerLockElement: null,
    body: {
      classList: {
        toggle(): boolean {
          return false;
        }
      }
    },
    addEventListener(): void {},
    exitPointerLock(): void {}
  } as unknown as Document;

  const mediumLedgeBox: CollisionBounds = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 2 / 3,
    minZ: 0,
    maxZ: 1
  };
  const ledgeWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [mediumLedgeBox] : null;
    }
  };
  const fakeCanvas = {
    tabIndex: 0,
    style: { cursor: "" },
    addEventListener(): void {},
    requestPointerLock(): void {},
    focus(): void {}
  } as unknown as HTMLElement;

  try {
    const blockedCamera = new THREE.PerspectiveCamera();
    blockedCamera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const blockedPlayer = new PlayerController(blockedCamera, fakeCanvas, ledgeWorld);
    blockedPlayer.onGround = true;
    blockedPlayer.moveAxis("x", 0.6);
    assertClose(blockedCamera.position.x, -0.45, 0.000001, "two-sub-block ledges should block without sprint vaulting");
    assertClose(blockedPlayer.getFeetY(), 0, 0.000001, "blocked medium ledges should not lift the player");
    blockedPlayer.dispose();

    const vaultCamera = new THREE.PerspectiveCamera();
    vaultCamera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const vaultPlayer = new PlayerController(vaultCamera, fakeCanvas, ledgeWorld);
    vaultPlayer.active = true;
    vaultPlayer.onGround = true;
    vaultPlayer.velocity.x = 7;
    vaultPlayer.keys.add("ShiftLeft");
    vaultPlayer.moveAxis("x", 0.6);
    assert(vaultCamera.position.x > 0.1, "sprint vault should preserve the horizontal move onto a medium ledge");
    assertClose(vaultPlayer.getFeetY(), 0, 0.000001, "sprint vault should animate upward instead of snapping to the ledge");
    vaultPlayer.update(1);
    assertClose(vaultPlayer.getFeetY(), 2 / 3, 0.000001, "sprint vault should finish on the medium ledge");
    assertClose(vaultPlayer.velocity.x, 7, 0.000001, "sprint vault should not zero horizontal momentum");
    vaultPlayer.dispose();
  } finally {
    if (originalDocument) globals.document = originalDocument;
    else delete globals.document;
  }
});

test("player movement clambers onto reachable full-block ledges only while jump is held", () => {
  const originalDocument = (globalThis as { document?: Document }).document;
  const globals = globalThis as { document?: Document };
  globals.document = {
    pointerLockElement: null,
    body: {
      classList: {
        toggle(): boolean {
          return false;
        }
      }
    },
    addEventListener(): void {},
    exitPointerLock(): void {}
  } as unknown as Document;

  const twoBlockWall: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && z === 0 && (y === 0 || y === 1);
    }
  };
  const tooTallWall: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && z === 0 && (y === 0 || y === 1 || y === 2);
    }
  };
  const fakeCanvas = {
    tabIndex: 0,
    style: { cursor: "" },
    addEventListener(): void {},
    requestPointerLock(): void {},
    focus(): void {}
  } as unknown as HTMLElement;

  try {
    const reachableCamera = new THREE.PerspectiveCamera();
    reachableCamera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const reachablePlayer = new PlayerController(reachableCamera, fakeCanvas, twoBlockWall);
    reachablePlayer.moveAxis("x", 0.6);
    assertClose(
      reachableCamera.position.x,
      -0.45,
      0.000001,
      "reachable wall should block when jump is not held"
    );
    assertClose(reachablePlayer.getFeetY(), 0, 0.000001, "reachable wall should not clamber without jump intent");
    reachablePlayer.dispose();

    const jumpClamberCamera = new THREE.PerspectiveCamera();
    jumpClamberCamera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const jumpClamberPlayer = new PlayerController(jumpClamberCamera, fakeCanvas, twoBlockWall);
    jumpClamberPlayer.keys.add("Space");
    jumpClamberPlayer.moveAxis("x", 0.6);
    assertClose(
      jumpClamberCamera.position.x,
      -0.45,
      0.000001,
      "reachable wall contact should begin from the safe pre-clamber position"
    );
    assertClose(
      jumpClamberPlayer.getFeetY(),
      0,
      0.000001,
      "reachable wall should not snap to the final clamber height immediately"
    );

    jumpClamberPlayer.active = true;
    jumpClamberPlayer.update(0.08);
    assert(
      jumpClamberPlayer.getFeetY() > 0 && jumpClamberPlayer.getFeetY() < 2.002,
      `reachable wall clamber should animate upward before reaching the target ledge (feet ${jumpClamberPlayer.getFeetY()})`
    );

    jumpClamberPlayer.update(1);
    assert(jumpClamberCamera.position.x > 0.1, "reachable wall clamber should finish the horizontal move");
    assertClose(
      jumpClamberPlayer.getFeetY(),
      2.002,
      0.000001,
      "reachable wall should clamber just above the top surface"
    );
    jumpClamberPlayer.dispose();

    const airGrabCamera = new THREE.PerspectiveCamera();
    airGrabCamera.position.set(-0.45, PLAYER_HEIGHT + 0.2, 0.5);
    const airGrabPlayer = new PlayerController(airGrabCamera, fakeCanvas, twoBlockWall);
    airGrabPlayer.keys.add("Space");
    airGrabPlayer.velocity.y = -3;
    airGrabPlayer.moveAxis("x", 0.6);
    airGrabPlayer.active = true;
    airGrabPlayer.update(1);
    assert(airGrabCamera.position.x > 0.1, "falling while holding jump should grab and climb a reachable ledge");
    assertClose(airGrabPlayer.getFeetY(), 2.002, 0.000001, "air clamber should finish on the ledge top");
    airGrabPlayer.dispose();

    const longJumpCamera = new THREE.PerspectiveCamera();
    longJumpCamera.position.set(-0.78, PLAYER_HEIGHT + 0.2, 0.5);
    const longJumpPlayer = new PlayerController(longJumpCamera, fakeCanvas, twoBlockWall);
    longJumpPlayer.keys.add("Space");
    longJumpPlayer.velocity.y = -3;
    longJumpPlayer.moveAxis("x", 0.4, false);
    assertClose(
      longJumpCamera.position.x,
      -0.38,
      0.000001,
      "near-miss air grab should begin from the safe long-jump position instead of snapping forward"
    );
    longJumpPlayer.active = true;
    longJumpPlayer.update(1);
    assert(
      longJumpCamera.position.x > 0.1,
      "falling near a ledge while holding jump should grab even before direct body collision"
    );
    assertClose(
      longJumpPlayer.getFeetY(),
      2.002,
      0.000001,
      "near-miss air grab should finish on the ledge top"
    );
    longJumpPlayer.dispose();

    const blockedCamera = new THREE.PerspectiveCamera();
    blockedCamera.position.set(-0.45, PLAYER_HEIGHT, 0.5);
    const blockedPlayer = new PlayerController(blockedCamera, fakeCanvas, tooTallWall);
    blockedPlayer.keys.add("Space");
    blockedPlayer.moveAxis("x", 0.6);
    assertClose(blockedCamera.position.x, -0.45, 0.000001, "too-tall ledge should still block horizontal movement");
    assertClose(blockedPlayer.getFeetY(), 0, 0.000001, "too-tall ledge should not clamber beyond head reach");
    blockedPlayer.dispose();
  } finally {
    if (originalDocument) globals.document = originalDocument;
    else delete globals.document;
  }
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

  for (let hit = 0; hit < getTerrainMaxHealth(BLOCK.stone); hit += PARTIAL_BLOCK_CORE_DAMAGE) {
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
  const uvs = mesh.geometry.getAttribute("uv");
  const textureTiles = mesh.geometry.getAttribute("blockTextureTile");
  const bounds = new THREE.Box3().setFromBufferAttribute(positions);

  assert(positions.count > 0, "the neighbor of a carved cell should expose a visible terrain face");
  assertEqual(uvs.count, positions.count, "chunk mesh UVs should match every terrain vertex");
  assertEqual(
    textureTiles.count,
    positions.count,
    "chunk mesh texture tile ids should match every terrain vertex"
  );
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
  assertEqual(BLOCK_FRAGMENT_COUNT, 27, "block fracture grid should create 27 source cells");

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

test("block material rules keep HP, mining cadence, and debris flavor keyed by block", () => {
  const allKnownRuleKeys = Object.keys(BLOCK_MATERIAL_RULES).map(Number).sort((left, right) => left - right);
  const allBlockIds = Object.values(BLOCK).sort((left, right) => left - right);
  assertDeepEqual(allKnownRuleKeys, allBlockIds, "material rules should cover every declared BlockId");
  assertEqual(TERRAIN_DAMAGE_SCALE, 270, "terrain HP should scale old material HP into editor-grade integer pools");
  assertEqual(
    TERRAFORMER_SUBCELL_DAMAGE_SCALE,
    10,
    "Terraformer sub-cell HP should be one twenty-seventh of the scaled block HP"
  );

  const expectedRules = [
    {
      block: BLOCK.leaves,
      health: 3,
      cadence: "very-fast",
      tickSeconds: 0.08,
      flavor: "light-shredded",
      shapeIds: ["narrow-shard", "flat-slab", "long-splinter"],
      visualScaleMultiplier: 0.78,
      ejectionSpeedMultiplier: 0.82,
      upwardSpeedMultiplier: 0.9
    },
    {
      block: BLOCK.bush,
      health: 2,
      cadence: "very-fast",
      tickSeconds: 0.08,
      flavor: "light-shredded",
      shapeIds: ["flat-slab", "narrow-shard", "long-splinter"],
      visualScaleMultiplier: 0.68,
      ejectionSpeedMultiplier: 0.76,
      upwardSpeedMultiplier: 0.82
    },
    {
      block: BLOCK.moss,
      health: 4,
      cadence: "fast",
      tickSeconds: 0.12,
      flavor: "soft-low-spray",
      shapeIds: ["flat-slab", "chunky-chip", "squat-block"],
      visualScaleMultiplier: 0.74,
      ejectionSpeedMultiplier: 0.62,
      upwardSpeedMultiplier: 0.48
    },
    {
      block: BLOCK.sand,
      health: 5,
      cadence: "fast",
      tickSeconds: 0.12,
      flavor: "soft-low-spray",
      shapeIds: ["flat-slab", "squat-block", "chunky-chip"],
      visualScaleMultiplier: 0.82,
      ejectionSpeedMultiplier: 0.68,
      upwardSpeedMultiplier: 0.48
    },
    {
      block: BLOCK.grass,
      health: 6,
      cadence: "quick",
      tickSeconds: 0.16,
      flavor: "moderate-chunks",
      shapeIds: ["chunky-chip", "squat-block", "sheared-chunk"],
      visualScaleMultiplier: 1,
      ejectionSpeedMultiplier: 1,
      upwardSpeedMultiplier: 1
    },
    {
      block: BLOCK.dirt,
      health: 8,
      cadence: "medium",
      tickSeconds: 0.22,
      flavor: "heavier-chunks",
      shapeIds: ["squat-block", "chunky-chip", "sheared-chunk", "corner-chunk"],
      visualScaleMultiplier: 1.08,
      ejectionSpeedMultiplier: 0.9,
      upwardSpeedMultiplier: 0.82
    },
    {
      block: BLOCK.ember,
      health: 10,
      cadence: "medium-hard",
      tickSeconds: 0.28,
      flavor: "sharp-hot-ejection",
      shapeIds: ["narrow-shard", "wedge", "sheared-chunk", "corner-chunk"],
      visualScaleMultiplier: 1,
      ejectionSpeedMultiplier: 1.18,
      upwardSpeedMultiplier: 1.16
    },
    {
      block: BLOCK.wood,
      health: 12,
      cadence: "slow",
      tickSeconds: 0.36,
      flavor: "splinter-biased",
      shapeIds: ["long-splinter", "narrow-shard", "wedge"],
      visualScaleMultiplier: 0.95,
      ejectionSpeedMultiplier: 1.05,
      upwardSpeedMultiplier: 0.95
    },
    {
      block: BLOCK.stone,
      health: 16,
      cadence: "slowest",
      tickSeconds: 0.45,
      flavor: "heavy-angular",
      shapeIds: ["corner-chunk", "wedge", "sheared-chunk", "chunky-chip"],
      visualScaleMultiplier: 1.12,
      ejectionSpeedMultiplier: 0.82,
      upwardSpeedMultiplier: 0.72
    },
    {
      block: BLOCK.rubble,
      health: 4,
      cadence: "quick",
      tickSeconds: 0.16,
      flavor: "muted",
      shapeIds: ["squat-block", "flat-slab", "chunky-chip"],
      visualScaleMultiplier: 0.72,
      ejectionSpeedMultiplier: 0.55,
      upwardSpeedMultiplier: 0.5
    }
  ] as const;

  for (const expected of expectedRules) {
    const blockName = BLOCKS[expected.block].name;
    const rule = getBlockMaterialRule(expected.block);
    const debrisProfile = getDebrisSpawnProfile(expected.block);

    assertEqual(BLOCKS[expected.block].health, expected.health, `${blockName} BLOCKS HP should match its material`);
    assertEqual(rule.health, expected.health, `${blockName} material HP should stay explicit`);
    assertEqual(
      getTerrainMaxHealth(expected.block),
      expected.health * TERRAIN_DAMAGE_SCALE,
      `${blockName} runtime terrain HP should be material-scaled`
    );
    assertEqual(
      getTerraformerSubCellHealth(expected.block),
      expected.health * TERRAFORMER_SUBCELL_DAMAGE_SCALE,
      `${blockName} Terraformer sub-cell HP should be material-scaled`
    );
    assertEqual(rule.miningCadence, expected.cadence, `${blockName} mining cadence should stay material-specific`);
    assertEqual(getMiningTickSeconds(expected.block), expected.tickSeconds, `${blockName} mining tick should be explicit`);
    assertEqual(
      getMiningDamageAmount(expected.block),
      expected.health * TERRAFORMER_SUBCELL_DAMAGE_SCALE,
      `${blockName} legacy mining damage helper should now alias Terraformer sub-cell HP`
    );
    assertEqual(debrisProfile.flavor, expected.flavor, `${blockName} debris flavor should match the material`);
    assertDeepEqual(
      [...debrisProfile.preferredShapeIds],
      [...expected.shapeIds],
      `${blockName} debris shapes should preserve the intended bias`
    );
    assertEqual(
      debrisProfile.visualScaleMultiplier,
      expected.visualScaleMultiplier,
      `${blockName} debris visual scale should stay material-specific`
    );
    assertEqual(
      debrisProfile.ejectionSpeedMultiplier,
      expected.ejectionSpeedMultiplier,
      `${blockName} debris ejection speed should stay material-specific`
    );
    assertEqual(
      debrisProfile.upwardSpeedMultiplier,
      expected.upwardSpeedMultiplier,
      `${blockName} debris upward speed should stay material-specific`
    );
  }

  assertEqual(getBlockMaterialRule(999).block, BLOCK.air, "unknown block ids should fall back to the inert rule");
  assertEqual(getMiningDamageAmount(BLOCK.air), 0, "air should not spend mining damage");
  assertEqual(getMiningTickSeconds(BLOCK.air), 0, "air should not schedule mining ticks");
});

test("Terraformer size helpers clamp, step, and format editor brush dimensions", () => {
  assertEqual(TERRAFORMER_SIZE_MIN, 1, "Terraformer brush size should start at one sub-cell");
  assertEqual(TERRAFORMER_SIZE_MAX, 4, "Terraformer brush size should stay intentionally small this pass");
  assertEqual(normalizeTerraformerSize(-100), 1, "Terraformer size should clamp low values");
  assertEqual(normalizeTerraformerSize(999), 4, "Terraformer size should clamp high values");
  assertEqual(stepTerraformerSize(1, "decrease"), 1, "Terraformer size should not step below its minimum");
  assertEqual(stepTerraformerSize(3, "increase"), 4, "Terraformer size should step upward by one sub-cell axis");
  assertEqual(formatTerraformerSize(1), "1 sub-cell", "one-cell brushes should use singular copy");
  assertEqual(formatTerraformerSize(3), "3x3x3 sub-cells", "larger brushes should display their full cubic size");
});

test("material debris profiles deterministically bias shard shape helpers", () => {
  const seed = {
    fragmentIndex: 7,
    distributedFragmentIndex: 12,
    origin: { x: -3, y: 5, z: 11 }
  };

  assertEqual(
    selectDebrisShapeIdForBlock(BLOCK.wood, seed),
    selectDebrisShapeIdForBlock(BLOCK.wood, seed),
    "material-biased shape selection should be deterministic for the same seed"
  );

  const woodProfile = getDebrisSpawnProfile(BLOCK.wood);
  const woodShapeIds = new Set<ReturnType<typeof selectDebrisShapeIdForBlock>>();
  for (let index = 0; index < 24; index += 1) {
    woodShapeIds.add(selectDebrisShapeIdForBlock(BLOCK.wood, {
      fragmentIndex: index,
      distributedFragmentIndex: getDistributedBlockFragmentIndex(index, 24),
      origin: { x: index - 4, y: 2, z: 9 }
    }));
  }
  assert(woodShapeIds.size > 1, "wood debris should still vary within its splinter-biased profile");
  for (const shapeId of woodShapeIds) {
    assert(
      woodProfile.preferredShapeIds.includes(shapeId),
      "wood debris should select only splinter-biased shape ids"
    );
  }

  const stoneShape = createDebrisShapeForBlock(BLOCK.stone, seed);
  assert(
    getDebrisSpawnProfile(BLOCK.stone).preferredShapeIds.includes(stoneShape.shapeId),
    "stone debris should choose from heavy angular shape ids"
  );
  assert(
    stoneShape.estimatedVisualVolume > 0,
    "material-biased debris shape creation should still return a usable visual volume"
  );
  const fittedStoneShape = fitDebrisShapeToVolumeBudget(stoneShape, 0.01);
  assert(
    !fittedStoneShape || fittedStoneShape.estimatedVisualVolume <= 0.010001,
    "material debris shape bias should leave volume-budget fitting in charge"
  );

  assertEqual(
    selectDebrisShapeIdForBlock(999, seed),
    selectDebrisShapeIdForBlock(BLOCK.air, seed),
    "unknown block debris should reuse the inert fallback profile"
  );
});

test("quality-scaled block fracture counts sample the full debris grid", () => {
  assertEqual(normalizeBlockFragmentCount(-1), 1, "fragment count should keep at least one shard");
  assertEqual(
    normalizeBlockFragmentCount(999),
    BLOCK_DEBRIS_MAX_FRAGMENT_COUNT,
    "visible debris count should clamp to the VFX shard limit"
  );

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
    BLOCK_FRAGMENT_COUNT,
    "high-quality debris should cover every damage-lattice source cell"
  );

  const superUltraIndexes = new Set<number>();
  for (let index = 0; index < QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount; index += 1) {
    superUltraIndexes.add(getDistributedBlockFragmentIndex(
      index,
      QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount
    ));
  }
  assertEqual(
    superUltraIndexes.size,
    BLOCK_FRAGMENT_COUNT,
    "extra-high visible debris should reuse every 3x3x3 source cell instead of expanding the damage lattice"
  );

  for (const fragmentCount of [4, 12, BLOCK_FRAGMENT_COUNT, 54, BLOCK_DEBRIS_MAX_FRAGMENT_COUNT]) {
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
    if (fragmentCount >= BLOCK_FRAGMENT_COUNT) {
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
    getMinimumDebrisFragmentCountForMaterialUnits(BLOCK_RUBBLE_MATERIAL_UNITS),
    BLOCK_DEBRIS_MIN_FRAGMENT_COUNT,
    "one full block needs at least 39 shards when each shard is capped below one subvoxel"
  );
  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS, true),
    39,
    "a whole-block fracture should add shards when the requested visible count would make pieces too massive"
  );
  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS * 0.1, true),
    4,
    "a nearly-empty final fracture should still split material below the per-shard cap"
  );
  assertEqual(
    getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, BLOCK_RUBBLE_MATERIAL_UNITS, false),
    39,
    "non-final chip hits should override the soft chip cap if a large material slice would make oversized pieces"
  );
  assertEqual(
    getTerrainImpactFragmentCount(QUALITY_PRESETS.potato.blockFragmentCount, BLOCK_RUBBLE_MATERIAL_UNITS * 0.1, false),
    6,
    "Potato one-damage chip hits should split into more than the old fixed four-piece burst"
  );
  assert(
    getTerrainImpactFragmentCount(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount, 0.1, false) >
      getTerrainImpactFragmentCount(QUALITY_PRESETS.potato.blockFragmentCount, 0.1, false),
    "the break-debris slider should visibly increase ordinary chip burst counts"
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
    assert(
      carriedUnits / fragmentCount <= BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT + 0.000001,
      "terrain debris should keep each visible shard below the subvoxel mass cap"
    );
  }
});

test("aggressive debris shapes stay inside the ejected material volume budget", () => {
  assertEqual(getTerrainImpactFragmentCount(BLOCK_FRAGMENT_COUNT, 0, false), 0, "zero material should spawn no debris");
  assertEqual(fitDebrisShapeToVolumeBudget(createDebrisShape("chunky-chip"), 0), null, "zero visual volume should fit no shard");

  for (const maxVisibleFragments of [
    QUALITY_PRESETS.potato.blockFragmentCount,
    QUALITY_PRESETS.normal.blockFragmentCount,
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount
  ]) {
    for (const materialUnits of [0.04, 0.1, 0.27, BLOCK_RUBBLE_MATERIAL_UNITS]) {
      const fragmentCount = getTerrainImpactFragmentCount(maxVisibleFragments, materialUnits, materialUnits <= 0.1);
      let remainingVolume = materialUnits;
      let totalVisualVolume = 0;

      for (let index = 0; index < fragmentCount; index += 1) {
        const perPieceMaterialUnits = getBlockFragmentMaterialUnits(index, fragmentCount, materialUnits);
        const shape = createDebrisShapeForBlock(BLOCK.stone, {
          fragmentIndex: index,
          distributedFragmentIndex: getDistributedBlockFragmentIndex(index, fragmentCount),
          origin: { x: 11, y: 7, z: -3 }
        });
        assert(
          perPieceMaterialUnits <= BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT + 0.000001,
          "spawned shard material should stay under 70 percent of a source subvoxel"
        );
        const fittedShape = fitDebrisShapeToVolumeBudget(
          shape,
          Math.min(remainingVolume, perPieceMaterialUnits, BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT)
        );
        if (!fittedShape) continue;
        assert(
          fittedShape.estimatedVisualVolume <= BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT + 0.000001,
          "fitted shard visuals should stay under the per-piece volume cap"
        );
        assert(
          Math.max(fittedShape.visualScale.x, fittedShape.visualScale.y, fittedShape.visualScale.z) <=
            BLOCK_DEBRIS_MAX_VISUAL_AXIS + 0.000001,
          "fitted shard visuals should stay below the per-axis size cap"
        );
        totalVisualVolume += fittedShape.estimatedVisualVolume;
        remainingVolume -= fittedShape.estimatedVisualVolume;
      }

      assert(
        totalVisualVolume <= materialUnits + 0.000001,
        "fitted shard AABB volumes should never exceed the removed terrain material"
      );
    }
  }

  const fullQualityScales: number[] = [];
  for (let index = 0; index < BLOCK_FRAGMENT_COUNT; index += 1) {
    const shape = createDebrisShapeForBlock(BLOCK.grass, {
      fragmentIndex: index,
      distributedFragmentIndex: getDistributedBlockFragmentIndex(index, BLOCK_FRAGMENT_COUNT),
      origin: { x: 2, y: 4, z: 6 }
    });
    fullQualityScales.push(shape.visualScale.x, shape.visualScale.y, shape.visualScale.z);
  }
  const minScale = Math.min(...fullQualityScales);
  const maxScale = Math.max(...fullQualityScales);
  assert(
    maxScale / minScale > 2.5,
    "aggressive shard randomization should produce a visibly wide scale range"
  );
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
  instancer.setBlockLightRange(1, 15);
  instancer.update(
    [grassFragment, secondGrassFragment, stoneFragment],
    (position) => 6 + position.x * 2
  );

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
  for (const mesh of instancedMeshes) {
    const blockLights = mesh.geometry.getAttribute("fragmentBlockLight");
    assert(
      blockLights instanceof THREE.InstancedBufferAttribute,
      "each debris batch should own a capacity-matched per-instance block-light buffer"
    );
    assert(
      (blockLights.getX(0) ?? 0) >= 6,
      "visible debris should upload the cached voxel light sampled at its world position"
    );
  }
  grassFragment.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  instancer.update([grassFragment], () => 11);
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
  assertEqual(
    grassBatch.geometry.getAttribute("fragmentBlockLight").getX(0),
    11,
    "debris light attributes should follow moving fragment samples on later frames"
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

test("settled debris cleanup stays visible until the poof expiry", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  sleepTestFragment(fragment);
  ageTestFragmentPastGroundDebrisBurstGrace(fragment);

  fragment.updateGroundDebrisCleanup(0.2, 1);
  assert(!fragment.isExpired, "freshly settled cleanup debris should remain visible at first");
  assert(fragment.isFragmentRenderVisible, "cleanup debris should stay visible at first");

  fragment.updateGroundDebrisCleanup(0.5, 1);
  assert(!fragment.isExpired, "cleanup debris should still wait for the configured lifetime");
  assert(fragment.isFragmentRenderVisible, "cleanup debris should stay steady before expiration");

  fragment.updateGroundDebrisCleanup(0.2, 1);
  assert(!fragment.isExpired, "cleanup debris should stay present until the final poof");
  assert(fragment.isFragmentRenderVisible, "cleanup debris should not hide for a countdown flash");

  fragment.updateGroundDebrisCleanup(0.15, 1);
  assert(fragment.isExpired, "cleanup debris should expire once its grounded lifetime elapses");
});

test("forever debris lifetime keeps settled fragments renderable", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);
  sleepTestFragment(fragment);
  ageTestFragmentPastGroundDebrisBurstGrace(fragment);

  fragment.updateGroundDebrisCleanup(120, null);

  assert(!fragment.isExpired, "forever cleanup should not expire settled debris");
  assert(fragment.isFragmentRenderVisible, "forever cleanup should keep debris visible");
});

test("zero debris lifetime preserves the break burst before grounded cleanup", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 1.1, 0.5);

  fragment.updateGroundDebrisCleanup(10, 0, true);
  assert(!fragment.isExpired, "0s lifetime should not erase a freshly spawned grounded burst shard");

  ageTestFragmentPastGroundDebrisBurstGrace(fragment);
  fragment.updateGroundDebrisCleanup(0, 0, true);
  assert(fragment.isExpired, "0s lifetime should expire grounded debris after the burst grace window");
});

test("debris cleanup pauses again when grounded debris is knocked airborne", () => {
  const fragment = createTestFragment(BLOCK.dirt, 0.5, 3.1, 0.5);
  ageTestFragmentPastGroundDebrisBurstGrace(fragment);

  fragment.updateGroundDebrisCleanup(10, 1, false);
  assert(!fragment.isExpired, "airborne debris should not consume its cleanup lifetime");
  assert(fragment.isFragmentRenderVisible, "airborne debris should stay renderable before first ground contact");

  fragment.updateGroundDebrisCleanup(0.5, 1, true);
  assert(!fragment.isExpired, "grounded debris should start its cleanup clock");

  fragment.updateGroundDebrisCleanup(0.6, 1, false);
  assert(!fragment.isExpired, "cleanup should pause when support changes knock debris back airborne");

  fragment.updateGroundDebrisCleanup(0.6, 1, true);
  assert(!fragment.isExpired, "resumed grounded cleanup should restart from the paused airborne state");

  fragment.updateGroundDebrisCleanup(0.45, 1, true);
  assert(fragment.isExpired, "cleanup should expire after a full quiet grounded lifetime");
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

test("stuck debris cleanup detects partial-block traps without expiring open-ground debris", () => {
  const partialTrapWorld = {
    isSolid: (_x: number, _y: number, _z: number) => false,
    isPartialBlock: (x: number, y: number, z: number) => x === 2 && y === 3 && z === 4
  };
  const openGroundWorld = {
    isSolid: (_x: number, y: number, _z: number) => y === 0,
    isPartialBlock: () => false
  };

  assert(
    isDebrisTrappedForCleanup(partialTrapWorld, { x: 2.5, y: 3.5, z: 4.5 }, 0.08),
    "debris centered inside a partial terrain cell should count as trapped"
  );
  assert(
    !isDebrisTrappedForCleanup(openGroundWorld, { x: 2.5, y: 1.08, z: 4.5 }, 0.08),
    "debris resting on open ground should not count as trapped just because it has floor support"
  );
});

test("stuck debris cleanup can override forever lifetime for trapped fragments", () => {
  const tracker = new DebrisStuckCleanupTracker();
  const trappedFragment = createTestFragment(BLOCK.stone, 2.5, 3.5, 4.5);
  const trapWorld = {
    isSolid: (_x: number, _y: number, _z: number) => false,
    isPartialBlock: (x: number, y: number, z: number) => x === 2 && y === 3 && z === 4
  };
  trappedFragment.update(0.5, { isSolid: () => false });
  trappedFragment.mesh.position.set(2.5, 3.5, 4.5);
  trappedFragment.velocity.set(0, 0, 0);
  trappedFragment.angularVelocity.set(0, 0, 0);
  trappedFragment.updateGroundDebrisCleanup(
    120,
    getEffectiveGroundDebrisLifetimeSeconds(FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS),
    false
  );

  assert(!trappedFragment.isExpired, "forever lifetime should not expire a fragment through the normal timer");
  assert(!tracker.shouldExpire(trappedFragment, 0.2, trapWorld), "freshly detected trapped debris should get a short grace beat");
  assert(
    tracker.shouldExpire(trappedFragment, 0.2, trapWorld),
    "trapped quiet debris should be eligible for forced poof cleanup even when lifetime is forever"
  );

  const openFragment = createTestFragment(BLOCK.grass, 2.5, 1.08, 4.5);
  sleepTestFragment(openFragment);
  assert(
    !tracker.shouldExpire(openFragment, 1, {
      isSolid: (_x: number, y: number, _z: number) => y === 0,
      isPartialBlock: () => false
    }),
    "open-ground sleeping debris should stay under normal lifetime rules"
  );
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

test("rigid debris admission caps bodies while preserving representative burst shards", () => {
  const fragments: RigidDebrisAdmissionFragment[] = [
    { position: { x: -1, y: 0.4, z: -1 }, velocity: { x: 12, y: -3, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    { position: { x: 1, y: 0.4, z: -1 }, velocity: { x: 11, y: -2, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    { position: { x: -1, y: 0.4, z: 1 }, velocity: { x: 10, y: -1, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    { position: { x: 1, y: 0.4, z: 1 }, velocity: { x: 9, y: -1, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    { position: { x: -1, y: 1.8, z: -1 }, velocity: { x: 0, y: 1, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    { position: { x: 1, y: 1.8, z: -1 }, velocity: { x: 0, y: 1, z: 0 }, materialUnits: 1, halfExtents: { x: 0.1, y: 0.1, z: 0.1 } }
  ];

  const selected = selectRigidDebrisAdmissionIndices(fragments, 3, {
    cameraPosition: { x: 0, y: 1, z: 0 },
    burstCenter: { x: 0, y: 1, z: 0 },
    activeRadiusMeters: 8,
    supportHeightFor: () => 0,
    corePositions: [{ x: 0.8, y: 0.4, z: -1 }]
  });

  assertEqual(selected.size, 3, "admission should hard-cap selected Rapier bodies");
  assert(selected.has(0), "fast falling support-adjacent shards should be admitted");
  assert(selected.has(1), "core-adjacent shards should be admitted");
  assert(
    Array.from(selected).some((index) => fragments[index]?.position.z === 1),
    "admission should keep the physical burst representative instead of choosing one dense corner"
  );
});

test("rigid debris admission keeps pending rigid shards out of VFX settling regions", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  const settler = new DebrisSettler();
  const admittedShard = createTestFragment(BLOCK.grass, 0.35, 1.2, 0.35);
  const deniedShard = createTestFragment(BLOCK.grass, 0.65, 1.2, 0.65);
  await rigidDebris.initialize();

  const admission = partitionRigidDebrisAdmission(
    [admittedShard, deniedShard],
    new Set([0])
  );
  for (const shard of admission.admitted) {
    rigidDebris.registerFragment(shard);
  }
  // registerFragment queues the Rapier body and the public rigid flag flips
  // only after the next adapter update. The spawn path must use the explicit
  // admission partition, not this delayed flag, or admitted shards get mixed
  // into VFX settler regions again.
  assert(
    !admittedShard.isRigidDebrisDriven,
    "pending rigid admission should not already look Rapier-driven"
  );

  settler.registerFracture(BLOCK.grass, new THREE.Vector3(0.5, 1.2, 0.5), admission.denied);

  assert(!settler.owns(admittedShard), "Rapier-admitted shards should not be VFX-settler-owned");
  assert(settler.owns(deniedShard), "denied overflow shards should keep the VFX-settler lifecycle");
  assertEqual(admission.denied.length, 1, "partition should preserve the denied overflow count for telemetry");

  rigidDebris.clear();
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
  assertClose(
    rubbleStats.pieces,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    0.000001,
    "Potato's mass-safe visible shards should still deposit one full block of rubble material"
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

test("rigid debris adapter rejects non-finite fragments before Rapier registration", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const corruptFragment = PhysicsToy.createBlockFragment(
    BLOCK.dirt,
    new THREE.Vector3(Number.NaN, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );

  rigidDebris.registerFragment(corruptFragment);
  const stats = rigidDebris.update(1 / 60, { isSolid: () => false });

  assert(corruptFragment.isExpired, "corrupt debris should leave through normal pruning instead of entering Rapier");
  assertEqual(stats.bodies, 0, "invalid debris should not create a Rapier rigid body");
  assertEqual(stats.rapierFailuresThisFrame, 0, "finite validation should prevent a Rapier-side fault");
  rigidDebris.clear();
});

test("rigid debris adapter recovers to cheap debris motion after a physics adapter fault", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 2.5, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );
  const throwingWorld: CollisionWorld = {
    isSolid(): boolean {
      throw new Error("synthetic support failure");
    }
  };

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    rigidDebris.registerFragment(fragment);
    const stats = rigidDebris.update(1 / 60, throwingWorld);

    assert(!fragment.isExpired, "a rigid adapter fault should preserve visible debris instead of poofing it");
    assert(!fragment.isRigidDebrisDriven, "recovered debris should detach from the failed Rapier world");
    assertEqual(stats.bodies, 0, "recovery should clear the failed Rapier body registry");
    assertEqual(stats.rapierFailuresThisFrame, 1, "recovery should surface a per-frame Rapier fault counter");
  } finally {
    console.warn = originalWarn;
    rigidDebris.clear();
  }
});

test("rigid debris adapter force-sleeps support-stable spinning shards", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shape = createDebrisShape("flat-slab");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0.5, shape.colliderHalfExtents.y + 0.004, 0.5),
    new THREE.Vector3(0.02, 0, 0),
    1,
    shape
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  // Repro for tiny "dancing" debris: the shard is visibly parked on terrain
  // but carries enough angular velocity that the angular quiet gate alone
  // never starts normal cleanup. Support-stable debris should still park.
  fragment.angularVelocity.set(8, 4, 6);
  rigidDebris.registerFragment(fragment);

  for (let frame = 0; frame < 70 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
  }

  assert(fragment.isSleeping, "support-stable high-spin debris should stop dancing and enter rigid sleep");
  assertEqual(fragment.angularVelocity.lengthSq(), 0, "force-slept dancing debris should have no residual spin");
  assertEqual(rigidDebris.getStats().sleepingBodies, 1, "the rigid adapter should report the parked shard as sleeping");
  rigidDebris.clear();
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

test("rigid debris adapter preserves ground colliders when many shards are high in the air", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  for (let index = 0; index < 80; index += 1) {
    rigidDebris.registerFragment(PhysicsToy.createBlockFragment(
      BLOCK.stone,
      new THREE.Vector3(index * 2 + 0.5, 24.5, 0.5),
      new THREE.Vector3(0, 0, 0),
      1
    ));
  }

  const nearGroundFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 0.28, 0.5),
    new THREE.Vector3(0, -1, 0),
    1
  );
  rigidDebris.registerFragment(nearGroundFragment);

  for (let frame = 0; frame < 90 && !nearGroundFragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, floorWorld);
  }

  assert(
    rigidDebris.getStats().terrainColliders > 0,
    "airborne shards should not spend the whole temporary collider budget on empty cells before ground debris gets support"
  );
  assert(
    rigidDebris.getStats().candidateCellsScanned < 200,
    `calm high airborne shards should not spend support scan work while grounded or falling shards need it; scanned ${rigidDebris.getStats().candidateCellsScanned} cells`
  );
  assert(
    nearGroundFragment.mesh.position.y > -0.05,
    "near-ground debris should keep a floor collider even when many earlier shards are airborne"
  );
  rigidDebris.clear();
});

test("rigid debris adapter deduplicates overlapping support-cell probes", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  for (let index = 0; index < 32; index += 1) {
    rigidDebris.registerFragment(PhysicsToy.createBlockFragment(
      BLOCK.stone,
      new THREE.Vector3(0.5, 0.28, 0.5),
      new THREE.Vector3(0, -1, 0),
      1
    ));
  }

  rigidDebris.update(1 / 60, floorWorld);
  const stats = rigidDebris.getStats();

  assert(stats.staticRefreshRan, "test setup should perform a static support refresh");
  assert(
    stats.terrainColliders > 0,
    "overlapping debris should still receive terrain support colliders"
  );
  assert(
    stats.candidateCellsScanned < 120,
    "overlapping debris should share per-cell support probes instead of repeating the same scan for every shard"
  );
  rigidDebris.clear();
});

test("rigid debris adapter nudges shallow terrain penetrations back onto support", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shape = createDebrisShape("squat-block");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, shape.colliderHalfExtents.y - 0.04, 0.5),
    new THREE.Vector3(0, -0.25, 0),
    1,
    shape
  );
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };

  rigidDebris.registerFragment(fragment);
  rigidDebris.update(1 / 60, floorWorld);

  assert(
    fragment.mesh.position.y - shape.colliderHalfExtents.y >= -0.01,
    "a small Rapier/support penetration should be lifted before stuck cleanup can classify the shard as trapped"
  );
  rigidDebris.clear();
});

test("rigid debris adapter uses partial-block lattice boxes instead of ghost full cubes", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shape = createDebrisShape("squat-block");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.4, 0.5),
    new THREE.Vector3(0, -0.25, 0),
    1,
    shape
  );
  const lowPartialBox = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const partialSurfaceWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    isPartialBlock(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [lowPartialBox] : null;
    }
  };

  rigidDebris.registerFragment(fragment);
  for (let frame = 0; frame < 240 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, partialSurfaceWorld);
  }

  const settledBottom = fragment.mesh.position.y - shape.colliderHalfExtents.y;
  assert(
    settledBottom >= lowPartialBox.maxY - 0.02,
    "partial-block debris should rest on the explicit surviving lattice surface"
  );
  assert(
    settledBottom < 0.55,
    "partial-block debris should not float on the old invisible one-meter macro-block top"
  );
  rigidDebris.clear();
});

test("VFX debris uses partial-block lattice boxes instead of ghost full cubes", () => {
  const shape = createDebrisShape("squat-block");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.4, 0.5),
    new THREE.Vector3(0, -0.25, 0),
    1,
    shape
  );
  const lowPartialBox = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const partialSurfaceWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    isPartialBlock(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [lowPartialBox] : null;
    }
  };

  for (let frame = 0; frame < 240 && !fragment.isSleeping; frame += 1) {
    fragment.update(1 / 60, partialSurfaceWorld);
  }

  const settledBottom = fragment.mesh.position.y - shape.colliderHalfExtents.y;
  assert(
    settledBottom >= lowPartialBox.maxY - 0.04,
    "VFX debris should rest on the explicit surviving lattice surface"
  );
  assert(
    settledBottom < 0.55,
    "VFX debris should not float on the old invisible one-meter macro-block top"
  );
});

test("VFX debris wakes from removed partial support before the settler can re-sleep it", () => {
  const shape = createDebrisShape("squat-block");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.4, 0.5),
    new THREE.Vector3(0, -0.25, 0),
    1,
    shape
  );
  const supportBox = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const supportedPartialWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    isPartialBlock(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [supportBox] : null;
    }
  };
  const removedSupportWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    isPartialBlock(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [] : null;
    }
  };

  for (let frame = 0; frame < 240 && !fragment.isSleeping; frame += 1) {
    fragment.update(1 / 60, supportedPartialWorld);
  }
  assert(fragment.isSleeping, "test setup should park VFX debris on explicit partial support");
  const sleepingY = fragment.mesh.position.y;

  assert(fragment.wakeFromTerrainSupportChange(), "removed sub-cell support should wake sleeping VFX debris");
  fragment.sleepInPlace(true);
  assert(
    !fragment.isSleeping,
    "settler sleep should not immediately undo a terrain-support wake before physics can re-test support"
  );

  for (let frame = 0; frame < 20; frame += 1) {
    fragment.update(1 / 60, removedSupportWorld);
  }

  assert(
    fragment.mesh.position.y < sleepingY - 0.1,
    "woken VFX debris should fall through removed partial support instead of resting on a ghost macro block"
  );
  assert(!fragment.isSleeping, "woken VFX debris should not re-sleep while unsupported");
});

test("rigid debris adapter wakes shards sleeping on stale partial-block macro support", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shape = createDebrisShape("squat-block");
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 1.35, 0.5),
    new THREE.Vector3(0, -0.1, 0),
    1,
    shape
  );
  const fullCubeWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    }
  };
  const lowPartialBox = {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1 / 3,
    minZ: 0,
    maxZ: 1
  };
  const partialSurfaceWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    isPartialBlock(x, y, z): boolean {
      return x === 0 && y === 0 && z === 0;
    },
    getCellCollisionBoxes(x, y, z): readonly CollisionBounds[] | null {
      return x === 0 && y === 0 && z === 0 ? [lowPartialBox] : null;
    }
  };

  rigidDebris.registerFragment(fragment);
  for (let frame = 0; frame < 240 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, fullCubeWorld);
  }
  assert(fragment.isSleeping, "test setup should first park the shard on the old macro-block top");
  assert(
    fragment.mesh.position.y - shape.colliderHalfExtents.y > 0.8,
    "test setup should begin with a shard visibly above the later partial surface"
  );

  for (let frame = 0; frame < 360; frame += 1) {
    rigidDebris.update(1 / 60, partialSurfaceWorld);
    const settledBottom = fragment.mesh.position.y - shape.colliderHalfExtents.y;
    if (fragment.isSleeping && settledBottom < 0.55) break;
  }

  const finalBottom = fragment.mesh.position.y - shape.colliderHalfExtents.y;
  assert(
    finalBottom < 0.55,
    "a sleeping shard should wake and fall when a damaged partial block replaces its stale full-cube support"
  );
  rigidDebris.clear();
});

test("rigid debris adapter wakes sleeping shards when their support terrain cell changes", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const shape = createDebrisShape("squat-block");
  const supportedFragment = PhysicsToy.createBlockFragment(
    BLOCK.sand,
    new THREE.Vector3(0.5, 1.35, 0.5),
    new THREE.Vector3(0, -0.1, 0),
    1,
    shape
  );
  const unrelatedFragment = PhysicsToy.createBlockFragment(
    BLOCK.sand,
    new THREE.Vector3(2.5, 1.35, 0.5),
    new THREE.Vector3(0, -0.1, 0),
    1,
    shape
  );
  const twoBlockWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return y === 0 && z === 0 && (x === 0 || x === 2);
    }
  };

  rigidDebris.registerFragment(supportedFragment);
  rigidDebris.registerFragment(unrelatedFragment);
  for (
    let frame = 0;
    frame < 240 && (!supportedFragment.isSleeping || !unrelatedFragment.isSleeping);
    frame += 1
  ) {
    rigidDebris.update(1 / 60, twoBlockWorld);
  }
  assert(supportedFragment.isSleeping, "test setup should park the target shard on terrain support");
  assert(unrelatedFragment.isSleeping, "test setup should park the unrelated shard on terrain support");

  const targetStartY = supportedFragment.mesh.position.y;
  const unrelatedStartY = unrelatedFragment.mesh.position.y;
  const woken = rigidDebris.wakeDebrisRestingOnChangedTerrainCells([{ x: 0, y: 0, z: 0 }]);
  const targetRemovedWorld: CollisionWorld = {
    isSolid(x, y, z): boolean {
      return y === 0 && z === 0 && x === 2;
    }
  };

  for (let frame = 0; frame < 90; frame += 1) {
    rigidDebris.update(1 / 60, targetRemovedWorld);
    if (supportedFragment.mesh.position.y < targetStartY - 0.2) break;
  }

  assertEqual(woken, 1, "support invalidation should wake only debris resting on the edited cell");
  assert(
    supportedFragment.mesh.position.y < targetStartY - 0.2,
    "woken debris should fall after the terrain support under it is removed"
  );
  assert(
    Math.abs(unrelatedFragment.mesh.position.y - unrelatedStartY) < 0.05,
    "debris resting on an unchanged support cell should stay parked"
  );
  rigidDebris.clear();
});

test("terrain support invalidation wakes detached sleeping VFX fragments", () => {
  const targetFragment = createTestFragment(BLOCK.sand, 0.5, 1.08, 0.5);
  const unrelatedFragment = createTestFragment(BLOCK.sand, 2.5, 1.08, 0.5);
  sleepTestFragment(targetFragment);
  sleepTestFragment(unrelatedFragment);
  const targetStartY = targetFragment.mesh.position.y;
  const unrelatedStartY = unrelatedFragment.mesh.position.y;

  const woken = wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
    [targetFragment, unrelatedFragment],
    [{ x: 0, y: 0, z: 0 }]
  );
  targetFragment.update(1 / 60, { isSolid: () => false });
  unrelatedFragment.update(1 / 60, { isSolid: () => false });

  assertEqual(woken, 1, "terrain invalidation should wake only detached debris over the changed support");
  assert(!targetFragment.isSleeping, "detached debris over changed support should leave cheap sleep");
  assert(
    targetFragment.mesh.position.y < targetStartY - 0.005,
    "woken detached debris should resume gravity after support changes"
  );
  assert(unrelatedFragment.isSleeping, "detached debris over unchanged support should stay asleep");
  assertClose(
    unrelatedFragment.mesh.position.y,
    unrelatedStartY,
    0.001,
    "unrelated detached debris should not move"
  );
});

test("terrain support invalidation wakes detached debris from remembered sleep support", () => {
  const targetFragment = createTestFragment(BLOCK.sand, 0.5, 1.08, 0.5);
  sleepTestFragment(targetFragment);

  // Regression coverage for the v0.11.2-era floating debris: after cheap
  // debris parking, visual/current overlap can drift away from the block that
  // actually caused sleep. Support removal must use the remembered sleep
  // support before falling back to current overlap guesses.
  targetFragment.mesh.position.x = 1.7;
  const woken = wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
    [targetFragment],
    [{ x: 0, y: 0, z: 0 }]
  );

  assertEqual(
    woken,
    1,
    "support invalidation should wake debris whose remembered sleep support was edited"
  );
  assert(!targetFragment.isSleeping, "remembered-support debris should leave cheap sleep");
});

test("terrain support invalidation wakes detached debris resting on a destroyed sub-block", () => {
  const targetFragment = createTestFragment(BLOCK.sand, 1 / 6, 1.08, 1 / 6);
  const sameMacroUnchangedSubCellFragment = createTestFragment(BLOCK.sand, 5 / 6, 1.08, 1 / 6);
  targetFragment.sleepInPlace(true);
  sameMacroUnchangedSubCellFragment.sleepInPlace(true);
  const targetStartY = targetFragment.mesh.position.y;
  const unrelatedStartY = sameMacroUnchangedSubCellFragment.mesh.position.y;

  const woken = wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
    [targetFragment, sameMacroUnchangedSubCellFragment],
    [{
      x: 0,
      y: 0,
      z: 0,
      bounds: {
        minX: 0,
        maxX: 1 / 3,
        minY: 2 / 3,
        maxY: 1,
        minZ: 0,
        maxZ: 1 / 3
      }
    }]
  );
  targetFragment.update(1 / 60, { isSolid: () => false });
  sameMacroUnchangedSubCellFragment.update(1 / 60, { isSolid: () => false });

  assertEqual(
    woken,
    1,
    "sub-block support invalidation should wake only debris resting over the destroyed support patch"
  );
  assert(!targetFragment.isSleeping, "debris over the destroyed sub-block should wake");
  assert(
    targetFragment.mesh.position.y < targetStartY - 0.005,
    "woken debris should start falling once its exact sub-block support is gone"
  );
  assert(
    sameMacroUnchangedSubCellFragment.isSleeping,
    "debris over another sub-cell in the same macro block should not wake from this exact support patch"
  );
  assertClose(
    sameMacroUnchangedSubCellFragment.mesh.position.y,
    unrelatedStartY,
    0.001,
    "unrelated same-block debris should stay parked"
  );
});

test("terrain support invalidation wakes detached stacked VFX fragments above changed support", () => {
  const lowerFragment = createTestFragment(BLOCK.sand, 0.5, 1.08, 0.5);
  const upperFragment = createTestFragment(BLOCK.sand, 0.56, 1.35, 0.52);
  const tooHighFragment = createTestFragment(BLOCK.sand, 0.5, 7.5, 0.5);
  sleepTestFragment(lowerFragment);

  // Clump sleep can park upper shards that are supported by other debris rather
  // than direct terrain. The invalidation path should wake that small local
  // column too, or the bottom shard falls away while the upper shard levitates.
  upperFragment.sleepInPlace(false);
  tooHighFragment.sleepInPlace(false);
  const lowerStartY = lowerFragment.mesh.position.y;
  const upperStartY = upperFragment.mesh.position.y;
  const tooHighStartY = tooHighFragment.mesh.position.y;

  const woken = wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(
    [lowerFragment, upperFragment, tooHighFragment],
    [{ x: 0, y: 0, z: 0 }]
  );
  lowerFragment.update(1 / 60, { isSolid: () => false });
  upperFragment.update(1 / 60, { isSolid: () => false });
  tooHighFragment.update(1 / 60, { isSolid: () => false });

  assertEqual(woken, 2, "support invalidation should wake the local detached support stack");
  assert(
    lowerFragment.mesh.position.y < lowerStartY - 0.005,
    "lower detached debris should resume falling after support changes"
  );
  assert(
    upperFragment.mesh.position.y < upperStartY - 0.005,
    "upper detached debris in the same support stack should not stay parked in midair"
  );
  assert(tooHighFragment.isSleeping, "far-above detached debris should stay asleep");
  assertClose(
    tooHighFragment.mesh.position.y,
    tooHighStartY,
    0.001,
    "far-above detached debris should not move from the local support wake"
  );
});

test("rigid debris adapter keeps temporary terrain colliders surface-only and capped", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const denseGroundWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 3;
    }
  };

  const singleFragment = PhysicsToy.createBlockFragment(
    BLOCK.stone,
    new THREE.Vector3(0.5, 3.45, 0.5),
    new THREE.Vector3(0, 0, 0),
    1
  );
  rigidDebris.registerFragment(singleFragment);
  rigidDebris.update(1 / 60, denseGroundWorld);
  assert(
    rigidDebris.getStats().terrainColliders <= 9,
    "a shard over a dense slab should only build exposed top-surface terrain colliders"
  );
  rigidDebris.clear();

  for (let index = 0; index < 180; index += 1) {
    const x = (index % 30) * 3 + 0.5;
    const z = Math.floor(index / 30) * 3 + 0.5;
    rigidDebris.registerFragment(PhysicsToy.createBlockFragment(
      BLOCK.stone,
      new THREE.Vector3(x, 3.45, z),
      new THREE.Vector3(0, 0, 0),
      1
    ));
  }
  rigidDebris.update(1 / 60, denseGroundWorld);
  assert(
    rigidDebris.getStats().terrainColliders <= RIGID_DEBRIS_STATIC_COLLIDER_CELL_BUDGET,
    "stress debris should not create more temporary terrain colliders than the hard cap"
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
  rigidDebris.update(1 / 60, { isSolid: () => false });
  const registeredHalfExtents = rigidDebris.getRegisteredColliderHalfExtents(fragment);
  assert(registeredHalfExtents, "registered rigid debris should expose its cuboid envelope");
  assertVectorNearlyEqual(
    registeredHalfExtents,
    shardShape.colliderHalfExtents,
    "rigid debris should use the fragment's own cuboid envelope instead of one global cuboid size"
  );

  rigidDebris.clear();
});

test("rigid debris adapter demotes overflow bodies to visible VFX", async () => {
  const rigidDebris = new RigidDebrisSimulation();
  await rigidDebris.initialize();
  const floorWorld: CollisionWorld = {
    isSolid(_x, y, _z): boolean {
      return y < 0;
    }
  };
  const fragment = PhysicsToy.createBlockFragment(
    BLOCK.grass,
    new THREE.Vector3(0.5, 1.5, 0.5),
    new THREE.Vector3(2, 0, 0),
    1
  );

  rigidDebris.registerFragment(fragment);
  rigidDebris.recordAdmissionDenied(2);
  rigidDebris.update(1 / 60, floorWorld);
  assert(fragment.isRigidDebrisDriven, "test setup should first register the shard with Rapier");
  assertEqual(rigidDebris.getStats().admittedBodiesThisFrame, 1, "admission telemetry should count registered bodies");
  assertEqual(rigidDebris.getStats().deniedAdmissionThisFrame, 2, "admission telemetry should preserve overflow counts");

  const demoted = rigidDebris.demoteFragmentToVfx(fragment);
  const stats = rigidDebris.getStats();
  assert(demoted, "demotion should report when a body was detached");
  assert(!fragment.isExpired, "demoted overflow debris should remain visible instead of poofing");
  assert(!fragment.isRigidDebrisDriven, "demoted overflow debris should leave the Rapier body set");
  assertEqual(stats.bodies, 0, "demotion should remove the dynamic rigid body");
  assertEqual(stats.convertedToVfxThisFrame, 1, "demotion telemetry should count VFX conversions");
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
  for (let frame = 0; frame < 720 && !fragment.isSleeping; frame += 1) {
    rigidDebris.update(1 / 60, supportWorld);
  }

  const settledBottomY = fragment.mesh.position.y - BLOCK_FRAGMENT_VISUAL_SIZE * 0.5;
  assert(
    settledBottomY >= supportY - 0.02,
    "rigid debris should not sink through partial-height rubble support"
  );
  assert(
    settledBottomY <= supportY + BLOCK_FRAGMENT_VISUAL_SIZE + 0.08,
    "rigid debris should settle on generated rubble support colliders"
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

function ageTestFragmentPastGroundDebrisBurstGrace(fragment: PhysicsToy): void {
  const emptyWorld = {
    isSolid(_x: number, _y: number, _z: number): boolean {
      return false;
    }
  };
  fragment.update(GROUND_DEBRIS_CLEANUP_BURST_GRACE_SECONDS + 0.01, emptyWorld);
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

test("debris settler wakes a glued sleeping clump when its terrain support changes", () => {
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
  lower.update(1 / 120, floorWorld);
  settler.registerFracture(BLOCK.grass, activeCenter, [lower, upper]);
  settler.update(DEBRIS_REGION_GLUE_BREAKUP_SECONDS + 0.01, rubble, {
    activeCenter,
    activeRadius: 8
  });
  settler.update(DEBRIS_REGION_SETTLED_FINALIZE_SECONDS, rubble, {
    activeCenter,
    activeRadius: 8
  });

  assert(lower.isSleeping, "test setup should sleep the terrain-supported lower shard");
  assert(upper.isSleeping, "test setup should sleep the glued upper shard");
  const lowerStartY = lower.mesh.position.y;
  const upperStartY = upper.mesh.position.y;

  const woken = settler.wakeRegionsRestingOnChangedTerrainCells([{ x: 0, y: 0, z: 0 }]);
  lower.update(1 / 60, { isSolid: () => false });
  upper.update(1 / 60, { isSolid: () => false });

  assertEqual(woken, 2, "support invalidation should wake the whole glued settler component");
  assert(!lower.isSleeping, "lower shard should leave settler sleep after its terrain support changes");
  assert(!upper.isSleeping, "upper glued shard should not remain suspended above the falling lower shard");
  assert(lower.mesh.position.y < lowerStartY - 0.005, "lower shard should resume gravity");
  assert(upper.mesh.position.y < upperStartY - 0.005, "upper shard should resume gravity with its clump");
});

test("debris settler wakes denied VFX shards in mixed rigid-admission regions", () => {
  const settler = new DebrisSettler();
  const rigidShard = createTestFragment(BLOCK.grass, 1.5, 1.08, 0.5);
  const deniedVfxShard = createTestFragment(BLOCK.grass, 0.5, 1.08, 0.5);
  rigidShard.attachRigidDebrisBody();
  deniedVfxShard.sleepInPlace(true);

  settler.registerFracture(
    BLOCK.grass,
    new THREE.Vector3(0.5, 1.1, 0.5),
    [rigidShard, deniedVfxShard]
  );

  const startY = deniedVfxShard.mesh.position.y;
  const woken = settler.wakeRegionsRestingOnChangedTerrainCells([{ x: 0, y: 0, z: 0 }]);
  deniedVfxShard.update(1 / 60, { isSolid: () => false });

  assertEqual(
    woken,
    1,
    "support invalidation should still reach VFX shards when a sibling shard was admitted to Rapier"
  );
  assert(!deniedVfxShard.isSleeping, "the denied VFX shard should leave cheap sleep after support changes");
  assert(
    deniedVfxShard.mesh.position.y < startY - 0.005,
    "the denied VFX shard should resume gravity instead of hanging in a mixed region"
  );
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
  assertClose(
    afterFinalize.finalizedPieces,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    0.000001,
    "Potato's mass-safe shard burst should still expand into full rubble material"
  );
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
  assertClose(
    rubbleStats.pieces,
    BLOCK_RUBBLE_MATERIAL_UNITS,
    0.000001,
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
    // This test is about same-frame ordering, so it deliberately spends a full
    // scaled block of terrain HP instead of pretending the rubble damage number
    // is still enough to break scaled terrain in one tap.
    const result = world.damageBlock(
      impact.block.x,
      impact.block.y,
      impact.block.z,
      getTerrainMaxHealth(BLOCK.stone)
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

test("rubble emits support-change events when piles fall after support removal", () => {
  const scene = new THREE.Scene();
  const world = new TestRubbleWorld();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.sand, new THREE.Vector3(0.5, 1.1, 0.5), 2);
  rubble.consumeSupportChangeEvents();

  rubble.settle(world);
  const supportEvents = rubble.consumeSupportChangeEvents();

  assert(
    supportEvents.some((event) => event.reason === "fallen" && event.cell.x === 0 && event.cell.y === 1 && event.cell.z === 0),
    "falling rubble should report the old support cell for debris wake"
  );
  assert(
    supportEvents.some((event) => event.reason === "fallen" && event.cell.x === 0 && event.cell.y === 0 && event.cell.z === 0),
    "falling rubble should report the new support cell for collider invalidation"
  );
});

test("rubble emits support-change events when damage destroys a pile", () => {
  const scene = new THREE.Scene();
  const rubble = new RubbleField(scene);

  rubble.absorb(BLOCK.sand, new THREE.Vector3(0.5, 1.1, 0.5), 1);
  rubble.consumeSupportChangeEvents();
  rubble.damageNearest(new THREE.Vector3(0.5, 1.1, 0.5), 10_000, 1);
  const supportEvents = rubble.consumeSupportChangeEvents();

  assert(
    supportEvents.some((event) => event.reason === "destroyed" && event.cell.x === 0 && event.cell.y === 1 && event.cell.z === 0),
    "destroyed rubble should report its support cell for debris wake"
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

test("physics core aim preview classifies visible and hidden bite cells from the camera side", () => {
  const nearFaceCell = encodeTestLatticeIndex(0, 1, 1);
  const farFaceCell = encodeTestLatticeIndex(2, 1, 1);
  const topFaceCell = encodeTestLatticeIndex(1, 2, 1);
  const blockPosition = { x: 10, y: 4, z: -2 };

  assert(
    isAimPreviewLatticeCellVisibleFromPoint(blockPosition, nearFaceCell, { x: 8, y: 4.5, z: -1.5 }),
    "cells on the side facing the camera should be bright preview cells"
  );
  assert(
    !isAimPreviewLatticeCellVisibleFromPoint(blockPosition, farFaceCell, { x: 8, y: 4.5, z: -1.5 }),
    "cells buried on the far side of the block should be treated as hidden preview cells"
  );
  assert(
    isAimPreviewLatticeCellVisibleFromPoint(blockPosition, topFaceCell, { x: 10.5, y: 7, z: -1.5 }),
    "flying above a block should make the top lattice layer visible"
  );

  const split = splitAimPreviewLatticeCellsByVisibility(
    blockPosition,
    [nearFaceCell, farFaceCell],
    { x: 8, y: 4.5, z: -1.5 }
  );
  assertDeepEqual(split.visibleCellIndexes, [nearFaceCell], "visible preview cells should stay in the bright batch");
  assertDeepEqual(split.hiddenCellIndexes, [farFaceCell], "hidden preview cells should move into the soft red batch");

  const fallbackSplit = splitAimPreviewLatticeCellsByVisibility(blockPosition, [nearFaceCell, farFaceCell]);
  assertDeepEqual(
    fallbackSplit,
    { visibleCellIndexes: [nearFaceCell, farFaceCell], hiddenCellIndexes: [] },
    "callers without a camera should keep the old all-bright behavior"
  );
});

test("physics core aim preview renders hidden bite cells as a separate soft overlay", () => {
  const scene = new THREE.Scene();
  const preview = new PhysicsCoreAimPreview(scene);
  const nearFaceCell = encodeTestLatticeIndex(0, 1, 1);
  const farFaceCell = encodeTestLatticeIndex(2, 1, 1);

  try {
    preview.update({
      points: [new THREE.Vector3(8, 4.5, -1.5), new THREE.Vector3(10, 4.5, -1.5)]
    }, {
      targets: [{
        block: BLOCK.stone,
        position: { x: 10, y: 4, z: -2 },
        point: { x: 10, y: 4.5, z: -1.5 },
        normal: { x: -1, y: 0, z: 0 },
        primary: true,
        remainingHealth: 9,
        maxHealth: 10,
        destroyed: false,
        affectedVisualCellIndexes: [nearFaceCell, farFaceCell]
      }]
    }, new THREE.Vector3(8, 4.5, -1.5));

    const visibleLines = preview.object.getObjectByName("Physics core visible bite cells") as THREE.LineSegments;
    const hiddenLines = preview.object.getObjectByName("Physics core hidden bite cells") as THREE.LineSegments;
    const visiblePosition = visibleLines.geometry.getAttribute("position");
    const hiddenPosition = hiddenLines.geometry.getAttribute("position");

    assertEqual(visiblePosition.count, 24, "one bright bite-cell box should draw twelve line segments");
    assertEqual(hiddenPosition.count, 24, "one soft hidden bite-cell box should draw twelve line segments");
    assert(hiddenLines.visible, "hidden bite cells should still be drawn, just softer");
    assertEqual(
      (hiddenLines.material as THREE.LineBasicMaterial).color.getHex(),
      0xff4f57,
      "hidden bite cells should use the soft red material"
    );
  } finally {
    preview.dispose();
  }
});

test("small fast physics cores pass through existing visual holes in partial blocks", () => {
  const world = new VoxelWorld({ seed: "small-core-existing-hole-test" });
  const openTunnelDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
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
    amount: openTunnelDamage
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
  const openTunnelDamage = getTerrainMaxHealth(BLOCK.stone) * 0.1;
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
    amount: openTunnelDamage
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

test("hitscan aim preview traces the instant impact and bite cells without mutation", () => {
  const world = new VoxelWorld({ seed: "hitscan-preview-test" });
  world.setBlock(0, 20, 4, BLOCK.air);
  world.setBlock(1, 20, 4, BLOCK.air);
  world.setBlock(2, 20, 4, BLOCK.stone);

  const prediction = predictHitscanCoreTrajectory(world, {
    origin: new THREE.Vector3(0.5, 20.5, 4.5),
    direction: new THREE.Vector3(1, 0, 0),
    radius: HITSCAN_CORE_RADIUS,
    maxDistance: 10,
    impactSpeed: HITSCAN_CORE_IMPACT_SPEED
  });

  assertEqual(prediction.points.length, 2, "hitscan preview should draw one straight segment");
  assertDeepEqual(
    prediction.impact?.block,
    { x: 2, y: 20, z: 4 },
    "hitscan preview should target the same terrain block as the instant trace"
  );
  assertClose(
    prediction.impact?.position.x ?? Number.NaN,
    2,
    0.000001,
    "hitscan preview should place the impact ring on the entry face"
  );

  const impact = prediction.impact;
  assert(impact, "the preview setup should produce an impact");
  const brushPreview = world.previewBlockDamageBrush({
    x: impact.block.x,
    y: impact.block.y,
    z: impact.block.z,
    point: impact.position,
    normal: impact.normal,
    incomingDirection: impact.incomingVelocity,
    coreRadius: HITSCAN_CORE_RADIUS,
    speed: impact.speed,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  });

  assert(
    (brushPreview?.targets[0]?.affectedVisualCellIndexes.length ?? 0) > 0,
    "hitscan preview should expose the bite cells the shot would remove"
  );
  assertEqual(world.getBlockDamage(2, 20, 4), 0, "hitscan preview should not mutate block health");

  const missPrediction = predictHitscanCoreTrajectory({ isSolid: () => false }, {
    origin: new THREE.Vector3(0.5, 20.5, 4.5),
    direction: new THREE.Vector3(0, 1, 0),
    radius: HITSCAN_CORE_RADIUS,
    maxDistance: 10,
    impactSpeed: HITSCAN_CORE_IMPACT_SPEED,
    noHitPreviewDistance: 4
  });

  assertEqual(missPrediction.impact, undefined, "no-hit hitscan preview should not invent an impact");
  assertClose(
    missPrediction.points[1]?.y ?? Number.NaN,
    24.5,
    0.000001,
    "no-hit hitscan preview should stay at the readable preview distance"
  );
});

test("hitscan debris beam touches active and sleeping fragments without blocking terrain", () => {
  const start = new THREE.Vector3(0, 1, 0);
  const end = new THREE.Vector3(6, 1, 0);
  const activeFragment = createTestFragment(BLOCK.grass, 2, 1.04, 0.04);
  const sleepingFragment = createTestFragment(BLOCK.dirt, 4, 1.04, -0.04);
  const offAxisFragment = createTestFragment(BLOCK.stone, 3, 1, 1.1);
  sleepTestFragment(sleepingFragment);

  assert(
    doesHitscanBeamTouchDebris(start, end, activeFragment.mesh.position, activeFragment.radius),
    "beam capsule should intersect nearby active debris"
  );
  const touchedFragments = collectHitscanDebrisTargets(
    [activeFragment, sleepingFragment, offAxisFragment],
    start,
    end
  );

  assert(touchedFragments.includes(activeFragment), "hitscan beam should collect active debris in its capsule");
  assert(touchedFragments.includes(sleepingFragment), "hitscan beam should collect sleeping debris in its capsule");
  assert(!touchedFragments.includes(offAxisFragment), "hitscan beam should leave off-axis debris alone");

  for (const fragment of touchedFragments) {
    fragment.expire();
  }

  const world = new VoxelWorld({ seed: "hitscan-debris-nonblocking-test" });
  // The hitscan assertion needs a controlled air corridor. Terrain height can
  // legitimately move as the world shape evolves, so do not let generated
  // ground at the ray origin masquerade as a debris/beam regression.
  for (let x = 0; x < 6; x += 1) {
    for (let y = 19; y <= 21; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        world.setBlock(x, y, z, BLOCK.air);
      }
    }
  }
  world.setBlock(6, 20, 0, BLOCK.stone);
  const terrainHit = raycastHitscanCore(world, new THREE.Vector3(0, 20, 0), new THREE.Vector3(1, 0, 0), 8);
  assertDeepEqual(
    terrainHit?.block,
    { x: 6, y: 20, z: 0 },
    "clearing visual debris should not consume the hitscan terrain trace"
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
  world.setBlock(2, 3, 4, BLOCK.ember);
  world.setBlock(3, 3, 4, BLOCK.air);
  world.setBlock(4, 3, 4, BLOCK.ember);
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

  assertEqual(
    world.getBlockDamage(2, 3, 4),
    PARTIAL_BLOCK_CORE_DAMAGE,
    "front block should take the first scaled piercing chip"
  );
  assertEqual(
    world.getBlockDamage(4, 3, 4),
    PARTIAL_BLOCK_CORE_DAMAGE,
    "back block should be hit after the core crosses the air gap"
  );
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
    getTerrainMaxHealth(BLOCK.stone)
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
    {
      loadRadius: 6,
      shadowMapSize: 2048,
      blockFragmentCount: 108,
      debrisShadows: false,
      blockLightMinLevel: 1,
      blockLightMaxLevel: 15
    },
    "normal preset should expose its default tunable settings"
  );
  assertEqual(normalizeRenderDistance(-20), RENDER_DISTANCE_MIN, "render distance should keep a lower bound");
  assertEqual(normalizeRenderDistance(999), RENDER_DISTANCE_MAX, "render distance should keep an upper bound");
  assertEqual(DEFAULT_BLOCK_LIGHT_MIN_LEVEL, 1, "quality presets should default to a low rendered block-light floor");
  assertEqual(normalizeBlockLightLevelSetting(-20), BLOCK_LIGHT_LEVEL_MIN, "block-light minimum should clamp low");
  assertEqual(normalizeBlockLightLevelSetting(999), BLOCK_LIGHT_LEVEL_MAX, "block-light maximum should clamp high");
  assertDeepEqual(
    normalizeBlockLightLevelRange(
      { minLevel: 13, maxLevel: 4 },
      { minLevel: 1, maxLevel: 15 }
    ),
    { minLevel: 4, maxLevel: 13 },
    "persisted block-light ranges should sort instead of crossing"
  );
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
    {
      loadRadius: 999,
      shadowMapSize: 3333,
      blockFragmentCount: 999,
      debrisShadows: "true",
      blockLightMinLevel: 20,
      blockLightMaxLevel: 3
    },
    normalDefaults
  );

  assertEqual(normalized.loadRadius, RENDER_DISTANCE_MAX, "custom render distance should clamp high");
  assertEqual(normalized.shadowMapSize, 4096, "custom shadow map size should snap to the nearest option");
  assertEqual(
    normalized.blockFragmentCount,
    BLOCK_FRAGMENT_MAX_COUNT,
    "custom debris count should clamp to the visible VFX shard limit"
  );
  assertEqual(normalized.debrisShadows, true, "debris shadow toggle should normalize persisted boolean strings");
  assertEqual(normalized.blockLightMinLevel, 3, "custom block-light range should keep the lower sorted level");
  assertEqual(normalized.blockLightMaxLevel, 15, "custom block-light range should clamp and sort the upper level");
  assertEqual(
    formatRenderDistance(6),
    "6 clear chunks",
    "render distance label should explain that the slider is the fog start"
  );
  assertEqual(formatShadowQuality(0), "Off", "shadow quality label should call out disabled shadows");
  assertEqual(
    formatBlockFragmentCount(0),
    "39 max shards/block",
    "debris count label should show the clamped mass-safe shard count"
  );
  assertEqual(formatBlockLightLevel(1), "Level 1", "block-light labels should show integer solver levels");
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
    MAX_RIGID_DEBRIS_BODY_BUDGET,
    "ground debris slider should not shrink the airborne rigid debris burst budget"
  );
  assert(
    !isGroundDebrisBudgetCleanupEligible(GROUND_DEBRIS_BUDGET_BURST_GRACE_SECONDS - 0.01, true),
    "fresh grounded shards should keep the initial burst silhouette before the ground cap applies"
  );
  assert(
    isGroundDebrisBudgetCleanupEligible(GROUND_DEBRIS_BUDGET_BURST_GRACE_SECONDS + 0.01, true),
    "grounded shards should become eligible for the aftermath cap after the burst grace"
  );
  assert(
    !isGroundDebrisBudgetCleanupEligible(GROUND_DEBRIS_BUDGET_BURST_GRACE_SECONDS + 10, false),
    "airborne shards should not be counted against the ground debris cap"
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
    "ground debris lifetime should keep the explicit forever setting"
  );
  assertEqual(
    getEffectiveGroundDebrisLifetimeSeconds(0),
    0,
    "zero ground debris lifetime should mean immediate grounded cleanup"
  );
  assertEqual(
    getEffectiveGroundDebrisLifetimeSeconds(FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS),
    null,
    "forever lifetime should disable timer cleanup"
  );
  assertEqual(
    formatGroundDebrisLifetime(0),
    "0s",
    "ground debris lifetime label should keep the true minimum explicit"
  );
  assertEqual(
    formatGroundDebrisLifetime(FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS),
    "Forever",
    "ground debris lifetime label should make the forever mode obvious"
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
      velocityPercent: PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT,
      terrainBounceCount: PHYSICS_CORE_DEFAULT_BOUNCE_COUNT,
      hueDegrees: PHYSICS_CORE_DEFAULT_HUE_DEGREES,
      trailEnabled: PHYSICS_CORE_DEFAULT_TRAIL_ENABLED
    },
    "default core tuning should expose the smaller faster first-pass feel"
  );

  const tinyFastCore = normalizePhysicsCoreSettings({
    sizePercent: -40,
    velocityPercent: 999,
    terrainBounceCount: 999,
    hueDegrees: -40,
    trailEnabled: false
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
  assertEqual(
    tinyFastCore.terrainBounceCount,
    PHYSICS_CORE_BOUNCE_MAX_COUNT,
    "core bounce slider should clamp to the largest safe bounce budget"
  );
  assertEqual(
    tinyFastCore.hueDegrees,
    PHYSICS_CORE_HUE_MIN_DEGREES,
    "core hue slider should clamp to the warmest boundary"
  );
  assertEqual(tinyFastCore.trailEnabled, false, "core trail toggle should preserve explicit false");

  const largeSlowCore = normalizePhysicsCoreSettings({
    sizePercent: 999,
    velocityPercent: -40,
    terrainBounceCount: -40,
    hueDegrees: 999
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
  assertEqual(
    largeSlowCore.terrainBounceCount,
    PHYSICS_CORE_BOUNCE_MIN_COUNT,
    "core bounce slider should clamp to at least one terrain hit"
  );
  assertEqual(
    largeSlowCore.hueDegrees,
    PHYSICS_CORE_HUE_MAX_DEGREES,
    "core hue slider should clamp to the full color wheel"
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
  assertEqual(formatPhysicsCoreBounceCount(1), "1 bounce", "single-bounce labels should stay singular");
  assertEqual(formatPhysicsCoreBounceCount(4), "4 bounces", "multi-bounce labels should stay readable");
  assertEqual(normalizePhysicsCoreBounceCount(4.6), 5, "core bounce counts should snap to whole steps");
  assertEqual(formatPhysicsCoreHue(185), "185°", "core hue labels should stay readable in degrees");
  assertEqual(normalizePhysicsCoreHueDegrees(187), 185, "core hue should snap to slider steps");
});

test("physics cores spend terrain damage bounces before expiring", () => {
  const defaultCore = new PhysicsToy(new THREE.Vector3(), new THREE.Vector3());
  assertEqual(defaultCore.terrainDamageBouncesLeft, 1, "default projectile cores should preserve one-hit behavior");
  assert(!defaultCore.consumeTerrainDamageBounce(), "default cores should expire after their first damaging terrain hit");
  assertEqual(defaultCore.terrainDamageBouncesLeft, 0, "spent default cores should have no bounce budget left");

  const ricochetCore = new PhysicsToy(new THREE.Vector3(), new THREE.Vector3(), {
    terrainDamageBounceCount: 3
  });
  assert(ricochetCore.consumeTerrainDamageBounce(), "first damaging hit should leave a multi-bounce core alive");
  assertEqual(ricochetCore.terrainDamageBouncesLeft, 2, "first hit should spend one bounce");
  assert(ricochetCore.consumeTerrainDamageBounce(), "second damaging hit should still leave one bounce");
  assertEqual(ricochetCore.terrainDamageBouncesLeft, 1, "second hit should spend one more bounce");
  assert(!ricochetCore.consumeTerrainDamageBounce(), "final damaging hit should spend the core");
  assertEqual(ricochetCore.terrainDamageBouncesLeft, 0, "final hit should drain the bounce budget");

  const fragment = PhysicsToy.createBlockFragment(BLOCK.grass, new THREE.Vector3(), new THREE.Vector3());
  assertEqual(fragment.terrainDamageBouncesLeft, 0, "debris fragments should not carry terrain damage bounces");
  assert(!fragment.consumeTerrainDamageBounce(), "debris fragments should never consume a damage bounce");
});

test("surviving terrain damage bounces bleed core velocity", () => {
  const core = new PhysicsToy(new THREE.Vector3(), new THREE.Vector3(12, 4, 0), {
    terrainDamageBounceCount: 3
  });
  const speedBeforeDamageBounce = core.velocity.length();
  const survivedFirstBounce = core.consumeTerrainDamageBounce({
    normal: new THREE.Vector3(-1, 0, 0),
    speed: 12
  });

  assert(survivedFirstBounce, "a multi-bounce core should survive while it still has bounce budget");
  assert(
    core.velocity.length() < speedBeforeDamageBounce,
    "a surviving damage bounce should spend some projectile speed instead of preserving full launch velocity"
  );
  assert(
    core.velocity.length() > BLOCK_DAMAGE_IMPACT_SPEED,
    "one energetic bounce should not kill the projectile's useful motion outright"
  );
});

test("physics cores expire by hard TTL and low-speed countdown", () => {
  const emptyWorld: CollisionWorld = {
    isSolid: () => false
  };

  const ttlCore = new PhysicsToy(new THREE.Vector3(0, 2, 0), new THREE.Vector3(6, 0, 0), {
    maxAgeSeconds: 0.1
  });
  ttlCore.update(0.11, emptyWorld);
  assert(ttlCore.isExpired, "hard TTL should expire a projectile core even if it is still moving");

  const slowCore = new PhysicsToy(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0.2, 0, 0), {
    lowSpeedExpireSpeed: 0.5,
    lowSpeedExpireAfterSeconds: 0.3
  });
  slowCore.update(0.1, emptyWorld);
  assert(!slowCore.isExpired, "slow-speed countdown should not expire immediately");
  assertNearlyEqual(
    slowCore.lowSpeedDespawnCountdownSeconds ?? 0,
    0.2,
    0.000001,
    "countdown should report remaining time once speed stays below the threshold"
  );
  slowCore.velocity.set(0.2, 0, 0);
  slowCore.update(0.2, emptyWorld);
  assert(slowCore.isExpired, "slow projectile cores should expire after the low-speed grace window");

  const recoveredCore = new PhysicsToy(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0.2, 0, 0), {
    lowSpeedExpireSpeed: 0.5,
    lowSpeedExpireAfterSeconds: 0.3
  });
  recoveredCore.update(0.1, emptyWorld);
  recoveredCore.velocity.set(2, 0, 0);
  recoveredCore.update(0.1, emptyWorld);
  assertEqual(
    recoveredCore.lowSpeedDespawnCountdownSeconds,
    null,
    "countdown should reset if a core becomes fast enough again"
  );
  assert(!recoveredCore.isExpired, "recovering above the threshold should keep the projectile alive");
});

test("physics core visuals use the selected hue and clean up trails", () => {
  const scene = new THREE.Scene();
  const color = createPhysicsCoreColor({ ...DEFAULT_PHYSICS_CORE_SETTINGS, hueDegrees: 210 });
  const material = createPhysicsCoreMaterial({ ...DEFAULT_PHYSICS_CORE_SETTINGS, hueDegrees: 210 });
  assertEqual(
    material.color.getHex(),
    color.getHex(),
    "core material color should come from the selected hue"
  );

  const trail = new PhysicsCoreTrail(scene);
  const core = new PhysicsToy(
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(1, 0, 0),
    { material }
  );
  trail.track(core, color);
  assertEqual(trail.getActiveTrailCount(), 1, "active projectile cores should be trackable by the trail renderer");
  trail.setColor(createPhysicsCoreColor({ ...DEFAULT_PHYSICS_CORE_SETTINGS, hueDegrees: 120 }));
  trail.forget(core);
  assertEqual(trail.getActiveTrailCount(), 0, "removing a core should dispose its trail entry");
  trail.dispose();
  core.dispose();
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
  let previousLocalLightRadius = 0;

  for (const presetId of presetIds) {
    const preset = QUALITY_PRESETS[presetId];
    const expectedHardWallChunks = presetId === "potato" || presetId === "low" || presetId === "normal"
      ? 1
      : 2;
    assert(
      preset.fogStartRadius > 0,
      `${preset.label} should define where terrain hits the hard fog wall`
    );
    assertEqual(
      preset.fogFalloffRadius,
      expectedHardWallChunks,
      `${preset.label} should use the expected short hard-fog wall band`
    );
    assert(
      preset.fogHiddenRadius >= 2,
      `${preset.label} should stream hidden chunks behind the opaque fog wall`
    );
    assertEqual(
      preset.loadRadius,
      preset.fogStartRadius + preset.fogFalloffRadius + preset.fogHiddenRadius,
      `${preset.label} load radius should include fogged and hidden horizon buffers`
    );
    assert(preset.unloadRadius > preset.loadRadius, `${preset.label} unload radius should exceed load radius`);
    assert(preset.chunkLoads >= 1, `${preset.label} should request at least one chunk load`);
    assert(preset.chunkRebuilds >= 1, `${preset.label} should request at least one chunk rebuild`);
    assertEqual(
      preset.fogNear,
      preset.fogStartRadius * CHUNK_SIZE,
      `${preset.label} fog should begin at the player-facing render distance`
    );
    assertEqual(
      preset.fogFar,
      (preset.fogStartRadius + preset.fogFalloffRadius) * CHUNK_SIZE,
      `${preset.label} fog should become opaque at the hard wall before the streamed horizon cutoff`
    );
    assert(
      preset.loadRadius * CHUNK_SIZE > preset.fogFar,
      `${preset.label} should keep the hard chunk edge behind opaque fog`
    );
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
      preset.blockFragmentCount >= getMinimumDebrisFragmentCountForMaterialUnits(BLOCK_RUBBLE_MATERIAL_UNITS) &&
        preset.blockFragmentCount <= BLOCK_DEBRIS_MAX_FRAGMENT_COUNT,
      `${preset.label} debris count should stay within the visible VFX shard limit`
    );
    assert(
      preset.debrisActiveRadiusMeters >= previousDebrisActiveRadius,
      `${preset.label} active debris bubble should not shrink as quality increases`
    );
    assert(
      preset.localLightRadiusMeters >= previousLocalLightRadius,
      `${preset.label} local light radius should not shrink as quality increases`
    );
    assert(
      isPowerOfTwo(preset.localLightShadowMapSize),
      `${preset.label} local light shadow map size should stay GPU-friendly`
    );
    previousPhysicsBudget = preset.physicsObjectBudget;
    previousDebrisActiveRadius = preset.debrisActiveRadiusMeters;
    previousLocalLightRadius = preset.localLightRadiusMeters;
  }

  assertEqual(QUALITY_PRESETS.potato.distanceScale, 0.5, "Potato should remain the 0.5x baseline");
  assertEqual(QUALITY_PRESETS.potato.fogStartRadius, 2, "Potato should start fog after 2 clear chunks");
  assertEqual(QUALITY_PRESETS.potato.fogFalloffRadius, 1, "Potato should use a one-chunk hard fog wall");
  assertEqual(QUALITY_PRESETS.normal.distanceScale, 2, "Normal should remain 2x distance");
  assertEqual(QUALITY_PRESETS.normal.fogStartRadius, 6, "Normal should start fog after 6 clear chunks");
  assertEqual(QUALITY_PRESETS.normal.fogFalloffRadius, 1, "Normal should use a one-chunk hard fog wall");
  assertEqual(QUALITY_PRESETS.normal.loadRadius, 9, "Normal should stream hidden chunks behind the opaque fog wall");
  assertEqual(
    QUALITY_PRESETS.normal.renderRadius,
    QUALITY_PRESETS.normal.fogStartRadius + QUALITY_PRESETS.normal.fogFalloffRadius + FOG_RENDER_SAFETY_CHUNKS,
    "Normal should draw only the clear/hard-fog wall plus one safety ring"
  );
  assert(
    QUALITY_PRESETS.normal.renderRadius < QUALITY_PRESETS.normal.loadRadius,
    "Normal should keep hidden streamed horizon chunks outside the render radius"
  );
  assertEqual(QUALITY_PRESETS[CUSTOM_PRESET_ID].label, "Custom", "Custom preset should be available for slider edits");
  assertEqual(
    QUALITY_PRESETS[CUSTOM_PRESET_ID].fogFalloffRadius,
    QUALITY_PRESETS.normal.fogFalloffRadius,
    "Custom should start from the Normal hard fog wall baseline"
  );
  assertEqual(
    QUALITY_PRESETS[CUSTOM_PRESET_ID].physicsObjectBudget,
    QUALITY_PRESETS.normal.physicsObjectBudget,
    "Custom should start from Normal's practical baseline before slider edits"
  );
  assertEqual(QUALITY_PRESETS.high.distanceScale, 4, "High should remain 4x distance");
  assertEqual(QUALITY_PRESETS.high.fogFalloffRadius, 2, "High should use a two-chunk hard fog wall");
  assertEqual(QUALITY_PRESETS.ultra.distanceScale, 6, "Ultra should remain 6x distance");
  assertEqual(QUALITY_PRESETS.ultra.fogFalloffRadius, 2, "Ultra should use a two-chunk hard fog wall");
  assertEqual(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].distanceScale, 12, "Super Ultra should remain the 12x stress preset");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].fogFalloffRadius,
    2,
    "Super Ultra should use a two-chunk hard fog wall"
  );
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
  assertEqual(QUALITY_PRESETS.normal.debrisShadows, false, "Normal should keep debris shadows off by default");
  assertEqual(QUALITY_PRESETS.high.debrisShadows, true, "High should opt into debris shadows by default");
  assertEqual(QUALITY_PRESETS.potato.localLightRadiusMeters, 28, "Potato should keep a compact local light radius");
  assertEqual(QUALITY_PRESETS.normal.localLightRadiusMeters, 56, "Normal should keep a practical local light radius");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].localLightRadiusMeters,
    128,
    "Super Ultra should carry the largest local light radius"
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
  assertEqual(QUALITY_PRESETS.potato.blockFragmentCount, 54, "Potato should exceed the minimum mass-safe burst");
  assertEqual(QUALITY_PRESETS.low.blockFragmentCount, 72, "Low should add visible chip density");
  assertEqual(QUALITY_PRESETS.normal.blockFragmentCount, 108, "Normal should split bursts into many small chips");
  assertEqual(QUALITY_PRESETS.high.blockFragmentCount, 144, "High should push fuller small-shard coverage");
  assertEqual(QUALITY_PRESETS.ultra.blockFragmentCount, 180, "Ultra should heavily oversample the fracture grid");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount,
    216,
    "Super Ultra should heavily sample the 27-cell source grid"
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

test("day-night time model normalizes, clamps, pauses, and limits large deltas", () => {
  const defaultState = createDefaultDayNightState();
  assertClose(
    defaultState.timeOfDay,
    DAY_NIGHT_DEFAULT_TIME_OF_DAY,
    0.000001,
    "new worlds should start in late morning"
  );
  assertEqual(defaultState.cycleLengthSeconds, DAY_NIGHT_DEFAULT_CYCLE_SECONDS, "default cycle should be 20 minutes");
  assertEqual(formatTimeOfDay(0), "00:00", "midnight should format as 00:00");
  assertEqual(formatTimeOfDay(0.5), "12:00", "noon should format as 12:00");
  assertEqual(normalizeTimeOfDay(1.25), 0.25, "time should wrap past one day");
  assertEqual(normalizeCycleLengthSeconds(1), DAY_NIGHT_MIN_CYCLE_SECONDS, "cycle length should clamp low");
  assertEqual(
    normalizeCycleLengthSeconds(999999),
    DAY_NIGHT_MAX_CYCLE_SECONDS,
    "cycle length should clamp high"
  );

  const state = createDefaultDayNightState({ timeOfDay: 0.4, cycleLengthSeconds: 1000 });
  assertDeepEqual(
    advanceDayNightState(state, 10, { active: false, unpaused: true, visible: true }),
    state,
    "inactive worlds should not advance time"
  );
  assertDeepEqual(
    advanceDayNightState(state, 10, { active: true, unpaused: false, visible: true }),
    state,
    "paused gameplay should not advance time"
  );
  assertDeepEqual(
    advanceDayNightState(state, 10, { active: true, unpaused: true, visible: false }),
    state,
    "hidden documents should not advance time"
  );

  const advanced = advanceDayNightState(state, 10, { active: true, unpaused: true, visible: true });
  assertClose(
    advanced.timeOfDay,
    state.timeOfDay + DAY_NIGHT_FRAME_DELTA_CLAMP_SECONDS / state.cycleLengthSeconds,
    0.000001,
    "large frame deltas should clamp so PC sleep cannot jump the sky"
  );
});

test("day-night visual states stay finite across the main sky phases", () => {
  const expectedPhases = [
    [0, "midnight"],
    [0.25, "dawn"],
    [0.5, "day"],
    [0.75, "dusk"]
  ] as const;

  for (const [timeOfDay, expectedPhase] of expectedPhases) {
    const visual = createDayNightVisualState(createDefaultDayNightState({ timeOfDay }));
    assertFiniteColor(visual.fogColor, `fog color at ${timeOfDay}`);
    assertFiniteColor(visual.skyTopColor, `sky top color at ${timeOfDay}`);
    assertFiniteColor(visual.terrainOutdoorTint, `terrain tint at ${timeOfDay}`);
    assert(Number.isFinite(visual.sunIntensityScale), "sun intensity should be finite");
    assert(Number.isFinite(visual.skyIntensityScale), "sky intensity should be finite");
    assert(Number.isFinite(visual.terrainOutdoorExposure), "terrain exposure should be finite");
    assert(visual.fogHex.startsWith("#"), "debug fog label should be a compact hex color");
    assertEqual(visual.phase, expectedPhase, `time ${timeOfDay} should report the expected sky phase`);
  }

  const noon = createDayNightVisualState(createDefaultDayNightState({ timeOfDay: 0.5 }));
  const midnight = createDayNightVisualState(createDefaultDayNightState({ timeOfDay: 0 }));
  assert(noon.sunIntensityScale > midnight.sunIntensityScale, "noon should have stronger sun light than midnight");
  assert(midnight.starIntensity > noon.starIntensity, "stars should be strongest at night");
  assert(
    midnight.terrainOutdoorExposure >= 0.13,
    "midnight terrain exposure should keep night readable without making it daylight"
  );
  assert(
    midnight.skyIntensityScale >= 0.08,
    "midnight sky fill should keep outdoor terrain from collapsing into pure black"
  );
  assert(
    createDayNightVisualState(createDefaultDayNightState({ timeOfDay: 0.25 })).twilightFactor > 0,
    "sunrise should produce a twilight blend"
  );
  assert(
    createDayNightVisualState(createDefaultDayNightState({ timeOfDay: 0.75 })).twilightFactor > 0,
    "sunset should produce a twilight blend"
  );
});

test("day-night saved state normalizes old and malformed worlds safely", () => {
  const defaultState = normalizeDayNightState(undefined);
  assertClose(
    defaultState.timeOfDay,
    DAY_NIGHT_DEFAULT_TIME_OF_DAY,
    0.000001,
    "missing state should use default morning time"
  );

  const saved = createSavedDayNightState({ timeOfDay: 1.2, cycleEnabled: true, cycleLengthSeconds: 120 }, 222);
  assertClose(saved.timeOfDay, 0.2, 0.000001, "saved time should normalize into one day");
  assertEqual(
    saved.cycleLengthSeconds,
    DAY_NIGHT_MIN_CYCLE_SECONDS,
    "saved cycle length should clamp to the supported UI range"
  );

  const loaded = normalizeSavedDayNightState({
    timeOfDay: -0.25,
    cycleEnabled: false,
    cycleLengthSeconds: 7200,
    savedAt: 333
  });
  assert(loaded, "valid saved metadata should reload");
  assertEqual(loaded.timeOfDay, 0.75, "loaded saved time should wrap negative values");
  assertEqual(loaded.cycleEnabled, false, "loaded saved state should preserve cycle toggle");
  assertEqual(loaded.cycleLengthSeconds, DAY_NIGHT_MAX_CYCLE_SECONDS, "loaded saved cycle should clamp high");
  assertEqual(loaded.savedAt, 333, "loaded saved state should preserve timestamp");
});

test("horizon matte radius policy hides beyond the hard fog wall", () => {
  for (const presetId of [...QUALITY_PRESET_ORDER, CUSTOM_PRESET_ID, SUPER_ULTRA_PRESET_ID]) {
    const preset = QUALITY_PRESETS[presetId];
    const radii = getHorizonMatteRadii(preset);
    const expectedInnerRadius = Math.max(0, preset.fogFar - HORIZON_MATTE_INSET_CHUNKS * CHUNK_SIZE);
    const expectedOuterRadius = preset.fogFar + HORIZON_MATTE_EXTENSION_CHUNKS * CHUNK_SIZE;

    assertClose(
      radii.innerRadius,
      expectedInnerRadius,
      0.000001,
      `${preset.label} matte should begin tucked inside the opaque fog wall`
    );
    assertClose(
      radii.outerRadius,
      expectedOuterRadius,
      0.000001,
      `${preset.label} matte should extend 100 chunks past the fog wall`
    );
    assert(
      radii.innerRadius >= 0,
      `${preset.label} matte should never build negative-radius geometry`
    );
    assert(
      radii.innerRadius < preset.fogFar,
      `${preset.label} matte should start before the wall is fully opaque`
    );
    assert(
      radii.outerRadius > preset.loadRadius * CHUNK_SIZE,
      `${preset.label} matte should extend beyond the hidden streamed horizon`
    );
  }

  const tinyRadii = getHorizonMatteRadii({ fogFar: CHUNK_SIZE * 0.25 });
  assertEqual(tinyRadii.innerRadius, 0, "tiny fog distances should clamp matte inner radius to zero");
  assert(tinyRadii.outerRadius > tinyRadii.innerRadius, "tiny fog distances should still produce drawable geometry");

  const invalidRadii = getHorizonMatteRadii({ fogFar: Number.NaN });
  assertEqual(invalidRadii.innerRadius, 0, "invalid fog distances should clamp matte inner radius to zero");
  assertEqual(
    invalidRadii.outerRadius,
    HORIZON_MATTE_EXTENSION_CHUNKS * CHUNK_SIZE,
    "invalid fog distances should fall back to the extension radius"
  );
});

test("horizon matte stays disabled for floating-islands worlds", () => {
  assertEqual(shouldShowHorizonMatte("classic"), true, "classic terrain should allow the matte");
  assertEqual(shouldShowHorizonMatte("varied"), true, "varied terrain should allow the matte");
  assertEqual(
    shouldShowHorizonMatte("floating-islands"),
    false,
    "floating-islands worlds should keep their intended void instead of drawing a fake floor"
  );
  assertEqual(shouldShowHorizonMatte(null), false, "inactive worlds should not show the matte");
});

test("procedural sky sun direction lines up with the real directional light", () => {
  const realSunDirection = SUN_OFFSET.clone().normalize();
  const skySunDirection = getSkyboxAlignedSunDirection(SUN_OFFSET);
  const sunElevation = getSunElevationDegrees(SUN_OFFSET);

  assertVectorNearlyEqual(
    skySunDirection,
    realSunDirection,
    "procedural sky sun should align with the directional light vector"
  );
  assert(
    sunElevation > 35 && sunElevation < 45,
    `sun elevation should stay visually readable instead of overhead; got ${sunElevation.toFixed(2)} degrees`
  );
  assert(
    SKYBOX_LOWER_FOG_MASK_START_Y < SKYBOX_LOWER_FOG_MASK_END_Y && SKYBOX_LOWER_FOG_MASK_END_Y < 0,
    "procedural sky lower fog mask should stay below the true horizon so the hard fog wall does not climb into the sky"
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
  assert(top <= 1 && bottom >= 0.32, "face shading should remain inside the vertex-color safety range");
  assert(bottom < 0.42, "undersides should stay meaningfully dim to avoid baked light bleed under overhangs");
});

test("chunk sky exposure darkens sealed air pockets", () => {
  const sealedExposure = createChunkSkyExposure((x, y, z) => (
    x >= 4 &&
    x <= 6 &&
    y >= 4 &&
    y <= 6 &&
    z >= 4 &&
    z <= 6 &&
    !(x === 5 && y === 5 && z === 5)
  ));
  const openedExposure = createChunkSkyExposure((x, y, z) => {
    const isBoxShell = (
      x >= 4 &&
      x <= 6 &&
      y >= 4 &&
      y <= 6 &&
      z >= 4 &&
      z <= 6 &&
      !(x === 5 && y === 5 && z === 5)
    );
    const isRoofHole = x === 5 && y === 6 && z === 5;
    return isBoxShell && !isRoofHole;
  });
  const baseMeshKey = createBlockMeshKey(BLOCK.stone, 4, 4, 4);
  const enclosedMeshKey = createLitBlockMeshKey(baseMeshKey, ENCLOSED_LIGHT_BUCKET);

  assertEqual(
    sealedExposure.getLightBucketForNeighbor(5, 5, 5),
    ENCLOSED_LIGHT_BUCKET,
    "a sealed air cell should be marked as an interior pocket for baked lighting"
  );
  assertEqual(
    openedExposure.getLightBucketForNeighbor(5, 5, 5),
    SKY_EXPOSED_LIGHT_BUCKET,
    "opening the roof should reconnect the same air cell to sky lighting"
  );
  assertEqual(getBaseBlockMeshKey(enclosedMeshKey), baseMeshKey, "light buckets should not alter block identity");
  assert(
    getLitBlockShadeMultiplier(enclosedMeshKey) < 1,
    "enclosed light buckets should dim the normal sunlit face shade"
  );
  const enclosedTopShade = getLitBlockFaceShade(enclosedMeshKey, [0, 1, 0], getSunlitFaceShade([0, 1, 0]));
  const enclosedWallShade = getLitBlockFaceShade(enclosedMeshKey, [1, 0, 0], getSunlitFaceShade([1, 0, 0]));
  const enclosedCeilingShade = getLitBlockFaceShade(enclosedMeshKey, [0, -1, 0], getSunlitFaceShade([0, -1, 0]));
  assert(
    enclosedTopShade <= 0.04,
    "enclosed upward faces should use a genuinely dark no-light fill instead of retaining outdoor sky brightness"
  );
  assertEqual(
    enclosedWallShade,
    enclosedTopShade,
    "enclosed wall faces should not keep directional edge glow"
  );
  assertEqual(
    enclosedCeilingShade,
    enclosedTopShade,
    "enclosed ceiling faces should not keep directional edge glow"
  );
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
    debrisPressure: createDebrisPerformancePressureState(128),
    physicsTiming: createEmptyPhysicsTimingStats(),
    world: {
      loadedChunks: 0,
      visibleChunks: 0,
      culledChunks: 0,
      frustumChunks: 0,
      renderedChunks: 0,
      fogHiddenChunks: 0,
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
      partialBlocks: 0,
      partialDamageBlocks: 0,
      partialSurfaceBlocks: 0,
      partialRemovedSubvoxels: 0,
      partialRemainingSubvoxels: 0,
      partialTotalSubvoxels: 0,
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
    rigidDebris: createEmptyRigidDebrisStats(),
    fragmentRender: {
      batches: 0,
      instances: 0,
      capacity: 0
    },
    partialMesh: {
      cells: 0,
      vertices: 0,
      triangles: 0,
      regions: 0,
      dirtyRegions: 0,
      rebuiltRegions: 0,
      maxRegionTriangles: 0
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
    debrisLifecycle: createEmptyDebrisLifecycleDiagnostics(),
    rubble: {
      clusters: 0,
      pieces: 0,
      health: 0,
      maxCoverHeight: 0,
      visualChunks: 0
    },
    workerPool: {
      mode: "sync-fallback",
      maxWorkers: 1,
      queuedJobs: 0,
      runningJobs: 0,
      completedJobs: 0,
      canceledJobs: 0,
      staleJobs: 0,
      failedJobs: 0,
      transferredBuffers: 0,
      averageWorkerTimeMs: 0,
      averageMainThreadUploadMs: 0,
      jobsByType: []
    },
    localLights: {
      sourceCount: 0,
      activePointLights: 0,
      pointLightCapacity: LOCAL_LIGHT_POINT_PROXY_CAPACITY,
      emissiveOnlySources: 0,
      shadowCastingPointLights: 0
    },
    dayNight: createDayNightDebugSnapshot(
      createDefaultDayNightState({ timeOfDay: 0.5 }),
      createDayNightVisualState(createDefaultDayNightState({ timeOfDay: 0.5 }))
    ),
    ...overrides
  };
}

function createTestFrameDiagnostics(
  overrides: Partial<FrameDiagnosticsSnapshot> = {}
): FrameDiagnosticsSnapshot {
  return {
    frameStartedAtMs: 100,
    frameEndedAtMs: 116,
    rafGapMs: 16,
    jsFrameMs: 16,
    measuredBucketTotalMs: 16,
    unaccountedFrameMs: 0,
    rafGapOverJsMs: 0,
    renderCallMs: 2,
    renderCallShare: 0.125,
    longTasks: {
      observerSupported: true,
      frameCount: 0,
      frameTotalMs: 0,
      frameMaxMs: 0,
      recentCount: 0,
      recentTotalMs: 0,
      recentMaxMs: 0
    },
    renderer: {
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      geometries: 0,
      textures: 0
    },
    memory: null,
    documentHidden: false,
    visibilityState: "visible",
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

function assertFiniteColor(color: RgbColorTuple, message: string): void {
  assert(
    color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1),
    `${message} should be a finite normalized RGB color`
  );
}

function assertVectorNearlyEqual(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  message: string
): void {
  const distance = actual.distanceTo(expected);
  assert(distance < 0.000001, `${message}. Distance was ${distance}.`);
}
