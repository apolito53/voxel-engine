import * as THREE from "three";
import changelogMarkdown from "../CHANGELOG.md?raw";
import packageManifest from "../package.json";
import "./style.css";
import {
  ADMIN_COMMAND_TOGGLE_KEY,
  isAdminCommandInput,
  runAdminCommand,
  type AdminCommandApi,
  type AdminCommandHooks,
  type AdminCommandResult
} from "./adminCommands";
import {
  BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT,
  BLOCK_FRAGMENT_COLLISION_RADIUS,
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  getTerrainImpactFragmentCount
} from "./blockFragments";
import { GameAudio } from "./audioEngine";
import {
  AUDIO_VOLUME_MAX_PERCENT,
  AUDIO_VOLUME_MIN_PERCENT,
  AUDIO_VOLUME_STEP_PERCENT,
  audioVolumeFromPercent,
  audioVolumeToPercent,
  formatAudioVolumePercent,
  readAudioSettingsPreference,
  writeAudioSettingsPreference,
  type AudioSettings,
  type AudioVolumeChannel
} from "./audioSettings";
import { BLOCK, BLOCKS, PLACEABLE_BLOCKS, type BlockId } from "./blocks";
import {
  getDebrisSpawnProfile,
  type DebrisSpawnProfile
} from "./blockMaterialRules";
import { createWorldBlockMaterial, disposeWorldBlockMaterial } from "./blockTextureAtlas";
import {
  BUILDER_BRUSH_MAX_SIZE,
  BUILDER_BRUSH_MIN_SIZE,
  BUILDER_BRUSH_STEP,
  BUILDER_MODE_TOGGLE_KEY,
  applyBuilderBrush,
  collectBuilderBrushCells,
  eraseBuilderBrush,
  formatBuilderBrushSize,
  getBuilderBrushCenterForTarget,
  normalizeBuilderBrushSize,
  type BuilderBrushCell,
  type BuilderLane
} from "./builderTools";
import { BuilderBrushPreview } from "./builderPreview";
import {
  type ChunkStorage,
  createChunkStorage,
  createWorldRegistry,
  getLegacyWorldHeightOffset,
  migrateSavedPlayerStateHeight,
  type SavedPlayerStateSnapshot,
  type SavedWorld,
  type WorldRegistry
} from "./chunkStorage";
import { parseChangelogEntries, type ChangelogEntry } from "./changelog";
import {
  DEFAULT_CLICK_FIRE_MODE,
  formatClickFireMode,
  formatClickFireModeShort,
  normalizeClickFireMode,
  toggleClickFireMode,
  type ClickFireMode
} from "./clickFireMode";
import {
  CodexPilot,
  type CodexPilotApi,
  type CodexPilotWeapon
} from "./codexPilot";
import {
  CombatLog,
  createCombatLogSubCell,
  type CombatLogRubbleTarget,
  type CombatLogSource,
  type CombatLogTerrainTarget
} from "./combatLog";
import type { CollisionBounds, CollisionWorld } from "./collision";
import { DamageIndicatorOverlay } from "./damageIndicators";
import {
  createDebrisPerformancePressureState,
  getDebrisPressureEffectiveRigidDebrisBodyBudget,
  updateDebrisPerformancePressureState
} from "./debrisPerformanceGovernor";
import { DebrisStuckCleanupTracker } from "./debrisCleanup";
import { createDeleteWorldDialogCopy } from "./deleteWorldDialog";
import { DebrisPoofRenderer } from "./debrisPoof";
import { createDebrisShapeForBlock, fitDebrisShapeToVolumeBudget } from "./debrisShapes";
import {
  PhysicsCoreAimPreview,
  predictHitscanCoreTrajectory,
  predictPhysicsCoreTrajectory,
  type PhysicsCoreTrajectoryPrediction
} from "./coreAimPreview";
import {
  DEBRIS_ACTIVE_RADIUS_BUFFER_METERS,
  DebrisSettler,
  createEmptyDebrisSettlerStats,
  type DebrisSettlerStats
} from "./debrisSettler";
import {
  createEmptyDebrisLifecycleDiagnostics,
  wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells,
  type ChangedTerrainCell,
  type DebrisLifecycleDiagnostics
} from "./debrisSupportInvalidation";
import { DebugHud } from "./debugHud";
import { requireElement } from "./dom";
import { createEngineEventBus } from "./engineEvents";
import {
  IDLE_HEARTBEAT_MS,
  clampSimulationDelta,
  shouldHibernateAnimationLoop,
  shouldSkipExpensiveFrame
} from "./frameLoop";
import { BrowserFrameDiagnostics } from "./frameDiagnostics";
import {
  createEmptyFrameTimings,
  createEmptyPhysicsTimingStats,
  smoothFrameTimings,
  type FrameTimings,
  type PhysicsTimingStats
} from "./frameTimings";
import { readGpuInfo } from "./gpu";
import {
  createHotbarItems,
  canFireHitscanCoreWithHotbarItem,
  canThrowCoreWithHotbarItem,
  getHotbarIndexFromDigitCode,
  getHotbarItemLabel,
  getHotbarItemCategory,
  getHotbarPrimaryAction,
  getHotbarScrollDirection,
  getHotbarSecondaryAction,
  normalizeHotbarIndex,
  stepHotbarIndex,
  createBlockHotbarItems,
  createToolHotbarItems,
  type HotbarItem
} from "./hotbar";
import {
  HITSCAN_CORE_IMPACT_SPEED,
  HITSCAN_CORE_MAX_IMPACTS,
  HITSCAN_CORE_RADIUS,
  HITSCAN_CORE_RANGE,
  raycastHitscanCore
} from "./hitscanCore";
import {
  HITSCAN_DEBRIS_CLEAR_RADIUS,
  collectHitscanDebrisTargets
} from "./hitscanDebris";
import { HitscanBoltTracer } from "./hitscanBoltTracer";
import {
  EMPTY_HANDS_ITEM_ID,
  createItemStack,
  createVoxelSandboxItemRegistry,
  type ItemAction,
  type ItemUseButton
} from "./items";
import { SUN_OFFSET } from "./lighting";
import { MinimapRenderer } from "./minimap";
import { createNovaChatReply, createNovaTerminalRoute, NOVA_CHAT_TOGGLE_KEY } from "./novaChat";
import { NovaChatPanel } from "./novaChatPanel";
import { NovaContextJournal } from "./novaContext";
import { NOVA_PILOT_THROW_KEY, NOVA_PILOT_TOGGLE_KEY, NovaPilot } from "./novaPilot";
import { NovaPilotReactions } from "./novaPilotReactions";
import { shouldDeferPartialBlockMeshUpdate } from "./partialBlockMeshBudget";
import { PartialBlockMeshField } from "./partialBlockMeshField";
import {
  PARTIAL_BLOCK_CORE_DAMAGE,
  createPartialBlockFaceVisibilityMasks,
  type PartialBlockMeshRegionUpdate
} from "./partialBlocks";
import {
  PARTIAL_BLOCK_MESH_BUILD_JOB,
  buildPartialBlockMeshBuildJob,
  createPartialBlockMeshBuildJobPayload,
  type PartialBlockMeshBuildJobPayload,
  type PartialBlockMeshBuildJobResult
} from "./partialBlockMeshWorkerProtocol";
import {
  LOW_FPS_LOG_THRESHOLD,
  PerformanceHitchLog,
  writeRuntimeDiagnosticEvent,
  type PerformanceHitchLogPass,
  type PerformanceHitchRecord,
  type PerformanceHitchStatsSnapshot
} from "./performanceHitchLog";
import { PlayerController } from "./player";
import { PLAYER_HEIGHT } from "./playerMovement";
import { getPlayerSpeedMetersPerSecond } from "./playerSpeed";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PHYSICS_CORE_BLOCK_DAMAGE,
  PhysicsToy,
  PhysicsToyCollider,
  createEmptyPhysicsToyCollisionStats,
  type PhysicsImpact,
  type PhysicsToyCollisionStats
} from "./physics";
import {
  PLAYER_CORE_MUZZLE_FORWARD_METERS,
  createPlayerCoreMuzzleLocalOffset,
  createPlayerCoreShotDirection,
  createPlayerPhysicsCoreLaunchVelocity
} from "./physicsCoreLaunch";
import { PhysicsFragmentInstancer } from "./physicsInstancing";
import {
  MAX_PHYSICS_OBJECT_BUDGET,
  MIN_PHYSICS_OBJECT_BUDGET,
  PHYSICS_OBJECT_BUDGET_STEP,
  normalizePhysicsObjectBudget,
  readPhysicsObjectBudgetPreference,
  stepPhysicsObjectBudget,
  writePhysicsObjectBudgetPreference,
  type PhysicsBudgetDirection
} from "./physicsBudget";
import {
  PHYSICS_CORE_BOUNCE_MAX_COUNT,
  PHYSICS_CORE_BOUNCE_MIN_COUNT,
  PHYSICS_CORE_BOUNCE_STEP_COUNT,
  PHYSICS_CORE_SIZE_MAX_PERCENT,
  PHYSICS_CORE_SIZE_MIN_PERCENT,
  PHYSICS_CORE_SIZE_STEP_PERCENT,
  PHYSICS_CORE_VELOCITY_MAX_PERCENT,
  PHYSICS_CORE_VELOCITY_MIN_PERCENT,
  PHYSICS_CORE_VELOCITY_STEP_PERCENT,
  PHYSICS_CORE_HUE_MAX_DEGREES,
  PHYSICS_CORE_HUE_MIN_DEGREES,
  PHYSICS_CORE_HUE_STEP_DEGREES,
  formatPhysicsCoreBounceCount,
  formatPhysicsCoreHue,
  formatPhysicsCorePercent,
  getPhysicsCoreRadius,
  getPhysicsCoreVelocityMultiplier,
  normalizePhysicsCoreBounceCount,
  normalizePhysicsCoreHueDegrees,
  normalizePhysicsCoreSettings,
  normalizePhysicsCoreSizePercent,
  normalizePhysicsCoreVelocityPercent,
  readPhysicsCoreSettingsPreference,
  writePhysicsCoreSettingsPreference,
  type PhysicsCoreSettings
} from "./physicsCoreSettings";
import { PhysicsCoreTrail } from "./physicsCoreTrail";
import {
  applyPhysicsCoreMaterialColor,
  createPhysicsCoreColor,
  createPhysicsCoreMaterial,
  getPhysicsCoreCssColor
} from "./physicsCoreVisuals";
import { QualityController, type QualityChangeSource } from "./qualityController";
import { DEFAULT_QUALITY_PRESET, QUALITY_PRESETS } from "./qualityPresets";
import {
  BLOCK_FRAGMENT_MAX_COUNT,
  BLOCK_FRAGMENT_MIN_COUNT,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  RENDER_DISTANCE_STEP,
  SHADOW_QUALITY_MAX_LEVEL,
  SHADOW_QUALITY_MIN_LEVEL,
  formatBlockFragmentCount,
  formatRenderDistance,
  formatShadowQuality,
  getShadowQualityLevel
} from "./qualitySettings";
import { voxelRaycast, type VoxelRaycastHit } from "./raycast";
import {
  GROUND_DEBRIS_BUDGET_STEP,
  MAX_GROUND_DEBRIS_BUDGET,
  MIN_GROUND_DEBRIS_BUDGET,
  formatGroundDebrisBudget,
  getEffectiveRigidDebrisBodyBudget,
  isGroundDebrisBudgetCleanupEligible,
  normalizeGroundDebrisBudget,
  readGroundDebrisBudgetPreference,
  writeGroundDebrisBudgetPreference
} from "./rigidDebrisBudget";
import {
  DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS,
  FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS,
  GROUND_DEBRIS_LIFETIME_STEP_SECONDS,
  MAX_GROUND_DEBRIS_LIFETIME_SECONDS,
  MIN_GROUND_DEBRIS_LIFETIME_SECONDS,
  formatGroundDebrisLifetime,
  getEffectiveGroundDebrisLifetimeSeconds,
  normalizeGroundDebrisLifetime,
  readGroundDebrisLifetimePreference,
  writeGroundDebrisLifetimePreference
} from "./debrisLifetime";
import {
  RigidDebrisSimulation,
  createEmptyRigidDebrisStats,
  type RigidDebrisStats
} from "./rigidDebris";
import {
  partitionRigidDebrisAdmission,
  selectRigidDebrisAdmissionIndices,
  type RigidDebrisAdmissionFragment
} from "./rigidDebrisAdmission";
import {
  RubbleField,
  type RubbleDamageEvent,
  type RubbleFieldStats
} from "./rubble";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "./shadows";
import {
  BASE_CAMERA_FOV,
  SPRINT_FEEDBACK_ACTIVE_CLASS,
  getPlayerCameraTargetFov,
  smoothSprintFeedbackFov
} from "./sprintFeedback";
import { createSkybox } from "./skybox";
import { TargetBlockHighlighter } from "./targetHighlighter";
import {
  TERRAFORMER_SIZE_DEFAULT,
  TERRAFORMER_SIZE_MAX,
  TERRAFORMER_SIZE_MIN,
  TERRAFORMER_SIZE_STEP,
  formatTerraformerSize,
  normalizeTerraformerSize,
  stepTerraformerSize
} from "./terraformerSettings";
import { SUPERFLAT_WORLD_SEED, type TerrainProfile } from "./terrain";
import { WORLD_HEIGHT } from "./voxelConstants";
import {
  TEST_AVATAR_QUERY_PARAM,
  TEST_AVATAR_TOGGLE_KEY,
  TestAvatar,
  type TestAvatarApi
} from "./testAvatar";
import {
  VisualTestRecorder,
  normalizeVisualPilotRecordOptions,
  summarizeVisualTestScenarioHitches,
  type VisualPilotRecordOptions,
  type VisualTestRecorderApi,
  type VisualTestScenarioRuntimeSnapshot
} from "./visualTestRecorder";
import {
  getVisualTestScenario,
  listVisualTestScenarios,
  type VisualTestScenario,
  type VisualTestScenarioSummary
} from "./visualTestScenarios";
import { WorkerPool } from "./workerPool";
import {
  VoxelWorld,
  type BlockDamageResult,
  type BlockPierceContinuation,
  type ChunkCoords,
  type DebrisEjectionHint,
  type TerrainSupportInvalidationCell,
  type TerraformerEditInput,
  type TerraformerEditPreview,
  type TerraformerTargetSubCell,
  type TerraformerTerrainRaycastHit,
  type VoxelBlockPosition,
  type WorldStats
} from "./world";
import { createReadableSeed, renderHomeWorldList } from "./worldMenu";

const BLOCK_INTERACTION_REACH = 8;
const APP_VERSION = packageManifest.version;
const CHANGELOG_ENTRIES = parseChangelogEntries(changelogMarkdown);
const TARGET_HIT_EPSILON = 0.0001;
const PHYSICS_CORE_SLEEP_SPEED = 0.12;
const PHYSICS_CORE_SLEEP_AFTER_SECONDS = 0.9;
const PHYSICS_CORE_HARD_TTL_SECONDS = 20;
const PHYSICS_CORE_LOW_SPEED_DESPAWN_SPEED = BLOCK_DAMAGE_IMPACT_SPEED * 0.65;
const PHYSICS_CORE_LOW_SPEED_DESPAWN_SECONDS = 3.5;
// Fragment launch is tuned separately from the later sticky-settling pass.
// The first few frames should read as a voxel shattering outward before the
// short glue window turns the debris into a believable local heap.
const FRAGMENT_IMPACT_SPEED_SCALE = 0.75;
const FRAGMENT_IMPACT_SPEED_CAP = 8.75;
const FRAGMENT_SCATTER_SPEED_MIN = 2.2;
const FRAGMENT_SCATTER_SPEED_RANGE = 2.6;
const FRAGMENT_JITTER_SPEED = 13.5;
const FRAGMENT_UPWARD_SPEED_MIN = 1;
const FRAGMENT_UPWARD_SPEED_RANGE = 1.75;
// Terraformer edits are exact, but we still feed a gentle "impact speed" into
// shared chip/poof helpers so edited cells get familiar terrain feedback.
const TERRAFORMER_IMPACT_SPEED = 6;
const FRAME_SPIKE_EVENT_MS = 45;
const RUNTIME_DIAGNOSTIC_EVENT_LIMIT = 24;
const PLAYER_LOCATION_AUTOSAVE_MS = 5000;
const PLAYER_LOCATION_POSITION_EPSILON = 0.05;
const PLAYER_LOCATION_LOOK_EPSILON = 0.002;
const PLAYER_LOCATION_SAVE_PRECISION = 1000;
const CORE_AIM_PREVIEW_TOGGLE_KEY = "F6";
const CLICK_FIRE_MODE_TOGGLE_KEY = "KeyT";
const FULL_AUTO_CLICK_ACTION_INTERVAL_MS = 140;
const DEFAULT_WORLD_TERRAIN_PROFILE: TerrainProfile = "varied";
const CREATE_WORLD_TERRAIN_PROFILES = new Set<TerrainProfile>([
  "varied",
  "floating-islands",
  "classic"
]);
const bootPreset = QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
type FrameTimingSection = Exclude<keyof FrameTimings, "frameMs">;
type VoxelRuntimeGlobal = typeof globalThis & {
  __VOXEL_SANDBOX_DISPOSE__?: () => void;
  __VOXEL_ADMIN__?: AdminCommandApi;
  __VOXEL_CODEX_PILOT__?: CodexPilotApi;
  __VOXEL_TEST_AVATAR__?: TestAvatarApi;
  __VOXEL_HITCHES__?: () => readonly PerformanceHitchRecord[];
  __VOXEL_HITCH_PASS__?: () => PerformanceHitchLogPass;
  __VOXEL_HITCH_START_PASS__?: (label?: string) => PerformanceHitchLogPass;
  __VOXEL_VISUAL_TEST__?: VisualTestRecorderApi;
  __VOXEL_COMBAT_LOG__?: CombatLog;
};
type ViteHotContext = {
  dispose(callback: () => void): void;
};

const voxelRuntimeGlobal = globalThis as VoxelRuntimeGlobal;
voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__?.();

const mainAbortController = new AbortController();
const eventListenerOptions: AddEventListenerOptions = { signal: mainAbortController.signal };
const wheelListenerOptions: AddEventListenerOptions = {
  signal: mainAbortController.signal,
  passive: false
};

const app = requireElement<HTMLElement>("#app");
const homeScreen = requireElement<HTMLElement>("#home-screen");
const createWorldForm = requireElement<HTMLFormElement>("#create-world-form");
const worldNameInput = requireElement<HTMLInputElement>("#world-name-input");
const worldSeedInput = requireElement<HTMLInputElement>("#world-seed-input");
const worldTypeSelect = requireElement<HTMLSelectElement>("#world-type-select");
const randomSeedButton = requireElement<HTMLButtonElement>("#random-seed-button");
const superflatWorldButton = requireElement<HTMLButtonElement>("#superflat-world-button");
const worldSaveOrigin = requireElement<HTMLElement>("#world-save-origin");
const homeWorldList = requireElement<HTMLElement>("#home-world-list");
const deleteWorldDialog = requireElement<HTMLElement>("#delete-world-dialog");
const deleteWorldName = requireElement<HTMLElement>("#delete-world-name");
const deleteWorldCopy = requireElement<HTMLElement>("#delete-world-copy");
const deleteWorldError = requireElement<HTMLElement>("#delete-world-error");
const cancelDeleteWorldButton = requireElement<HTMLButtonElement>("#cancel-delete-world-button");
const confirmDeleteWorldButton = requireElement<HTMLButtonElement>("#confirm-delete-world-button");
const versionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-app-version]"));
const changelogDialog = requireElement<HTMLElement>("#changelog-dialog");
const changelogCurrentVersion = requireElement<HTMLElement>("#changelog-current-version");
const changelogList = requireElement<HTMLElement>("#changelog-list");
const changelogCloseButton = requireElement<HTMLButtonElement>("#changelog-close-button");
const pauseMenu = requireElement<HTMLElement>("#pause-menu");
const resumeButton = requireElement<HTMLButtonElement>("#resume-button");
const homeButton = requireElement<HTMLButtonElement>("#home-button");
const loadoutButton = requireElement<HTMLButtonElement>("#loadout-button");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const builderButton = requireElement<HTMLButtonElement>("#builder-button");
const novaChatButton = requireElement<HTMLButtonElement>("#nova-chat-button");
const pauseLoadoutPanel = requireElement<HTMLElement>("#pause-loadout-panel");
const pauseSettingsPanel = requireElement<HTMLElement>("#pause-settings-panel");
const pauseBuilderPanel = requireElement<HTMLElement>("#pause-builder-panel");
const loadoutToolsTab = requireElement<HTMLButtonElement>("#loadout-tab-tools");
const loadoutBlocksTab = requireElement<HTMLButtonElement>("#loadout-tab-blocks");
const loadoutToolsPanel = requireElement<HTMLElement>("#loadout-tools-panel");
const loadoutBlocksPanel = requireElement<HTMLElement>("#loadout-blocks-panel");
const loadoutToolList = requireElement<HTMLElement>("#loadout-tool-list");
const loadoutBlockList = requireElement<HTMLElement>("#loadout-block-list");
const settingsGraphicsTab = requireElement<HTMLButtonElement>("#settings-tab-graphics");
const settingsGameplayTab = requireElement<HTMLButtonElement>("#settings-tab-gameplay");
const settingsExperimentalTab = requireElement<HTMLButtonElement>("#settings-tab-experimental");
const settingsGraphicsPanel = requireElement<HTMLElement>("#settings-graphics-panel");
const settingsGameplayPanel = requireElement<HTMLElement>("#settings-gameplay-panel");
const settingsExperimentalPanel = requireElement<HTMLElement>("#settings-experimental-panel");
const qualitySelect = requireElement<HTMLSelectElement>("#quality-select");
const renderDistanceSlider = requireElement<HTMLInputElement>("#render-distance-slider");
const renderDistanceValue = requireElement<HTMLElement>("#render-distance-value");
const physicsBudgetValue = requireElement<HTMLElement>("#physics-budget-value");
const physicsBudgetDecreaseButton = requireElement<HTMLButtonElement>("#physics-budget-decrease");
const physicsBudgetIncreaseButton = requireElement<HTMLButtonElement>("#physics-budget-increase");
const physicsBudgetSlider = requireElement<HTMLInputElement>("#physics-budget-slider");
const despawnObjectsButton = requireElement<HTMLButtonElement>("#despawn-objects-button");
const shadowQualitySlider = requireElement<HTMLInputElement>("#shadow-quality-slider");
const shadowQualityValue = requireElement<HTMLElement>("#shadow-quality-value");
const debrisCountSlider = requireElement<HTMLInputElement>("#debris-count-slider");
const debrisCountValue = requireElement<HTMLElement>("#debris-count-value");
const terraformerSizeSlider = requireElement<HTMLInputElement>("#terraformer-size-slider");
const terraformerSizeValue = requireElement<HTMLElement>("#terraformer-size-value");
const coreSizeSlider = requireElement<HTMLInputElement>("#core-size-slider");
const coreSizeValue = requireElement<HTMLElement>("#core-size-value");
const coreVelocitySlider = requireElement<HTMLInputElement>("#core-velocity-slider");
const coreVelocityValue = requireElement<HTMLElement>("#core-velocity-value");
const coreBounceSlider = requireElement<HTMLInputElement>("#core-bounce-slider");
const coreBounceValue = requireElement<HTMLElement>("#core-bounce-value");
const coreColorSlider = requireElement<HTMLInputElement>("#core-color-slider");
const coreColorValue = requireElement<HTMLElement>("#core-color-value");
const coreTrailToggle = requireElement<HTMLInputElement>("#core-trail-toggle");
const groundDebrisBudgetSlider = requireElement<HTMLInputElement>("#ground-debris-budget-slider");
const groundDebrisBudgetValue = requireElement<HTMLElement>("#ground-debris-budget-value");
const groundDebrisLifetimeSlider = requireElement<HTMLInputElement>("#ground-debris-lifetime-slider");
const groundDebrisLifetimeValue = requireElement<HTMLElement>("#ground-debris-lifetime-value");
const groundDebrisLifetimeForeverToggle = requireElement<HTMLInputElement>("#ground-debris-lifetime-forever-toggle");
const coreAimPreviewToggle = requireElement<HTMLInputElement>("#core-aim-preview-toggle");
const healthBarsToggle = requireElement<HTMLInputElement>("#health-bars-toggle");
const controlHintsToggle = requireElement<HTMLInputElement>("#control-hints-toggle");
const soundEnabledToggle = requireElement<HTMLInputElement>("#sound-enabled-toggle");
const masterVolumeSlider = requireElement<HTMLInputElement>("#master-volume-slider");
const masterVolumeValue = requireElement<HTMLElement>("#master-volume-value");
const sfxVolumeSlider = requireElement<HTMLInputElement>("#sfx-volume-slider");
const sfxVolumeValue = requireElement<HTMLElement>("#sfx-volume-value");
const uiVolumeSlider = requireElement<HTMLInputElement>("#ui-volume-slider");
const uiVolumeValue = requireElement<HTMLElement>("#ui-volume-value");
const builderModeToggleButton = requireElement<HTMLButtonElement>("#builder-mode-toggle-button");
const builderBlockPalette = requireElement<HTMLElement>("#builder-block-palette");
const builderSelectedBlockValue = requireElement<HTMLElement>("#builder-selected-block-value");
const builderBrushSizeSlider = requireElement<HTMLInputElement>("#builder-brush-size-slider");
const builderBrushSizeValue = requireElement<HTMLElement>("#builder-brush-size-value");
const builderPlaceBrushButton = requireElement<HTMLButtonElement>("#builder-place-brush-button");
const builderEraseBrushButton = requireElement<HTMLButtonElement>("#builder-erase-brush-button");
const builderSpawnTargetButton = requireElement<HTMLButtonElement>("#builder-spawn-target-button");
const builderSpawnWallButton = requireElement<HTMLButtonElement>("#builder-spawn-wall-button");
const builderSpawnPlatformButton = requireElement<HTMLButtonElement>("#builder-spawn-platform-button");
const builderSpawnPillarButton = requireElement<HTMLButtonElement>("#builder-spawn-pillar-button");
const superUltraToggleRow = requireElement<HTMLElement>("#super-ultra-toggle-row");
const superUltraToggle = requireElement<HTMLInputElement>("#super-ultra-toggle");
const debugPanel = requireElement<HTMLElement>("#debug-panel");
const hotbar = requireElement<HTMLElement>("#hotbar");
const minimap = requireElement<HTMLCanvasElement>("#minimap");
const novaMessage = requireElement<HTMLElement>("#nova-message");
const novaChatRoot = requireElement<HTMLElement>("#nova-chat");
const novaChatLog = requireElement<HTMLElement>("#nova-chat-log");
const novaChatForm = requireElement<HTMLFormElement>("#nova-chat-form");
const novaChatInput = requireElement<HTMLInputElement>("#nova-chat-input");
const novaChatCloseButton = requireElement<HTMLButtonElement>("#nova-chat-close");
const sprintOverlay = requireElement<HTMLElement>("#sprint-overlay");
const damageIndicatorRoot = requireElement<HTMLElement>("#damage-indicators");

