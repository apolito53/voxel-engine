import * as THREE from "three";
import "./style.css";
import { getBlockFragmentOffset, getDistributedBlockFragmentIndex } from "./blockFragments";
import { BLOCKS, PLACEABLE_BLOCKS } from "./blocks";
import {
  createChunkStorage,
  createWorldRegistry,
  type SavedWorld,
  type WorldRegistry
} from "./chunkStorage";
import { createDeleteWorldDialogCopy } from "./deleteWorldDialog";
import { DebugHud } from "./debugHud";
import { requireElement } from "./dom";
import { createEmptyFrameTimings, smoothFrameTimings, type FrameTimings } from "./frameTimings";
import { readGpuInfo } from "./gpu";
import { SUN_OFFSET } from "./lighting";
import { MinimapRenderer } from "./minimap";
import { PlayerController } from "./player";
import { formatPlayerSpeedMetersPerSecond } from "./playerSpeed";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PhysicsToy,
  PhysicsToyCollider,
  createEmptyPhysicsToyCollisionStats,
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
import { RubbleField } from "./rubble";
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
const bootPreset = QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
type FrameTimingSection = Exclude<keyof FrameTimings, "frameMs">;

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
let selectedBlockIndex = 0;
let qualityController: QualityController;
let physicsObjectBudget = bootPreset.physicsObjectBudget;
let pendingWorldDeletion: SavedWorld | null = null;

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
let physicsCollisionStats: PhysicsToyCollisionStats = createEmptyPhysicsToyCollisionStats();
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
    player = new PlayerController(camera, renderer.domElement, world);
    wireMenuControls();
    worldSeedInput.value = createReadableSeed();
    await refreshHomeWorldList();
    animate();
  } catch (error) {
    console.error("Could not start voxel engine", error);
    homeWorldList.textContent = "Could not open local save storage.";
  }
}

function wireMenuControls(): void {
  const activePlayer = requirePlayer();

  activePlayer.onPauseChange = (paused: boolean) => {
    pauseMenu.classList.toggle("is-hidden", !inWorld || !paused);
    if (!paused) setSettingsPanelOpen(false);
  };

  pauseMenu.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, input, label, select, .settings-panel")) return;
    event.preventDefault();
    resumeFromPause();
  });
  resumeButton.addEventListener("click", resumeFromPause);
  settingsButton.addEventListener("click", () => {
    setSettingsPanelOpen(pauseSettingsPanel.hidden);
  });
  // World switching stays on the home screen; the pause menu only exits back there.
  homeButton.addEventListener("click", () => {
    void exitToHome();
  });
  qualitySelect.addEventListener("change", () => qualityController.setPreset(qualitySelect.value));
  renderDistanceSlider.addEventListener("input", () => {
    qualityController.setRenderDistance(renderDistanceSlider.value);
  });
  physicsBudgetDecreaseButton.addEventListener("click", () => changePhysicsObjectBudget("decrease"));
  physicsBudgetIncreaseButton.addEventListener("click", () => changePhysicsObjectBudget("increase"));
  physicsBudgetSlider.addEventListener("input", () => setPhysicsObjectBudget(Number(physicsBudgetSlider.value)));
  despawnObjectsButton.addEventListener("click", clearToys);
  shadowQualitySlider.addEventListener("input", () => {
    qualityController.setShadowQualityLevel(shadowQualitySlider.value);
  });
  debrisCountSlider.addEventListener("input", () => {
    qualityController.setBlockFragmentCount(debrisCountSlider.value);
  });
  superUltraToggle.addEventListener("change", () => {
    qualityController.setSuperUltraEnabled(superUltraToggle.checked);
  });
  createWorldForm.addEventListener("submit", (event) => {
    void createWorldFromForm(event);
  });
  randomSeedButton.addEventListener("click", () => {
    worldSeedInput.value = createReadableSeed();
    worldSeedInput.focus();
  });
  cancelDeleteWorldButton.addEventListener("click", closeDeleteWorldDialog);
  confirmDeleteWorldButton.addEventListener("click", () => {
    void confirmPendingWorldDeletion();
  });
  deleteWorldDialog.addEventListener("pointerdown", (event) => {
    if (event.target === deleteWorldDialog) {
      closeDeleteWorldDialog();
    }
  });
}

