import * as THREE from "three";
import "./style.css";
import { BLOCKS, PLACEABLE_BLOCKS } from "./blocks.js";
import { PlayerController } from "./player.js";
import { PhysicsToy } from "./physics.js";
import { voxelRaycast } from "./raycast.js";
import { VoxelWorld } from "./world.js";

const app = document.querySelector("#app");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb9d8);
scene.fog = new THREE.Fog(0x8fb9d8, 55, 150);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  450
);

const sun = new THREE.DirectionalLight(0xfff0d0, 3.2);
sun.position.set(35, 55, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -75;
sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75;
sun.shadow.camera.bottom = -75;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xb9d9ff, 0x394228, 1.65));

const worldMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0.0
});

const world = new VoxelWorld();
world.generateInitialWorld();
world.rebuildDirty(scene, worldMaterial);

camera.position.set(2, world.highestSolidY(2, 2) + 5, 2);
const player = new PlayerController(camera, renderer.domElement, world);
const pauseMenu = document.querySelector("#pause-menu");
player.onPauseChange = (paused) => {
  pauseMenu.classList.toggle("is-hidden", !paused);
};
pauseMenu.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  player.resume();
});

let selectedBlockIndex = 0;
const toys = [];
const clock = new THREE.Clock();
const direction = new THREE.Vector3();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("keydown", (event) => {
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
  if (!player.isLooking()) return;

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
  world.ensureChunksAround(camera.position.x, camera.position.z);
  player.update(delta);
  world.ensureChunksAround(camera.position.x, camera.position.z);

  for (const toy of toys) {
    toy.update(delta, world);
  }

  world.rebuildDirty(scene, worldMaterial);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateHud() {
  const title = document.querySelector("#hud .title");
  title.textContent = `Voxel Sandbox Engine | ${BLOCKS[PLACEABLE_BLOCKS[selectedBlockIndex]].name}`;
}

animate();