for (const versionButton of versionButtons) {
  versionButton.textContent = `v${APP_VERSION}`;
  versionButton.title = "Open release notes";
}
renderChangelogEntries();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const WORLD_FOG_COLOR = 0xb6d8ee;

const scene = new THREE.Scene();
scene.background = new THREE.Color(WORLD_FOG_COLOR);
const sceneFog = new THREE.Fog(WORLD_FOG_COLOR, bootPreset.fogNear, bootPreset.fogFar);
scene.fog = sceneFog;

const camera = new THREE.PerspectiveCamera(
  BASE_CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  0.05,
  bootPreset.cameraFar
);

const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
const sun = new THREE.DirectionalLight(0xfff0d0, bootPreset.sunIntensity);
sun.target = sunTarget;
scene.add(sun);

const skyLight = new THREE.HemisphereLight(0xb9d9ff, 0x394228, bootPreset.skyIntensity);
scene.add(skyLight);

const skybox = createSkybox(SUN_OFFSET);
scene.add(skybox.object);

const worldMaterial = createWorldBlockMaterial();
const partialBlockMaterial = createWorldBlockMaterial({ side: THREE.DoubleSide });

const targetBlockHighlighter = new TargetBlockHighlighter();
scene.add(targetBlockHighlighter.object);
const damageIndicators = new DamageIndicatorOverlay(damageIndicatorRoot);

let worldRegistry: WorldRegistry | null = null;
let world: VoxelWorld | null = null;
let player: PlayerController | null = null;
let inWorld = false;
let worldTransitioning = false;
let homeWorldListRefreshGeneration = 0;
let activeBuilderLane: BuilderLane = "items";
let selectedToolHotbarIndex = 0;
let selectedBlockHotbarIndex = 0;
let builderBrushSize = BUILDER_BRUSH_MIN_SIZE;
let qualityController: QualityController;
let physicsObjectBudget = bootPreset.physicsObjectBudget;
let pendingWorldDeletion: SavedWorld | null = null;
let lastSavedPlayerLocation: SavedPlayerStateSnapshot | null = null;
let nextPlayerLocationAutosaveAt = 0;
let playerLocationSaveChain: Promise<void> = Promise.resolve();
let runtimeDisposed = false;
let animationFrameId: number | null = null;
let idleHeartbeatTimerId: ReturnType<typeof setTimeout> | null = null;
let lastUserActivityAt = performance.now();
let physicsCoreSettings: PhysicsCoreSettings = readPhysicsCoreSettingsPreference();
let terraformerSize = readTerraformerSizePreference();
let clickFireMode: ClickFireMode = readClickFireModePreference();
let groundDebrisBudget = readGroundDebrisBudgetPreference();
let groundDebrisLifetimeSeconds = readGroundDebrisLifetimePreference();
let audioSettings: AudioSettings = readAudioSettingsPreference();
let lastTimedGroundDebrisLifetimeSeconds = groundDebrisLifetimeSeconds === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS
  ? DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS
  : groundDebrisLifetimeSeconds;
let debrisPerformancePressure = createDebrisPerformancePressureState(
  getEffectiveRigidDebrisBodyBudget(physicsObjectBudget)
);
let renderedPartialBlockRevision = -1;
let lastPartialBlockMeshUpdateMs = 0;
let runtimeDiagnosticEventsWritten = 0;
const pendingPartialBlockMeshJobs = new Map<string, PendingPartialBlockMeshJob>();
const PARTIAL_BLOCK_MESH_NORMAL_REGION_BUDGET = 8;
const PARTIAL_BLOCK_MESH_URGENT_REGION_BUDGET = 24;
let leftMouseButtonDown = false;
let rightMouseButtonDown = false;
let nextPrimaryClickActionAtMs = 0;
let nextSecondaryClickActionAtMs = 0;
let terraformerState: TerraformerState | null = null;
let coreAimPreviewEnabled = false;

const engineEvents = createEngineEventBus();
const gameAudio = new GameAudio({
  events: engineEvents,
  settings: audioSettings
});
const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
const toolHotbarItems = createToolHotbarItems();
const blockHotbarItems = createBlockHotbarItems(PLACEABLE_BLOCKS);
const fallbackHotbarItem = createItemStack(EMPTY_HANDS_ITEM_ID);
const novaContext = new NovaContextJournal(engineEvents);
const performanceHitchLog = new PerformanceHitchLog();
const frameDiagnostics = new BrowserFrameDiagnostics();
const clock = new THREE.Clock();
const direction = new THREE.Vector3();
const chunkStreamDirection = new THREE.Vector3();
const chunkStreamFrustum = new THREE.Frustum();
const chunkStreamProjection = new THREE.Matrix4();
const toys: PhysicsToy[] = [];
const gpuInfo = readGpuInfo(renderer);
const shadowBasis = createDirectionalShadowBasis(SUN_OFFSET);
const desiredShadowAnchor = new THREE.Vector3();
const stableShadowAnchor = new THREE.Vector3();
const physicsImpacts: PhysicsImpact[] = [];
const damagedBlockKeysThisFrame = new Set<string>();

type TargetHit =
  | {
      readonly kind: "block";
      readonly source: "voxel";
      readonly block: VoxelRaycastHit["block"];
      readonly normal: VoxelRaycastHit["normal"];
      readonly distance: number;
    }
  | {
      readonly kind: "rubble";
      readonly source: "voxel";
      readonly block: VoxelRaycastHit["block"];
      readonly normal: VoxelRaycastHit["normal"];
      readonly distance: number;
    }
  | {
      readonly kind: "rubble";
      readonly source: "rubble";
      readonly block: VoxelRaycastHit["block"];
      readonly distance: number;
    };
type TerrainDamageFeedbackImpact = {
  readonly normal: THREE.Vector3;
  readonly speed: number;
  readonly position: THREE.Vector3;
  readonly incomingVelocity: THREE.Vector3;
  readonly radius?: number;
};
type CoreTerrainImpact = {
  readonly block: VoxelRaycastHit["block"];
  readonly normal: THREE.Vector3;
  readonly speed: number;
  readonly position: THREE.Vector3;
  readonly incomingVelocity: THREE.Vector3;
  readonly radius: number;
};
type CoreTerrainImpactApplyResult = {
  readonly results: readonly BlockDamageResult[];
  readonly primaryResult?: BlockDamageResult;
  readonly pierceContinuation?: BlockPierceContinuation;
};
type PlayerCoreFiringSolution = {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
};
type TerraformerState = {
  readonly targetKey: string;
};
type SettingsCategory = "graphics" | "gameplay" | "experimental";
type PendingPartialBlockMeshJob = {
  readonly id: number;
  readonly revision: number;
};

const TERRAFORMER_COMBAT_SOURCE: CombatLogSource = { kind: "terraformer", label: "Terraformer" };
const PHYSICS_CORE_COMBAT_SOURCE: CombatLogSource = { kind: "physics-core", label: "Physics Core" };
const HITSCAN_CORE_COMBAT_SOURCE: CombatLogSource = { kind: "hitscan-core", label: "Hitscan Core" };
const BUILDER_COMBAT_SOURCE: CombatLogSource = { kind: "builder", label: "Builder" };

declare global {
  interface Window {
    __VOXEL_COMBAT_LOG__?: CombatLog;
  }
}
type LoadoutCategory = "tools" | "blocks";
type PauseSubmenu = "loadout" | "settings" | "builder";
const physicsToyCollider = new PhysicsToyCollider();
const physicsFragmentInstancer = new PhysicsFragmentInstancer(scene);
const coreAimPreview = new PhysicsCoreAimPreview(scene);
const builderBrushPreview = new BuilderBrushPreview(scene);
const hitscanBoltTracer = new HitscanBoltTracer(scene);
const physicsCoreTrail = new PhysicsCoreTrail(scene);
const debrisPoofRenderer = new DebrisPoofRenderer(scene);
const debrisStuckCleanup = new DebrisStuckCleanupTracker();
const workerPool = new WorkerPool({
  createWorker: () => new Worker(new URL("./engineWorker.ts", import.meta.url), {
    type: "module",
    name: "voxel-engine-worker-pool"
  })
});
const partialBlockMeshField = new PartialBlockMeshField(scene, partialBlockMaterial);
const rubbleField = new RubbleField(scene);
const debrisSettler = new DebrisSettler();
const rigidDebris = new RigidDebrisSimulation();
const HEALTH_BARS_STORAGE_KEY = "voxel-sandbox-health-bars-enabled";
const CORE_AIM_PREVIEW_STORAGE_KEY = "voxel-sandbox-core-aim-preview-enabled";
const TERRAFORMER_SIZE_STORAGE_KEY = "voxel-sandbox-terraformer-size";
const CLICK_FIRE_MODE_STORAGE_KEY = "voxel-sandbox-click-fire-mode";
const CONTROL_HINTS_STORAGE_KEY = "voxel-sandbox-control-hints-visible";
const LOCAL_COMBAT_LOG_ENDPOINT = "/__voxel_combat_log";
const LOCAL_COMBAT_LOG_RECEIVER_ENDPOINT = "http://127.0.0.1:5174/__voxel_combat_log";
const terrainAndRubbleCollisionWorld: CollisionWorld = {
  // Full terrain blocks still come from VoxelWorld. Damaged terrain also exposes
  // explicit sub-voxel collision boxes so loose debris can collide with the
  // remaining visible lattice instead of the obsolete full macro-block shell.
  // Partial-height scars and rubble keep using the support-height query for
  // walkable/contact surfaces that do not need full Rapier boxes.
  isSolid: (x, y, z) => requireWorld().isSolid(x, y, z),
  isPartialBlock: (x, y, z) => Boolean(requireWorld().getPartialBlock(x, y, z)),
  getCellCollisionBoxes: (x, y, z) => requireWorld().getCellCollisionBoxes(x, y, z),
  canProjectileHitBlock: (x, y, z, start, movement, radius) =>
    requireWorld().canProjectileHitBlock(x, y, z, start, movement, radius),
  getProjectileBlockSweepHit: (x, y, z, start, movement, radius) =>
    requireWorld().getProjectileBlockSweepHit(x, y, z, start, movement, radius),
  getSupportHeight: (bounds) => {
    const terrainSupportY = requireWorld().getSupportHeight(bounds);
    const rubbleSupportY = rubbleField.getSupportHeight(bounds);
    if (terrainSupportY === null) return rubbleSupportY;
    if (rubbleSupportY === null) return terrainSupportY;
    return Math.max(terrainSupportY, rubbleSupportY);
  },
  getPlayerFootprintSupportHeight: (bounds, options) => {
    const terrainSupportY = requireWorld().getPlayerFootprintSupportHeight(bounds, options);
    const rubbleSupportY = rubbleField.getSupportHeight(bounds);
    if (terrainSupportY === null) return rubbleSupportY;
    if (rubbleSupportY === null) return terrainSupportY;
    return Math.max(terrainSupportY, rubbleSupportY);
  }
};
const novaPilot = new NovaPilot();
scene.add(novaPilot.object);
const novaPilotReactions = new NovaPilotReactions({
  events: engineEvents,
  pilot: novaPilot,
  output: novaMessage
});
const adminCommandHooks: AdminCommandHooks = {
  isWorldActive: () => inWorld,
  getWorld: requireWorld,
  getCamera: () => camera,
  createSuperflatWorld,
  noteActivity: noteUserActivity
};
function runAdminCommandWithTerrainSupportInvalidation(command: string): AdminCommandResult {
  const changedTerrainCells: ChangedTerrainCell[] = [];
  const changedTerrainCellKeys = new Set<string>();
  const result = runAdminCommand({
    ...adminCommandHooks,
    onTerrainCellChanged: (cell) => {
      collectTerrainSupportInvalidationCells(cell, changedTerrainCells, changedTerrainCellKeys);
    }
  }, command);

  if (changedTerrainCells.length > 0) {
    invalidateDebrisSupportForEditedCells(changedTerrainCells);
  }
  return result;
}
const novaChatPanel = new NovaChatPanel({
  root: novaChatRoot,
  log: novaChatLog,
  form: novaChatForm,
  input: novaChatInput,
  closeButton: novaChatCloseButton,
  routeInput: (message) => createNovaTerminalRoute(message, {
    getChatReply: (chatMessage) => createNovaChatReply(chatMessage, novaContext.snapshot()),
    runCommand: runAdminCommandWithTerrainSupportInvalidation,
    isCommand: isAdminCommandInput
  }),
  onOpen: openNovaChatInputMode,
  onClose: closeNovaChatInputMode,
  onMessage: (message) => {
    engineEvents.emit("nova:chat-message", {
      role: message.role,
      text: message.text
    });
  }
});
const testAvatar = new TestAvatar({
  isWorldActive: () => inWorld,
  getWorld: requireWorld,
  getPlayer: requirePlayer,
  getCamera: () => camera,
  throwPlayerCore: () => throwPlayerCore(requirePlayer()),
  noteActivity: noteUserActivity
});
const visualTestRecorder = new VisualTestRecorder({
  canvas: renderer.domElement,
  getMetadata: () => ({
    worldActive: inWorld,
    selectedItemLabel: inWorld ? getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry) : null,
    qualityLabel: getVisualRecorderQualityLabel(),
    currentHitchPass: performanceHitchLog.getPass()
  })
});
const codexPilot = new CodexPilot({
  isWorldActive: () => inWorld,
  getWorld: requireWorld,
  getPlayer: requirePlayer,
  getCamera: () => camera,
  getSelectedItemLabel: () => getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry),
  runAdminCommand: runAdminCommandWithTerrainSupportInvalidation,
  createSuperflatWorld,
  selectWeapon: selectCodexPilotWeapon,
  fireSelectedPrimary: () => useSelectedHotbarPrimaryAction(requirePlayer()),
  setAdsActive: (active) => {
    rightMouseButtonDown = active;
  },
  getCoreAimPreviewEnabled: () => coreAimPreviewEnabled,
  setCoreAimPreviewEnabled,
  resumePlayer: () => requirePlayer().resume(),
  startHitchPass: (label) => performanceHitchLog.startPass(label),
  getRecentHitches: () => performanceHitchLog.getRecent(),
  noteActivity: noteUserActivity
});
voxelRuntimeGlobal.__VOXEL_ADMIN__ = {
  run: runAdminCommandWithTerrainSupportInvalidation
};
voxelRuntimeGlobal.__VOXEL_CODEX_PILOT__ = codexPilot.api;
voxelRuntimeGlobal.__VOXEL_TEST_AVATAR__ = testAvatar.api;
voxelRuntimeGlobal.__VOXEL_HITCHES__ = () => performanceHitchLog.getRecent();
voxelRuntimeGlobal.__VOXEL_HITCH_PASS__ = () => performanceHitchLog.getPass();
voxelRuntimeGlobal.__VOXEL_HITCH_START_PASS__ = (label?: string) => performanceHitchLog.startPass(label);
voxelRuntimeGlobal.__VOXEL_VISUAL_TEST__ = {
  snapshot: () => visualTestRecorder.snapshot(),
  start: (options) => visualTestRecorder.start({
    ...options,
    logPass: options?.logPass ?? performanceHitchLog.getPass()
  }),
  stop: (options) => visualTestRecorder.stop(options),
  listScenarios: () => listVisualTestScenarios(),
  scenarioSnapshot: (id) => createVisualScenarioSnapshot(getVisualTestScenario(id)),
  recordScenario,
  recordPilotPlay
};
let physicsCollisionStats: PhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();
let debrisSettlerStats: DebrisSettlerStats = createEmptyDebrisSettlerStats();
let rigidDebrisStats: RigidDebrisStats = createEmptyRigidDebrisStats();
let debrisLifecycleDiagnostics: DebrisLifecycleDiagnostics = createEmptyDebrisLifecycleDiagnostics();
let latestPhysicsTimingStats: PhysicsTimingStats = createEmptyPhysicsTimingStats();
let smoothedFrameTimings = createEmptyFrameTimings();
let frameTimingsInitialized = false;
let healthBarsEnabled = readHealthBarsEnabled();
let controlHintsVisible = readControlHintsVisible();
coreAimPreviewEnabled = readCoreAimPreviewEnabled();

void rigidDebris.initialize().catch((error) => {
  console.warn("Rigid debris physics failed to initialize; falling back to legacy fragment motion.", error);
});

const debugHud = new DebugHud({
  panel: debugPanel,
  renderer,
  gpuInfo,
  getQualityPreset: () => qualityController.preset
});
const combatLog = new CombatLog(160, {
  persistence: {
    endpoints: getCombatLogPersistenceEndpoints(),
    getContext: createCombatLogPersistenceContext
  }
});
voxelRuntimeGlobal.__VOXEL_COMBAT_LOG__ = combatLog;

worldSaveOrigin.textContent = getWorldSaveOriginLabel();

const minimapRenderer = new MinimapRenderer({
  canvas: minimap,
  camera,
  getWorld: requireWorld,
  getInterval: () => qualityController.minimapInterval,
  getRowsPerFrame: () => qualityController.minimapRowsPerFrame
});

qualityController = new QualityController({
  renderer,
  camera,
  sun,
  skyLight,
  fog: sceneFog,
  qualitySelect,
  superUltraToggleRow,
  superUltraToggle,
  updateSunShadowAnchor,
  onQualityChanged: (source: QualityChangeSource) => {
    debugHud.reset();
    minimapRenderer.reset();
    if (source === "preset") syncPhysicsBudgetToQuality();
    updateSettingsControls();
    emitQualityChanged(source);
  }
});
qualityController.initialize();
updateSettingsControls();
updatePhysicsBudgetControls();
updateTerraformerControls();
updatePhysicsCoreControls();
updateGroundDebrisBudgetControls();
syncHealthBarsToggle();
syncControlHintsToggle();
syncCoreAimPreviewToggle();
syncAudioControls();
renderLoadoutMenus();
renderBuilderPalette();
syncBuilderControls();
renderHotbar();
installRuntimeRenderDiagnostics();

function installRuntimeRenderDiagnostics(): void {
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    // If WebGL dies while the DOM menu still works, the normal frame/hitch
    // path may stop giving us useful evidence. Keep this breadcrumb tiny and
    // local so the next log review can distinguish a renderer context loss
    // from an engine-wide main-thread freeze.
    event.preventDefault();
    recordRuntimeRenderDiagnostic("webgl-context-lost", {
      canvasWidth: renderer.domElement.width,
      canvasHeight: renderer.domElement.height
    });
    console.warn("Voxel renderer WebGL context lost; logged runtime diagnostic.");
  }, eventListenerOptions);

  renderer.domElement.addEventListener("webglcontextrestored", () => {
    recordRuntimeRenderDiagnostic("webgl-context-restored", {
      canvasWidth: renderer.domElement.width,
      canvasHeight: renderer.domElement.height
    });
    console.warn("Voxel renderer WebGL context restored; logged runtime diagnostic.");
  }, eventListenerOptions);

  window.addEventListener("error", (event) => {
    recordRuntimeRenderDiagnostic("window-error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serializeRuntimeError(event.error)
    });
  }, eventListenerOptions);

  window.addEventListener("unhandledrejection", (event) => {
    recordRuntimeRenderDiagnostic("unhandled-rejection", {
      reason: serializeRuntimeError(event.reason)
    });
  }, eventListenerOptions);
}

function recordRuntimeRenderDiagnostic(
  type: string,
  details: Readonly<Record<string, unknown>>
): void {
  if (runtimeDiagnosticEventsWritten >= RUNTIME_DIAGNOSTIC_EVENT_LIMIT) return;
  runtimeDiagnosticEventsWritten += 1;

  writeRuntimeDiagnosticEvent({
    type,
    logPass: performanceHitchLog.getPass(),
    details: {
      appVersion: APP_VERSION,
      inWorld,
      qualityLabel: qualityController.preset.label,
      physicsObjectCount: toys.length,
      physicsObjectBudget,
      rigidDebrisBodyBudget: getCurrentRigidDebrisBodyBudget(),
      rigidDebris: rigidDebrisStats,
      renderer: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      },
      gpu: gpuInfo,
      documentHidden: document.hidden,
      visibilityState: document.visibilityState,
      ...details
    }
  });
}

function serializeRuntimeError(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}

function requireWorldRegistry(): WorldRegistry {
  if (!worldRegistry) {
    throw new Error("World registry is not initialized.");
  }
  return worldRegistry;
}

function requireWorld(): VoxelWorld {
  if (!world) {
    throw new Error("World is not initialized.");
  }
  return world;
}

function requirePlayer(): PlayerController {
  if (!player) {
    throw new Error("Player is not initialized.");
  }
  return player;
}

function createStorageForSavedWorld(savedWorld: SavedWorld): Promise<ChunkStorage> {
  // Saved chunks are full vertical snapshots. When the varied terrain surface
  // moved upward for the 96m world, legacy 48m edited chunks needed the same
  // read-time lift so touched and untouched terrain keep lining up.
  return createChunkStorage(savedWorld.id, undefined, {
    legacyHeightOffset: getLegacyWorldHeightOffset(savedWorld.terrainProfile)
  });
}

async function startApp(): Promise<void> {
  try {
    worldRegistry = await createWorldRegistry();
    const initialWorld = await worldRegistry.getActiveWorld();
    world = new VoxelWorld({
      storage: await createStorageForSavedWorld(initialWorld),
      seed: initialWorld.seed,
      terrainProfile: initialWorld.terrainProfile,
      workerPool
    });
    await world.loadSavedChunkIndex();

    camera.position.set(2, 24, 2);
    player = new PlayerController(camera, renderer.domElement, terrainAndRubbleCollisionWorld);
    wireMenuControls();
    worldSeedInput.value = createReadableSeed();
    await refreshHomeWorldList();
    scheduleNextFrame();
  } catch (error) {
    console.error("Could not start voxel engine", error);
    homeWorldList.textContent = "Could not open local save storage.";
  }
}

