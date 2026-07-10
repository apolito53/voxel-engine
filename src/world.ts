import type * as THREE from "three";
import {
  BLOCK_LIGHT_BUILD_JOB,
  BLOCK_LIGHT_BUILT_RESULT,
  buildBlockLightBuildJob,
  type BlockLightBuildJobPayload,
  type BlockLightBuildJobResult
} from "./blockLightJobs";
import { BLOCK_FRAGMENT_GRID_SIZE, getEjectedBlockRubbleMaterialUnits } from "./blockFragments";
import {
  getBlockMaterialRule,
  getTerrainMaxHealth,
  getTerraformerSubCellHealth
} from "./blockMaterialRules";
import { BLOCK, BLOCKS } from "./blocks";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk";
import type {
  ChunkBlockLightBuffers,
  ChunkNeighborBuffers,
  ChunkWorkerResult
} from "./chunkProtocol";
import {
  CHUNK_GENERATE_JOB,
  CHUNK_MESH_JOB,
  buildChunkGenerateJob,
  buildChunkMeshJob,
  type ChunkGenerateJobPayload,
  type ChunkMeshJobPayload
} from "./chunkJobs";
import type {
  CollisionBounds,
  CollisionVector,
  CollisionWorld,
  ProjectileBlockSweepHit
} from "./collision";
import {
  isLocalLightBlock,
  selectNearestLocalLightSources,
  type LocalLightSelection,
  type LocalLightSource
} from "./localLights";
import {
  createNullChunkStorage,
  type ChunkStorage,
  type SavedChunkSnapshot,
  type SavedPartialBlockCell
} from "./chunkStorage";
import {
  PARTIAL_BLOCK_MAX_CUTS_PER_CELL,
  PARTIAL_BLOCK_MESH_REGION_SIZE_XZ,
  PARTIAL_BLOCK_MESH_REGION_SIZE_Y,
  createPartialBlockMeshRegionKey,
  createPartialBlockMeshRegionKeyFromCoords,
  createPartialBlockCollisionBoxes,
  createPartialBlockCut,
  createPartialBlockKey,
  createPartialBlockRemovedVisualCellIndexes,
  createPartialBlockSurfaceSamples,
  createPartialBlockTrajectoryTunnelCellIndexes,
  getPartialBlockMeshRegionBounds,
  getPartialBlockPlayerFootprintSupport,
  getPartialBlockMeshDirtyRegionKeys,
  getPartialBlockSupportHeight,
  isPartialBlockInsideRegionHalo,
  isPartialBlockSurfaceCell,
  parsePartialBlockMeshRegionKey,
  type PartialBlockCell,
  type PartialBlockCut,
  type PartialBlockMeshBuildInput,
  type PartialBlockMeshRegionUpdate,
  type PartialBlockPosition,
  type PartialBlockSurfaceSample
} from "./partialBlocks";
import { normalizeTerraformerSize } from "./terraformerSettings";
import { createTerrainContext, generateChunkBlocks, type TerrainContext, type TerrainProfile } from "./terrain";
import {
  createBlockLightNeighborKey,
  getBlockLightIndex,
  getDirtyBlockLightChunkCoordsForEdit
} from "./voxelBlockLight";
import type { WorkerPool, WorkerPoolJobResult } from "./workerPool";

const LOAD_RADIUS = 4;
const UNLOAD_RADIUS = 5;
const MAX_CHUNK_LOADS_PER_FRAME = 2;
const MAX_CHUNK_REBUILDS_PER_FRAME = 4;
const MAX_PENDING_LOAD_MULTIPLIER = 2;
const MAX_PENDING_MESH_MULTIPLIER = 2;
const MESH_BACKLOG_LOAD_THROTTLE_MULTIPLIER = 8;
const VIEW_PRIORITY_NEAR_RADIUS = 2;
const VIEW_PRIORITY_FRONT_DOT = 0.42;
const VIEW_PRIORITY_SIDE_DOT = -0.15;
const FRUSTUM_PRIORITY_PADDING = CHUNK_SIZE * 0.5;
const STORAGE_SAVE_DEBOUNCE_MS = 250;
const PARTIAL_BLOCK_SURFACE_PATCH_RADIUS_CELLS = 1;
const PARTIAL_BLOCK_SURFACE_PATCH_MIN_STRENGTH = 0.34;
const PARTIAL_BLOCK_SURFACE_PATCH_FORWARD_BONUS = 0.18;
const PARTIAL_BLOCK_SURFACE_PATCH_BACK_PENALTY = 0.12;
const PARTIAL_BLOCK_MAX_SURFACE_SAMPLES_PER_CELL = 8;
const PARTIAL_BLOCK_PIERCE_MAX_CORE_RADIUS = 1 / (BLOCK_FRAGMENT_GRID_SIZE * 2);
const PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_RADIUS = 1 / BLOCK_FRAGMENT_GRID_SIZE;
const PARTIAL_BLOCK_DAMAGE_BRUSH_MAX_RADIUS = 0.58;
const PARTIAL_BLOCK_DAMAGE_BRUSH_MAX_TARGETS = 12;
const PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_WEIGHT = 0.001;
const PROJECTILE_SWEEP_EPSILON = 0.000001;
const PARTIAL_BLOCK_PIERCE_MIN_IMPACT_SPEED = 14;
const PARTIAL_BLOCK_PIERCE_MIN_EXIT_SPEED = 8;
const PARTIAL_BLOCK_PIERCE_CELL_SPEED_COST = 2.8;
const PARTIAL_BLOCK_PIERCE_EXIT_MARGIN = 0.02;
const TERRAFORMER_TARGET_EPSILON = 0.0001;
const LOCAL_LIGHT_EMITTER_FACE_OFFSET = 0.58;
const LOCAL_LIGHT_EXPOSED_FACE_DIRECTIONS = [
  { key: "px", dx: 1, dy: 0, dz: 0 },
  { key: "nx", dx: -1, dy: 0, dz: 0 },
  { key: "py", dx: 0, dy: 1, dz: 0 },
  { key: "ny", dx: 0, dy: -1, dz: 0 },
  { key: "pz", dx: 0, dy: 0, dz: 1 },
  { key: "nz", dx: 0, dy: 0, dz: -1 }
] as const;

export type WorldStats = {
  readonly loadedChunks: number;
  readonly visibleChunks: number;
  readonly culledChunks: number;
  readonly frustumChunks: number;
  readonly renderedChunks: number;
  readonly fogHiddenChunks: number;
  readonly savedChunks: number;
  readonly queuedChunks: number;
  readonly loadedThisFrame: number;
  readonly requestedLoadsThisFrame: number;
  readonly pendingChunkLoads: number;
  readonly meshedThisFrame: number;
  readonly requestedMeshesThisFrame: number;
  readonly pendingMeshBuilds: number;
  readonly dirtyChunks: number;
  readonly visibleDirtyChunks: number;
  readonly culledDirtyChunks: number;
  readonly modifiedChunks: number;
  readonly damagedBlocks: number;
  readonly partialBlocks: number;
  readonly partialDamageBlocks: number;
  readonly partialSurfaceBlocks: number;
  readonly partialRemovedSubvoxels: number;
  readonly partialRemainingSubvoxels: number;
  readonly partialTotalSubvoxels: number;
  readonly pendingChunkSaves: number;
};

export type WorldOptions = {
  readonly storage?: ChunkStorage;
  readonly seed?: string;
  readonly terrainProfile?: TerrainProfile;
  readonly workerPool?: WorkerPool | null;
};

export type ChunkCoords = {
  readonly cx: number;
  readonly cz: number;
  readonly lx: number;
  readonly lz: number;
};

export type BlockDamageResult = {
  readonly block: number;
  readonly position: VoxelBlockPosition;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly destroyed: boolean;
  readonly damageApplied?: number;
  readonly damageBefore?: number;
  readonly damageAfter?: number;
  readonly affectedVisualCellIndexes?: readonly number[];
  readonly supportInvalidationCells?: readonly TerrainSupportInvalidationCell[];
  readonly bitePoofPositions?: readonly VoxelVector[];
  readonly ejectedRubbleMaterialUnits?: number;
  readonly debrisEjectionHint?: DebrisEjectionHint;
  readonly pierceContinuation?: BlockPierceContinuation;
};

export type DebrisEjectionHint = {
  readonly origin: VoxelVector;
  readonly preferredDirections: readonly VoxelVector[];
  readonly biteCellCenters: readonly VoxelVector[];
  readonly ejectedMaterialUnits: number;
};

export type BlockDamageBrushResult = {
  readonly results: readonly BlockDamageResult[];
  readonly primaryResult?: BlockDamageResult;
  readonly pierceContinuation?: BlockPierceContinuation;
};

export type BlockDamageBrushPreview = {
  readonly targets: readonly BlockDamageBrushPreviewTarget[];
};

export type BlockDamageBrushPreviewTarget = {
  readonly block: number;
  readonly position: VoxelBlockPosition;
  readonly point: VoxelVector;
  readonly normal: VoxelVector;
  readonly primary: boolean;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly destroyed: boolean;
  readonly affectedVisualCellIndexes: readonly number[];
};

export type TerraformerEditInput = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly incomingDirection?: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly speed: number;
  readonly size: number;
};

export type TerraformerTerrainRaycastHit = {
  readonly block: VoxelBlockPosition;
  readonly normal: VoxelBlockPosition;
  readonly point: VoxelVector;
  readonly distance: number;
};

export type TerraformerSubCellBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export type TerrainSupportInvalidationCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bounds?: TerraformerSubCellBounds;
};

export type TerraformerTargetSubCell = {
  readonly block: number;
  readonly position: VoxelBlockPosition;
  readonly cellIndex: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly globalZ: number;
  readonly bounds: TerraformerSubCellBounds;
  readonly remainingHealth: number;
  readonly maxHealth: number;
};

export type TerraformerEditPreview = {
  readonly key: string;
  readonly size: number;
  readonly cells: readonly TerraformerTargetSubCell[];
};

export type TerraformerEditResult = {
  readonly preview: TerraformerEditPreview;
  readonly results: readonly BlockDamageResult[];
  readonly primaryResult?: BlockDamageResult;
};

export type BlockPierceContinuation = {
  readonly position: VoxelVector;
  readonly velocity: VoxelVector;
  readonly speed: number;
};

export type BlockCarveInput = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly incomingDirection?: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly coreRadius?: number;
  readonly speed: number;
  readonly amount?: number;
};

export type BlockDamageBrushOptions = {
  readonly blockedDamageKeys?: ReadonlySet<string>;
};

export type VoxelBlockPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type VoxelVector = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

const PARTIAL_BLOCK_LATTICE_OPENING_OFFSETS: readonly VoxelVector[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];

type PartialBlockCutResult = {
  readonly cell: PartialBlockCell;
  readonly newlyRemovedVisualCellIndexes: readonly number[];
};

export type PartialBlockMeshUpdateBatchOptions = {
  readonly maxRegions?: number;
  readonly origin?: Pick<THREE.Vector3, "x" | "y" | "z">;
};

type PartialBlockIndexBucket = Map<string, PartialBlockCell>;

type PartialBlockMaskCacheEntry = {
  readonly mask: Uint8Array | null;
};

type BlockDamageBrushTarget = {
  readonly position: VoxelBlockPosition;
  readonly point: VoxelVector;
  readonly normal: VoxelVector;
  readonly distanceSq: number;
  readonly primary: boolean;
};

type WeightedBlockDamageBrushTarget = BlockDamageBrushTarget & {
  readonly damageAmount: number;
};

function trimPartialSurfaceSamples(samples: readonly PartialBlockSurfaceSample[]): PartialBlockSurfaceSample[] {
  if (samples.length <= PARTIAL_BLOCK_MAX_SURFACE_SAMPLES_PER_CELL) return [...samples];
  return samples.slice(samples.length - PARTIAL_BLOCK_MAX_SURFACE_SAMPLES_PER_CELL);
}

function clamp01ForWorld(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getBlockDamageBrushRadius(input: BlockCarveInput): number {
  const coreRadius = typeof input.coreRadius === "number" && Number.isFinite(input.coreRadius)
    ? Math.max(0, input.coreRadius)
    : 0;
  return Math.min(
    PARTIAL_BLOCK_DAMAGE_BRUSH_MAX_RADIUS,
    Math.max(PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_RADIUS, coreRadius)
  );
}

function getPointToBlockAabbDistanceSq(
  point: Pick<THREE.Vector3, "x" | "y" | "z">,
  position: VoxelBlockPosition
): number {
  const dx = point.x < position.x
    ? position.x - point.x
    : point.x > position.x + 1
      ? point.x - (position.x + 1)
      : 0;
  const dy = point.y < position.y
    ? position.y - point.y
    : point.y > position.y + 1
      ? point.y - (position.y + 1)
      : 0;
  const dz = point.z < position.z
    ? position.z - point.z
    : point.z > position.z + 1
      ? point.z - (position.z + 1)
      : 0;
  return dx * dx + dy * dy + dz * dz;
}

function getBlockDamageBrushTargetWeight(target: BlockDamageBrushTarget, brushRadius: number): number {
  if (target.primary) return 1;
  if (brushRadius <= PROJECTILE_SWEEP_EPSILON) return 0;

  // Neighbor blocks are not extra damage; they are where one shared impact
  // footprint spills across a seam. A target right on the impact boundary gets
  // close to the primary share, while a target barely clipped by the brush gets
  // only a tiny slice of the same one-hit damage budget.
  const distance = Math.sqrt(Math.max(0, target.distanceSq));
  return Math.max(0, 1 - distance / brushRadius);
}

function getBlockDamageBrushTargetIncomingDirection(
  input: BlockCarveInput,
  target: BlockDamageBrushTarget
): Pick<THREE.Vector3, "x" | "y" | "z"> | undefined {
  if (target.primary) return input.incomingDirection;

  // Brush spillover is not the projectile drilling through a second block from
  // the original travel vector. It is the same impact footprint crossing a seam,
  // so each secondary target should chew inward from the face the footprint
  // touched. Otherwise edge/corner hits can pick cells on the neighbor's far
  // side and the preview looks like separated islands.
  return {
    x: -target.normal.x,
    y: -target.normal.y,
    z: -target.normal.z
  };
}

function clampPointToBlock(
  point: Pick<THREE.Vector3, "x" | "y" | "z">,
  position: VoxelBlockPosition
): VoxelVector {
  return {
    x: Math.max(position.x, Math.min(position.x + 1, point.x)),
    y: Math.max(position.y, Math.min(position.y + 1, point.y)),
    z: Math.max(position.z, Math.min(position.z + 1, point.z))
  };
}

function createBlockDamageBrushNormal(
  position: VoxelBlockPosition,
  point: Pick<THREE.Vector3, "x" | "y" | "z">,
  fallbackNormal: Pick<THREE.Vector3, "x" | "y" | "z">,
  primary: boolean
): VoxelVector {
  if (primary) return normalizeVoxelVector(fallbackNormal) ?? { x: 0, y: 1, z: 0 };

  const faces = [
    { distance: Math.abs(point.x - position.x), normal: { x: -1, y: 0, z: 0 } },
    { distance: Math.abs(point.x - (position.x + 1)), normal: { x: 1, y: 0, z: 0 } },
    { distance: Math.abs(point.y - position.y), normal: { x: 0, y: -1, z: 0 } },
    { distance: Math.abs(point.y - (position.y + 1)), normal: { x: 0, y: 1, z: 0 } },
    { distance: Math.abs(point.z - position.z), normal: { x: 0, y: 0, z: -1 } },
    { distance: Math.abs(point.z - (position.z + 1)), normal: { x: 0, y: 0, z: 1 } }
  ];
  faces.sort((left, right) => left.distance - right.distance);
  return faces[0]?.normal ?? (normalizeVoxelVector(fallbackNormal) ?? { x: 0, y: 1, z: 0 });
}

function getProjectileSweepHitAgainstAabb(
  start: CollisionVector,
  movement: CollisionVector,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  allowInitialOverlapHit: boolean
): ProjectileBlockSweepHit | null {
  if (
    Math.abs(movement.x) <= PROJECTILE_SWEEP_EPSILON &&
    Math.abs(movement.y) <= PROJECTILE_SWEEP_EPSILON &&
    Math.abs(movement.z) <= PROJECTILE_SWEEP_EPSILON
  ) {
    return null;
  }

  let entryTime = 0;
  let exitTime = 1;
  let normal: CollisionVector = { x: 0, y: 0, z: 0 };

  const xHit = getAxisProjectileSweepTimes(start.x, movement.x, minX, maxX, { x: -1, y: 0, z: 0 });
  if (!xHit) return null;
  if (xHit.entryTime > entryTime) {
    entryTime = xHit.entryTime;
    normal = xHit.normal;
  }
  exitTime = Math.min(exitTime, xHit.exitTime);
  if (entryTime > exitTime) return null;

  const yHit = getAxisProjectileSweepTimes(start.y, movement.y, minY, maxY, { x: 0, y: -1, z: 0 });
  if (!yHit) return null;
  if (yHit.entryTime > entryTime) {
    entryTime = yHit.entryTime;
    normal = yHit.normal;
  }
  exitTime = Math.min(exitTime, yHit.exitTime);
  if (entryTime > exitTime) return null;

  const zHit = getAxisProjectileSweepTimes(start.z, movement.z, minZ, maxZ, { x: 0, y: 0, z: -1 });
  if (!zHit) return null;
  if (zHit.entryTime > entryTime) {
    entryTime = zHit.entryTime;
    normal = zHit.normal;
  }
  exitTime = Math.min(exitTime, zHit.exitTime);
  if (entryTime > exitTime) return null;

  if (entryTime <= PROJECTILE_SWEEP_EPSILON) {
    if (!allowInitialOverlapHit) return null;
    return { t: 0, normal: createInitialProjectileOverlapNormal(movement) };
  }

  return entryTime <= 1 ? { t: entryTime, normal } : null;
}

function createRayPoint(
  origin: Pick<THREE.Vector3, "x" | "y" | "z">,
  direction: VoxelVector,
  distance: number
): VoxelVector {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance
  };
}

function getRayStartingVoxel(value: number, direction: number): number {
  // Match the normal block raycaster at integer boundaries: a negative-facing
  // ray beginning exactly on a grid line is touching the voxel on the negative
  // side first, not the positive-side voxel that Math.floor would choose.
  if (direction < 0 && Number.isInteger(value)) return value - 1;
  return Math.floor(value);
}

function getRayIntBound(value: number, direction: number): number {
  if (direction === 0) return Number.POSITIVE_INFINITY;
  const next = direction > 0 ? Math.floor(value) + 1 : Math.ceil(value) - 1;
  return (next - value) / direction;
}

function chooseRayEntryFace(
  crossesX: boolean,
  crossesY: boolean,
  crossesZ: boolean,
  direction: VoxelVector,
  stepX: number,
  stepY: number,
  stepZ: number
): VoxelBlockPosition {
  let axis: "x" | "y" | "z" = "x";
  let strength = -1;

  if (crossesX) {
    axis = "x";
    strength = Math.abs(direction.x);
  }
  if (crossesY && Math.abs(direction.y) > strength) {
    axis = "y";
    strength = Math.abs(direction.y);
  }
  if (crossesZ && Math.abs(direction.z) > strength) {
    axis = "z";
  }

  if (axis === "x") return { x: -stepX, y: 0, z: 0 };
  if (axis === "y") return { x: 0, y: -stepY, z: 0 };
  return { x: 0, y: 0, z: -stepZ };
}

function getAxisProjectileSweepTimes(
  start: number,
  movement: number,
  min: number,
  max: number,
  entryNormal: CollisionVector
): {
  readonly entryTime: number;
  readonly exitTime: number;
  readonly normal: CollisionVector;
} | null {
  if (Math.abs(movement) <= PROJECTILE_SWEEP_EPSILON) {
    return start >= min && start <= max
      ? { entryTime: 0, exitTime: 1, normal: { x: 0, y: 0, z: 0 } }
      : null;
  }

  const inverseMovement = 1 / movement;
  let entryTime = (min - start) * inverseMovement;
  let exitTime = (max - start) * inverseMovement;
  let normal = entryNormal;

  if (entryTime > exitTime) {
    const previousEntryTime = entryTime;
    entryTime = exitTime;
    exitTime = previousEntryTime;
    normal = {
      x: -entryNormal.x,
      y: -entryNormal.y,
      z: -entryNormal.z
    };
  }

  return { entryTime, exitTime, normal };
}

function createInitialProjectileOverlapNormal(movement: CollisionVector): CollisionVector {
  const absX = Math.abs(movement.x);
  const absY = Math.abs(movement.y);
  const absZ = Math.abs(movement.z);
  if (absX >= absY && absX >= absZ && absX > PROJECTILE_SWEEP_EPSILON) {
    return { x: movement.x >= 0 ? -1 : 1, y: 0, z: 0 };
  }
  if (absY >= absX && absY >= absZ && absY > PROJECTILE_SWEEP_EPSILON) {
    return { x: 0, y: movement.y >= 0 ? -1 : 1, z: 0 };
  }
  return { x: 0, y: 0, z: movement.z >= 0 ? -1 : 1 };
}

