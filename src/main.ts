// @ts-nocheck
import * as THREE from "three";
import "./style.css";
import { BLOCKS, PLACEABLE_BLOCKS } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./chunk";
import { createChunkStorage, createWorldRegistry } from "./chunkStorage";
import { PlayerController } from "./player";
import { PhysicsToy } from "./physics";
import { voxelRaycast } from "./raycast";
import { VoxelWorld } from "./world";

const QUALITY_STORAGE_KEY = "voxel-quality-preset";
const SUPER_ULTRA_STORAGE_KEY = "voxel-super-ultra-enabled";
const LEGACY_POTATO_STORAGE_KEY = "voxel-potato-mode";
const DEFAULT_QUALITY_PRESET = "normal";
const SUPER_ULTRA_PRESET_ID = "superUltra";
const QUALITY_PRESET_ORDER = ["potato", "low", "normal", "high", "ultra"];
const SUN_OFFSET = new THREE.Vector3(18, 132, 10);
// Quality presets are intentionally plain data so render distance, lighting,
// streaming budgets, and minimap cost can be tuned without spelunking the game loop.
const QUALITY_PRESETS = {
  potato: {
    label: "Potato",
    distanceScale: 0.5,
    pixelRatioLimit: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowCameraSize: 72,
    shadowCameraFar: 180,
    shadowBias: -0.00015,
    shadowNormalBias: 0.035,
    fogNear: 18,
    fogFar: 44,
    cameraFar: 120,
    loadRadius: 2,
    unloadRadius: 3,
    chunkLoads: 1,
    chunkRebuilds: 1,
    minimapInterval: 0.45,
    minimapRowsPerFrame: 3,
    sunIntensity: 2.8,
    skyIntensity: 1.35
  },
  low: {
    label: "Low",
    distanceScale: 1,
    pixelRatioLimit: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowCameraSize: 88,
    shadowCameraFar: 220,
    shadowBias: -0.00015,
    shadowNormalBias: 0.035,
    fogNear: 35,
    fogFar: 68,
    cameraFar: 180,
    loadRadius: 3,
    unloadRadius: 4,
    chunkLoads: 1,
    chunkRebuilds: 2,
    minimapInterval: 0.35,
    minimapRowsPerFrame: 4,
    sunIntensity: 3.2,
    skyIntensity: 1.65
  },
  normal: {
    label: "Normal",
    distanceScale: 2,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 112,
    shadowCameraFar: 280,
    shadowBias: -0.00035,
    shadowNormalBias: 0.14,
    fogNear: 55,
    fogFar: 220,
    cameraFar: 450,
    loadRadius: 6,
    unloadRadius: 7,
    chunkLoads: 2,
    chunkRebuilds: 4,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 8,
    sunIntensity: 3.2,
    skyIntensity: 1.65
  },
  high: {
    label: "High",
    distanceScale: 4,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 176,
    shadowCameraFar: 420,
    shadowBias: -0.00032,
    shadowNormalBias: 0.16,
    fogNear: 95,
    fogFar: 440,
    cameraFar: 900,
    loadRadius: 12,
    unloadRadius: 13,
    chunkLoads: 4,
    chunkRebuilds: 6,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 10,
    sunIntensity: 3.35,
    skyIntensity: 1.72
  },
  ultra: {
    label: "Ultra",
    distanceScale: 6,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 240,
    shadowCameraFar: 560,
    shadowBias: -0.0003,
    shadowNormalBias: 0.18,
    fogNear: 135,
    fogFar: 660,
    cameraFar: 1300,
    loadRadius: 18,
    unloadRadius: 19,
    chunkLoads: 6,
    chunkRebuilds: 8,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 12,
    sunIntensity: 3.5,
    skyIntensity: 1.78
  },
  [SUPER_ULTRA_PRESET_ID]: {
    label: "Super Ultra",
    distanceScale: 12,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 360,
    shadowCameraFar: 820,
    shadowBias: -0.00028,
    shadowNormalBias: 0.2,
    fogNear: 270,
    fogFar: 1320,
    cameraFar: 2600,
    loadRadius: 36,
    unloadRadius: 37,
    chunkLoads: 10,
    chunkRebuilds: 10,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 14,
    sunIntensity: 3.6,
    skyIntensity: 1.82
  }
};

