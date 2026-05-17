import * as THREE from "three";
import { BLOCK_DEBRIS_MAX_VISUAL_AXIS, BLOCK_FRAGMENT_VISUAL_SIZE } from "./blockFragments";

export const DEBRIS_SHAPE_IDS = [
  "chunky-chip",
  "flat-slab",
  "wedge",
  "long-splinter",
  "squat-block",
  "sheared-chunk",
  "corner-chunk",
  "narrow-shard"
] as const;

export type DebrisShapeId = (typeof DEBRIS_SHAPE_IDS)[number];

export type DebrisShape = {
  readonly shapeId: DebrisShapeId;
  readonly visualScale: THREE.Vector3;
  readonly colliderHalfExtents: THREE.Vector3;
  readonly estimatedVisualVolume: number;
};

type VectorLike = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type DebrisShapeSeed = {
  readonly fragmentIndex: number;
  readonly distributedFragmentIndex: number;
  readonly origin: VectorLike;
};

type DebrisShapeTemplate = {
  readonly id: DebrisShapeId;
  readonly baseScale: readonly [number, number, number];
  readonly vertices: readonly RubbleShapeVertex[];
  readonly faces: readonly (readonly number[])[];
};

type RubbleShapeVertex = readonly [number, number, number];

const DEBRIS_VISUAL_SCALE_MIN = BLOCK_FRAGMENT_VISUAL_SIZE * 0.32;
const DEBRIS_VISUAL_SCALE_MAX = BLOCK_DEBRIS_MAX_VISUAL_AXIS;
const DEBRIS_COLLIDER_PADDING = 1.08;
const DEBRIS_SHARD_SIZE_SCALE = 0.58;
const DEBRIS_VOLUME_FIT_EPSILON = 0.000001;

const HEX_FACES: readonly (readonly number[])[] = [
  [1, 3, 7, 5],
  [0, 4, 6, 2],
  [2, 6, 7, 3],
  [0, 1, 5, 4],
  [4, 5, 7, 6],
  [0, 2, 3, 1]
];

const WEDGE_FACES: readonly (readonly number[])[] = [
  [0, 2, 1],
  [3, 4, 5],
  [0, 1, 4, 3],
  [0, 3, 5, 2],
  [1, 2, 5, 4]
];

const PYRAMID_FACES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 4, 1],
  [1, 4, 2],
  [2, 4, 3],
  [3, 4, 0]
];

const DEBRIS_SHAPE_TEMPLATES: readonly DebrisShapeTemplate[] = [
  {
    id: "chunky-chip",
    baseScale: [0.25, 0.24, 0.25],
    vertices: [
      [-0.52, -0.46, -0.5],
      [0.48, -0.5, -0.42],
      [-0.45, 0.5, -0.48],
      [0.52, 0.44, -0.54],
      [-0.5, -0.5, 0.47],
      [0.44, -0.42, 0.52],
      [-0.54, 0.46, 0.5],
      [0.5, 0.52, 0.43]
    ],
    faces: HEX_FACES
  },
  {
    id: "flat-slab",
    baseScale: [0.33, 0.15, 0.28],
    vertices: [
      [-0.5, -0.42, -0.52],
      [0.5, -0.52, -0.43],
      [-0.46, 0.38, -0.5],
      [0.54, 0.45, -0.48],
      [-0.52, -0.48, 0.46],
      [0.44, -0.4, 0.53],
      [-0.48, 0.5, 0.5],
      [0.5, 0.42, 0.44]
    ],
    faces: HEX_FACES
  },
  {
    id: "wedge",
    baseScale: [0.27, 0.24, 0.3],
    vertices: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.48, -0.45],
      [-0.48, 0.5, -0.5],
      [-0.52, -0.46, 0.5],
      [0.46, -0.5, 0.48],
      [-0.5, 0.44, 0.52]
    ],
    faces: WEDGE_FACES
  },
  {
    id: "long-splinter",
    baseScale: [0.16, 0.18, 0.35],
    vertices: [
      [-0.46, -0.5, -0.5],
      [0.5, -0.38, -0.45],
      [-0.42, 0.5, -0.52],
      [-0.52, -0.44, 0.5],
      [0.44, -0.5, 0.48],
      [-0.48, 0.42, 0.52]
    ],
    faces: WEDGE_FACES
  },
  {
    id: "squat-block",
    baseScale: [0.3, 0.2, 0.22],
    vertices: [
      [-0.5, -0.5, -0.46],
      [0.52, -0.44, -0.52],
      [-0.44, 0.42, -0.5],
      [0.46, 0.5, -0.44],
      [-0.52, -0.42, 0.5],
      [0.48, -0.5, 0.46],
      [-0.46, 0.5, 0.52],
      [0.54, 0.4, 0.5]
    ],
    faces: HEX_FACES
  },
  {
    id: "sheared-chunk",
    baseScale: [0.25, 0.26, 0.25],
    vertices: [
      [-0.54, -0.5, -0.48],
      [0.4, -0.46, -0.52],
      [-0.36, 0.5, -0.5],
      [0.58, 0.44, -0.46],
      [-0.58, -0.44, 0.5],
      [0.38, -0.5, 0.48],
      [-0.42, 0.46, 0.52],
      [0.55, 0.5, 0.44]
    ],
    faces: HEX_FACES
  },
  {
    id: "corner-chunk",
    baseScale: [0.23, 0.3, 0.23],
    vertices: [
      [-0.5, -0.5, -0.5],
      [0.52, -0.45, -0.46],
      [0.45, -0.5, 0.5],
      [-0.48, -0.52, 0.46],
      [0.02, 0.5, -0.02]
    ],
    faces: PYRAMID_FACES
  },
  {
    id: "narrow-shard",
    baseScale: [0.14, 0.31, 0.17],
    vertices: [
      [-0.46, -0.5, -0.5],
      [0.5, -0.42, -0.44],
      [-0.44, 0.5, -0.48],
      [-0.5, -0.46, 0.5],
      [0.42, -0.5, 0.46],
      [-0.52, 0.44, 0.5]
    ],
    faces: WEDGE_FACES
  }
];