function decodePartialBlockVisualCell(index: number): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: index % BLOCK_FRAGMENT_GRID_SIZE,
    y: Math.floor(index / BLOCK_FRAGMENT_GRID_SIZE) % BLOCK_FRAGMENT_GRID_SIZE,
    z: Math.floor(index / (BLOCK_FRAGMENT_GRID_SIZE ** 2)) % BLOCK_FRAGMENT_GRID_SIZE
  };
}

function createGlobalPartialBlockVisualCellKey(position: VoxelBlockPosition, cellIndex: number): string {
  const cell = decodePartialBlockVisualCell(cellIndex);
  return createGlobalMicroCellKey(
    position.x * BLOCK_FRAGMENT_GRID_SIZE + cell.x,
    position.y * BLOCK_FRAGMENT_GRID_SIZE + cell.y,
    position.z * BLOCK_FRAGMENT_GRID_SIZE + cell.z
  );
}

function createGlobalMicroCellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function createTerraformerPreviewKey(
  size: number,
  cells: readonly TerraformerTargetSubCell[]
): string {
  return `${size}|${cells.map((cell) =>
    `${cell.globalX},${cell.globalY},${cell.globalZ}`
  ).join(";")}`;
}

function createTerraformerGlobalSubCellCenter(input: TerraformerEditInput): VoxelBlockPosition {
  const normal = normalizeVoxelVector(input.normal) ?? { x: 0, y: 0, z: 0 };
  const fallback = {
    x: Math.floor(input.x) + 0.5,
    y: Math.floor(input.y) + 0.5,
    z: Math.floor(input.z) + 0.5
  };
  const point = {
    x: Number.isFinite(input.point.x) ? input.point.x : fallback.x,
    y: Number.isFinite(input.point.y) ? input.point.y : fallback.y,
    z: Number.isFinite(input.point.z) ? input.point.z : fallback.z
  };

  return {
    x: Math.floor((point.x - normal.x * TERRAFORMER_TARGET_EPSILON) * BLOCK_FRAGMENT_GRID_SIZE),
    y: Math.floor((point.y - normal.y * TERRAFORMER_TARGET_EPSILON) * BLOCK_FRAGMENT_GRID_SIZE),
    z: Math.floor((point.z - normal.z * TERRAFORMER_TARGET_EPSILON) * BLOCK_FRAGMENT_GRID_SIZE)
  };
}

function createTerraformerBrushAxisValues(
  center: number,
  size: number,
  normalComponent: number
): number[] {
  if (Math.abs(normalComponent) > 0.5) {
    const inwardStep = -Math.sign(normalComponent);
    // The reticle-selected cell is the face cell. Grow the brush inward from
    // that face so larger Terraformer sizes have real depth instead of wasting
    // half the brush outside the targeted block.
    return Array.from({ length: size }, (_, index) => center + inwardStep * index);
  }

  const start = center - Math.floor((size - 1) / 2);
  return Array.from({ length: size }, (_, index) => start + index);
}

function createBlockPositionFromGlobalSubCell(
  globalX: number,
  globalY: number,
  globalZ: number
): VoxelBlockPosition {
  return {
    x: Math.floor(globalX / BLOCK_FRAGMENT_GRID_SIZE),
    y: Math.floor(globalY / BLOCK_FRAGMENT_GRID_SIZE),
    z: Math.floor(globalZ / BLOCK_FRAGMENT_GRID_SIZE)
  };
}

function createLocalSubCellIndex(globalX: number, globalY: number, globalZ: number): number {
  const x = positiveModulo(globalX, BLOCK_FRAGMENT_GRID_SIZE);
  const y = positiveModulo(globalY, BLOCK_FRAGMENT_GRID_SIZE);
  const z = positiveModulo(globalZ, BLOCK_FRAGMENT_GRID_SIZE);
  return x + y * BLOCK_FRAGMENT_GRID_SIZE + z * BLOCK_FRAGMENT_GRID_SIZE ** 2;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function createSubCellBounds(
  globalX: number,
  globalY: number,
  globalZ: number
): TerraformerSubCellBounds {
  return {
    minX: globalX / BLOCK_FRAGMENT_GRID_SIZE,
    maxX: (globalX + 1) / BLOCK_FRAGMENT_GRID_SIZE,
    minY: globalY / BLOCK_FRAGMENT_GRID_SIZE,
    maxY: (globalY + 1) / BLOCK_FRAGMENT_GRID_SIZE,
    minZ: globalZ / BLOCK_FRAGMENT_GRID_SIZE,
    maxZ: (globalZ + 1) / BLOCK_FRAGMENT_GRID_SIZE
  };
}

function createTerrainSupportInvalidationCellsForVisualCells(
  position: VoxelBlockPosition,
  cellIndexes: readonly number[]
): TerrainSupportInvalidationCell[] {
  const cells: TerrainSupportInvalidationCell[] = [];
  const seen = new Set<number>();

  for (const cellIndex of cellIndexes) {
    if (seen.has(cellIndex)) continue;

    const localCell = decodePartialBlockVisualCell(cellIndex);
    const globalX = position.x * BLOCK_FRAGMENT_GRID_SIZE + localCell.x;
    const globalY = position.y * BLOCK_FRAGMENT_GRID_SIZE + localCell.y;
    const globalZ = position.z * BLOCK_FRAGMENT_GRID_SIZE + localCell.z;
    seen.add(cellIndex);
    cells.push({
      x: position.x,
      y: position.y,
      z: position.z,
      // This is the actual sub-cell support volume that vanished. Passing it
      // through the damage result lets debris wake from destroyed sub-blocks
      // without reintroducing broad per-frame support scans.
      bounds: createSubCellBounds(globalX, globalY, globalZ)
    });
  }

  return cells;
}

function createNextPartialBlockCuts(
  block: number,
  position: VoxelBlockPosition,
  existingCuts: readonly PartialBlockCut[],
  input: TerraformerEditInput,
  exactRemovedVisualCellIndexes: readonly number[]
): PartialBlockCut[] {
  const cuts = [...existingCuts];
  cuts.push(createPartialBlockCut({
    block,
    position,
    point: input.point,
    normal: input.normal,
    incomingDirection: input.incomingDirection,
    speed: input.speed,
    cutIndex: cuts.length,
    exactRemovedVisualCellIndexes
  }));
  while (cuts.length > PARTIAL_BLOCK_MAX_CUTS_PER_CELL) {
    cuts.shift();
  }
  return cuts;
}

function getAdjacentGlobalMicroCellKeys(key: string): readonly string[] {
  const [x, y, z] = key.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [];
  return [
    createGlobalMicroCellKey(x + 1, y, z),
    createGlobalMicroCellKey(x - 1, y, z),
    createGlobalMicroCellKey(x, y + 1, z),
    createGlobalMicroCellKey(x, y - 1, z),
    createGlobalMicroCellKey(x, y, z + 1),
    createGlobalMicroCellKey(x, y, z - 1)
  ];
}

function createPartialBlockBitePoofPositions(
  position: VoxelBlockPosition,
  removedVisualCellIndexes: readonly number[],
  outwardNormal: Pick<THREE.Vector3, "x" | "y" | "z">
): readonly VoxelVector[] {
  const normal = normalizeVoxelVector(outwardNormal) ?? { x: 0, y: 0, z: 0 };
  return removedVisualCellIndexes.map((index) => {
    const visualCell = decodePartialBlockVisualCell(index);
    return {
      x: position.x + (visualCell.x + 0.5) / BLOCK_FRAGMENT_GRID_SIZE + normal.x * 0.04,
      y: position.y + (visualCell.y + 0.5) / BLOCK_FRAGMENT_GRID_SIZE + normal.y * 0.04,
      z: position.z + (visualCell.z + 0.5) / BLOCK_FRAGMENT_GRID_SIZE + normal.z * 0.04
    };
  });
}

function createPartialBlockDespawnPoofPositions(
  position: VoxelBlockPosition,
  visualCellIndexes: readonly number[]
): readonly VoxelVector[] {
  return visualCellIndexes.map((index) => createPartialBlockVisualCellCenter(position, index));
}

function mergeUniqueVisualCellIndexes(
  primaryIndexes: readonly number[],
  secondaryIndexes: readonly number[]
): readonly number[] {
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const index of [...primaryIndexes, ...secondaryIndexes]) {
    if (seen.has(index)) continue;
    seen.add(index);
    merged.push(index);
  }
  return merged;
}

function createPartialBlockVisualCellCenter(position: VoxelBlockPosition, cellIndex: number): VoxelVector {
  const visualCell = decodePartialBlockVisualCell(cellIndex);
  return {
    x: position.x + (visualCell.x + 0.5) / BLOCK_FRAGMENT_GRID_SIZE,
    y: position.y + (visualCell.y + 0.5) / BLOCK_FRAGMENT_GRID_SIZE,
    z: position.z + (visualCell.z + 0.5) / BLOCK_FRAGMENT_GRID_SIZE
  };
}

function averageVoxelVectors(vectors: readonly VoxelVector[], fallback: VoxelVector): VoxelVector {
  if (vectors.length === 0) return fallback;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const vector of vectors) {
    x += vector.x;
    y += vector.y;
    z += vector.z;
  }
  return {
    x: x / vectors.length,
    y: y / vectors.length,
    z: z / vectors.length
  };
}

function createFallbackDebrisEjectionHint(
  position: VoxelBlockPosition,
  input: BlockCarveInput,
  ejectedMaterialUnits: number
): DebrisEjectionHint {
  const fallbackDirection = normalizeVoxelVector(input.normal) ??
    normalizeVoxelVector(input.incomingDirection) ??
    { x: 0, y: 1, z: 0 };
  const origin = clampPointToBlock(input.point, position);
  return {
    origin,
    preferredDirections: [fallbackDirection],
    biteCellCenters: [origin],
    ejectedMaterialUnits
  };
}

function normalizeVoxelVector(vector: Pick<THREE.Vector3, "x" | "y" | "z"> | undefined): VoxelVector | null {
  if (!vector) return null;
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 0.000001) return null;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function addUniqueDebrisDirection(directions: VoxelVector[], direction: VoxelVector): void {
  const normalizedDirection = normalizeVoxelVector(direction);
  if (!normalizedDirection) return;
  if (directions.some((existing) => dotVoxelVectors(existing, normalizedDirection) > 0.96)) return;
  directions.push(normalizedDirection);
}

function dotVoxelVectors(left: VoxelVector, right: VoxelVector): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function getPartialBlockPierceTunnelCellCount(
  cell: PartialBlockCell,
  cut: PartialBlockCut,
  trajectory: VoxelVector
): number {
  const removedIndexes = cell.removedVisualCellIndexes ?? [];
  if (removedIndexes.length === 0) return 0;

  const removedSet = new Set(removedIndexes);
  const tunnelIndexes = createPartialBlockTrajectoryTunnelCellIndexes(cut.localPoint, trajectory);
  const openTunnelCellCount = tunnelIndexes.filter((index) => removedSet.has(index)).length;
  return openTunnelCellCount === BLOCK_FRAGMENT_GRID_SIZE ? openTunnelCellCount : 0;
}

function createPartialBlockPierceExitPosition(
  position: VoxelBlockPosition,
  localPoint: VoxelVector,
  trajectory: VoxelVector,
  coreRadius: number
): VoxelVector {
  const exitDistance = getUnitCubeExitDistance(localPoint, trajectory);
  const margin = coreRadius + PARTIAL_BLOCK_PIERCE_EXIT_MARGIN;
  return {
    x: position.x + localPoint.x + trajectory.x * (exitDistance + margin),
    y: position.y + localPoint.y + trajectory.y * (exitDistance + margin),
    z: position.z + localPoint.z + trajectory.z * (exitDistance + margin)
  };
}

function getUnitCubeExitDistance(localPoint: VoxelVector, trajectory: VoxelVector): number {
  let exitDistance = Number.POSITIVE_INFINITY;
  exitDistance = Math.min(exitDistance, getAxisExitDistance(localPoint.x, trajectory.x));
  exitDistance = Math.min(exitDistance, getAxisExitDistance(localPoint.y, trajectory.y));
  exitDistance = Math.min(exitDistance, getAxisExitDistance(localPoint.z, trajectory.z));
  return Number.isFinite(exitDistance) ? Math.max(0, exitDistance) : 0;
}

function getAxisExitDistance(localCoordinate: number, direction: number): number {
  if (direction > 0.000001) return (1 - localCoordinate) / direction;
  if (direction < -0.000001) return -localCoordinate / direction;
  return Number.POSITIVE_INFINITY;
}

type HorizontalViewDirection = Pick<THREE.Vector3, "x" | "z">;

type ChunkQueueEntry = {
  readonly cx: number;
  readonly cz: number;
};

type ChunkRadiusOffset = {
  readonly dx: number;
  readonly dz: number;
};

type ChunkQueueWindow = {
  readonly centerCx: number;
  readonly centerCz: number;
  readonly radius: number;
};

type PendingChunkLoadBase = ChunkQueueEntry & {
  readonly key: string;
};

type PendingChunkLoad = PendingChunkLoadBase & {
  readonly jobId: number;
};

type PendingSavedChunkLoad = PendingChunkLoadBase & {
  readonly generation: number;
};

type SavedChunkLoadResult = PendingSavedChunkLoad & {
  readonly snapshot: SavedChunkSnapshot | null;
};

type PendingMeshBuild = {
  readonly key: string;
  readonly revision: number;
  readonly jobId: number;
};

type PendingBlockLightBuild = {
  readonly key: string;
  readonly revision: number;
  readonly jobId: number;
};

type BlockLightCacheEntry = {
  readonly revision: number;
  readonly blockLight: Uint8Array;
};

type VoxelWorldWorkerResult = ChunkWorkerResult | BlockLightBuildJobResult;

type PriorityItem = {
  readonly cx: number;
  readonly cz: number;
};

type PriorityEntry<T extends PriorityItem> = {
  readonly item: T;
  readonly distance: number;
  readonly alignment: number;
  readonly visible: boolean;
  readonly lane: number;
};

export type ChunkStreamingDiagnostics = {
  readonly queueWindowRefreshes: number;
  readonly queueWindowSkips: number;
  readonly lastQueueCandidateChecks: number;
  readonly unloadWindowRefreshes: number;
  readonly unloadWindowSkips: number;
  readonly lastUnloadCandidateChecks: number;
  readonly trackedDirtyChunks: number;
  readonly trackedModifiedChunks: number;
};

const chunkRadiusOffsetCache = new Map<number, readonly ChunkRadiusOffset[]>();

export class VoxelWorld implements CollisionWorld {
  chunks: Map<string, Chunk>;
  storage: ChunkStorage;
  seed: string;
  terrainProfile: TerrainProfile;
  terrain: TerrainContext;
  savedChunkKeys: Set<string>;
  savedChunks: Map<string, SavedChunkSnapshot>;
  chunkLoadQueue: Map<string, ChunkQueueEntry>;
  pendingChunkLoads: Map<number, PendingChunkLoad>;
  pendingChunkKeys: Set<string>;
  pendingSavedChunkLoads: Map<string, PendingSavedChunkLoad>;
  pendingSavedChunkKeys: Set<string>;
  pendingMeshBuilds: Map<number, PendingMeshBuild>;
  pendingMeshKeys: Set<string>;
  pendingBlockLightBuilds: Map<number, PendingBlockLightBuild>;
  pendingBlockLightKeys: Set<string>;
  workerResults: VoxelWorldWorkerResult[];
  savedChunkResults: SavedChunkLoadResult[];
  storageOperations: Set<Promise<void>>;
  chunkStorageChains: Map<string, Promise<void>>;
  pendingSavedChunkWrites: Map<string, SavedChunkSnapshot>;
  storageGeneration: number;
  storageFlushTimer: ReturnType<typeof setTimeout> | null;
  workerRequestId: number;
  workerPool: WorkerPool | null;
  priorityCx: number;
  priorityCz: number;
  priorityViewX: number;
  priorityViewZ: number;
  priorityViewActive: boolean;
  priorityFrustum: THREE.Frustum | null;
  priorityFrustumActive: boolean;
  private chunkQueueWindow: ChunkQueueWindow | null;
  private chunkUnloadWindow: ChunkQueueWindow | null;
  private readonly fogHiddenChunkKeys: Set<string>;
  private queueWindowRefreshes: number;
  private queueWindowSkips: number;
  private lastQueueCandidateChecks: number;
  private unloadWindowRefreshes: number;
  private unloadWindowSkips: number;
  private lastUnloadCandidateChecks: number;
  private readonly dirtyChunkKeys: Set<string>;
  private readonly modifiedChunkKeys: Set<string>;
  private readonly blockLightCache: Map<string, BlockLightCacheEntry>;
  private readonly dirtyBlockLightChunkKeys: Set<string>;
  lastLoadedChunks: number;
  lastRequestedChunkLoads: number;
  lastMeshedChunks: number;
  lastRequestedMeshes: number;
  private readonly blockDamage: Map<string, number>;
  private readonly partialBlocks: Map<string, PartialBlockCell>;
  private readonly partialBlocksByChunk: Map<string, PartialBlockIndexBucket>;
  private readonly partialBlocksByRegion: Map<string, PartialBlockIndexBucket>;
  private readonly dirtyPartialBlockRegionKeys: Set<string>;
  private readonly urgentPartialBlockRegionKeys: Set<string>;
  private readonly partialBlockRegionRevisions: Map<string, number>;
  private readonly partialBlockMaskCache: Map<string, PartialBlockMaskCacheEntry>;
  private readonly localLightBlockKeys: Set<string>;
  private readonly localLightBlockKeysByChunk: Map<string, Set<string>>;
  private partialBlockGeometryRevision: number;

