import * as THREE from "three";
import "./style.css";
import { BLOCK_FRAGMENT_COUNT, getBlockFragmentOffset } from "./blockFragments";
import { BLOCKS, PLACEABLE_BLOCKS } from "./blocks";
import {
  createChunkStorage,
  createWorldRegistry,
  type WorldRegistry
} from "./chunkStorage";
import { DebugHud } from "./debugHud";
import { requireElement } from "./dom";
import { readGpuInfo } from "./gpu";
import { MinimapRenderer } from "./minimap";
import { PlayerController } from "./player";
import { BLOCK_DAMAGE_IMPACT_SPEED, PhysicsToy, type PhysicsImpact } from "./physics";
import {
  MAX_PHYSICS_OBJECT_BUDGET,
  MIN_PHYSICS_OBJECT_BUDGET,
  normalizePhysicsObjectBudget,
  readPhysicsObjectBudgetPreference,
  stepPhysicsObjectBudget,
  writePhysicsObjectBudgetPreference,
  type PhysicsBudgetDirection
} from "./physicsBudget";
import { QualityController } from "./qualityController";
import { DEFAULT_QUALITY_PRESET, QUALITY_PRESETS } from "./qualityPresets";
import { voxelRaycast, type VoxelRaycastHit } from "./raycast";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "./shadows";
import { TargetBlockHighlighter } from "./targetHighlighter";
import { VoxelWorld } from "./world";
import { createReadableSeed, renderHomeWorldList } from "./worldMenu";

const SUN_OFFSET = new THREE.Vector3(18, 132, 10);
const BLOCK_INTERACTION_REACH = 8;
const bootPreset = QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];

const app = requireElement<HTMLElement>("#app");
const homeScreen = requireElement<HTMLElement>("#home-screen");
const createWorldForm = requireElement<HTMLFormElement>("#create-world-form");
const worldNameInput = requireElement<HTMLInputElement>("#world-name-input");
const worldSeedInput = requireElement<HTMLInputElement>("#world-seed-input");
const randomSeedButton = requireElement<HTMLButtonElement>("#random-seed-button");
const homeWorldList = requireElement<HTMLElement>("#home-world-list");
const pauseMenu = requireElement<HTMLElement>("#pause-menu");
const resumeButton = requireElement<HTMLButtonElement>("#resume-button");
const homeButton = requireElement<HTMLButtonElement>("#home-button");
const qualityButton = requireElement<HTMLButtonElement>("#quality-button");
const physicsBudgetValue = requireElement<HTMLElement>("#physics-budget-value");
const physicsBudgetDecreaseButton = requireElement<HTMLButtonElement>("#physics-budget-decrease");
const physicsBudgetIncreaseButton = requireElement<HTMLButtonElement>("#physics-budget-increase");
const superUltraToggleRow = requireElement<HTMLElement>("#super-ultra-toggle-row");
const superUltraToggle = requireElement<HTMLInputElement>("#super-ultra-toggle");
const debugPanel = requireElement<HTMLElement>("#debug-panel");
const minimap = requireElement<HTMLCanvasElement>("#minimap");
const hudTitle = requireElement<HTMLElement>("#hud .title");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb9d8);
const sceneFog = new THREE.Fog(0x8fb9d8, bootPreset.fogNear, bootPreset.fogFar);
scene.fog = sceneFog;

