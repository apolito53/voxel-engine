import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks";

export const IMPACT_CRATER_MAX_STAMPS = 96;

const IMPACT_CRATER_SEGMENTS = 14;
const IMPACT_CRATER_SURFACE_LIFT = 0.004;
const IMPACT_CRATER_CENTER_LIFT = 0.005;
const IMPACT_CRATER_INNER_LIFT = 0.009;
const IMPACT_CRATER_RIM_LIFT = 0.018;
const IMPACT_CRATER_MIN_RADIUS = 0.12;
const IMPACT_CRATER_MAX_RADIUS = 0.32;
const IMPACT_CRATER_FACE_MARGIN = 0.08;
const IMPACT_CRATER_SPEED_RANGE = 18;

export type ImpactCraterBlockPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type ImpactCraterStamp = {
  readonly block: number;
  readonly blockPosition: ImpactCraterBlockPosition;
  readonly normal: THREE.Vector3;
  readonly point: THREE.Vector3;
  readonly speed: number;
  readonly destroyed?: boolean;
};

export type ImpactCraterFieldStats = {
  readonly craters: number;
  readonly vertices: number;
  readonly triangles: number;
};

type StoredImpactCrater = {
  readonly block: number;
  readonly blockPosition: ImpactCraterBlockPosition;
  readonly center: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly tangent: THREE.Vector3;
  readonly bitangent: THREE.Vector3;
  readonly radius: number;
  readonly seed: number;
};

const EMPTY_IMPACT_CRATER_STATS: ImpactCraterFieldStats = {
  craters: 0,
  vertices: 0,
  triangles: 0
};

export type ImpactCraterWorld = {
  getBlock(x: number, y: number, z: number): number;
};

export type ImpactCraterDamageResult = {
  readonly block: number;
  readonly position: ImpactCraterBlockPosition;
  readonly destroyed: boolean;
};

export type ImpactCraterImpact = {
  readonly normal: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly speed: number;
};

export class ImpactCraterField {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly scene: THREE.Scene;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly craters: StoredImpactCrater[] = [];
  private stats = EMPTY_IMPACT_CRATER_STATS;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = "Impact crater field";
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  getStats(): ImpactCraterFieldStats {
    return this.stats;
  }

  stamp(stamp: ImpactCraterStamp): boolean {
    // First pass is deliberately a decal-like scar, not terrain surgery. The
    // block/rubble systems still own collision, material, support, and saves.
    const normal = snapNormalToDominantAxis(stamp.normal);
    if (!normal) return false;

    this.craters.push(createStoredImpactCrater(stamp, normal));
    while (this.craters.length > IMPACT_CRATER_MAX_STAMPS) {
      this.craters.shift();
    }
    this.rebuildMesh();
    return true;
  }

  removeBlock(blockPosition: ImpactCraterBlockPosition): void {
    const previousCount = this.craters.length;
    for (let index = this.craters.length - 1; index >= 0; index -= 1) {
      if (!isSameBlockPosition(this.craters[index].blockPosition, blockPosition)) continue;
      this.craters.splice(index, 1);
    }
    if (this.craters.length === previousCount) return;

    this.rebuildMesh();
  }

  clear(): void {
    this.craters.length = 0;
    this.replaceGeometry(new THREE.BufferGeometry());
    this.mesh.visible = false;
    this.stats = EMPTY_IMPACT_CRATER_STATS;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.craters.length = 0;
    this.stats = EMPTY_IMPACT_CRATER_STATS;
  }

  private rebuildMesh(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (const crater of this.craters) {
      addCraterGeometry(positions, colors, indices, crater);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.replaceGeometry(geometry);
    this.mesh.visible = this.craters.length > 0;
    this.stats = {
      craters: this.craters.length,
      vertices: positions.length / 3,
      triangles: indices.length / 3
    };
  }

  private replaceGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }
}