function wireMenuControls(): void {
  const activePlayer = requirePlayer();

  activePlayer.onPauseChange = (paused: boolean) => {
    pauseMenu.classList.toggle("is-hidden", !inWorld || !paused);
    if (paused) {
      clearPointerHoldState();
      void queueActivePlayerLocationSave(true);
    }
    if (!paused) closePauseSubmenus();
  };

  pauseMenu.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, input, label, select, .settings-panel, .loadout-panel, .builder-panel")) return;
    event.preventDefault();
    resumeFromPause();
  }, eventListenerOptions);
  resumeButton.addEventListener("click", resumeFromPause, eventListenerOptions);
  loadoutButton.addEventListener("click", () => {
    setLoadoutPanelOpen(pauseLoadoutPanel.hidden);
  }, eventListenerOptions);
  settingsButton.addEventListener("click", () => {
    setSettingsPanelOpen(pauseSettingsPanel.hidden);
  }, eventListenerOptions);
  builderButton.addEventListener("click", () => {
    setBuilderPanelOpen(pauseBuilderPanel.hidden);
  }, eventListenerOptions);
  settingsGraphicsTab.addEventListener("click", () => {
    setSettingsCategory("graphics");
  }, eventListenerOptions);
  settingsGameplayTab.addEventListener("click", () => {
    setSettingsCategory("gameplay");
  }, eventListenerOptions);
  settingsExperimentalTab.addEventListener("click", () => {
    setSettingsCategory("experimental");
  }, eventListenerOptions);
  loadoutToolsTab.addEventListener("click", () => {
    setLoadoutCategory("tools");
  }, eventListenerOptions);
  loadoutBlocksTab.addEventListener("click", () => {
    setLoadoutCategory("blocks");
  }, eventListenerOptions);
  novaChatButton.addEventListener("click", () => {
    openNovaChat();
  }, eventListenerOptions);
  // World switching stays on the home screen; the pause menu only exits back there.
  homeButton.addEventListener("click", () => {
    void exitToHome();
  }, eventListenerOptions);
  qualitySelect.addEventListener("change", () => qualityController.setPreset(qualitySelect.value), eventListenerOptions);
  renderDistanceSlider.addEventListener("input", () => {
    qualityController.setRenderDistance(renderDistanceSlider.value);
  }, eventListenerOptions);
  physicsBudgetDecreaseButton.addEventListener("click", () => changePhysicsObjectBudget("decrease"), eventListenerOptions);
  physicsBudgetIncreaseButton.addEventListener("click", () => changePhysicsObjectBudget("increase"), eventListenerOptions);
  physicsBudgetSlider.addEventListener(
    "input",
    () => setPhysicsObjectBudget(Number(physicsBudgetSlider.value)),
    eventListenerOptions
  );
  despawnObjectsButton.addEventListener("click", clearToys, eventListenerOptions);
  shadowQualitySlider.addEventListener("input", () => {
    qualityController.setShadowQualityLevel(shadowQualitySlider.value);
  }, eventListenerOptions);
  debrisCountSlider.addEventListener("input", () => {
    qualityController.setBlockFragmentCount(debrisCountSlider.value);
  }, eventListenerOptions);
  terraformerSizeSlider.addEventListener("input", () => {
    setTerraformerSize(terraformerSizeSlider.value);
  }, eventListenerOptions);
  coreSizeSlider.addEventListener("input", () => {
    setPhysicsCoreSizePercent(coreSizeSlider.value);
  }, eventListenerOptions);
  coreVelocitySlider.addEventListener("input", () => {
    setPhysicsCoreVelocityPercent(coreVelocitySlider.value);
  }, eventListenerOptions);
  coreBounceSlider.addEventListener("input", () => {
    setPhysicsCoreBounceCount(coreBounceSlider.value);
  }, eventListenerOptions);
  coreColorSlider.addEventListener("input", () => {
    setPhysicsCoreHueDegrees(coreColorSlider.value);
  }, eventListenerOptions);
  coreTrailToggle.addEventListener("change", () => {
    setPhysicsCoreTrailEnabled(coreTrailToggle.checked);
  }, eventListenerOptions);
  groundDebrisBudgetSlider.addEventListener("input", () => {
    setGroundDebrisBudget(groundDebrisBudgetSlider.value);
  }, eventListenerOptions);
  groundDebrisLifetimeSlider.addEventListener("input", () => {
    setGroundDebrisLifetime(groundDebrisLifetimeSlider.value);
  }, eventListenerOptions);
  groundDebrisLifetimeForeverToggle.addEventListener("change", () => {
    setGroundDebrisLifetimeForever(groundDebrisLifetimeForeverToggle.checked);
  }, eventListenerOptions);
  coreAimPreviewToggle.addEventListener("change", () => {
    setCoreAimPreviewEnabled(coreAimPreviewToggle.checked);
  }, eventListenerOptions);
  healthBarsToggle.addEventListener("change", () => {
    setHealthBarsEnabled(healthBarsToggle.checked);
  }, eventListenerOptions);
  controlHintsToggle.addEventListener("change", () => {
    setControlHintsVisible(controlHintsToggle.checked);
  }, eventListenerOptions);
  soundEnabledToggle.addEventListener("change", () => {
    setAudioEnabled(soundEnabledToggle.checked);
  }, eventListenerOptions);
  masterVolumeSlider.addEventListener("input", () => {
    setAudioVolume("masterVolume", masterVolumeSlider.value);
  }, eventListenerOptions);
  sfxVolumeSlider.addEventListener("input", () => {
    setAudioVolume("sfxVolume", sfxVolumeSlider.value);
  }, eventListenerOptions);
  uiVolumeSlider.addEventListener("input", () => {
    setAudioVolume("uiVolume", uiVolumeSlider.value);
  }, eventListenerOptions);
  builderModeToggleButton.addEventListener("click", () => {
    setBuilderLane(activeBuilderLane === "items" ? "blocks" : "items", { resumeGameplay: true });
  }, eventListenerOptions);
  builderBrushSizeSlider.addEventListener("input", () => {
    setBuilderBrushSize(builderBrushSizeSlider.value);
  }, eventListenerOptions);
  builderPlaceBrushButton.addEventListener("click", () => applyBuilderBrushAtTarget("place"), eventListenerOptions);
  builderEraseBrushButton.addEventListener("click", () => applyBuilderBrushAtTarget("erase"), eventListenerOptions);
  builderSpawnTargetButton.addEventListener("click", () => runBuilderSpawnCommand("target"), eventListenerOptions);
  builderSpawnWallButton.addEventListener("click", () => runBuilderSpawnCommand("wall"), eventListenerOptions);
  builderSpawnPlatformButton.addEventListener("click", () => runBuilderSpawnCommand("platform"), eventListenerOptions);
  builderSpawnPillarButton.addEventListener("click", () => runBuilderSpawnCommand("pillar"), eventListenerOptions);
  superUltraToggle.addEventListener("change", () => {
    qualityController.setSuperUltraEnabled(superUltraToggle.checked);
  }, eventListenerOptions);
  createWorldForm.addEventListener("submit", (event) => {
    void createWorldFromForm(event);
  }, eventListenerOptions);
  randomSeedButton.addEventListener("click", () => {
    worldSeedInput.value = createReadableSeed();
    worldSeedInput.focus();
  }, eventListenerOptions);
  superflatWorldButton.addEventListener("click", () => {
    void createSuperflatWorld();
  }, eventListenerOptions);
  for (const versionButton of versionButtons) {
    versionButton.addEventListener("click", openChangelogDialog, eventListenerOptions);
  }
  changelogCloseButton.addEventListener("click", closeChangelogDialog, eventListenerOptions);
  changelogDialog.addEventListener("pointerdown", (event) => {
    if (event.target === changelogDialog) {
      closeChangelogDialog();
    }
  }, eventListenerOptions);
  cancelDeleteWorldButton.addEventListener("click", closeDeleteWorldDialog, eventListenerOptions);
  confirmDeleteWorldButton.addEventListener("click", () => {
    void confirmPendingWorldDeletion();
  }, eventListenerOptions);
  deleteWorldDialog.addEventListener("pointerdown", (event) => {
    if (event.target === deleteWorldDialog) {
      closeDeleteWorldDialog();
    }
  }, eventListenerOptions);
}

function renderChangelogEntries(): void {
  changelogCurrentVersion.textContent = `Current build v${APP_VERSION}`;
  changelogList.replaceChildren(...CHANGELOG_ENTRIES.map(createChangelogEntryElement));
}

function createChangelogEntryElement(entry: ChangelogEntry): HTMLElement {
  const article = document.createElement("article");
  article.className = "changelog-entry";

  const header = document.createElement("div");
  header.className = "changelog-entry-header";

  const title = document.createElement("h3");
  title.className = "changelog-entry-title";
  title.textContent = entry.version ? `v${entry.version}` : entry.title;
  header.appendChild(title);

  if (entry.date) {
    const date = document.createElement("div");
    date.className = "changelog-entry-date";
    date.textContent = entry.date;
    header.appendChild(date);
  }

  const body = document.createElement("div");
  body.className = "changelog-entry-body";
  appendChangelogBody(body, entry.body);

  article.append(header, body);
  return article;
}

function appendChangelogBody(container: HTMLElement, markdown: string): void {
  let activeList: HTMLUListElement | null = null;

  for (const line of markdown.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      activeList = null;
      continue;
    }

    if (trimmedLine.startsWith("### ")) {
      activeList = null;
      const heading = document.createElement("h4");
      heading.textContent = trimmedLine.slice(4);
      container.appendChild(heading);
      continue;
    }

    if (trimmedLine.startsWith("- ")) {
      if (!activeList) {
        activeList = document.createElement("ul");
        container.appendChild(activeList);
      }
      const item = document.createElement("li");
      appendInlineChangelogMarkdown(item, trimmedLine.slice(2));
      activeList.appendChild(item);
      continue;
    }

    activeList = null;
    const paragraph = document.createElement("p");
    appendInlineChangelogMarkdown(paragraph, trimmedLine);
    container.appendChild(paragraph);
  }
}

function appendInlineChangelogMarkdown(container: HTMLElement, text: string): void {
  const parts = text.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.length === 0) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      container.appendChild(code);
      continue;
    }
    container.appendChild(document.createTextNode(part));
  }
}

function openChangelogDialog(): void {
  changelogDialog.classList.remove("is-hidden");
  changelogDialog.setAttribute("aria-hidden", "false");
  changelogList.scrollTop = 0;
  changelogCloseButton.focus();
}

function closeChangelogDialog(): void {
  changelogDialog.classList.add("is-hidden");
  changelogDialog.setAttribute("aria-hidden", "true");
}

function isChangelogDialogOpen(): boolean {
  return !changelogDialog.classList.contains("is-hidden");
}

function resumeFromPause(): void {
  if (novaChatPanel.isOpen) {
    novaChatPanel.close();
  }
  closePauseSubmenus();
  requirePlayer().resume();
}

function openNovaChat(): void {
  if (!inWorld) return;
  novaChatPanel.open();
}

function openNovaChatInputMode(): void {
  // Chat is an in-world overlay rather than a pause-menu panel. Suspend only
  // movement/look so the player can type, then restore pointer lock on close.
  closePauseSubmenus();
  pauseMenu.classList.add("is-hidden");
  requirePlayer().suspendForTextInput();
}

function closeNovaChatInputMode(): void {
  if (!inWorld) return;
  clearPointerHoldState();
  requirePlayer().resume();
}

function setLoadoutPanelOpen(open: boolean): void {
  setPauseSubmenu(open ? "loadout" : null);
}

function setSettingsPanelOpen(open: boolean): void {
  setPauseSubmenu(open ? "settings" : null);
}

function setBuilderPanelOpen(open: boolean): void {
  setPauseSubmenu(open ? "builder" : null);
}

function closePauseSubmenus(): void {
  setPauseSubmenu(null);
}

function setPauseSubmenu(submenu: PauseSubmenu | null): void {
  const loadoutOpen = submenu === "loadout";
  const settingsOpen = submenu === "settings";
  const builderOpen = submenu === "builder";
  pauseLoadoutPanel.hidden = !loadoutOpen;
  pauseSettingsPanel.hidden = !settingsOpen;
  pauseBuilderPanel.hidden = !builderOpen;
  loadoutButton.setAttribute("aria-expanded", String(loadoutOpen));
  settingsButton.setAttribute("aria-expanded", String(settingsOpen));
  builderButton.setAttribute("aria-expanded", String(builderOpen));
  loadoutButton.classList.toggle("is-active", loadoutOpen);
  settingsButton.classList.toggle("is-active", settingsOpen);
  builderButton.classList.toggle("is-active", builderOpen);
  loadoutButton.classList.toggle("is-hidden", settingsOpen || builderOpen);
  settingsButton.classList.toggle("is-hidden", loadoutOpen || builderOpen);
  builderButton.classList.toggle("is-hidden", loadoutOpen || settingsOpen);
  loadoutButton.textContent = loadoutOpen ? "Back" : "Loadout";
  settingsButton.textContent = settingsOpen ? "Back" : "Settings";
  builderButton.textContent = builderOpen ? "Back" : "Builder";

  // Treat pause submenus as focused modes: hide the main actions so destructive
  // world exits are not sitting next to throwaway tuning or builder clicks.
  const open = submenu !== null;
  for (const action of document.querySelectorAll<HTMLElement>(".menu-main-action")) {
    action.classList.toggle("is-hidden", open);
  }
}

function setLoadoutCategory(category: LoadoutCategory): void {
  const showTools = category === "tools";
  const showBlocks = category === "blocks";
  loadoutToolsPanel.hidden = !showTools;
  loadoutBlocksPanel.hidden = !showBlocks;
  loadoutToolsTab.classList.toggle("is-active", showTools);
  loadoutBlocksTab.classList.toggle("is-active", showBlocks);
  loadoutToolsTab.setAttribute("aria-selected", String(showTools));
  loadoutBlocksTab.setAttribute("aria-selected", String(showBlocks));
}

function setSettingsCategory(category: SettingsCategory): void {
  const showGraphics = category === "graphics";
  const showGameplay = category === "gameplay";
  const showExperimental = category === "experimental";
  settingsGraphicsPanel.hidden = !showGraphics;
  settingsGameplayPanel.hidden = !showGameplay;
  settingsExperimentalPanel.hidden = !showExperimental;
  settingsGraphicsTab.classList.toggle("is-active", showGraphics);
  settingsGameplayTab.classList.toggle("is-active", showGameplay);
  settingsExperimentalTab.classList.toggle("is-active", showExperimental);
  settingsGraphicsTab.setAttribute("aria-selected", String(showGraphics));
  settingsGameplayTab.setAttribute("aria-selected", String(showGameplay));
  settingsExperimentalTab.setAttribute("aria-selected", String(showExperimental));
}

function setHealthBarsEnabled(enabled: boolean): void {
  healthBarsEnabled = enabled;
  syncHealthBarsToggle();
  writeHealthBarsEnabled(enabled);
  if (!enabled) damageIndicators.clear();
}

function syncHealthBarsToggle(): void {
  healthBarsToggle.checked = healthBarsEnabled;
}

function setControlHintsVisible(visible: boolean): void {
  controlHintsVisible = visible;
  syncControlHintsToggle();
  writeControlHintsVisible(visible);
}

function syncControlHintsToggle(): void {
  controlHintsToggle.checked = controlHintsVisible;
  document.body.classList.toggle("controls-hidden", !controlHintsVisible);
}

function setAudioEnabled(enabled: boolean): void {
  updateAudioSettings({
    ...audioSettings,
    enabled
  });
  if (enabled) void gameAudio.unlockFromUserGesture();
}

function setAudioVolume(channel: AudioVolumeChannel, percent: unknown): void {
  updateAudioSettings({
    ...audioSettings,
    [channel]: audioVolumeFromPercent(percent, audioSettings[channel])
  });
}

function updateAudioSettings(settings: AudioSettings): void {
  audioSettings = settings;
  writeAudioSettingsPreference(audioSettings);
  gameAudio.applySettings(audioSettings);
  syncAudioControls();
}

function syncAudioControls(): void {
  soundEnabledToggle.checked = audioSettings.enabled;
  syncAudioSlider(masterVolumeSlider, masterVolumeValue, audioSettings.masterVolume);
  syncAudioSlider(sfxVolumeSlider, sfxVolumeValue, audioSettings.sfxVolume);
  syncAudioSlider(uiVolumeSlider, uiVolumeValue, audioSettings.uiVolume);
}

function syncAudioSlider(slider: HTMLInputElement, valueLabel: HTMLElement, volume: number): void {
  slider.min = String(AUDIO_VOLUME_MIN_PERCENT);
  slider.max = String(AUDIO_VOLUME_MAX_PERCENT);
  slider.step = String(AUDIO_VOLUME_STEP_PERCENT);
  slider.value = String(audioVolumeToPercent(volume));
  valueLabel.textContent = formatAudioVolumePercent(volume);
}

function setCoreAimPreviewEnabled(enabled: boolean): void {
  coreAimPreviewEnabled = enabled;
  syncCoreAimPreviewToggle();
  writeCoreAimPreviewEnabled(enabled);
  if (!enabled) coreAimPreview.hide();
}

function syncCoreAimPreviewToggle(): void {
  coreAimPreviewToggle.checked = coreAimPreviewEnabled;
}

function canAdjustTerraformerSizeFromKeyboard(): boolean {
  return inWorld && requirePlayer().isLooking() && isTerraformerSelected();
}

function canToggleClickFireModeFromKeyboard(): boolean {
  return inWorld && requirePlayer().isLooking();
}

function isTerraformerSelected(): boolean {
  return activeBuilderLane === "items" &&
    getHotbarPrimaryAction(getSelectedHotbarItem(), itemRegistry).kind === "terrain:mine-block";
}

function setClickFireMode(mode: ClickFireMode, options: { readonly announce?: boolean } = {}): void {
  const nextMode = normalizeClickFireMode(mode, clickFireMode);
  if (nextMode === clickFireMode) {
    updateHud();
    return;
  }

  clickFireMode = nextMode;
  writeClickFireModePreference(clickFireMode);
  resetHeldClickRepeatState();
  if (clickFireMode === "semi") resetTerraformerState();
  if (options.announce) {
    novaMessage.textContent = `Fire mode: ${formatClickFireMode(clickFireMode)}.`;
  }
  updateHud();
}

function toggleSelectedClickFireMode(): void {
  setClickFireMode(toggleClickFireMode(clickFireMode), { announce: true });
}

function setTerraformerSize(value: unknown): void {
  const nextSize = normalizeTerraformerSize(value, terraformerSize);
  if (nextSize === terraformerSize) {
    updateTerraformerControls();
    return;
  }

  terraformerSize = nextSize;
  writeTerraformerSizePreference(terraformerSize);
  resetTerraformerState();
  updateTerraformerControls();
  if (inWorld) updateTargetBlockHighlighter();
}

function updateTerraformerControls(): void {
  terraformerSizeSlider.min = String(TERRAFORMER_SIZE_MIN);
  terraformerSizeSlider.max = String(TERRAFORMER_SIZE_MAX);
  terraformerSizeSlider.step = String(TERRAFORMER_SIZE_STEP);
  terraformerSizeSlider.value = String(terraformerSize);
  terraformerSizeValue.textContent = formatTerraformerSize(terraformerSize);
}

function readTerraformerSizePreference(): number {
  try {
    return normalizeTerraformerSize(
      globalThis.localStorage?.getItem(TERRAFORMER_SIZE_STORAGE_KEY),
      TERRAFORMER_SIZE_DEFAULT
    );
  } catch {
    return TERRAFORMER_SIZE_DEFAULT;
  }
}

function writeTerraformerSizePreference(size: number): void {
  try {
    globalThis.localStorage?.setItem(TERRAFORMER_SIZE_STORAGE_KEY, String(normalizeTerraformerSize(size)));
  } catch {
    // The editor remains usable if storage is blocked; only the next launch forgets this size.
  }
}

function readClickFireModePreference(): ClickFireMode {
  try {
    return normalizeClickFireMode(
      globalThis.localStorage?.getItem(CLICK_FIRE_MODE_STORAGE_KEY),
      DEFAULT_CLICK_FIRE_MODE
    );
  } catch {
    return DEFAULT_CLICK_FIRE_MODE;
  }
}

function writeClickFireModePreference(mode: ClickFireMode): void {
  try {
    globalThis.localStorage?.setItem(CLICK_FIRE_MODE_STORAGE_KEY, normalizeClickFireMode(mode));
  } catch {
    // The current session still flips modes even if storage is unavailable.
  }
}

function readHealthBarsEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(HEALTH_BARS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeHealthBarsEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(HEALTH_BARS_STORAGE_KEY, String(enabled));
  } catch {
    // Local storage is only a convenience; the current session setting still applies.
  }
}

function readControlHintsVisible(): boolean {
  try {
    return globalThis.localStorage?.getItem(CONTROL_HINTS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeControlHintsVisible(visible: boolean): void {
  try {
    globalThis.localStorage?.setItem(CONTROL_HINTS_STORAGE_KEY, String(visible));
  } catch {
    // Control hints are a comfort preference; failure to persist should never
    // block the current session from hiding/showing the overlay.
  }
}

function readCoreAimPreviewEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(CORE_AIM_PREVIEW_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCoreAimPreviewEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(CORE_AIM_PREVIEW_STORAGE_KEY, String(enabled));
  } catch {
    // Same story as the other debug toggles: persistence is nice, not required.
  }
}

window.addEventListener("resize", () => {
  noteUserActivity();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(qualityController.renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}, eventListenerOptions);

document.addEventListener("keydown", (event) => {
  noteUserActivity();
  void gameAudio.unlockFromUserGesture();
  if (event.code === "Escape" && isChangelogDialogOpen()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeChangelogDialog();
    return;
  }

  if (novaChatPanel.isOpen) {
    if (event.code === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      novaChatPanel.close();
    }
    return;
  }

  if (event.code === "Escape" && !deleteWorldDialog.classList.contains("is-hidden")) {
    event.preventDefault();
    closeDeleteWorldDialog();
    return;
  }

  if (event.code === ADMIN_COMMAND_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    event.stopImmediatePropagation();
    novaChatPanel.toggle();
    return;
  }

  if (event.code === "F3") {
    event.preventDefault();
    debugHud.toggle();
    return;
  }

  if (event.code === "F4") {
    event.preventDefault();
    qualityController.cycle();
    return;
  }

  if (event.code === CORE_AIM_PREVIEW_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    setCoreAimPreviewEnabled(!coreAimPreviewEnabled);
    return;
  }

  if (!inWorld) return;

  if (event.code === TEST_AVATAR_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    event.stopImmediatePropagation();
    testAvatar.toggle();
    return;
  }

  if (event.code === NOVA_CHAT_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openNovaChat();
    return;
  }

  if (event.code === "KeyX") {
    event.preventDefault();
    clearPhysicsCores();
    return;
  }

  if (event.code === CLICK_FIRE_MODE_TOGGLE_KEY && !event.repeat && canToggleClickFireModeFromKeyboard()) {
    event.preventDefault();
    toggleSelectedClickFireMode();
    return;
  }

  if (event.code === BUILDER_MODE_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    setBuilderLane(activeBuilderLane === "items" ? "blocks" : "items");
    return;
  }

  if ((event.code === "ArrowUp" || event.code === "ArrowDown") && canAdjustTerraformerSizeFromKeyboard()) {
    event.preventDefault();
    setTerraformerSize(stepTerraformerSize(
      terraformerSize,
      event.code === "ArrowUp" ? "increase" : "decrease"
    ));
    return;
  }

  if (event.code === NOVA_PILOT_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    camera.getWorldDirection(direction);
    const active = novaPilot.toggle(camera.position, direction, requireWorld());
    engineEvents.emit("nova:toggled", { active });
    updateHud();
    return;
  }

  const requestedHotbarIndex = getHotbarIndexFromDigitCode(event.code);
  const activeHotbarItems = getActiveHotbarItems();
  if (requestedHotbarIndex !== null && requestedHotbarIndex < activeHotbarItems.length) {
    event.preventDefault();
    selectHotbarIndex(requestedHotbarIndex);
  }

  const activePlayer = requirePlayer();
  if (event.code === NOVA_PILOT_THROW_KEY && activePlayer.isLooking() && !event.repeat) {
    event.preventDefault();
    throwNovaPilotCore();
    return;
  }
}, eventListenerOptions);
document.addEventListener("pointerdown", () => {
  noteUserActivity();
  void gameAudio.unlockFromUserGesture();
}, eventListenerOptions);
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("button")) {
    gameAudio.playUiClick();
  }
}, eventListenerOptions);
document.addEventListener("pointermove", noteUserActivity, eventListenerOptions);
document.addEventListener("mousemove", noteUserActivity, eventListenerOptions);

document.addEventListener("visibilitychange", () => {
  noteUserActivity();
  drainFrameClockAfterIdle();
  if (document.hidden) {
    clearPointerHoldState();
    void queueActivePlayerLocationSave(true);
    enterIdleHeartbeat();
    return;
  }

  resumeAnimationLoopAfterIdle();
}, eventListenerOptions);
window.addEventListener("focus", () => {
  noteUserActivity();
  drainFrameClockAfterIdle();
  resumeAnimationLoopAfterIdle();
}, eventListenerOptions);
window.addEventListener("pageshow", () => {
  noteUserActivity();
  drainFrameClockAfterIdle();
  resumeAnimationLoopAfterIdle();
}, eventListenerOptions);
window.addEventListener("pagehide", () => {
  clearPointerHoldState();
  void queueActivePlayerLocationSave(true);
  enterIdleHeartbeat();
}, eventListenerOptions);
window.addEventListener("blur", () => {
  clearPointerHoldState();
}, eventListenerOptions);
window.addEventListener("beforeunload", () => {
  void queueActivePlayerLocationSave(true);
  disposeRuntime();
}, eventListenerOptions);

renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault(), eventListenerOptions);
renderer.domElement.addEventListener("mousedown", (event) => {
  noteUserActivity();
  if (!inWorld) return;

  const activePlayer = requirePlayer();

  if (event.button === 0) {
    leftMouseButtonDown = true;
    rightMouseButtonDown = (event.buttons & 2) !== 0;
    handleClickActionPress("primary", activePlayer, performance.now());
    return;
  }

  if (event.button === 2) {
    rightMouseButtonDown = true;
    handleClickActionPress("secondary", activePlayer, performance.now());
  }
}, eventListenerOptions);
document.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    leftMouseButtonDown = false;
    nextPrimaryClickActionAtMs = 0;
    resetTerraformerState();
  }
  if (event.button === 2) {
    rightMouseButtonDown = false;
    nextSecondaryClickActionAtMs = 0;
  }
}, eventListenerOptions);
document.addEventListener("pointercancel", () => {
  clearPointerHoldState();
}, eventListenerOptions);
renderer.domElement.addEventListener("wheel", (event) => {
  noteUserActivity();
  if (!inWorld) return;

  const direction = getHotbarScrollDirection(event.deltaY);
  if (direction === null) return;

  event.preventDefault();
  const activeHotbarItems = getActiveHotbarItems();
  selectHotbarIndex(stepHotbarIndex(getActiveHotbarIndex(), direction, activeHotbarItems.length));
}, wheelListenerOptions);

function clearPointerHoldState(): void {
  leftMouseButtonDown = false;
  rightMouseButtonDown = false;
  resetHeldClickRepeatState();
  resetTerraformerState();
}

function resetTerraformerState(): void {
  terraformerState = null;
}

function resetHeldClickRepeatState(): void {
  nextPrimaryClickActionAtMs = 0;
  nextSecondaryClickActionAtMs = 0;
}

function handleClickActionPress(button: ItemUseButton, activePlayer: PlayerController, nowMs: number): void {
  setNextClickActionTime(button, nowMs + FULL_AUTO_CLICK_ACTION_INTERVAL_MS);
  useSelectedHotbarAction(activePlayer, getSelectedHotbarAction(button));
}

function useSelectedHotbarPrimaryAction(activePlayer: PlayerController): void {
  useSelectedHotbarAction(activePlayer, getHotbarPrimaryAction(getSelectedHotbarItem(), itemRegistry));
}

function useSelectedHotbarSecondaryAction(activePlayer: PlayerController): void {
  useSelectedHotbarAction(activePlayer, getHotbarSecondaryAction(getSelectedHotbarItem(), itemRegistry));
}

function getSelectedHotbarAction(button: ItemUseButton): ItemAction {
  const selectedItem = getSelectedHotbarItem();
  return button === "primary"
    ? getHotbarPrimaryAction(selectedItem, itemRegistry)
    : getHotbarSecondaryAction(selectedItem, itemRegistry);
}

function getNextClickActionTime(button: ItemUseButton): number {
  return button === "primary" ? nextPrimaryClickActionAtMs : nextSecondaryClickActionAtMs;
}

function setNextClickActionTime(button: ItemUseButton, nextAtMs: number): void {
  if (button === "primary") {
    nextPrimaryClickActionAtMs = nextAtMs;
  } else {
    nextSecondaryClickActionAtMs = nextAtMs;
  }
}

