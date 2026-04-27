import * as THREE from "three";
import "./style.css";
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
import { PhysicsToy } from "./physics";
import { QualityController } from "./qualityController";
import { DEFAULT_QUALITY_PRESET, QUALITY_PRESETS } from "./qualityPresets";
import { voxelRaycast, type VoxelRaycastHit } from "./raycast";
import { VoxelWorld } from "./world";
import { createReadableSeed, renderHomeWorldList } from "./worldMenu";

const SUN_OFFSET = new THREE.Vector3(18, 132, 10);
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

let worldRegistry: WorldRegistry | null = null;
let world: VoxelWorld | null = null;
let player: PlayerController | null = null;
let inWorld = false;
let worldTransitioning = false;
let selectedBlockIndex = 0;
let qualityController: QualityController;

const clock = new THREE.Clock();
const direction = new THREE.Vector3();
const chunkStreamDirection = new THREE.Vector3();
const chunkStreamFrustum = new THREE.Frustum();
const chunkStreamProjection = new THREE.Matrix4();
const toys: PhysicsToy[] = [];
const gpuInfo = readGpuInfo(renderer);

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
  superUltraToggle,
  updateSunShadowAnchor,
  onQualityChanged: () => {
    debugHud.reset();
    minimapRenderer.reset();
  }
});
qualityController.initialize();

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
  if (event.code === "KeyF" && activePlayer.isLooking()) {
    camera.getWorldDirection(direction);
    const toy = new PhysicsToy(
      camera.position.clone().addScaledVector(direction, 1.4),
      direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.5, 0))
    );
    toys.push(toy);
    scene.add(toy.mesh);
  }
});

renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
renderer.domElement.addEventListener("mousedown", (event) => {
  if (!inWorld) return;

  const activeWorld = requireWorld();
  const activePlayer = requirePlayer();
  if (!activePlayer.isLooking()) return;

  camera.getWorldDirection(direction);
  const hit: VoxelRaycastHit | null = voxelRaycast(activeWorld, camera.position, direction, 8);
  if (!hit) return;

  if (event.button === 0) {
    activeWorld.setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
  }

  if (event.button === 2) {
    const block = PLACEABLE_BLOCKS[selectedBlockIndex];
    const target = {
      x: hit.block.x + hit.normal.x,
      y: hit.block.y + hit.normal.y,
      z: hit.block.z + hit.normal.z
    };
    if (activePlayer.overlapsBlock(target.x, target.y, target.z)) return;
    activeWorld.setBlock(target.x, target.y, target.z, block);
  }
});

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.04);

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

    for (const toy of toys) {
      toy.update(delta, activeWorld);
    }

    activeWorld.rebuildDirty(scene, worldMaterial, qualityController.chunkRebuildBudget);
    updateHud();
    debugHud.update(
      delta,
      playerChunk,
      activeWorld.getStats(),
      minimapRenderer.lastUpdateMs
    );
    minimapRenderer.update(delta);
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
  hudTitle.textContent = `Voxel Sandbox Engine | ${BLOCKS[PLACEABLE_BLOCKS[selectedBlockIndex]].name}`;
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
    toy.mesh.geometry.dispose();
    toy.mesh.material.dispose();
  }
  toys.length = 0;
}

function updateSunShadowAnchor(): void {
  // Keep the directional light stable over the player's local chunk window.
  sunTarget.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sunTarget.position).add(SUN_OFFSET);
  sunTarget.updateMatrixWorld();
}

void startApp();