  constructor({ storage = createNullChunkStorage(), seed = "", terrainProfile, workerPool = null }: WorldOptions = {}) {
    this.chunks = new Map();
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed, terrainProfile);
    this.terrainProfile = this.terrain.profile;
    // The key set is cheap to keep in memory; full chunk payloads are loaded only when needed.
    this.savedChunkKeys = new Set();
    this.savedChunks = new Map();
    this.chunkLoadQueue = new Map();
    this.pendingChunkLoads = new Map();
    this.pendingChunkKeys = new Set();
    this.pendingSavedChunkLoads = new Map();
    this.pendingSavedChunkKeys = new Set();
    this.pendingMeshBuilds = new Map();
    this.pendingMeshKeys = new Set();
    this.pendingBlockLightBuilds = new Map();
    this.pendingBlockLightKeys = new Set();
    this.workerResults = [];
    this.savedChunkResults = [];
    this.storageOperations = new Set();
    this.chunkStorageChains = new Map();
    this.pendingSavedChunkWrites = new Map();
    this.storageGeneration = 0;
    this.storageFlushTimer = null;
    this.workerRequestId = 0;
    this.workerPool = workerPool;
    this.priorityCx = 0;
    this.priorityCz = 0;
    this.priorityViewX = 0;
    this.priorityViewZ = -1;
    this.priorityViewActive = false;
    this.priorityFrustum = null;
    this.priorityFrustumActive = false;
    this.chunkQueueWindow = null;
    this.chunkUnloadWindow = null;
    this.fogHiddenChunkKeys = new Set();
    this.queueWindowRefreshes = 0;
    this.queueWindowSkips = 0;
    this.lastQueueCandidateChecks = 0;
    this.unloadWindowRefreshes = 0;
    this.unloadWindowSkips = 0;
    this.lastUnloadCandidateChecks = 0;
    this.dirtyChunkKeys = new Set();
    this.modifiedChunkKeys = new Set();
    this.blockLightCache = new Map();
    this.dirtyBlockLightChunkKeys = new Set();
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
    this.blockDamage = new Map();
    this.partialBlocks = new Map();
    this.partialBlocksByChunk = new Map();
    this.partialBlocksByRegion = new Map();
    this.dirtyPartialBlockRegionKeys = new Set();
    this.urgentPartialBlockRegionKeys = new Set();
    this.partialBlockRegionRevisions = new Map();
    this.partialBlockMaskCache = new Map();
    this.localLightBlockKeys = new Set();
    this.localLightBlockKeysByChunk = new Map();
    this.partialBlockGeometryRevision = 0;
  }

  async switchStorage(
    storage: ChunkStorage,
    scene: THREE.Scene,
    seed = "",
    terrainProfile?: TerrainProfile
  ): Promise<void> {
    await this.flushStorageWrites();
    this.storageGeneration += 1;
    this.disposeLoadedChunks(scene);
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed, terrainProfile);
    this.terrainProfile = this.terrain.profile;
    this.savedChunks.clear();
    this.blockDamage.clear();
    this.clearPartialBlockState();
    this.invalidateChunkQueueWindow();
    this.invalidateChunkUnloadWindow();
    await this.loadSavedChunkIndex();
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
  }

  async loadSavedChunkIndex(): Promise<void> {
    // The index is tiny compared with full chunk data, so it is safe to read at world-load time.
    try {
      this.savedChunkKeys = new Set(await this.storage.listChunkKeys());
    } catch (error) {
      console.warn("Could not read saved chunk index", error);
      this.savedChunkKeys = new Set();
    }
  }

  async preloadSavedChunksAround(x: number, z: number, radius = LOAD_RADIUS): Promise<void> {
    const center = this.toChunkCoords(x, z);
    const loads: Promise<SavedChunkSnapshot | null>[] = [];

    // Initial spawn gets a blocking preload so saved edits near spawn are visible immediately.
    for (const offset of getChunkRadiusOffsets(radius)) {
      const key = this.key(center.cx + offset.dx, center.cz + offset.dz);
      if (this.savedChunkKeys.has(key)) loads.push(this.loadSavedChunkNow(key));
    }

    await Promise.all(loads);
  }

  disposeLoadedChunks(scene: THREE.Scene): void {
    // Meshes belong to the currently active world; world switches and home exits drop them all.
    for (const chunk of this.chunks.values()) {
      chunk.disposeMesh(scene);
    }
    this.chunks.clear();
    this.fogHiddenChunkKeys.clear();
    this.chunkLoadQueue.clear();
    this.invalidateChunkQueueWindow();
    this.invalidateChunkUnloadWindow();
    for (const pending of this.pendingChunkLoads.values()) {
      this.workerPool?.cancel(pending.jobId);
    }
    for (const pending of this.pendingMeshBuilds.values()) {
      this.workerPool?.cancel(pending.jobId);
    }
    for (const pending of this.pendingBlockLightBuilds.values()) {
      this.workerPool?.cancel(pending.jobId);
    }
    this.pendingChunkLoads.clear();
    this.pendingChunkKeys.clear();
    this.pendingSavedChunkLoads.clear();
    this.pendingSavedChunkKeys.clear();
    this.pendingMeshBuilds.clear();
    this.pendingMeshKeys.clear();
    this.pendingBlockLightBuilds.clear();
    this.pendingBlockLightKeys.clear();
    this.workerResults.length = 0;
    this.savedChunkResults.length = 0;
    this.blockDamage.clear();
    this.clearPartialBlockState();
    this.localLightBlockKeys.clear();
    this.localLightBlockKeysByChunk.clear();
    this.dirtyChunkKeys.clear();
    this.modifiedChunkKeys.clear();
    this.blockLightCache.clear();
    this.dirtyBlockLightChunkKeys.clear();
  }

  dispose(scene: THREE.Scene): void {
    // Page disposal and Vite reloads are synchronous, so this path focuses on
    // releasing GPU/worker resources promptly. Normal world switching still
    // calls `flushStorageWrites` before dropping chunks.
    if (this.storageFlushTimer !== null) {
      clearTimeout(this.storageFlushTimer);
      this.storageFlushTimer = null;
      this.flushPendingChunkSaves();
    }

    this.disposeLoadedChunks(scene);
  }

  key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.key(cx, cz));
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      const savedSnapshot = this.savedChunks.get(key);
      if (savedSnapshot) {
        // Saved chunks replace generation and now carry their partial-terrain cells
        // beside block bytes. Hydration happens after the chunk enters the map so
        // masks, dirty regions, and local light lookups all see a normal loaded chunk.
        this.populateChunk(chunk, savedSnapshot.blocks);
        chunk.modified = true;
      } else {
        this.generateChunk(chunk);
      }
      this.chunks.set(key, chunk);
      this.trackLoadedChunk(key, chunk);
      this.chunkLoadQueue.delete(key);
      if (savedSnapshot) this.hydrateSavedPartialBlocksForChunk(key, savedSnapshot.partialBlocks);
      this.markNeighborChunksDirty(cx, cz);
      this.markBlockLightChunkAndNeighborsDirty(cx, cz);
    }
    return chunk;
  }

  populateChunk(chunk: Chunk, blocks: Uint8Array): void {
    chunk.blocks.set(blocks);
    chunk.refreshTopColumns();
    this.markChunkDirty(chunk);
    chunk.revision = 0;
    this.reindexChunkLocalLights(chunk);
  }

  addGeneratedChunk(
    cx: number,
    cz: number,
    blocks: Uint8Array,
    modified = false,
    partialBlocks: readonly SavedPartialBlockCell[] = []
  ): Chunk {
    const key = this.key(cx, cz);
    const existingChunk = this.chunks.get(key);
    if (existingChunk) return existingChunk;

    const chunk = new Chunk(cx, cz);
    this.populateChunk(chunk, blocks);
    chunk.modified = modified;
    this.chunks.set(key, chunk);
    this.trackLoadedChunk(key, chunk);
    this.chunkLoadQueue.delete(key);
    this.pendingChunkKeys.delete(key);
    if (partialBlocks.length > 0) this.hydrateSavedPartialBlocksForChunk(key, partialBlocks);
    this.markNeighborChunksDirty(cx, cz);
    this.markBlockLightChunkAndNeighborsDirty(cx, cz);
    return chunk;
  }

  generateInitialWorld(): void {
    this.ensureChunksAround(0, 0);
  }

  ensureChunksAround(x: number, z: number, radius = LOAD_RADIUS): ChunkCoords {
    const center = this.toChunkCoords(x, z);
    this.setPriority(center.cx, center.cz);
    for (const offset of getChunkRadiusOffsets(radius)) {
      this.ensureChunk(center.cx + offset.dx, center.cz + offset.dz);
    }
    return center;
  }

  streamChunksAround(
    x: number,
    z: number,
    scene: THREE.Scene,
    loadRadius = LOAD_RADIUS,
    unloadRadius = UNLOAD_RADIUS,
    maxLoads = MAX_CHUNK_LOADS_PER_FRAME,
    viewDirection: HorizontalViewDirection | null = null,
    viewFrustum: THREE.Frustum | null = null
  ): ChunkCoords {
    const center = this.toChunkCoords(x, z);
    this.setPriority(center.cx, center.cz, viewDirection, viewFrustum);
    this.lastLoadedChunks = 0;
    // Worker/storage callbacks can complete in bursts. Apply completed work with
    // the same budget discipline as new requests, but choose the chunks most
    // relevant to the current camera first. FIFO result draining was smooth, but
    // it let invisible chunks steal the frame budget and made visible terrain pop.
    this.processSavedChunkResults(maxLoads);
    this.processGeneratedChunkResults(maxLoads);
    const refreshedQueueWindow = this.queueChunksAround(center.cx, center.cz, loadRadius);
    if (refreshedQueueWindow) {
      this.pruneQueuedChunks(center.cx, center.cz, loadRadius);
    }
    this.lastRequestedChunkLoads = this.requestQueuedChunkLoads(
      center.cx,
      center.cz,
      maxLoads
    );
    this.unloadChunksOutside(center.cx, center.cz, unloadRadius, scene);
    return center;
  }

  queueChunksAround(centerCx: number, centerCz: number, radius = LOAD_RADIUS): boolean {
    const normalizedRadius = normalizeChunkRadius(radius);
    if (this.chunkQueueWindowMatches(centerCx, centerCz, normalizedRadius)) {
      this.queueWindowSkips += 1;
      this.lastQueueCandidateChecks = 0;
      return false;
    }

    const offsets = getChunkRadiusOffsets(normalizedRadius);
    this.queueWindowRefreshes += 1;
    this.lastQueueCandidateChecks = offsets.length;

    // The radius window changes only when the player crosses a chunk boundary or
    // quality changes. Reusing this cached offset list avoids rebuilding the same
    // thousands of Super Ultra coordinates every animation frame.
    for (const offset of offsets) {
      const cx = centerCx + offset.dx;
      const cz = centerCz + offset.dz;
      const key = this.key(cx, cz);
      if (
        this.chunks.has(key) ||
        this.chunkLoadQueue.has(key) ||
        this.pendingChunkKeys.has(key) ||
        this.pendingSavedChunkKeys.has(key)
      ) {
        continue;
      }

      this.chunkLoadQueue.set(key, {
        cx,
        cz
      });
    }

    this.chunkQueueWindow = {
      centerCx,
      centerCz,
      radius: normalizedRadius
    };
    return true;
  }

  private chunkQueueWindowMatches(centerCx: number, centerCz: number, radius: number): boolean {
    return this.chunkQueueWindow?.centerCx === centerCx &&
      this.chunkQueueWindow.centerCz === centerCz &&
      this.chunkQueueWindow.radius === radius;
  }

  private invalidateChunkQueueWindow(): void {
    this.chunkQueueWindow = null;
    this.lastQueueCandidateChecks = 0;
  }

  private chunkUnloadWindowMatches(centerCx: number, centerCz: number, radius: number): boolean {
    return this.chunkUnloadWindow?.centerCx === centerCx &&
      this.chunkUnloadWindow.centerCz === centerCz &&
      this.chunkUnloadWindow.radius === radius;
  }

  private invalidateChunkUnloadWindow(): void {
    this.chunkUnloadWindow = null;
    this.lastUnloadCandidateChecks = 0;
  }

  private trackLoadedChunk(key: string, chunk: Chunk): void {
    if (chunk.dirty) {
      this.dirtyChunkKeys.add(key);
    } else {
      this.dirtyChunkKeys.delete(key);
    }

    if (chunk.modified) {
      this.modifiedChunkKeys.add(key);
    } else {
      this.modifiedChunkKeys.delete(key);
    }

    // A newly loaded chunk can come from a stale worker result, direct edit, or
    // fallback path. Force one unload pass before trusting the cached unload window.
    this.invalidateChunkUnloadWindow();
  }

  private markChunkDirty(chunk: Chunk): void {
    chunk.dirty = true;
    this.dirtyChunkKeys.add(this.key(chunk.cx, chunk.cz));
  }

  private markChunkClean(chunk: Chunk): void {
    chunk.dirty = false;
    this.dirtyChunkKeys.delete(this.key(chunk.cx, chunk.cz));
  }

  pruneQueuedChunks(centerCx: number, centerCz: number, radius = LOAD_RADIUS): void {
    const normalizedRadius = normalizeChunkRadius(radius);
    for (const [key, queued] of this.chunkLoadQueue.entries()) {
      if (
        !isChunkOffsetInsideRadius(queued.cx - centerCx, queued.cz - centerCz, normalizedRadius) ||
        this.chunks.has(key)
      ) {
        this.chunkLoadQueue.delete(key);
      }
    }
  }

  setPriority(
    centerCx: number,
    centerCz: number,
    viewDirection: HorizontalViewDirection | null = null,
    viewFrustum: THREE.Frustum | null = null
  ): void {
    this.priorityCx = centerCx;
    this.priorityCz = centerCz;
    this.priorityFrustum = viewFrustum?.planes?.length ? viewFrustum : null;
    this.priorityFrustumActive = Boolean(this.priorityFrustum);

    // Keep the horizontal camera direction normalized so chunk scheduling can
    // prefer work the player is likely to see next.
    const viewX = viewDirection?.x ?? 0;
    const viewZ = viewDirection?.z ?? 0;
    const viewLength = Math.hypot(viewX, viewZ);
    this.priorityViewActive = viewLength > 0.001;
    if (!this.priorityViewActive) return;

    this.priorityViewX = viewX / viewLength;
    this.priorityViewZ = viewZ / viewLength;
  }

  requestQueuedChunkLoads(
    centerCx: number,
    centerCz: number,
    maxLoads = MAX_CHUNK_LOADS_PER_FRAME
  ): number {
    if (maxLoads <= 0) return 0;

    const loadSlots = this.availableChunkLoadSlots(maxLoads);
    if (loadSlots <= 0) return 0;

    const queuedChunks = this.pickNearestQueuedChunks(centerCx, centerCz, loadSlots);

    let requested = 0;
    for (const queued of queuedChunks) {
      if (requested >= loadSlots) break;
      const key = this.key(queued.cx, queued.cz);

      if (this.savedChunkKeys.has(key) && !this.savedChunks.has(key)) {
        this.requestSavedChunkLoad(queued.cx, queued.cz);
        requested += 1;
        continue;
      }

      if (!this.workerPool || this.savedChunks.has(key)) {
        this.ensureChunk(queued.cx, queued.cz);
        this.lastLoadedChunks += 1;
        requested += 1;
        continue;
      }

      this.requestChunkGeneration(queued.cx, queued.cz);
      requested += 1;
    }

    return requested;
  }

  availableChunkLoadSlots(maxLoads: number): number {
    if (!this.workerPool) return maxLoads;

    const pendingLoads = this.pendingChunkLoads.size + this.pendingSavedChunkLoads.size;
    const loadPipelineLimit = Math.max(maxLoads, maxLoads * MAX_PENDING_LOAD_MULTIPLIER);
    const meshBacklogLimit = Math.max(maxLoads, maxLoads * MESH_BACKLOG_LOAD_THROTTLE_MULTIPLIER);

    // The same worker handles generation and meshing. If we keep feeding generation while
    // meshes are backed up, the world fills with invisible/temporary chunks before it can
    // draw them, which shows up as ugly loading holes and boundary flicker at high distances.
    if (this.countDirtyChunks() > meshBacklogLimit) return 0;

    return Math.max(0, Math.min(maxLoads, loadPipelineLimit - pendingLoads));
  }

  pickNearestQueuedChunks(centerCx: number, centerCz: number, limit: number): ChunkQueueEntry[] {
    const nearest: PriorityEntry<ChunkQueueEntry>[] = [];

    // Huge quality tiers can queue thousands of chunks; keep only the few this frame can request.
    for (const queued of this.chunkLoadQueue.values()) {
      this.insertNearest(nearest, queued, centerCx, centerCz, limit);
    }

    return nearest.map((entry) => entry.item);
  }

  requestChunkGeneration(cx: number, cz: number): void {
    const key = this.key(cx, cz);
    if (!this.workerPool || this.pendingChunkKeys.has(key) || this.chunks.has(key)) {
      return;
    }

    const requestId = this.nextWorkerRequestId();
    this.chunkLoadQueue.delete(key);
    this.pendingChunkKeys.add(key);
    const payload: ChunkGenerateJobPayload = {
      requestId,
      cx,
      cz,
      seed: this.seed,
      terrainProfile: this.terrainProfile
    };
    const handle = this.workerPool.enqueue<ChunkGenerateJobPayload, VoxelWorldWorkerResult>({
      type: CHUNK_GENERATE_JOB,
      payload,
      priority: this.getChunkWorkerPriority(cx, cz, 40),
      run: buildChunkGenerateJob
    });
    this.pendingChunkLoads.set(requestId, { key, cx, cz, jobId: handle.id });
    void handle.promise.then((result) => this.bufferChunkWorkerResult(result));
  }

  requestSavedChunkLoad(cx: number, cz: number): void {
    const key = this.key(cx, cz);
    if (
      this.pendingSavedChunkKeys.has(key) ||
      this.chunks.has(key) ||
      !this.savedChunkKeys.has(key)
    ) {
      return;
    }

    const generation = this.storageGeneration;
    this.chunkLoadQueue.delete(key);
    this.pendingSavedChunkKeys.add(key);
    this.pendingSavedChunkLoads.set(key, { key, cx, cz, generation });

    this.storage.loadChunkSnapshot(key)
      .then((snapshot) => {
        this.savedChunkResults.push({ key, cx, cz, snapshot, generation });
      })
      .catch((error) => {
        console.warn("Could not stream saved chunk", key, error);
        this.savedChunkResults.push({ key, cx, cz, snapshot: null, generation });
      });
  }

  processSavedChunkResults(maxResults = MAX_CHUNK_LOADS_PER_FRAME): void {
    if (this.savedChunkResults.length === 0) return;

    const selectedResults = this.pickSavedChunkResultIndexes(maxResults);
    const remaining: SavedChunkLoadResult[] = [];
    for (let index = 0; index < this.savedChunkResults.length; index += 1) {
      const result = this.savedChunkResults[index];
      if (!selectedResults.has(index)) {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingSavedChunkLoads.get(result.key);
      if (!pending || pending.generation !== result.generation) continue;

      this.pendingSavedChunkLoads.delete(result.key);
      this.pendingSavedChunkKeys.delete(result.key);

      if (!result.snapshot) {
        this.forgetSavedChunk(result.key);
        continue;
      }

      this.savedChunks.set(result.key, result.snapshot);
      if (!this.chunks.has(result.key)) {
        this.addGeneratedChunk(
          result.cx,
          result.cz,
          result.snapshot.blocks,
          true,
          result.snapshot.partialBlocks
        );
        this.lastLoadedChunks += 1;
      }
    }

    this.savedChunkResults = remaining;
  }

  processGeneratedChunkResults(maxResults = MAX_CHUNK_LOADS_PER_FRAME): void {
    if (this.workerResults.length === 0) return;

    const selectedResults = this.pickWorkerResultIndexes("generated", maxResults);
    const remaining: VoxelWorldWorkerResult[] = [];
    for (let index = 0; index < this.workerResults.length; index += 1) {
      const result = this.workerResults[index];
      if (result.type !== "generated") {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingChunkLoads.get(result.requestId);
      if (!pending) continue;

      if (!selectedResults.has(index)) {
        remaining.push(result);
        continue;
      }

      this.pendingChunkLoads.delete(result.requestId);
      this.pendingChunkKeys.delete(pending.key);
      if (!this.chunks.has(pending.key)) {
        this.addGeneratedChunk(result.cx, result.cz, result.blocks);
        this.lastLoadedChunks += 1;
      }
    }

    this.workerResults = remaining;
  }

  nextWorkerRequestId(): number {
    this.workerRequestId += 1;
    return this.workerRequestId;
  }

  private bufferChunkWorkerResult(result: WorkerPoolJobResult<VoxelWorldWorkerResult>): void {
    if (result.status === "completed") {
      this.workerResults.push(result.result);
      return;
    }

    if (result.type === CHUNK_GENERATE_JOB) {
      this.releasePendingChunkLoadByJobId(
        result.id,
        result.status,
        result.status === "failed" ? result.error : undefined
      );
      return;
    }

    if (result.type === CHUNK_MESH_JOB) {
      this.releasePendingMeshBuildByJobId(
        result.id,
        result.status,
        result.status === "failed" ? result.error : undefined
      );
      return;
    }

    if (result.type === BLOCK_LIGHT_BUILD_JOB) {
      this.releasePendingBlockLightBuildByJobId(
        result.id,
        result.status,
        result.status === "failed" ? result.error : undefined
      );
    }
  }

  private releasePendingChunkLoadByJobId(
    jobId: number,
    status: WorkerPoolJobResult<VoxelWorldWorkerResult>["status"],
    error?: unknown
  ): void {
    const requestId = findPendingChunkRequestIdByJob(this.pendingChunkLoads, jobId);
    if (requestId === null) return;
    const pending = this.pendingChunkLoads.get(requestId);
    if (!pending) return;

    this.pendingChunkLoads.delete(requestId);
    this.pendingChunkKeys.delete(pending.key);

    if (status === "failed") {
      console.warn("Chunk generation worker-pool job failed", pending.key, error);
      if (!this.chunks.has(pending.key)) {
        this.chunkLoadQueue.set(pending.key, { cx: pending.cx, cz: pending.cz });
        this.invalidateChunkQueueWindow();
      }
    }
  }

  private releasePendingMeshBuildByJobId(
    jobId: number,
    status: WorkerPoolJobResult<VoxelWorldWorkerResult>["status"],
    error?: unknown
  ): void {
    const requestId = findPendingMeshRequestIdByJob(this.pendingMeshBuilds, jobId);
    if (requestId === null) return;
    const pending = this.pendingMeshBuilds.get(requestId);
    if (!pending) return;

    this.pendingMeshBuilds.delete(requestId);
    this.pendingMeshKeys.delete(pending.key);

    const [cxText, czText] = pending.key.split(",");
    const chunk = this.getChunk(Number(cxText), Number(czText));
    if (chunk) this.markChunkDirty(chunk);

    if (status === "failed") {
      console.warn("Chunk mesh worker-pool job failed", pending.key, error);
    }
  }

  private releasePendingBlockLightBuildByJobId(
    jobId: number,
    status: WorkerPoolJobResult<VoxelWorldWorkerResult>["status"],
    error?: unknown
  ): void {
    const requestId = findPendingBlockLightRequestIdByJob(this.pendingBlockLightBuilds, jobId);
    if (requestId === null) return;
    const pending = this.pendingBlockLightBuilds.get(requestId);
    if (!pending) return;

    this.pendingBlockLightBuilds.delete(requestId);
    this.pendingBlockLightKeys.delete(pending.key);

    const [cxText, czText] = pending.key.split(",");
    const chunk = this.getChunk(Number(cxText), Number(czText));
    if (chunk) this.markBlockLightChunkDirty(chunk.cx, chunk.cz, { bumpRevision: false });

    if (status === "failed") {
      console.warn("Block-light worker-pool job failed", pending.key, error);
    }
  }

  generateChunk(chunk: Chunk): void {
    this.clearDamageForChunk(chunk.cx, chunk.cz);
    chunk.blocks.set(generateChunkBlocks(chunk.cx, chunk.cz, this.terrain));
    this.markChunkDirty(chunk);
    chunk.modified = false;
    this.modifiedChunkKeys.delete(this.key(chunk.cx, chunk.cz));
    chunk.revision = 0;
    chunk.refreshTopColumns();
    this.reindexChunkLocalLights(chunk);
  }

  toChunkCoords(x: number, z: number): ChunkCoords {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cz, lx, lz };
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.air;
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    return this.getChunk(cx, cz)?.getLocal(lx, Math.floor(y), lz) ?? BLOCK.air;
  }

  getBlockLightLevel(x: number, y: number, z: number): number {
    const blockY = Math.floor(y);
    if (blockY < 0 || blockY >= WORLD_HEIGHT) return 0;

    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    const key = this.key(cx, cz);
    const chunk = this.getChunk(cx, cz);
    const cached = this.blockLightCache.get(key);
    // Edits invalidate the cache before they dirty meshes. Refuse a mismatched
    // revision as an extra guard so fast debris never flashes stale Lamp light
    // while the derived worker job catches up.
    if (!chunk || !cached || cached.revision !== chunk.revision) return 0;
    return cached.blockLight[getBlockLightIndex(lx, blockY, lz)] ?? 0;
  }

  getLocalLightSources(
    origin: Pick<THREE.Vector3, "x" | "y" | "z">,
    radiusMeters: number
  ): readonly LocalLightSelection[] {
    const sources = this.iterLocalLightSources();
    return selectNearestLocalLightSources(sources, origin, radiusMeters);
  }

  setBlock(x: number, y: number, z: number, block: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    const key = this.key(cx, cz);
    const chunk = this.ensureChunk(cx, cz);
    const previousBlock = chunk.getLocal(lx, blockY, lz);
    if (!chunk.setLocal(lx, blockY, lz, block)) {
      if (block === BLOCK.air) this.blockDamage.delete(this.damageKey(blockX, blockY, blockZ));
      this.removePartialBlock({ x: blockX, y: blockY, z: blockZ });
      return;
    }
    this.updateLocalLightBlockAt(key, blockX, blockY, blockZ, previousBlock, block);
    this.blockDamage.delete(this.damageKey(blockX, blockY, blockZ));
    this.removePartialBlock({ x: blockX, y: blockY, z: blockZ }, { persist: false });
    chunk.modified = true;
    this.dirtyChunkKeys.add(key);
    this.modifiedChunkKeys.add(key);
    this.rememberModifiedChunk(key, chunk.blocks);

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    this.markBlockLightChunksDirtyForEdit(blockX, blockZ);
  }

  private *iterLocalLightSources(): Iterable<LocalLightSource> {
    for (const key of this.localLightBlockKeys) {
      const position = parseBlockKey(key);
      if (!position) continue;
      const block = this.getBlock(position.x, position.y, position.z);
      if (!isLocalLightBlock(block)) continue;

      const surfaceEmitter = this.createLocalLightSurfaceEmitter(position);
      if (!surfaceEmitter) continue;
      yield { ...position, block, ...surfaceEmitter };
    }
  }

  private createLocalLightSurfaceEmitter(position: PartialBlockPosition): {
    readonly lightX: number;
    readonly lightY: number;
    readonly lightZ: number;
    readonly sourceKey: string;
  } | null {
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    const exposedFaceKeys: string[] = [];

    for (const direction of LOCAL_LIGHT_EXPOSED_FACE_DIRECTIONS) {
      const neighborBlock = this.getBlock(
        position.x + direction.dx,
        position.y + direction.dy,
        position.z + direction.dz
      );
      const neighborDefinition = BLOCKS[neighborBlock] ?? BLOCKS[BLOCK.air];
      if (neighborDefinition.solid) continue;

      normalX += direction.dx;
      normalY += direction.dy;
      normalZ += direction.dz;
      exposedFaceKeys.push(direction.key);
    }

    if (exposedFaceKeys.length === 0) {
      return null;
    }

    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    const emitterOffset = LOCAL_LIGHT_EMITTER_FACE_OFFSET / normalLength;

    // Lamp blocks are solid terrain, so a light at the block center can bury
    // itself inside a player-built fixture. Emit from the averaged exposed
    // surface instead; exterior lamp faces glow, interior lamp filler does not.
    return {
      lightX: position.x + 0.5 + normalX * emitterOffset,
      lightY: position.y + 0.5 + normalY * emitterOffset,
      lightZ: position.z + 0.5 + normalZ * emitterOffset,
      sourceKey: `${position.x},${position.y},${position.z}:surface:${exposedFaceKeys.join("")}`
    };
  }

  private reindexChunkLocalLights(chunk: Chunk): void {
    const chunkKey = this.key(chunk.cx, chunk.cz);
    this.removeChunkLocalLights(chunkKey);

    const chunkLightKeys = new Set<string>();
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const block = chunk.getLocal(x, y, z);
          if (!isLocalLightBlock(block)) continue;
          const lightKey = this.damageKey(baseX + x, y, baseZ + z);
          this.localLightBlockKeys.add(lightKey);
          chunkLightKeys.add(lightKey);
        }
      }
    }

    if (chunkLightKeys.size > 0) {
      this.localLightBlockKeysByChunk.set(chunkKey, chunkLightKeys);
    }
  }

  private updateLocalLightBlockAt(
    chunkKey: string,
    x: number,
    y: number,
    z: number,
    previousBlock: number,
    nextBlock: number
  ): void {
    if (!isLocalLightBlock(previousBlock) && !isLocalLightBlock(nextBlock)) return;

    const lightKey = this.damageKey(x, y, z);
    const chunkLightKeys = this.localLightBlockKeysByChunk.get(chunkKey) ?? new Set<string>();
    if (isLocalLightBlock(nextBlock)) {
      this.localLightBlockKeys.add(lightKey);
      chunkLightKeys.add(lightKey);
      this.localLightBlockKeysByChunk.set(chunkKey, chunkLightKeys);
      return;
    }

    this.localLightBlockKeys.delete(lightKey);
    chunkLightKeys.delete(lightKey);
    if (chunkLightKeys.size > 0) {
      this.localLightBlockKeysByChunk.set(chunkKey, chunkLightKeys);
    } else {
      this.localLightBlockKeysByChunk.delete(chunkKey);
    }
  }

  private removeChunkLocalLights(chunkKey: string): void {
    const chunkLightKeys = this.localLightBlockKeysByChunk.get(chunkKey);
    if (!chunkLightKeys) return;
    for (const lightKey of chunkLightKeys) {
      this.localLightBlockKeys.delete(lightKey);
    }
    this.localLightBlockKeysByChunk.delete(chunkKey);
  }

  damageBlock(x: number, y: number, z: number, amount = 1): BlockDamageResult | null {
    const position = {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z)
    };
    const block = this.getBlock(position.x, position.y, position.z);
    const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
    const maxHealth = getTerrainMaxHealth(block);
    if (!definition.solid || maxHealth <= 0) return null;

    const key = this.damageKey(position.x, position.y, position.z);
    const nextDamage = (this.blockDamage.get(key) ?? 0) + Math.max(0, amount);
    const remainingHealth = Math.max(0, maxHealth - nextDamage);

    if (remainingHealth > 0) {
      this.blockDamage.set(key, nextDamage);
      return { block, position, remainingHealth, maxHealth, destroyed: false };
    }

    this.blockDamage.delete(key);
    this.setBlock(position.x, position.y, position.z, BLOCK.air);
    return { block, position, remainingHealth: 0, maxHealth, destroyed: true };
  }

  carveBlockBrush(
    input: BlockCarveInput,
    options: BlockDamageBrushOptions = {}
  ): BlockDamageBrushResult | null {
    const targets = this.createWeightedBlockDamageBrushTargets(input, options);
    const results: BlockDamageResult[] = [];
    let primaryResult: BlockDamageResult | undefined;

    for (const target of targets) {
      const result = this.carveBlock({
        ...input,
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
        point: target.point,
        normal: target.normal,
        incomingDirection: getBlockDamageBrushTargetIncomingDirection(input, target),
        amount: target.damageAmount
      });
      if (!result) continue;

      results.push(result);
      if (target.primary) primaryResult = result;
    }

    if (results.length === 0) return null;
    return {
      results,
      primaryResult,
      pierceContinuation: primaryResult?.pierceContinuation
    };
  }

  previewBlockDamageBrush(
    input: BlockCarveInput,
    options: BlockDamageBrushOptions = {}
  ): BlockDamageBrushPreview | null {
    const previewTargets = this.createWeightedBlockDamageBrushTargets(input, options)
      .map((target) => this.previewBlockCarve({
        ...input,
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
        point: target.point,
        normal: target.normal,
        incomingDirection: getBlockDamageBrushTargetIncomingDirection(input, target),
        amount: target.damageAmount
      }, target))
      .filter((target): target is BlockDamageBrushPreviewTarget => Boolean(target));

    return previewTargets.length > 0 ? { targets: previewTargets } : null;
  }

  previewTerraformerEdit(input: TerraformerEditInput): TerraformerEditPreview | null {
    const size = normalizeTerraformerSize(input.size);
    const cells = this.createTerraformerTargetSubCells(input, size);
    if (cells.length === 0) return null;

    return {
      key: createTerraformerPreviewKey(size, cells),
      size,
      cells
    };
  }

  applyTerraformerEdit(input: TerraformerEditInput): TerraformerEditResult | null {
    const preview = this.previewTerraformerEdit(input);
    if (!preview) return null;

    const cellsByBlock = new Map<string, TerraformerTargetSubCell[]>();
    for (const cell of preview.cells) {
      getOrCreateArrayBucket(
        cellsByBlock,
        this.damageKey(cell.position.x, cell.position.y, cell.position.z)
      ).push(cell);
    }

    const results: BlockDamageResult[] = [];
    let primaryResult: BlockDamageResult | undefined;
    const primaryKey = this.damageKey(Math.floor(input.x), Math.floor(input.y), Math.floor(input.z));

    for (const [key, cells] of cellsByBlock) {
      const position = cells[0]?.position;
      if (!position) continue;

      const result = this.applyTerraformerEditToBlock(position, cells, input);
      if (!result) continue;

      results.push(result);
      if (key === primaryKey) primaryResult = result;
    }

    if (results.length === 0) return null;
    return {
      preview,
      results,
      primaryResult: primaryResult ?? results[0]
    };
  }

  carveBlock(input: BlockCarveInput): BlockDamageResult | null {
    const position = {
      x: Math.floor(input.x),
      y: Math.floor(input.y),
      z: Math.floor(input.z)
    };
    const block = this.getBlock(position.x, position.y, position.z);
    const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
    const maxHealth = getTerrainMaxHealth(block);
    if (!definition.solid || maxHealth <= 0) return null;

    const key = this.damageKey(position.x, position.y, position.z);
    const amount = Math.max(0, input.amount ?? 1);
    const previousDamage = this.blockDamage.get(key) ?? 0;
    const nextDamage = previousDamage + amount;
    const remainingHealth = Math.max(0, maxHealth - nextDamage);
    const appliedDamage = Math.max(0, Math.min(amount, maxHealth - previousDamage));
    const cappedDamageAfter = Math.min(maxHealth, nextDamage);
    const ejectedRubbleMaterialUnits = getEjectedBlockRubbleMaterialUnits(
      previousDamage,
      nextDamage,
      maxHealth
    );

    if (remainingHealth > 0) {
      this.blockDamage.set(key, nextDamage);
      const partialCutResult = this.addPartialBlockCut(block, position, maxHealth, nextDamage, {
        point: input.point,
        normal: input.normal,
        incomingDirection: input.incomingDirection,
        coreRadius: input.coreRadius,
        speed: input.speed
      });
      const partialCell = partialCutResult.cell;
      const latestCut = partialCell.cuts[partialCell.cuts.length - 1] ?? null;
      return {
        block,
        position,
        remainingHealth,
        maxHealth,
        destroyed: false,
        damageApplied: appliedDamage,
        damageBefore: previousDamage,
        damageAfter: cappedDamageAfter,
        affectedVisualCellIndexes: partialCutResult.newlyRemovedVisualCellIndexes,
        supportInvalidationCells: createTerrainSupportInvalidationCellsForVisualCells(
          position,
          partialCutResult.newlyRemovedVisualCellIndexes
        ),
        bitePoofPositions: createPartialBlockBitePoofPositions(
          position,
          partialCutResult.newlyRemovedVisualCellIndexes,
          input.normal
        ),
        ejectedRubbleMaterialUnits,
        debrisEjectionHint: this.createPartialBlockDebrisEjectionHint(
          partialCell,
          partialCutResult.newlyRemovedVisualCellIndexes,
          input,
          ejectedRubbleMaterialUnits
        ),
        pierceContinuation: latestCut
          ? this.createPartialBlockPierceContinuation(partialCell, latestCut, input)
          : undefined
      };
    }

    this.blockDamage.delete(key);
    const remainingVisualCellIndexes = this.getRemainingPartialBlockVisualCellIndexes(position);
    const bitePoofPositions = createPartialBlockDespawnPoofPositions(
      position,
      remainingVisualCellIndexes
    );
    // The damaged block has already shown its bite-lattice history while it was
    // alive. On the final health step, clear that custom mesh and leave normal
    // air instead of stamping a wrinkled support puddle into the terrain.
    this.setBlock(position.x, position.y, position.z, BLOCK.air);
    return {
      block,
      position,
      remainingHealth: 0,
      maxHealth,
      destroyed: true,
      damageApplied: appliedDamage,
      damageBefore: previousDamage,
      damageAfter: maxHealth,
      affectedVisualCellIndexes: remainingVisualCellIndexes,
      supportInvalidationCells: createTerrainSupportInvalidationCellsForVisualCells(
        position,
        remainingVisualCellIndexes
      ),
      bitePoofPositions,
      ejectedRubbleMaterialUnits,
      debrisEjectionHint: createFallbackDebrisEjectionHint(position, input, ejectedRubbleMaterialUnits)
    };
  }

  getBlockDamage(x: number, y: number, z: number): number {
    return this.blockDamage.get(this.damageKey(Math.floor(x), Math.floor(y), Math.floor(z))) ?? 0;
  }

  getPartialBlock(x: number, y: number, z: number): PartialBlockCell | null {
    return this.partialBlocks.get(createPartialBlockKey({
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z)
    })) ?? null;
  }

  getPartialBlocks(): readonly PartialBlockCell[] {
    return Array.from(this.partialBlocks.values());
  }

  getDirtyPartialBlockMeshRegionCount(): number {
    return this.dirtyPartialBlockRegionKeys.size;
  }

  hasUrgentPartialBlockMeshRegions(): boolean {
    return this.urgentPartialBlockRegionKeys.size > 0;
  }

  consumePartialBlockMeshRegionUpdates({
    maxRegions = Number.POSITIVE_INFINITY,
    origin
  }: PartialBlockMeshUpdateBatchOptions = {}): readonly PartialBlockMeshRegionUpdate[] {
    if (this.dirtyPartialBlockRegionKeys.size === 0 || maxRegions <= 0) return [];

    const dirtyKeys = [...this.dirtyPartialBlockRegionKeys];
    const urgentKeys = dirtyKeys.filter((key) => this.urgentPartialBlockRegionKeys.has(key));
    const normalKeys = dirtyKeys.filter((key) => !this.urgentPartialBlockRegionKeys.has(key));
    const sortedNormalKeys = origin
      ? normalKeys.sort((a, b) => this.getPartialBlockRegionDistanceSq(a, origin) - this.getPartialBlockRegionDistanceSq(b, origin))
      : normalKeys;
    const selectedKeys = [...urgentKeys, ...sortedNormalKeys].slice(0, Math.floor(maxRegions));

    for (const key of selectedKeys) {
      this.dirtyPartialBlockRegionKeys.delete(key);
      this.urgentPartialBlockRegionKeys.delete(key);
    }

    return selectedKeys.map((key) => this.createPartialBlockMeshRegionUpdate(
      key,
      urgentKeys.includes(key)
    ));
  }

  getPartialBlockCount(): number {
    return this.partialBlocks.size;
  }

  getPartialBlockGeometryRevision(): number {
    return this.partialBlockGeometryRevision;
  }

  getSupportHeight(bounds: CollisionBounds): number | null {
    return getPartialBlockSupportHeight(this.partialBlocks.values(), bounds);
  }

  getPlayerFootprintSupportHeight(bounds: CollisionBounds, options?: {
    readonly minPassableSubBlocks?: number;
    readonly minHorizontalClearanceSubBlocks?: number;
    readonly stance?: "standing" | "crawling";
  }): number | null {
    const minX = Math.floor(bounds.minX - 1);
    const maxX = Math.floor(bounds.maxX + 1);
    const minY = Math.floor(bounds.minY - 1);
    const maxY = Math.floor(bounds.maxY);
    const minZ = Math.floor(bounds.minZ - 1);
    const maxZ = Math.floor(bounds.maxZ + 1);
    const cells: PartialBlockCell[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const cell = this.getPartialBlock(x, y, z);
          if (cell) cells.push(cell);
        }
      }
    }

    const result = getPartialBlockPlayerFootprintSupport(cells, bounds, {
      minPassableSubBlocks: options?.minPassableSubBlocks
    });
    return result.hasPassableAperture ? null : result.supportY;
  }

  getCellCollisionBoxes(x: number, y: number, z: number): readonly CollisionBounds[] | null {
    const cell = this.getPartialBlock(x, y, z);
    return cell ? createPartialBlockCollisionBoxes(cell) : null;
  }

  isRenderableSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    if (this.getPartialBlock(blockX, blockY, blockZ)) return false;
    return this.isSolid(blockX, blockY, blockZ);
  }

  shouldRenderPartialBlockFace(
    cell: PartialBlockCell,
    normal: PartialBlockPosition
  ): boolean {
    const neighborX = cell.position.x + normal.x;
    const neighborY = cell.position.y + normal.y;
    const neighborZ = cell.position.z + normal.z;
    return !this.isRenderableSolid(neighborX, neighborY, neighborZ);
  }

  damageKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  clearDamageForChunk(cx: number, cz: number): void {
    const minX = cx * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1;
    const minZ = cz * CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE - 1;

    for (const key of this.blockDamage.keys()) {
      const [x, , z] = key.split(",").map(Number);
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        if (this.partialBlocks.has(key)) continue;
        this.blockDamage.delete(key);
      }
    }
  }

  private createTerraformerTargetSubCells(
    input: TerraformerEditInput,
    size: number
  ): readonly TerraformerTargetSubCell[] {
    const center = createTerraformerGlobalSubCellCenter(input);
    const normal = normalizeVoxelVector(input.normal) ?? { x: 0, y: 0, z: 0 };
    const xValues = createTerraformerBrushAxisValues(center.x, size, normal.x);
    const yValues = createTerraformerBrushAxisValues(center.y, size, normal.y);
    const zValues = createTerraformerBrushAxisValues(center.z, size, normal.z);
    const targets: TerraformerTargetSubCell[] = [];

    for (const globalY of yValues) {
      for (const globalZ of zValues) {
        for (const globalX of xValues) {
          const position = createBlockPositionFromGlobalSubCell(globalX, globalY, globalZ);
          if (position.y < 0 || position.y >= WORLD_HEIGHT) continue;

          const block = this.getBlock(position.x, position.y, position.z);
          const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
          const maxHealth = getTerrainMaxHealth(block);
          if (!definition.solid || maxHealth <= 0 || block === BLOCK.rubble) continue;

          const cellIndex = createLocalSubCellIndex(globalX, globalY, globalZ);
          if (this.getRemovedPartialBlockVisualCellIndexes(position).has(cellIndex)) continue;

          targets.push({
            block,
            position,
            cellIndex,
            globalX,
            globalY,
            globalZ,
            bounds: createSubCellBounds(globalX, globalY, globalZ),
            remainingHealth: Math.max(0, maxHealth - (this.blockDamage.get(createPartialBlockKey(position)) ?? 0)),
            maxHealth
          });
        }
      }
    }

    return targets;
  }

  private applyTerraformerEditToBlock(
    position: VoxelBlockPosition,
    cells: readonly TerraformerTargetSubCell[],
    input: TerraformerEditInput
  ): BlockDamageResult | null {
    const block = this.getBlock(position.x, position.y, position.z);
    const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
    const maxHealth = getTerrainMaxHealth(block);
    const subCellHealth = getTerraformerSubCellHealth(block);
    if (!definition.solid || maxHealth <= 0 || subCellHealth <= 0 || block === BLOCK.rubble) return null;

    const key = createPartialBlockKey(position);
    const existing = this.partialBlocks.get(key);
    const removedCells = this.getRemovedPartialBlockVisualCellIndexes(position);
    const newlyRemovedCellIndexes = cells
      .map((cell) => cell.cellIndex)
      .filter((cellIndex) => !removedCells.has(cellIndex));
    if (newlyRemovedCellIndexes.length === 0) return null;

    for (const cellIndex of newlyRemovedCellIndexes) {
      removedCells.add(cellIndex);
    }

    const previousDamage = this.blockDamage.get(key) ?? 0;
    const nextDamage = Math.min(maxHealth, previousDamage + newlyRemovedCellIndexes.length * subCellHealth);
    const appliedDamage = Math.max(0, nextDamage - previousDamage);
    const ejectedRubbleMaterialUnits = getEjectedBlockRubbleMaterialUnits(
      previousDamage,
      nextDamage,
      maxHealth
    );
    const cuts = createNextPartialBlockCuts(
      block,
      position,
      existing?.cuts ?? [],
      input,
      newlyRemovedCellIndexes
    );
    const cell: PartialBlockCell = {
      block,
      position,
      cuts,
      removedVisualCellIndexes: [...removedCells].sort((left, right) => left - right),
      damage: nextDamage,
      maxHealth
    };
    const destroyed = nextDamage >= maxHealth || removedCells.size >= BLOCK_FRAGMENT_GRID_SIZE ** 3;
    const bitePoofPositions = createPartialBlockBitePoofPositions(
      position,
      newlyRemovedCellIndexes,
      input.normal
    );
    const debrisEjectionHint = this.createPartialBlockDebrisEjectionHint(
      cell,
      newlyRemovedCellIndexes,
      input,
      ejectedRubbleMaterialUnits
    );

    if (destroyed) {
      const remainingSilentCellIndexes = [...Array(BLOCK_FRAGMENT_GRID_SIZE ** 3).keys()]
        .filter((cellIndex) => !removedCells.has(cellIndex));
      const affectedVisualCellIndexes = mergeUniqueVisualCellIndexes(
        newlyRemovedCellIndexes,
        remainingSilentCellIndexes
      );
      const finalBitePoofPositions = [
        ...bitePoofPositions,
        ...createPartialBlockDespawnPoofPositions(position, remainingSilentCellIndexes)
      ];
      this.blockDamage.delete(key);
      this.setBlock(position.x, position.y, position.z, BLOCK.air);
      return {
        block,
        position,
        remainingHealth: 0,
        maxHealth,
        destroyed: true,
        damageApplied: appliedDamage,
        damageBefore: previousDamage,
        damageAfter: nextDamage,
        affectedVisualCellIndexes,
        supportInvalidationCells: createTerrainSupportInvalidationCellsForVisualCells(
          position,
          affectedVisualCellIndexes
        ),
        bitePoofPositions: finalBitePoofPositions,
        ejectedRubbleMaterialUnits,
        debrisEjectionHint
      };
    }

    this.blockDamage.set(key, nextDamage);
    this.setPartialBlockCell(cell, { urgentVisual: !existing });
    return {
      block,
      position,
      remainingHealth: Math.max(0, maxHealth - nextDamage),
      maxHealth,
      destroyed: false,
      damageApplied: appliedDamage,
      damageBefore: previousDamage,
      damageAfter: nextDamage,
      affectedVisualCellIndexes: newlyRemovedCellIndexes,
      supportInvalidationCells: createTerrainSupportInvalidationCellsForVisualCells(
        position,
        newlyRemovedCellIndexes
      ),
      bitePoofPositions,
      ejectedRubbleMaterialUnits,
      debrisEjectionHint
    };
  }

  private getRemovedPartialBlockVisualCellIndexes(position: VoxelBlockPosition): Set<number> {
    const existing = this.partialBlocks.get(createPartialBlockKey(position));
    if (!existing) return new Set();
    return new Set(existing.removedVisualCellIndexes ?? createPartialBlockRemovedVisualCellIndexes(existing));
  }

  private createBlockDamageBrushTargets(input: BlockCarveInput): BlockDamageBrushTarget[] {
    const primaryPosition = {
      x: Math.floor(input.x),
      y: Math.floor(input.y),
      z: Math.floor(input.z)
    };
    const brushRadius = getBlockDamageBrushRadius(input);
    const brushRadiusSq = brushRadius * brushRadius;
    const minX = Math.floor(input.point.x - brushRadius);
    const maxX = Math.floor(input.point.x + brushRadius);
    const minY = Math.max(0, Math.floor(input.point.y - brushRadius));
    const maxY = Math.min(WORLD_HEIGHT - 1, Math.floor(input.point.y + brushRadius));
    const minZ = Math.floor(input.point.z - brushRadius);
    const maxZ = Math.floor(input.point.z + brushRadius);
    const targets = new Map<string, BlockDamageBrushTarget>();

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const position = { x, y, z };
          const primary = x === primaryPosition.x && y === primaryPosition.y && z === primaryPosition.z;
          const distanceSq = primary ? 0 : getPointToBlockAabbDistanceSq(input.point, position);
          if (!primary && distanceSq > brushRadiusSq + PROJECTILE_SWEEP_EPSILON) continue;
          if (this.getBlock(x, y, z) === BLOCK.air) continue;

          targets.set(this.damageKey(x, y, z), {
            position,
            point: clampPointToBlock(input.point, position),
            normal: createBlockDamageBrushNormal(position, input.point, input.normal, primary),
            distanceSq,
            primary
          });
        }
      }
    }

    if (!targets.has(this.damageKey(primaryPosition.x, primaryPosition.y, primaryPosition.z))) {
      const block = this.getBlock(primaryPosition.x, primaryPosition.y, primaryPosition.z);
      if (block !== BLOCK.air) {
        targets.set(this.damageKey(primaryPosition.x, primaryPosition.y, primaryPosition.z), {
          position: primaryPosition,
          point: clampPointToBlock(input.point, primaryPosition),
          normal: createBlockDamageBrushNormal(primaryPosition, input.point, input.normal, true),
          distanceSq: 0,
          primary: true
        });
      }
    }

    return Array.from(targets.values())
      .sort((left, right) =>
        Number(right.primary) - Number(left.primary) ||
        left.distanceSq - right.distanceSq ||
        left.position.y - right.position.y ||
        left.position.z - right.position.z ||
        left.position.x - right.position.x
      )
      .slice(0, PARTIAL_BLOCK_DAMAGE_BRUSH_MAX_TARGETS);
  }

  private createWeightedBlockDamageBrushTargets(
    input: BlockCarveInput,
    options: BlockDamageBrushOptions
  ): WeightedBlockDamageBrushTarget[] {
    const damageAmount = Math.max(0, input.amount ?? 1);
    if (damageAmount <= 0) return [];

    const brushRadius = getBlockDamageBrushRadius(input);
    const targets = this.createBlockDamageBrushTargets(input)
      .filter((target) => !options.blockedDamageKeys?.has(
        this.damageKey(target.position.x, target.position.y, target.position.z)
      ));
    if (targets.length === 0) return [];

    let weightedTargets = targets
      .map((target) => ({
        target,
        weight: getBlockDamageBrushTargetWeight(target, brushRadius)
      }))
      .filter((target) => target.weight > PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_WEIGHT);

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const totalWeight = weightedTargets.reduce((sum, target) => sum + target.weight, 0);
      if (totalWeight <= PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_WEIGHT) return [];

      const distributedTargets = weightedTargets.map(({ target, weight }) => ({
        ...target,
        damageAmount: damageAmount * (weight / totalWeight)
      }));
      const connectedKeys = this.getConnectedDamageBrushTargetKeys(input, distributedTargets);
      const connectedTargets = weightedTargets.filter(({ target }) =>
        connectedKeys.has(this.damageKey(target.position.x, target.position.y, target.position.z))
      );
      if (connectedTargets.length === weightedTargets.length) return distributedTargets;
      if (connectedTargets.length === 0) return distributedTargets.filter((target) => target.primary);
      weightedTargets = connectedTargets;
    }

    const totalWeight = weightedTargets.reduce((sum, target) => sum + target.weight, 0);
    if (totalWeight <= PARTIAL_BLOCK_DAMAGE_BRUSH_MIN_WEIGHT) return [];
    return weightedTargets.map(({ target, weight }) => ({
      ...target,
      damageAmount: damageAmount * (weight / totalWeight)
    }));
  }

  private getConnectedDamageBrushTargetKeys(
    input: BlockCarveInput,
    targets: readonly WeightedBlockDamageBrushTarget[]
  ): ReadonlySet<string> {
    if (targets.length <= 1) {
      return new Set(targets.map((target) =>
        this.damageKey(target.position.x, target.position.y, target.position.z)
      ));
    }

    const cellKeys = new Set<string>();
    const cellTargetKeys = new Map<string, string>();
    let seedCellKey: string | undefined;

    for (const target of targets) {
      const targetKey = this.damageKey(target.position.x, target.position.y, target.position.z);
      const preview = this.previewBlockCarve({
        ...input,
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
        point: target.point,
        normal: target.normal,
        incomingDirection: getBlockDamageBrushTargetIncomingDirection(input, target),
        amount: target.damageAmount
      }, target);
      if (!preview) continue;

      for (const cellIndex of preview.affectedVisualCellIndexes) {
        const cellKey = createGlobalPartialBlockVisualCellKey(target.position, cellIndex);
        cellKeys.add(cellKey);
        cellTargetKeys.set(cellKey, targetKey);
        if (target.primary && seedCellKey === undefined) seedCellKey = cellKey;
      }
    }

    if (!seedCellKey) {
      const primary = targets.find((target) => target.primary);
      return new Set(primary
        ? [this.damageKey(primary.position.x, primary.position.y, primary.position.z)]
        : []);
    }

    const visited = new Set<string>([seedCellKey]);
    const queue = [seedCellKey];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const neighbor of getAdjacentGlobalMicroCellKeys(current)) {
        if (!cellKeys.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const connectedTargetKeys = new Set<string>();
    const primary = targets.find((target) => target.primary);
    if (primary) {
      connectedTargetKeys.add(this.damageKey(primary.position.x, primary.position.y, primary.position.z));
    }
    for (const cellKey of visited) {
      const targetKey = cellTargetKeys.get(cellKey);
      if (targetKey) connectedTargetKeys.add(targetKey);
    }
    return connectedTargetKeys;
  }

  private previewBlockCarve(
    input: BlockCarveInput,
    target: BlockDamageBrushTarget
  ): BlockDamageBrushPreviewTarget | null {
    const position = target.position;
    const block = this.getBlock(position.x, position.y, position.z);
    const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
    const maxHealth = getTerrainMaxHealth(block);
    if (!definition.solid || maxHealth <= 0) return null;

    const amount = Math.max(0, input.amount ?? 1);
    const previousDamage = this.blockDamage.get(this.damageKey(position.x, position.y, position.z)) ?? 0;
    const nextDamage = previousDamage + amount;
    const remainingHealth = Math.max(0, maxHealth - nextDamage);
    const affectedVisualCellIndexes = remainingHealth > 0
      ? this.previewPartialBlockCut(block, position, maxHealth, nextDamage, {
        point: input.point,
        normal: input.normal,
        incomingDirection: input.incomingDirection,
        coreRadius: input.coreRadius,
        speed: input.speed
      })
      : this.getRemainingPartialBlockVisualCellIndexes(position);

    return {
      block,
      position,
      point: target.point,
      normal: target.normal,
      primary: target.primary,
      remainingHealth,
      maxHealth,
      destroyed: remainingHealth <= 0,
      affectedVisualCellIndexes
    };
  }

  private previewPartialBlockCut(
    block: number,
    position: VoxelBlockPosition,
    maxHealth: number,
    damage: number,
    cutInput: {
      readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly incomingDirection?: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly coreRadius?: number;
      readonly speed: number;
    }
  ): readonly number[] {
    const key = createPartialBlockKey(position);
    const existing = this.partialBlocks.get(key);
    const cuts: PartialBlockCut[] = existing ? [...existing.cuts] : [];
    cuts.push(createPartialBlockCut({
      block,
      position,
      point: cutInput.point,
      normal: cutInput.normal,
      incomingDirection: cutInput.incomingDirection,
      coreRadius: cutInput.coreRadius,
      speed: cutInput.speed,
      cutIndex: cuts.length
    }));
    while (cuts.length > PARTIAL_BLOCK_MAX_CUTS_PER_CELL) {
      cuts.shift();
    }

    const removedVisualCellIndexes = createPartialBlockRemovedVisualCellIndexes(
      { cuts, damage, maxHealth },
      existing?.removedVisualCellIndexes
    );
    const previousRemovedVisualCells = new Set(existing?.removedVisualCellIndexes ?? []);
    return removedVisualCellIndexes.filter((index) => !previousRemovedVisualCells.has(index));
  }

  private getRemainingPartialBlockVisualCellIndexes(position: VoxelBlockPosition): readonly number[] {
    const existing = this.partialBlocks.get(createPartialBlockKey(position));
    const removedVisualCells = new Set(
      existing?.removedVisualCellIndexes ?? (
        existing ? createPartialBlockRemovedVisualCellIndexes(existing) : []
      )
    );
    const remainingIndexes: number[] = [];

    for (let index = 0; index < BLOCK_FRAGMENT_GRID_SIZE ** 3; index += 1) {
      if (!removedVisualCells.has(index)) remainingIndexes.push(index);
    }
    return remainingIndexes;
  }

  private addPartialBlockCut(
    block: number,
    position: VoxelBlockPosition,
    maxHealth: number,
    damage: number,
    cutInput: {
      readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly incomingDirection?: Pick<THREE.Vector3, "x" | "y" | "z">;
      readonly coreRadius?: number;
      readonly speed: number;
    }
  ): PartialBlockCutResult {
    const key = createPartialBlockKey(position);
    const existing = this.partialBlocks.get(key);
    const cuts: PartialBlockCut[] = existing ? [...existing.cuts] : [];
    cuts.push(createPartialBlockCut({
      block,
      position,
      point: cutInput.point,
      normal: cutInput.normal,
      incomingDirection: cutInput.incomingDirection,
      coreRadius: cutInput.coreRadius,
      speed: cutInput.speed,
      cutIndex: cuts.length
    }));
    while (cuts.length > PARTIAL_BLOCK_MAX_CUTS_PER_CELL) {
      cuts.shift();
    }
    const removedVisualCellIndexes = createPartialBlockRemovedVisualCellIndexes(
      { cuts, damage, maxHealth },
      existing?.removedVisualCellIndexes
    );
    const previousRemovedVisualCells = new Set(existing?.removedVisualCellIndexes ?? []);
    const newlyRemovedVisualCellIndexes = removedVisualCellIndexes.filter((index) =>
      !previousRemovedVisualCells.has(index)
    );

    const cell: PartialBlockCell = {
      block,
      position,
      cuts,
      removedVisualCellIndexes,
      damage,
      maxHealth
    };
    this.setPartialBlockCell(cell, { urgentVisual: !existing });
    return {
      cell,
      newlyRemovedVisualCellIndexes
    };
  }

  private createPartialBlockDebrisEjectionHint(
    cell: PartialBlockCell,
    newlyRemovedVisualCellIndexes: readonly number[],
    input: BlockCarveInput,
    ejectedMaterialUnits: number
  ): DebrisEjectionHint {
    const biteCellCenters = newlyRemovedVisualCellIndexes.map((index) =>
      createPartialBlockVisualCellCenter(cell.position, index)
    );
    const preferredDirections = this.createPartialBlockOpeningDirections(
      cell,
      newlyRemovedVisualCellIndexes,
      input
    );
    const fallback = createFallbackDebrisEjectionHint(cell.position, input, ejectedMaterialUnits);
    return {
      origin: averageVoxelVectors(biteCellCenters, fallback.origin),
      preferredDirections: preferredDirections.length > 0
        ? preferredDirections
        : fallback.preferredDirections,
      biteCellCenters: biteCellCenters.length > 0
        ? biteCellCenters
        : fallback.biteCellCenters,
      ejectedMaterialUnits
    };
  }

  private createPartialBlockOpeningDirections(
    cell: PartialBlockCell,
    newlyRemovedVisualCellIndexes: readonly number[],
    input: BlockCarveInput
  ): readonly VoxelVector[] {
    const removedVisualCells = new Set(cell.removedVisualCellIndexes ?? []);
    const sourceIndexes = newlyRemovedVisualCellIndexes.length > 0
      ? newlyRemovedVisualCellIndexes
      : [...removedVisualCells];
    const directions: VoxelVector[] = [];

    for (const index of sourceIndexes) {
      const visualCell = decodePartialBlockVisualCell(index);
      for (const offset of PARTIAL_BLOCK_LATTICE_OPENING_OFFSETS) {
        if (this.isPartialBlockCellOpenAlongDirection(cell.position, visualCell, offset, removedVisualCells)) {
          addUniqueDebrisDirection(directions, offset);
        }
      }
    }

    const fallbackDirection = normalizeVoxelVector(input.normal) ??
      normalizeVoxelVector(input.incomingDirection) ??
      { x: 0, y: 1, z: 0 };
    addUniqueDebrisDirection(directions, fallbackDirection);
    return directions.slice(0, 4);
  }

  private isPartialBlockCellOpenAlongDirection(
    position: VoxelBlockPosition,
    visualCell: { readonly x: number; readonly y: number; readonly z: number },
    direction: VoxelVector,
    removedVisualCells: ReadonlySet<number>
  ): boolean {
    let x = visualCell.x + direction.x;
    let y = visualCell.y + direction.y;
    let z = visualCell.z + direction.z;

    while (
      x >= 0 && x < BLOCK_FRAGMENT_GRID_SIZE &&
      y >= 0 && y < BLOCK_FRAGMENT_GRID_SIZE &&
      z >= 0 && z < BLOCK_FRAGMENT_GRID_SIZE
    ) {
      const index = x + y * BLOCK_FRAGMENT_GRID_SIZE + z * BLOCK_FRAGMENT_GRID_SIZE ** 2;
      if (!removedVisualCells.has(index)) return false;
      x += direction.x;
      y += direction.y;
      z += direction.z;
    }

    const neighborX = position.x + (x < 0 ? -1 : x >= BLOCK_FRAGMENT_GRID_SIZE ? 1 : 0);
    const neighborY = position.y + (y < 0 ? -1 : y >= BLOCK_FRAGMENT_GRID_SIZE ? 1 : 0);
    const neighborZ = position.z + (z < 0 ? -1 : z >= BLOCK_FRAGMENT_GRID_SIZE ? 1 : 0);
    return !this.isSolid(neighborX, neighborY, neighborZ);
  }

  private createPartialBlockPierceContinuation(
    cell: PartialBlockCell,
    cut: PartialBlockCut,
    input: BlockCarveInput
  ): BlockPierceContinuation | undefined {
    const coreRadius = input.coreRadius;
    if (
      typeof coreRadius !== "number" ||
      !Number.isFinite(coreRadius) ||
      coreRadius > PARTIAL_BLOCK_PIERCE_MAX_CORE_RADIUS ||
      input.speed < PARTIAL_BLOCK_PIERCE_MIN_IMPACT_SPEED
    ) {
      return undefined;
    }

    const trajectory = normalizeVoxelVector(input.incomingDirection) ?? cut.trajectory ?? {
      x: -cut.normal.x,
      y: -cut.normal.y,
      z: -cut.normal.z
    };
    const tunnelCellCount = getPartialBlockPierceTunnelCellCount(cell, cut, trajectory);
    if (tunnelCellCount < BLOCK_FRAGMENT_GRID_SIZE) return undefined;

    // Terrain HP is scaled for sub-cell editing, but piercing feel should still
    // charge the old compact material toughness so fast tiny cores behave as
    // they did before the editor-grade HP expansion.
    const materialHealth = getBlockMaterialRule(cell.block).health;
    const exitSpeed = input.speed -
      tunnelCellCount * PARTIAL_BLOCK_PIERCE_CELL_SPEED_COST * (materialHealth / 10);
    if (exitSpeed < PARTIAL_BLOCK_PIERCE_MIN_EXIT_SPEED) return undefined;

    const exitPosition = createPartialBlockPierceExitPosition(cell.position, cut.localPoint, trajectory, coreRadius);
    if (this.isSolid(exitPosition.x, exitPosition.y, exitPosition.z)) return undefined;

    return {
      position: exitPosition,
      velocity: {
        x: trajectory.x * exitSpeed,
        y: trajectory.y * exitSpeed,
        z: trajectory.z * exitSpeed
      },
      speed: exitSpeed
    };
  }

  private addPartialBlockSurface(
    block: number,
    position: VoxelBlockPosition,
    maxHealth: number,
    cuts: readonly PartialBlockCut[]
  ): void {
    const key = createPartialBlockKey(position);
    const existing = this.partialBlocks.get(key);
    const existingSurfaceSamples = existing?.surfaceSamples ?? [];
    const nextCuts = existing && existingSurfaceSamples.length > 0
      ? [...existing.cuts, ...cuts]
      : [...cuts];
    while (nextCuts.length > PARTIAL_BLOCK_MAX_CUTS_PER_CELL) {
      nextCuts.shift();
    }
    const surfaceSamples = trimPartialSurfaceSamples([
      ...existingSurfaceSamples,
      ...createPartialBlockSurfaceSamples(position, nextCuts)
    ]);

    this.setPartialBlockCell({
      block,
      position,
      cuts: nextCuts,
      surfaceSamples,
      damage: maxHealth,
      maxHealth
    }, { urgentVisual: !existing });
  }

  private addPartialBlockSurfacePatch(
    block: number,
    originPosition: VoxelBlockPosition,
    maxHealth: number,
    cuts: readonly PartialBlockCut[],
    impactNormal: PartialBlockPosition,
    impactPoint: Pick<THREE.Vector3, "x" | "z">
  ): void {
    for (let dz = -PARTIAL_BLOCK_SURFACE_PATCH_RADIUS_CELLS; dz <= PARTIAL_BLOCK_SURFACE_PATCH_RADIUS_CELLS; dz += 1) {
      for (let dx = -PARTIAL_BLOCK_SURFACE_PATCH_RADIUS_CELLS; dx <= PARTIAL_BLOCK_SURFACE_PATCH_RADIUS_CELLS; dx += 1) {
        const strength = this.getPartialSurfacePatchStrength(originPosition, dx, dz, impactNormal, impactPoint);
        if (strength < PARTIAL_BLOCK_SURFACE_PATCH_MIN_STRENGTH) continue;

        const patchPosition = this.resolvePartialSurfacePatchPosition(originPosition, dx, dz);
        if (!patchPosition) continue;

        this.addPartialBlockSurface(
          block,
          patchPosition,
          maxHealth,
          this.createPartialSurfacePatchCuts(originPosition, patchPosition, cuts, strength)
        );
      }
    }
  }

  private getPartialSurfacePatchStrength(
    originPosition: VoxelBlockPosition,
    dx: number,
    dz: number,
    impactNormal: PartialBlockPosition,
    impactPoint: Pick<THREE.Vector3, "x" | "z">
  ): number {
    if (dx === 0 && dz === 0) return 1;

    const offsetDistance = Math.hypot(dx, dz);
    const candidateCenterX = originPosition.x + dx + 0.5;
    const candidateCenterZ = originPosition.z + dz + 0.5;
    const impactDistance = Math.hypot(candidateCenterX - impactPoint.x, candidateCenterZ - impactPoint.z);
    const forwardDot = dx * impactNormal.x + dz * impactNormal.z;
    const forwardBias = forwardDot > 0
      ? PARTIAL_BLOCK_SURFACE_PATCH_FORWARD_BONUS
      : forwardDot < 0
        ? -PARTIAL_BLOCK_SURFACE_PATCH_BACK_PENALTY
        : 0;

    return 1 - offsetDistance * 0.38 - Math.max(0, impactDistance - 0.75) * 0.16 + forwardBias;
  }

  private resolvePartialSurfacePatchPosition(
    originPosition: VoxelBlockPosition,
    dx: number,
    dz: number
  ): VoxelBlockPosition | null {
    const sameLevel = {
      x: originPosition.x + dx,
      y: originPosition.y,
      z: originPosition.z + dz
    };
    if (dx === 0 && dz === 0) return sameLevel;
    if (this.getBlock(sameLevel.x, sameLevel.y, sameLevel.z) === BLOCK.air) {
      return this.hasPartialSurfaceBase(sameLevel) ? sameLevel : null;
    }

    const aboveSolid = {
      x: sameLevel.x,
      y: sameLevel.y + 1,
      z: sameLevel.z
    };
    if (aboveSolid.y >= WORLD_HEIGHT) return null;
    return this.getBlock(aboveSolid.x, aboveSolid.y, aboveSolid.z) === BLOCK.air ? aboveSolid : null;
  }

  private hasPartialSurfaceBase(position: VoxelBlockPosition): boolean {
    if (position.y <= 0) return true;
    if (this.isSolid(position.x, position.y - 1, position.z)) return true;
    return Boolean(this.partialBlocks.get(createPartialBlockKey({
      x: position.x,
      y: position.y - 1,
      z: position.z
    }))?.surfaceSamples?.length);
  }

  private createPartialSurfacePatchCuts(
    originPosition: VoxelBlockPosition,
    patchPosition: VoxelBlockPosition,
    cuts: readonly PartialBlockCut[],
    strength: number
  ): PartialBlockCut[] {
    return cuts.map((cut, index) => ({
      ...cut,
      localPoint: {
        x: clamp01ForWorld(originPosition.x + cut.localPoint.x - patchPosition.x),
        y: cut.localPoint.y,
        z: clamp01ForWorld(originPosition.z + cut.localPoint.z - patchPosition.z)
      },
      radius: cut.radius * (0.72 + strength * 0.28),
      depth: cut.depth * strength,
      seed: (cut.seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(patchPosition.x + 31, 0x85ebca77) ^ Math.imul(patchPosition.z + 17, 0xc2b2ae3d)) >>> 0
    }));
  }

  private removePartialBlock(position: VoxelBlockPosition, { persist = true }: {
    readonly persist?: boolean;
  } = {}): void {
    const key = createPartialBlockKey(position);
    const existing = this.partialBlocks.get(key);
    if (!existing) return;

    this.partialBlocks.delete(key);
    this.removePartialBlockFromIndexes(key, existing);
    this.markPartialBlockVisualDirty(position, true);
    this.markPartialBlockMaskDirty(position);
    if (persist) this.rememberPartialBlockChunkModified(position);
  }

  private setPartialBlockCell(cell: PartialBlockCell, { urgentVisual = false, persist = true }: {
    readonly urgentVisual?: boolean;
    readonly persist?: boolean;
  } = {}): void {
    const key = createPartialBlockKey(cell.position);
    const existing = this.partialBlocks.get(key);

    this.partialBlocks.set(key, cell);
    if (existing) {
      // A repeated bite changes only the custom partial mesh; the normal chunk
      // mesh already knows this macro voxel is represented by partial geometry.
      this.updatePartialBlockIndexes(key, cell);
      this.markPartialBlockVisualDirty(cell.position, urgentVisual);
      if (persist) this.rememberPartialBlockChunkModified(cell.position);
      return;
    }

    this.addPartialBlockToIndexes(key, cell);
    this.markPartialBlockVisualDirty(cell.position, true);
    this.markPartialBlockMaskDirty(cell.position);
    if (persist) this.rememberPartialBlockChunkModified(cell.position);
  }

  private clearPartialBlockState(): void {
    if (this.partialBlocks.size === 0 && this.dirtyPartialBlockRegionKeys.size === 0) {
      this.partialBlockMaskCache.clear();
      return;
    }

    this.partialBlocks.clear();
    this.partialBlocksByChunk.clear();
    this.partialBlocksByRegion.clear();
    this.partialBlockMaskCache.clear();
    this.dirtyPartialBlockRegionKeys.clear();
    this.urgentPartialBlockRegionKeys.clear();
    this.partialBlockRegionRevisions.clear();
    this.partialBlockGeometryRevision += 1;
  }

  private addPartialBlockToIndexes(key: string, cell: PartialBlockCell): void {
    getOrCreateMapBucket(this.partialBlocksByChunk, this.getPartialBlockChunkKey(cell.position)).set(key, cell);
    getOrCreateMapBucket(this.partialBlocksByRegion, createPartialBlockMeshRegionKey(cell.position)).set(key, cell);
  }

  private updatePartialBlockIndexes(key: string, cell: PartialBlockCell): void {
    getOrCreateMapBucket(this.partialBlocksByChunk, this.getPartialBlockChunkKey(cell.position)).set(key, cell);
    getOrCreateMapBucket(this.partialBlocksByRegion, createPartialBlockMeshRegionKey(cell.position)).set(key, cell);
  }

  private removePartialBlockFromIndexes(key: string, cell: PartialBlockCell): void {
    removeFromMapBucket(this.partialBlocksByChunk, this.getPartialBlockChunkKey(cell.position), key);
    removeFromMapBucket(this.partialBlocksByRegion, createPartialBlockMeshRegionKey(cell.position), key);
  }

  private markPartialBlockVisualDirty(position: VoxelBlockPosition, urgent: boolean): void {
    // The region halo is deliberately wider than the owned cell. Boundary faces
    // and stitched partial-height surfaces both need adjacent regions to refresh
    // when a neighboring damaged cell appears, changes, or disappears.
    this.markPartialBlockMeshRegionKeysDirty(getPartialBlockMeshDirtyRegionKeys(position), urgent);
  }

  private markPartialBlockMeshRegionKeysDirty(regionKeys: Iterable<string>, urgent: boolean): void {
    const keys = [...new Set(regionKeys)];
    if (keys.length === 0) return;

    const nextRevision = this.partialBlockGeometryRevision + 1;
    for (const key of keys) {
      this.dirtyPartialBlockRegionKeys.add(key);
      this.partialBlockRegionRevisions.set(key, nextRevision);
      if (urgent) this.urgentPartialBlockRegionKeys.add(key);
    }
    this.partialBlockGeometryRevision = nextRevision;
  }

  private markPartialBlockMaskDirty(position: VoxelBlockPosition): void {
    const { cx, cz, lx, lz } = this.toChunkCoords(position.x, position.z);
    const chunk = this.getChunk(cx, cz);
    this.partialBlockMaskCache.delete(this.key(cx, cz));
    this.markBlockLightChunksDirtyForEdit(position.x, position.z);
    if (chunk) {
      chunk.revision += 1;
      this.markChunkDirty(chunk);
    }
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private getPartialBlockChunkKey(position: PartialBlockPosition): string {
    const { cx, cz } = this.toChunkCoords(position.x, position.z);
    return this.key(cx, cz);
  }

  private hydrateSavedPartialBlocksForChunk(
    key: string,
    savedCells: readonly SavedPartialBlockCell[]
  ): void {
    if (savedCells.length === 0) return;

    for (const savedCell of savedCells) {
      const cell = this.createRuntimePartialBlockCellFromSaved(key, savedCell);
      if (!cell) continue;

      const damageKey = this.damageKey(cell.position.x, cell.position.y, cell.position.z);
      if (isPartialBlockSurfaceCell(cell)) {
        this.blockDamage.delete(damageKey);
      } else {
        this.blockDamage.set(damageKey, cell.damage);
      }
      this.setPartialBlockCell(cell, { urgentVisual: true, persist: false });
    }
  }

  private createRuntimePartialBlockCellFromSaved(
    expectedChunkKey: string,
    savedCell: SavedPartialBlockCell
  ): PartialBlockCell | null {
    const position = {
      x: Math.floor(savedCell.position.x),
      y: Math.floor(savedCell.position.y),
      z: Math.floor(savedCell.position.z)
    };
    if (position.y < 0 || position.y >= WORLD_HEIGHT) return null;
    if (this.getPartialBlockChunkKey(position) !== expectedChunkKey) return null;

    const savedBlock = Math.floor(savedCell.block);
    const savedDefinition = BLOCKS[savedBlock] ?? BLOCKS[BLOCK.air];
    if (!savedDefinition.solid) return null;

    // Bite cells replace an existing solid block. Surface patches are the one
    // exception: they can intentionally live in an air macro-cell as a thin
    // saved support skin, so do not reject them just because the block byte is air.
    const isSurfaceCell = savedCell.surfaceSamples !== undefined && savedCell.surfaceSamples.length > 0;
    const currentBlock = this.getBlock(position.x, position.y, position.z);
    const currentDefinition = BLOCKS[currentBlock] ?? BLOCKS[BLOCK.air];
    if (!isSurfaceCell && !currentDefinition.solid) return null;

    const maxHealth = Math.max(1, savedCell.maxHealth);
    const damage = Math.max(0, Math.min(savedCell.damage, maxHealth));
    const removedVisualCellIndexes = savedCell.removedVisualCellIndexes
      ? [...savedCell.removedVisualCellIndexes]
      : undefined;
    if (!isSurfaceCell && damage <= 0 && (!removedVisualCellIndexes || removedVisualCellIndexes.length === 0)) {
      return null;
    }

    return {
      block: isSurfaceCell ? savedBlock : currentBlock,
      position,
      cuts: savedCell.cuts.map((cut) => ({
        normal: { ...cut.normal },
        localPoint: { ...cut.localPoint },
        ...(cut.trajectory ? { trajectory: { ...cut.trajectory } } : {}),
        ...(typeof cut.coreRadius === "number" ? { coreRadius: cut.coreRadius } : {}),
        ...(cut.exactRemovedVisualCellIndexes
          ? { exactRemovedVisualCellIndexes: [...cut.exactRemovedVisualCellIndexes] }
          : {}),
        radius: cut.radius,
        depth: cut.depth,
        seed: cut.seed
      })),
      ...(removedVisualCellIndexes ? { removedVisualCellIndexes } : {}),
      ...(savedCell.surfaceSamples ? {
        surfaceSamples: savedCell.surfaceSamples.map((sample) => ({ ...sample }))
      } : {}),
      damage,
      maxHealth
    };
  }

  private rememberPartialBlockChunkModified(position: PartialBlockPosition): void {
    const { cx, cz } = this.toChunkCoords(position.x, position.z);
    const key = this.key(cx, cz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    chunk.modified = true;
    this.modifiedChunkKeys.add(key);
    this.rememberModifiedChunk(key, chunk.blocks);
  }

  private createSavedChunkSnapshot(key: string, blocks: Uint8Array): SavedChunkSnapshot {
    return {
      blocks: blocks.slice(),
      partialBlocks: sortPartialBlockCells([
        ...(this.partialBlocksByChunk.get(key)?.values() ?? [])
      ]).map((cell) => this.createSavedPartialBlockCell(cell))
    };
  }

  private createSavedPartialBlockCell(cell: PartialBlockCell): SavedPartialBlockCell {
    return {
      block: cell.block,
      position: { ...cell.position },
      cuts: cell.cuts.map((cut) => ({
        normal: { ...cut.normal },
        localPoint: { ...cut.localPoint },
        ...(cut.trajectory ? { trajectory: { ...cut.trajectory } } : {}),
        ...(typeof cut.coreRadius === "number" ? { coreRadius: cut.coreRadius } : {}),
        ...(cut.exactRemovedVisualCellIndexes
          ? { exactRemovedVisualCellIndexes: [...cut.exactRemovedVisualCellIndexes] }
          : {}),
        radius: cut.radius,
        depth: cut.depth,
        seed: cut.seed
      })),
      ...(cell.removedVisualCellIndexes ? {
        removedVisualCellIndexes: [...cell.removedVisualCellIndexes]
      } : {}),
      ...(cell.surfaceSamples ? {
        surfaceSamples: cell.surfaceSamples.map((sample) => ({ ...sample }))
      } : {}),
      damage: cell.damage,
      maxHealth: cell.maxHealth
    };
  }

  private createPartialBlockMeshRegionUpdate(key: string, urgent = false): PartialBlockMeshRegionUpdate {
    const coords = parsePartialBlockMeshRegionKey(key);
    const cells = sortPartialBlockCells([...(this.partialBlocksByRegion.get(key)?.values() ?? [])]);
    const revision = this.partialBlockRegionRevisions.get(key) ?? this.partialBlockGeometryRevision;
    if (!coords) return { key, revision, urgent, cells, contextCells: cells };

    const contextCells: PartialBlockCell[] = [];
    for (let rx = coords.rx - 1; rx <= coords.rx + 1; rx += 1) {
      for (let ry = coords.ry - 1; ry <= coords.ry + 1; ry += 1) {
        for (let rz = coords.rz - 1; rz <= coords.rz + 1; rz += 1) {
          const regionKey = createPartialBlockMeshRegionKeyFromCoords({ rx, ry, rz });
          for (const cell of this.partialBlocksByRegion.get(regionKey)?.values() ?? []) {
            if (isPartialBlockInsideRegionHalo(cell, coords)) contextCells.push(cell);
          }
        }
      }
    }

    return { key, revision, urgent, cells, contextCells: sortPartialBlockCells(contextCells) };
  }

  isPartialBlockMeshRegionRevisionStale(key: string, revision: number): boolean {
    return (this.partialBlockRegionRevisions.get(key) ?? -1) !== revision;
  }

  private getPartialBlockRegionDistanceSq(key: string, origin: Pick<THREE.Vector3, "x" | "y" | "z">): number {
    const coords = parsePartialBlockMeshRegionKey(key);
    if (!coords) return 0;

    const centerX = coords.rx * PARTIAL_BLOCK_MESH_REGION_SIZE_XZ + PARTIAL_BLOCK_MESH_REGION_SIZE_XZ / 2;
    const centerY = coords.ry * PARTIAL_BLOCK_MESH_REGION_SIZE_Y + PARTIAL_BLOCK_MESH_REGION_SIZE_Y / 2;
    const centerZ = coords.rz * PARTIAL_BLOCK_MESH_REGION_SIZE_XZ + PARTIAL_BLOCK_MESH_REGION_SIZE_XZ / 2;
    const dx = centerX - origin.x;
    const dy = centerY - origin.y;
    const dz = centerZ - origin.z;
    return dx * dx + dy * dy + dz * dz;
  }

  markDirty(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    // Neighbor loads and edge edits can invalidate a mesh even when this chunk's
    // blocks did not change, so bump the revision to reject stale worker results.
    this.markChunkDirty(chunk);
    chunk.revision += 1;
  }

  markNeighborChunksDirty(cx: number, cz: number): void {
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
  }

  private markCardinalNeighborMeshesDirty(cx: number, cz: number): void {
    this.markChunkMeshDirtyForLightBuffer(cx - 1, cz);
    this.markChunkMeshDirtyForLightBuffer(cx + 1, cz);
    this.markChunkMeshDirtyForLightBuffer(cx, cz - 1);
    this.markChunkMeshDirtyForLightBuffer(cx, cz + 1);
  }

  private markPartialBlockMeshesDirtyForLightBuffer(cx: number, cz: number): void {
    const regionKeys = new Set<string>();
    for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const bucket = this.partialBlocksByChunk.get(this.key(cx + dx, cz + dz));
      if (!bucket) continue;
      for (const cell of bucket.values()) {
        for (const regionKey of getPartialBlockMeshDirtyRegionKeys(cell.position)) {
          regionKeys.add(regionKey);
        }
      }
    }
    this.markPartialBlockMeshRegionKeysDirty(regionKeys, false);
  }

  private markChunkMeshDirtyForLightBuffer(cx: number, cz: number): void {
    const key = this.key(cx, cz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;

    this.cancelPendingMeshBuildForKey(key);
    this.markChunkDirty(chunk);
  }

  private markBlockLightChunksDirtyForEdit(worldX: number, worldZ: number): void {
    for (const coord of getDirtyBlockLightChunkCoordsForEdit(worldX, worldZ)) {
      this.markBlockLightChunkDirty(coord.cx, coord.cz);
    }
  }

  private markBlockLightChunkAndNeighborsDirty(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        this.markBlockLightChunkDirty(cx + dx, cz + dz);
      }
    }
  }

  private markBlockLightChunkDirty(cx: number, cz: number, {
    bumpRevision = true
  }: {
    readonly bumpRevision?: boolean;
  } = {}): void {
    const key = this.key(cx, cz);
    this.blockLightCache.delete(key);
    this.cancelPendingBlockLightBuildForKey(key);

    const chunk = this.getChunk(cx, cz);
    if (!chunk) {
      this.dirtyBlockLightChunkKeys.delete(key);
      return;
    }

    // A light-only change still invalidates any in-flight mesh result because
    // the mesh result carries the per-vertex blockLight attribute.
    if (bumpRevision) chunk.revision += 1;
    this.markChunkDirty(chunk);
    if (!this.workerPool) return;

    this.dirtyBlockLightChunkKeys.add(key);
  }

  private cancelPendingBlockLightBuildForKey(key: string): void {
    if (!this.pendingBlockLightKeys.has(key)) return;

    for (const [requestId, pending] of this.pendingBlockLightBuilds) {
      if (pending.key !== key) continue;
      this.workerPool?.cancel(pending.jobId);
      this.pendingBlockLightBuilds.delete(requestId);
    }
    this.pendingBlockLightKeys.delete(key);
  }

  private cancelPendingMeshBuildForKey(key: string): void {
    if (!this.pendingMeshKeys.has(key)) return;

    for (const [requestId, pending] of this.pendingMeshBuilds) {
      if (pending.key !== key) continue;
      this.workerPool?.cancel(pending.jobId);
      this.pendingMeshBuilds.delete(requestId);
    }
    this.pendingMeshKeys.delete(key);
  }

  rememberModifiedChunk(key: string, blocks: Uint8Array): void {
    // Copy before saving so later in-memory edits cannot mutate the stored snapshot by reference.
    // The actual IndexedDB write is debounced/coalesced per chunk; rapid destruction can touch
    // the same chunk dozens of times in a second, and writing every intermediate snapshot is
    // wasted main-thread pressure. Partial cells ride with the chunk snapshot so full cubes do
    // not resurrect over Terraformer/core cuts after reload.
    const snapshot = this.createSavedChunkSnapshot(key, blocks);
    this.savedChunkKeys.add(key);
    this.savedChunks.set(key, snapshot);
    this.pendingSavedChunkWrites.set(key, snapshot);
    this.schedulePendingChunkSaveFlush();
  }

  forgetSavedChunk(key: string): void {
    // Dropping a saved chunk lets terrain generation own that coordinate again.
    this.savedChunkKeys.delete(key);
    this.savedChunks.delete(key);
    this.pendingSavedChunkWrites.delete(key);
    this.invalidateChunkQueueWindow();
    this.queueChunkStorageOperation(key, () => this.storage.deleteChunk(key));
  }

  async loadSavedChunkNow(key: string): Promise<SavedChunkSnapshot | null> {
    const cachedSnapshot = this.savedChunks.get(key);
    if (cachedSnapshot) return cachedSnapshot;

    const snapshot = await this.storage.loadChunkSnapshot(key);
    if (!snapshot) {
      this.forgetSavedChunk(key);
      return null;
    }

    this.savedChunks.set(key, snapshot);
    return snapshot;
  }

  schedulePendingChunkSaveFlush(): void {
    if (this.storageFlushTimer !== null) return;

    this.storageFlushTimer = setTimeout(() => {
      this.storageFlushTimer = null;
      this.flushPendingChunkSaves();
    }, STORAGE_SAVE_DEBOUNCE_MS);
  }

  flushPendingChunkSaves(): void {
    if (this.storageFlushTimer !== null) {
      clearTimeout(this.storageFlushTimer);
      this.storageFlushTimer = null;
    }
    if (this.pendingSavedChunkWrites.size === 0) return;

    const pendingWrites = Array.from(this.pendingSavedChunkWrites.entries());
    this.pendingSavedChunkWrites.clear();

    for (const [key, snapshot] of pendingWrites) {
      this.queueChunkStorageOperation(key, () => this.storage.saveChunkSnapshot(key, snapshot));
    }
  }

  queueChunkStorageOperation(
    key: string,
    operationFactory: () => Promise<unknown>
  ): Promise<void> {
    const previousOperation = this.chunkStorageChains.get(key) ?? Promise.resolve();
    const trackedOperation = previousOperation
      .catch((error) => {
        console.warn("Save storage operation failed", error);
      })
      .then(operationFactory)
      .catch((error) => {
        console.warn("Save storage operation failed", error);
      })
      .then(() => undefined);

    this.chunkStorageChains.set(key, trackedOperation);
    this.storageOperations.add(trackedOperation);
    void trackedOperation.finally(() => {
      this.storageOperations.delete(trackedOperation);
      if (this.chunkStorageChains.get(key) === trackedOperation) {
        this.chunkStorageChains.delete(key);
      }
    });
    return trackedOperation;
  }

  async flushStorageWrites(): Promise<void> {
    this.flushPendingChunkSaves();

    // Saving can chain per chunk to preserve write order. Loop until both the immediate
    // operations and edits queued while we were waiting have drained.
    while (this.storageOperations.size > 0 || this.pendingSavedChunkWrites.size > 0) {
      this.flushPendingChunkSaves();
      await Promise.allSettled(Array.from(this.storageOperations));
    }
  }

  unloadChunksOutside(
    centerCx: number,
    centerCz: number,
    unloadRadius: number,
    scene: THREE.Scene
  ): void {
    const normalizedRadius = normalizeChunkRadius(unloadRadius);
    if (this.chunkUnloadWindowMatches(centerCx, centerCz, normalizedRadius)) {
      this.unloadWindowSkips += 1;
      this.lastUnloadCandidateChecks = 0;
      return;
    }

    const chunkEntries = Array.from(this.chunks.entries());
    this.unloadWindowRefreshes += 1;
    this.lastUnloadCandidateChecks = chunkEntries.length;

    for (const [key, chunk] of chunkEntries) {
      if (isChunkOffsetInsideRadius(chunk.cx - centerCx, chunk.cz - centerCz, normalizedRadius)) continue;

      if (chunk.modified) {
        this.rememberModifiedChunk(key, chunk.blocks);
      } else {
        this.forgetSavedChunk(key);
      }

      chunk.disposeMesh(scene);
      this.chunks.delete(key);
      this.fogHiddenChunkKeys.delete(key);
      this.removeChunkLocalLights(key);
      this.chunkLoadQueue.delete(key);
      this.dirtyChunkKeys.delete(key);
      this.modifiedChunkKeys.delete(key);
      this.cancelPendingMeshBuildForKey(key);
      this.blockLightCache.delete(key);
      this.dirtyBlockLightChunkKeys.delete(key);
      this.cancelPendingBlockLightBuildForKey(key);
      this.clearDamageForChunk(chunk.cx, chunk.cz);
      this.markNeighborChunksDirty(chunk.cx, chunk.cz);
      this.markBlockLightChunkAndNeighborsDirty(chunk.cx, chunk.cz);
    }

    this.chunkUnloadWindow = {
      centerCx,
      centerCz,
      radius: normalizedRadius
    };
  }

  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    const block = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return block !== BLOCK.air;
  }

  raycastTerraformerTarget(
    origin: Pick<THREE.Vector3, "x" | "y" | "z">,
    direction: Pick<THREE.Vector3, "x" | "y" | "z">,
    maxDistance: number
  ): TerraformerTerrainRaycastHit | null {
    const normalizedDirection = normalizeVoxelVector(direction);
    const reach = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 0;
    if (!normalizedDirection || reach <= 0) return null;

    let x = getRayStartingVoxel(origin.x, normalizedDirection.x);
    let y = getRayStartingVoxel(origin.y, normalizedDirection.y);
    let z = getRayStartingVoxel(origin.z, normalizedDirection.z);

    const stepX = normalizedDirection.x > 0 ? 1 : -1;
    const stepY = normalizedDirection.y > 0 ? 1 : -1;
    const stepZ = normalizedDirection.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (normalizedDirection.x || 0.000001));
    const tDeltaY = Math.abs(1 / (normalizedDirection.y || 0.000001));
    const tDeltaZ = Math.abs(1 / (normalizedDirection.z || 0.000001));

    let tMaxX = getRayIntBound(origin.x, normalizedDirection.x);
    let tMaxY = getRayIntBound(origin.y, normalizedDirection.y);
    let tMaxZ = getRayIntBound(origin.z, normalizedDirection.z);
    let face: VoxelBlockPosition = { x: 0, y: 0, z: 0 };

    for (let distance = 0; distance <= reach;) {
      if (y >= 0 && this.isSolid(x, y, z)) {
        const position = { x, y, z };
        const partialHit = this.raycastTerraformerPartialBlockTarget(
          position,
          origin,
          normalizedDirection,
          reach
        );
        if (partialHit) return partialHit;

        if (!this.getPartialBlock(x, y, z)) {
          return {
            block: position,
            normal: face,
            point: createRayPoint(origin, normalizedDirection, distance),
            distance
          };
        }
      }

      const nextDistance = Math.min(tMaxX, tMaxY, tMaxZ);
      if (!Number.isFinite(nextDistance) || nextDistance > reach) break;

      const crossesX = tMaxX === nextDistance;
      const crossesY = tMaxY === nextDistance;
      const crossesZ = tMaxZ === nextDistance;
      face = chooseRayEntryFace(crossesX, crossesY, crossesZ, normalizedDirection, stepX, stepY, stepZ);

      // Advance every crossed axis together so exact edge/corner rays do not
      // briefly test a side-neighbor that the reticle merely grazed.
      if (crossesX) {
        x += stepX;
        tMaxX += tDeltaX;
      }
      if (crossesY) {
        y += stepY;
        tMaxY += tDeltaY;
      }
      if (crossesZ) {
        z += stepZ;
        tMaxZ += tDeltaZ;
      }

      distance = nextDistance;
    }

    return null;
  }

  getProjectileBlockSweepHit(
    x: number,
    y: number,
    z: number,
    start: CollisionVector,
    movement: CollisionVector,
    radius: number
  ): ProjectileBlockSweepHit | null {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const cell = this.getPartialBlock(blockX, blockY, blockZ);
    if (!cell) {
      return getProjectileSweepHitAgainstAabb(
        start,
        movement,
        blockX - safeRadius,
        blockX + 1 + safeRadius,
        blockY - safeRadius,
        blockY + 1 + safeRadius,
        blockZ - safeRadius,
        blockZ + 1 + safeRadius,
        false
      );
    }

    const removedCells = new Set(
      cell.removedVisualCellIndexes ?? createPartialBlockRemovedVisualCellIndexes(cell)
    );
    const cellSize = 1 / BLOCK_FRAGMENT_GRID_SIZE;
    let bestHit: ProjectileBlockSweepHit | null = null;

    for (let index = 0; index < BLOCK_FRAGMENT_GRID_SIZE ** 3; index += 1) {
      if (removedCells.has(index)) continue;
      const visualCell = decodePartialBlockVisualCell(index);
      const minX = blockX + visualCell.x * cellSize - safeRadius;
      const maxX = blockX + (visualCell.x + 1) * cellSize + safeRadius;
      const minY = blockY + visualCell.y * cellSize - safeRadius;
      const maxY = blockY + (visualCell.y + 1) * cellSize + safeRadius;
      const minZ = blockZ + visualCell.z * cellSize - safeRadius;
      const maxZ = blockZ + (visualCell.z + 1) * cellSize + safeRadius;
      const hit = getProjectileSweepHitAgainstAabb(
        start,
        movement,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        true
      );
      if (!hit || (bestHit && hit.t >= bestHit.t)) continue;
      bestHit = hit;
    }

    return bestHit;
  }

  private raycastTerraformerPartialBlockTarget(
    position: VoxelBlockPosition,
    origin: Pick<THREE.Vector3, "x" | "y" | "z">,
    direction: VoxelVector,
    maxDistance: number
  ): TerraformerTerrainRaycastHit | null {
    const cell = this.getPartialBlock(position.x, position.y, position.z);
    if (!cell) return null;

    const removedCells = new Set(
      cell.removedVisualCellIndexes ?? createPartialBlockRemovedVisualCellIndexes(cell)
    );
    const movement = {
      x: direction.x * maxDistance,
      y: direction.y * maxDistance,
      z: direction.z * maxDistance
    };
    const cellSize = 1 / BLOCK_FRAGMENT_GRID_SIZE;
    let bestHit: TerraformerTerrainRaycastHit | null = null;

    for (let index = 0; index < BLOCK_FRAGMENT_GRID_SIZE ** 3; index += 1) {
      if (removedCells.has(index)) continue;

      const visualCell = decodePartialBlockVisualCell(index);
      const minX = position.x + visualCell.x * cellSize;
      const maxX = position.x + (visualCell.x + 1) * cellSize;
      const minY = position.y + visualCell.y * cellSize;
      const maxY = position.y + (visualCell.y + 1) * cellSize;
      const minZ = position.z + visualCell.z * cellSize;
      const maxZ = position.z + (visualCell.z + 1) * cellSize;
      const hit = getProjectileSweepHitAgainstAabb(
        origin,
        movement,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        true
      );
      if (!hit) continue;

      const distance = hit.t * maxDistance;
      if (bestHit && distance >= bestHit.distance) continue;

      bestHit = {
        block: position,
        normal: {
          x: Math.round(hit.normal.x),
          y: Math.round(hit.normal.y),
          z: Math.round(hit.normal.z)
        },
        point: createRayPoint(origin, direction, distance),
        distance
      };
    }

    return bestHit;
  }

  canProjectileHitBlock(
    x: number,
    y: number,
    z: number,
    start: CollisionVector,
    movement: CollisionVector,
    radius: number
  ): boolean {
    if (!this.getPartialBlock(Math.floor(x), Math.floor(y), Math.floor(z))) return true;
    return this.getProjectileBlockSweepHit(x, y, z, start, movement, radius) !== null;
  }

  rebuildDirty(
    scene: THREE.Scene,
    material: THREE.Material,
    maxRebuilds = MAX_CHUNK_REBUILDS_PER_FRAME
  ): number {
    if (this.workerPool) {
      this.processBlockLightResults(maxRebuilds);
      this.processMeshResults(scene, material, maxRebuilds);
      this.lastRequestedMeshes = this.requestDirtyMeshBuilds(maxRebuilds);
      return this.lastMeshedChunks;
    }

    this.lastRequestedMeshes = 0;
    this.lastMeshedChunks = 0;
    let rebuilt = 0;
    const dirtyChunks = this.pickNearestDirtyChunks(maxRebuilds);
    for (const chunk of dirtyChunks) {
      const mesh = chunk.rebuildMesh(this, material);
      this.markChunkClean(chunk);
      if (!mesh.parent) scene.add(mesh);
      rebuilt += 1;
      if (rebuilt >= maxRebuilds) break;
    }
    this.lastMeshedChunks = rebuilt;
    return rebuilt;
  }

  processBlockLightResults(maxResults = MAX_CHUNK_REBUILDS_PER_FRAME): void {
    if (this.workerResults.length === 0) return;

    const selectedResults = this.pickWorkerResultIndexes(BLOCK_LIGHT_BUILT_RESULT, maxResults);
    const remaining: VoxelWorldWorkerResult[] = [];
    for (let index = 0; index < this.workerResults.length; index += 1) {
      const result = this.workerResults[index];
      if (result.type !== BLOCK_LIGHT_BUILT_RESULT) {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingBlockLightBuilds.get(result.requestId);
      if (!pending) continue;

      const chunk = this.getChunk(result.cx, result.cz);
      if (!chunk || chunk.revision !== result.revision) {
        this.pendingBlockLightBuilds.delete(result.requestId);
        this.pendingBlockLightKeys.delete(pending.key);
        if (chunk) this.markBlockLightChunkDirty(chunk.cx, chunk.cz, { bumpRevision: false });
        continue;
      }

      if (!selectedResults.has(index)) {
        remaining.push(result);
        continue;
      }

      this.pendingBlockLightBuilds.delete(result.requestId);
      this.pendingBlockLightKeys.delete(pending.key);
      this.dirtyBlockLightChunkKeys.delete(pending.key);
      this.blockLightCache.set(pending.key, {
        revision: result.revision,
        blockLight: result.blockLight
      });

      // Current chunk meshes use their own light buffer; cardinal neighbors can
      // also sample this buffer for border faces, so both sides need a remesh.
      // This is mesh-only dirtiness: the light cache itself is current and must
      // not be invalidated just because a neighboring mesh needs this buffer.
      this.markChunkMeshDirtyForLightBuffer(result.cx, result.cz);
      this.markCardinalNeighborMeshesDirty(result.cx, result.cz);
      this.markPartialBlockMeshesDirtyForLightBuffer(result.cx, result.cz);
    }

    this.workerResults = remaining;
  }

  processMeshResults(
    scene: THREE.Scene,
    material: THREE.Material,
    maxResults = MAX_CHUNK_REBUILDS_PER_FRAME
  ): void {
    this.lastMeshedChunks = 0;
    if (this.workerResults.length === 0) return;

    const selectedResults = this.pickWorkerResultIndexes("meshed", maxResults);
    const remaining: VoxelWorldWorkerResult[] = [];
    for (let index = 0; index < this.workerResults.length; index += 1) {
      const result = this.workerResults[index];
      if (result.type !== "meshed") {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingMeshBuilds.get(result.requestId);
      if (!pending) continue;

      const chunk = this.getChunk(result.cx, result.cz);
      if (!chunk || chunk.revision !== result.revision) {
        this.pendingMeshBuilds.delete(result.requestId);
        this.pendingMeshKeys.delete(pending.key);
        if (chunk) this.markChunkDirty(chunk);
        continue;
      }

      if (!selectedResults.has(index)) {
        remaining.push(result);
        continue;
      }

      this.pendingMeshBuilds.delete(result.requestId);
      this.pendingMeshKeys.delete(pending.key);

      const uploadStartedAt = performance.now();
      const mesh = chunk.applyMeshData(
        {
          positions: result.positions,
          normals: result.normals,
          colors: result.colors,
          blockLights: result.blockLights,
          uvs: result.uvs,
          textureTiles: result.textureTiles,
          indices: result.indices
        },
        material
      );
      this.workerPool?.recordMainThreadUpload(performance.now() - uploadStartedAt, CHUNK_MESH_JOB);
      this.markChunkClean(chunk);
      if (!mesh.parent) scene.add(mesh);
      this.lastMeshedChunks += 1;
    }

    this.workerResults = remaining;
  }

  pickWorkerResultIndexes(
    type: VoxelWorldWorkerResult["type"],
    limit: number
  ): Set<number> {
    const candidates: Array<PriorityEntry<{ readonly cx: number; readonly cz: number; readonly index: number }>> = [];

    for (let index = 0; index < this.workerResults.length; index += 1) {
      const result = this.workerResults[index];
      if (result.type !== type) continue;
      if (result.type === "generated" && !this.pendingChunkLoads.has(result.requestId)) continue;
      if (result.type === BLOCK_LIGHT_BUILT_RESULT) {
        const chunk = this.getChunk(result.cx, result.cz);
        if (
          !this.pendingBlockLightBuilds.has(result.requestId) ||
          !chunk ||
          chunk.revision !== result.revision
        ) {
          continue;
        }
      }
      if (result.type === "meshed") {
        const chunk = this.getChunk(result.cx, result.cz);
        if (!this.pendingMeshBuilds.has(result.requestId) || !chunk || chunk.revision !== result.revision) {
          continue;
        }
      }

      this.insertNearest(
        candidates,
        { cx: result.cx, cz: result.cz, index },
        this.priorityCx,
        this.priorityCz,
        limit
      );
    }

    return new Set(candidates.map((entry) => entry.item.index));
  }

  pickSavedChunkResultIndexes(limit: number): Set<number> {
    const candidates: Array<PriorityEntry<{ readonly cx: number; readonly cz: number; readonly index: number }>> = [];

    for (let index = 0; index < this.savedChunkResults.length; index += 1) {
      const result = this.savedChunkResults[index];
      const pending = this.pendingSavedChunkLoads.get(result.key);
      if (!pending || pending.generation !== result.generation) continue;
      this.insertNearest(
        candidates,
        { cx: result.cx, cz: result.cz, index },
        this.priorityCx,
        this.priorityCz,
        limit
      );
    }

    return new Set(candidates.map((entry) => entry.item.index));
  }

  requestDirtyMeshBuilds(maxBuilds = MAX_CHUNK_REBUILDS_PER_FRAME): number {
    if (maxBuilds <= 0) return 0;

    const buildSlots = this.availableMeshBuildSlots(maxBuilds);
    if (buildSlots <= 0) return 0;

    const dirtyChunks = this.pickNearestDirtyChunks(buildSlots);

    let requested = 0;
    let blockLightSlots = this.availableBlockLightBuildSlots(maxBuilds);
    for (const chunk of dirtyChunks) {
      const key = this.key(chunk.cx, chunk.cz);
      if (!this.hasUsableBlockLightCache(key, chunk)) {
        if (blockLightSlots > 0 && this.requestBlockLightBuild(chunk, key)) {
          blockLightSlots -= 1;
        }
        continue;
      }

      this.requestMeshBuild(chunk, key);
      requested += 1;
      if (requested >= buildSlots) break;
    }

    return requested;
  }

  availableMeshBuildSlots(maxBuilds: number): number {
    const meshPipelineLimit = Math.max(maxBuilds, maxBuilds * MAX_PENDING_MESH_MULTIPLIER);
    return Math.max(0, Math.min(maxBuilds, meshPipelineLimit - this.pendingMeshBuilds.size));
  }

  availableBlockLightBuildSlots(maxBuilds: number): number {
    const lightPipelineLimit = Math.max(maxBuilds, maxBuilds * MAX_PENDING_MESH_MULTIPLIER);
    return Math.max(0, Math.min(maxBuilds, lightPipelineLimit - this.pendingBlockLightBuilds.size));
  }

  private hasUsableBlockLightCache(key: string, chunk: Chunk): boolean {
    const cached = this.blockLightCache.get(key);
    return Boolean(
      cached &&
      cached.revision === chunk.revision &&
      !this.dirtyBlockLightChunkKeys.has(key)
    );
  }

  pickNearestDirtyChunks(limit: number): Chunk[] {
    const nearest: PriorityEntry<Chunk>[] = [];

    // Mesh budgets are tiny compared with loaded chunks, so keep the search on
    // chunks known to be dirty instead of sweeping every loaded chunk each frame.
    for (const key of this.dirtyChunkKeys) {
      const chunk = this.chunks.get(key);
      if (!chunk || !chunk.dirty) {
        this.dirtyChunkKeys.delete(key);
        continue;
      }
      if (this.pendingMeshKeys.has(key) || this.pendingBlockLightKeys.has(key)) continue;
      this.insertNearest(nearest, chunk, this.priorityCx, this.priorityCz, limit);
    }

    return nearest.map((entry) => entry.item);
  }

  countDirtyChunks(): number {
    return this.dirtyChunkKeys.size;
  }

  insertNearest<T extends PriorityItem>(
    nearest: PriorityEntry<T>[],
    item: T,
    centerCx: number,
    centerCz: number,
    limit: number
  ): void {
    const entry = this.createPriorityEntry(item, centerCx, centerCz);

    let insertAt = nearest.length;
    while (insertAt > 0 && this.isNearer(entry, nearest[insertAt - 1])) {
      insertAt -= 1;
    }

    if (insertAt >= limit) return;
    nearest.splice(insertAt, 0, entry);
    if (nearest.length > limit) nearest.pop();
  }

  createPriorityEntry<T extends PriorityItem>(
    item: T,
    centerCx: number,
    centerCz: number
  ): PriorityEntry<T> {
    const dx = item.cx - centerCx;
    const dz = item.cz - centerCz;
    const distance = dx * dx + dz * dz;
    const ring = Math.sqrt(distance);
    const alignment = this.chunkViewAlignment(dx, dz, distance);
    const visible = this.chunkIntersectsFrustum(item.cx, item.cz);

    return {
      item,
      distance,
      alignment,
      visible,
      lane: this.priorityLane(ring, alignment, visible)
    };
  }

  chunkViewAlignment(dx: number, dz: number, distance: number): number {
    if (!this.priorityViewActive || distance === 0) return 0;
    return (dx * this.priorityViewX + dz * this.priorityViewZ) / Math.sqrt(distance);
  }

  chunkIntersectsFrustum(cx: number, cz: number): boolean {
    if (!this.priorityFrustumActive) return true;
    const frustum = this.priorityFrustum;
    if (!frustum) return true;

    const minX = cx * CHUNK_SIZE - FRUSTUM_PRIORITY_PADDING;
    const maxX = (cx + 1) * CHUNK_SIZE + FRUSTUM_PRIORITY_PADDING;
    const minY = -FRUSTUM_PRIORITY_PADDING;
    const maxY = WORLD_HEIGHT + FRUSTUM_PRIORITY_PADDING;
    const minZ = cz * CHUNK_SIZE - FRUSTUM_PRIORITY_PADDING;
    const maxZ = (cz + 1) * CHUNK_SIZE + FRUSTUM_PRIORITY_PADDING;

    for (const plane of frustum.planes) {
      const normal = plane.normal;
      const x = normal.x >= 0 ? maxX : minX;
      const y = normal.y >= 0 ? maxY : minY;
      const z = normal.z >= 0 ? maxZ : minZ;
      if (normal.x * x + normal.y * y + normal.z * z + plane.constant < 0) {
        return false;
      }
    }

    return true;
  }

  updateChunkRenderVisibility(centerCx: number, centerCz: number, renderRadius: number): void {
    const normalizedRadius = normalizeChunkRadius(renderRadius);
    this.fogHiddenChunkKeys.clear();

    for (const [key, chunk] of this.chunks) {
      const mesh = chunk.mesh;
      if (!mesh) continue;

      const hiddenByOpaqueFog = !isChunkOffsetInsideRadius(
        chunk.cx - centerCx,
        chunk.cz - centerCz,
        normalizedRadius
      );
      mesh.visible = !hiddenByOpaqueFog;
      if (hiddenByOpaqueFog) {
        this.fogHiddenChunkKeys.add(key);
      }
    }
  }

  priorityLane(ring: number, alignment: number, visible: boolean): number {
    // Lanes keep the immediate neighborhood complete, then spend the remaining
    // budget on chunks in the frustum before broader front-to-back catch-up work.
    if (ring <= VIEW_PRIORITY_NEAR_RADIUS) return 0;
    if (visible) return 1;
    if (!this.priorityViewActive) return 2;
    if (alignment >= VIEW_PRIORITY_FRONT_DOT) return 2;
    if (alignment >= VIEW_PRIORITY_SIDE_DOT) return 3;
    return 4;
  }

  isNearer<T extends PriorityItem>(a: PriorityEntry<T>, b: PriorityEntry<T>): boolean {
    if (a.lane !== b.lane) return a.lane < b.lane;
    if (a.distance !== b.distance) return a.distance < b.distance;
    if (a.alignment !== b.alignment) return a.alignment > b.alignment;
    if (a.item.cz !== b.item.cz) return a.item.cz < b.item.cz;
    return a.item.cx < b.item.cx;
  }

  private getChunkWorkerPriority(cx: number, cz: number, basePriority: number): number {
    const priority = this.createPriorityEntry({ cx, cz }, this.priorityCx, this.priorityCz);
    // WorkerPool priorities are coarse lanes first, tiny distance/alignment nudge second.
    // The world still owns exact apply ordering; this only prevents far background work
    // from occupying every worker while visible chunks or urgent partial meshes wait.
    return basePriority + priority.lane * 10 + Math.min(priority.distance, 10000) / 10000;
  }

  requestBlockLightBuild(chunk: Chunk, key: string): boolean {
    if (!this.workerPool || this.pendingBlockLightKeys.has(key)) return false;

    const requestId = this.nextWorkerRequestId();
    const blocks = chunk.blocks.slice();
    const neighbors = this.snapshotBlockLightNeighborBuffers(chunk.cx, chunk.cz);
    const partialBlockMask = this.createPartialBlockMaskBuffer(chunk.cx, chunk.cz);
    const neighborPartialBlockMasks = this.snapshotBlockLightNeighborPartialMaskBuffers(chunk.cx, chunk.cz);
    const blocksBuffer = transferChunkBuffer(blocks);
    const transfers: Transferable[] = [
      blocksBuffer,
      partialBlockMask,
      ...Object.values(neighbors),
      ...Object.values(neighborPartialBlockMasks)
    ].filter((buffer): buffer is ArrayBuffer => Boolean(buffer));

    this.pendingBlockLightKeys.add(key);
    const payload: BlockLightBuildJobPayload = {
      requestId,
      cx: chunk.cx,
      cz: chunk.cz,
      revision: chunk.revision,
      blocks: blocksBuffer,
      neighbors,
      partialBlockMask,
      neighborPartialBlockMasks
    };
    const handle = this.workerPool.enqueue<BlockLightBuildJobPayload, VoxelWorldWorkerResult>({
      type: BLOCK_LIGHT_BUILD_JOB,
      payload,
      revision: chunk.revision,
      priority: this.getChunkWorkerPriority(chunk.cx, chunk.cz, 8),
      transfer: transfers,
      isRevisionStale: (revision) => {
        const currentChunk = this.getChunk(chunk.cx, chunk.cz);
        return !currentChunk || currentChunk.revision !== revision;
      },
      run: buildBlockLightBuildJob
    });
    this.pendingBlockLightBuilds.set(requestId, {
      key,
      revision: chunk.revision,
      jobId: handle.id
    });
    void handle.promise.then((result) => this.bufferChunkWorkerResult(result));
    return true;
  }

  requestMeshBuild(chunk: Chunk, key: string): void {
    if (!this.workerPool) return;

    const requestId = this.nextWorkerRequestId();
    const blocks = chunk.blocks.slice();
    const neighbors = this.snapshotNeighborBlocks(chunk.cx, chunk.cz);
    const partialBlockMasks = this.snapshotPartialBlockMasks(chunk.cx, chunk.cz);
    const blockLights = this.snapshotChunkBlockLightBuffers(chunk.cx, chunk.cz);
    const blocksBuffer = transferChunkBuffer(blocks);
    const transfers: Transferable[] = [
      blocksBuffer,
      partialBlockMasks.current,
      ...Object.values(neighbors),
      ...Object.values(partialBlockMasks.neighbors),
      blockLights.current,
      ...Object.values(blockLights.neighbors)
    ].filter((buffer): buffer is ArrayBuffer => Boolean(buffer));

    this.pendingMeshKeys.add(key);
    const payload: ChunkMeshJobPayload = {
      requestId,
      cx: chunk.cx,
      cz: chunk.cz,
      revision: chunk.revision,
      blocks: blocksBuffer,
      neighbors,
      partialBlockMasks,
      blockLights
    };
    const handle = this.workerPool.enqueue<ChunkMeshJobPayload, VoxelWorldWorkerResult>({
      type: CHUNK_MESH_JOB,
      payload,
      revision: chunk.revision,
      priority: this.getChunkWorkerPriority(chunk.cx, chunk.cz, 10),
      transfer: transfers,
      isRevisionStale: (revision) => {
        const currentChunk = this.getChunk(chunk.cx, chunk.cz);
        return !currentChunk || currentChunk.revision !== revision;
      },
      run: buildChunkMeshJob
    });
    this.pendingMeshBuilds.set(requestId, {
      key,
      revision: chunk.revision,
      jobId: handle.id
    });
    void handle.promise.then((result) => this.bufferChunkWorkerResult(result));
  }

  snapshotNeighborBlocks(cx: number, cz: number): ChunkNeighborBuffers {
    return {
      negativeX: cloneChunkBuffer(this.getChunk(cx - 1, cz)),
      positiveX: cloneChunkBuffer(this.getChunk(cx + 1, cz)),
      negativeZ: cloneChunkBuffer(this.getChunk(cx, cz - 1)),
      positiveZ: cloneChunkBuffer(this.getChunk(cx, cz + 1))
    };
  }

  snapshotBlockLightNeighborBuffers(cx: number, cz: number): Record<string, ArrayBuffer | null> {
    const neighbors: Record<string, ArrayBuffer | null> = {};
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        neighbors[createBlockLightNeighborKey(dx, dz)] = cloneChunkBuffer(this.getChunk(cx + dx, cz + dz));
      }
    }
    return neighbors;
  }

  snapshotBlockLightNeighborPartialMaskBuffers(cx: number, cz: number): Record<string, ArrayBuffer | null> {
    const neighbors: Record<string, ArrayBuffer | null> = {};
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        neighbors[createBlockLightNeighborKey(dx, dz)] = this.createPartialBlockMaskBufferForExistingChunk(cx + dx, cz + dz);
      }
    }
    return neighbors;
  }

  snapshotChunkBlockLightBuffers(cx: number, cz: number): ChunkBlockLightBuffers {
    return {
      current: cloneCachedBlockLightBuffer(this.blockLightCache.get(this.key(cx, cz))),
      neighbors: {
        negativeX: cloneCachedBlockLightBuffer(this.blockLightCache.get(this.key(cx - 1, cz))),
        positiveX: cloneCachedBlockLightBuffer(this.blockLightCache.get(this.key(cx + 1, cz))),
        negativeZ: cloneCachedBlockLightBuffer(this.blockLightCache.get(this.key(cx, cz - 1))),
        positiveZ: cloneCachedBlockLightBuffer(this.blockLightCache.get(this.key(cx, cz + 1)))
      }
    };
  }

  snapshotPartialBlockMeshRegionBlockLightInput(
    update: PartialBlockMeshRegionUpdate
  ): Pick<PartialBlockMeshBuildInput, "blockLights" | "blockLightChunkOrigin"> | undefined {
    const coords = parsePartialBlockMeshRegionKey(update.key);
    if (!coords) return undefined;
    const bounds = getPartialBlockMeshRegionBounds(coords);
    const cx = Math.floor(bounds.minX / CHUNK_SIZE);
    const cz = Math.floor(bounds.minZ / CHUNK_SIZE);

    // Partial mesh regions are 4m columns and chunk columns are 16m columns,
    // so a region's owned cells fit inside one chunk. Context halo cells can
    // cross the edge, but all rendered vertices sample through this owner chunk
    // plus the cloned cardinal cache buffers below.
    return {
      blockLights: this.snapshotChunkBlockLightBuffers(cx, cz),
      blockLightChunkOrigin: { cx, cz }
    };
  }

  snapshotPartialBlockMasks(cx: number, cz: number): {
    readonly current: ArrayBuffer | null;
    readonly neighbors: ChunkNeighborBuffers;
  } {
    return {
      current: this.createPartialBlockMaskBuffer(cx, cz),
      neighbors: {
        negativeX: this.createPartialBlockMaskBufferForExistingChunk(cx - 1, cz),
        positiveX: this.createPartialBlockMaskBufferForExistingChunk(cx + 1, cz),
        negativeZ: this.createPartialBlockMaskBufferForExistingChunk(cx, cz - 1),
        positiveZ: this.createPartialBlockMaskBufferForExistingChunk(cx, cz + 1)
      }
    };
  }

  createPartialBlockMaskBufferForExistingChunk(cx: number, cz: number): ArrayBuffer | null {
    if (!this.getChunk(cx, cz)) return null;
    return this.createPartialBlockMaskBuffer(cx, cz);
  }

  createPartialBlockMaskBuffer(cx: number, cz: number): ArrayBuffer | null {
    const mask = this.createPartialBlockMask(cx, cz);
    return mask ? transferChunkBuffer(mask) : null;
  }

  createPartialBlockMask(cx: number, cz: number): Uint8Array | null {
    const key = this.key(cx, cz);
    const cached = this.partialBlockMaskCache.get(key);
    if (cached) return cached.mask ? cached.mask.slice() : null;

    const cells = this.partialBlocksByChunk.get(key);
    if (!cells || cells.size === 0) {
      this.partialBlockMaskCache.set(key, { mask: null });
      return null;
    }

    const mask = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const minX = cx * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1;
    const minZ = cz * CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE - 1;

    // The cache stores the canonical mask; snapshots return slices because
    // worker transfer detaches ArrayBuffers. Cute, very fast foot-gun avoided.
    for (const cell of cells.values()) {
      const { x, y, z } = cell.position;
      if (y < 0 || y >= WORLD_HEIGHT) continue;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const localX = x - minX;
      const localZ = z - minZ;
      mask[localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * y)] = 1;
    }

    this.partialBlockMaskCache.set(key, { mask });
    return mask.slice();
  }

  getStats(): WorldStats {
    let frustumChunks = 0;
    let renderedChunks = 0;
    let fogHiddenChunks = 0;
    for (const [key, chunk] of this.chunks) {
      if (!this.chunkIntersectsFrustum(chunk.cx, chunk.cz)) continue;
      frustumChunks += 1;
      if (this.fogHiddenChunkKeys.has(key)) {
        fogHiddenChunks += 1;
        continue;
      }
      if (chunk.mesh?.visible) {
        renderedChunks += 1;
      }
    }

    let visibleDirtyChunks = 0;
    for (const key of this.dirtyChunkKeys) {
      const chunk = this.chunks.get(key);
      if (!chunk || !chunk.dirty) {
        this.dirtyChunkKeys.delete(key);
        continue;
      }
      if (this.chunkIntersectsFrustum(chunk.cx, chunk.cz)) visibleDirtyChunks += 1;
    }

    let partialDamageBlocks = 0;
    let partialSurfaceBlocks = 0;
    let partialRemovedSubvoxels = 0;
    let partialTotalSubvoxels = 0;
    const subvoxelsPerPartialBlock = BLOCK_FRAGMENT_GRID_SIZE ** 3;
    for (const cell of this.partialBlocks.values()) {
      if (isPartialBlockSurfaceCell(cell)) {
        partialSurfaceBlocks += 1;
        continue;
      }

      partialDamageBlocks += 1;
      partialTotalSubvoxels += subvoxelsPerPartialBlock;
      const removedSubvoxels = Math.min(
        subvoxelsPerPartialBlock,
        cell.removedVisualCellIndexes?.length ?? createPartialBlockRemovedVisualCellIndexes(cell).length
      );
      partialRemovedSubvoxels += removedSubvoxels;
    }

    return {
      loadedChunks: this.chunks.size,
      visibleChunks: frustumChunks,
      culledChunks: this.chunks.size - frustumChunks,
      frustumChunks,
      renderedChunks,
      fogHiddenChunks,
      savedChunks: this.savedChunkKeys.size,
      queuedChunks: this.chunkLoadQueue.size,
      loadedThisFrame: this.lastLoadedChunks,
      requestedLoadsThisFrame: this.lastRequestedChunkLoads,
      pendingChunkLoads: this.pendingChunkLoads.size + this.pendingSavedChunkLoads.size,
      meshedThisFrame: this.lastMeshedChunks,
      requestedMeshesThisFrame: this.lastRequestedMeshes,
      pendingMeshBuilds: this.pendingMeshBuilds.size,
      dirtyChunks: this.dirtyChunkKeys.size,
      visibleDirtyChunks,
      culledDirtyChunks: this.dirtyChunkKeys.size - visibleDirtyChunks,
      modifiedChunks: this.modifiedChunkKeys.size,
      damagedBlocks: this.blockDamage.size,
      partialBlocks: this.partialBlocks.size,
      partialDamageBlocks,
      partialSurfaceBlocks,
      partialRemovedSubvoxels,
      partialRemainingSubvoxels: Math.max(0, partialTotalSubvoxels - partialRemovedSubvoxels),
      partialTotalSubvoxels,
      pendingChunkSaves: this.pendingSavedChunkWrites.size + this.chunkStorageChains.size
    };
  }

  getStreamingDiagnostics(): ChunkStreamingDiagnostics {
    return {
      queueWindowRefreshes: this.queueWindowRefreshes,
      queueWindowSkips: this.queueWindowSkips,
      lastQueueCandidateChecks: this.lastQueueCandidateChecks,
      unloadWindowRefreshes: this.unloadWindowRefreshes,
      unloadWindowSkips: this.unloadWindowSkips,
      lastUnloadCandidateChecks: this.lastUnloadCandidateChecks,
      trackedDirtyChunks: this.dirtyChunkKeys.size,
      trackedModifiedChunks: this.modifiedChunkKeys.size
    };
  }

  hasPendingRuntimeWork(): boolean {
    // The render loop uses this as its "may I go to sleep?" signal. Keep it
    // intentionally boring: if the worker, storage, or mesh pipeline still has
    // anything queued, one more animation frame should drain that work before
    // the engine hibernates.
    return (
      this.chunkLoadQueue.size > 0 ||
      this.pendingChunkLoads.size > 0 ||
      this.pendingSavedChunkLoads.size > 0 ||
      this.workerResults.length > 0 ||
      this.savedChunkResults.length > 0 ||
      this.pendingBlockLightBuilds.size > 0 ||
      this.pendingMeshBuilds.size > 0 ||
      this.dirtyBlockLightChunkKeys.size > 0 ||
      this.dirtyChunkKeys.size > 0 ||
      this.dirtyPartialBlockRegionKeys.size > 0 ||
      this.pendingSavedChunkWrites.size > 0 ||
      this.storageOperations.size > 0 ||
      this.chunkStorageChains.size > 0
    );
  }

  highestSolidY(x: number, z: number): number {
    return this.getTopBlock(x, z).y;
  }

  getTopBlock(x: number, z: number): { readonly block: number; readonly y: number } {
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    return this.getChunk(cx, cz)?.getTopLocal(lx, lz) ?? { block: BLOCK.air, y: 0 };
  }
}