function useSelectedHotbarAction(activePlayer: PlayerController, action: ItemAction): void {
  // Mouse buttons dispatch item actions now, not hard-coded hotbar kinds. That
  // is the seam future FPS weapons, dungeon tools, or RTS commands can share.
  switch (action.kind) {
    case "none":
      resetTerraformerState();
      return;
    case "terrain:mine-block":
      startOrContinueTerraformer(true);
      return;
    case "terrain:erase-block":
      resetTerraformerState();
      applyBuilderBrushAtTarget("erase");
      return;
    case "terrain:place-block":
      resetTerraformerState();
      if (activeBuilderLane === "blocks") {
        applyBuilderBrushAtTarget("place");
      } else {
        placeSelectedBlock(activePlayer, action.block);
      }
      return;
    case "physics:throw-core":
      resetTerraformerState();
      if (activePlayer.isLooking()) throwPlayerCore(activePlayer);
      return;
    case "physics:fire-hitscan-core":
      resetTerraformerState();
      if (activePlayer.isLooking()) firePlayerHitscanCore();
      return;
  }
}

function placeSelectedBlock(activePlayer: PlayerController, block: BlockId): void {
  const hit = getTargetHit();
  if (!hit) return;
  if (hit.source !== "voxel") return;

  const target = {
    x: hit.block.x + hit.normal.x,
    y: hit.block.y + hit.normal.y,
    z: hit.block.z + hit.normal.z
  };
  if (activePlayer.overlapsBlock(target.x, target.y, target.z)) return;
  requireWorld().setBlock(target.x, target.y, target.z, block);
  const changedTerrainCells: ChangedTerrainCell[] = [];
  const changedTerrainCellKeys = new Set<string>();
  collectTerrainSupportInvalidationCells(target, changedTerrainCells, changedTerrainCellKeys);
  invalidateDebrisSupportForEditedCells(changedTerrainCells);
}

function applyBuilderBrushAtTarget(operation: "place" | "erase"): void {
  if (!inWorld) return;
  const hit = getTargetHit({ requireLook: false });
  if (!hit) {
    showBuilderStatus("Builder: no target.");
    return;
  }

  if (hit.source !== "voxel") {
    if (operation === "erase" && hit.source === "rubble") {
      damageTargetedRubbleCell(hit.block);
      showBuilderStatus("Builder: cleared rubble target.");
    }
    return;
  }

  const activeWorld = requireWorld();
  const activePlayer = requirePlayer();
  const center = getBuilderBrushCenterForTarget(hit.block, hit.normal, operation);
  const changedTerrainCells: ChangedTerrainCell[] = [];
  const changedTerrainCellKeys = new Set<string>();
  const recordChangedCell = (cell: BuilderBrushCell) => {
    collectTerrainSupportInvalidationCells(cell, changedTerrainCells, changedTerrainCellKeys);
  };
  const changedCells = operation === "place"
    ? applyBuilderBrush({
        world: activeWorld,
        center,
        size: builderBrushSize,
        block: getSelectedBuilderBlock(),
        shouldSkipCell: (cell) => activePlayer.overlapsBlock(cell.x, cell.y, cell.z),
        onChangedCell: recordChangedCell
      })
    : eraseBuilderBrush({
        world: activeWorld,
        center,
        size: builderBrushSize,
        onChangedCell: recordChangedCell
      });

  if (changedCells > 0) {
    invalidateDebrisSupportForEditedCells(changedTerrainCells);
  }
  showBuilderStatus(`Builder: ${operation === "place" ? "placed" : "erased"} ${changedCells} block${changedCells === 1 ? "" : "s"}.`);
}

function runBuilderSpawnCommand(feature: "target" | "wall" | "platform" | "pillar"): void {
  const result = runAdminCommandWithTerrainSupportInvalidation(
    `spawn ${feature} ${getSelectedBuilderBlockName().toLowerCase()}`
  );
  showBuilderStatus(result.message);
}

function showBuilderStatus(message: string): void {
  novaMessage.textContent = message;
}

function updateHeldClickActions(nowMs: number): void {
  if (!leftMouseButtonDown) {
    resetTerraformerState();
  } else {
    repeatHeldClickAction("primary", nowMs);
  }

  if (rightMouseButtonDown) {
    repeatHeldClickAction("secondary", nowMs);
  }
}

function repeatHeldClickAction(button: ItemUseButton, nowMs: number): void {
  const action = getSelectedHotbarAction(button);
  if (button === "primary" && action.kind !== "terrain:mine-block") {
    resetTerraformerState();
  }

  if (clickFireMode !== "full") {
    if (button === "primary" && action.kind === "terrain:mine-block") resetTerraformerState();
    return;
  }

  if (nowMs < getNextClickActionTime(button)) return;

  setNextClickActionTime(button, nowMs + FULL_AUTO_CLICK_ACTION_INTERVAL_MS);
  useSelectedHotbarAction(requirePlayer(), action);
}

function startOrContinueTerraformer(immediate: boolean): void {
  if (!inWorld || !requirePlayer().isLooking()) {
    resetTerraformerState();
    return;
  }

  const editInput = createTerraformerEditInput();
  if (!editInput) {
    resetTerraformerState();
    return;
  }

  const preview = requireWorld().previewTerraformerEdit(editInput);
  if (!preview) {
    resetTerraformerState();
    return;
  }

  if (terraformerState?.targetKey === preview.key && !immediate) {
    return;
  }

  terraformerState = { targetKey: preview.key };
  applyTerraformerEdit(editInput, preview.key);
}

function createTerraformerEditInput(): TerraformerEditInput | null {
  const hit = getTerraformerTargetHit();
  if (!hit) return null;

  const terraformDirection = getCameraDirection();
  const impactNormal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
  return {
    x: hit.block.x,
    y: hit.block.y,
    z: hit.block.z,
    point: hit.point,
    normal: impactNormal,
    incomingDirection: terraformDirection,
    speed: TERRAFORMER_IMPACT_SPEED,
    size: terraformerSize
  };
}

function applyTerraformerEdit(input: TerraformerEditInput, expectedTargetKey: string): boolean {
  const activeWorld = requireWorld();
  const result = activeWorld.applyTerraformerEdit(input);
  if (!result || result.preview.key !== expectedTargetKey) return false;

  const impact: TerrainDamageFeedbackImpact = {
    normal: new THREE.Vector3(input.normal.x, input.normal.y, input.normal.z),
    speed: TERRAFORMER_IMPACT_SPEED,
    position: new THREE.Vector3(input.point.x, input.point.y, input.point.z),
    incomingVelocity: new THREE.Vector3(
      input.incomingDirection?.x ?? 0,
      input.incomingDirection?.y ?? 0,
      input.incomingDirection?.z ?? 0
    ).multiplyScalar(TERRAFORMER_IMPACT_SPEED)
  };

  const feedback = applyTerrainDamageFeedback(activeWorld, result.results, impact);
  recordTerrainCombatLog({
    source: TERRAFORMER_COMBAT_SOURCE,
    action: `edit size ${result.preview.size}`,
    results: result.results,
    terraformerCells: result.preview.cells,
    feedback
  });
  return true;
}

function getCameraDirection(): THREE.Vector3 {
  camera.getWorldDirection(direction);
  if (direction.lengthSq() <= 0.0001) return new THREE.Vector3(0, 0, -1);
  return direction.clone().normalize();
}

function damageTargetedRubbleCell(
  cell: VoxelRaycastHit["block"],
  amount = PHYSICS_CORE_BLOCK_DAMAGE,
  source: CombatLogSource = BUILDER_COMBAT_SOURCE,
  action = "rubble target"
): void {
  // The rubble proxy is intentionally cheaper than real per-cube collision, but
  // once the player is targeting its occupied cell the normal destroy action
  // should hit that destructible cover instead of silently editing terrain
  // behind it.
  const cellCenter = new THREE.Vector3(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
  rubbleField.damageNearest(cellCenter, amount, 0.9);
  emitRubbleDamageEvents(source, action);
}

function animate(): void {
  if (runtimeDisposed) return;
  animationFrameId = null;

  const frameStartedAt = performance.now();
  const rawDelta = clock.getDelta();
  debrisLifecycleDiagnostics = createEmptyDebrisLifecycleDiagnostics();
  if (shouldSkipExpensiveFrame(document.hidden, rawDelta)) {
    resetFrameMetersAfterIdle();
    scheduleNextFrame();
    return;
  }

  const delta = clampSimulationDelta(rawDelta);
  const frameTimingSample = createEmptyFrameTimings();
  const physicsTimingSample = createEmptyPhysicsTimingStats();
  let timingSectionStartedAt = frameStartedAt;
  let debugPlayerChunk: ChunkCoords | null = null;
  let debugPlayerVelocity: THREE.Vector3 | null = null;
  let debugWorldStats: WorldStats | null = null;
  let debugRubbleStats: RubbleFieldStats | null = null;
  let debugPartialMeshStats = partialBlockMeshField.getStats();
  let debugMinimapMs = minimapRenderer.lastUpdateMs;

  const recordTimingSection = (section: FrameTimingSection): void => {
    const now = performance.now();
    frameTimingSample[section] += now - timingSectionStartedAt;
    timingSectionStartedAt = now;
  };

  if (inWorld) {
    const activeWorld = requireWorld();
    const activePlayer = requirePlayer();
    debugPlayerVelocity = activePlayer.velocity;

    const playerVerticalVelocityBeforeUpdate = activePlayer.velocity.y;
    activePlayer.update(delta);
    gameAudio.updatePlayerMotion(delta, {
      active: activePlayer.active,
      onGround: activePlayer.onGround,
      flying: activePlayer.flying,
      speedMetersPerSecond: getPlayerSpeedMetersPerSecond(activePlayer.velocity),
      verticalVelocity: playerVerticalVelocityBeforeUpdate
    });
    updateHeldClickActions(frameStartedAt);
    testAvatar.update(delta);
    maybeAutosavePlayerLocation(frameStartedAt);
    camera.getWorldDirection(chunkStreamDirection);
    novaPilot.update(delta, camera.position, chunkStreamDirection, activeWorld);
    recordTimingSection("playerMs");
    updateChunkStreamFrustum();
    debugPlayerChunk = activeWorld.streamChunksAround(
      camera.position.x,
      camera.position.z,
      scene,
      qualityController.streamLoadRadius,
      qualityController.unloadRadius,
      qualityController.chunkLoadBudget,
      chunkStreamDirection,
      chunkStreamFrustum
    );
    recordTimingSection("chunkMs");

    const physicsFrameStartedAt = performance.now();
    physicsImpacts.length = 0;
    damagedBlockKeysThisFrame.clear();
    const physicsToyCountAtFrameStart = toys.length;
    for (let index = 0; index < physicsToyCountAtFrameStart; index += 1) {
      const toy = toys[index];
      if (!toy) continue;
      const terrainImpactStartIndex = physicsImpacts.length;
      const toyUpdateStartedAt = performance.now();
      toy.update(delta, terrainAndRubbleCollisionWorld, physicsImpacts);
      physicsTimingSample.toyUpdateMs += performance.now() - toyUpdateStartedAt;

      const impactApplyStartedAt = performance.now();
      // Terrain impacts are projectile-spending events. Handle them before the
      // same core gets a rubble collision pass; otherwise one shot can remove a
      // voxel and also chew up an adjacent rubble pile while the impact is still
      // waiting in the frame buffer.
      processPhysicsImpacts(activeWorld, terrainImpactStartIndex, physicsImpacts.length, damagedBlockKeysThisFrame);
      if (!toy.isExpired) {
        rubbleField.resolveCoreCollision(toy);
      }
      physicsTimingSample.impactApplyMs += performance.now() - impactApplyStartedAt;
    }
    const postLoopImpactStartedAt = performance.now();
    emitRubbleDamageEvents(PHYSICS_CORE_COMBAT_SOURCE, "rubble collision");
    physicsTimingSample.impactApplyMs += performance.now() - postLoopImpactStartedAt;

    const rigidDebrisStartedAt = performance.now();
    rigidDebrisStats = rigidDebris.update(delta, terrainAndRubbleCollisionWorld);
    const rigidDebrisFrameTimings = rigidDebris.getLastFrameTimings();
    physicsTimingSample.rigidDebrisTotalMs += performance.now() - rigidDebrisStartedAt;
    physicsTimingSample.rigidDebrisFlushMs += rigidDebrisFrameTimings.flushMs;
    physicsTimingSample.rigidDebrisStaticColliderCollectMs += rigidDebrisFrameTimings.staticColliderCollectMs;
    physicsTimingSample.rigidDebrisStaticColliderSyncMs += rigidDebrisFrameTimings.staticColliderSyncMs;
    physicsTimingSample.rigidDebrisStepMs += rigidDebrisFrameTimings.stepMs;
    physicsTimingSample.rigidDebrisSyncMs += rigidDebrisFrameTimings.syncMs;

    const debrisSettlerStartedAt = performance.now();
    debrisSettlerStats = debrisSettler.update(delta, rubbleField, {
      activeCenter: camera.position,
      activeRadius: qualityController.preset.debrisActiveRadiusMeters,
      finalizationMode: "vfx"
    });
    physicsTimingSample.debrisSettlerMs += performance.now() - debrisSettlerStartedAt;

    const budgetStartedAt = performance.now();
    enforceRigidDebrisBudget();
    enforcePhysicsToyBudget();
    physicsTimingSample.budgetEnforcementMs += performance.now() - budgetStartedAt;

    const cleanupStartedAt = performance.now();
    updateGroundDebrisCleanup(delta);
    enforceGroundDebrisBudget();
    updateStuckDebrisCleanup(delta, activeWorld);
    debrisSettlerStats = debrisSettler.getStats();
    emitRubbleBatchEvents();
    physicsTimingSample.groundCleanupMs += performance.now() - cleanupStartedAt;

    const broadphaseStartedAt = performance.now();
    physicsCollisionStats = physicsToyCollider.resolve(toys);
    physicsTimingSample.toyBroadphaseMs += performance.now() - broadphaseStartedAt;

    const rigidSyncStartedAt = performance.now();
    rigidDebris.syncToyStatesToBodies();
    physicsTimingSample.rigidDebrisSyncMs += performance.now() - rigidSyncStartedAt;

    const rubbleSettleStartedAt = performance.now();
    rubbleField.settle(activeWorld);
    emitRubbleSupportChangeEvents();
    physicsTimingSample.rubbleSettleMs += performance.now() - rubbleSettleStartedAt;

    const renderProxyStartedAt = performance.now();
    pruneExpiredToys();
    physicsFragmentInstancer.update(toys);
    physicsCoreTrail.update(delta);
    hitscanBoltTracer.update(delta);
    debrisPoofRenderer.update(delta);
    physicsTimingSample.renderProxySyncMs += performance.now() - renderProxyStartedAt;
    physicsTimingSample.framePhysicsMeasuredMs = performance.now() - physicsFrameStartedAt;
    latestPhysicsTimingStats = physicsTimingSample;
    recordTimingSection("physicsMs");

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    updatePartialBlockMesh(activeWorld);
    activeWorld.updateChunkRenderVisibility(
      debugPlayerChunk.cx,
      debugPlayerChunk.cz,
      qualityController.chunkRenderRadius
    );
    debugPartialMeshStats = partialBlockMeshField.getStats();
    recordTimingSection("meshMs");
    debugRubbleStats = rubbleField.getStats();
    updateHud();
    updateNovaContextTelemetry(activePlayer, debugRubbleStats);
    updateTargetBlockHighlighter();
    updateBuilderBrushPreview(activePlayer);
    updateCoreAimPreview(activeWorld, activePlayer);
    updateSprintFeedback(activePlayer.isSprintFeedbackActive(), isPlayerCoreAdsActive(), delta);
    damageIndicators.update(camera, window.innerWidth, window.innerHeight);
    recordTimingSection("otherMs");
    minimapRenderer.update(delta);
    debugWorldStats = activeWorld.getStats();
    debugMinimapMs = minimapRenderer.lastUpdateMs;
    recordTimingSection("minimapMs");
  } else {
    targetBlockHighlighter.hide();
    builderBrushPreview.hide();
    coreAimPreview.hide();
    damageIndicators.clear();
    updateSprintFeedback(false, false, delta);
    recordTimingSection("otherMs");
  }

  updateSunShadowAnchor();
  skybox.update(camera);
  novaPilotReactions.update();
  recordTimingSection("otherMs");
  const renderStartedAt = performance.now();
  renderer.render(scene, camera);
  const renderEndedAt = performance.now();
  frameTimingSample.renderMs = renderEndedAt - renderStartedAt;
  const frameEndedAt = performance.now();
  frameTimingSample.frameMs = frameEndedAt - frameStartedAt;
  const frameDiagnosticSnapshot = frameDiagnostics.captureFrame({
    frameStartedAtMs: frameStartedAt,
    frameEndedAtMs: frameEndedAt,
    rafGapMs: rawDelta * 1000,
    timings: frameTimingSample,
    rendererInfo: renderer.info
  });

  if (inWorld) {
    const observedFps = 1 / Math.max(rawDelta, 1 / 240);
    updateDebrisPressureGovernor(rawDelta, observedFps, debugPartialMeshStats.triangles);
    // The pressure governor uses the just-finished frame to lower the effective
    // Rapier body cap. Prune again after that update so hitch logs and the next
    // frame both see the newly requested cap instead of carrying excess bodies
    // until the following pre-render enforcement pass.
    enforceRigidDebrisBudget();
    enforceGroundDebrisBudget();

    const performanceStats = {
      qualityLabel: qualityController.preset.label,
      physicsObjectCount: toys.length,
      physicsObjectBudget,
      rigidDebrisBodyBudget: getCurrentRigidDebrisBodyBudget(),
      debrisPressure: debrisPerformancePressure,
      physicsTiming: physicsTimingSample,
      world: debugWorldStats ?? requireWorld().getStats(),
      physics: physicsCollisionStats,
      rigidDebris: rigidDebrisStats,
      fragmentRender: physicsFragmentInstancer.getStats(),
      partialMesh: debugPartialMeshStats,
      debrisSettler: debrisSettlerStats,
      debrisLifecycle: debrisLifecycleDiagnostics,
      rubble: debugRubbleStats ?? rubbleField.getStats(),
      workerPool: workerPool.getStats()
    };

    if (frameTimingSample.frameMs >= FRAME_SPIKE_EVENT_MS) {
      const diagnosis = performanceHitchLog.record({
        frameMs: frameTimingSample.frameMs,
        timings: frameTimingSample,
        diagnostics: frameDiagnosticSnapshot,
        stats: performanceStats
      });
      engineEvents.emit("performance:frame-spike", {
        frameMs: frameTimingSample.frameMs,
        timings: frameTimingSample,
        diagnosis
      });
    }

    if (observedFps < LOW_FPS_LOG_THRESHOLD) {
      performanceHitchLog.recordLowFpsSample({
        frameMs: Math.max(frameTimingSample.frameMs, rawDelta * 1000),
        observedFps,
        timings: frameTimingSample,
        diagnostics: frameDiagnosticSnapshot,
        stats: performanceStats
      });
    }
  }
  smoothedFrameTimings = smoothFrameTimings(
    smoothedFrameTimings,
    frameTimingSample,
    frameTimingsInitialized
  );
  frameTimingsInitialized = true;

  if (inWorld && debugPlayerChunk && debugPlayerVelocity && debugWorldStats && debugRubbleStats) {
    debugHud.update(
      rawDelta,
      debugPlayerVelocity,
      debugPlayerChunk,
      debugWorldStats,
      debugMinimapMs,
      toys.length,
      physicsObjectBudget,
      physicsCollisionStats,
      rigidDebrisStats,
      getCurrentRigidDebrisBodyBudget(),
      debrisPerformancePressure,
      physicsFragmentInstancer.getStats(),
      debugPartialMeshStats,
      debrisSettlerStats,
      debrisLifecycleDiagnostics,
      debugRubbleStats,
      workerPool.getStats(),
      [combatLog.getPersistenceStatusLine(), ...combatLog.getRecentLines(5)],
      physicsTimingSample,
      smoothedFrameTimings
    );
  }
  scheduleNextFrame();
}

function scheduleNextFrame(): void {
  if (runtimeDisposed) return;
  if (shouldSuspendAnimationLoop(performance.now())) {
    enterIdleHeartbeat();
    return;
  }

  clearIdleHeartbeat();
  if (animationFrameId !== null) return;
  animationFrameId = requestAnimationFrame(animate);
}

function enterIdleHeartbeat(): void {
  if (runtimeDisposed || idleHeartbeatTimerId !== null) return;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Hibernation is intentionally a timer, not another RAF. It gives the app a
  // tiny pulse for save/visibility bookkeeping while taking WebGL rendering and
  // per-frame allocations completely off the table during long idle stretches.
  idleHeartbeatTimerId = setTimeout(handleIdleHeartbeat, IDLE_HEARTBEAT_MS);
}

function handleIdleHeartbeat(): void {
  idleHeartbeatTimerId = null;
  if (runtimeDisposed) return;

  drainFrameClockAfterIdle();
  if (document.hidden) void queueActivePlayerLocationSave(true);

  if (shouldSuspendAnimationLoop(performance.now())) {
    enterIdleHeartbeat();
    return;
  }

  scheduleNextFrame();
}

function clearIdleHeartbeat(): void {
  if (idleHeartbeatTimerId === null) return;

  clearTimeout(idleHeartbeatTimerId);
  idleHeartbeatTimerId = null;
}

function resumeAnimationLoopAfterIdle(): void {
  if (runtimeDisposed || document.hidden) return;

  clearIdleHeartbeat();
  if (animationFrameId !== null) return;
  drainFrameClockAfterIdle();
  scheduleNextFrame();
}

function noteUserActivity(): void {
  lastUserActivityAt = performance.now();
  resumeAnimationLoopAfterIdle();
}

function shouldSuspendAnimationLoop(now: number): boolean {
  return shouldHibernateAnimationLoop({
    pageHidden: document.hidden,
    inactiveSeconds: Math.max(0, (now - lastUserActivityAt) / 1000),
    hasActiveWork: hasActiveEngineWork()
  });
}

function hasActiveEngineWork(): boolean {
  if (!inWorld || !world) return false;
  if (leftMouseButtonDown || rightMouseButtonDown) return true;
  if (world.hasPendingRuntimeWork()) return true;
  if (debrisSettlerStats.activeFragments > 0) return true;
  if (physicsCoreTrail.getActiveTrailCount() > 0) return true;

  for (const toy of toys) {
    if (!toy.isExpired && !toy.isSleeping) return true;
  }
  return false;
}

function resetFrameMetersAfterIdle(): void {
  // Long background gaps should not pollute the HUD's smoothing window or force
  // the minimap to resume halfway through an old slice.
  smoothedFrameTimings = createEmptyFrameTimings();
  latestPhysicsTimingStats = createEmptyPhysicsTimingStats();
  frameTimingsInitialized = false;
  debugHud.reset();
  minimapRenderer.reset();
}

function drainFrameClockAfterIdle(): void {
  // `THREE.Clock` accumulates while the browser is hidden, minimized, or asleep.
  // Drain it when the tab becomes active again so the first playable frame sees
  // normal frame time instead of the whole absence.
  clock.getDelta();
  resetFrameMetersAfterIdle();
}

function updateChunkStreamFrustum(): void {
  // The world scheduler only needs camera planes, not renderer state, to prefer visible work.
  camera.updateMatrixWorld();
  chunkStreamProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  chunkStreamFrustum.setFromProjectionMatrix(chunkStreamProjection);
}

function updateHud(): void {
  renderHotbar();
}

function processPhysicsImpacts(
  activeWorld: VoxelWorld,
  startIndex: number,
  endIndex: number,
  damagedBlocksThisFrame: Set<string>
): void {
  const continuedSources = new Set<PhysicsToy>();
  for (let index = startIndex; index < endIndex; index += 1) {
    const impact = physicsImpacts[index];
    if (!impact) continue;
    if (continuedSources.has(impact.source)) continue;
    if (handlePhysicsImpact(activeWorld, impact, damagedBlocksThisFrame)) {
      continuedSources.add(impact.source);
    }
  }
}

function updateNovaContextTelemetry(activePlayer: PlayerController, rubbleStats: RubbleFieldStats): void {
  novaContext.updateRuntimeTelemetry({
    selectedItemLabel: getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry),
    movementMode: activePlayer.movementMode,
    speedMetersPerSecond: getPlayerSpeedMetersPerSecond(activePlayer.velocity),
    novaActive: novaPilot.active,
    physicsObjectCount: toys.length,
    rubblePatchCount: rubbleStats.clusters,
    rubblePieceCount: rubbleStats.pieces
  });
}

async function recordScenario(id = "debris-grounding", options: VisualPilotRecordOptions = {}): Promise<unknown> {
  const scenario = getVisualTestScenario(id);
  return recordVisualScenario(scenario, options, "scenario");
}

async function recordPilotPlay(script = "wall-range", options: VisualPilotRecordOptions = {}): Promise<unknown> {
  const scenario = getVisualTestScenario(script);
  return recordVisualScenario(scenario, {
    ...options,
    label: options.label ?? `pilot-${scenario.pilotScript}`
  }, "pilot-play");
}

function createVisualScenarioSnapshot(scenario: VisualTestScenario): VisualTestScenarioRuntimeSnapshot {
  return {
    capturedAtIso: new Date().toISOString(),
    scenario: getVisualScenarioSummary(scenario),
    worldActive: inWorld,
    selectedItemLabel: inWorld ? getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry) : null,
    qualityLabel: getVisualRecorderQualityLabel(),
    currentHitchPass: performanceHitchLog.getPass(),
    pilot: inWorld ? codexPilot.snapshot() : null,
    stats: createCurrentPerformanceStatsSnapshot(),
    recentHitches: summarizeVisualTestScenarioHitches(performanceHitchLog.getRecent())
  };
}

