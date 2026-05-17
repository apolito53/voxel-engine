import * as THREE from "three";
import { BLOCK_FRAGMENT_COUNT, BLOCK_FRAGMENT_GRID_SIZE } from "./blockFragments";
import { createBlockMeshKey, getTintedBlockColor } from "./blockColors";
import type { CollisionBounds } from "./collision";
import { getSunlitFaceShade } from "./voxelLighting";

export const PARTIAL_BLOCK_CORE_DAMAGE = 1;
export const PARTIAL_BLOCK_MAX_CUTS_PER_CELL = 4;
// Damaged blocks borrow the fracture grid only as a visual presentation lattice.
// Gameplay material stays normalized as block volume; the lattice just decides
// how much of the still-solid cube is visibly bitten away at a given HP ratio.
export const PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE = BLOCK_FRAGMENT_GRID_SIZE;
export const PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT = BLOCK_FRAGMENT_COUNT;

const PARTIAL_BLOCK_FACE_SEGMENTS = 5;
const PARTIAL_BLOCK_LATTICE_CELL_SIZE = 1 / PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE;
const PARTIAL_BLOCK_BITE_DEPTH_SCORE_SCALE = 0.65;
const PARTIAL_BLOCK_BITE_WRINKLE_DEPTH = 0.045;
const PARTIAL_BLOCK_MIN_RADIUS = 0.26;
const PARTIAL_BLOCK_MAX_RADIUS = 0.46;
const PARTIAL_BLOCK_MIN_DEPTH = 0.24;
const PARTIAL_BLOCK_MAX_DEPTH = 0.58;
const PARTIAL_BLOCK_ADJACENT_FACE_STRENGTH = 0.68;
const PARTIAL_BLOCK_ADJACENT_FACE_RADIUS_SCALE = 0.86;
const PARTIAL_BLOCK_OPPOSITE_FACE_DOT_CUTOFF = -0.1;
const PARTIAL_BLOCK_INNER_DARKENING = 0.55;
const PARTIAL_BLOCK_SURFACE_GRID_STEPS = 4;
const PARTIAL_BLOCK_SURFACE_MIN_HEIGHT = 0.06;
const PARTIAL_BLOCK_SURFACE_MAX_HEIGHT = 0.54;
const PARTIAL_BLOCK_SURFACE_EDGE_HEIGHT = 0.1;
const PARTIAL_BLOCK_SURFACE_SAMPLE_FALLOFF = 0.5;
const PARTIAL_BLOCK_SURFACE_SAMPLE_NOISE = 0.09;
const PARTIAL_BLOCK_SURFACE_EPSILON = 0.000001;

export type PartialBlockPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PartialBlockCut = {
  readonly normal: PartialBlockPosition;
  readonly localPoint: PartialBlockPosition;
  readonly trajectory?: PartialBlockPosition;
  readonly coreRadius?: number;
  readonly radius: number;
  readonly depth: number;
  readonly seed: number;
};

export type PartialBlockCell = {
  readonly block: number;
  readonly position: PartialBlockPosition;
  readonly cuts: readonly PartialBlockCut[];
  readonly removedVisualCellIndexes?: readonly number[];
  readonly surfaceSamples?: readonly PartialBlockSurfaceSample[];
  readonly damage: number;
  readonly maxHealth: number;
};

export type PartialBlockSurfaceSample = {
  readonly localX: number;
  readonly localZ: number;
  readonly height: number;
  readonly weight: number;
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

type PartialBlockSurfaceGrid = {
  readonly minX: number;
  readonly maxX: number;
  readonly baseY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly heights: readonly number[];
};

type PartialBlockSurfaceCellMap = ReadonlyMap<string, PartialBlockCell>;
type PartialBlockLatticeCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly index: number;
  readonly center: PartialBlockPosition;
};
type PartialBlockLatticeBox = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};
type PartialBlockAxis = "x" | "y" | "z";