const shapeTemplatesById = new Map<DebrisShapeId, DebrisShapeTemplate>(
  DEBRIS_SHAPE_TEMPLATES.map((template) => [template.id, template])
);
const geometriesById = new Map<DebrisShapeId, THREE.BufferGeometry>();

export function createDebrisShape(shapeId: DebrisShapeId): DebrisShape {
  const template = getDebrisShapeTemplate(shapeId);
  return createDebrisShapeFromScale(shapeId, scaleDebrisShape(template.baseScale, DEBRIS_SHARD_SIZE_SCALE));
}

export function createDefaultDebrisShape(): DebrisShape {
  return createDebrisShapeFromScale("chunky-chip", [
    BLOCK_FRAGMENT_VISUAL_SIZE,
    BLOCK_FRAGMENT_VISUAL_SIZE,
    BLOCK_FRAGMENT_VISUAL_SIZE
  ]);
}

export function createDebrisShapeForBlock(block: number, seed: DebrisShapeSeed): DebrisShape {
  const seedValue = hashDebrisShapeSeed(block, seed);
  const shapeId = DEBRIS_SHAPE_IDS[seedValue % DEBRIS_SHAPE_IDS.length];
  const template = getDebrisShapeTemplate(shapeId);
  const xJitter = 0.45 + hashUnit(seedValue ^ 0x6d2b79f5) * 1.2;
  const yJitter = 0.45 + hashUnit(seedValue ^ 0x1b873593) * 1.2;
  const zJitter = 0.45 + hashUnit(seedValue ^ 0x85ebca6b) * 1.2;

  return createDebrisShapeFromScale(shapeId, [
    template.baseScale[0] * xJitter * DEBRIS_SHARD_SIZE_SCALE,
    template.baseScale[1] * yJitter * DEBRIS_SHARD_SIZE_SCALE,
    template.baseScale[2] * zJitter * DEBRIS_SHARD_SIZE_SCALE
  ]);
}

export function cloneDebrisShape(shape: DebrisShape): DebrisShape {
  return {
    shapeId: shape.shapeId,
    visualScale: shape.visualScale.clone(),
    colliderHalfExtents: shape.colliderHalfExtents.clone(),
    estimatedVisualVolume: shape.estimatedVisualVolume
  };
}

export function fitDebrisShapeToVolumeBudget(
  shape: DebrisShape,
  maxEstimatedVisualVolume: number
): DebrisShape | null {
  const safeBudget = Math.max(0, Number.isFinite(maxEstimatedVisualVolume) ? maxEstimatedVisualVolume : 0);
  if (safeBudget <= DEBRIS_VOLUME_FIT_EPSILON) return null;
  if (shape.estimatedVisualVolume <= safeBudget) return cloneDebrisShape(shape);

  const fitScale = Math.cbrt(safeBudget / Math.max(shape.estimatedVisualVolume, DEBRIS_VOLUME_FIT_EPSILON)) * 0.985;
  const fittedShape = createDebrisShapeFromScale(shape.shapeId, [
    shape.visualScale.x * fitScale,
    shape.visualScale.y * fitScale,
    shape.visualScale.z * fitScale
  ]);
  return fittedShape.estimatedVisualVolume <= safeBudget + DEBRIS_VOLUME_FIT_EPSILON
    ? fittedShape
    : null;
}

