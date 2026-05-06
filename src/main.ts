import * as THREE from "three";
import "./style.css";
import {
  getBlockFragmentMaterialUnits,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex
} from "./blockFragments";
import { BLOCKS, PLACEABLE_BLOCKS, type BlockId } from "./blocks";
import {
  createChunkStorage,
  createWorldRegistry,
  type SavedPlayerStateSnapshot,
  type SavedWorld,
  type WorldRegistry
} from "./chunkStorage";
import type { CollisionWorld } from "./collision";
import { createDeleteWorldDialogCopy } from "./deleteWorldDialog";
import { DebrisSettler, createEmptyDebrisSettlerStats, type DebrisSettlerStats } from "./debrisSettler";
import { DebugHud } from "./debugHud";
import { requireElement } from "./dom";
import { createEngineEventBus } from "./engineEvents";
import { shouldAbsorbFragmentIntoRubble } from "./fragmentRubble";
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
  EMPTY_HANDS_ITEM_ID,
  createItemStack,
  createVoxelSandboxItemRegistry,
  type ItemAction
} from "./items";
import { SUN_OFFSET } from "./lighting";
import { MinimapRenderer } from "./minimap";
import { createNovaChatReply, NOVA_CHAT_TOGGLE_KEY } from "./novaChat";
import { NovaChatPanel } from "./novaChatPanel";
import { NovaContextJournal } from "./novaContext";
import { NOVA_PILOT_THROW_KEY, NOVA_PILOT_TOGGLE_KEY, NovaPilot } from "./novaPilot";
import { NovaPilotReactions } from "./novaPilotReactions";
import { PlayerController } from "./player";
import { PLAYER_HEIGHT } from "./playerMovement";
import { formatPlayerSpeedMetersPerSecond, getPlayerSpeedMetersPerSecond } from "./playerSpeed";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PHYSICS_CORE_BLOCK_DAMAGE,
  PhysicsToy,
  PhysicsToyCollider,
  createEmptyPhysicsToyCollisionStats,
  hasMeaningfulTerrainImpactSince,
  type PhysicsImpact,
  type PhysicsToyCollisionStats
} from "./physics";
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
import { RubbleField, type RubbleFieldStats } from "./rubble";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "./shadows";
import {
  BASE_CAMERA_FOV,
  SPRINT_FEEDBACK_ACTIVE_CLASS,
  getSprintFeedbackTargetFov,
  smoothSprintFeedbackFov
} from "./sprintFeedback";
import { createSkybox } from "./skybox";
import { TargetBlockHighlighter } from "./targetHighlighter";
import { VoxelWorld, type ChunkCoords, type WorldStats } from "./world";
import { createReadableSeed, renderHomeWorldList } from "./worldMenu";

