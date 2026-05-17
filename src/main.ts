import * as THREE from "three";
import changelogMarkdown from "../CHANGELOG.md?raw";
import packageManifest from "../package.json";
import "./style.css";
import {
  ADMIN_COMMAND_TOGGLE_KEY,
  isAdminCommandInput,
  runAdminCommand,
  type AdminCommandApi,
  type AdminCommandHooks
} from "./adminCommands";
import {
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  getTerrainImpactFragmentCount
} from "./blockFragments";
import { BLOCK, BLOCKS, PLACEABLE_BLOCKS, type BlockId } from "./blocks";
import {
  createChunkStorage,
  createWorldRegistry,
  type SavedPlayerStateSnapshot,
  type SavedWorld,
  type WorldRegistry
} from "./chunkStorage";
import { parseChangelogEntries, type ChangelogEntry } from "./changelog";
import {
  CodexPilot,
  type CodexPilotApi,
  type CodexPilotWeapon
} from "./codexPilot";
import type { CollisionBounds, CollisionWorld } from "./collision";
import { DamageIndicatorOverlay } from "./damageIndicators";
import { DebrisStuckCleanupTracker } from "./debrisCleanup";
import { createDeleteWorldDialogCopy } from "./deleteWorldDialog";
import { DebrisPoofRenderer } from "./debrisPoof";
import { createDebrisShapeForBlock, fitDebrisShapeToVolumeBudget } from "./debrisShapes";
import { PhysicsCoreAimPreview, predictPhysicsCoreTrajectory } from "./coreAimPreview";
import {
  DEBRIS_ACTIVE_RADIUS_BUFFER_METERS,
  DebrisSettler,
  createEmptyDebrisSettlerStats,
  type DebrisSettlerStats
} from "./debrisSettler";
import { DebugHud } from "./debugHud";
import { requireElement } from "./dom";
import { createEngineEventBus } from "./engineEvents";
import {
  IDLE_HEARTBEAT_MS,
  clampSimulationDelta,
  shouldHibernateAnimationLoop,
  shouldSkipExpensiveFrame
} from "./frameLoop";
import { createEmptyFrameTimings, smoothFrameTimings, type FrameTimings } from "./frameTimings";
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
  type ItemAction
} from "./items";
import { SUN_OFFSET } from "./lighting";
import { MinimapRenderer } from "./minimap";
import { createNovaChatReply, createNovaTerminalRoute, NOVA_CHAT_TOGGLE_KEY } from "./novaChat";
import { NovaChatPanel } from "./novaChatPanel";
import { NovaContextJournal } from "./novaContext";
import { NOVA_PILOT_THROW_KEY, NOVA_PILOT_TOGGLE_KEY, NovaPilot } from "./novaPilot";
import { NovaPilotReactions } from "./novaPilotReactions";
import { PARTIAL_BLOCK_CORE_DAMAGE, PartialBlockMeshField } from "./partialBlocks";
import {
  PerformanceHitchLog,
  type PerformanceHitchLogPass,
  type PerformanceHitchRecord
} from "./performanceHitchLog";
import { PlayerController } from "./player";
import { PLAYER_HEIGHT } from "./playerMovement";
import { formatPlayerSpeedMetersPerSecond, getPlayerSpeedMetersPerSecond } from "./playerSpeed";
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
  PHYSICS_CORE_SIZE_MAX_PERCENT,
  PHYSICS_CORE_SIZE_MIN_PERCENT,
  PHYSICS_CORE_SIZE_STEP_PERCENT,
  PHYSICS_CORE_VELOCITY_MAX_PERCENT,
  PHYSICS_CORE_VELOCITY_MIN_PERCENT,
  PHYSICS_CORE_VELOCITY_STEP_PERCENT,
  formatPhysicsCorePercent,
  getPhysicsCoreRadius,
  getPhysicsCoreVelocityMultiplier,
  normalizePhysicsCoreSettings,
  normalizePhysicsCoreSizePercent,
  normalizePhysicsCoreVelocityPercent,
  readPhysicsCoreSettingsPreference,
  writePhysicsCoreSettingsPreference,
  type PhysicsCoreSettings
} from "./physicsCoreSettings";
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
  normalizeGroundDebrisBudget,
  readGroundDebrisBudgetPreference,
  writeGroundDebrisBudgetPreference
} from "./rigidDebrisBudget";
import {
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
import { SUPERFLAT_WORLD_SEED } from "./terrain";
import {
  TEST_AVATAR_QUERY_PARAM,
  TEST_AVATAR_TOGGLE_KEY,
  TestAvatar,
  type TestAvatarApi
} from "./testAvatar";
import {
  VoxelWorld,
  type BlockDamageResult,
  type BlockPierceContinuation,
  type ChunkCoords,
  type DebrisEjectionHint,
  type WorldStats
} from "./world";
import { createReadableSeed, renderHomeWorldList } from "./worldMenu";

const BLOCK_INTERACTION_REACH = 8;
const APP_VERSION = packageManifest.version;
const CHANGELOG_ENTRIES = parseChangelogEntries(changelogMarkdown);
const TARGET_HIT_EPSILON = 0.0001;
const PHYSICS_CORE_SLEEP_SPEED = 0.12;
const PHYSICS_CORE_SLEEP_AFTER_SECONDS = 0.9;
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
const FRAME_SPIKE_EVENT_MS = 45;
const PLAYER_LOCATION_AUTOSAVE_MS = 5000;
const PLAYER_LOCATION_POSITION_EPSILON = 0.05;
const PLAYER_LOCATION_LOOK_EPSILON = 0.002;
const PLAYER_LOCATION_SAVE_PRECISION = 1000;
const CORE_AIM_PREVIEW_TOGGLE_KEY = "F6";
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
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const novaChatButton = requireElement<HTMLButtonElement>("#nova-chat-button");
const pauseSettingsPanel = requireElement<HTMLElement>("#pause-settings-panel");
const settingsGraphicsTab = requireElement<HTMLButtonElement>("#settings-tab-graphics");
const settingsGameplayTab = requireElement<HTMLButtonElement>("#settings-tab-gameplay");
const settingsGraphicsPanel = requireElement<HTMLElement>("#settings-graphics-panel");
const settingsGameplayPanel = requireElement<HTMLElement>("#settings-gameplay-panel");
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
const coreSizeSlider = requireElement<HTMLInputElement>("#core-size-slider");
const coreSizeValue = requireElement<HTMLElement>("#core-size-value");
const coreVelocitySlider = requireElement<HTMLInputElement>("#core-velocity-slider");
const coreVelocityValue = requireElement<HTMLElement>("#core-velocity-value");
const groundDebrisBudgetSlider = requireElement<HTMLInputElement>("#ground-debris-budget-slider");
const groundDebrisBudgetValue = requireElement<HTMLElement>("#ground-debris-budget-value");
const groundDebrisLifetimeSlider = requireElement<HTMLInputElement>("#ground-debris-lifetime-slider");
const groundDebrisLifetimeValue = requireElement<HTMLElement>("#ground-debris-lifetime-value");
const coreAimPreviewToggle = requireElement<HTMLInputElement>("#core-aim-preview-toggle");
const healthBarsToggle = requireElement<HTMLInputElement>("#health-bars-toggle");
const superUltraToggleRow = requireElement<HTMLElement>("#super-ultra-toggle-row");
const superUltraToggle = requireElement<HTMLInputElement>("#super-ultra-toggle");
const debugPanel = requireElement<HTMLElement>("#debug-panel");
const minimap = requireElement<HTMLCanvasElement>("#minimap");
const hudTitle = requireElement<HTMLElement>("#hud .title");
const playerSpeedReadout = requireElement<HTMLElement>("#player-speed-readout");
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb9d8);
const sceneFog = new THREE.Fog(0x8fb9d8, bootPreset.fogNear, bootPreset.fogFar);
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

const worldMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0.0
});

const targetBlockHighlighter = new TargetBlockHighlighter();
scene.add(targetBlockHighlighter.object);
const damageIndicators = new DamageIndicatorOverlay(damageIndicatorRoot);

let worldRegistry: WorldRegistry | null = null;
let world: VoxelWorld | null = null;
let player: PlayerController | null = null;
let inWorld = false;
let worldTransitioning = false;
let homeWorldListRefreshGeneration = 0;
let selectedHotbarIndex = 0;
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
let groundDebrisBudget = readGroundDebrisBudgetPreference();
let groundDebrisLifetimeSeconds = readGroundDebrisLifetimePreference();
let renderedPartialBlockRevision = -1;
let rightMouseButtonDown = false;
let coreAimPreviewEnabled = false;

const engineEvents = createEngineEventBus();
const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
const hotbarItems = createHotbarItems(PLACEABLE_BLOCKS);
const fallbackHotbarItem = createItemStack(EMPTY_HANDS_ITEM_ID);
const novaContext = new NovaContextJournal(engineEvents);
const performanceHitchLog = new PerformanceHitchLog();
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
type SettingsCategory = "graphics" | "gameplay";
const physicsToyCollider = new PhysicsToyCollider();
const physicsFragmentInstancer = new PhysicsFragmentInstancer(scene);
const coreAimPreview = new PhysicsCoreAimPreview(scene);
const hitscanBoltTracer = new HitscanBoltTracer(scene);
const debrisPoofRenderer = new DebrisPoofRenderer(scene);
const debrisStuckCleanup = new DebrisStuckCleanupTracker();
const partialBlockMeshField = new PartialBlockMeshField(scene);
const rubbleField = new RubbleField(scene);
const debrisSettler = new DebrisSettler();
const rigidDebris = new RigidDebrisSimulation();
const HEALTH_BARS_STORAGE_KEY = "voxel-sandbox-health-bars-enabled";
const CORE_AIM_PREVIEW_STORAGE_KEY = "voxel-sandbox-core-aim-preview-enabled";
const terrainAndRubbleCollisionWorld: CollisionWorld = {
  // Full terrain blocks still come from VoxelWorld. Partial-height terrain
  // scars and rubble are layered in through the optional support-height query
  // so feet, loose debris, and rigid debris can treat them as walkable/contact
  // surfaces without promoting every patch to a solid voxel.
  isSolid: (x, y, z) => requireWorld().isSolid(x, y, z),
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
const novaChatPanel = new NovaChatPanel({
  root: novaChatRoot,
  log: novaChatLog,
  form: novaChatForm,
  input: novaChatInput,
  closeButton: novaChatCloseButton,
  routeInput: (message) => createNovaTerminalRoute(message, {
    getChatReply: (chatMessage) => createNovaChatReply(chatMessage, novaContext.snapshot()),
    runCommand: (command) => runAdminCommand(adminCommandHooks, command),
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
const codexPilot = new CodexPilot({
  isWorldActive: () => inWorld,
  getWorld: requireWorld,
  getPlayer: requirePlayer,
  getCamera: () => camera,
  getSelectedItemLabel: () => getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry),
  runAdminCommand: (command) => runAdminCommand(adminCommandHooks, command),
  createSuperflatWorld,
  selectWeapon: selectCodexPilotWeapon,
  fireSelectedPrimary: () => useSelectedHotbarPrimaryAction(requirePlayer()),
  setAdsActive: (active) => {
    rightMouseButtonDown = active;
  },
  resumePlayer: () => requirePlayer().resume(),
  startHitchPass: (label) => performanceHitchLog.startPass(label),
  getRecentHitches: () => performanceHitchLog.getRecent(),
  noteActivity: noteUserActivity
});
voxelRuntimeGlobal.__VOXEL_ADMIN__ = {
  run: (command) => runAdminCommand(adminCommandHooks, command)
};
voxelRuntimeGlobal.__VOXEL_CODEX_PILOT__ = codexPilot.api;
voxelRuntimeGlobal.__VOXEL_TEST_AVATAR__ = testAvatar.api;
voxelRuntimeGlobal.__VOXEL_HITCHES__ = () => performanceHitchLog.getRecent();
voxelRuntimeGlobal.__VOXEL_HITCH_PASS__ = () => performanceHitchLog.getPass();
voxelRuntimeGlobal.__VOXEL_HITCH_START_PASS__ = (label?: string) => performanceHitchLog.startPass(label);
let physicsCollisionStats: PhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();
let debrisSettlerStats: DebrisSettlerStats = createEmptyDebrisSettlerStats();
let rigidDebrisStats: RigidDebrisStats = createEmptyRigidDebrisStats();
let smoothedFrameTimings = createEmptyFrameTimings();
let frameTimingsInitialized = false;
let healthBarsEnabled = readHealthBarsEnabled();
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
updatePhysicsCoreControls();
updateGroundDebrisBudgetControls();
syncHealthBarsToggle();
syncCoreAimPreviewToggle();

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

async function startApp(): Promise<void> {
  try {
    worldRegistry = await createWorldRegistry();
    const initialWorld = await worldRegistry.getActiveWorld();
    world = new VoxelWorld({
      storage: await createChunkStorage(initialWorld.id),
      seed: initialWorld.seed
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
      rightMouseButtonDown = false;
      void queueActivePlayerLocationSave(true);
    }
    if (!paused) setSettingsPanelOpen(false);
  };

  pauseMenu.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, input, label, select, .settings-panel")) return;
    event.preventDefault();
    resumeFromPause();
  }, eventListenerOptions);
  resumeButton.addEventListener("click", resumeFromPause, eventListenerOptions);
  settingsButton.addEventListener("click", () => {
    setSettingsPanelOpen(pauseSettingsPanel.hidden);
  }, eventListenerOptions);
  settingsGraphicsTab.addEventListener("click", () => {
    setSettingsCategory("graphics");
  }, eventListenerOptions);
  settingsGameplayTab.addEventListener("click", () => {
    setSettingsCategory("gameplay");
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
  coreSizeSlider.addEventListener("input", () => {
    setPhysicsCoreSizePercent(coreSizeSlider.value);
  }, eventListenerOptions);
  coreVelocitySlider.addEventListener("input", () => {
    setPhysicsCoreVelocityPercent(coreVelocitySlider.value);
  }, eventListenerOptions);
  groundDebrisBudgetSlider.addEventListener("input", () => {
    setGroundDebrisBudget(groundDebrisBudgetSlider.value);
  }, eventListenerOptions);
  groundDebrisLifetimeSlider.addEventListener("input", () => {
    setGroundDebrisLifetime(groundDebrisLifetimeSlider.value);
  }, eventListenerOptions);
  coreAimPreviewToggle.addEventListener("change", () => {
    setCoreAimPreviewEnabled(coreAimPreviewToggle.checked);
  }, eventListenerOptions);
  healthBarsToggle.addEventListener("change", () => {
    setHealthBarsEnabled(healthBarsToggle.checked);
  }, eventListenerOptions);
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
  setSettingsPanelOpen(false);
  requirePlayer().resume();
}

function openNovaChat(): void {
  if (!inWorld) return;
  novaChatPanel.open();
}

function openNovaChatInputMode(): void {
  // Chat is an in-world overlay rather than a pause-menu panel. Suspend only
  // movement/look so the player can type, then restore pointer lock on close.
  setSettingsPanelOpen(false);
  pauseMenu.classList.add("is-hidden");
  requirePlayer().suspendForTextInput();
}

function closeNovaChatInputMode(): void {
  if (!inWorld) return;
  rightMouseButtonDown = false;
  requirePlayer().resume();
}

function setSettingsPanelOpen(open: boolean): void {
  pauseSettingsPanel.hidden = !open;
  settingsButton.setAttribute("aria-expanded", String(open));
  settingsButton.classList.toggle("is-active", open);
  settingsButton.textContent = open ? "Back" : "Settings";

  // Treat settings like a sub-menu: while tuning, hide the main pause actions
  // so "Exit to Home" is not sitting next to throwaway slider experiments.
  for (const action of document.querySelectorAll<HTMLElement>(".menu-main-action")) {
    action.classList.toggle("is-hidden", open);
  }
}

function setSettingsCategory(category: SettingsCategory): void {
  const showGraphics = category === "graphics";
  settingsGraphicsPanel.hidden = !showGraphics;
  settingsGameplayPanel.hidden = showGraphics;
  settingsGraphicsTab.classList.toggle("is-active", showGraphics);
  settingsGameplayTab.classList.toggle("is-active", !showGraphics);
  settingsGraphicsTab.setAttribute("aria-selected", String(showGraphics));
  settingsGameplayTab.setAttribute("aria-selected", String(!showGraphics));
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

function setCoreAimPreviewEnabled(enabled: boolean): void {
  coreAimPreviewEnabled = enabled;
  syncCoreAimPreviewToggle();
  writeCoreAimPreviewEnabled(enabled);
  if (!enabled) coreAimPreview.hide();
}

function syncCoreAimPreviewToggle(): void {
  coreAimPreviewToggle.checked = coreAimPreviewEnabled;
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

  if (event.code === NOVA_PILOT_TOGGLE_KEY && !event.repeat) {
    event.preventDefault();
    camera.getWorldDirection(direction);
    const active = novaPilot.toggle(camera.position, direction, requireWorld());
    engineEvents.emit("nova:toggled", { active });
    updateHud();
    return;
  }

  const requestedHotbarIndex = getHotbarIndexFromDigitCode(event.code);
  if (requestedHotbarIndex !== null && requestedHotbarIndex < hotbarItems.length) {
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
document.addEventListener("pointerdown", noteUserActivity, eventListenerOptions);
document.addEventListener("pointermove", noteUserActivity, eventListenerOptions);
document.addEventListener("mousemove", noteUserActivity, eventListenerOptions);

document.addEventListener("visibilitychange", () => {
  noteUserActivity();
  drainFrameClockAfterIdle();
  if (document.hidden) {
    rightMouseButtonDown = false;
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
  rightMouseButtonDown = false;
  void queueActivePlayerLocationSave(true);
  enterIdleHeartbeat();
}, eventListenerOptions);
window.addEventListener("blur", () => {
  rightMouseButtonDown = false;
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
    rightMouseButtonDown = (event.buttons & 2) !== 0;
    useSelectedHotbarPrimaryAction(activePlayer);
    return;
  }

  if (event.button === 2) {
    rightMouseButtonDown = true;
    useSelectedHotbarSecondaryAction(activePlayer);
  }
}, eventListenerOptions);
document.addEventListener("mouseup", (event) => {
  if (event.button === 2) {
    rightMouseButtonDown = false;
  }
}, eventListenerOptions);
document.addEventListener("pointercancel", () => {
  rightMouseButtonDown = false;
}, eventListenerOptions);
renderer.domElement.addEventListener("wheel", (event) => {
  noteUserActivity();
  if (!inWorld) return;

  const direction = getHotbarScrollDirection(event.deltaY);
  if (direction === null) return;

  event.preventDefault();
  selectHotbarIndex(stepHotbarIndex(selectedHotbarIndex, direction, hotbarItems.length));
}, wheelListenerOptions);

function useSelectedHotbarPrimaryAction(activePlayer: PlayerController): void {
  useSelectedHotbarAction(activePlayer, getHotbarPrimaryAction(getSelectedHotbarItem(), itemRegistry));
}

function useSelectedHotbarSecondaryAction(activePlayer: PlayerController): void {
  useSelectedHotbarAction(activePlayer, getHotbarSecondaryAction(getSelectedHotbarItem(), itemRegistry));
}

function useSelectedHotbarAction(activePlayer: PlayerController, action: ItemAction): void {
  // Mouse buttons dispatch item actions now, not hard-coded hotbar kinds. That
  // is the seam future FPS weapons, dungeon tools, or RTS commands can share.
  switch (action.kind) {
    case "none":
      return;
    case "terrain:destroy-block":
      destroyTargetBlock();
      return;
    case "terrain:place-block":
      placeSelectedBlock(activePlayer, action.block);
      return;
    case "physics:throw-core":
      if (activePlayer.isLooking()) throwPlayerCore(activePlayer);
      return;
    case "physics:fire-hitscan-core":
      if (activePlayer.isLooking()) firePlayerHitscanCore();
      return;
  }
}

function destroyTargetBlock(): void {
  const hit = getTargetHit();
  if (!hit) return;

  if (hit.source === "rubble") {
    damageTargetedRubbleCell(hit.block);
    return;
  }

  requireWorld().setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
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
}

function damageTargetedRubbleCell(cell: VoxelRaycastHit["block"]): void {
  // The rubble proxy is intentionally cheaper than real per-cube collision, but
  // once the player is targeting its occupied cell the normal destroy action
  // should hit that destructible cover instead of silently editing terrain
  // behind it.
  const cellCenter = new THREE.Vector3(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
  rubbleField.damageNearest(cellCenter, PHYSICS_CORE_BLOCK_DAMAGE, 0.9);
  emitRubbleDamageEvents();
}

function animate(): void {
  if (runtimeDisposed) return;
  animationFrameId = null;

  const frameStartedAt = performance.now();
  const rawDelta = clock.getDelta();
  if (shouldSkipExpensiveFrame(document.hidden, rawDelta)) {
    resetFrameMetersAfterIdle();
    scheduleNextFrame();
    return;
  }

  const delta = clampSimulationDelta(rawDelta);
  const frameTimingSample = createEmptyFrameTimings();
  let timingSectionStartedAt = frameStartedAt;
  let debugPlayerChunk: ChunkCoords | null = null;
  let debugWorldStats: WorldStats | null = null;
  let debugRubbleStats: RubbleFieldStats | null = null;
  let debugMinimapMs = minimapRenderer.lastUpdateMs;

  const recordTimingSection = (section: FrameTimingSection): void => {
    const now = performance.now();
    frameTimingSample[section] += now - timingSectionStartedAt;
    timingSectionStartedAt = now;
  };

  if (inWorld) {
    const activeWorld = requireWorld();
    const activePlayer = requirePlayer();

    activePlayer.update(delta);
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
      qualityController.loadRadius,
      qualityController.unloadRadius,
      qualityController.chunkLoadBudget,
      chunkStreamDirection,
      chunkStreamFrustum
    );
    recordTimingSection("chunkMs");

    physicsImpacts.length = 0;
    damagedBlockKeysThisFrame.clear();
    const physicsToyCountAtFrameStart = toys.length;
    for (let index = 0; index < physicsToyCountAtFrameStart; index += 1) {
      const toy = toys[index];
      if (!toy) continue;
      const terrainImpactStartIndex = physicsImpacts.length;
      toy.update(delta, terrainAndRubbleCollisionWorld, physicsImpacts);

      // Terrain impacts are projectile-spending events. Handle them before the
      // same core gets a rubble collision pass; otherwise one shot can remove a
      // voxel and also chew up an adjacent rubble pile while the impact is still
      // waiting in the frame buffer.
      processPhysicsImpacts(activeWorld, terrainImpactStartIndex, physicsImpacts.length, damagedBlockKeysThisFrame);
      if (!toy.isExpired) {
        rubbleField.resolveCoreCollision(toy);
      }
    }
    emitRubbleDamageEvents();
    rigidDebrisStats = rigidDebris.update(delta, terrainAndRubbleCollisionWorld);
    debrisSettlerStats = debrisSettler.update(delta, rubbleField, {
      activeCenter: camera.position,
      activeRadius: qualityController.preset.debrisActiveRadiusMeters,
      finalizationMode: "vfx"
    });
    enforceRigidDebrisBudget();
    enforcePhysicsToyBudget();
    updateGroundDebrisCleanup(delta);
    updateStuckDebrisCleanup(delta, activeWorld);
    debrisSettlerStats = debrisSettler.getStats();
    emitRubbleBatchEvents();
    physicsCollisionStats = physicsToyCollider.resolve(toys);
    rigidDebris.syncToyStatesToBodies();
    rubbleField.settle(activeWorld);
    pruneExpiredToys();
    physicsFragmentInstancer.update(toys);
    hitscanBoltTracer.update(delta);
    debrisPoofRenderer.update(delta);
    recordTimingSection("physicsMs");

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    updatePartialBlockMesh(activeWorld);
    recordTimingSection("meshMs");
    debugRubbleStats = rubbleField.getStats();
    updateHud();
    updateNovaContextTelemetry(activePlayer, debugRubbleStats);
    updateTargetBlockHighlighter();
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
  frameTimingSample.renderMs = performance.now() - renderStartedAt;
  frameTimingSample.frameMs = performance.now() - frameStartedAt;
  if (inWorld && frameTimingSample.frameMs >= FRAME_SPIKE_EVENT_MS) {
    const diagnosis = performanceHitchLog.record({
      frameMs: frameTimingSample.frameMs,
      timings: frameTimingSample,
      stats: {
        qualityLabel: qualityController.preset.label,
        physicsObjectCount: toys.length,
        physicsObjectBudget,
        rigidDebrisBodyBudget: getCurrentRigidDebrisBodyBudget(),
        world: debugWorldStats ?? requireWorld().getStats(),
        physics: physicsCollisionStats,
        rigidDebris: rigidDebrisStats,
        fragmentRender: physicsFragmentInstancer.getStats(),
        debrisSettler: debrisSettlerStats,
        rubble: debugRubbleStats ?? rubbleField.getStats()
      }
    });
    engineEvents.emit("performance:frame-spike", {
      frameMs: frameTimingSample.frameMs,
      timings: frameTimingSample,
      diagnosis
    });
  }
  smoothedFrameTimings = smoothFrameTimings(
    smoothedFrameTimings,
    frameTimingSample,
    frameTimingsInitialized
  );
  frameTimingsInitialized = true;

  if (inWorld && debugPlayerChunk && debugWorldStats && debugRubbleStats) {
    debugHud.update(
      rawDelta,
      debugPlayerChunk,
      debugWorldStats,
      debugMinimapMs,
      toys.length,
      physicsObjectBudget,
      physicsCollisionStats,
      rigidDebrisStats,
      getCurrentRigidDebrisBodyBudget(),
      physicsFragmentInstancer.getStats(),
      debrisSettlerStats,
      debugRubbleStats,
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
  if (world.hasPendingRuntimeWork()) return true;
  if (debrisSettlerStats.activeFragments > 0) return true;

  for (const toy of toys) {
    if (!toy.isExpired && !toy.isSleeping) return true;
  }
  return false;
}

function resetFrameMetersAfterIdle(): void {
  // Long background gaps should not pollute the HUD's smoothing window or force
  // the minimap to resume halfway through an old slice.
  smoothedFrameTimings = createEmptyFrameTimings();
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
  const activePlayer = requirePlayer();
  const movementMode = activePlayer.movementMode;
  const modeSuffix = movementMode === "walk" ? "" : ` | ${movementMode}`;
  const novaSuffix = novaPilot.active ? " | Nova" : "";
  const selectedLabel = getHotbarItemLabel(getSelectedHotbarItem(), itemRegistry);
  hudTitle.textContent = `Voxel Sandbox Engine | ${selectedLabel}${modeSuffix}${novaSuffix}`;
  playerSpeedReadout.textContent = `Speed ${formatPlayerSpeedMetersPerSecond(activePlayer.velocity)}`;
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

function getSelectedHotbarItem(): HotbarItem {
  return hotbarItems[normalizeHotbarIndex(selectedHotbarIndex, hotbarItems.length)] ?? fallbackHotbarItem;
}

function selectHotbarIndex(index: number): void {
  selectedHotbarIndex = normalizeHotbarIndex(index, hotbarItems.length);
  const selectedItem = getSelectedHotbarItem();
  const selectedLabel = getHotbarItemLabel(selectedItem, itemRegistry);

  engineEvents.emit("item:selected", {
    itemId: selectedItem.itemId,
    name: selectedLabel,
    category: getHotbarItemCategory(selectedItem, itemRegistry),
    slotIndex: selectedHotbarIndex
  });

  const secondaryAction = getHotbarSecondaryAction(selectedItem, itemRegistry);
  if (secondaryAction.kind === "terrain:place-block") {
    engineEvents.emit("palette:selected", {
      block: secondaryAction.block,
      name: BLOCKS[secondaryAction.block].name
    });
  }

  updateHud();
}

function selectCodexPilotWeapon(weapon: CodexPilotWeapon): boolean {
  if (weapon === "selected") return true;

  const targetIndex = hotbarItems.findIndex((item) => {
    const primaryAction = getHotbarPrimaryAction(item, itemRegistry);
    if (weapon === "physics-core") return primaryAction.kind === "physics:throw-core";
    if (weapon === "hitscan-core") return primaryAction.kind === "physics:fire-hitscan-core";
    return false;
  });

  if (targetIndex < 0) return false;
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

function getTargetHit(): TargetHit | null {
  if (!inWorld) return null;
  if (!requirePlayer().isLooking()) return null;

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

function updateTargetBlockHighlighter(): void {
  const hit = getTargetHit();

  if (!hit) {
    targetBlockHighlighter.hide();
    return;
  }

  targetBlockHighlighter.showBlock(hit.block, hit.kind);
}

function updateCoreAimPreview(activeWorld: VoxelWorld, activePlayer: PlayerController): void {
  const selectedItem = getSelectedHotbarItem();
  if (
    !coreAimPreviewEnabled ||
    !activePlayer.isLooking() ||
    !canThrowCoreWithHotbarItem(selectedItem, itemRegistry)
  ) {
    coreAimPreview.hide();
    return;
  }

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

function updatePartialBlockMesh(activeWorld: VoxelWorld): void {
  const revision = activeWorld.getPartialBlockGeometryRevision();
  if (revision === renderedPartialBlockRevision) return;

  partialBlockMeshField.update(
    activeWorld.getPartialBlocks(),
    (cell, normal) => activeWorld.shouldRenderPartialBlockFace(cell, normal)
  );
  renderedPartialBlockRevision = revision;
}

function handlePhysicsImpact(
  activeWorld: VoxelWorld,
  impact: PhysicsImpact,
  damagedBlocksThisFrame: Set<string>
): boolean {
  if (impact.source.isExpired) return false;
  const result = applyCoreTerrainImpact(activeWorld, impact, damagedBlocksThisFrame);
  if (!result) return false;

  const pierceContinuation = result.pierceContinuation;
  if (pierceContinuation) {
    continuePhysicsCoreAfterPierce(impact.source, pierceContinuation);
  } else {
    // Most terrain impacts still spend the projectile on the terrain event.
    // Small fast cores are the one exception: a complete bite-lattice tunnel
    // can hand back an exit pose and reduced forward speed.
    impact.source.expire();
  }

  return Boolean(pierceContinuation);
}

function applyCoreTerrainImpact(
  activeWorld: VoxelWorld,
  impact: CoreTerrainImpact,
  damagedBlocksThisFrame: Set<string>
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

  for (const result of brushResult.results) {
    damagedBlocksThisFrame.add(activeWorld.damageKey(result.position.x, result.position.y, result.position.z));

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
        ejectionHint: result.debrisEjectionHint
      });
    }

    if (result.destroyed) {
      engineEvents.emit("block:destroyed", {
        position: result.position,
        block: result.block,
        impactSpeed: impact.speed,
        fragmentCount: spawnedFragmentCount
      });
    }
  }

  return brushResult;
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
  impact: CoreTerrainImpact,
  options: {
    readonly fragmentCount: number;
    readonly materialUnits: number;
    readonly chipOnly?: boolean;
    readonly ejectionHint?: DebrisEjectionHint;
  }
): number {
  const fragmentBaseSpeed = Math.min(FRAGMENT_IMPACT_SPEED_CAP, impact.speed * FRAGMENT_IMPACT_SPEED_SCALE);
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
      FRAGMENT_SCATTER_SPEED_MIN + Math.random() * FRAGMENT_SCATTER_SPEED_RANGE
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
      .add(new THREE.Vector3(0, FRAGMENT_UPWARD_SPEED_MIN + Math.random() * FRAGMENT_UPWARD_SPEED_RANGE, 0));
    const rubbleMaterialUnits = getBlockFragmentMaterialUnits(index, requestedFragmentCount, options.materialUnits);
    const candidateDebrisShape = createDebrisShapeForBlock(block, {
      fragmentIndex: index,
      distributedFragmentIndex: fragmentGridIndex,
      origin: position
    });
    const debrisShape = fitDebrisShapeToVolumeBudget(candidateDebrisShape, remainingVisualVolumeBudget);
    if (!debrisShape) continue;

    const fragment = PhysicsToy.createBlockFragment(
      block,
      getDebrisFragmentSpawnPosition(blockCenter, offset, spawnJitter, options.ejectionHint, index),
      velocity,
      rubbleMaterialUnits,
      debrisShape
    );
    addPhysicsToy(fragment);
    rigidDebris.registerFragment(fragment);
    fragments.push(fragment);
    remainingVisualVolumeBudget = Math.max(0, remainingVisualVolumeBudget - debrisShape.estimatedVisualVolume);
  }

  rigidDebris.invalidateStaticColliders();
  if (fragments.length > 0) {
    debrisSettler.registerFracture(block, blockCenter, fragments);
  }
  return fragments.length;
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
      damageTargetedRubbleCell(rubbleHit.cell);
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
    }, damagedBlocksForShot);

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
  hitscanBoltTracer.spawn(visualStart, visualEnd);
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
  return new PhysicsToy(position, velocity, {
    // Thrown cores are the expensive, gameplay-relevant actors. Keep their
    // damage/collision behavior while moving, then let them sleep after
    // settling so old shots stop taxing the frame forever.
    radius: getPhysicsCoreRadius(physicsCoreSettings),
    sleepSpeed: PHYSICS_CORE_SLEEP_SPEED,
    sleepAfterSeconds: PHYSICS_CORE_SLEEP_AFTER_SECONDS
  });
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

function updatePhysicsCoreSettings(settings: PhysicsCoreSettings): void {
  physicsCoreSettings = normalizePhysicsCoreSettings(settings, physicsCoreSettings);
  writePhysicsCoreSettingsPreference(physicsCoreSettings);
  updatePhysicsCoreControls();
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
}

function setGroundDebrisBudget(nextBudget: unknown): void {
  groundDebrisBudget = normalizeGroundDebrisBudget(nextBudget, groundDebrisBudget);
  writeGroundDebrisBudgetPreference(groundDebrisBudget);
  updateGroundDebrisBudgetControls();
  enforceRigidDebrisBudget();
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
  writeGroundDebrisLifetimePreference(groundDebrisLifetimeSeconds);
  updateGroundDebrisLifetimeControls();
}

function updateGroundDebrisLifetimeControls(): void {
  groundDebrisLifetimeSlider.min = String(MIN_GROUND_DEBRIS_LIFETIME_SECONDS);
  groundDebrisLifetimeSlider.max = String(MAX_GROUND_DEBRIS_LIFETIME_SECONDS);
  groundDebrisLifetimeSlider.step = String(GROUND_DEBRIS_LIFETIME_STEP_SECONDS);
  groundDebrisLifetimeSlider.value = String(groundDebrisLifetimeSeconds);
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
  // bite lattice, so pressure relief should drop shard theater instead of
  // baking surprise cover piles into the world.
  debrisSettler.discardRegionsForPressure(camera.position, overBudgetCount);
  pruneExpiredToys();
  expireOrphanFragmentsForBudget(true);
  expireOrphanFragmentsForBudget(false);
  pruneOldestPhysicsCoresForBudget();
}

function enforceRigidDebrisBudget(): void {
  const rigidDebrisBodyBudget = getCurrentRigidDebrisBodyBudget();
  const groundedCandidates = getGroundedDebrisCleanupCandidates();
  const overBudgetCount = groundedCandidates.length - rigidDebrisBodyBudget;
  if (overBudgetCount <= 0) return;

  // The ground-debris slider is a visual/CPU pressure valve, not a gameplay
  // material signal. Let the explosion happen, then drop ground clutter after
  // first terrain/rubble contact instead of suppressing the burst.
  const pressureCandidates = groundedCandidates
    .sort((left, right) => {
      if (left.isSleeping !== right.isSleeping) return left.isSleeping ? -1 : 1;
      return right.mesh.position.distanceToSquared(camera.position) -
        left.mesh.position.distanceToSquared(camera.position);
    });
  for (let index = 0; index < overBudgetCount; index += 1) {
    const candidate = pressureCandidates[index];
    if (candidate) expireGroundDebrisWithPoof(candidate);
  }
  pruneExpiredToys();
  rigidDebrisStats = rigidDebris.getStats();
}

function getCurrentRigidDebrisBodyBudget(): number {
  return getEffectiveRigidDebrisBodyBudget(physicsObjectBudget, groundDebrisBudget);
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

function expireOrphanFragmentsForBudget(outsideBubbleOnly: boolean): void {
  if (toys.length <= physicsObjectBudget) return;

  const candidates = toys
    .filter((toy) => (
      toy.isInstancedFragment &&
      !debrisSettler.owns(toy) &&
      !toy.isExpired &&
      (!outsideBubbleOnly || isFragmentOutsideActiveDebrisBubble(toy))
    ))
    .sort((left, right) => (
      right.mesh.position.distanceToSquared(camera.position) -
      left.mesh.position.distanceToSquared(camera.position)
    ));

  for (const toy of candidates) {
    if (toys.length <= physicsObjectBudget) return;

    const index = toys.indexOf(toy);
    if (index === -1) continue;
    expireGroundDebrisWithPoof(toy);
    removePhysicsToyAt(index);
  }
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

function emitRubbleDamageEvents(): void {
  const events = rubbleField.consumeDamageEvents();
  if (events.some((event) => event.destroyed)) rigidDebris.invalidateStaticColliders();

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
  const savedWorld = await registry.createWorld(name, seed);
  worldNameInput.value = "";
  worldSeedInput.value = "";
  await loadWorld(savedWorld.id);
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
    const chunkStorage = await createChunkStorage(activeWorldId);
    const loadOrigin = savedWorld.playerState?.feetPosition ?? { x: 2, z: 2 };

    // Loading from the home screen is the only place world slots swap into the active engine.
    await activeWorld.switchStorage(chunkStorage, scene, savedWorld.seed);
    partialBlockMeshField.clear();
    renderedPartialBlockRevision = -1;
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
    const loadState = createPlayerLoadState(activeWorld, savedWorld);
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
    debugHud.reset();
    minimapRenderer.reset();
    activePlayer.resume();
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
  rightMouseButtonDown = false;

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
    renderedPartialBlockRevision = -1;
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

function createPlayerLoadState(activeWorld: VoxelWorld, savedWorld: SavedWorld): SavedPlayerStateSnapshot {
  return savedWorld.playerState ?? createDefaultPlayerLocation(activeWorld, 2, 2);
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
  player?.dispose();
  clearToys();
  coreAimPreview.dispose();
  hitscanBoltTracer.dispose();
  debrisPoofRenderer.dispose();
  rigidDebris.dispose();
  activeWorld?.dispose(scene);
  inWorld = false;
  novaPilotReactions.dispose();
  novaContext.dispose();
  novaPilot.dispose();
  testAvatar.dispose();
  targetBlockHighlighter.dispose();
  damageIndicators.dispose();
  partialBlockMeshField.dispose();
  skybox.dispose();
  worldMaterial.dispose();
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
}

voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__ = disposeRuntime;
(import.meta as ImportMeta & { readonly hot?: ViteHotContext }).hot?.dispose(disposeRuntime);

void startApp();