const app = document.querySelector("#app");
let superUltraEnabled = readSuperUltraPreference();
let qualityPresetId = readQualityPreference();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = getQualityPreset().shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const gpuInfo = readGpuInfo(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb9d8);
scene.fog = new THREE.Fog(
  0x8fb9d8,
  getQualityPreset().fogNear,
  getQualityPreset().fogFar
);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  getQualityPreset().cameraFar
);

const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
const sun = new THREE.DirectionalLight(0xfff0d0, getQualityPreset().sunIntensity);
sun.target = sunTarget;
configureSunShadow(getQualityPreset(), false);
updateSunShadowAnchor();
scene.add(sun);
const skyLight = new THREE.HemisphereLight(0xb9d9ff, 0x394228, getQualityPreset().skyIntensity);
scene.add(skyLight);

const worldMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0.0
});

let worldRegistry = null;
let world = null;
let player = null;
const homeScreen = document.querySelector("#home-screen");
const createWorldForm = document.querySelector("#create-world-form");
const worldNameInput = document.querySelector("#world-name-input");
const worldSeedInput = document.querySelector("#world-seed-input");
const randomSeedButton = document.querySelector("#random-seed-button");
const homeWorldList = document.querySelector("#home-world-list");
const pauseMenu = document.querySelector("#pause-menu");
const resumeButton = document.querySelector("#resume-button");
const homeButton = document.querySelector("#home-button");
const qualityButton = document.querySelector("#quality-button");
const superUltraToggle = document.querySelector("#super-ultra-toggle");
const debugPanel = document.querySelector("#debug-panel");
const minimap = document.querySelector("#minimap");
const minimapContext = minimap.getContext("2d");
let inWorld = false;
let worldTransitioning = false;

let selectedBlockIndex = 0;
let debugVisible = true;
let debugAccumulator = Infinity;
let minimapAccumulator = Infinity;
let smoothedFps = 0;
let lastMinimapMs = 0;
const toys = [];
const clock = new THREE.Clock();
const direction = new THREE.Vector3();
const minimapDirection = new THREE.Vector3();
const chunkStreamDirection = new THREE.Vector3();
const chunkStreamFrustum = new THREE.Frustum();
const chunkStreamProjection = new THREE.Matrix4();

const MINIMAP_SIZE = 128;
const MINIMAP_TEXTURE_SIZE = 64;
const MINIMAP_RANGE = 96;
const MINIMAP_WORLD_PER_PIXEL = MINIMAP_RANGE / MINIMAP_SIZE;
const MINIMAP_WORLD_PER_TEXEL = MINIMAP_RANGE / MINIMAP_TEXTURE_SIZE;
const minimapTerrain = document.createElement("canvas");
minimapTerrain.width = MINIMAP_TEXTURE_SIZE;
minimapTerrain.height = MINIMAP_TEXTURE_SIZE;
const minimapTerrainContext = minimapTerrain.getContext("2d");
const minimapImage = minimapTerrainContext.createImageData(
  MINIMAP_TEXTURE_SIZE,
  MINIMAP_TEXTURE_SIZE
);
let minimapRefreshRow = 0;
let minimapRefreshOriginX = camera.position.x;
let minimapRefreshOriginZ = camera.position.z;
let minimapDisplayOriginX = camera.position.x;
let minimapDisplayOriginZ = camera.position.z;
let minimapSliceMaxMs = 0;
let minimapHasTerrain = false;
minimapContext.imageSmoothingEnabled = false;

async function startApp() {
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
    syncSuperUltraToggle();
    setQualityPreset(qualityPresetId, false);
    worldSeedInput.value = createReadableSeed();
    await renderHomeWorldList();
    animate();
  } catch (error) {
    console.error("Could not start voxel engine", error);
    homeWorldList.textContent = "Could not open local save storage.";
  }
}