const BLOCK_INTERACTION_REACH = 8;
const PHYSICS_CORE_SLEEP_SPEED = 0.12;
const PHYSICS_CORE_SLEEP_AFTER_SECONDS = 0.9;
const FRAME_SPIKE_EVENT_MS = 45;
const PLAYER_LOCATION_AUTOSAVE_MS = 5000;
const PLAYER_LOCATION_POSITION_EPSILON = 0.05;
const PLAYER_LOCATION_LOOK_EPSILON = 0.002;
const PLAYER_LOCATION_SAVE_PRECISION = 1000;
const bootPreset = QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
type FrameTimingSection = Exclude<keyof FrameTimings, "frameMs">;
type VoxelRuntimeGlobal = typeof globalThis & {
  __VOXEL_SANDBOX_DISPOSE__?: () => void;
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
const homeWorldList = requireElement<HTMLElement>("#home-world-list");
const deleteWorldDialog = requireElement<HTMLElement>("#delete-world-dialog");
const deleteWorldName = requireElement<HTMLElement>("#delete-world-name");
const deleteWorldCopy = requireElement<HTMLElement>("#delete-world-copy");
const deleteWorldError = requireElement<HTMLElement>("#delete-world-error");
const cancelDeleteWorldButton = requireElement<HTMLButtonElement>("#cancel-delete-world-button");
const confirmDeleteWorldButton = requireElement<HTMLButtonElement>("#confirm-delete-world-button");
const pauseMenu = requireElement<HTMLElement>("#pause-menu");
const resumeButton = requireElement<HTMLButtonElement>("#resume-button");
const homeButton = requireElement<HTMLButtonElement>("#home-button");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const novaChatButton = requireElement<HTMLButtonElement>("#nova-chat-button");
const pauseSettingsPanel = requireElement<HTMLElement>("#pause-settings-panel");
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

let worldRegistry: WorldRegistry | null = null;
let world: VoxelWorld | null = null;
let player: PlayerController | null = null;
let inWorld = false;
let worldTransitioning = false;
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

const engineEvents = createEngineEventBus();
const itemRegistry = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
const hotbarItems = createHotbarItems(PLACEABLE_BLOCKS);
const fallbackHotbarItem = createItemStack(EMPTY_HANDS_ITEM_ID);
const novaContext = new NovaContextJournal(engineEvents);
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
const physicsToyCollider = new PhysicsToyCollider();
const physicsFragmentInstancer = new PhysicsFragmentInstancer(scene);
const rubbleField = new RubbleField(scene);
const debrisSettler = new DebrisSettler();
const terrainAndRubbleCollisionWorld: CollisionWorld = {
  // Full terrain blocks still come from VoxelWorld. Partial-height cover such
  // as rubble is layered in through the optional support-height query so both
  // player feet and loose debris can treat piles as surfaces without promoting
  // every patch to a solid voxel.
  isSolid: (x, y, z) => requireWorld().isSolid(x, y, z),
  getSupportHeight: (bounds) => rubbleField.getSupportHeight(bounds)
};
const novaPilot = new NovaPilot();
scene.add(novaPilot.object);
const novaPilotReactions = new NovaPilotReactions({
  events: engineEvents,
  pilot: novaPilot,
  output: novaMessage
});
const novaChatPanel = new NovaChatPanel({
  root: novaChatRoot,
  log: novaChatLog,
  form: novaChatForm,
  input: novaChatInput,
  closeButton: novaChatCloseButton,
  getReply: (message) => createNovaChatReply(message, novaContext.snapshot()),
  onOpen: openNovaChatInputMode,
  onClose: closeNovaChatInputMode,
  onMessage: (message) => {
    engineEvents.emit("nova:chat-message", {
      role: message.role,
      text: message.text
    });
  }
});
let physicsCollisionStats: PhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();
let debrisSettlerStats: DebrisSettlerStats = createEmptyDebrisSettlerStats();
let smoothedFrameTimings = createEmptyFrameTimings();
let frameTimingsInitialized = false;

const debugHud = new DebugHud({
  panel: debugPanel,
  renderer,
  gpuInfo,
  getQualityPreset: () => qualityController.preset
});

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
    if (paused) void queueActivePlayerLocationSave(true);
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

window.addEventListener("resize", () => {
  noteUserActivity();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(qualityController.renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}, eventListenerOptions);

document.addEventListener("keydown", (event) => {
  noteUserActivity();
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

  if (!inWorld) return;

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
  void queueActivePlayerLocationSave(true);
  enterIdleHeartbeat();
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
    useSelectedHotbarPrimaryAction(activePlayer);
    return;
  }

  if (event.button === 2) {
    useSelectedHotbarSecondaryAction(activePlayer);
  }
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
      if (activePlayer.isLooking()) throwPlayerCore();
      return;
  }
}

function destroyTargetBlock(): void {
  const hit: VoxelRaycastHit | null = getTargetBlockHit();
  if (!hit) return;

  requireWorld().setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
}

function placeSelectedBlock(activePlayer: PlayerController, block: BlockId): void {
  const hit: VoxelRaycastHit | null = getTargetBlockHit();
  if (!hit) return;

  const target = {
    x: hit.block.x + hit.normal.x,
    y: hit.block.y + hit.normal.y,
    z: hit.block.z + hit.normal.z
  };
  if (activePlayer.overlapsBlock(target.x, target.y, target.z)) return;
  requireWorld().setBlock(target.x, target.y, target.z, block);
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
      if (!hasMeaningfulTerrainImpactSince(physicsImpacts, toy, terrainImpactStartIndex)) {
        rubbleField.resolveCoreCollision(toy);
      }
    }
    debrisSettlerStats = debrisSettler.update(delta, rubbleField);
    emitRubbleBatchEvents();
    absorbSettledFragmentsIntoRubble();
    physicsCollisionStats = physicsToyCollider.resolve(toys);
    for (const impact of physicsImpacts) {
      handlePhysicsImpact(activeWorld, impact, damagedBlockKeysThisFrame);
    }
    rubbleField.settle(activeWorld);
    pruneExpiredToys();
    physicsFragmentInstancer.update(toys);
    recordTimingSection("physicsMs");

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    recordTimingSection("meshMs");
    debugRubbleStats = rubbleField.getStats();
    updateHud();
    updateNovaContextTelemetry(activePlayer, debugRubbleStats);
    updateTargetBlockHighlighter();
    updateSprintFeedback(activePlayer.isSprintFeedbackActive(), delta);
    recordTimingSection("otherMs");
    minimapRenderer.update(delta);
    debugWorldStats = activeWorld.getStats();
    debugMinimapMs = minimapRenderer.lastUpdateMs;
    recordTimingSection("minimapMs");
  } else {
    targetBlockHighlighter.hide();
    updateSprintFeedback(false, delta);
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
    engineEvents.emit("performance:frame-spike", {
      frameMs: frameTimingSample.frameMs,
      timings: frameTimingSample
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
  if (debrisSettlerStats.regions > 0) return true;

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

function updateSprintFeedback(active: boolean, delta: number): void {
  const targetFov = getSprintFeedbackTargetFov(active);
  const nextFov = smoothSprintFeedbackFov(camera.fov, targetFov, delta);

  if (camera.fov !== nextFov) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }

  sprintOverlay.classList.toggle(SPRINT_FEEDBACK_ACTIVE_CLASS, active);
}

function getTargetBlockHit(): VoxelRaycastHit | null {
  if (!inWorld) return null;
  if (!requirePlayer().isLooking()) return null;

  camera.getWorldDirection(direction);
  return voxelRaycast(requireWorld(), camera.position, direction, BLOCK_INTERACTION_REACH);
}

function updateTargetBlockHighlighter(): void {
  const hit = getTargetBlockHit();

  if (!hit) {
    targetBlockHighlighter.hide();
    return;
  }

  targetBlockHighlighter.showBlock(hit.block);
}

function handlePhysicsImpact(
  activeWorld: VoxelWorld,
  impact: PhysicsImpact,
  damagedBlocksThisFrame: Set<string>
): void {
  if (impact.source.isExpired) return;
  if (impact.speed <= BLOCK_DAMAGE_IMPACT_SPEED) return;

  const damageKey = activeWorld.damageKey(impact.block.x, impact.block.y, impact.block.z);
  if (damagedBlocksThisFrame.has(damageKey)) return;
  damagedBlocksThisFrame.add(damageKey);

  const result = activeWorld.damageBlock(
    impact.block.x,
    impact.block.y,
    impact.block.z,
    PHYSICS_CORE_BLOCK_DAMAGE
  );
  if (!result) return;

  engineEvents.emit("block:damaged", {
    position: result.position,
    block: result.block,
    impactSpeed: impact.speed,
    remainingHealth: result.remainingHealth
  });

  if (!result.destroyed) return;

  // The core is now a breaching charge instead of a forever-drilling marble:
  // one destroyed voxel consumes the projectile and the normal prune path
  // removes it from scene/collider bookkeeping at the end of the physics pass.
  impact.source.expire();

  engineEvents.emit("block:destroyed", {
    position: result.position,
    block: result.block,
    impactSpeed: impact.speed,
    fragmentCount: qualityController.preset.blockFragmentCount
  });

  spawnBlockFragments(result.block, result.position, impact);
}

function spawnBlockFragments(
  block: number,
  position: { readonly x: number; readonly y: number; readonly z: number },
  impact: PhysicsImpact
): void {
  const fragmentBaseSpeed = Math.min(5.8, impact.speed * 0.55);
  const blockCenter = new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);

  const fragmentCount = qualityController.preset.blockFragmentCount;
  const fragments: PhysicsToy[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
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
    const scatter = createFragmentScatterDirection(offset).multiplyScalar(1.35 + Math.random() * 1.65);
    const velocity = impact.normal.clone()
      .multiplyScalar(fragmentBaseSpeed)
      .add(scatter)
      .add(spawnJitter.clone().multiplyScalar(9.5))
      .add(new THREE.Vector3(0, 0.75 + Math.random() * 1.25, 0));
    const rubbleMaterialUnits = getBlockFragmentMaterialUnits(index, fragmentCount);

    const fragment = PhysicsToy.createBlockFragment(
      block,
      blockCenter.clone().add(offset).add(spawnJitter),
      velocity,
      rubbleMaterialUnits
    );
    addPhysicsToy(fragment);
    fragments.push(fragment);
  }

  debrisSettler.registerFracture(block, blockCenter, fragments);
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

function throwPlayerCore(): void {
  camera.getWorldDirection(direction);
  addPhysicsToy(createPhysicsCore(
    camera.position.clone().addScaledVector(direction, 1.4),
    direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.5, 0))
  ));
  engineEvents.emit("physics:core-thrown", { source: "player" });
}

