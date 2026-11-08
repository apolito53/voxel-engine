import * as THREE from "three";
import {
  BIRD_POPULATION_CAP,
  BirdWildlifeSimulation,
  type BirdWildlifePose,
  type BirdWildlifePosition,
  type BirdWildlifeSnapshot,
  type BirdWildlifeWorld
} from "./birdWildlife";

type BirdColor = "body" | "belly" | "wing" | "tip" | "beak" | "eye";
type BirdPart = {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: BirdColor;
  readonly rotationY?: number;
};
const BODY_PARTS: readonly BirdPart[] = [
  { position: [0, 0, 0], scale: [0.23, 0.23, 0.50], color: "body" },
  { position: [0, -0.085, 0.09], scale: [0.20, 0.11, 0.30], color: "belly" },
  { position: [0, 0.105, 0.29], scale: [0.22, 0.20, 0.23], color: "body" },
  { position: [0, 0.085, 0.445], scale: [0.09, 0.07, 0.15], color: "beak" },
  { position: [-0.07, -0.025, -0.43], scale: [0.10, 0.055, 0.30], color: "tip", rotationY: -0.16 },
  { position: [0.07, -0.025, -0.43], scale: [0.10, 0.055, 0.30], color: "tip", rotationY: 0.16 },
  { position: [-0.112, 0.135, 0.35], scale: [0.025, 0.042, 0.04], color: "eye" },
  { position: [0.112, 0.135, 0.35], scale: [0.025, 0.042, 0.04], color: "eye" }
];
const PARTS_PER_BIRD = BODY_PARTS.length + 4;
const BIRD_PALETTES: readonly Record<BirdColor, number>[] = [
  { body: 0x8d7052, belly: 0xe2cda1, wing: 0x5b493e, tip: 0x36373a, beak: 0xd5a24d, eye: 0x172128 },
  { body: 0x8299a5, belly: 0xd5d9d4, wing: 0x4e6676, tip: 0x344351, beak: 0xd49a58, eye: 0x15202a },
  { body: 0x766450, belly: 0xc87348, wing: 0x51473f, tip: 0x3b3634, beak: 0xbfa16b, eye: 0x15202a },
  { body: 0xb8a349, belly: 0xe3d38d, wing: 0x595d42, tip: 0x3b4437, beak: 0xbf945c, eye: 0x15202a }
];

