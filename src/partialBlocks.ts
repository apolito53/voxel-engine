import * as THREE from "three";
import { createBlockMeshKey, getTintedBlockColor } from "./blockColors";
import { getSunlitFaceShade } from "./voxelLighting";

export const PARTIAL_BLOCK_CORE_DAMAGE = 1;
export const PARTIAL_BLOCK_MAX_CUTS_PER_CELL = 4;

const PARTIAL_BLOCK_FACE_SEGMENTS = 5;
const PARTIAL_BLOCK_MIN_RADIUS = 0.26;
const PARTIAL_BLOCK_MAX_RADIUS = 0.46;
const PARTIAL_BLOCK_MIN_DEPTH = 0.24;
const PARTIAL_BLOCK_MAX_DEPTH = 0.58;
const PARTIAL_BLOCK_INNER_DARKENING = 0.55;

export type PartialBlockPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PartialBlockCut = {
  readonly normal: PartialBlockPosition;
  readonly localPoint: PartialBlockPosition;
  readonly radius: number;
  readonly depth: number;
  readonly seed: number;
};

export type PartialBlockCell = {
  readonly block: number;
  readonly position: PartialBlockPosition;
  readonly cuts: readonly PartialBlockCut[];
  readonly damage: number;
  readonly maxHealth: number;
};

export type PartialBlockFaceVisibility = (
  cell: PartialBlockCell,
  normal: PartialBlockPosition
) => boolean;

type PartialBlockFace = {
  readonly normal: PartialBlockPosition;
  readonly localOrigin: PartialBlockPosition;
  readonly tangent: PartialBlockPosition;
  readonly bitangent: PartialBlockPosition;
};

type MutablePartialBlockGeometry = {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly indices: number[];
};

export class PartialBlockMeshField {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly scene: THREE.Scene;
  private stats: PartialBlockMeshStats = EMPTY_PARTIAL_BLOCK_MESH_STATS;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide
      })
    );
    this.mesh.name = "Partial block field";
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  getStats(): PartialBlockMeshStats {
    return this.stats;
  }

  update(cells: readonly PartialBlockCell[], isFaceVisible: PartialBlockFaceVisibility): void {
    const geometryData: MutablePartialBlockGeometry = {
      positions: [],
      normals: [],
      colors: [],
      indices: []
    };

    for (const cell of cells) {
      addPartialBlockCellGeometry(geometryData, cell, isFaceVisible);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(geometryData.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(geometryData.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(geometryData.colors, 3));
    geometry.setIndex(geometryData.indices);
    if (geometryData.positions.length > 0) {
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    } else {
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    }

    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.visible = cells.length > 0;
    this.stats = {
      cells: cells.length,
      vertices: geometryData.positions.length / 3,
      triangles: geometryData.indices.length / 3
    };
  }

  clear(): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BufferGeometry();
    this.mesh.visible = false;
    this.stats = EMPTY_PARTIAL_BLOCK_MESH_STATS;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export type PartialBlockMeshStats = {
  readonly cells: number;
  readonly vertices: number;
  readonly triangles: number;
};

export const EMPTY_PARTIAL_BLOCK_MESH_STATS: PartialBlockMeshStats = {
  cells: 0,
  vertices: 0,
  triangles: 0
};

export function createPartialBlockKey(position: PartialBlockPosition): string {
  return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
}

export function createPartialBlockCut({
  block,
  position,
  point,
  normal,
  speed,
  cutIndex
}: {
  readonly block: number;
  readonly position: PartialBlockPosition;
  readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly speed: number;
  readonly cutIndex: number;
}): PartialBlockCut {
  const localPoint = {
    x: clamp01(point.x - Math.floor(position.x)),
    y: clamp01(point.y - Math.floor(position.y)),
    z: clamp01(point.z - Math.floor(position.z))
  };
  const normalizedNormal = normalizeAxisNormal(normal);
  const speedT = clamp01((speed - 2) / 22);
  const seed = hashPartialBlockCut(block, position, normalizedNormal, cutIndex);

  return {
    normal: normalizedNormal,
    localPoint,
    radius: lerp(PARTIAL_BLOCK_MIN_RADIUS, PARTIAL_BLOCK_MAX_RADIUS, speedT) *
      (0.88 + hashUnit(seed ^ 0x9e3779b9) * 0.24),
    depth: lerp(PARTIAL_BLOCK_MIN_DEPTH, PARTIAL_BLOCK_MAX_DEPTH, speedT) *
      (0.86 + hashUnit(seed ^ 0x7f4a7c15) * 0.28),
    seed
  };
}

export function addPartialBlockCellGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  isFaceVisible: PartialBlockFaceVisibility
): void {
  for (const face of PARTIAL_BLOCK_FACES) {
    if (!isFaceVisible(cell, face.normal)) continue;
    const cuts = cell.cuts.filter((cut) => isSameNormal(cut.normal, face.normal));
    if (cuts.length > 0) {
      addCarvedFaceGeometry(geometry, cell, face, cuts);
    } else {
      addFlatFaceGeometry(geometry, cell, face);
    }
  }
}

function addFlatFaceGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  face: PartialBlockFace
): void {
  const corners = [
    facePoint(cell.position, face, 0, 0, 0),
    facePoint(cell.position, face, 1, 0, 0),
    facePoint(cell.position, face, 1, 1, 0),
    facePoint(cell.position, face, 0, 1, 0)
  ];
  addQuad(geometry, cell.block, cell.position, face.normal, corners, 1);
}

function addCarvedFaceGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  face: PartialBlockFace,
  cuts: readonly PartialBlockCut[]
): void {
  const firstVertex = geometry.positions.length / 3;

  for (let v = 0; v <= PARTIAL_BLOCK_FACE_SEGMENTS; v += 1) {
    for (let u = 0; u <= PARTIAL_BLOCK_FACE_SEGMENTS; u += 1) {
      const tu = u / PARTIAL_BLOCK_FACE_SEGMENTS;
      const tv = v / PARTIAL_BLOCK_FACE_SEGMENTS;
      const sample = sampleCarvedFacePoint(cell, face, cuts, tu, tv);
      geometry.positions.push(sample.x, sample.y, sample.z);
      geometry.normals.push(face.normal.x, face.normal.y, face.normal.z);
      const color = getTintedBlockColor(
        createBlockMeshKey(cell.block, cell.position.x, cell.position.y, cell.position.z),
        getSunlitFaceShade([face.normal.x, face.normal.y, face.normal.z]) * sample.shade
      );
      geometry.colors.push(...color);
    }
  }

  const stride = PARTIAL_BLOCK_FACE_SEGMENTS + 1;
  for (let v = 0; v < PARTIAL_BLOCK_FACE_SEGMENTS; v += 1) {
    for (let u = 0; u < PARTIAL_BLOCK_FACE_SEGMENTS; u += 1) {
      const a = firstVertex + u + v * stride;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      geometry.indices.push(a, b, c, a, c, d);
    }
  }
}

function sampleCarvedFacePoint(
  cell: PartialBlockCell,
  face: PartialBlockFace,
  cuts: readonly PartialBlockCut[],
  u: number,
  v: number
): { readonly x: number; readonly y: number; readonly z: number; readonly shade: number } {
  let inward = 0;
  let strongestCutSeed = cuts[0]?.seed ?? 0;

  for (const cut of cuts) {
    const cutU = dotPosition(cut.localPoint, face.tangent);
    const cutV = dotPosition(cut.localPoint, face.bitangent);
    const distance = Math.hypot(u - cutU, v - cutV);
    const normalizedDistance = distance / Math.max(0.001, cut.radius);
    if (normalizedDistance >= 1) continue;

    const falloff = (1 - normalizedDistance * normalizedDistance) ** 2;
    const lumpyNoise = 0.82 + hashUnit(cut.seed ^ (Math.floor(u * 37) * 73856093) ^ (Math.floor(v * 41) * 19349663)) * 0.28;
    const cutInward = Math.min(PARTIAL_BLOCK_MAX_DEPTH, cut.depth * falloff * lumpyNoise);
    if (cutInward > inward) {
      inward = cutInward;
      strongestCutSeed = cut.seed;
    }
  }

  const point = facePoint(cell.position, face, u, v, inward);
  const chipNoise = hashUnit(strongestCutSeed ^ (Math.floor(u * 11) * 83492791) ^ (Math.floor(v * 13) * 2654435761));
  const shade = 1 - Math.min(PARTIAL_BLOCK_INNER_DARKENING, inward * 0.95) + chipNoise * 0.08;
  return {
    x: point.x,
    y: point.y,
    z: point.z,
    shade: Math.max(0.28, Math.min(1.08, shade))
  };
}