const camera = new THREE.PerspectiveCamera(
  75,
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
  qualityButton,
  superUltraToggleRow,
  superUltraToggle,
  updateSunShadowAnchor,
  onQualityChanged: () => {
    debugHud.reset();
    minimapRenderer.reset();
    syncPhysicsBudgetToQuality();
  }
});
qualityController.initialize();
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
  };

  pauseMenu.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, input, label")) return;
    event.preventDefault();
    requirePlayer().resume();
  });
  resumeButton.addEventListener("click", () => requirePlayer().resume());
  // World switching stays on the home screen; the pause menu only exits back there.
  homeButton.addEventListener("click", () => {
    void exitToHome();
  });
  qualityButton.addEventListener("click", () => qualityController.cycle());
  physicsBudgetDecreaseButton.addEventListener("click", () => changePhysicsObjectBudget("decrease"));
  physicsBudgetIncreaseButton.addEventListener("click", () => changePhysicsObjectBudget("increase"));
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
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(qualityController.renderPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("keydown", (event) => {
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

  if (/^Digit[1-5]$/.test(event.code)) {
    selectedBlockIndex = Number(event.code.slice(-1)) - 1;
  }

  const activePlayer = requirePlayer();
  if (event.code === "KeyT" && activePlayer.isLooking()) {
    event.preventDefault();
    camera.getWorldDirection(direction);
    const toy = new PhysicsToy(
      camera.position.clone().addScaledVector(direction, 1.4),
      direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.5, 0))
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
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.04);

  if (inWorld) {
    const activeWorld = requireWorld();
    const activePlayer = requirePlayer();

    activePlayer.update(delta);
    camera.getWorldDirection(chunkStreamDirection);
    updateChunkStreamFrustum();
    const playerChunk = activeWorld.streamChunksAround(
      camera.position.x,
      camera.position.z,
      scene,
      qualityController.loadRadius,
      qualityController.unloadRadius,
      qualityController.chunkLoadBudget,
      chunkStreamDirection,
      chunkStreamFrustum
    );

    physicsImpacts.length = 0;
    damagedBlockKeysThisFrame.clear();
    const physicsToyCountAtFrameStart = toys.length;
    for (let index = 0; index < physicsToyCountAtFrameStart; index += 1) {
      const toy = toys[index];
      if (!toy) continue;
      toy.update(delta, activeWorld, physicsImpacts);
    }
    for (const impact of physicsImpacts) {
      handlePhysicsImpact(activeWorld, impact, damagedBlockKeysThisFrame);
    }
    pruneExpiredToys();

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    updateHud();
    debugHud.update(
      rawDelta,
      playerChunk,
      activeWorld.getStats(),
      minimapRenderer.lastUpdateMs,
      toys.length,
      physicsObjectBudget
    );
    minimapRenderer.update(delta);
    updateTargetBlockHighlighter();
  } else {
    targetBlockHighlighter.hide();
  }

  updateSunShadowAnchor();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateChunkStreamFrustum(): void {
  // The world scheduler only needs camera planes, not renderer state, to prefer visible work.
  camera.updateMatrixWorld();
  chunkStreamProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  chunkStreamFrustum.setFromProjectionMatrix(chunkStreamProjection);
}

function updateHud(): void {
  const movementMode = requirePlayer().movementMode;
  const modeSuffix = movementMode === "walk" ? "" : ` | ${movementMode}`;
  hudTitle.textContent = `Voxel Sandbox Engine | ${BLOCKS[PLACEABLE_BLOCKS[selectedBlockIndex]].name}${modeSuffix}`;
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
  const fragmentBaseSpeed = Math.min(9, impact.speed * 0.72);
  const blockCenter = new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);

  for (let index = 0; index < BLOCK_FRAGMENT_COUNT; index += 1) {
    const fragmentOffset = getBlockFragmentOffset(index);
    const offset = new THREE.Vector3(
      fragmentOffset.x,
      fragmentOffset.y,
      fragmentOffset.z
    );
    const scatter = createFragmentScatterDirection(offset).multiplyScalar(1.7 + Math.random() * 1.4);
    const velocity = impact.normal.clone()
      .multiplyScalar(fragmentBaseSpeed)
      .add(scatter)
      .add(new THREE.Vector3(0, 2.4 + Math.random() * 1.8, 0));

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
  scene.add(toy.mesh);
  enforcePhysicsToyBudget();
}

function changePhysicsObjectBudget(direction: PhysicsBudgetDirection): void {
  setPhysicsObjectBudget(
    stepPhysicsObjectBudget(physicsObjectBudget, direction, qualityController.preset.physicsObjectBudget)
  );
}

function setPhysicsObjectBudget(nextBudget: number, persist = true): void {
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
}

function enforcePhysicsToyBudget(): void {
  while (toys.length > physicsObjectBudget) {
    removePhysicsToyAt(0);
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

  scene.remove(removedToy.mesh);
  removedToy.dispose();
}

async function refreshHomeWorldList(): Promise<void> {
  await renderHomeWorldList(requireWorldRegistry(), homeWorldList, loadWorld);
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
    scene.remove(toy.mesh);
    toy.dispose();
  }
  toys.length = 0;
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