/** One instanced batch, shared resources, scene lighting/fog, and no UI or timers. */
export class BirdWildlifeRenderer {
  readonly object = new THREE.Group();
  private readonly simulation = new BirdWildlifeSimulation();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0,
    alphaHash: true, transparent: false, depthWrite: true, fog: true
  });
  private readonly mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly opacity = new THREE.InstancedBufferAttribute(new Float32Array(BIRD_POPULATION_CAP * PARTS_PER_BIRD), 1);
  private readonly sky = new THREE.InstancedBufferAttribute(new Float32Array(BIRD_POPULATION_CAP * PARTS_PER_BIRD), 1);
  private readonly birdMatrix = new THREE.Matrix4();
  private readonly wingMatrix = new THREE.Matrix4();
  private readonly localMatrix = new THREE.Matrix4();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly partScale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly color = new THREE.Color();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.object.name = "Ambient bird wildlife";
    this.geometry.setAttribute("birdOpacity", this.opacity);
    this.geometry.setAttribute("birdSky", this.sky);
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float birdOpacity;\nattribute float birdSky;\nvarying float vBirdOpacity;\nvarying float vBirdSky;\nvarying vec3 vBirdWorldPosition;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vBirdOpacity = birdOpacity;
vBirdSky = birdSky;
vec4 birdWorldPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
birdWorldPosition = instanceMatrix * birdWorldPosition;
#endif
vBirdWorldPosition = (modelMatrix * birdWorldPosition).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBirdOpacity;\nvarying float vBirdSky;\nvarying vec3 vBirdWorldPosition;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vBirdOpacity;")
        .replace("#include <fog_fragment>", `#ifdef USE_FOG
float birdFogFactor;
if (vBirdSky > 0.5) {
  birdFogFactor = smoothstep(180.0, 360.0, length(vBirdWorldPosition - cameraPosition));
} else {
  #ifdef FOG_EXP2
  birdFogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  birdFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
}
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, birdFogFactor);
#endif`);
    };
    this.material.customProgramCacheKey = () => "bird-wildlife-opacity-sky-v2";
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, BIRD_POPULATION_CAP * PARTS_PER_BIRD);
    this.mesh.name = "Bird bodies, faces, tails and articulated wings";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    this.sky.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // This one small batch moves continuously. Avoid a stale initial bounding
    // sphere; real terrain depth and the regular scene fog still occlude it.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.object.add(this.mesh);
    scene.add(this.object);
  }

  seed(world: BirdWildlifeWorld, playerFeet: BirdWildlifePosition,
    forward: BirdWildlifePosition = { x: 0, y: 0, z: -1 }): BirdWildlifeSnapshot {
    if (this.disposed) return this.snapshot();
    const snapshot = this.simulation.seed(world, playerFeet, forward);
    this.sync(snapshot);
    return snapshot;
  }

  update(deltaSeconds: number, world: BirdWildlifeWorld, playerEye: BirdWildlifePosition, active: boolean): void {
    if (this.disposed || !active) return;
    this.simulation.update(deltaSeconds, world, playerEye);
    this.sync(this.simulation.snapshot());
  }

  clear(): void {
    this.simulation.clear();
    this.mesh.count = 0;
  }

  snapshot(): BirdWildlifeSnapshot {
    return this.simulation.snapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.object.removeFromParent();
    this.object.clear();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private sync(snapshot: BirdWildlifeSnapshot): void {
    let instance = 0;
    for (const bird of snapshot.birds) {
      if (!bird.visible || bird.opacity <= 0) continue;
      this.position.set(bird.position.x, bird.position.y, bird.position.z);
      this.euler.set(bird.pitch, bird.yaw, bird.bank, "YXZ");
      this.quaternion.setFromEuler(this.euler);
      this.partScale.set(1, 1, 1);
      this.birdMatrix.compose(this.position, this.quaternion, this.partScale);
      for (const part of BODY_PARTS) instance = this.writePart(instance, bird, part, this.birdMatrix);
      if (bird.foldedWings) {
        for (const side of [-1, 1]) {
          instance = this.writePart(instance, bird, {
            position: [side * 0.14, 0, -0.08], scale: [0.075, 0.18, 0.40], color: "wing", rotationY: side * 0.08
          }, this.birdMatrix);
          instance = this.writePart(instance, bird, {
            position: [side * 0.055, -0.215, 0], scale: [0.035, 0.13, 0.065], color: "beak"
          }, this.birdMatrix);
        }
        continue;
      }
      for (const side of [-1, 1]) {
        this.position.set(side * 0.105, 0.045, 0);
        this.partScale.set(1, 1, 1);
        this.euler.set(0, 0, side * bird.wingAngle);
        this.quaternion.setFromEuler(this.euler);
        this.localMatrix.compose(this.position, this.quaternion, this.partScale);
        this.wingMatrix.multiplyMatrices(this.birdMatrix, this.localMatrix);
        instance = this.writePart(instance, bird, {
          position: [side * 0.21, 0, -0.015], scale: [0.42, 0.07, 0.24], color: "wing"
        }, this.wingMatrix);
        instance = this.writePart(instance, bird, {
          position: [side * 0.475, 0, -0.075], scale: [0.20, 0.05, 0.16], color: "tip", rotationY: side * 0.25
        }, this.wingMatrix);
      }
    }
    this.mesh.count = instance;
    this.mesh.instanceMatrix.needsUpdate = instance > 0;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = instance > 0;
    this.opacity.needsUpdate = instance > 0;
    this.sky.needsUpdate = instance > 0;
  }

  private writePart(index: number, bird: BirdWildlifePose, part: BirdPart, parent: THREE.Matrix4): number {
    this.position.set(...part.position);
    this.partScale.set(...part.scale);
    this.euler.set(0, part.rotationY ?? 0, 0);
    this.quaternion.setFromEuler(this.euler);
    this.localMatrix.compose(this.position, this.quaternion, this.partScale);
    this.instanceMatrix.multiplyMatrices(parent, this.localMatrix);
    this.mesh.setMatrixAt(index, this.instanceMatrix);
    const palette = bird.role === "solo" ? 2 + bird.id % 2 : Math.max(0, bird.flockId) % 2;
    this.color.setHex(BIRD_PALETTES[palette][part.color]);
    this.mesh.setColorAt(index, this.color);
    this.opacity.setX(index, bird.opacity);
    this.sky.setX(index, bird.role === "flock" ? 1 : 0);
    return index + 1;
  }
}