const PARTIAL_BLOCK_LATTICE_NEIGHBOR_OFFSETS: readonly PartialBlockPosition[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 }
];

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
    this.mesh.castShadow = false;
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

    const surfaceCells = new Map(
      cells
        .filter(isPartialBlockSurfaceCell)
        .map((cell) => [createPartialBlockKey(cell.position), cell])
    );

    for (const cell of cells) {
      if (isPartialBlockSurfaceCell(cell)) {
        addPartialBlockSurfaceGeometry(geometryData, cell, surfaceCells);
      } else {
        addPartialBlockCellGeometry(geometryData, cell, isFaceVisible);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(geometryData.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(geometryData.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(geometryData.colors, 3));
    geometry.setIndex(geometryData.indices);
    if (geometryData.positions.length > 0) {
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

export function isPartialBlockSurfaceCell(cell: PartialBlockCell): boolean {
  return Boolean(cell.surfaceSamples && cell.surfaceSamples.length > 0);
}

export function createPartialBlockCollisionBoxes(cell: PartialBlockCell): readonly CollisionBounds[] {
  const removedCells = createPartialBlockRemovedLatticeCellSet(cell);
  const occupiedCells = new Set<number>();
  const consumedCells = new Set<number>();
  const boxes: CollisionBounds[] = [];

  for (const latticeCell of PARTIAL_BLOCK_LATTICE_CELLS) {
    if (removedCells.has(latticeCell.index)) continue;
    occupiedCells.add(latticeCell.index);
  }

  for (const latticeCell of PARTIAL_BLOCK_LATTICE_CELLS) {
    if (!occupiedCells.has(latticeCell.index) || consumedCells.has(latticeCell.index)) continue;

    const latticeBox = createMergedPartialBlockLatticeBox(latticeCell, occupiedCells, consumedCells);
    markPartialBlockCollisionBoxConsumed(latticeBox, consumedCells);
    boxes.push(createPartialBlockCollisionBounds(cell.position, latticeBox));
  }

  return boxes;
}

export function createPartialBlockCut({
  block,
  position,
  point,
  normal,
  incomingDirection,
  coreRadius,
  speed,
  cutIndex
}: {
  readonly block: number;
  readonly position: PartialBlockPosition;
  readonly point: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly normal: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly incomingDirection?: Pick<THREE.Vector3, "x" | "y" | "z">;
  readonly coreRadius?: number;
  readonly speed: number;
  readonly cutIndex: number;
}): PartialBlockCut {
  const localPoint = {
    x: clamp01(point.x - Math.floor(position.x)),
    y: clamp01(point.y - Math.floor(position.y)),
    z: clamp01(point.z - Math.floor(position.z))
  };
  const normalizedNormal = normalizeAxisNormal(normal);
  const trajectory = normalizeDirection(incomingDirection) ?? {
    x: -normalizedNormal.x,
    y: -normalizedNormal.y,
    z: -normalizedNormal.z
  };
  const speedT = clamp01((speed - 2) / 22);
  const seed = hashPartialBlockCut(block, position, normalizedNormal, cutIndex);
  const safeCoreRadius = typeof coreRadius === "number" && Number.isFinite(coreRadius) && coreRadius > 0
    ? coreRadius
    : undefined;

  return {
    normal: normalizedNormal,
    localPoint,
    trajectory,
    coreRadius: safeCoreRadius,
    radius: lerp(PARTIAL_BLOCK_MIN_RADIUS, PARTIAL_BLOCK_MAX_RADIUS, speedT) *
      (0.88 + hashUnit(seed ^ 0x9e3779b9) * 0.24),
    depth: lerp(PARTIAL_BLOCK_MIN_DEPTH, PARTIAL_BLOCK_MAX_DEPTH, speedT) *
      (0.86 + hashUnit(seed ^ 0x7f4a7c15) * 0.28),
    seed
  };
}

export function createPartialBlockSurfaceSamples(
  position: PartialBlockPosition,
  cuts: readonly PartialBlockCut[]
): PartialBlockSurfaceSample[] {
  const seed = hashPartialBlockCut(0, position, { x: 0, y: 1, z: 0 }, cuts.length);
  const centerHeight = clamp(
    0.25 + (hashUnit(seed ^ 0x5f356495) - 0.5) * PARTIAL_BLOCK_SURFACE_SAMPLE_NOISE,
    PARTIAL_BLOCK_SURFACE_MIN_HEIGHT,
    PARTIAL_BLOCK_SURFACE_MAX_HEIGHT
  );
  const samples: PartialBlockSurfaceSample[] = [{
    localX: 0.5,
    localZ: 0.5,
    height: centerHeight,
    weight: 1
  }];

  for (const cut of cuts) {
    samples.push({
      localX: clamp01(cut.localPoint.x),
      localZ: clamp01(cut.localPoint.z),
      height: clamp(
        0.12 + cut.depth * 0.42 + (hashUnit(cut.seed ^ 0x85ebca6b) - 0.45) * PARTIAL_BLOCK_SURFACE_SAMPLE_NOISE,
        PARTIAL_BLOCK_SURFACE_MIN_HEIGHT,
        PARTIAL_BLOCK_SURFACE_MAX_HEIGHT
      ),
      weight: 1 + cut.depth
    });
  }

  return samples;
}

export function getPartialBlockSupportHeight(
  cells: Iterable<PartialBlockCell>,
  bounds: CollisionBounds
): number | null {
  const minX = Math.floor(bounds.minX);
  const maxX = Math.floor(bounds.maxX - PARTIAL_BLOCK_SURFACE_EPSILON);
  const minY = Math.floor(bounds.minY - PARTIAL_BLOCK_SURFACE_MAX_HEIGHT - PARTIAL_BLOCK_SURFACE_EPSILON);
  const maxY = Math.floor(bounds.maxY);
  const minZ = Math.floor(bounds.minZ);
  const maxZ = Math.floor(bounds.maxZ - PARTIAL_BLOCK_SURFACE_EPSILON);
  let supportY: number | null = null;

  for (const cell of cells) {
    if (!isPartialBlockSurfaceCell(cell)) continue;
    if (
      cell.position.x < minX ||
      cell.position.x > maxX ||
      cell.position.y < minY ||
      cell.position.y > maxY ||
      cell.position.z < minZ ||
      cell.position.z > maxZ
    ) {
      continue;
    }

    const cellMinX = cell.position.x;
    const cellMaxX = cell.position.x + 1;
    const cellMinZ = cell.position.z;
    const cellMaxZ = cell.position.z + 1;
    const overlapMinX = Math.max(bounds.minX, cellMinX);
    const overlapMaxX = Math.min(bounds.maxX, cellMaxX);
    const overlapMinZ = Math.max(bounds.minZ, cellMinZ);
    const overlapMaxZ = Math.min(bounds.maxZ, cellMaxZ);
    if (overlapMinX >= overlapMaxX || overlapMinZ >= overlapMaxZ) continue;

    const cellSupportY = Math.max(
      getPartialSurfaceYAt(cell, (overlapMinX + overlapMaxX) * 0.5 - cell.position.x, (overlapMinZ + overlapMaxZ) * 0.5 - cell.position.z),
      getPartialSurfaceYAt(cell, overlapMinX - cell.position.x, overlapMinZ - cell.position.z),
      getPartialSurfaceYAt(cell, overlapMinX - cell.position.x, overlapMaxZ - cell.position.z),
      getPartialSurfaceYAt(cell, overlapMaxX - cell.position.x, overlapMinZ - cell.position.z),
      getPartialSurfaceYAt(cell, overlapMaxX - cell.position.x, overlapMaxZ - cell.position.z)
    );
    if (cellSupportY > bounds.maxY + PARTIAL_BLOCK_SURFACE_EPSILON) continue;
    supportY = supportY === null ? cellSupportY : Math.max(supportY, cellSupportY);
  }

  return supportY;
}

export function addPartialBlockCellGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  isFaceVisible: PartialBlockFaceVisibility
): void {
  const removedCells = createPartialBlockRemovedLatticeCellSet(cell);
  if (removedCells.size > 0) {
    addPartialBlockLatticeGeometry(geometry, cell, isFaceVisible, removedCells);
    return;
  }

  for (const face of PARTIAL_BLOCK_FACES) {
    if (isFaceVisible(cell, face.normal)) addFlatFaceGeometry(geometry, cell, face);
  }
}

export function getPartialBlockRemovedVisualCellCount(
  cell: Pick<PartialBlockCell, "damage" | "maxHealth">
): number {
  if (cell.maxHealth <= 0 || cell.damage <= 0) return 0;
  const removedFraction = clamp01(cell.damage / cell.maxHealth);
  return Math.max(
    0,
    Math.min(
      PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT,
      Math.round(removedFraction * PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT)
    )
  );
}

export function getPartialBlockRemainingVisualCellCount(
  cell: Pick<PartialBlockCell, "damage" | "maxHealth">
): number {
  return Math.max(
    0,
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT - getPartialBlockRemovedVisualCellCount(cell)
  );
}

export function createPartialBlockRemovedVisualCellIndexes(
  cell: Pick<PartialBlockCell, "cuts" | "damage" | "maxHealth">,
  previousIndexes: readonly number[] = []
): readonly number[] {
  // Keep one visual cell alive while the world still treats this as an existing
  // voxel. The final health step removes the voxel and routes remaining material
  // through the normal debris/rubble pipeline instead.
  const targetRemovedCount = Math.min(
    PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT - 1,
    getPartialBlockRemovedVisualCellCount(cell)
  );
  if (targetRemovedCount <= 0) return [];

  const removed = new Set<number>();
  for (const index of previousIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT) continue;
    removed.add(index);
  }
  if (removed.size >= targetRemovedCount) return [...removed];

  const rankedCells = createPartialBlockRemovalRanking(cell);

  if (targetRemovedCount - removed.size >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE) {
    for (let cutIndex = cell.cuts.length - 1; cutIndex >= 0; cutIndex -= 1) {
      const cut = cell.cuts[cutIndex];
      if (!cut || !isTinyCoreCut(cut)) continue;

      for (const tunnelIndex of createPartialBlockTrajectoryTunnelCellIndexes(
        cut.localPoint,
        cut.trajectory ?? {
          x: -cut.normal.x,
          y: -cut.normal.y,
          z: -cut.normal.z
        }
      )) {
        addConnectedRemovedVisualCell(removed, tunnelIndex);
        if (removed.size >= targetRemovedCount) return [...removed];
      }
    }
  }

  fillConnectedRemovedVisualCells(removed, rankedCells, targetRemovedCount);

  return [...removed];
}

export function arePartialBlockVisualCellIndexesConnected(indexes: readonly number[]): boolean {
  const validIndexes = new Set<number>();
  for (const index of indexes) {
    if (isValidPartialBlockLatticeCellIndex(index)) validIndexes.add(index);
  }
  if (validIndexes.size <= 1) return true;

  const firstIndex = validIndexes.values().next().value as number | undefined;
  if (firstIndex === undefined) return true;

  const visited = new Set<number>([firstIndex]);
  const queue = [firstIndex];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const neighbor of getPartialBlockAdjacentLatticeCellIndexes(current)) {
      if (!validIndexes.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return visited.size === validIndexes.size;
}

export function createPartialBlockTrajectoryTunnelCellIndexes(
  localPoint: PartialBlockPosition,
  trajectory: PartialBlockPosition
): readonly number[] {
  const direction = normalizeDirection(trajectory);
  if (!direction) return [];

  const dominantAxis = getDominantPartialBlockAxis(direction);
  const axisDirection = direction[dominantAxis];
  const depthSlots = createPartialBlockDepthSlots(axisDirection);
  // Tiny cores only have enough material budget for one three-cell tunnel.
  // Keep the lateral slot fixed so gravity or shallow angle drift cannot make
  // diagonal holes that need extra bridge cells to be physically open.
  const lateralSlots = {
    x: getNearestPartialBlockLatticeSlot(localPoint.x),
    y: getNearestPartialBlockLatticeSlot(localPoint.y),
    z: getNearestPartialBlockLatticeSlot(localPoint.z)
  };
  const indexes: number[] = [];

  for (const depthSlot of depthSlots) {
    const x = dominantAxis === "x" ? depthSlot : lateralSlots.x;
    const y = dominantAxis === "y" ? depthSlot : lateralSlots.y;
    const z = dominantAxis === "z" ? depthSlot : lateralSlots.z;
    indexes.push(x + y * PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE + z * PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ** 2);
  }

  return indexes;
}

function createPartialBlockRemovedLatticeCellSet(cell: PartialBlockCell): Set<number> {
  return new Set(
    cell.removedVisualCellIndexes ?? createPartialBlockRemovedVisualCellIndexes(cell)
  );
}

function createMergedPartialBlockLatticeBox(
  seed: PartialBlockLatticeCell,
  occupiedCells: ReadonlySet<number>,
  consumedCells: ReadonlySet<number>
): PartialBlockLatticeBox {
  const box = {
    minX: seed.x,
    maxX: seed.x,
    minY: seed.y,
    maxY: seed.y,
    minZ: seed.z,
    maxZ: seed.z
  };

  let expanded = true;
  while (expanded) {
    expanded = false;

    if (canUsePartialBlockLatticeBoxRange(
      occupiedCells,
      consumedCells,
      { ...box, maxX: box.maxX + 1 }
    )) {
      box.maxX += 1;
      expanded = true;
    }

    if (canUsePartialBlockLatticeBoxRange(
      occupiedCells,
      consumedCells,
      { ...box, maxZ: box.maxZ + 1 }
    )) {
      box.maxZ += 1;
      expanded = true;
    }

    if (canUsePartialBlockLatticeBoxRange(
      occupiedCells,
      consumedCells,
      { ...box, maxY: box.maxY + 1 }
    )) {
      box.maxY += 1;
      expanded = true;
    }
  }

  return box;
}

function canUsePartialBlockLatticeBoxRange(
  occupiedCells: ReadonlySet<number>,
  consumedCells: ReadonlySet<number>,
  box: PartialBlockLatticeBox
): boolean {
  if (
    box.maxX >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ||
    box.maxY >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ||
    box.maxZ >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE
  ) {
    return false;
  }

  for (let z = box.minZ; z <= box.maxZ; z += 1) {
    for (let y = box.minY; y <= box.maxY; y += 1) {
      for (let x = box.minX; x <= box.maxX; x += 1) {
        const index = getPartialBlockLatticeCellIndex(x, y, z);
        if (index === null || !occupiedCells.has(index) || consumedCells.has(index)) {
          return false;
        }
      }
    }
  }

  return true;
}

function markPartialBlockCollisionBoxConsumed(
  box: PartialBlockLatticeBox,
  consumedCells: Set<number>
): void {
  for (let z = box.minZ; z <= box.maxZ; z += 1) {
    for (let y = box.minY; y <= box.maxY; y += 1) {
      for (let x = box.minX; x <= box.maxX; x += 1) {
        const index = getPartialBlockLatticeCellIndex(x, y, z);
        if (index !== null) consumedCells.add(index);
      }
    }
  }
}

function createPartialBlockCollisionBounds(
  position: PartialBlockPosition,
  box: PartialBlockLatticeBox
): CollisionBounds {
  return {
    minX: position.x + box.minX * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
    maxX: position.x + (box.maxX + 1) * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
    minY: position.y + box.minY * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
    maxY: position.y + (box.maxY + 1) * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
    minZ: position.z + box.minZ * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
    maxZ: position.z + (box.maxZ + 1) * PARTIAL_BLOCK_LATTICE_CELL_SIZE
  };
}

function createPartialBlockRemovalRanking(
  cell: Pick<PartialBlockCell, "cuts">
): readonly { readonly index: number; readonly score: number }[] {
  return PARTIAL_BLOCK_LATTICE_CELLS
    .map((latticeCell) => ({
      index: latticeCell.index,
      score: scorePartialBlockLatticeCellForRemoval(cell, latticeCell)
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index);
}

function fillConnectedRemovedVisualCells(
  removed: Set<number>,
  rankedCells: readonly { readonly index: number; readonly score: number }[],
  targetRemovedCount: number
): void {
  // The ranking still decides the bite's preferred shape, but the frontier
  // rule decides which ranked candidates are legal. That keeps one impact from
  // plucking isolated sub-voxels out of the hidden presentation lattice.
  if (removed.size === 0) {
    const seed = rankedCells.find((rankedCell) => !removed.has(rankedCell.index));
    if (seed) removed.add(seed.index);
  }

  while (removed.size < targetRemovedCount) {
    const next = rankedCells.find((rankedCell) =>
      !removed.has(rankedCell.index) &&
      isPartialBlockLatticeCellAdjacentToRemoved(rankedCell.index, removed)
    );
    if (next) {
      removed.add(next.index);
      continue;
    }

    const fallback = rankedCells.find((rankedCell) => !removed.has(rankedCell.index));
    if (!fallback) return;
    removed.add(fallback.index);
  }
}

function addConnectedRemovedVisualCell(removed: Set<number>, index: number): boolean {
  if (!isValidPartialBlockLatticeCellIndex(index)) return false;
  if (removed.has(index)) return true;
  if (removed.size > 0 && !isPartialBlockLatticeCellAdjacentToRemoved(index, removed)) return false;
  removed.add(index);
  return true;
}

function isPartialBlockLatticeCellAdjacentToRemoved(index: number, removed: ReadonlySet<number>): boolean {
  return getPartialBlockAdjacentLatticeCellIndexes(index).some((neighbor) => removed.has(neighbor));
}

function getPartialBlockAdjacentLatticeCellIndexes(index: number): readonly number[] {
  const cell = PARTIAL_BLOCK_LATTICE_CELLS[index];
  if (!cell) return [];

  const neighbors: number[] = [];
  for (const offset of PARTIAL_BLOCK_LATTICE_NEIGHBOR_OFFSETS) {
    const neighbor = getPartialBlockLatticeCellIndex(
      cell.x + offset.x,
      cell.y + offset.y,
      cell.z + offset.z
    );
    if (neighbor !== null) neighbors.push(neighbor);
  }
  return neighbors;
}

function isValidPartialBlockLatticeCellIndex(index: number): boolean {
  return Number.isInteger(index) &&
    index >= 0 &&
    index < PARTIAL_BLOCK_DAMAGE_LATTICE_CELL_COUNT;
}

function scorePartialBlockLatticeCellForRemoval(
  cell: Pick<PartialBlockCell, "cuts">,
  latticeCell: PartialBlockLatticeCell
): number {
  if (cell.cuts.length === 0) {
    return distanceSq(latticeCell.center, { x: 0.5, y: 0.5, z: 0.5 });
  }

  let bestScore = Number.POSITIVE_INFINITY;
  for (const cut of cell.cuts) {
    // Rank cells around the swept projectile path. Tiny cores naturally pick a
    // narrow tunnel, while bigger cores spend their damage on a wider face bite.
    const trajectory = cut.trajectory ?? {
      x: -cut.normal.x,
      y: -cut.normal.y,
      z: -cut.normal.z
    };
    const delta = {
      x: latticeCell.center.x - cut.localPoint.x,
      y: latticeCell.center.y - cut.localPoint.y,
      z: latticeCell.center.z - cut.localPoint.z
    };
    const depth = delta.x * trajectory.x + delta.y * trajectory.y + delta.z * trajectory.z;
    const lateral = {
      x: delta.x - trajectory.x * depth,
      y: delta.y - trajectory.y * depth,
      z: delta.z - trajectory.z * depth
    };
    const lateralDistance = Math.sqrt(distanceSq(lateral, { x: 0, y: 0, z: 0 }));
    const footprintRadius = Math.max(PARTIAL_BLOCK_LATTICE_CELL_SIZE * 0.32, cut.coreRadius ?? cut.radius);
    const radiusScore = (lateralDistance / footprintRadius) ** 2 * 0.85;
    const depthScore = Math.max(0, depth) / PARTIAL_BLOCK_LATTICE_CELL_SIZE * 0.55;
    const behindFacePenalty = depth < -PARTIAL_BLOCK_SURFACE_EPSILON ? 8 : 0;
    const noise = hashUnit(cut.seed ^ Math.imul(latticeCell.index + 1, 0x9e3779b1)) * 0.12;
    const score = radiusScore + depthScore * PARTIAL_BLOCK_BITE_DEPTH_SCORE_SCALE + behindFacePenalty + noise;
    bestScore = Math.min(bestScore, score);
  }
  return bestScore;
}

function isTinyCoreCut(cut: PartialBlockCut): boolean {
  return typeof cut.coreRadius === "number" &&
    Number.isFinite(cut.coreRadius) &&
    cut.coreRadius <= PARTIAL_BLOCK_LATTICE_CELL_SIZE * 0.5;
}

function createPartialBlockDepthSlots(axisDirection: number): readonly number[] {
  return Array.from(
    { length: PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE },
    (_, index) => axisDirection >= 0 ? index : PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE - 1 - index
  );
}

function getNearestPartialBlockLatticeSlot(value: number): number {
  return Math.max(
    0,
    Math.min(
      PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE - 1,
      Math.round(clamp01(value) * PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE - 0.5)
    )
  );
}

function getDominantPartialBlockAxis(vector: PartialBlockPosition): PartialBlockAxis {
  const ax = Math.abs(vector.x);
  const ay = Math.abs(vector.y);
  const az = Math.abs(vector.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= ax && ay >= az) return "y";
  return "z";
}

function addPartialBlockLatticeGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  isFaceVisible: PartialBlockFaceVisibility,
  removedCells: ReadonlySet<number>
): void {
  for (const latticeCell of PARTIAL_BLOCK_LATTICE_CELLS) {
    if (removedCells.has(latticeCell.index)) continue;

    for (const face of PARTIAL_BLOCK_LATTICE_FACES) {
      const neighborIndex = getPartialBlockLatticeCellIndex(
        latticeCell.x + face.offset.x,
        latticeCell.y + face.offset.y,
        latticeCell.z + face.offset.z
      );
      const isBoundaryFace = neighborIndex === null;
      const exposesBite = neighborIndex !== null && removedCells.has(neighborIndex);
      // Shared faces between remaining hidden cells are skipped, so the damaged
      // block reads as one chipped volume instead of twenty-seven tiny cubes.
      if (!isBoundaryFace && !exposesBite) continue;
      if (isBoundaryFace && !isFaceVisible(cell, face.normal)) continue;

      const corners = getPartialBlockLatticeFaceCorners(cell.position, latticeCell, face.normal);
      if (exposesBite) {
        addWrinkledBiteFace(geometry, cell, latticeCell, face.normal, corners);
      } else {
        addQuad(geometry, cell.block, cell.position, face.normal, corners, 1);
      }
    }
  }
}

function addWrinkledBiteFace(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  latticeCell: PartialBlockLatticeCell,
  normal: PartialBlockPosition,
  corners: readonly PartialBlockPosition[]
): void {
  const center = getFaceCenter(corners);
  const noise = hashUnit(hashPartialBlockCut(cell.block, cell.position, normal, latticeCell.index + 97));
  const signedWrinkle = (noise - 0.35) * PARTIAL_BLOCK_BITE_WRINKLE_DEPTH;
  const wrinkledCenter = {
    x: center.x + normal.x * signedWrinkle,
    y: center.y + normal.y * signedWrinkle,
    z: center.z + normal.z * signedWrinkle
  };

  addTriangleFacingNormal(geometry, cell, corners[0]!, corners[1]!, wrinkledCenter, normal);
  addTriangleFacingNormal(geometry, cell, corners[1]!, corners[2]!, wrinkledCenter, normal);
  addTriangleFacingNormal(geometry, cell, corners[2]!, corners[3]!, wrinkledCenter, normal);
  addTriangleFacingNormal(geometry, cell, corners[3]!, corners[0]!, wrinkledCenter, normal);
}

function addPartialBlockSurfaceGeometry(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  surfaceCells: PartialBlockSurfaceCellMap
): void {
  const grid = createPartialSurfaceGrid(cell, surfaceCells);
  addPartialSurfaceTop(geometry, cell, grid);
  if (!surfaceCells.has(createPartialBlockKey({ x: cell.position.x, y: cell.position.y, z: cell.position.z - 1 }))) {
    addPartialSurfaceSide(geometry, cell, grid, "north");
  }
  if (!surfaceCells.has(createPartialBlockKey({ x: cell.position.x, y: cell.position.y, z: cell.position.z + 1 }))) {
    addPartialSurfaceSide(geometry, cell, grid, "south");
  }
  if (!surfaceCells.has(createPartialBlockKey({ x: cell.position.x - 1, y: cell.position.y, z: cell.position.z }))) {
    addPartialSurfaceSide(geometry, cell, grid, "west");
  }
  if (!surfaceCells.has(createPartialBlockKey({ x: cell.position.x + 1, y: cell.position.y, z: cell.position.z }))) {
    addPartialSurfaceSide(geometry, cell, grid, "east");
  }
}

function createPartialSurfaceGrid(
  cell: PartialBlockCell,
  surfaceCells: PartialBlockSurfaceCellMap
): PartialBlockSurfaceGrid {
  const minX = cell.position.x;
  const maxX = cell.position.x + 1;
  const baseY = cell.position.y;
  const minZ = cell.position.z;
  const maxZ = cell.position.z + 1;
  const heights: number[] = [];

  for (let zIndex = 0; zIndex <= PARTIAL_BLOCK_SURFACE_GRID_STEPS; zIndex += 1) {
    const localZ = zIndex / PARTIAL_BLOCK_SURFACE_GRID_STEPS;
    for (let xIndex = 0; xIndex <= PARTIAL_BLOCK_SURFACE_GRID_STEPS; xIndex += 1) {
      const localX = xIndex / PARTIAL_BLOCK_SURFACE_GRID_STEPS;
      heights.push(getStitchedPartialSurfaceY(cell, surfaceCells, localX, localZ));
    }
  }

  return { minX, maxX, baseY, minZ, maxZ, heights };
}

function getStitchedPartialSurfaceY(
  cell: PartialBlockCell,
  surfaceCells: PartialBlockSurfaceCellMap,
  localX: number,
  localZ: number
): number {
  let y = getPartialSurfaceYAt(cell, localX, localZ);
  if (localX <= PARTIAL_BLOCK_SURFACE_EPSILON) {
    y = Math.max(y, getNeighborPartialSurfaceY(cell, surfaceCells, -1, 0, 1, localZ));
  }
  if (localX >= 1 - PARTIAL_BLOCK_SURFACE_EPSILON) {
    y = Math.max(y, getNeighborPartialSurfaceY(cell, surfaceCells, 1, 0, 0, localZ));
  }
  if (localZ <= PARTIAL_BLOCK_SURFACE_EPSILON) {
    y = Math.max(y, getNeighborPartialSurfaceY(cell, surfaceCells, 0, -1, localX, 1));
  }
  if (localZ >= 1 - PARTIAL_BLOCK_SURFACE_EPSILON) {
    y = Math.max(y, getNeighborPartialSurfaceY(cell, surfaceCells, 0, 1, localX, 0));
  }
  return y;
}

function getNeighborPartialSurfaceY(
  cell: PartialBlockCell,
  surfaceCells: PartialBlockSurfaceCellMap,
  offsetX: number,
  offsetZ: number,
  localX: number,
  localZ: number
): number {
  const neighbor = surfaceCells.get(createPartialBlockKey({
    x: cell.position.x + offsetX,
    y: cell.position.y,
    z: cell.position.z + offsetZ
  }));
  return neighbor ? getPartialSurfaceYAt(neighbor, localX, localZ) : cell.position.y + PARTIAL_BLOCK_SURFACE_MIN_HEIGHT;
}

function addPartialSurfaceTop(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  grid: PartialBlockSurfaceGrid
): void {
  for (let zIndex = 0; zIndex < PARTIAL_BLOCK_SURFACE_GRID_STEPS; zIndex += 1) {
    for (let xIndex = 0; xIndex < PARTIAL_BLOCK_SURFACE_GRID_STEPS; xIndex += 1) {
      const width = grid.maxX - grid.minX;
      const depth = grid.maxZ - grid.minZ;
      const westX = grid.minX + (xIndex / PARTIAL_BLOCK_SURFACE_GRID_STEPS) * width;
      const eastX = grid.minX + ((xIndex + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS) * width;
      const northZ = grid.minZ + (zIndex / PARTIAL_BLOCK_SURFACE_GRID_STEPS) * depth;
      const southZ = grid.minZ + ((zIndex + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS) * depth;
      const northWest: RubbleLikeVertex = [westX, getPartialGridHeight(grid, xIndex, zIndex), northZ];
      const northEast: RubbleLikeVertex = [eastX, getPartialGridHeight(grid, xIndex + 1, zIndex), northZ];
      const southWest: RubbleLikeVertex = [westX, getPartialGridHeight(grid, xIndex, zIndex + 1), southZ];
      const southEast: RubbleLikeVertex = [eastX, getPartialGridHeight(grid, xIndex + 1, zIndex + 1), southZ];
      const noise = hashUnit(
        hashPartialBlockCut(cell.block, cell.position, { x: 0, y: 1, z: 0 }, xIndex + zIndex * 17)
      );
      if (noise > 0.5) {
        addTriangle(geometry, cell, northWest, southWest, southEast);
        addTriangle(geometry, cell, northWest, southEast, northEast);
      } else {
        addTriangle(geometry, cell, northWest, southWest, northEast);
        addTriangle(geometry, cell, northEast, southWest, southEast);
      }
    }
  }
}

function addPartialSurfaceSide(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  grid: PartialBlockSurfaceGrid,
  side: "north" | "south" | "west" | "east"
): void {
  for (let step = 0; step < PARTIAL_BLOCK_SURFACE_GRID_STEPS; step += 1) {
    if (side === "north") {
      const x0 = lerp(grid.minX, grid.maxX, step / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      const x1 = lerp(grid.minX, grid.maxX, (step + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      addQuad(geometry, cell.block, cell.position, { x: 0, y: 0, z: -1 }, [
        { x: x0, y: grid.baseY, z: grid.minZ },
        { x: x0, y: getPartialGridHeight(grid, step, 0), z: grid.minZ },
        { x: x1, y: getPartialGridHeight(grid, step + 1, 0), z: grid.minZ },
        { x: x1, y: grid.baseY, z: grid.minZ }
      ], 1);
      continue;
    }
    if (side === "south") {
      const x0 = lerp(grid.minX, grid.maxX, step / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      const x1 = lerp(grid.minX, grid.maxX, (step + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      addQuad(geometry, cell.block, cell.position, { x: 0, y: 0, z: 1 }, [
        { x: x0, y: grid.baseY, z: grid.maxZ },
        { x: x1, y: grid.baseY, z: grid.maxZ },
        { x: x1, y: getPartialGridHeight(grid, step + 1, PARTIAL_BLOCK_SURFACE_GRID_STEPS), z: grid.maxZ },
        { x: x0, y: getPartialGridHeight(grid, step, PARTIAL_BLOCK_SURFACE_GRID_STEPS), z: grid.maxZ }
      ], 1);
      continue;
    }
    if (side === "west") {
      const z0 = lerp(grid.minZ, grid.maxZ, step / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      const z1 = lerp(grid.minZ, grid.maxZ, (step + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
      addQuad(geometry, cell.block, cell.position, { x: -1, y: 0, z: 0 }, [
        { x: grid.minX, y: grid.baseY, z: z0 },
        { x: grid.minX, y: grid.baseY, z: z1 },
        { x: grid.minX, y: getPartialGridHeight(grid, 0, step + 1), z: z1 },
        { x: grid.minX, y: getPartialGridHeight(grid, 0, step), z: z0 }
      ], 1);
      continue;
    }
    const z0 = lerp(grid.minZ, grid.maxZ, step / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
    const z1 = lerp(grid.minZ, grid.maxZ, (step + 1) / PARTIAL_BLOCK_SURFACE_GRID_STEPS);
    addQuad(geometry, cell.block, cell.position, { x: 1, y: 0, z: 0 }, [
      { x: grid.maxX, y: grid.baseY, z: z0 },
      { x: grid.maxX, y: getPartialGridHeight(grid, PARTIAL_BLOCK_SURFACE_GRID_STEPS, step), z: z0 },
      { x: grid.maxX, y: getPartialGridHeight(grid, PARTIAL_BLOCK_SURFACE_GRID_STEPS, step + 1), z: z1 },
      { x: grid.maxX, y: grid.baseY, z: z1 }
    ], 1);
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

type RubbleLikeVertex = readonly [number, number, number];

function addTriangle(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  first: RubbleLikeVertex,
  second: RubbleLikeVertex,
  third: RubbleLikeVertex
): void {
  const normal = getTriangleNormal(first, second, third);
  const shade = Math.max(0.24, getSunlitFaceShade(normal) * 0.95);
  const color = getTintedBlockColor(createBlockMeshKey(cell.block, cell.position.x, cell.position.y, cell.position.z), shade);
  const base = geometry.positions.length / 3;
  geometry.positions.push(...first, ...second, ...third);
  geometry.normals.push(...normal, ...normal, ...normal);
  geometry.colors.push(...color, ...color, ...color);
  geometry.indices.push(base, base + 1, base + 2);
}

function addTriangleFacingNormal(
  geometry: MutablePartialBlockGeometry,
  cell: PartialBlockCell,
  first: PartialBlockPosition,
  second: PartialBlockPosition,
  third: PartialBlockPosition,
  desiredNormal: PartialBlockPosition
): void {
  const triangleNormal = getTriangleNormal(
    vectorToRubbleVertex(first),
    vectorToRubbleVertex(second),
    vectorToRubbleVertex(third)
  );
  if (dotNormal(triangleNormal, desiredNormal) >= 0) {
    addTriangle(geometry, cell, vectorToRubbleVertex(first), vectorToRubbleVertex(second), vectorToRubbleVertex(third));
  } else {
    addTriangle(geometry, cell, vectorToRubbleVertex(first), vectorToRubbleVertex(third), vectorToRubbleVertex(second));
  }
}

function vectorToRubbleVertex(position: PartialBlockPosition): RubbleLikeVertex {
  return [position.x, position.y, position.z];
}

function getTriangleNormal(
  first: RubbleLikeVertex,
  second: RubbleLikeVertex,
  third: RubbleLikeVertex
): [number, number, number] {
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
  if (length <= PARTIAL_BLOCK_SURFACE_EPSILON) return [0, 1, 0];
  return [nx / length, ny / length, nz / length];
}

function dotNormal(left: readonly [number, number, number], right: PartialBlockPosition): number {
  return left[0] * right.x + left[1] * right.y + left[2] * right.z;
}

function getFaceCenter(corners: readonly PartialBlockPosition[]): PartialBlockPosition {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const corner of corners) {
    x += corner.x;
    y += corner.y;
    z += corner.z;
  }
  const scale = 1 / Math.max(1, corners.length);
  return { x: x * scale, y: y * scale, z: z * scale };
}

function getPartialBlockLatticeCellIndex(x: number, y: number, z: number): number | null {
  if (
    x < 0 ||
    y < 0 ||
    z < 0 ||
    x >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ||
    y >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ||
    z >= PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE
  ) {
    return null;
  }
  return x + y * PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE + z * PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE ** 2;
}

function getPartialBlockLatticeFaceCorners(
  position: PartialBlockPosition,
  cell: PartialBlockLatticeCell,
  normal: PartialBlockPosition
): readonly PartialBlockPosition[] {
  const minX = position.x + cell.x * PARTIAL_BLOCK_LATTICE_CELL_SIZE;
  const maxX = minX + PARTIAL_BLOCK_LATTICE_CELL_SIZE;
  const minY = position.y + cell.y * PARTIAL_BLOCK_LATTICE_CELL_SIZE;
  const maxY = minY + PARTIAL_BLOCK_LATTICE_CELL_SIZE;
  const minZ = position.z + cell.z * PARTIAL_BLOCK_LATTICE_CELL_SIZE;
  const maxZ = minZ + PARTIAL_BLOCK_LATTICE_CELL_SIZE;

  if (normal.x > 0) {
    return [
      { x: maxX, y: minY, z: minZ },
      { x: maxX, y: maxY, z: minZ },
      { x: maxX, y: maxY, z: maxZ },
      { x: maxX, y: minY, z: maxZ }
    ];
  }
  if (normal.x < 0) {
    return [
      { x: minX, y: minY, z: maxZ },
      { x: minX, y: maxY, z: maxZ },
      { x: minX, y: maxY, z: minZ },
      { x: minX, y: minY, z: minZ }
    ];
  }
  if (normal.y > 0) {
    return [
      { x: minX, y: maxY, z: maxZ },
      { x: maxX, y: maxY, z: maxZ },
      { x: maxX, y: maxY, z: minZ },
      { x: minX, y: maxY, z: minZ }
    ];
  }
  if (normal.y < 0) {
    return [
      { x: minX, y: minY, z: minZ },
      { x: maxX, y: minY, z: minZ },
      { x: maxX, y: minY, z: maxZ },
      { x: minX, y: minY, z: maxZ }
    ];
  }
  if (normal.z > 0) {
    return [
      { x: maxX, y: minY, z: maxZ },
      { x: maxX, y: maxY, z: maxZ },
      { x: minX, y: maxY, z: maxZ },
      { x: minX, y: minY, z: maxZ }
    ];
  }
  return [
    { x: minX, y: minY, z: minZ },
    { x: minX, y: maxY, z: minZ },
    { x: maxX, y: maxY, z: minZ },
    { x: maxX, y: minY, z: minZ }
  ];
}

function getPartialGridHeight(grid: PartialBlockSurfaceGrid, xIndex: number, zIndex: number): number {
  return grid.heights[xIndex + (PARTIAL_BLOCK_SURFACE_GRID_STEPS + 1) * zIndex] ?? grid.baseY;
}

function getPartialSurfaceYAt(cell: PartialBlockCell, localX: number, localZ: number): number {
  const samples = cell.surfaceSamples ?? [];
  let height = PARTIAL_BLOCK_SURFACE_EDGE_HEIGHT;
  for (const sample of samples) {
    const distance = Math.hypot(clamp01(localX) - sample.localX, clamp01(localZ) - sample.localZ);
    height = Math.max(height, sample.height - distance * PARTIAL_BLOCK_SURFACE_SAMPLE_FALLOFF * sample.weight);
  }
  return cell.position.y + clamp(height, PARTIAL_BLOCK_SURFACE_MIN_HEIGHT, PARTIAL_BLOCK_SURFACE_MAX_HEIGHT);
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
    const cutInward = sampleCutInward(face, cut, u, v);
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

function sampleCutInward(face: PartialBlockFace, cut: PartialBlockCut, u: number, v: number): number {
  const faceAlignment = dotPosition(face.normal, cut.normal);
  if (faceAlignment < PARTIAL_BLOCK_OPPOSITE_FACE_DOT_CUTOFF) return 0;

  const localPoint = localFacePoint(face, u, v, 0);
  const distance = Math.hypot(
    localPoint.x - cut.localPoint.x,
    localPoint.y - cut.localPoint.y,
    localPoint.z - cut.localPoint.z
  );
  const isImpactFace = faceAlignment > 0.5;
  const radius = cut.radius * (isImpactFace ? 1 : PARTIAL_BLOCK_ADJACENT_FACE_RADIUS_SCALE);
  const normalizedDistance = distance / Math.max(0.001, radius);
  if (normalizedDistance >= 1) return 0;

  // Treat each hit as a tiny bite volume, not a flat decal. The struck face gets
  // the full indentation, while adjacent exposed faces get a softer pull so
  // edge and corner impacts visibly remove part of the block silhouette.
  const faceStrength = isImpactFace ? 1 : PARTIAL_BLOCK_ADJACENT_FACE_STRENGTH;
  const falloff = (1 - normalizedDistance * normalizedDistance) ** 2;
  const lumpyNoise = 0.82 + hashUnit(
    cut.seed ^ (Math.floor(u * 37) * 73856093) ^ (Math.floor(v * 41) * 19349663)
  ) * 0.28;
  return Math.min(PARTIAL_BLOCK_MAX_DEPTH, cut.depth * faceStrength * falloff * lumpyNoise);
}

function canCutAffectFace(cut: PartialBlockCut, face: PartialBlockFace): boolean {
  if (dotPosition(face.normal, cut.normal) < PARTIAL_BLOCK_OPPOSITE_FACE_DOT_CUTOFF) return false;

  const facePlaneDistance = Math.abs(
    dotPosition(cut.localPoint, face.normal) - dotPosition(face.localOrigin, face.normal)
  );
  return facePlaneDistance <= cut.radius * 1.15;
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
  const localPoint = localFacePoint(face, u, v, inward);
  return {
    x: blockPosition.x + localPoint.x,
    y: blockPosition.y + localPoint.y,
    z: blockPosition.z + localPoint.z
  };
}

function localFacePoint(
  face: PartialBlockFace,
  u: number,
  v: number,
  inward: number
): PartialBlockPosition {
  return {
    x: face.localOrigin.x + face.tangent.x * u + face.bitangent.x * v - face.normal.x * inward,
    y: face.localOrigin.y + face.tangent.y * u + face.bitangent.y * v - face.normal.y * inward,
    z: face.localOrigin.z + face.tangent.z * u + face.bitangent.z * v - face.normal.z * inward
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

function normalizeDirection(direction: Pick<THREE.Vector3, "x" | "y" | "z"> | undefined): PartialBlockPosition | null {
  if (!direction) return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length <= PARTIAL_BLOCK_SURFACE_EPSILON) return null;
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length
  };
}

function dotPosition(left: PartialBlockPosition, right: PartialBlockPosition): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function distanceSq(left: PartialBlockPosition, right: PartialBlockPosition): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
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
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

const PARTIAL_BLOCK_LATTICE_FACES: readonly {
  readonly normal: PartialBlockPosition;
  readonly offset: PartialBlockPosition;
}[] = PARTIAL_BLOCK_FACES.map((face) => ({
  normal: face.normal,
  offset: face.normal
}));

const PARTIAL_BLOCK_LATTICE_CELLS: readonly PartialBlockLatticeCell[] = createPartialBlockLatticeCells();

function createPartialBlockLatticeCells(): PartialBlockLatticeCell[] {
  const cells: PartialBlockLatticeCell[] = [];
  for (let z = 0; z < PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE; z += 1) {
    for (let y = 0; y < PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE; y += 1) {
      for (let x = 0; x < PARTIAL_BLOCK_DAMAGE_LATTICE_SIZE; x += 1) {
        const index = getPartialBlockLatticeCellIndex(x, y, z);
        if (index === null) continue;
        cells.push({
          x,
          y,
          z,
          index,
          center: {
            x: (x + 0.5) * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
            y: (y + 0.5) * PARTIAL_BLOCK_LATTICE_CELL_SIZE,
            z: (z + 0.5) * PARTIAL_BLOCK_LATTICE_CELL_SIZE
          }
        });
      }
    }
  }
  return cells;
}