function resumeFromPause(): void {
  setSettingsPanelOpen(false);
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(qualityController.renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("keydown", (event) => {
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

  if (event.code === "KeyX") {
    event.preventDefault();
    clearPhysicsCores();
    return;
  }

  if (/^Digit[1-5]$/.test(event.code)) {
    selectedBlockIndex = Number(event.code.slice(-1)) - 1;
  }

  const activePlayer = requirePlayer();
  if (event.code === "KeyT" && activePlayer.isLooking()) {
    event.preventDefault();
    camera.getWorldDirection(direction);
    const toy = new PhysicsToy(
      camera.position.clone().addScaledVector(direction, 1.4),
      direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.5, 0)),
      {
        // Cores are the expensive actors once the player spams them. They keep
        // their damage/collision behavior while moving, then sleep like debris
        // after settling so old shots stop taxing the frame forever.
        sleepSpeed: PHYSICS_CORE_SLEEP_SPEED,
        sleepAfterSeconds: PHYSICS_CORE_SLEEP_AFTER_SECONDS
      }
    );
    addPhysicsToy(toy);
  }
});

renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
renderer.domElement.addEventListener("mousedown", (event) => {
  if (!inWorld) return;

  const activePlayer = requirePlayer();
  const hit: VoxelRaycastHit | null = getTargetBlockHit();
  if (!hit) return;

  if (event.button === 0) {
    requireWorld().setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
  }

  if (event.button === 2) {
    const block = PLACEABLE_BLOCKS[selectedBlockIndex];
    const target = {
      x: hit.block.x + hit.normal.x,
      y: hit.block.y + hit.normal.y,
      z: hit.block.z + hit.normal.z
    };
    if (activePlayer.overlapsBlock(target.x, target.y, target.z)) return;
    requireWorld().setBlock(target.x, target.y, target.z, block);
  }
});

function animate(): void {
  const frameStartedAt = performance.now();
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.04);
  const frameTimingSample = createEmptyFrameTimings();
  let timingSectionStartedAt = frameStartedAt;
  let debugPlayerChunk: ChunkCoords | null = null;
  let debugWorldStats: WorldStats | null = null;
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
    recordTimingSection("playerMs");
    camera.getWorldDirection(chunkStreamDirection);
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
      toy.update(delta, activeWorld, physicsImpacts);
      rubbleField.resolveCoreCollision(toy);
    }
    absorbSleepingFragmentsIntoRubble();
    physicsCollisionStats = physicsToyCollider.resolve(toys);
    for (const impact of physicsImpacts) {
      handlePhysicsImpact(activeWorld, impact, damagedBlockKeysThisFrame);
    }
    pruneExpiredToys();
    physicsFragmentInstancer.update(toys);
    recordTimingSection("physicsMs");

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    recordTimingSection("meshMs");
    updateHud();
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
  recordTimingSection("otherMs");
  const renderStartedAt = performance.now();
  renderer.render(scene, camera);
  frameTimingSample.renderMs = performance.now() - renderStartedAt;
  frameTimingSample.frameMs = performance.now() - frameStartedAt;
  smoothedFrameTimings = smoothFrameTimings(
    smoothedFrameTimings,
    frameTimingSample,
    frameTimingsInitialized
  );
  frameTimingsInitialized = true;

  if (inWorld && debugPlayerChunk && debugWorldStats) {
    debugHud.update(
      rawDelta,
      debugPlayerChunk,
      debugWorldStats,
      debugMinimapMs,
      toys.length,
      physicsObjectBudget,
      physicsCollisionStats,
      physicsFragmentInstancer.getStats(),
      rubbleField.getStats(),
      smoothedFrameTimings
    );
  }
  requestAnimationFrame(animate);
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
  hudTitle.textContent = `Voxel Sandbox Engine | ${BLOCKS[PLACEABLE_BLOCKS[selectedBlockIndex]].name}${modeSuffix}`;
  playerSpeedReadout.textContent = `Speed ${formatPlayerSpeedMetersPerSecond(activePlayer.velocity)}`;
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
  if (impact.speed <= BLOCK_DAMAGE_IMPACT_SPEED) return;

  const damageKey = activeWorld.damageKey(impact.block.x, impact.block.y, impact.block.z);
  if (damagedBlocksThisFrame.has(damageKey)) return;
  damagedBlocksThisFrame.add(damageKey);

  const result = activeWorld.damageBlock(impact.block.x, impact.block.y, impact.block.z, 1);
  if (!result?.destroyed) return;

  spawnBlockFragments(result.block, result.position, impact);
}