export function getDebrisShapeGeometry(shapeId: DebrisShapeId): THREE.BufferGeometry {
  const existingGeometry = geometriesById.get(shapeId);
  if (existingGeometry) return existingGeometry;

  const geometry = createGeometryFromTemplate(getDebrisShapeTemplate(shapeId));
  geometriesById.set(shapeId, geometry);
  return geometry;
}

function createDebrisShapeFromScale(
  shapeId: DebrisShapeId,
  scale: readonly [number, number, number]
): DebrisShape {
  const visualScale = new THREE.Vector3(
    clamp(scale[0], DEBRIS_VISUAL_SCALE_MIN, DEBRIS_VISUAL_SCALE_MAX),
    clamp(scale[1], DEBRIS_VISUAL_SCALE_MIN, DEBRIS_VISUAL_SCALE_MAX),
    clamp(scale[2], DEBRIS_VISUAL_SCALE_MIN, DEBRIS_VISUAL_SCALE_MAX)
  );
  return {
    shapeId,
    visualScale,
    // Rapier still gets a simple cuboid envelope. Keep it slightly padded so a
    // chipped visual face never pokes obviously through terrain while settling.
    colliderHalfExtents: visualScale.clone().multiplyScalar(0.5 * DEBRIS_COLLIDER_PADDING),
    estimatedVisualVolume: visualScale.x * visualScale.y * visualScale.z
  };
}

function scaleDebrisShape(
  scale: readonly [number, number, number],
  multiplier: number
): readonly [number, number, number] {
  return [
    scale[0] * multiplier,
    scale[1] * multiplier,
    scale[2] * multiplier
  ];
}

function getDebrisShapeTemplate(shapeId: DebrisShapeId): DebrisShapeTemplate {
  const template = shapeTemplatesById.get(shapeId);
  if (!template) {
    throw new Error(`Unknown debris shape id: ${shapeId}`);
  }
  return template;
}

function createGeometryFromTemplate(template: DebrisShapeTemplate): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const face of template.faces) {
    for (let index = 1; index < face.length - 1; index += 1) {
      addTemplateTriangle(
        positions,
        normals,
        template.vertices[face[0]],
        template.vertices[face[index]],
        template.vertices[face[index + 1]]
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addTemplateTriangle(
  positions: number[],
  normals: number[],
  first: RubbleShapeVertex,
  second: RubbleShapeVertex,
  third: RubbleShapeVertex
): void {
  let middle = second;
  let last = third;
  let normal = getTriangleNormal(first, middle, last);

  // Shape templates are hand-authored for readability. Keep the render-facing
  // contract automatic: triangles should point away from the origin so shared
  // shard geometry and baked rubble chunks both survive back-face culling.
  const centroidX = (first[0] + middle[0] + last[0]) / 3;
  const centroidY = (first[1] + middle[1] + last[1]) / 3;
  const centroidZ = (first[2] + middle[2] + last[2]) / 3;
  if (normal[0] * centroidX + normal[1] * centroidY + normal[2] * centroidZ < 0) {
    middle = third;
    last = second;
    normal = getTriangleNormal(first, middle, last);
  }

  positions.push(...first, ...middle, ...last);
  normals.push(...normal, ...normal, ...normal);
}

function getTriangleNormal(
  first: RubbleShapeVertex,
  second: RubbleShapeVertex,
  third: RubbleShapeVertex
): RubbleShapeVertex {
  const ux = second[0] - first[0];
  const uy = second[1] - first[1];
  const uz = second[2] - first[2];
  const vx = third[0] - first[0];
  const vy = third[1] - first[1];
  const vz = third[2] - first[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length <= 0.000001) return [0, 1, 0];
  return [nx / length, ny / length, nz / length];
}

function hashDebrisShapeSeed(block: number, seed: DebrisShapeSeed): number {
  let value = 2166136261;
  value = mixHash(value, Math.round(block));
  value = mixHash(value, Math.round(seed.fragmentIndex));
  value = mixHash(value, Math.round(seed.distributedFragmentIndex));
  value = mixHash(value, Math.floor(seed.origin.x));
  value = mixHash(value, Math.floor(seed.origin.y));
  value = mixHash(value, Math.floor(seed.origin.z));
  return value >>> 0;
}

function mixHash(current: number, value: number): number {
  let mixed = current ^ (value + 0x9e3779b9 + (current << 6) + (current >>> 2));
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