export function createImpactCraterStampForTerrainImpact(
  world: ImpactCraterWorld,
  result: ImpactCraterDamageResult,
  impact: ImpactCraterImpact
): ImpactCraterStamp | null {
  const normal = snapNormalToDominantAxis(impact.normal);
  if (!normal) return null;

  if (!result.destroyed) {
    return {
      block: result.block,
      blockPosition: result.position,
      normal,
      point: impact.position,
      speed: impact.speed,
      destroyed: false
    };
  }

  const hostPosition = {
    x: result.position.x - normal.x,
    y: result.position.y - normal.y,
    z: result.position.z - normal.z
  };
  const hostBlock = world.getBlock(hostPosition.x, hostPosition.y, hostPosition.z);
  const hostDefinition = BLOCKS[hostBlock] ?? BLOCKS[BLOCK.air];
  if (!hostDefinition.solid) return null;

  return {
    block: hostBlock,
    blockPosition: hostPosition,
    normal,
    point: impact.position,
    speed: impact.speed,
    destroyed: true
  };
}

function createStoredImpactCrater(stamp: ImpactCraterStamp, normal: THREE.Vector3): StoredImpactCrater {
  const seed = hashImpactCraterStamp(stamp);
  const speedScale = clamp(stamp.speed / IMPACT_CRATER_SPEED_RANGE, 0, 1);
  const destroyedScale = stamp.destroyed ? 0.05 : 0;
  const radius = clamp(
    IMPACT_CRATER_MIN_RADIUS + speedScale * 0.15 + destroyedScale,
    IMPACT_CRATER_MIN_RADIUS,
    IMPACT_CRATER_MAX_RADIUS
  );
  const center = getFaceClampedImpactPoint(stamp.blockPosition, stamp.point, normal)
    .addScaledVector(normal, IMPACT_CRATER_SURFACE_LIFT);
  const basis = createFaceBasis(normal);

  return {
    block: stamp.block,
    blockPosition: stamp.blockPosition,
    center,
    normal,
    tangent: basis.tangent,
    bitangent: basis.bitangent,
    radius,
    seed
  };
}