function parseBlockKey(key: string): { readonly x: number; readonly y: number; readonly z: number } | null {
  const [xText, yText, zText] = key.split(",");
  const x = Number(xText);
  const y = Number(yText);
  const z = Number(zText);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function getChunkRadiusOffsets(radius: number): readonly ChunkRadiusOffset[] {
  const normalizedRadius = normalizeChunkRadius(radius);
  const cachedOffsets = chunkRadiusOffsetCache.get(normalizedRadius);
  if (cachedOffsets) return cachedOffsets;

  const offsets: ChunkRadiusOffset[] = [];
  for (let dz = -normalizedRadius; dz <= normalizedRadius; dz += 1) {
    for (let dx = -normalizedRadius; dx <= normalizedRadius; dx += 1) {
      if (!isChunkOffsetInsideRadius(dx, dz, normalizedRadius)) continue;
      offsets.push({ dx, dz });
    }
  }

  chunkRadiusOffsetCache.set(normalizedRadius, offsets);
  return offsets;
}

function normalizeChunkRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 0;
  return Math.max(0, Math.floor(radius));
}

function isChunkOffsetInsideRadius(dx: number, dz: number, radius: number): boolean {
  // Chunk streaming works in whole-chunk coordinates, but the horizon is viewed
  // as a circular hard fog wall. The half-chunk margin keeps edge chunks from
  // popping when the player stands near a chunk boundary while still trimming
  // the square corners that made distant terrain look like a floating island.
  const radiusWithChunkMargin = radius + 0.5;
  return dx * dx + dz * dz <= radiusWithChunkMargin * radiusWithChunkMargin;
}