function throwNovaPilotCore(): void {
  const launch = novaPilot.createCoreLaunch();
  if (!launch) return;
  addPhysicsToy(createPhysicsCore(launch.position, launch.velocity));
  engineEvents.emit("physics:core-thrown", { source: "nova" });
}

function createPhysicsCore(position: THREE.Vector3, velocity: THREE.Vector3): PhysicsToy {
  return new PhysicsToy(position, velocity, {
    // Thrown cores are the expensive, gameplay-relevant actors. Keep their
    // damage/collision behavior while moving, then let them sleep after
    // settling so old shots stop taxing the frame forever.
    sleepSpeed: PHYSICS_CORE_SLEEP_SPEED,
    sleepAfterSeconds: PHYSICS_CORE_SLEEP_AFTER_SECONDS
  });
}

function addPhysicsToy(toy: PhysicsToy): void {
  toys.push(toy);
  if (!toy.isInstancedFragment) {
    scene.add(toy.mesh);
  }
  enforcePhysicsToyBudget();
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
}

function enforcePhysicsToyBudget(): void {
  while (toys.length > physicsObjectBudget) {
    removePhysicsToyAt(0);
  }
}

function absorbSettledFragmentsIntoRubble(): void {
  for (let index = toys.length - 1; index >= 0; index -= 1) {
    const toy = toys[index];
    if (toy && debrisSettler.owns(toy)) continue;
    if (!toy || !shouldAbsorbFragmentIntoRubble(toy)) continue;

    // Once debris has settled or aged out, it graduates from "expensive little
    // physics shard" into cheap cover material. A low visual debris count can
    // still carry several material units, so graphics settings do not alter
    // gameplay even when a tiny Potato shard sample expires before sleeping.
    if (rubbleField.absorbFragment(toy)) {
      engineEvents.emit("rubble:formed", {
        position: {
          x: toy.mesh.position.x,
          y: toy.mesh.position.y,
          z: toy.mesh.position.z
        },
        block: toy.fragmentBlock ?? 0,
        pieces: toy.rubbleMaterialUnits
      });
    }
    removePhysicsToyAt(index);
  }
}