function spawnBlockFragments(
  block: number,
  position: { readonly x: number; readonly y: number; readonly z: number },
  impact: PhysicsImpact
): void {
  const fragmentBaseSpeed = Math.min(4.5, impact.speed * 0.42);
  const blockCenter = new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);

  const fragmentCount = qualityController.preset.blockFragmentCount;

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragmentGridIndex = getDistributedBlockFragmentIndex(index, fragmentCount);
    const fragmentOffset = getBlockFragmentOffset(fragmentGridIndex);
    const offset = new THREE.Vector3(
      fragmentOffset.x,
      fragmentOffset.y,
      fragmentOffset.z
    );
    // The first rubble pass was too dramatic: pieces launched like shrapnel,
    // slid through each other, and rarely settled into the clump system where
    // they become useful cover. Keep a short burst of breakup motion, but bias
    // the fragments toward nearby pile formation.
    const scatter = createFragmentScatterDirection(offset).multiplyScalar(0.55 + Math.random() * 0.65);
    const velocity = impact.normal.clone()
      .multiplyScalar(fragmentBaseSpeed)
      .add(scatter)
      .add(new THREE.Vector3(0, 0.8 + Math.random() * 1.1, 0));

    addPhysicsToy(PhysicsToy.createBlockFragment(block, blockCenter.clone().add(offset), velocity));
  }
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

function absorbSleepingFragmentsIntoRubble(): void {
  for (let index = toys.length - 1; index >= 0; index -= 1) {
    const toy = toys[index];
    if (!toy?.isInstancedFragment || !toy.isSleeping) continue;

    // Once debris has settled, it graduates from "expensive little physics
    // shard" into a cheap cover proxy. The visible rubble remains, but the
    // per-shard physics body leaves the hot loop.
    rubbleField.absorbFragment(toy);
    removePhysicsToyAt(index);
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

    // Loading from the home screen is the only place world slots swap into the active engine.
    await activeWorld.switchStorage(chunkStorage, scene, savedWorld.seed);
    // For now every world starts near the origin; player-position saves can layer on later.
    await activeWorld.preloadSavedChunksAround(0, 0, qualityController.initialLoadRadius);
    activeWorld.ensureChunksAround(0, 0, qualityController.initialLoadRadius);
    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    camera.position.set(2, activeWorld.highestSolidY(2, 2) + 5, 2);
    updateSunShadowAnchor();
    homeScreen.classList.add("is-hidden");
    pauseMenu.classList.add("is-hidden");
    document.body.classList.add("in-world");
    inWorld = true;
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
    requirePlayer().pause(true);
    clearToys();
    await activeWorld.flushStorageWrites();
    activeWorld.disposeLoadedChunks(scene);
    inWorld = false;
    document.body.classList.remove("in-world", "playing");
    pauseMenu.classList.add("is-hidden");
    homeScreen.classList.remove("is-hidden");
    await refreshHomeWorldList();
  } finally {
    worldTransitioning = false;
  }
}

function clearToys(): void {
  for (const toy of toys) {
    physicsToyCollider.forget(toy);
    if (!toy.isInstancedFragment) {
      scene.remove(toy.mesh);
    }
    toy.dispose();
  }
  toys.length = 0;
  physicsFragmentInstancer.clear();
  rubbleField.clear();
}

function clearPhysicsCores(): void {
  for (let index = toys.length - 1; index >= 0; index -= 1) {
    const toy = toys[index];
    if (!toy || toy.isInstancedFragment || !toy.damagesBlocks) continue;

    // X is the quick cleanup key: remove the launched cores without erasing the
    // rubble piles or loose debris the player may be studying. Full cleanup is
    // intentionally tucked behind the Settings menu's Despawn All Objects button.
    removePhysicsToyAt(index);
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

void startApp();