function getVisualScenarioSummary(scenario: VisualTestScenario): VisualTestScenarioSummary {
  const summary = listVisualTestScenarios().find((candidate) => candidate.id === scenario.id);
  if (!summary) {
    throw new Error(`Visual test scenario ${scenario.id} is missing from the public scenario list.`);
  }
  return summary;
}

function createCurrentPerformanceStatsSnapshot(
  overrides: Partial<Pick<PerformanceHitchStatsSnapshot, "world" | "partialMesh" | "rubble">> = {}
): PerformanceHitchStatsSnapshot | null {
  if (!inWorld) return null;
  return {
    qualityLabel: qualityController.preset.label,
    physicsObjectCount: toys.length,
    physicsObjectBudget,
    rigidDebrisBodyBudget: getCurrentRigidDebrisBodyBudget(),
    debrisPressure: debrisPerformancePressure,
    physicsTiming: latestPhysicsTimingStats,
    world: overrides.world ?? requireWorld().getStats(),
    physics: physicsCollisionStats,
    rigidDebris: rigidDebrisStats,
    fragmentRender: physicsFragmentInstancer.getStats(),
    partialMesh: overrides.partialMesh ?? partialBlockMeshField.getStats(),
    debrisSettler: debrisSettlerStats,
    debrisLifecycle: debrisLifecycleDiagnostics,
    rubble: overrides.rubble ?? rubbleField.getStats(),
    workerPool: workerPool.getStats()
  };
}