function wireMenuControls() {
  player.onPauseChange = (paused) => {
    pauseMenu.classList.toggle("is-hidden", !inWorld || !paused);
  };

  pauseMenu.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, label")) return;
    event.preventDefault();
    player.resume();
  });
  resumeButton.addEventListener("click", () => player.resume());
  // World switching stays on the home screen; the pause menu only exits back there.
  homeButton.addEventListener("click", () => {
    void exitToHome();
  });
  qualityButton.addEventListener("click", () => cycleQualityPreset());
  superUltraToggle.addEventListener("change", () => {
    setSuperUltraEnabled(superUltraToggle.checked);
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
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("keydown", (event) => {
  if (event.code === "F3") {
    event.preventDefault();
    debugVisible = !debugVisible;
    debugPanel.classList.toggle("is-hidden", !debugVisible);
    return;
  }

  if (event.code === "F4") {
    event.preventDefault();
    cycleQualityPreset();
    return;
  }

  if (!inWorld) return;

  if (/^Digit[1-5]$/.test(event.code)) {
    selectedBlockIndex = Number(event.code.at(-1)) - 1;
  }

  if (event.code === "KeyF" && player.isLooking()) {
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
  if (!inWorld || !player.isLooking()) return;

  camera.getWorldDirection(direction);
  const hit = voxelRaycast(world, camera.position, direction, 8);
  if (!hit) return;

  if (event.button === 0) {
    world.setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
  }

  if (event.button === 2) {
    const block = PLACEABLE_BLOCKS[selectedBlockIndex];
    const target = {
      x: hit.block.x + hit.normal.x,
      y: hit.block.y + hit.normal.y,
      z: hit.block.z + hit.normal.z
    };
    if (player.overlapsBlock(target.x, target.y, target.z)) return;
    world.setBlock(target.x, target.y, target.z, block);
  }
});

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);

  if (inWorld) {
    player.update(delta);
    camera.getWorldDirection(chunkStreamDirection);
    updateChunkStreamFrustum();
    const playerChunk = world.streamChunksAround(
      camera.position.x,
      camera.position.z,
      scene,
      getLoadRadius(),
      getUnloadRadius(),
      getChunkLoadBudget(),
      chunkStreamDirection,
      chunkStreamFrustum
    );

    for (const toy of toys) {
      toy.update(delta, world);
    }

    world.rebuildDirty(
      scene,
      worldMaterial,
      getChunkRebuildBudget()
    );
    updateHud();
    updateDebug(delta, playerChunk);
    updateMinimap(delta);
  }

  updateSunShadowAnchor();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateChunkStreamFrustum() {
  // The world scheduler only needs camera planes, not renderer state, to prefer visible work.
  camera.updateMatrixWorld();
  chunkStreamProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  chunkStreamFrustum.setFromProjectionMatrix(chunkStreamProjection);
}

function updateHud() {
  const title = document.querySelector("#hud .title");
  title.textContent = `Voxel Sandbox Engine | ${BLOCKS[PLACEABLE_BLOCKS[selectedBlockIndex]].name}`;
}

async function renderHomeWorldList() {
  const activeWorldId = await worldRegistry.getActiveWorldId();
  const worlds = await worldRegistry.listWorlds();

  // Rebuild visible save rows from registry metadata so storage remains the single source of truth.
  homeWorldList.replaceChildren(
    ...worlds.map((savedWorld) => {
      const button = document.createElement("button");
      const isActive = savedWorld.id === activeWorldId;
      button.type = "button";
      button.className = `world-slot${isActive ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", String(isActive));
      button.addEventListener("click", () => {
        void loadWorld(savedWorld.id);
      });
      button.append(
        createWorldSlotLine("world-slot-name", savedWorld.name),
        createWorldSlotLine("world-slot-meta", formatWorldMeta(savedWorld, isActive)),
        createWorldSlotLine("world-slot-seed", `Seed: ${savedWorld.seed || "classic"}`)
      );
      return button;
    })
  );
}

async function createWorldFromForm(event) {
  event.preventDefault();
  if (worldTransitioning) return;

  const worlds = await worldRegistry.listWorlds();
  const name = worldNameInput.value.trim() || `World ${worlds.length + 1}`;
  const seed = worldSeedInput.value.trim() || createReadableSeed();
  const savedWorld = await worldRegistry.createWorld(name, seed);
  worldNameInput.value = "";
  worldSeedInput.value = "";
  await loadWorld(savedWorld.id);
}

async function loadWorld(worldId) {
  if (worldTransitioning) return;
  worldTransitioning = true;

  try {
    const activeWorldId = await worldRegistry.setActiveWorld(worldId);
    const savedWorld = await worldRegistry.getActiveWorld();
    const chunkStorage = await createChunkStorage(activeWorldId);

    // Loading from the home screen is the only place world slots swap into the active engine.
    await world.switchStorage(chunkStorage, scene, savedWorld.seed);
    // Keep first load bounded; larger quality presets stream their extra distance after spawn.
    const spawnLoadRadius = getInitialLoadRadius();
    // For now every world starts near the origin; player-position saves can layer on later.
    await world.preloadSavedChunksAround(0, 0, spawnLoadRadius);
    world.ensureChunksAround(0, 0, spawnLoadRadius);
    world.rebuildDirty(scene, worldMaterial, getChunkRebuildBudget());
    camera.position.set(2, world.highestSolidY(2, 2) + 5, 2);
    updateSunShadowAnchor();
    homeScreen.classList.add("is-hidden");
    pauseMenu.classList.add("is-hidden");
    document.body.classList.add("in-world");
    inWorld = true;
    debugAccumulator = Infinity;
    minimapAccumulator = Infinity;
    minimapHasTerrain = false;
    minimapRefreshRow = MINIMAP_TEXTURE_SIZE;
    player.resume();
  } finally {
    worldTransitioning = false;
  }
}

async function exitToHome() {
  if (worldTransitioning) return;
  worldTransitioning = true;

  try {
    // Leaving play unloads the active chunks first, so the next world starts from a clean scene.
    player.pause(true);
    clearToys();
    await world.flushStorageWrites();
    world.disposeLoadedChunks(scene);
    inWorld = false;
    document.body.classList.remove("in-world", "playing");
    pauseMenu.classList.add("is-hidden");
    homeScreen.classList.remove("is-hidden");
    await renderHomeWorldList();
  } finally {
    worldTransitioning = false;
  }
}

function clearToys() {
  for (const toy of toys) {
    scene.remove(toy.mesh);
    toy.mesh.geometry.dispose();
    toy.mesh.material.dispose();
  }
  toys.length = 0;
}

function createWorldSlotLine(className, text) {
  const line = document.createElement("span");
  line.className = className;
  line.textContent = text;
  return line;
}

function formatWorldMeta(savedWorld, isActive) {
  // The date is intentionally compact so long world names still fit in the pause menu.
  const date = savedWorld.updatedAt
    ? new Date(savedWorld.updatedAt).toLocaleDateString()
    : "new";
  return `${isActive ? "Current" : "Saved"} - ${date}`;
}

function createReadableSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function updateDebug(delta, playerChunk) {
  if (!debugVisible) return;

  const currentFps = Math.min(240, 1 / Math.max(delta, 1 / 240));
  smoothedFps = smoothedFps === 0 ? currentFps : smoothedFps * 0.92 + currentFps * 0.08;
  debugAccumulator += delta;

  if (debugAccumulator < 0.1) return;
  debugAccumulator = 0;

  const stats = world.getStats();
  const render = renderer.info.render;
  const memory = renderer.info.memory;
  debugPanel.textContent = [
    `fps ${Math.round(smoothedFps)}`,
    `chunk ${playerChunk.cx}, ${playerChunk.cz}`,
    `chunks ${stats.loadedChunks} q ${stats.queuedChunks} gen ${stats.loadedThisFrame}/${stats.pendingChunkLoads}`,
    `view ${stats.visibleChunks}/${stats.loadedChunks} culled ${stats.culledChunks}`,
    `mesh q ${stats.dirtyChunks} view ${stats.visibleDirtyChunks} done ${stats.meshedThisFrame}/${stats.pendingMeshBuilds}`,
    `saved ${stats.savedChunks} edited ${stats.modifiedChunks}`,
    `req gen ${stats.requestedLoadsThisFrame} mesh ${stats.requestedMeshesThisFrame}`,
    `quality ${getQualityPreset().label.toLowerCase()} ${getQualityPreset().distanceScale}x px ${renderer.getPixelRatio()}`,
    `map slice ${lastMinimapMs.toFixed(1)}ms`,
    `gpu ${compactText(gpuInfo.vendor, 30)}`,
    compactText(gpuInfo.renderer, 34),
    `calls ${render.calls} tris ${render.triangles}`,
    `geo ${memory.geometries} tex ${memory.textures}`
  ].join("\n");
}

function updateMinimap(delta) {
  minimapAccumulator += delta;
  if (
    minimapRefreshRow >= MINIMAP_TEXTURE_SIZE &&
    minimapAccumulator >= getMinimapInterval()
  ) {
    startMinimapRefresh();
  }

  if (minimapRefreshRow < MINIMAP_TEXTURE_SIZE) {
    updateMinimapTerrainSlice();
  }

  renderMinimap();
}

function startMinimapRefresh() {
  minimapAccumulator = 0;
  minimapRefreshRow = 0;
  minimapRefreshOriginX = camera.position.x;
  minimapRefreshOriginZ = camera.position.z;
  minimapSliceMaxMs = 0;
}

function updateMinimapTerrainSlice() {
  const startedAt = performance.now();
  const data = minimapImage.data;
  const half = MINIMAP_TEXTURE_SIZE / 2;
  const rowEnd = Math.min(
    minimapRefreshRow + getMinimapRowsPerFrame(),
    MINIMAP_TEXTURE_SIZE
  );

  for (let py = minimapRefreshRow; py < rowEnd; py += 1) {
    for (let px = 0; px < MINIMAP_TEXTURE_SIZE; px += 1) {
      const wx = Math.floor(
        minimapRefreshOriginX + (px - half) * MINIMAP_WORLD_PER_TEXEL
      );
      const wz = Math.floor(
        minimapRefreshOriginZ + (py - half) * MINIMAP_WORLD_PER_TEXEL
      );
      const { block, y } = world.getTopBlock(wx, wz);
      const offset = (px + py * MINIMAP_TEXTURE_SIZE) * 4;

      if (!BLOCKS[block].solid) {
        data[offset] = 44;
        data[offset + 1] = 58;
        data[offset + 2] = 72;
        data[offset + 3] = 230;
        continue;
      }

      const shade = 0.58 + (y / WORLD_HEIGHT) * 0.42;
      const color = BLOCKS[block].color;
      data[offset] = color[0] * 255 * shade;
      data[offset + 1] = color[1] * 255 * shade;
      data[offset + 2] = color[2] * 255 * shade;
      data[offset + 3] = 255;
    }
  }

  minimapRefreshRow = rowEnd;
  minimapSliceMaxMs = Math.max(minimapSliceMaxMs, performance.now() - startedAt);

  if (minimapRefreshRow >= MINIMAP_TEXTURE_SIZE) {
    minimapTerrainContext.putImageData(minimapImage, 0, 0);
    minimapDisplayOriginX = minimapRefreshOriginX;
    minimapDisplayOriginZ = minimapRefreshOriginZ;
    minimapHasTerrain = true;
    lastMinimapMs = minimapSliceMaxMs;
    minimapAccumulator = 0;
  }
}

function renderMinimap() {
  minimapContext.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  minimapContext.imageSmoothingEnabled = false;

  if (minimapHasTerrain) {
    minimapContext.drawImage(minimapTerrain, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  } else {
    minimapContext.fillStyle = "rgba(44, 58, 72, 0.9)";
    minimapContext.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  }

  drawMinimapGrid(minimapDisplayOriginX, minimapDisplayOriginZ);
  drawMinimapPlayer(minimapDisplayOriginX, minimapDisplayOriginZ);
}

function drawMinimapGrid(originX, originZ) {
  minimapContext.save();
  minimapContext.strokeStyle = "rgba(255, 255, 255, 0.2)";
  minimapContext.lineWidth = 1;

  const worldMinX = originX - MINIMAP_RANGE / 2;
  const worldMaxX = originX + MINIMAP_RANGE / 2;
  const worldMinZ = originZ - MINIMAP_RANGE / 2;
  const worldMaxZ = originZ + MINIMAP_RANGE / 2;
  const firstChunkX = Math.floor(worldMinX / CHUNK_SIZE) * CHUNK_SIZE;
  const firstChunkZ = Math.floor(worldMinZ / CHUNK_SIZE) * CHUNK_SIZE;

  for (let wx = firstChunkX; wx <= worldMaxX; wx += CHUNK_SIZE) {
    const x = (wx - worldMinX) / MINIMAP_WORLD_PER_PIXEL;
    minimapContext.beginPath();
    minimapContext.moveTo(x, 0);
    minimapContext.lineTo(x, MINIMAP_SIZE);
    minimapContext.stroke();
  }

  for (let wz = firstChunkZ; wz <= worldMaxZ; wz += CHUNK_SIZE) {
    const y = (wz - worldMinZ) / MINIMAP_WORLD_PER_PIXEL;
    minimapContext.beginPath();
    minimapContext.moveTo(0, y);
    minimapContext.lineTo(MINIMAP_SIZE, y);
    minimapContext.stroke();
  }

  minimapContext.restore();
}

function drawMinimapPlayer(originX, originZ) {
  const center = MINIMAP_SIZE / 2;
  const playerX = center + (camera.position.x - originX) / MINIMAP_WORLD_PER_PIXEL;
  const playerY = center + (camera.position.z - originZ) / MINIMAP_WORLD_PER_PIXEL;
  camera.getWorldDirection(minimapDirection);

  minimapContext.save();
  minimapContext.translate(playerX, playerY);
  minimapContext.rotate(Math.atan2(minimapDirection.x, -minimapDirection.z));

  minimapContext.fillStyle = "#f1c453";
  minimapContext.strokeStyle = "rgba(0, 0, 0, 0.45)";
  minimapContext.lineWidth = 1.5;
  minimapContext.beginPath();
  minimapContext.moveTo(0, -8);
  minimapContext.lineTo(5, 6);
  minimapContext.lineTo(0, 3);
  minimapContext.lineTo(-5, 6);
  minimapContext.closePath();
  minimapContext.fill();
  minimapContext.stroke();
  minimapContext.restore();
}

function setQualityPreset(presetId, persist = true) {
  qualityPresetId = normalizeQualityPresetId(presetId);
  const preset = getQualityPreset();

  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.autoUpdate = preset.shadows;
  renderer.shadowMap.needsUpdate = true;
  sun.intensity = preset.sunIntensity;
  configureSunShadow(preset, true);
  skyLight.intensity = preset.skyIntensity;
  scene.fog.near = preset.fogNear;
  scene.fog.far = preset.fogFar;
  camera.far = preset.cameraFar;
  camera.updateProjectionMatrix();
  updateSunShadowAnchor();

  qualityButton.textContent = `Quality: ${preset.label}`;
  qualityButton.setAttribute("aria-label", `Quality preset: ${preset.label}`);
  document.body.dataset.quality = qualityPresetId;

  debugAccumulator = Infinity;
  minimapAccumulator = Infinity;
  minimapRefreshRow = MINIMAP_TEXTURE_SIZE;
  if (persist) writeQualityPreference(qualityPresetId);
}

function setSuperUltraEnabled(enabled, persist = true) {
  superUltraEnabled = enabled;
  syncSuperUltraToggle();

  if (persist) writeSuperUltraPreference(superUltraEnabled);
  if (superUltraEnabled) {
    setQualityPreset(SUPER_ULTRA_PRESET_ID);
    return;
  }

  if (qualityPresetId === SUPER_ULTRA_PRESET_ID) {
    setQualityPreset("ultra");
  }
}

function syncSuperUltraToggle() {
  superUltraToggle.checked = superUltraEnabled;
  superUltraToggle.setAttribute("aria-checked", String(superUltraEnabled));
  document.body.classList.toggle("super-ultra-enabled", superUltraEnabled);
}

function configureSunShadow(preset, resetShadowMap) {
  sun.castShadow = preset.shadows;
  sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sun.shadow.camera.left = -preset.shadowCameraSize;
  sun.shadow.camera.right = preset.shadowCameraSize;
  sun.shadow.camera.top = preset.shadowCameraSize;
  sun.shadow.camera.bottom = -preset.shadowCameraSize;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = preset.shadowCameraFar;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = preset.shadowBias;
  sun.shadow.normalBias = preset.shadowNormalBias;

  if (resetShadowMap) resetSunShadowMap();
}

function resetSunShadowMap() {
  // Three.js allocates shadow render targets lazily; quality changes need a clean target.
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  if (sun.shadow.mapPass) {
    sun.shadow.mapPass.dispose();
    sun.shadow.mapPass = null;
  }
}

function updateSunShadowAnchor() {
  // Keep the directional light stable over the player's local chunk window.
  sunTarget.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sunTarget.position).add(SUN_OFFSET);
  sunTarget.updateMatrixWorld();
}

function cycleQualityPreset() {
  const selectablePresets = getSelectableQualityPresets();
  const currentIndex = selectablePresets.indexOf(qualityPresetId);
  const nextIndex = (currentIndex + 1) % selectablePresets.length;
  setQualityPreset(selectablePresets[nextIndex]);
}

function getSelectableQualityPresets() {
  return superUltraEnabled
    ? [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID]
    : QUALITY_PRESET_ORDER;
}

function getRenderPixelRatio() {
  return Math.min(window.devicePixelRatio, getQualityPreset().pixelRatioLimit);
}

function getLoadRadius() {
  return getQualityPreset().loadRadius;
}

function getInitialLoadRadius() {
  // High and ultra should not freeze world entry by synchronously building every distant chunk.
  return Math.min(getLoadRadius(), QUALITY_PRESETS.low.loadRadius);
}

function getUnloadRadius() {
  return getQualityPreset().unloadRadius;
}

function getChunkLoadBudget() {
  return getQualityPreset().chunkLoads;
}

function getChunkRebuildBudget() {
  return getQualityPreset().chunkRebuilds;
}

function getMinimapInterval() {
  return getQualityPreset().minimapInterval;
}

function getMinimapRowsPerFrame() {
  return getQualityPreset().minimapRowsPerFrame;
}

function readGpuInfo(activeRenderer) {
  const gl = activeRenderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    vendor: debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR),
    renderer: debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
  };
}

function compactText(value, maxLength) {
  const text = String(value || "unknown");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function getQualityPreset() {
  return QUALITY_PRESETS[qualityPresetId] ?? QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
}

function normalizeQualityPresetId(presetId) {
  if (!QUALITY_PRESETS[presetId]) return DEFAULT_QUALITY_PRESET;
  if (presetId === SUPER_ULTRA_PRESET_ID && !superUltraEnabled) return "ultra";
  return presetId;
}

function readQualityPreference() {
  try {
    const storedPreset = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (QUALITY_PRESETS[storedPreset]) return normalizeQualityPresetId(storedPreset);

    // Keep old sessions intuitive: the previous "potato on" setting is now "low".
    if (localStorage.getItem(LEGACY_POTATO_STORAGE_KEY) === "true") return "low";
    return DEFAULT_QUALITY_PRESET;
  } catch {
    return DEFAULT_QUALITY_PRESET;
  }
}

function readSuperUltraPreference() {
  try {
    return localStorage.getItem(SUPER_ULTRA_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSuperUltraPreference(enabled) {
  try {
    localStorage.setItem(SUPER_ULTRA_STORAGE_KEY, String(enabled));
  } catch {
    // The warning toggle is a convenience; Super Ultra can still be enabled this session.
  }
}

function writeQualityPreference(presetId) {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, presetId);
    localStorage.removeItem(LEGACY_POTATO_STORAGE_KEY);
  } catch {
    // Local storage is a convenience here; quality changes should still work without it.
  }
}

void startApp();