function isSameBlockPosition(left: ImpactCraterBlockPosition, right: ImpactCraterBlockPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function addCraterGeometry(
  positions: number[],
  colors: number[],
  indices: number[],
  crater: StoredImpactCrater
): void {
  const baseVertex = positions.length / 3;
  // Keep every vertex slightly outside the hit face. That lets a damaged block
  // show a dark dent without the terrain mesh hiding the center of the crater.
  addCraterVertex(
    positions,
    colors,
    crater.center.clone().addScaledVector(crater.normal, IMPACT_CRATER_CENTER_LIFT),
    getCraterColor(crater.block, 0.13)
  );

  const angleOffset = hashUnit(crater.seed ^ 0x9e3779b9) * Math.PI * 2;
  for (let index = 0; index < IMPACT_CRATER_SEGMENTS; index += 1) {
    const angle = angleOffset + (index / IMPACT_CRATER_SEGMENTS) * Math.PI * 2;
    const innerRadius = crater.radius * (0.36 + hashUnit(crater.seed + index * 17) * 0.1);
    addCraterVertex(
      positions,
      colors,
      getCraterRingPoint(crater, angle, innerRadius, IMPACT_CRATER_INNER_LIFT),
      getCraterColor(crater.block, 0.2)
    );
  }

  for (let index = 0; index < IMPACT_CRATER_SEGMENTS; index += 1) {
    const angle = angleOffset + (index / IMPACT_CRATER_SEGMENTS) * Math.PI * 2;
    const outerRadius = crater.radius * (0.82 + hashUnit(crater.seed + index * 31) * 0.26);
    const rimLift = IMPACT_CRATER_RIM_LIFT * (0.72 + hashUnit(crater.seed + index * 43) * 0.55);
    addCraterVertex(
      positions,
      colors,
      getCraterRingPoint(crater, angle, outerRadius, rimLift),
      getCraterColor(crater.block, 0.48)
    );
  }

  const innerStart = baseVertex + 1;
  const outerStart = innerStart + IMPACT_CRATER_SEGMENTS;
  for (let index = 0; index < IMPACT_CRATER_SEGMENTS; index += 1) {
    const nextIndex = (index + 1) % IMPACT_CRATER_SEGMENTS;
    const inner = innerStart + index;
    const nextInner = innerStart + nextIndex;
    const outer = outerStart + index;
    const nextOuter = outerStart + nextIndex;

    indices.push(baseVertex, inner, nextInner);
    indices.push(inner, outer, nextOuter);
    indices.push(inner, nextOuter, nextInner);
  }
}

function addCraterVertex(
  positions: number[],
  colors: number[],
  point: THREE.Vector3,
  color: THREE.Color
): void {
  positions.push(point.x, point.y, point.z);
  colors.push(color.r, color.g, color.b);
}

function getCraterRingPoint(
  crater: StoredImpactCrater,
  angle: number,
  radius: number,
  lift: number
): THREE.Vector3 {
  return crater.center.clone()
    .addScaledVector(crater.tangent, Math.cos(angle) * radius)
    .addScaledVector(crater.bitangent, Math.sin(angle) * radius)
    .addScaledVector(crater.normal, lift);
}

function getCraterColor(block: number, shade: number): THREE.Color {
  const definition = BLOCKS[block] ?? BLOCKS[BLOCK.stone] ?? BLOCKS[BLOCK.air];
  return new THREE.Color(
    clamp(definition.color[0] * shade + 0.02, 0, 1),
    clamp(definition.color[1] * shade + 0.018, 0, 1),
    clamp(definition.color[2] * shade + 0.016, 0, 1)
  );
}

function getFaceClampedImpactPoint(
  blockPosition: ImpactCraterBlockPosition,
  point: THREE.Vector3,
  normal: THREE.Vector3
): THREE.Vector3 {
  const minX = blockPosition.x + IMPACT_CRATER_FACE_MARGIN;
  const maxX = blockPosition.x + 1 - IMPACT_CRATER_FACE_MARGIN;
  const minY = blockPosition.y + IMPACT_CRATER_FACE_MARGIN;
  const maxY = blockPosition.y + 1 - IMPACT_CRATER_FACE_MARGIN;
  const minZ = blockPosition.z + IMPACT_CRATER_FACE_MARGIN;
  const maxZ = blockPosition.z + 1 - IMPACT_CRATER_FACE_MARGIN;
  const center = new THREE.Vector3(
    clamp(point.x, minX, maxX),
    clamp(point.y, minY, maxY),
    clamp(point.z, minZ, maxZ)
  );

  if (normal.x !== 0) center.x = normal.x > 0 ? blockPosition.x + 1 : blockPosition.x;
  if (normal.y !== 0) center.y = normal.y > 0 ? blockPosition.y + 1 : blockPosition.y;
  if (normal.z !== 0) center.z = normal.z > 0 ? blockPosition.z + 1 : blockPosition.z;
  return center;
}

function snapNormalToDominantAxis(normal: THREE.Vector3): THREE.Vector3 | null {
  if (normal.lengthSq() <= 0.000001) return null;
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absX >= absY && absX >= absZ) {
    return new THREE.Vector3(Math.sign(normal.x) || 1, 0, 0);
  }
  if (absY >= absX && absY >= absZ) {
    return new THREE.Vector3(0, Math.sign(normal.y) || 1, 0);
  }
  return new THREE.Vector3(0, 0, Math.sign(normal.z) || 1);
}

function createFaceBasis(normal: THREE.Vector3): { readonly tangent: THREE.Vector3; readonly bitangent: THREE.Vector3 } {
  const tangent = Math.abs(normal.y) === 1
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const bitangent = normal.clone().cross(tangent).normalize();
  return { tangent, bitangent };
}

function hashImpactCraterStamp(stamp: ImpactCraterStamp): number {
  let value = 2166136261;
  value = mixHash(value, stamp.block);
  value = mixHash(value, stamp.blockPosition.x);
  value = mixHash(value, stamp.blockPosition.y);
  value = mixHash(value, stamp.blockPosition.z);
  value = mixHash(value, Math.round(stamp.point.x * 100));
  value = mixHash(value, Math.round(stamp.point.y * 100));
  value = mixHash(value, Math.round(stamp.point.z * 100));
  value = mixHash(value, Math.round(stamp.speed * 10));
  return value >>> 0;
}

function mixHash(current: number, value: number): number {
  let mixed = current ^ (Math.round(value) + 0x9e3779b9 + (current << 6) + (current >>> 2));
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function hashUnit(seed: number): number {
  return (mixHash(0x811c9dc5, seed) >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