function addQuad(
  geometry: MutablePartialBlockGeometry,
  block: number,
  position: PartialBlockPosition,
  normal: PartialBlockPosition,
  corners: readonly PartialBlockPosition[],
  shadeMultiplier: number
): void {
  const base = geometry.positions.length / 3;
  const shade = getSunlitFaceShade([normal.x, normal.y, normal.z]) * shadeMultiplier;
  const color = getTintedBlockColor(createBlockMeshKey(block, position.x, position.y, position.z), shade);

  for (const corner of corners) {
    geometry.positions.push(corner.x, corner.y, corner.z);
    geometry.normals.push(normal.x, normal.y, normal.z);
    geometry.colors.push(...color);
  }

  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function facePoint(
  blockPosition: PartialBlockPosition,
  face: PartialBlockFace,
  u: number,
  v: number,
  inward: number
): PartialBlockPosition {
  return {
    x: blockPosition.x + face.localOrigin.x + face.tangent.x * u + face.bitangent.x * v - face.normal.x * inward,
    y: blockPosition.y + face.localOrigin.y + face.tangent.y * u + face.bitangent.y * v - face.normal.y * inward,
    z: blockPosition.z + face.localOrigin.z + face.tangent.z * u + face.bitangent.z * v - face.normal.z * inward
  };
}

function normalizeAxisNormal(normal: Pick<THREE.Vector3, "x" | "y" | "z">): PartialBlockPosition {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return { x: normal.x >= 0 ? 1 : -1, y: 0, z: 0 };
  if (ay >= ax && ay >= az) return { x: 0, y: normal.y >= 0 ? 1 : -1, z: 0 };
  return { x: 0, y: 0, z: normal.z >= 0 ? 1 : -1 };
}

function dotPosition(left: PartialBlockPosition, right: PartialBlockPosition): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function isSameNormal(left: PartialBlockPosition, right: PartialBlockPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function hashPartialBlockCut(
  block: number,
  position: PartialBlockPosition,
  normal: PartialBlockPosition,
  cutIndex: number
): number {
  let hash = 2166136261;
  hash = mixHash(hash ^ Math.imul(block, 3266489917));
  hash = mixHash(hash ^ Math.imul(Math.floor(position.x), 374761393));
  hash = mixHash(hash ^ Math.imul(Math.floor(position.y), 668265263));
  hash = mixHash(hash ^ Math.imul(Math.floor(position.z), 2246822519));
  hash = mixHash(hash ^ Math.imul(normal.x + 2, 1597334677));
  hash = mixHash(hash ^ Math.imul(normal.y + 2, 3812015801));
  hash = mixHash(hash ^ Math.imul(normal.z + 2, 958282341));
  hash = mixHash(hash ^ Math.imul(cutIndex + 1, 1103515245));
  return hash >>> 0;
}

function hashUnit(value: number): number {
  return mixHash(value) / 0xffffffff;
}

function mixHash(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const PARTIAL_BLOCK_FACES: readonly PartialBlockFace[] = [
  {
    normal: { x: 1, y: 0, z: 0 },
    localOrigin: { x: 1, y: 0, z: 0 },
    tangent: { x: 0, y: 0, z: 1 },
    bitangent: { x: 0, y: 1, z: 0 }
  },
  {
    normal: { x: -1, y: 0, z: 0 },
    localOrigin: { x: 0, y: 0, z: 1 },
    tangent: { x: 0, y: 0, z: -1 },
    bitangent: { x: 0, y: 1, z: 0 }
  },
  {
    normal: { x: 0, y: 1, z: 0 },
    localOrigin: { x: 0, y: 1, z: 1 },
    tangent: { x: 1, y: 0, z: 0 },
    bitangent: { x: 0, y: 0, z: -1 }
  },
  {
    normal: { x: 0, y: -1, z: 0 },
    localOrigin: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    bitangent: { x: 0, y: 0, z: 1 }
  },
  {
    normal: { x: 0, y: 0, z: 1 },
    localOrigin: { x: 1, y: 0, z: 1 },
    tangent: { x: -1, y: 0, z: 0 },
    bitangent: { x: 0, y: 1, z: 0 }
  },
  {
    normal: { x: 0, y: 0, z: -1 },
    localOrigin: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    bitangent: { x: 0, y: 1, z: 0 }
  }
];