function emitRubbleBatchEvents(): void {
  for (const batch of debrisSettler.getFinalizedBatches()) {
    engineEvents.emit("rubble:formed", {
      position: batch.position,
      block: batch.block,
      pieces: batch.pieces
    });
  }
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
  if (!removedToy.isInstancedFragment) {
    scene.remove(removedToy.mesh);
  }
  removedToy.dispose();
}

async function refreshHomeWorldList(): Promise<void> {
  await renderHomeWorldList(requireWorldRegistry(), homeWorldList, loadWorld, openDeleteWorldDialog);
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
  } finally {
    worldTransitioning = false;
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

  try {
    // Leaving play unloads the active chunks first, so the next world starts from a clean scene.
    const activeWorld = requireWorld();
    await queueActivePlayerLocationSave(true);
    if (novaChatPanel.isOpen) {
      novaChatPanel.close();
    }
    requirePlayer().pause(true);
    camera.getWorldDirection(direction);
    novaPilot.setActive(false, camera.position, direction, activeWorld);
    clearToys();
    await activeWorld.flushStorageWrites();
    activeWorld.disposeLoadedChunks(scene);
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
    if (!toy.isInstancedFragment) {
      scene.remove(toy.mesh);
    }
    toy.dispose();
  }
  toys.length = 0;
  debrisSettler.clear();
  // Full cleanup is allowed to be heavy-handed: release the high-water instanced
  // debris batches so long stress tests do not keep oversized GPU buffers alive.
  physicsFragmentInstancer.dispose();
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
  player?.dispose();
  clearToys();
  activeWorld?.dispose(scene);
  inWorld = false;
  novaPilotReactions.dispose();
  novaContext.dispose();
  novaPilot.dispose();
  targetBlockHighlighter.dispose();
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
}

voxelRuntimeGlobal.__VOXEL_SANDBOX_DISPOSE__ = disposeRuntime;
(import.meta as ImportMeta & { readonly hot?: ViteHotContext }).hot?.dispose(disposeRuntime);

void startApp();