async function recordVisualScenario(
  scenario: VisualTestScenario,
  options: VisualPilotRecordOptions,
  recorderKind: "pilot-play" | "scenario"
): Promise<unknown> {
  const normalizedOptions = normalizeVisualPilotRecordOptions({
    ...scenario.defaultOptions,
    ...options,
    metadata: {
      ...(scenario.defaultOptions.metadata ?? {}),
      ...(options.metadata ?? {})
    }
  });
  performanceHitchLog.startPass(`visual-${normalizedOptions.label}`);
  const beforeSnapshot = createVisualScenarioSnapshot(scenario);
  await visualTestRecorder.start({
    ...normalizedOptions,
    logPass: performanceHitchLog.getPass(),
    metadata: {
      ...(normalizedOptions.metadata ?? {}),
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      scenarioTags: scenario.tags,
      pilotScript: scenario.pilotScript,
      recorderKind,
      beforeSnapshot
    }
  });

  try {
    const pilotResult = await codexPilot.play(scenario.pilotScript);
    if (normalizedOptions.settleMs > 0) await waitForMilliseconds(normalizedOptions.settleMs);
    const afterSnapshot = createVisualScenarioSnapshot(scenario);
    const recording = await visualTestRecorder.stop({
      status: "passed",
      metadata: { pilotResult, beforeSnapshot, afterSnapshot }
    });
    return { scenario, pilotResult, beforeSnapshot, afterSnapshot, recording };
  } catch (error) {
    const failureSnapshot = createVisualScenarioSnapshot(scenario);
    const recording = visualTestRecorder.snapshot().status === "recording"
      ? await visualTestRecorder.stop({
          status: "failed",
          error: error instanceof Error ? error.message : "Pilot visual recording failed.",
          metadata: { beforeSnapshot, failureSnapshot }
        })
      : null;
    return {
      scenario,
      beforeSnapshot,
      failureSnapshot,
      recording,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getVisualRecorderQualityLabel(): string {
  try {
    return qualityController.preset.label;
  } catch {
    return bootPreset.label;
  }
}

function waitForMilliseconds(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function getActiveHotbarItems(): readonly HotbarItem[] {
  return activeBuilderLane === "blocks" ? blockHotbarItems : toolHotbarItems;
}

function getActiveHotbarIndex(): number {
  return activeBuilderLane === "blocks" ? selectedBlockHotbarIndex : selectedToolHotbarIndex;
}

function getSelectedHotbarItem(): HotbarItem {
  const activeHotbarItems = getActiveHotbarItems();
  return activeHotbarItems[normalizeHotbarIndex(getActiveHotbarIndex(), activeHotbarItems.length)] ?? fallbackHotbarItem;
}

function getSelectedBuilderBlock(): BlockId {
  const blockItem = blockHotbarItems[normalizeHotbarIndex(selectedBlockHotbarIndex, blockHotbarItems.length)];
  const action = blockItem ? getHotbarSecondaryAction(blockItem, itemRegistry) : null;
  return action?.kind === "terrain:place-block" ? action.block : BLOCK.grass;
}

function getSelectedBuilderBlockName(): string {
  return BLOCKS[getSelectedBuilderBlock()].name;
}

function renderHotbar(): void {
  const activeItems = getActiveHotbarItems();
  const activeIndex = getActiveHotbarIndex();
  const laneLabel = `${activeBuilderLane === "blocks" ? "Blocks" : "Items"} | ${formatClickFireModeShort(clickFireMode)}`;

  const laneNode = document.createElement("div");
  laneNode.className = "hotbar-lane";
  laneNode.textContent = laneLabel;

  const slotsNode = document.createElement("div");
  slotsNode.className = "hotbar-slots";

  activeItems.forEach((item, index) => {
    const button = document.createElement("div");
    button.className = "hotbar-slot";
    const active = index === activeIndex;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "true" : "false");

    const number = document.createElement("span");
    number.className = "hotbar-slot-number";
    number.textContent = index < 9 ? String(index + 1) : "";
    button.appendChild(number);

    const placeAction = getHotbarSecondaryAction(item, itemRegistry);
    if (placeAction.kind === "terrain:place-block") {
      const swatch = document.createElement("span");
      swatch.className = "hotbar-slot-swatch";
      swatch.style.background = getBlockCssColor(placeAction.block);
      button.appendChild(swatch);
    }

    const label = document.createElement("span");
    label.className = "hotbar-slot-label";
    label.textContent = getHotbarItemLabel(item, itemRegistry);
    button.appendChild(label);
    slotsNode.appendChild(button);
  });

  hotbar.replaceChildren(laneNode, slotsNode);
}

function setBuilderLane(
  lane: BuilderLane,
  options: { readonly resumeGameplay?: boolean } = {}
): void {
  if (activeBuilderLane === lane) {
    syncBuilderControls();
    syncLoadoutSelection();
    updateHud();
    if (options.resumeGameplay) resumeFromPause();
    return;
  }

  activeBuilderLane = lane;
  if (lane !== "blocks") builderBrushPreview.hide();
  selectHotbarIndex(getActiveHotbarIndex());
  syncLoadoutSelection();
  if (options.resumeGameplay) resumeFromPause();
}

function setBuilderBrushSize(value: unknown): void {
  builderBrushSize = normalizeBuilderBrushSize(value, builderBrushSize);
  syncBuilderControls();
}

function renderLoadoutMenus(): void {
  renderLoadoutToolCards();
  renderLoadoutBlockCards();
  syncLoadoutSelection();
}

function renderLoadoutToolCards(): void {
  const cards = toolHotbarItems.map((item, index) => {
    const card = document.createElement("button");
    card.className = "loadout-card";
    card.type = "button";
    card.dataset.hotbarIndex = String(index);

    const title = document.createElement("span");
    title.className = "loadout-card-title";
    title.textContent = getHotbarItemLabel(item, itemRegistry);

    const action = document.createElement("span");
    action.className = "loadout-card-action";
    action.textContent = describeHotbarItemActions(item);

    card.append(title, action);
    card.addEventListener("click", () => {
      setBuilderLane("items");
      selectHotbarIndex(index);
      resumeFromPause();
    }, eventListenerOptions);
    return card;
  });

  loadoutToolList.replaceChildren(...cards);
}

function renderLoadoutBlockCards(): void {
  const cards = blockHotbarItems.map((item, index) => {
    const placeAction = getHotbarSecondaryAction(item, itemRegistry);
    const block = placeAction.kind === "terrain:place-block" ? placeAction.block : BLOCK.grass;
    const card = document.createElement("button");
    card.className = "loadout-block-card";
    card.type = "button";
    card.dataset.hotbarIndex = String(index);
    card.dataset.blockId = String(block);
    card.title = getHotbarItemLabel(item, itemRegistry);

    const swatch = document.createElement("span");
    swatch.className = "loadout-block-swatch";
    swatch.style.background = getBlockCssColor(block);

    const label = document.createElement("span");
    label.className = "loadout-block-name";
    label.textContent = getHotbarItemLabel(item, itemRegistry);

    card.append(swatch, label);
    card.addEventListener("click", () => {
      setBuilderLane("blocks");
      selectHotbarIndex(index);
      resumeFromPause();
    }, eventListenerOptions);
    return card;
  });

  loadoutBlockList.replaceChildren(...cards);
}

function describeHotbarItemActions(item: HotbarItem): string {
  const primary = getHotbarPrimaryAction(item, itemRegistry);
  const secondary = getHotbarSecondaryAction(item, itemRegistry);
  const primaryLabel = describeItemAction(primary, "L");
  const secondaryLabel = describeItemAction(secondary, "R");
  return [primaryLabel, secondaryLabel].filter(Boolean).join(" | ") || "No action";
}

function describeItemAction(action: ItemAction, buttonLabel: "L" | "R"): string | null {
  switch (action.kind) {
    case "none":
      return null;
    case "terrain:mine-block":
      return `${buttonLabel} terraform`;
    case "terrain:erase-block":
      return `${buttonLabel} erase`;
    case "terrain:place-block":
      return `${buttonLabel} place`;
    case "physics:throw-core":
      return `${buttonLabel} throw`;
    case "physics:fire-hitscan-core":
      return `${buttonLabel} fire`;
  }
}

function syncLoadoutSelection(): void {
  const toolActive = activeBuilderLane === "items";
  const selectedIndex = getActiveHotbarIndex();
  syncLoadoutCardSelection(loadoutToolList, toolActive ? selectedIndex : -1);
  syncLoadoutCardSelection(loadoutBlockList, toolActive ? -1 : selectedIndex);
}

function syncLoadoutCardSelection(container: HTMLElement, selectedIndex: number): void {
  for (const card of container.querySelectorAll<HTMLButtonElement>("[data-hotbar-index]")) {
    const active = Number(card.dataset.hotbarIndex) === selectedIndex;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  }
}

function renderBuilderPalette(): void {
  const buttons = PLACEABLE_BLOCKS.map((block, index) => {
    const button = document.createElement("button");
    button.className = "builder-block-button";
    button.type = "button";
    button.title = BLOCKS[block].name;
    button.setAttribute("aria-label", BLOCKS[block].name);
    button.dataset.blockId = String(block);

    const swatch = document.createElement("span");
    swatch.className = "builder-block-swatch";
    swatch.style.background = getBlockCssColor(block);
    button.appendChild(swatch);

    button.addEventListener("click", () => {
      selectedBlockHotbarIndex = normalizeHotbarIndex(index, blockHotbarItems.length);
      if (activeBuilderLane === "blocks") {
        selectHotbarIndex(selectedBlockHotbarIndex);
      } else {
        setBuilderLane("blocks");
      }
      resumeFromPause();
    }, eventListenerOptions);
    return button;
  });

  builderBlockPalette.replaceChildren(...buttons);
}

function syncBuilderControls(): void {
  builderModeToggleButton.textContent = activeBuilderLane === "blocks" ? "Blocks" : "Items";
  builderModeToggleButton.setAttribute("aria-pressed", String(activeBuilderLane === "blocks"));
  builderSelectedBlockValue.textContent = getSelectedBuilderBlockName();
  builderBrushSizeSlider.min = String(BUILDER_BRUSH_MIN_SIZE);
  builderBrushSizeSlider.max = String(BUILDER_BRUSH_MAX_SIZE);
  builderBrushSizeSlider.step = String(BUILDER_BRUSH_STEP);
  builderBrushSizeSlider.value = String(builderBrushSize);
  builderBrushSizeValue.textContent = formatBuilderBrushSize(builderBrushSize);

  const selectedBlock = getSelectedBuilderBlock();
  for (const button of builderBlockPalette.querySelectorAll<HTMLButtonElement>(".builder-block-button")) {
    const active = Number(button.dataset.blockId) === selectedBlock;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function getBlockCssColor(block: BlockId): string {
  const [r, g, b] = BLOCKS[block].color;
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

function selectHotbarIndex(index: number): void {
  resetTerraformerState();
  resetHeldClickRepeatState();
  const activeHotbarItems = getActiveHotbarItems();
  if (activeBuilderLane === "blocks") {
    selectedBlockHotbarIndex = normalizeHotbarIndex(index, activeHotbarItems.length);
  } else {
    selectedToolHotbarIndex = normalizeHotbarIndex(index, activeHotbarItems.length);
  }
  const selectedItem = getSelectedHotbarItem();
  const selectedLabel = getHotbarItemLabel(selectedItem, itemRegistry);

  engineEvents.emit("item:selected", {
    itemId: selectedItem.itemId,
    name: selectedLabel,
    category: getHotbarItemCategory(selectedItem, itemRegistry),
    slotIndex: getActiveHotbarIndex()
  });

  const secondaryAction = getHotbarSecondaryAction(selectedItem, itemRegistry);
  if (secondaryAction.kind === "terrain:place-block") {
    engineEvents.emit("palette:selected", {
      block: secondaryAction.block,
      name: BLOCKS[secondaryAction.block].name
    });
  }

  syncBuilderControls();
  syncLoadoutSelection();
  updateHud();
}

function selectCodexPilotWeapon(weapon: CodexPilotWeapon): boolean {
  if (weapon === "selected") return true;

  const targetIndex = toolHotbarItems.findIndex((item) => {
    const primaryAction = getHotbarPrimaryAction(item, itemRegistry);
    if (weapon === "physics-core") return primaryAction.kind === "physics:throw-core";
    if (weapon === "hitscan-core") return primaryAction.kind === "physics:fire-hitscan-core";
    return false;
  });

  if (targetIndex < 0) return false;
  setBuilderLane("items");
  selectHotbarIndex(targetIndex);
  return true;
}

function updateSprintFeedback(sprintActive: boolean, adsActive: boolean, delta: number): void {
  const targetFov = getPlayerCameraTargetFov(sprintActive, adsActive);
  const nextFov = smoothSprintFeedbackFov(camera.fov, targetFov, delta);

  if (camera.fov !== nextFov) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }

  sprintOverlay.classList.toggle(SPRINT_FEEDBACK_ACTIVE_CLASS, sprintActive);
}

function isPlayerCoreAdsActive(): boolean {
  if (!rightMouseButtonDown) return false;
  const selectedItem = getSelectedHotbarItem();
  return canThrowCoreWithHotbarItem(selectedItem, itemRegistry)
    || canFireHitscanCoreWithHotbarItem(selectedItem, itemRegistry);
}

function getTargetHit(options: { readonly requireLook?: boolean } = {}): TargetHit | null {
  if (!inWorld) return null;
  if (options.requireLook !== false && !requirePlayer().isLooking()) return null;

  camera.getWorldDirection(direction);

  const activeWorld = requireWorld();
  const blockHit = voxelRaycast(activeWorld, camera.position, direction, BLOCK_INTERACTION_REACH);
  const rubbleHit = rubbleField.raycast(camera.position, direction, BLOCK_INTERACTION_REACH);

  if (rubbleHit && (!blockHit || rubbleHit.distance < blockHit.distance - TARGET_HIT_EPSILON)) {
    return {
      kind: "rubble",
      source: "rubble",
      block: rubbleHit.cell,
      distance: rubbleHit.distance
    };
  }

  if (!blockHit) return null;

  return {
    kind: activeWorld.getBlock(blockHit.block.x, blockHit.block.y, blockHit.block.z) === BLOCK.rubble
      ? "rubble"
      : "block",
    source: "voxel",
    block: blockHit.block,
    normal: blockHit.normal,
    distance: blockHit.distance
  };
}

function getTerraformerTargetHit(): TerraformerTerrainRaycastHit | null {
  if (!inWorld || !requirePlayer().isLooking()) return null;

  const terraformDirection = getCameraDirection();
  const activeWorld = requireWorld();
  const blockHit = activeWorld.raycastTerraformerTarget(
    camera.position,
    terraformDirection,
    BLOCK_INTERACTION_REACH
  );
  const rubbleHit = rubbleField.raycast(camera.position, terraformDirection, BLOCK_INTERACTION_REACH);

  // Rubble is not part of this precision editor pass. If a rubble pile is
  // visibly in front of the terrain ray, keep the Terraformer inert instead of
  // letting it tunnel-edit terrain hidden behind cover.
  if (rubbleHit && (!blockHit || rubbleHit.distance < blockHit.distance - TARGET_HIT_EPSILON)) {
    return null;
  }

  if (!blockHit) return null;
  return activeWorld.getBlock(blockHit.block.x, blockHit.block.y, blockHit.block.z) === BLOCK.rubble
    ? null
    : blockHit;
}

function updateTargetBlockHighlighter(): void {
  if (isTerraformerSelected() && requirePlayer().isLooking()) {
    const preview = previewTerraformerTarget();
    if (preview) {
      targetBlockHighlighter.showSubCells(preview.cells.map((cell) => cell.bounds));
    } else {
      targetBlockHighlighter.hide();
    }
    return;
  }

  const hit = getTargetHit();

  if (!hit) {
    targetBlockHighlighter.hide();
    return;
  }

  targetBlockHighlighter.showBlock(hit.block, hit.kind);
}

function previewTerraformerTarget(): TerraformerEditPreview | null {
  const input = createTerraformerEditInput();
  return input ? requireWorld().previewTerraformerEdit(input) : null;
}

function updateBuilderBrushPreview(activePlayer: PlayerController): void {
  if (activeBuilderLane !== "blocks" || !activePlayer.isLooking()) {
    builderBrushPreview.hide();
    return;
  }

  const hit = getTargetHit();
  if (!hit || hit.source !== "voxel") {
    builderBrushPreview.hide();
    return;
  }

  const selectedBlock = getSelectedBuilderBlock();
  const center = getBuilderBrushCenterForTarget(hit.block, hit.normal, "place");
  const cells = collectBuilderBrushCells(center, builderBrushSize)
    .filter((cell) => !activePlayer.overlapsBlock(cell.x, cell.y, cell.z));
  const [red, green, blue] = BLOCKS[selectedBlock].color;

  builderBrushPreview.update({
    cells,
    color: new THREE.Color(red, green, blue)
  });
}

function updateCoreAimPreview(activeWorld: VoxelWorld, activePlayer: PlayerController): void {
  const selectedItem = getSelectedHotbarItem();
  if (!coreAimPreviewEnabled || !activePlayer.isLooking()) {
    coreAimPreview.hide();
    return;
  }

  if (canThrowCoreWithHotbarItem(selectedItem, itemRegistry)) {
    updateProjectileCoreAimPreview(activeWorld, activePlayer);
    return;
  }

  if (canFireHitscanCoreWithHotbarItem(selectedItem, itemRegistry)) {
    updateHitscanCoreAimPreview(activeWorld);
    return;
  }

  coreAimPreview.hide();
}

function updateProjectileCoreAimPreview(activeWorld: VoxelWorld, activePlayer: PlayerController): void {
  const radius = getPhysicsCoreRadius(physicsCoreSettings);
  const firingSolution = createPlayerCoreFiringSolution(radius);
  if (firingSolution.direction.lengthSq() <= TARGET_HIT_EPSILON) {
    coreAimPreview.hide();
    return;
  }

  const launchVelocity = createPlayerPhysicsCoreLaunchVelocity(
    firingSolution.direction,
    activePlayer.velocity,
    physicsCoreSettings
  );
  const prediction = predictPhysicsCoreTrajectory(activeWorld, {
    origin: firingSolution.origin,
    velocity: launchVelocity,
    radius
  });
  const impact = prediction.impact;
  const brushPreview = impact && impact.speed > BLOCK_DAMAGE_IMPACT_SPEED
    ? activeWorld.previewBlockDamageBrush({
      x: impact.block.x,
      y: impact.block.y,
      z: impact.block.z,
      point: impact.position,
      normal: impact.normal,
      incomingDirection: impact.incomingVelocity,
      coreRadius: radius,
      speed: impact.speed,
      amount: PARTIAL_BLOCK_CORE_DAMAGE
    })
    : null;

  coreAimPreview.update(prediction, brushPreview, camera.position);
}

function updateHitscanCoreAimPreview(activeWorld: VoxelWorld): void {
  const firingSolution = createPlayerCoreFiringSolution(HITSCAN_CORE_RADIUS);
  if (firingSolution.direction.lengthSq() <= TARGET_HIT_EPSILON) {
    coreAimPreview.hide();
    return;
  }

  const shotDirection = firingSolution.direction.clone().normalize();
  const terrainPrediction = predictHitscanCoreTrajectory(activeWorld, {
    origin: firingSolution.origin,
    direction: shotDirection,
    radius: HITSCAN_CORE_RADIUS,
    maxDistance: HITSCAN_CORE_RANGE,
    impactSpeed: HITSCAN_CORE_IMPACT_SPEED
  });
  const terrainImpact = terrainPrediction.impact;
  const rubbleHit = rubbleField.raycast(firingSolution.origin, shotDirection, HITSCAN_CORE_RANGE);

  if (rubbleHit && (!terrainImpact ||
    rubbleHit.distance < firingSolution.origin.distanceTo(terrainImpact.position) - TARGET_HIT_EPSILON)) {
    const prediction = createHitscanRubbleAimPreviewPrediction(
      firingSolution.origin,
      shotDirection,
      rubbleHit.cell,
      rubbleHit.point
    );
    coreAimPreview.update(prediction, null, camera.position);
    return;
  }

  const brushPreview = terrainImpact && terrainImpact.speed > BLOCK_DAMAGE_IMPACT_SPEED
    ? activeWorld.previewBlockDamageBrush({
      x: terrainImpact.block.x,
      y: terrainImpact.block.y,
      z: terrainImpact.block.z,
      point: terrainImpact.position,
      normal: terrainImpact.normal,
      incomingDirection: terrainImpact.incomingVelocity,
      coreRadius: HITSCAN_CORE_RADIUS,
      speed: terrainImpact.speed,
      amount: PARTIAL_BLOCK_CORE_DAMAGE
    })
    : null;

  coreAimPreview.update(terrainPrediction, brushPreview, camera.position);
}

function createHitscanRubbleAimPreviewPrediction(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  cell: { readonly x: number; readonly y: number; readonly z: number },
  point: THREE.Vector3
): PhysicsCoreTrajectoryPrediction {
  return {
    points: [
      origin.clone(),
      point.clone()
    ],
    impact: {
      block: { ...cell },
      normal: direction.clone().multiplyScalar(-1),
      position: point.clone(),
      incomingVelocity: direction.clone().multiplyScalar(HITSCAN_CORE_IMPACT_SPEED),
      speed: HITSCAN_CORE_IMPACT_SPEED
    }
  };
}

function updatePartialBlockMesh(activeWorld: VoxelWorld): void {
  const revision = activeWorld.getPartialBlockGeometryRevision();
  const dirtyRegionCount = activeWorld.getDirtyPartialBlockMeshRegionCount();
  partialBlockMeshField.beginUpdate(dirtyRegionCount + pendingPartialBlockMeshJobs.size);
  if (revision === renderedPartialBlockRevision && dirtyRegionCount === 0 && pendingPartialBlockMeshJobs.size === 0) return;
  if (dirtyRegionCount === 0) {
    refreshRenderedPartialBlockRevision(activeWorld);
    return;
  }

  const partialBlockCount = activeWorld.getPartialBlockCount();
  const hasUrgentRegions = activeWorld.hasUrgentPartialBlockMeshRegions();
  if (!hasUrgentRegions && shouldDeferPartialBlockMeshUpdate({
    cellCount: partialBlockCount,
    lastUpdateMs: lastPartialBlockMeshUpdateMs,
    nowMs: performance.now(),
    hasRenderedMesh: renderedPartialBlockRevision >= 0
  })) {
    return;
  }

  const updates = activeWorld.consumePartialBlockMeshRegionUpdates({
    maxRegions: getPartialBlockMeshRegionBudget(hasUrgentRegions),
    origin: camera.position
  });
  for (const update of updates) {
    schedulePartialBlockMeshRegionBuild(activeWorld, update);
  }

  partialBlockMeshField.setDirtyRegionCount(
    activeWorld.getDirtyPartialBlockMeshRegionCount() + pendingPartialBlockMeshJobs.size
  );
  refreshRenderedPartialBlockRevision(activeWorld);
  lastPartialBlockMeshUpdateMs = performance.now();
}

function schedulePartialBlockMeshRegionBuild(
  activeWorld: VoxelWorld,
  update: PartialBlockMeshRegionUpdate
): void {
  const existingJob = pendingPartialBlockMeshJobs.get(update.key);
  if (existingJob) workerPool.cancel(existingJob.id);

  if (update.cells.length === 0) {
    pendingPartialBlockMeshJobs.delete(update.key);
    partialBlockMeshField.updateRegionGeometry(update.key, 0, {
      positions: new Float32Array(),
      normals: new Float32Array(),
      colors: new Float32Array(),
      uvs: new Float32Array(),
      textureTiles: new Float32Array(),
      indices: new Uint32Array()
    });
    return;
  }

  const revision = update.revision ?? activeWorld.getPartialBlockGeometryRevision();
  const faceVisibilityMasks = createPartialBlockFaceVisibilityMasks(
    update,
    (cell, normal) => activeWorld.shouldRenderPartialBlockFace(cell, normal)
  );
  const payload = createPartialBlockMeshBuildJobPayload(update, faceVisibilityMasks);
  const handle = workerPool.enqueue<PartialBlockMeshBuildJobPayload, PartialBlockMeshBuildJobResult>({
    type: PARTIAL_BLOCK_MESH_BUILD_JOB,
    payload,
    revision,
    priority: update.urgent ? 0 : 20,
    isRevisionStale: (jobRevision) =>
      activeWorld !== world || activeWorld.isPartialBlockMeshRegionRevisionStale(update.key, jobRevision),
    run: buildPartialBlockMeshBuildJob
  });
  pendingPartialBlockMeshJobs.set(update.key, { id: handle.id, revision });

  void handle.promise.then((result) => {
    const pending = pendingPartialBlockMeshJobs.get(update.key);
    if (!pending || pending.id !== result.id) return;
    pendingPartialBlockMeshJobs.delete(update.key);

    if (result.status !== "completed") {
      if (result.status === "failed") {
        console.warn("Partial block mesh worker job failed", result.error);
      }
      refreshRenderedPartialBlockRevision(activeWorld);
      return;
    }
    if (activeWorld !== world) {
      refreshRenderedPartialBlockRevision(activeWorld);
      return;
    }

    const uploadStartedAt = performance.now();
    partialBlockMeshField.updateRegionGeometry(
      result.result.key,
      result.result.cellCount,
      result.result.geometry
    );
    workerPool.recordMainThreadUpload(performance.now() - uploadStartedAt, PARTIAL_BLOCK_MESH_BUILD_JOB);
    partialBlockMeshField.setDirtyRegionCount(
      activeWorld.getDirtyPartialBlockMeshRegionCount() + pendingPartialBlockMeshJobs.size
    );
    refreshRenderedPartialBlockRevision(activeWorld);
  });
}

function refreshRenderedPartialBlockRevision(activeWorld: VoxelWorld): void {
  if (
    activeWorld === world &&
    activeWorld.getDirtyPartialBlockMeshRegionCount() === 0 &&
    pendingPartialBlockMeshJobs.size === 0
  ) {
    renderedPartialBlockRevision = activeWorld.getPartialBlockGeometryRevision();
  }
}

function clearPendingPartialBlockMeshJobs(): void {
  for (const pending of pendingPartialBlockMeshJobs.values()) {
    workerPool.cancel(pending.id);
  }
  pendingPartialBlockMeshJobs.clear();
}

function getPartialBlockMeshRegionBudget(hasUrgentRegions: boolean): number {
  // New/cleared partial cells can briefly expose holes if their visual region
  // waits behind non-urgent bite polish. Repeated cuts stay budgeted; urgent
  // topology changes get a larger same-frame lane.
  return hasUrgentRegions
    ? PARTIAL_BLOCK_MESH_URGENT_REGION_BUDGET
    : PARTIAL_BLOCK_MESH_NORMAL_REGION_BUDGET;
}

function handlePhysicsImpact(
  activeWorld: VoxelWorld,
  impact: PhysicsImpact,
  damagedBlocksThisFrame: Set<string>
): boolean {
  if (impact.source.isExpired) return false;
  const result = applyCoreTerrainImpact(
    activeWorld,
    impact,
    damagedBlocksThisFrame,
    PHYSICS_CORE_COMBAT_SOURCE
  );
  if (!result) return false;

  const pierceContinuation = result.pierceContinuation;
  if (pierceContinuation) {
    continuePhysicsCoreAfterPierce(impact.source, pierceContinuation);
  } else {
    // Terrain-damaging rebounds now spend a per-core bounce budget. The
    // default budget is one, preserving the old "hit once, then disappear"
    // behavior until the Gameplay slider asks for chaos. Surviving bounces also
    // bleed speed so repeated terrain damage feels like spent impact energy,
    // not just an invisible hit counter.
    if (impact.source.consumeTerrainDamageBounce(impact)) {
      return true;
    }

    impact.source.expire();
  }

  return Boolean(pierceContinuation);
}

function applyCoreTerrainImpact(
  activeWorld: VoxelWorld,
  impact: CoreTerrainImpact,
  damagedBlocksThisFrame: Set<string>,
  source: CombatLogSource
): CoreTerrainImpactApplyResult | null {
  if (impact.speed <= BLOCK_DAMAGE_IMPACT_SPEED) return null;

  const brushResult = activeWorld.carveBlockBrush({
    x: impact.block.x,
    y: impact.block.y,
    z: impact.block.z,
    point: impact.position,
    normal: impact.normal,
    incomingDirection: impact.incomingVelocity,
    coreRadius: impact.radius,
    speed: impact.speed,
    amount: PARTIAL_BLOCK_CORE_DAMAGE
  }, {
    blockedDamageKeys: damagedBlocksThisFrame
  });
  if (!brushResult) return null;

  const feedback = applyTerrainDamageFeedback(activeWorld, brushResult.results, impact, damagedBlocksThisFrame);
  recordTerrainCombatLog({
    source,
    action: `impact ${impact.speed.toFixed(1)} m/s`,
    results: brushResult.results,
    feedback
  });

  return brushResult;
}

function applyTerrainDamageFeedback(
  activeWorld: VoxelWorld,
  results: readonly BlockDamageResult[],
  impact: TerrainDamageFeedbackImpact,
  damagedBlocksThisFrame?: Set<string>
): TerrainDamageFeedbackSummary {
  let changedTerrainCollider = false;
  const changedTerrainCells: ChangedTerrainCell[] = [];
  const changedTerrainCellKeys = new Set<string>();

  for (const result of results) {
    damagedBlocksThisFrame?.add(activeWorld.damageKey(result.position.x, result.position.y, result.position.z));
    collectTerrainSupportInvalidationCellsForDamageResult(result, changedTerrainCells, changedTerrainCellKeys);

    engineEvents.emit("block:damaged", {
      position: result.position,
      block: result.block,
      impactSpeed: impact.speed,
      remainingHealth: result.remainingHealth,
      maxHealth: result.maxHealth
    });
    spawnPartialBlockBitePoofs(result);
    showBlockDamageIndicator(result);

    const ejectedMaterialUnits = result.ejectedRubbleMaterialUnits ?? 0;
    const fragmentCount = getTerrainImpactFragmentCount(
      qualityController.preset.blockFragmentCount,
      ejectedMaterialUnits,
      result.destroyed
    );
    let spawnedFragmentCount = 0;
    if (fragmentCount > 0) {
      spawnedFragmentCount = spawnBlockFragments(result.block, result.position, impact, {
        fragmentCount,
        materialUnits: ejectedMaterialUnits,
        chipOnly: !result.destroyed,
        ejectionHint: result.debrisEjectionHint,
        debrisProfile: getDebrisSpawnProfile(result.block)
      });
    }

    changedTerrainCollider = true;
    if (result.destroyed) {
      engineEvents.emit("block:destroyed", {
        position: result.position,
        block: result.block,
        impactSpeed: impact.speed,
        fragmentCount: spawnedFragmentCount
      });
    }
  }

  // Partial-block cuts and final block removals both alter support/collision
  // candidates for active debris. Keep Rapier's temporary static collider cache
  // honest even when a very small chip produces no visible fragment. Also wake
  // sleeping debris in the edited support neighborhood; this is event-driven
  // so settled piles do not need a broad support scan every frame.
  if (changedTerrainCollider) {
    return invalidateDebrisSupportForEditedCells(changedTerrainCells);
  }
  return createEmptyTerrainDamageFeedbackSummary();
}

type TerrainDamageFeedbackSummary = {
  readonly supportInvalidationCells: number;
  readonly rigidDebrisWoken: number;
  readonly settlerDebrisWoken: number;
  readonly detachedDebrisWoken: number;
};

function createEmptyTerrainDamageFeedbackSummary(): TerrainDamageFeedbackSummary {
  return {
    supportInvalidationCells: 0,
    rigidDebrisWoken: 0,
    settlerDebrisWoken: 0,
    detachedDebrisWoken: 0
  };
}

function collectTerrainSupportInvalidationCellsForDamageResult(
  result: BlockDamageResult,
  cells: ChangedTerrainCell[],
  seen: Set<string>
): void {
  // Exact 1/3m support boxes wake debris directly over a removed Terraformer
  // sub-cell. The macro-cell halo still matters for real piles, because shards
  // overhang edges, stack on sibling debris, and do not politely center
  // themselves over the one sub-cell that just disappeared.
  collectTerrainSupportInvalidationCells(result.position, cells, seen);

  const exactSupportCells = result.supportInvalidationCells ?? [];
  for (const cell of exactSupportCells) {
    addTerrainSupportInvalidationCell(cell, cells, seen);
  }
}

function collectTerrainSupportInvalidationCells(
  position: VoxelBlockPosition,
  cells: ChangedTerrainCell[],
  seen: Set<string>
): void {
  // A damaged voxel can alter support for shards centered on that cell, shards
  // overhanging an edge, and small clumps whose bottom shard was touching an
  // adjacent partial/support cell. Keep the halo small and only compute it when
  // terrain actually changes.
  for (let y = position.y - 1; y <= position.y + 1; y += 1) {
    if (y < 0) continue;
    for (let z = position.z - 1; z <= position.z + 1; z += 1) {
      for (let x = position.x - 1; x <= position.x + 1; x += 1) {
        addTerrainSupportInvalidationCell({ x, y, z }, cells, seen);
      }
    }
  }
}

function addTerrainSupportInvalidationCell(
  cell: ChangedTerrainCell | TerrainSupportInvalidationCell,
  cells: ChangedTerrainCell[],
  seen: Set<string>
): void {
  const normalizedCell: ChangedTerrainCell = cell.bounds
    ? {
        x: Math.floor(cell.x),
        y: Math.floor(cell.y),
        z: Math.floor(cell.z),
        bounds: cell.bounds
      }
    : {
        x: Math.floor(cell.x),
        y: Math.floor(cell.y),
        z: Math.floor(cell.z)
      };
  const key = createTerrainSupportInvalidationCellKey(normalizedCell);
  if (seen.has(key)) return;

  seen.add(key);
  cells.push(normalizedCell);
}

function createTerrainSupportInvalidationCellKey(cell: ChangedTerrainCell): string {
  if (!cell.bounds) return `${cell.x},${cell.y},${cell.z}`;
  return [
    `${cell.x},${cell.y},${cell.z}`,
    cell.bounds.minX,
    cell.bounds.maxX,
    cell.bounds.minY,
    cell.bounds.maxY,
    cell.bounds.minZ,
    cell.bounds.maxZ
  ].map((part) => typeof part === "number" ? part.toFixed(4) : part).join("|");
}

function invalidateDebrisSupportForEditedCells(cells: readonly ChangedTerrainCell[]): TerrainDamageFeedbackSummary {
  if (cells.length === 0) return createEmptyTerrainDamageFeedbackSummary();

  const rigidDebrisWoken = rigidDebris.wakeDebrisRestingOnChangedTerrainCells(cells);
  const settlerDebrisWoken = debrisSettler.wakeRegionsRestingOnChangedTerrainCells(cells);
  const detachedDebrisWoken = wakeSleepingDetachedFragmentsRestingOnChangedTerrainCells(toys, cells);
  rigidDebris.invalidateStaticColliders();
  addDebrisLifecycleDiagnostics({
    supportCellsInvalidated: cells.length,
    rigidDebrisWoken,
    settlerDebrisWoken,
    detachedDebrisWoken
  });
  return {
    supportInvalidationCells: cells.length,
    rigidDebrisWoken,
    settlerDebrisWoken,
    detachedDebrisWoken
  };
}

function addDebrisLifecycleDiagnostics(delta: Partial<DebrisLifecycleDiagnostics>): void {
  debrisLifecycleDiagnostics = {
    supportCellsInvalidated: debrisLifecycleDiagnostics.supportCellsInvalidated + (delta.supportCellsInvalidated ?? 0),
    rigidDebrisWoken: debrisLifecycleDiagnostics.rigidDebrisWoken + (delta.rigidDebrisWoken ?? 0),
    settlerDebrisWoken: debrisLifecycleDiagnostics.settlerDebrisWoken + (delta.settlerDebrisWoken ?? 0),
    detachedDebrisWoken: debrisLifecycleDiagnostics.detachedDebrisWoken + (delta.detachedDebrisWoken ?? 0),
    settledPressureExpiries: debrisLifecycleDiagnostics.settledPressureExpiries + (delta.settledPressureExpiries ?? 0),
    airbornePressureProtections: debrisLifecycleDiagnostics.airbornePressureProtections + (delta.airbornePressureProtections ?? 0),
    emergencyAirborneExpiries: debrisLifecycleDiagnostics.emergencyAirborneExpiries + (delta.emergencyAirborneExpiries ?? 0)
  };
}

function recordTerrainCombatLog(options: {
  readonly source: CombatLogSource;
  readonly action: string;
  readonly results: readonly BlockDamageResult[];
  readonly terraformerCells?: readonly TerraformerTargetSubCell[];
  readonly feedback?: TerrainDamageFeedbackSummary;
}): void {
  if (options.results.length === 0) return;

  const terraformerCellLookup = createTerraformerCellLookup(options.terraformerCells);
  const targets = options.results.map((result): CombatLogTerrainTarget => {
    const damageBefore = result.damageBefore;
    const damageAfter = result.damageAfter;
    const derivedDamage = damageBefore !== undefined && damageAfter !== undefined
      ? Math.max(0, damageAfter - damageBefore)
      : Math.max(0, result.maxHealth - result.remainingHealth);
    const affectedCellIndexes = result.affectedVisualCellIndexes ?? [];

    return {
      kind: "terrain",
      block: result.block,
      blockName: getBlockDisplayName(result.block),
      x: result.position.x,
      y: result.position.y,
      z: result.position.z,
      damageApplied: result.damageApplied ?? derivedDamage,
      damageBefore,
      damageAfter,
      remainingHealth: result.remainingHealth,
      maxHealth: result.maxHealth,
      destroyed: result.destroyed,
      subCells: affectedCellIndexes.map((cellIndex) => {
        const terraformerCell = terraformerCellLookup.get(createCombatLogCellKey(result.position, cellIndex));
        return createCombatLogSubCell(cellIndex, terraformerCell
          ? {
              x: terraformerCell.globalX,
              y: terraformerCell.globalY,
              z: terraformerCell.globalZ
            }
          : undefined);
      })
    };
  });

  combatLog.record({
    source: options.source,
    action: options.action,
    targets,
    diagnostics: options.feedback
      ? { terrainSupport: options.feedback }
      : undefined
  });
}

function recordRubbleCombatLog(
  source: CombatLogSource,
  action: string,
  events: readonly RubbleDamageEvent[]
): void {
  if (events.length === 0) return;

  combatLog.record({
    source,
    action,
    targets: events.map((event): CombatLogRubbleTarget => ({
      kind: "rubble",
      block: event.block,
      blockName: getBlockDisplayName(event.block),
      x: event.cell.x,
      y: event.cell.y,
      z: event.cell.z,
      damageApplied: Math.max(0, event.maxHealth - event.remainingHealth),
      remainingHealth: event.remainingHealth,
      maxHealth: event.maxHealth,
      destroyed: event.destroyed,
      collateral: event.collateral
    }))
  });
}

function createTerraformerCellLookup(
  cells: readonly TerraformerTargetSubCell[] | undefined
): ReadonlyMap<string, TerraformerTargetSubCell> {
  const lookup = new Map<string, TerraformerTargetSubCell>();
  for (const cell of cells ?? []) {
    lookup.set(createCombatLogCellKey(cell.position, cell.cellIndex), cell);
  }
  return lookup;
}

function createCombatLogCellKey(position: VoxelBlockPosition, cellIndex: number): string {
  return `${position.x},${position.y},${position.z}:${cellIndex}`;
}

function getBlockDisplayName(block: number): string {
  return BLOCKS[block]?.name ?? `Block ${block}`;
}

function spawnPartialBlockBitePoofs(result: BlockDamageResult): void {
  for (const position of result.bitePoofPositions ?? []) {
    debrisPoofRenderer.spawn(
      new THREE.Vector3(position.x, position.y, position.z),
      result.block
    );
  }
}

function continuePhysicsCoreAfterPierce(source: PhysicsToy, pierceContinuation: BlockPierceContinuation): void {
  source.continueAfterPierce(
    new THREE.Vector3(
      pierceContinuation.position.x,
      pierceContinuation.position.y,
      pierceContinuation.position.z
    ),
    new THREE.Vector3(
      pierceContinuation.velocity.x,
      pierceContinuation.velocity.y,
      pierceContinuation.velocity.z
    )
  );
}

function spawnBlockFragments(
  block: number,
  position: { readonly x: number; readonly y: number; readonly z: number },
  impact: TerrainDamageFeedbackImpact,
  options: {
    readonly fragmentCount: number;
    readonly materialUnits: number;
    readonly chipOnly?: boolean;
    readonly ejectionHint?: DebrisEjectionHint;
    readonly debrisProfile?: DebrisSpawnProfile;
  }
): number {
  const debrisProfile = options.debrisProfile ?? getDebrisSpawnProfile(block);
  const fragmentBaseSpeed = Math.min(
    FRAGMENT_IMPACT_SPEED_CAP,
    impact.speed * FRAGMENT_IMPACT_SPEED_SCALE * debrisProfile.ejectionSpeedMultiplier
  );
  const blockCenter = options.chipOnly
    ? (options.ejectionHint
      ? createVectorFromVoxel(options.ejectionHint.origin)
      : impact.position.clone()).addScaledVector(impact.normal, 0.08)
    : new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);
  const requestedFragmentCount = options.fragmentCount;
  const fragmentCount = requestedFragmentCount;
  if (fragmentCount <= 0) return 0;

  const fragments: PhysicsToy[] = [];
  let remainingVisualVolumeBudget = Math.max(0, options.materialUnits);

  for (let index = 0; index < fragmentCount; index += 1) {
    if (remainingVisualVolumeBudget <= 0.000001) break;

    const fragmentGridIndex = getDistributedBlockFragmentIndex(index, fragmentCount);
    const fragmentOffset = getBlockFragmentOffset(fragmentGridIndex);
    const offset = new THREE.Vector3(
      fragmentOffset.x,
      fragmentOffset.y,
      fragmentOffset.z
    );
    // Break the perfect 3x3x3 silhouette before contact glue can form. The
    // player should see fragments tumble out of the voxel, not a shrunken copy
    // of the original block politely waiting to become rubble.
    const spawnJitter = createFragmentSpawnJitter();
    const preferredDirection = getDebrisEjectionDirection(options.ejectionHint, index, impact.normal);
    const scatter = createFragmentScatterDirection(offset).multiplyScalar(
      (FRAGMENT_SCATTER_SPEED_MIN + Math.random() * FRAGMENT_SCATTER_SPEED_RANGE) *
        debrisProfile.ejectionSpeedMultiplier
    );
    const launchDirection = preferredDirection
      .clone()
      .multiplyScalar(0.88)
      .add(impact.normal.clone().multiplyScalar(0.24))
      .add(scatter.clone().normalize().multiplyScalar(0.18));
    if (launchDirection.lengthSq() <= 0.0001) {
      launchDirection.copy(impact.normal);
    } else {
      launchDirection.normalize();
    }
    const velocity = launchDirection
      .multiplyScalar(fragmentBaseSpeed)
      .add(scatter)
      .add(spawnJitter.clone().multiplyScalar(FRAGMENT_JITTER_SPEED))
      .add(new THREE.Vector3(
        0,
        (FRAGMENT_UPWARD_SPEED_MIN + Math.random() * FRAGMENT_UPWARD_SPEED_RANGE) *
          debrisProfile.upwardSpeedMultiplier,
        0
      ));
    const rubbleMaterialUnits = getBlockFragmentMaterialUnits(index, requestedFragmentCount, options.materialUnits);
    const candidateDebrisShape = createDebrisShapeForBlock(block, {
      fragmentIndex: index,
      distributedFragmentIndex: fragmentGridIndex,
      origin: position
    });
    const perPieceVisualVolumeBudget = Math.min(
      remainingVisualVolumeBudget,
      rubbleMaterialUnits,
      BLOCK_DEBRIS_MAX_MATERIAL_UNITS_PER_FRAGMENT
    );
    const debrisShape = fitDebrisShapeToVolumeBudget(candidateDebrisShape, perPieceVisualVolumeBudget);
    if (!debrisShape) continue;

    const fragment = PhysicsToy.createBlockFragment(
      block,
      getDebrisFragmentSpawnPosition(blockCenter, offset, spawnJitter, options.ejectionHint, index),
      velocity,
      rubbleMaterialUnits,
      debrisShape
    );
    addPhysicsToy(fragment);
    fragments.push(fragment);
    remainingVisualVolumeBudget = Math.max(0, remainingVisualVolumeBudget - debrisShape.estimatedVisualVolume);
  }

  const admission = admitRigidDebrisFragments(fragments, blockCenter);
  rigidDebris.invalidateStaticColliders();
  if (admission.denied.length > 0) {
    // The settler is the cheap VFX lifecycle, not Rapier. v0.11.2 accidentally
    // registered the whole burst here even when some shards were pending rigid
    // admission, creating mixed regions whose wake/sleep behavior was easy to
    // miss in tests and very visible in craters. Keep ownership explicit:
    // admitted shards are Rapier-owned, denied shards stay VFX-settler-owned.
    debrisSettler.registerFracture(block, blockCenter, admission.denied);
  }
  return fragments.length;
}

type RigidDebrisAdmissionRuntimeResult = {
  readonly admitted: readonly PhysicsToy[];
  readonly denied: readonly PhysicsToy[];
};

function admitRigidDebrisFragments(
  fragments: readonly PhysicsToy[],
  burstCenter: THREE.Vector3
): RigidDebrisAdmissionRuntimeResult {
  if (fragments.length === 0) {
    return { admitted: [], denied: [] };
  }

  const availableRigidSlots = getCurrentRigidDebrisBodyBudget() -
    rigidDebris.getBodyCount() -
    rigidDebris.getPendingFragmentCount();
  const selectedIndices = selectRigidDebrisAdmissionIndices(
    fragments.map(toRigidDebrisAdmissionFragment),
    availableRigidSlots,
    {
      cameraPosition: camera.position,
      burstCenter,
      activeRadiusMeters: qualityController.preset.debrisActiveRadiusMeters,
      supportHeightFor: getRigidDebrisAdmissionSupportHeight,
      corePositions: toys
        .filter((toy) => !toy.isInstancedFragment && !toy.isExpired)
        .map((toy) => toy.mesh.position)
    }
  );

  const admission = partitionRigidDebrisAdmission(fragments, selectedIndices);
  for (const fragment of admission.admitted) {
    rigidDebris.registerFragment(fragment);
  }
  rigidDebris.recordAdmissionDenied(admission.denied.length);
  return admission;
}

function toRigidDebrisAdmissionFragment(fragment: PhysicsToy): RigidDebrisAdmissionFragment {
  return {
    position: fragment.mesh.position,
    velocity: fragment.velocity,
    materialUnits: fragment.rubbleMaterialUnits,
    halfExtents: fragment.debrisShape?.colliderHalfExtents
  };
}

function getRigidDebrisAdmissionSupportHeight(fragment: RigidDebrisAdmissionFragment): number | null {
  const halfX = fragment.halfExtents?.x ?? BLOCK_FRAGMENT_COLLISION_RADIUS;
  const halfY = fragment.halfExtents?.y ?? BLOCK_FRAGMENT_COLLISION_RADIUS;
  const halfZ = fragment.halfExtents?.z ?? BLOCK_FRAGMENT_COLLISION_RADIUS;
  return terrainAndRubbleCollisionWorld.getSupportHeight?.({
    minX: fragment.position.x - halfX,
    maxX: fragment.position.x + halfX,
    minY: fragment.position.y - halfY,
    maxY: fragment.position.y + halfY,
    minZ: fragment.position.z - halfZ,
    maxZ: fragment.position.z + halfZ
  }) ?? null;
}

function createVectorFromVoxel(position: { readonly x: number; readonly y: number; readonly z: number } | undefined): THREE.Vector3 {
  return position
    ? new THREE.Vector3(position.x, position.y, position.z)
    : new THREE.Vector3();
}

function getDebrisFragmentSpawnPosition(
  blockCenter: THREE.Vector3,
  offset: THREE.Vector3,
  spawnJitter: THREE.Vector3,
  ejectionHint: DebrisEjectionHint | undefined,
  fragmentIndex: number
): THREE.Vector3 {
  const biteCellCenter = ejectionHint?.biteCellCenters.length
    ? ejectionHint.biteCellCenters[fragmentIndex % ejectionHint.biteCellCenters.length]
    : null;
  const basePosition = biteCellCenter
    ? createVectorFromVoxel(biteCellCenter)
    : blockCenter.clone().add(offset);
  return basePosition.add(spawnJitter);
}

function getDebrisEjectionDirection(
  ejectionHint: DebrisEjectionHint | undefined,
  fragmentIndex: number,
  fallbackNormal: THREE.Vector3
): THREE.Vector3 {
  const preferredDirection = ejectionHint?.preferredDirections.length
    ? ejectionHint.preferredDirections[fragmentIndex % ejectionHint.preferredDirections.length]
    : null;
  const direction = preferredDirection
    ? createVectorFromVoxel(preferredDirection)
    : fallbackNormal.clone();
  if (direction.lengthSq() <= 0.0001) {
    direction.copy(fallbackNormal);
  }
  if (direction.lengthSq() <= 0.0001) {
    direction.set(0, 1, 0);
  }
  return direction.normalize();
}

function createFragmentScatterDirection(offset: THREE.Vector3): THREE.Vector3 {
  if (offset.lengthSq() > 0.0001) {
    return offset.clone().normalize();
  }

  // The exact center shard in an odd grid has no natural outward vector, so
  // give it a tiny random bias instead of letting it travel as a dead lump.
  const randomDirection = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.35,
    Math.random() - 0.5
  );

  if (randomDirection.lengthSq() <= 0.0001) {
    randomDirection.set(0, 1, 0);
  }
  return randomDirection.normalize();
}

function createFragmentSpawnJitter(): THREE.Vector3 {
  // Tiny position noise is enough to stop the fracture grid from reading as an
  // intact cube, while staying small enough that the debris still lands in the
  // same local settling region and becomes one coherent rubble patch.
  return new THREE.Vector3(
    (Math.random() - 0.5) * 0.12,
    (Math.random() - 0.5) * 0.06,
    (Math.random() - 0.5) * 0.12
  );
}

function throwPlayerCore(activePlayer: PlayerController): void {
  const firingSolution = createPlayerCoreFiringSolution(getPhysicsCoreRadius(physicsCoreSettings));
  const launchVelocity = createPlayerPhysicsCoreLaunchVelocity(
    firingSolution.direction,
    activePlayer.velocity,
    physicsCoreSettings
  );
  addPhysicsToy(createPhysicsCore(firingSolution.origin, launchVelocity));
  engineEvents.emit("physics:core-thrown", { source: "player", mode: "projectile" });
}

function firePlayerHitscanCore(): void {
  const activeWorld = requireWorld();
  const firingSolution = createPlayerCoreFiringSolution(HITSCAN_CORE_RADIUS);
  if (firingSolution.direction.lengthSq() <= 0.0001) return;

  // Hitscan cores skip spawning a moving toy, but they deliberately reuse the
  // terrain impact path so bite visuals, material ejection, health bars, and
  // tunnel continuation stay aligned with projectile cores.
  const shotDirection = firingSolution.direction;
  const visualStart = firingSolution.origin;
  let visualEnd = visualStart.clone().addScaledVector(shotDirection, Math.min(HITSCAN_CORE_RANGE, 32));
  const damagedBlocksForShot = new Set<string>();
  let rayOrigin = firingSolution.origin.clone();
  let remainingRange = HITSCAN_CORE_RANGE;
  let impactSpeed = HITSCAN_CORE_IMPACT_SPEED;

  for (
    let impactIndex = 0;
    impactIndex < HITSCAN_CORE_MAX_IMPACTS &&
    remainingRange > TARGET_HIT_EPSILON &&
    impactSpeed > BLOCK_DAMAGE_IMPACT_SPEED;
    impactIndex += 1
  ) {
    const terrainHit = raycastHitscanCore(
      activeWorld,
      rayOrigin,
      shotDirection,
      remainingRange,
      HITSCAN_CORE_RADIUS
    );
    const rubbleHit = rubbleField.raycast(rayOrigin, shotDirection, remainingRange);

    if (rubbleHit && (!terrainHit || rubbleHit.distance < terrainHit.distance - TARGET_HIT_EPSILON)) {
      visualEnd = rayOrigin.clone().addScaledVector(shotDirection, rubbleHit.distance);
      damageTargetedRubbleCell(rubbleHit.cell, PHYSICS_CORE_BLOCK_DAMAGE, HITSCAN_CORE_COMBAT_SOURCE, "rubble hit");
      break;
    }

    if (!terrainHit) {
      visualEnd = rayOrigin.clone().addScaledVector(shotDirection, Math.min(remainingRange, 32));
      break;
    }
    visualEnd = terrainHit.position.clone();

    const incomingVelocity = shotDirection.clone().multiplyScalar(impactSpeed);
    const impactNormal = terrainHit.normal.lengthSq() > 0.0001
      ? terrainHit.normal
      : shotDirection.clone().multiplyScalar(-1);
    const result = applyCoreTerrainImpact(activeWorld, {
      block: terrainHit.block,
      normal: impactNormal,
      speed: impactSpeed,
      position: terrainHit.position,
      incomingVelocity,
      radius: HITSCAN_CORE_RADIUS
    }, damagedBlocksForShot, HITSCAN_CORE_COMBAT_SOURCE);

    const pierceContinuation = result?.pierceContinuation;
    if (!pierceContinuation) break;

    const exitPosition = new THREE.Vector3(
      pierceContinuation.position.x,
      pierceContinuation.position.y,
      pierceContinuation.position.z
    );
    visualEnd = exitPosition;
    remainingRange = Math.max(0, remainingRange - rayOrigin.distanceTo(exitPosition));
    rayOrigin = exitPosition;
    impactSpeed = pierceContinuation.speed;
  }

  clearLooseDebrisAlongHitscanBeam(visualStart, visualEnd);
  hitscanBoltTracer.spawn(visualStart, visualEnd, createPhysicsCoreColor(physicsCoreSettings));
  engineEvents.emit("physics:core-thrown", { source: "player", mode: "hitscan" });
}

function clearLooseDebrisAlongHitscanBeam(start: THREE.Vector3, end: THREE.Vector3): void {
  const beamRadius = Math.max(HITSCAN_DEBRIS_CLEAR_RADIUS, HITSCAN_CORE_RADIUS * 2.2);
  const debrisTargets = collectHitscanDebrisTargets(toys, start, end, beamRadius);
  if (debrisTargets.length === 0) return;

  for (const toy of debrisTargets) {
    expireGroundDebrisWithPoof(toy);
  }
  pruneExpiredToys();
}

function createPlayerCoreFiringSolution(radius: number): PlayerCoreFiringSolution {
  camera.getWorldDirection(direction);
  const cameraDirection = direction.lengthSq() > 0.0001
    ? direction.clone().normalize()
    : new THREE.Vector3(0, 0, -1);
  const adsOrigin = camera.position.clone().addScaledVector(cameraDirection, PLAYER_CORE_MUZZLE_FORWARD_METERS);

  if (rightMouseButtonDown) {
    return {
      origin: adsOrigin,
      direction: cameraDirection
    };
  }

  camera.updateMatrixWorld();
  const muzzleOrigin = camera.localToWorld(createPlayerCoreMuzzleLocalOffset(camera.fov, camera.aspect));
  const aimDistance = getPlayerCoreAimDistance(cameraDirection, radius);

  return {
    origin: muzzleOrigin,
    direction: createPlayerCoreShotDirection(
      muzzleOrigin,
      camera.position,
      cameraDirection,
      aimDistance
    )
  };
}

function getPlayerCoreAimDistance(cameraDirection: THREE.Vector3, radius: number): number {
  const activeWorld = requireWorld();
  const terrainHit = raycastHitscanCore(activeWorld, camera.position, cameraDirection, HITSCAN_CORE_RANGE, radius);
  const rubbleHit = rubbleField.raycast(camera.position, cameraDirection, HITSCAN_CORE_RANGE);

  if (rubbleHit && (!terrainHit || rubbleHit.distance < terrainHit.distance - TARGET_HIT_EPSILON)) {
    return Math.max(1, rubbleHit.distance);
  }
  if (terrainHit) return Math.max(1, terrainHit.distance);
  return HITSCAN_CORE_RANGE;
}

function throwNovaPilotCore(): void {
  const launch = novaPilot.createCoreLaunch();
  if (!launch) return;
  addPhysicsToy(createPhysicsCore(
    launch.position,
    launch.velocity.clone().multiplyScalar(getPhysicsCoreVelocityMultiplier(physicsCoreSettings))
  ));
  engineEvents.emit("physics:core-thrown", { source: "nova", mode: "projectile" });
}

function createPhysicsCore(position: THREE.Vector3, velocity: THREE.Vector3): PhysicsToy {
  const core = new PhysicsToy(position, velocity, {
    // Thrown cores are the expensive, gameplay-relevant actors. Keep their
    // damage/collision behavior while moving, then let them sleep after
    // settling so old shots stop taxing the frame forever.
    radius: getPhysicsCoreRadius(physicsCoreSettings),
    material: createPhysicsCoreMaterial(physicsCoreSettings),
    terrainDamageBounceCount: physicsCoreSettings.terrainBounceCount,
    maxAgeSeconds: PHYSICS_CORE_HARD_TTL_SECONDS,
    sleepSpeed: PHYSICS_CORE_SLEEP_SPEED,
    sleepAfterSeconds: PHYSICS_CORE_SLEEP_AFTER_SECONDS,
    // Below this speed a core can no longer meaningfully chew terrain, so start
    // a short fade/despawn countdown instead of letting old shots pile up in
    // broadphase and hitch logs forever.
    lowSpeedExpireSpeed: PHYSICS_CORE_LOW_SPEED_DESPAWN_SPEED,
    lowSpeedExpireAfterSeconds: PHYSICS_CORE_LOW_SPEED_DESPAWN_SECONDS
  });
  if (physicsCoreSettings.trailEnabled) {
    physicsCoreTrail.track(core, createPhysicsCoreColor(physicsCoreSettings));
  }
  return core;
}

function addPhysicsToy(toy: PhysicsToy): void {
  toys.push(toy);
  if (!toy.isInstancedFragment) {
    scene.add(toy.mesh);
  }
}

function changePhysicsObjectBudget(direction: PhysicsBudgetDirection): void {
  setPhysicsObjectBudget(
    stepPhysicsObjectBudget(physicsObjectBudget, direction, qualityController.preset.physicsObjectBudget)
  );
}

function setPhysicsObjectBudget(nextBudget: number, persist = true): void {
  if (persist) qualityController.forkCurrentPresetToCustom();

  const preset = qualityController.preset;

  physicsObjectBudget = normalizePhysicsObjectBudget(nextBudget, preset.physicsObjectBudget);
  if (persist) {
    writePhysicsObjectBudgetPreference(
      qualityController.currentPresetId,
      physicsObjectBudget,
      preset.physicsObjectBudget
    );
  }

  updatePhysicsBudgetControls();
  enforcePhysicsToyBudget();
  enforceRigidDebrisBudget();
  if (persist) {
    engineEvents.emit("settings:physics-budget-changed", {
      physicsObjectBudget
    });
  }
}

function syncPhysicsBudgetToQuality(): void {
  const preset = qualityController.preset;

  // Quality changes should feel immediate: use the preset default unless this
  // specific tier already has a player-tuned override in local storage.
  setPhysicsObjectBudget(
    readPhysicsObjectBudgetPreference(qualityController.currentPresetId, preset.physicsObjectBudget),
    false
  );
}

function updatePhysicsBudgetControls(): void {
  physicsBudgetValue.textContent = `${physicsObjectBudget} bodies`;
  physicsBudgetDecreaseButton.disabled = physicsObjectBudget <= MIN_PHYSICS_OBJECT_BUDGET;
  physicsBudgetIncreaseButton.disabled = physicsObjectBudget >= MAX_PHYSICS_OBJECT_BUDGET;
  physicsBudgetSlider.min = String(MIN_PHYSICS_OBJECT_BUDGET);
  physicsBudgetSlider.max = String(MAX_PHYSICS_OBJECT_BUDGET);
  physicsBudgetSlider.step = String(PHYSICS_OBJECT_BUDGET_STEP);
  physicsBudgetSlider.value = String(physicsObjectBudget);
}

function setPhysicsCoreSizePercent(sizePercent: unknown): void {
  updatePhysicsCoreSettings({
    ...physicsCoreSettings,
    sizePercent: normalizePhysicsCoreSizePercent(sizePercent, physicsCoreSettings.sizePercent)
  });
}

function setPhysicsCoreVelocityPercent(velocityPercent: unknown): void {
  updatePhysicsCoreSettings({
    ...physicsCoreSettings,
    velocityPercent: normalizePhysicsCoreVelocityPercent(
      velocityPercent,
      physicsCoreSettings.velocityPercent
    )
  });
}

function setPhysicsCoreBounceCount(bounceCount: unknown): void {
  updatePhysicsCoreSettings({
    ...physicsCoreSettings,
    terrainBounceCount: normalizePhysicsCoreBounceCount(bounceCount, physicsCoreSettings.terrainBounceCount)
  });
}

function setPhysicsCoreHueDegrees(hueDegrees: unknown): void {
  updatePhysicsCoreSettings({
    ...physicsCoreSettings,
    hueDegrees: normalizePhysicsCoreHueDegrees(hueDegrees, physicsCoreSettings.hueDegrees)
  });
}

function setPhysicsCoreTrailEnabled(enabled: boolean): void {
  updatePhysicsCoreSettings({
    ...physicsCoreSettings,
    trailEnabled: enabled
  });
}

function updatePhysicsCoreSettings(settings: PhysicsCoreSettings): void {
  physicsCoreSettings = normalizePhysicsCoreSettings(settings, physicsCoreSettings);
  writePhysicsCoreSettingsPreference(physicsCoreSettings);
  updatePhysicsCoreControls();
  syncActiveCoreVisuals();
}

function updatePhysicsCoreControls(): void {
  coreSizeSlider.min = String(PHYSICS_CORE_SIZE_MIN_PERCENT);
  coreSizeSlider.max = String(PHYSICS_CORE_SIZE_MAX_PERCENT);
  coreSizeSlider.step = String(PHYSICS_CORE_SIZE_STEP_PERCENT);
  coreSizeSlider.value = String(physicsCoreSettings.sizePercent);
  coreSizeValue.textContent = formatPhysicsCorePercent(physicsCoreSettings.sizePercent);

  coreVelocitySlider.min = String(PHYSICS_CORE_VELOCITY_MIN_PERCENT);
  coreVelocitySlider.max = String(PHYSICS_CORE_VELOCITY_MAX_PERCENT);
  coreVelocitySlider.step = String(PHYSICS_CORE_VELOCITY_STEP_PERCENT);
  coreVelocitySlider.value = String(physicsCoreSettings.velocityPercent);
  coreVelocityValue.textContent = formatPhysicsCorePercent(physicsCoreSettings.velocityPercent);

  coreBounceSlider.min = String(PHYSICS_CORE_BOUNCE_MIN_COUNT);
  coreBounceSlider.max = String(PHYSICS_CORE_BOUNCE_MAX_COUNT);
  coreBounceSlider.step = String(PHYSICS_CORE_BOUNCE_STEP_COUNT);
  coreBounceSlider.value = String(physicsCoreSettings.terrainBounceCount);
  coreBounceValue.textContent = formatPhysicsCoreBounceCount(physicsCoreSettings.terrainBounceCount);

  const coreCssColor = getPhysicsCoreCssColor(physicsCoreSettings);
  coreColorSlider.min = String(PHYSICS_CORE_HUE_MIN_DEGREES);
  coreColorSlider.max = String(PHYSICS_CORE_HUE_MAX_DEGREES);
  coreColorSlider.step = String(PHYSICS_CORE_HUE_STEP_DEGREES);
  coreColorSlider.value = String(physicsCoreSettings.hueDegrees);
  coreColorSlider.style.accentColor = coreCssColor;
  coreColorValue.textContent = formatPhysicsCoreHue(physicsCoreSettings.hueDegrees);
  coreColorValue.style.color = coreCssColor;
  coreTrailToggle.checked = physicsCoreSettings.trailEnabled;
  coreTrailToggle.style.accentColor = coreCssColor;
}

function syncActiveCoreVisuals(): void {
  const color = createPhysicsCoreColor(physicsCoreSettings);
  physicsCoreTrail.setColor(color);
  if (!physicsCoreSettings.trailEnabled) {
    physicsCoreTrail.clear();
  }

  for (const toy of toys) {
    if (toy.isInstancedFragment || !(toy.mesh.material instanceof THREE.MeshStandardMaterial)) continue;
    applyPhysicsCoreMaterialColor(toy.mesh.material, physicsCoreSettings);
    if (physicsCoreSettings.trailEnabled && !toy.isExpired && !toy.isSleeping) {
      physicsCoreTrail.track(toy, color);
    }
  }
}

function setGroundDebrisBudget(nextBudget: unknown): void {
  groundDebrisBudget = normalizeGroundDebrisBudget(nextBudget, groundDebrisBudget);
  writeGroundDebrisBudgetPreference(groundDebrisBudget);
  updateGroundDebrisBudgetControls();
  enforceGroundDebrisBudget();
}

function updateGroundDebrisBudgetControls(): void {
  groundDebrisBudgetSlider.min = String(MIN_GROUND_DEBRIS_BUDGET);
  groundDebrisBudgetSlider.max = String(MAX_GROUND_DEBRIS_BUDGET);
  groundDebrisBudgetSlider.step = String(GROUND_DEBRIS_BUDGET_STEP);
  groundDebrisBudgetSlider.value = String(groundDebrisBudget);
  groundDebrisBudgetValue.textContent = formatGroundDebrisBudget(groundDebrisBudget);
}

function setGroundDebrisLifetime(nextLifetimeSeconds: unknown): void {
  groundDebrisLifetimeSeconds = normalizeGroundDebrisLifetime(nextLifetimeSeconds, groundDebrisLifetimeSeconds);
  if (groundDebrisLifetimeSeconds !== FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS) {
    lastTimedGroundDebrisLifetimeSeconds = groundDebrisLifetimeSeconds;
  }
  writeGroundDebrisLifetimePreference(groundDebrisLifetimeSeconds);
  updateGroundDebrisLifetimeControls();
}

function setGroundDebrisLifetimeForever(enabled: boolean): void {
  // "Forever" used to be encoded as slider value 0, which made the minimum
  // setting surprising. Keep it as an explicit mode so 0s can mean immediate
  // grounded cleanup while still letting testers preserve aftermath forever.
  groundDebrisLifetimeSeconds = enabled
    ? FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS
    : lastTimedGroundDebrisLifetimeSeconds;
  writeGroundDebrisLifetimePreference(groundDebrisLifetimeSeconds);
  updateGroundDebrisLifetimeControls();
}

function updateGroundDebrisLifetimeControls(): void {
  const isForever = groundDebrisLifetimeSeconds === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS;
  groundDebrisLifetimeSlider.min = String(MIN_GROUND_DEBRIS_LIFETIME_SECONDS);
  groundDebrisLifetimeSlider.max = String(MAX_GROUND_DEBRIS_LIFETIME_SECONDS);
  groundDebrisLifetimeSlider.step = String(GROUND_DEBRIS_LIFETIME_STEP_SECONDS);
  groundDebrisLifetimeSlider.value = String(isForever ? lastTimedGroundDebrisLifetimeSeconds : groundDebrisLifetimeSeconds);
  groundDebrisLifetimeSlider.disabled = isForever;
  groundDebrisLifetimeForeverToggle.checked = isForever;
  groundDebrisLifetimeValue.textContent = formatGroundDebrisLifetime(groundDebrisLifetimeSeconds);
}

function emitQualityChanged(source: QualityChangeSource): void {
  const preset = qualityController.preset;
  engineEvents.emit("quality:changed", {
    presetId: qualityController.currentPresetId,
    label: preset.label,
    source,
    renderDistance: qualityController.loadRadius,
    physicsObjectBudget,
    blockFragmentCount: preset.blockFragmentCount
  });
}

function updateSettingsControls(): void {
  const preset = qualityController.preset;

  // Presets remain the big safe defaults; these sliders expose the engine knobs
  // we keep wanting to poke while tuning performance and feel.
  renderDistanceSlider.min = String(RENDER_DISTANCE_MIN);
  renderDistanceSlider.max = String(RENDER_DISTANCE_MAX);
  renderDistanceSlider.step = String(RENDER_DISTANCE_STEP);
  renderDistanceSlider.value = String(qualityController.loadRadius);
  renderDistanceValue.textContent = formatRenderDistance(qualityController.loadRadius);

  shadowQualitySlider.min = String(SHADOW_QUALITY_MIN_LEVEL);
  shadowQualitySlider.max = String(SHADOW_QUALITY_MAX_LEVEL);
  shadowQualitySlider.step = "1";
  shadowQualitySlider.value = String(getShadowQualityLevel(preset.shadows ? preset.shadowMapSize : 0));
  shadowQualityValue.textContent = formatShadowQuality(preset.shadows ? preset.shadowMapSize : 0);

  debrisCountSlider.min = String(BLOCK_FRAGMENT_MIN_COUNT);
  debrisCountSlider.max = String(BLOCK_FRAGMENT_MAX_COUNT);
  debrisCountSlider.step = "1";
  debrisCountSlider.value = String(preset.blockFragmentCount);
  debrisCountValue.textContent = formatBlockFragmentCount(preset.blockFragmentCount);

  updateGroundDebrisBudgetControls();
  updateGroundDebrisLifetimeControls();
}

function enforcePhysicsToyBudget(): void {
  const overBudgetCount = toys.length - physicsObjectBudget;
  if (overBudgetCount <= 0) return;

  // Debris is VFX now. Durable damage lives in terrain HP and the partial
  // bite lattice, so normal pressure relief trims settled aftermath first
  // instead of making visible airborne burst shards disappear mid-flight.
  const settledRegionExpiries = debrisSettler.discardSettledRegionsForPressure(camera.position, overBudgetCount);
  if (settledRegionExpiries > 0) {
    addDebrisLifecycleDiagnostics({ settledPressureExpiries: settledRegionExpiries });
  }
  pruneExpiredToys();

  const outsideSettledOrphanExpiries = expireOrphanFragmentsForBudget(true, false);
  const settledOrphanExpiries = expireOrphanFragmentsForBudget(false, false);
  const settledPressureExpiries = outsideSettledOrphanExpiries + settledOrphanExpiries;
  if (settledPressureExpiries > 0) {
    addDebrisLifecycleDiagnostics({ settledPressureExpiries });
  }

  const airborneProtectionCount = Math.min(
    Math.max(0, toys.length - physicsObjectBudget),
    countPressureProtectedAirborneFragments()
  );
  if (airborneProtectionCount > 0) {
    addDebrisLifecycleDiagnostics({ airbornePressureProtections: airborneProtectionCount });
  }

  pruneOldestPhysicsCoresForBudget();

  if (toys.length <= physicsObjectBudget) return;

  // Last-resort safety valve: if the scene is still beyond the total toy cap
  // after settled debris and cores are gone, expire farthest airborne debris.
  // This should be rare and is surfaced in HUD/log diagnostics when it fires.
  const emergencySettlerExpiries = debrisSettler.discardRegionsForPressure(
    camera.position,
    toys.length - physicsObjectBudget
  );
  if (emergencySettlerExpiries > 0) {
    addDebrisLifecycleDiagnostics({ emergencyAirborneExpiries: emergencySettlerExpiries });
  }
  pruneExpiredToys();

  const emergencyOrphanExpiries =
    expireOrphanFragmentsForBudget(true, true) +
    expireOrphanFragmentsForBudget(false, true);
  if (emergencyOrphanExpiries > 0) {
    addDebrisLifecycleDiagnostics({ emergencyAirborneExpiries: emergencyOrphanExpiries });
  }
}

function enforceRigidDebrisBudget(): void {
  const rigidDebrisBodyBudget = getCurrentRigidDebrisBodyBudget();
  const candidates = getRigidDebrisBudgetCandidates();
  const overBudgetCount = candidates.length - rigidDebrisBodyBudget;
  if (overBudgetCount <= 0) return;

  // This rail protects the Rapier solver during extreme shard storms. It is
  // deliberately independent from the "Active Ground Debris Cap" slider so
  // break bursts can still spray outward before floor clutter is trimmed.
  const pressureCandidates = candidates
    .sort((left, right) => {
      if (left.grounded !== right.grounded) return left.grounded ? -1 : 1;
      if (left.toy.isSleeping !== right.toy.isSleeping) return left.toy.isSleeping ? -1 : 1;
      return right.distanceToCameraSq - left.distanceToCameraSq;
    });
  for (let index = 0; index < overBudgetCount; index += 1) {
    const candidate = pressureCandidates[index]?.toy;
    if (candidate) rigidDebris.demoteFragmentToVfx(candidate);
  }
  rigidDebrisStats = rigidDebris.getStats();
}

function enforceGroundDebrisBudget(): void {
  const candidates = getRigidDebrisBudgetCandidates()
    .filter((candidate) => (
      candidate.toy.isSleeping &&
      isGroundDebrisBudgetCleanupEligible(candidate.toy.age, candidate.grounded)
    ));
  const overBudgetCount = candidates.length - groundDebrisBudget;
  if (overBudgetCount <= 0) return;

  // The ground cap is an aftermath cleanup knob. Once shards touch support or
  // sleep and survive the burst grace window, trim the least useful floor
  // clutter first without affecting airborne burst silhouettes or the active
  // rigid-body safety budget.
  const cleanupCandidates = candidates
    .sort((left, right) => {
      const ageDifference = right.toy.age - left.toy.age;
      if (Math.abs(ageDifference) > 0.001) return ageDifference;
      if (left.toy.isSleeping !== right.toy.isSleeping) return left.toy.isSleeping ? -1 : 1;
      return right.distanceToCameraSq - left.distanceToCameraSq;
    });
  for (let index = 0; index < overBudgetCount; index += 1) {
    const candidate = cleanupCandidates[index]?.toy;
    if (candidate) expireGroundDebrisWithPoof(candidate);
  }
  pruneExpiredToys();
  rigidDebrisStats = rigidDebris.getStats();
}

function getRigidDebrisBudgetCandidates(): Array<{
  readonly toy: PhysicsToy;
  readonly grounded: boolean;
  readonly distanceToCameraSq: number;
}> {
  return toys
    .filter((toy) => (
      toy.isInstancedFragment &&
      toy.isRigidDebrisDriven &&
      !toy.isExpired
    ))
    .map((toy) => ({
      toy,
      grounded: isGroundDebrisCleanupGrounded(toy),
      distanceToCameraSq: toy.mesh.position.distanceToSquared(camera.position)
    }));
}

function getCurrentRigidDebrisBodyBudget(): number {
  const nominalBudget = getNominalRigidDebrisBodyBudget();
  if (debrisPerformancePressure.nominalRigidDebrisBodyBudget !== nominalBudget) {
    return getDebrisPressureEffectiveRigidDebrisBodyBudget(nominalBudget, debrisPerformancePressure.stress);
  }
  return debrisPerformancePressure.effectiveRigidDebrisBodyBudget;
}

function getNominalRigidDebrisBodyBudget(): number {
  return getEffectiveRigidDebrisBodyBudget(physicsObjectBudget);
}

function updateDebrisPressureGovernor(
  rawDelta: number,
  observedFps: number,
  partialMeshTriangles: number
): void {
  debrisPerformancePressure = updateDebrisPerformancePressureState(debrisPerformancePressure, {
    deltaSeconds: rawDelta,
    observedFps,
    nominalRigidDebrisBodyBudget: getNominalRigidDebrisBodyBudget(),
    activeRigidDebrisBodies: rigidDebrisStats.bodies,
    fragmentInstances: physicsFragmentInstancer.getStats().instances,
    partialMeshTriangles
  });
}

function updateGroundDebrisCleanup(delta: number): void {
  const lifetimeSeconds = getEffectiveGroundDebrisLifetimeSeconds(groundDebrisLifetimeSeconds);

  for (const toy of toys) {
    if (!toy?.isInstancedFragment || toy.isExpired) continue;
    const expiredByCleanup = toy.updateGroundDebrisCleanup(delta, lifetimeSeconds, isGroundDebrisCleanupGrounded(toy));
    if (expiredByCleanup) {
      debrisPoofRenderer.spawn(toy.mesh.position, toy.fragmentBlock);
    }
  }
}

function updateStuckDebrisCleanup(delta: number, activeWorld: VoxelWorld): void {
  const cleanupWorld = {
    isSolid: (x: number, y: number, z: number) => terrainAndRubbleCollisionWorld.isSolid(x, y, z),
    isPartialBlock: (x: number, y: number, z: number) => Boolean(activeWorld.getPartialBlock(x, y, z))
  };

  for (const toy of toys) {
    if (!toy?.isInstancedFragment || toy.isExpired) continue;
    if (debrisStuckCleanup.shouldExpire(toy, delta, cleanupWorld)) {
      expireGroundDebrisWithPoof(toy);
    }
  }
}

function expireGroundDebrisWithPoof(toy: PhysicsToy): void {
  if (toy.isExpired) return;

  debrisPoofRenderer.spawn(toy.mesh.position, toy.fragmentBlock);
  toy.expire();
}

function getGroundedDebrisCleanupCandidates(): PhysicsToy[] {
  return toys.filter((toy) => (
    toy.isInstancedFragment &&
    !toy.isExpired &&
    toy.isSleeping &&
    isGroundDebrisCleanupGrounded(toy)
  ));
}

function isGroundDebrisCleanupGrounded(toy: PhysicsToy): boolean {
  if (toy.isSleeping || toy.hadSupportContactLastUpdate) return true;

  const supportBounds = getGroundDebrisCleanupSupportBounds(toy);
  const supportHeight = terrainAndRubbleCollisionWorld.getSupportHeight?.(supportBounds);
  if (supportHeight !== null && supportHeight !== undefined) {
    const bottomY = toy.mesh.position.y - toy.radius;
    if (Math.abs(bottomY - supportHeight) <= 0.09) return true;
  }

  const bottomProbeY = Math.floor(toy.mesh.position.y - toy.radius - 0.04);
  const minX = Math.floor(toy.mesh.position.x - toy.radius);
  const maxX = Math.floor(toy.mesh.position.x + toy.radius);
  const minZ = Math.floor(toy.mesh.position.z - toy.radius);
  const maxZ = Math.floor(toy.mesh.position.z + toy.radius);
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      if (terrainAndRubbleCollisionWorld.isSolid(x, bottomProbeY, z)) return true;
    }
  }
  return false;
}

function getGroundDebrisCleanupSupportBounds(toy: PhysicsToy): CollisionBounds {
  const position = toy.mesh.position;
  return {
    minX: position.x - toy.radius,
    maxX: position.x + toy.radius,
    minY: position.y - toy.radius,
    maxY: position.y + toy.radius,
    minZ: position.z - toy.radius,
    maxZ: position.z + toy.radius
  };
}

function expireOrphanFragmentsForBudget(outsideBubbleOnly: boolean, allowAirborne: boolean): number {
  if (toys.length <= physicsObjectBudget) return 0;
  let expiredCount = 0;

  const candidates = toys
    .filter((toy) => (
      toy.isInstancedFragment &&
      !debrisSettler.owns(toy) &&
      !toy.isExpired &&
      (allowAirborne || isPressureCleanupSettledFragment(toy)) &&
      (!outsideBubbleOnly || isFragmentOutsideActiveDebrisBubble(toy))
    ))
    .sort((left, right) => (
      right.mesh.position.distanceToSquared(camera.position) -
      left.mesh.position.distanceToSquared(camera.position)
    ));

  for (const toy of candidates) {
    if (toys.length <= physicsObjectBudget) return expiredCount;

    const index = toys.indexOf(toy);
    if (index === -1) continue;
    expireGroundDebrisWithPoof(toy);
    removePhysicsToyAt(index);
    expiredCount += 1;
  }
  return expiredCount;
}

function isPressureCleanupSettledFragment(toy: PhysicsToy): boolean {
  return toy.isSleeping && isGroundDebrisCleanupGrounded(toy);
}

function countPressureProtectedAirborneFragments(): number {
  let protectedFragments = 0;
  for (const toy of toys) {
    if (!toy.isInstancedFragment || toy.isExpired) continue;
    if (debrisSettler.owns(toy) && !toy.isSleeping) {
      protectedFragments += 1;
      continue;
    }
    if (!debrisSettler.owns(toy) && !isPressureCleanupSettledFragment(toy)) {
      protectedFragments += 1;
    }
  }
  return protectedFragments;
}

function pruneOldestPhysicsCoresForBudget(): void {
  while (toys.length > physicsObjectBudget) {
    const coreIndex = toys.findIndex((toy) => !toy.isInstancedFragment);
    if (coreIndex === -1) return;
    removePhysicsToyAt(coreIndex);
  }
}

function isFragmentOutsideActiveDebrisBubble(toy: PhysicsToy): boolean {
  const activeRadius = Math.max(0, qualityController.preset.debrisActiveRadiusMeters) +
    DEBRIS_ACTIVE_RADIUS_BUFFER_METERS;
  return toy.mesh.position.distanceToSquared(camera.position) > activeRadius * activeRadius;
}

function emitRubbleBatchEvents(): void {
  const batches = debrisSettler.getFinalizedBatches();
  if (batches.length > 0) rigidDebris.invalidateStaticColliders();

  for (const batch of batches) {
    engineEvents.emit("rubble:formed", {
      position: batch.position,
      block: batch.block,
      pieces: batch.pieces
    });
  }
}

function emitRubbleDamageEvents(
  source: CombatLogSource = PHYSICS_CORE_COMBAT_SOURCE,
  action = "rubble damage"
): void {
  const events = rubbleField.consumeDamageEvents();
  emitRubbleSupportChangeEvents();
  recordRubbleCombatLog(source, action, events);

  for (const event of events) {
    engineEvents.emit("rubble:damaged", {
      position: {
        x: event.position.x,
        y: event.position.y,
        z: event.position.z
      },
      block: event.block,
      remainingHealth: event.remainingHealth,
      maxHealth: event.maxHealth,
      destroyed: event.destroyed,
      collateral: event.collateral
    });
    showRubbleDamageIndicator(event);
  }
}

function emitRubbleSupportChangeEvents(): void {
  const supportEvents = rubbleField.consumeSupportChangeEvents();
  if (supportEvents.length === 0) return;

  const changedTerrainCells: ChangedTerrainCell[] = [];
  const changedTerrainCellKeys = new Set<string>();
  for (const event of supportEvents) {
    collectTerrainSupportInvalidationCells(event.cell, changedTerrainCells, changedTerrainCellKeys);
  }
  invalidateDebrisSupportForEditedCells(changedTerrainCells);
}

function showBlockDamageIndicator(result: BlockDamageResult): void {
  if (!healthBarsEnabled) return;

  const blockCenter = new THREE.Vector3(
    result.position.x + 0.5,
    result.position.y + 1.18,
    result.position.z + 0.5
  );

  damageIndicators.show({
    id: `block:${result.position.x},${result.position.y},${result.position.z}`,
    position: blockCenter,
    remainingHealth: result.remainingHealth,
    maxHealth: result.maxHealth,
    destroyed: result.destroyed,
    label: formatDamageIndicatorLabel(result.remainingHealth, result.maxHealth)
  });
}

function showRubbleDamageIndicator(event: RubbleDamageEvent): void {
  if (!healthBarsEnabled) return;

  damageIndicators.show({
    id: `rubble:${event.cell.x},${event.cell.y},${event.cell.z}`,
    position: event.position,
    remainingHealth: event.remainingHealth,
    maxHealth: event.maxHealth,
    destroyed: event.destroyed,
    collateral: event.collateral,
    label: formatDamageIndicatorLabel(event.remainingHealth, event.maxHealth)
  });
}

function formatDamageIndicatorLabel(remainingHealth: number, maxHealth: number): string {
  return `${formatDamageValue(remainingHealth)} / ${formatDamageValue(maxHealth)}`;
}

function formatDamageValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (value < 0.1) return "0";
  return value.toFixed(1);
}