function cloneChunkBuffer(chunk: Chunk | undefined): ArrayBuffer | null {
  return chunk ? transferChunkBuffer(chunk.blocks.slice()) : null;
}

function cloneCachedBlockLightBuffer(entry: BlockLightCacheEntry | undefined): ArrayBuffer | null {
  return entry ? transferChunkBuffer(entry.blockLight.slice()) : null;
}

function transferChunkBuffer(blocks: Uint8Array): ArrayBuffer {
  // All chunk snapshots in this engine are plain Uint8Array instances, not shared buffers.
  return blocks.buffer as ArrayBuffer;
}

function findPendingChunkRequestIdByJob(
  pendingLoads: ReadonlyMap<number, PendingChunkLoad>,
  jobId: number
): number | null {
  for (const [requestId, pending] of pendingLoads) {
    if (pending.jobId === jobId) return requestId;
  }
  return null;
}

function findPendingMeshRequestIdByJob(
  pendingBuilds: ReadonlyMap<number, PendingMeshBuild>,
  jobId: number
): number | null {
  for (const [requestId, pending] of pendingBuilds) {
    if (pending.jobId === jobId) return requestId;
  }
  return null;
}

function findPendingBlockLightRequestIdByJob(
  pendingBuilds: ReadonlyMap<number, PendingBlockLightBuild>,
  jobId: number
): number | null {
  for (const [requestId, pending] of pendingBuilds) {
    if (pending.jobId === jobId) return requestId;
  }
  return null;
}

function getOrCreateMapBucket<K, V>(buckets: Map<string, Map<K, V>>, key: string): Map<K, V> {
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket = new Map<K, V>();
  buckets.set(key, bucket);
  return bucket;
}

function getOrCreateArrayBucket<K, V>(buckets: Map<K, V[]>, key: K): V[] {
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket: V[] = [];
  buckets.set(key, bucket);
  return bucket;
}

function removeFromMapBucket<K, V>(buckets: Map<string, Map<K, V>>, bucketKey: string, valueKey: K): void {
  const bucket = buckets.get(bucketKey);
  if (!bucket) return;

  bucket.delete(valueKey);
  if (bucket.size === 0) buckets.delete(bucketKey);
}

function sortPartialBlockCells(cells: readonly PartialBlockCell[]): readonly PartialBlockCell[] {
  return [...cells].sort((a, b) =>
    a.position.y - b.position.y ||
    a.position.z - b.position.z ||
    a.position.x - b.position.x
  );
}
