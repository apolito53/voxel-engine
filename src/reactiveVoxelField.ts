import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks";

export type ReactiveVoxelFieldWorld = {
  getTopBlock(x: number, z: number): { readonly block: number; readonly y: number };
};

export type ReactiveVoxelFieldUpdateOptions = {
  readonly enabled: boolean;
  readonly world: ReactiveVoxelFieldWorld;
  readonly playerPosition: THREE.Vector3;
  readonly playerSpeed: number;
  readonly delta: number;
};

type FieldCell = {
  readonly offsetX: number;
  readonly offsetZ: number;
  worldX: number;
  worldZ: number;
  block: number;
  surfaceY: number;
};

const FIELD_RADIUS_BLOCKS = 9;
const FIELD_DIAMETER_BLOCKS = FIELD_RADIUS_BLOCKS * 2 + 1;
const FIELD_INSTANCE_COUNT = FIELD_DIAMETER_BLOCKS * FIELD_DIAMETER_BLOCKS;
const TERRAIN_REFRESH_INTERVAL_SECONDS = 0.2;
const RIPPLE_INFLUENCE_RADIUS_METERS = 6.5;
const RIPPLE_HEIGHT_METERS = 0.42;
const IDLE_LIFT_METERS = 0.03;
const CUBE_WIDTH_METERS = 0.68;
const BASE_CUBE_HEIGHT_METERS = 0.1;
const STRETCH_CUBE_HEIGHT_METERS = 0.38;
const RIPPLE_SPEED = 7.5;
const RIPPLE_FREQUENCY = 2.4;
const SURFACE_GAP_METERS = 0.025;
const CREST_COLOR = new THREE.Color(0x7df6d0);
const LOW_TIDE_COLOR = new THREE.Color(0x1c8aa0);
const HIDDEN_SCALE = new THREE.Vector3(0, 0, 0);

export class ReactiveVoxelField {
  readonly object: THREE.Group;
  private readonly geometry: THREE.BoxGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly cells: FieldCell[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private anchorX = Number.NaN;
  private anchorZ = Number.NaN;
  private elapsedSeconds = 0;
  private terrainRefreshTimerSeconds = TERRAIN_REFRESH_INTERVAL_SECONDS;

  constructor(scene: THREE.Scene) {
    this.object = new THREE.Group();
    this.object.name = "Reactive voxel field";
    this.object.visible = false;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.7,
      vertexColors: true
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, FIELD_INSTANCE_COUNT);
    this.mesh.name = "Reactive ripple cubes";
    this.mesh.count = FIELD_INSTANCE_COUNT;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.add(this.mesh);

    for (let offsetZ = -FIELD_RADIUS_BLOCKS; offsetZ <= FIELD_RADIUS_BLOCKS; offsetZ += 1) {
      for (let offsetX = -FIELD_RADIUS_BLOCKS; offsetX <= FIELD_RADIUS_BLOCKS; offsetX += 1) {
        this.cells.push({
          offsetX,
          offsetZ,
          worldX: 0,
          worldZ: 0,
          block: BLOCK.air,
          surfaceY: 0
        });
      }
    }

    this.hideInstances();
    scene.add(this.object);
  }

  update(options: ReactiveVoxelFieldUpdateOptions): void {
    if (!options.enabled) {
      this.hide();
      return;
    }

    this.elapsedSeconds += Math.max(0, options.delta);
    this.terrainRefreshTimerSeconds += Math.max(0, options.delta);

    const nextAnchorX = Math.floor(options.playerPosition.x);
    const nextAnchorZ = Math.floor(options.playerPosition.z);
    const needsTerrainRefresh =
      nextAnchorX !== this.anchorX ||
      nextAnchorZ !== this.anchorZ ||
      this.terrainRefreshTimerSeconds >= TERRAIN_REFRESH_INTERVAL_SECONDS;

    if (needsTerrainRefresh) {
      this.refreshTerrain(options.world, nextAnchorX, nextAnchorZ);
    }

    const movementStrength = THREE.MathUtils.clamp(options.playerSpeed / 7, 0, 1);
    for (let index = 0; index < this.cells.length; index += 1) {
      this.writeCellInstance(index, this.cells[index], options.playerPosition, movementStrength);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.object.visible = true;
  }

  hide(): void {
    if (!this.object.visible) return;
    this.object.visible = false;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private refreshTerrain(world: ReactiveVoxelFieldWorld, anchorX: number, anchorZ: number): void {
    this.anchorX = anchorX;
    this.anchorZ = anchorZ;
    this.terrainRefreshTimerSeconds = 0;

    for (const cell of this.cells) {
      const blockX = anchorX + cell.offsetX;
      const blockZ = anchorZ + cell.offsetZ;
      const top = world.getTopBlock(blockX, blockZ);
      cell.worldX = blockX;
      cell.worldZ = blockZ;
      cell.block = top.block;
      cell.surfaceY = top.y + 1;
    }
  }

  private writeCellInstance(
    index: number,
    cell: FieldCell,
    playerPosition: THREE.Vector3,
    movementStrength: number
  ): void {
    if (cell.block === BLOCK.air) {
      this.matrix.compose(this.position.set(0, 0, 0), this.rotation, HIDDEN_SCALE);
      this.mesh.setMatrixAt(index, this.matrix);
      this.mesh.setColorAt(index, this.color.setHex(0x000000));
      return;
    }

    const centerX = cell.worldX + 0.5;
    const centerZ = cell.worldZ + 0.5;
    const dx = centerX - playerPosition.x;
    const dz = centerZ - playerPosition.z;
    const distance = Math.hypot(dx, dz);
    const influence = 1 - THREE.MathUtils.smoothstep(distance, 0, RIPPLE_INFLUENCE_RADIUS_METERS);
    const wave = Math.sin(this.elapsedSeconds * RIPPLE_SPEED - distance * RIPPLE_FREQUENCY);
    const crest = (wave + 1) / 2;
    const reactiveStrength = influence * (0.35 + movementStrength * 0.65);
    const lift = IDLE_LIFT_METERS + crest * RIPPLE_HEIGHT_METERS * reactiveStrength;
    const height = BASE_CUBE_HEIGHT_METERS + STRETCH_CUBE_HEIGHT_METERS * influence * (0.45 + crest * 0.55);

    this.position.set(
      centerX,
      cell.surfaceY + SURFACE_GAP_METERS + height / 2 + lift,
      centerZ
    );
    this.scale.set(CUBE_WIDTH_METERS, height, CUBE_WIDTH_METERS);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);

    // Borrow the terrain block color, then push nearby ripple crests toward a
    // readable teal so the effect is visible without becoming a second terrain
    // palette or hiding what material is underneath.
    const blockColor = BLOCKS[cell.block]?.color ?? BLOCKS[BLOCK.grass].color;
    this.color.setRGB(blockColor[0], blockColor[1], blockColor[2]);
    this.color.lerp(LOW_TIDE_COLOR, 0.18);
    this.color.lerp(CREST_COLOR, influence * (0.2 + crest * 0.35));
    this.color.multiplyScalar(0.85 + influence * 0.22 + crest * influence * 0.18);
    this.mesh.setColorAt(index, this.color);
  }

  private hideInstances(): void {
    for (let index = 0; index < FIELD_INSTANCE_COUNT; index += 1) {
      this.matrix.compose(this.position.set(0, 0, 0), this.rotation, HIDDEN_SCALE);
      this.mesh.setMatrixAt(index, this.matrix);
      this.mesh.setColorAt(index, this.color.setHex(0x000000));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