function pruneExpiredToys(): void {
  for (let index = toys.length - 1; index >= 0; index -= 1) {
    if (toys[index]?.isExpired) {
      removePhysicsToyAt(index);
    }
  }
}

function removePhysicsToyAt(index: number): void {
  const [removedToy] = toys.splice(index, 1);
  if (!removedToy) {
    return;
  }

  debrisSettler.forget(removedToy);
  physicsToyCollider.forget(removedToy);
  rigidDebris.forget(removedToy);
  physicsCoreTrail.forget(removedToy);
  if (!removedToy.isInstancedFragment) {
    scene.remove(removedToy.mesh);
  }
  removedToy.dispose();
}

async function refreshHomeWorldList(): Promise<void> {
  const refreshGeneration = homeWorldListRefreshGeneration + 1;
  homeWorldListRefreshGeneration = refreshGeneration;
  await renderHomeWorldList(
    requireWorldRegistry(),
    homeWorldList,
    loadWorld,
    openDeleteWorldDialog,
    { shouldCommit: () => refreshGeneration === homeWorldListRefreshGeneration }
  );
}

function getWorldSaveOriginLabel(): string {
  const origin = globalThis.location?.origin;
  return origin ? `Save slot: ${origin}` : "Save slot: this browser address";
}

async function createWorldFromForm(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (worldTransitioning) return;

  const registry = requireWorldRegistry();
  const worlds = await registry.listWorlds();
  const name = worldNameInput.value.trim() || `World ${worlds.length + 1}`;
  const seed = worldSeedInput.value.trim() || createReadableSeed();
  const terrainProfile = readSelectedWorldTerrainProfile();
  const savedWorld = await registry.createWorld(name, seed, terrainProfile);
  worldNameInput.value = "";
  worldSeedInput.value = "";
  await loadWorld(savedWorld.id);
}

function readSelectedWorldTerrainProfile(): TerrainProfile {
  const value = worldTypeSelect.value as TerrainProfile;
  return CREATE_WORLD_TERRAIN_PROFILES.has(value) ? value : DEFAULT_WORLD_TERRAIN_PROFILE;
}

async function createSuperflatWorld(): Promise<void> {
  if (worldTransitioning) return;

  testAvatar.stop();
  novaChatPanel.close();
  const registry = requireWorldRegistry();
  const worlds = await registry.listWorlds();
  const savedWorld = await registry.createWorld(`Superflat Lab ${worlds.length + 1}`, SUPERFLAT_WORLD_SEED);
  worldNameInput.value = "";
  worldSeedInput.value = "";
  if (inWorld) {
    await queueActivePlayerLocationSave(true);
    clearToys();
  }
  await loadWorld(savedWorld.id);
}

async function loadWorld(worldId: string): Promise<void> {
  if (worldTransitioning) return;
  worldTransitioning = true;

  try {
    const registry = requireWorldRegistry();
    const activeWorld = requireWorld();
    const activePlayer = requirePlayer();
    const activeWorldId = await registry.setActiveWorld(worldId);
    const savedWorld = await registry.getActiveWorld();
    const chunkStorage = await createStorageForSavedWorld(savedWorld);
    const savedLoadState = migrateSavedPlayerStateHeight(savedWorld);
    const loadOrigin = savedLoadState?.feetPosition ?? { x: 2, y: 0, z: 2 };
    const shouldPersistMigratedPlayerState = hasLegacyExpandedHeightPlayerState(savedWorld);

    // Loading from the home screen is the only place world slots swap into the active engine.
    await activeWorld.switchStorage(chunkStorage, scene, savedWorld.seed, savedWorld.terrainProfile);
    partialBlockMeshField.clear();
    clearPendingPartialBlockMeshJobs();
    renderedPartialBlockRevision = -1;
    lastPartialBlockMeshUpdateMs = 0;
    await activeWorld.preloadSavedChunksAround(
      loadOrigin.x,
      loadOrigin.z,
      qualityController.initialLoadRadius
    );
    activeWorld.ensureChunksAround(
      loadOrigin.x,
      loadOrigin.z,
      qualityController.initialLoadRadius
    );
    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    const loadState = savedLoadState ?? createDefaultPlayerLocation(activeWorld, 2, 2);
    placePlayerAtSavedLocation(activePlayer, activeWorld, loadState);
    camera.getWorldDirection(direction);
    novaPilot.setActive(true, camera.position, direction, activeWorld);
    lastSavedPlayerLocation = capturePlayerLocationSnapshot();
    nextPlayerLocationAutosaveAt = performance.now() + PLAYER_LOCATION_AUTOSAVE_MS;
    updateSunShadowAnchor();
    homeScreen.classList.add("is-hidden");
    pauseMenu.classList.add("is-hidden");
    document.body.classList.add("in-world");
    inWorld = true;
    engineEvents.emit("world:loaded", {
      worldId: activeWorldId,
      name: savedWorld.name,
      seed: savedWorld.seed
    });
    await combatLog.flushPersistent();
    combatLog.clear();
    debugHud.reset();
    minimapRenderer.reset();
    activePlayer.resume();
    if (shouldPersistMigratedPlayerState) {
      void queuePlayerLocationSave(loadState, true);
    }
    maybeStartTestAvatarFromUrl();
  } finally {
    worldTransitioning = false;
  }
}

function maybeStartTestAvatarFromUrl(): void {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    if (!params.has(TEST_AVATAR_QUERY_PARAM)) return;
    testAvatar.start();
  } catch {
    // URL parsing should never block a playable world.
  }
}

function openDeleteWorldDialog(savedWorld: SavedWorld): void {
  if (worldTransitioning) return;

  pendingWorldDeletion = savedWorld;
  deleteWorldName.textContent = savedWorld.name;
  deleteWorldCopy.textContent = createDeleteWorldDialogCopy(savedWorld);
  deleteWorldError.textContent = "";
  deleteWorldDialog.classList.remove("is-hidden");
  confirmDeleteWorldButton.focus();
}

function closeDeleteWorldDialog(): void {
  pendingWorldDeletion = null;
  deleteWorldDialog.classList.add("is-hidden");
  deleteWorldError.textContent = "";
}

async function confirmPendingWorldDeletion(): Promise<void> {
  const savedWorld = pendingWorldDeletion;
  if (!savedWorld || worldTransitioning) return;

  worldTransitioning = true;
  confirmDeleteWorldButton.disabled = true;
  cancelDeleteWorldButton.disabled = true;
  try {
    await requireWorld().flushStorageWrites();
    await requireWorldRegistry().deleteWorld(savedWorld.id);
    closeDeleteWorldDialog();
    await refreshHomeWorldList();
  } catch (error) {
    console.error("Could not delete saved world", error);
    deleteWorldError.textContent = "Could not delete that saved world. Your save list was left untouched.";
  } finally {
    confirmDeleteWorldButton.disabled = false;
    cancelDeleteWorldButton.disabled = false;
    worldTransitioning = false;
  }
}

async function exitToHome(): Promise<void> {
  if (worldTransitioning) return;
  worldTransitioning = true;
  clearPointerHoldState();

  try {
    // Leaving play unloads the active chunks first, so the next world starts from a clean scene.
    const activeWorld = requireWorld();
    await queueActivePlayerLocationSave(true);
    if (novaChatPanel.isOpen) {
      novaChatPanel.close();
    }
    testAvatar.stop();
    novaChatPanel.close();
    requirePlayer().pause(true);
    camera.getWorldDirection(direction);
    novaPilot.setActive(false, camera.position, direction, activeWorld);
    clearToys();
    await activeWorld.flushStorageWrites();
    activeWorld.disposeLoadedChunks(scene);
    partialBlockMeshField.clear();
    clearPendingPartialBlockMeshJobs();
    renderedPartialBlockRevision = -1;
    lastPartialBlockMeshUpdateMs = 0;
    inWorld = false;
    engineEvents.emit("world:exited", { worldId: null });
    document.body.classList.remove("in-world", "playing");
    pauseMenu.classList.add("is-hidden");
    homeScreen.classList.remove("is-hidden");
    await refreshHomeWorldList();
  } finally {
    worldTransitioning = false;
  }
}

function hasLegacyExpandedHeightPlayerState(savedWorld: SavedWorld): boolean {
  const playerState = savedWorld.playerState;
  return Boolean(
    playerState &&
    playerState.worldHeight < WORLD_HEIGHT &&
    getLegacyWorldHeightOffset(savedWorld.terrainProfile) > 0
  );
}

function createDefaultPlayerLocation(activeWorld: VoxelWorld, x: number, z: number): SavedPlayerStateSnapshot {
  return {
    feetPosition: {
      x,
      // Preserve the old "start a few meters over the terrain" feel while still
      // storing a stable physical player location instead of camera height.
      y: activeWorld.highestSolidY(x, z) + 5 - PLAYER_HEIGHT,
      z
    },
    yaw: 0,
    pitch: 0
  };
}

function placePlayerAtSavedLocation(
  activePlayer: PlayerController,
  activeWorld: VoxelWorld,
  loadState: SavedPlayerStateSnapshot
): void {
  activePlayer.teleportToFeetPosition(loadState.feetPosition, loadState.yaw, loadState.pitch);
  if (!activePlayer.collides()) return;

  // Saves should not become traps. If terrain edits somehow occupy the old
  // body space, keep the X/Z location but pop the player to a safe height above
  // that column instead of letting them reload inside voxels.
  const safeLocation = createDefaultPlayerLocation(
    activeWorld,
    loadState.feetPosition.x,
    loadState.feetPosition.z
  );
  activePlayer.teleportToFeetPosition(safeLocation.feetPosition, loadState.yaw, loadState.pitch);
}

function maybeAutosavePlayerLocation(now: number): void {
  if (now < nextPlayerLocationAutosaveAt) return;

  const snapshot = capturePlayerLocationSnapshot();
  if (!snapshot || !hasPlayerLocationMeaningfullyChanged(snapshot)) {
    nextPlayerLocationAutosaveAt = now + PLAYER_LOCATION_AUTOSAVE_MS;
    return;
  }

  nextPlayerLocationAutosaveAt = now + PLAYER_LOCATION_AUTOSAVE_MS;
  void queuePlayerLocationSave(snapshot, false);
}

function queueActivePlayerLocationSave(force = false): Promise<void> {
  const snapshot = capturePlayerLocationSnapshot();
  return snapshot ? queuePlayerLocationSave(snapshot, force) : Promise.resolve();
}

function queuePlayerLocationSave(snapshot: SavedPlayerStateSnapshot, force: boolean): Promise<void> {
  if (!force && !hasPlayerLocationMeaningfullyChanged(snapshot)) return Promise.resolve();

  const registry = worldRegistry;
  const activeWorld = world;
  if (!registry || !activeWorld) return Promise.resolve();

  const worldId = activeWorld.storage.worldId;
  lastSavedPlayerLocation = snapshot;
  playerLocationSaveChain = playerLocationSaveChain
    .catch(() => {
      // Keep the chain alive after a previous failure; the warning is emitted by
      // the failing write below where the original error is still available.
    })
    .then(async () => {
      await registry.updatePlayerState(worldId, snapshot);
    })
    .catch((error) => {
      console.warn("Could not persist player location", error);
    });

  return playerLocationSaveChain;
}

function capturePlayerLocationSnapshot(): SavedPlayerStateSnapshot | null {
  if (!inWorld || !player) return null;

  return {
    feetPosition: {
      x: roundPlayerLocationNumber(camera.position.x),
      y: roundPlayerLocationNumber(player.getFeetY()),
      z: roundPlayerLocationNumber(camera.position.z)
    },
    yaw: roundPlayerLocationNumber(player.yaw),
    pitch: roundPlayerLocationNumber(player.pitch)
  };
}

function hasPlayerLocationMeaningfullyChanged(snapshot: SavedPlayerStateSnapshot): boolean {
  const previous = lastSavedPlayerLocation;
  if (!previous) return true;

  const dx = snapshot.feetPosition.x - previous.feetPosition.x;
  const dy = snapshot.feetPosition.y - previous.feetPosition.y;
  const dz = snapshot.feetPosition.z - previous.feetPosition.z;
  const movedEnough = dx * dx + dy * dy + dz * dz >= PLAYER_LOCATION_POSITION_EPSILON ** 2;
  const lookedEnough = (
    Math.abs(snapshot.yaw - previous.yaw) >= PLAYER_LOCATION_LOOK_EPSILON ||
    Math.abs(snapshot.pitch - previous.pitch) >= PLAYER_LOCATION_LOOK_EPSILON
  );
  return movedEnough || lookedEnough;
}

function roundPlayerLocationNumber(value: number): number {
  return Math.round(value * PLAYER_LOCATION_SAVE_PRECISION) / PLAYER_LOCATION_SAVE_PRECISION;
}

function clearToys(): void {
  for (const toy of toys) {
    debrisSettler.forget(toy);
    physicsToyCollider.forget(toy);
    rigidDebris.forget(toy);
    physicsCoreTrail.forget(toy);
    if (!toy.isInstancedFragment) {
      scene.remove(toy.mesh);
    }
    toy.dispose();
  }
  toys.length = 0;
  damageIndicators.clear();
  debrisSettler.clear();
  rigidDebris.clear();
  debrisPoofRenderer.clear();
  // Full cleanup is allowed to be heavy-handed: release the high-water instanced
  // debris batches so long stress tests do not keep oversized GPU buffers alive.
  physicsFragmentInstancer.dispose();
  physicsCoreTrail.clear();
  hitscanBoltTracer.clear();
  rubbleField.clear();
}

function clearPhysicsCores(): void {
  let clearedCores = 0;
  for (let index = toys.length - 1; index >= 0; index -= 1) {
    const toy = toys[index];
    if (!toy || toy.isInstancedFragment || !toy.damagesBlocks) continue;

    // X is the quick cleanup key: remove the launched cores without erasing the
    // rubble piles or loose debris the player may be studying. Full cleanup is
    // intentionally tucked behind the Settings menu's Despawn All Objects button.
    removePhysicsToyAt(index);
    clearedCores += 1;
  }

  if (clearedCores > 0) {
    engineEvents.emit("physics:cores-cleared", { count: clearedCores });
  }
}

function updateSunShadowAnchor(): void {
  desiredShadowAnchor.set(camera.position.x, 0, camera.position.z);
  const anchor = qualityController.preset.shadows
    ? snapShadowAnchorToTexelGrid(
      desiredShadowAnchor,
      shadowBasis,
      getShadowTexelSize(qualityController.preset),
      stableShadowAnchor
    )
    : stableShadowAnchor.copy(desiredShadowAnchor);

  // Move the light and target together so the sun direction stays constant
  // while the orthographic shadow projection remains stable around the player.
  sunTarget.position.copy(anchor);
  sun.position.copy(anchor).add(SUN_OFFSET);
  sunTarget.updateMatrixWorld();
  sun.updateMatrixWorld();
}

function disposeRuntime(): void {
  if (runtimeDisposed) return;

  const activeWorld = world;
  runtimeDisposed = true;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  clearIdleHeartbeat();

  mainAbortController.abort();
  if (inWorld) {
    void queueActivePlayerLocationSave(true);
  }

  // The explicit teardown matters mostly in dev: Vite reloads and repeated
  // browser smoke navigations can otherwise leave old WebGL contexts alive in
  // Firefox's GPU process until the browser finally decides to clean house.
  codexPilot.dispose();
  visualTestRecorder.dispose();
  frameDiagnostics.dispose();
  player?.dispose();
  clearToys();
  void combatLog.flushPersistent();
  coreAimPreview.dispose();
  builderBrushPreview.dispose();
  physicsCoreTrail.dispose();
  hitscanBoltTracer.dispose();
  debrisPoofRenderer.dispose();
  rigidDebris.dispose();
  activeWorld?.dispose(scene);
  inWorld = false;
  gameAudio.dispose();
  novaPilotReactions.dispose();
  novaContext.dispose();
  novaPilot.dispose();
  testAvatar.dispose();
  targetBlockHighlighter.dispose();
  damageIndicators.dispose();
  clearPendingPartialBlockMeshJobs();
  partialBlockMeshField.dispose();
  workerPool.dispose();
  skybox.dispose();
  disposeWorldBlockMaterial(worldMaterial);
  disposeWorldBlockMaterial(partialBlockMaterial);
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
  document.body.classList.remove("in-world", "playing", "super-ultra-enabled");

  if (voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__ === disposeRuntime) {
    voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__ = undefined;
  }
  voxelRuntimeGlobal.__VOXEL_ADMIN__ = undefined;
  voxelRuntimeGlobal.__VOXEL_CODEX_PILOT__ = undefined;
  voxelRuntimeGlobal.__VOXEL_TEST_AVATAR__ = undefined;
  voxelRuntimeGlobal.__VOXEL_VISUAL_TEST__ = undefined;
  voxelRuntimeGlobal.__VOXEL_COMBAT_LOG__ = undefined;
}

voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__ = disposeRuntime;
(import.meta as ImportMeta & { readonly hot?: ViteHotContext }).hot?.dispose(disposeRuntime);

void startApp();

function getCombatLogPersistenceEndpoints(): readonly string[] {
  if (!isLocalBrowserRuntime()) return [];

  // Prefer the same-origin Vite middleware so normal `start.ps1` sessions write
  // combat JSONL without needing the separate 5174 receiver. Keep the receiver
  // as a fallback for preview/automation flows that already have it running.
  return [LOCAL_COMBAT_LOG_ENDPOINT, LOCAL_COMBAT_LOG_RECEIVER_ENDPOINT];
}

function createCombatLogPersistenceContext(): Record<string, unknown> {
  return {
    appVersion: APP_VERSION,
    href: window.location.href,
    userAgent: navigator.userAgent,
    worldId: world?.storage.worldId ?? null,
    inWorld,
    selectedItem: inWorld ? getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry) : null,
    quality: qualityController?.preset.label ?? null
  };
}

function isLocalBrowserRuntime(): boolean {
  const hostname = window.location.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}
