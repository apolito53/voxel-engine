import * as THREE from "three";
import { BLOCK_FRAGMENT_VISUAL_SIZE, BLOCK_RUBBLE_MATERIAL_UNITS } from "./blockFragments";
import { BLOCK } from "./blocks";
import type { CollisionBounds } from "./collision";
import {
  BLOCK_DAMAGE_IMPACT_SPEED,
  PHYSICS_CORE_BLOCK_DAMAGE,
  getFragmentMaterial,
  type PhysicsToy
} from "./physics";

const RUBBLE_CELL_SIZE = 1;
const RUBBLE_MAX_VISUAL_PIECES = 36;
const RUBBLE_MAX_VISUAL_CHUNKS_PER_PILE = 18;
// Promotion intentionally needs more material than the visible pile cap and a
// single 27-piece block fracture. Piles can keep accruing hidden material after
// the proxy mesh stops growing, so craters do not seal from one normal break.
export const RUBBLE_BLOCK_PROMOTION_PIECES = 48;
const RUBBLE_MAX_PATCH_CELLS = 18;
// `pieces` is material volume for cover shape/promotion; health is gameplay
// durability. A full block fracture produces 27 material units, but it should
// not also create a 27-HP object when ordinary terrain has 2-3 HP.
export const RUBBLE_FULL_BLOCK_HEALTH = 3;
const RUBBLE_PIECE_HEALTH = RUBBLE_FULL_BLOCK_HEALTH / BLOCK_RUBBLE_MATERIAL_UNITS;
const RUBBLE_NEARBY_SEARCH_PADDING = 1.25;
const RUBBLE_MIN_HEIGHT = 0.04;
const RUBBLE_HEIGHT_PER_ROOT_PIECE = 0.032;
const RUBBLE_HEIGHT_VARIATION = 0.03;
const RUBBLE_MAX_HEIGHT = 0.5;
const RUBBLE_SOLID_NEIGHBOR_CORNER_RISE = 0.08;
const RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE = 0.06;
const RUBBLE_SUPPORTED_CORNER_RISE_SCALE = 0.4;
const RUBBLE_MAX_SURFACE_SAMPLES_PER_PILE = 24;
const RUBBLE_SURFACE_SAMPLE_HEIGHT_PADDING = BLOCK_FRAGMENT_VISUAL_SIZE * 0.58;
const RUBBLE_SURFACE_SAMPLE_HEIGHT_VARIATION = 0.08;
const RUBBLE_SURFACE_PEAK_VARIATION = 0.12;
const RUBBLE_SURFACE_SAMPLE_FALLOFF = 0.46;
const RUBBLE_SURFACE_EDGE_FLOOR_SCALE = 0.58;
const RUBBLE_SURFACE_GRID_STEPS = 4;
const RUBBLE_MIN_FOOTPRINT_RADIUS = 0.12;
const RUBBLE_MAX_FOOTPRINT_RADIUS = 0.58;
// Rubble should behave like rough cover, but cores are still supposed to read
// as bouncy projectiles. Keep the rebound near terrain-block bounce strength
// so piles feel physical without turning the launcher into a glue gun.
const RUBBLE_CORE_RESTITUTION = 1.55;
const RUBBLE_CORE_DAMPING = 0.95;
const RUBBLE_COLLISION_EPSILON = 0.000001;
const RUBBLE_NEIGHBOR_CHIP_DAMAGE = 0.25;

type RubbleCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type RubbleCellPile = {
  readonly cell: RubbleCell;
  readonly surfaceSamples: RubbleSurfaceSample[];
  readonly visualChunks: RubbleStoredVisualChunkSample[];
  pieces: number;
  health: number;
};

type RubbleSurfaceSample = {
  readonly localX: number;
  readonly localZ: number;
  readonly height: number;
  readonly weight: number;
};

type RubbleStoredVisualChunkSample = {
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  readonly quaternion: THREE.Quaternion;
  readonly size: number;
};

type RubbleCluster = {
  readonly id: number;
  readonly block: number;
  readonly cells: Map<string, RubbleCellPile>;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly bounds: THREE.Box3;
  pieces: number;
  health: number;
};

type RubbleQuadVertex = readonly [number, number, number];
type RubbleLocalFootprint = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};
type RubbleSurfaceGrid = {
  readonly minX: number;
  readonly maxX: number;
  readonly baseY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly heights: readonly number[];
  readonly maxY: number;
};
type RubbleDamageTarget = {
  readonly cluster: RubbleCluster;
  readonly pile: RubbleCellPile;
  readonly distanceSq: number;
};

export type RubbleFieldWorld = {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, block: number): void;
  isSolid(x: number, y: number, z: number): boolean;
};

export type RubbleFieldStats = {
  readonly clusters: number;
  readonly pieces: number;
  readonly health: number;
  readonly maxCoverHeight: number;
  readonly visualChunks: number;
};

export type RubbleVisualChunkSample = {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly size: number;
};

export type RubbleAbsorptionSample = {
  readonly block: number;
  readonly position: THREE.Vector3;
  readonly pieces?: number;
  readonly visualChunk?: RubbleVisualChunkSample;
};

export type RubbleRaycastHit = {
  readonly clusterId: number;
  readonly block: number;
  readonly distance: number;
  readonly point: THREE.Vector3;
};

export type RubbleDamageEvent = {
  readonly cell: RubbleCell;
  readonly position: THREE.Vector3;
  readonly block: number;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly destroyed: boolean;
  readonly collateral: boolean;
};

const EMPTY_RUBBLE_STATS: RubbleFieldStats = {
  clusters: 0,
  pieces: 0,
  health: 0,
  maxCoverHeight: 0,
  visualChunks: 0
};

const HORIZONTAL_NEIGHBOR_OFFSETS: readonly RubbleCell[] = [
  { x: -1, y: 0, z: -1 },
  { x: 0, y: 0, z: -1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 0, z: 1 }
];

export class RubbleField {
  private readonly scene: THREE.Scene;
  private readonly clustersById = new Map<number, RubbleCluster>();
  private readonly clustersByCell = new Map<string, RubbleCluster>();
  private readonly dirtyClusters = new Set<RubbleCluster>();
  private readonly sphereClosestPoint = new THREE.Vector3();
  private readonly sphereDelta = new THREE.Vector3();
  private readonly pileClosestPoint = new THREE.Vector3();
  private readonly fallbackNormal = new THREE.Vector3(0, 1, 0);
  private readonly rayInverseDirection = new THREE.Vector3();
  private readonly damageEvents: RubbleDamageEvent[] = [];
  private surfaceWorld: RubbleFieldWorld | null = null;
  private stats: RubbleFieldStats = EMPTY_RUBBLE_STATS;
  private nextClusterId = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  getStats(): RubbleFieldStats {
    this.flushDirtyClusterMeshes();
    this.refreshStats();
    return this.stats;
  }

  absorbFragment(fragment: PhysicsToy): boolean {
    if (!fragment.isInstancedFragment || fragment.fragmentBlock === null) {
      return false;
    }

    this.absorbBatch([{
      block: fragment.fragmentBlock,
      position: fragment.mesh.position.clone(),
      pieces: fragment.rubbleMaterialUnits,
      visualChunk: createRubbleVisualChunkSample(fragment)
    }]);
    return true;
  }

  absorb(block: number, position: THREE.Vector3, pieces = 1): void {
    // Settled shards become cell piles, and adjacent piles are stitched into a
    // capped patch. That keeps rubble readable as debris fields instead of
    // rendering hundreds of tiny standalone boxes.
    const normalizedPieces = normalizeRubblePieceCount(pieces);
    const cell = getRubbleCell(position);
      this.absorbPileAtCell(
        block,
        cell,
        normalizedPieces,
        normalizedPieces * RUBBLE_PIECE_HEALTH,
        createRubbleSurfaceSamples(cell, position, normalizedPieces),
        []
      );
    this.refreshStats();
  }

  absorbBatch(samples: readonly RubbleAbsorptionSample[]): void {
    // A settling region deposits its whole surface sample set at once. That
    // keeps the final mesh cheap and connected without refreshing stats after
    // every individual temporary fragment.
    for (const sample of samples) {
      const normalizedPieces = normalizeRubblePieceCount(sample.pieces ?? 1);
      const cell = getRubbleCell(sample.position);
      this.absorbPileAtCell(
        sample.block,
        cell,
        normalizedPieces,
        normalizedPieces * RUBBLE_PIECE_HEALTH,
        createRubbleSurfaceSamples(cell, sample.position, normalizedPieces),
        sample.visualChunk
          ? [createStoredVisualChunkSample(cell, sample.visualChunk)]
          : []
      );
    }
    this.refreshStats();
  }

  settle(world: RubbleFieldWorld): void {
    this.surfaceWorld = world;
    this.flushDirtyClusterMeshes();
    const clusters = Array.from(this.clustersById.values()).sort(compareClustersForFalling);
    let changed = false;

    for (const cluster of clusters) {
      if (!this.clustersById.has(cluster.id)) continue;

      const unsupportedPiles = Array.from(cluster.cells.values()).filter(
        (pile) => !this.hasPileTerrainSupport(world, pile)
      );

      if (unsupportedPiles.length === 0) {
        changed = this.promoteLargePiles(world, cluster) || changed;
        continue;
      }

      for (const pile of unsupportedPiles) {
        if (this.clustersByCell.get(getRubbleCellCoordinateKey(pile.cell)) !== cluster) continue;

        // Unsupported parts of a broad patch break away one cell at a time.
        // This keeps falling rubble cheap while preventing giant multi-cell
        // sheets from hovering when only part of their support was destroyed.
        const fallingPile = clonePile(pile);
        this.detachPile(cluster, pile);
        const landedCluster = this.absorbPileAtCell(
          cluster.block,
          getRubbleCellBelow(fallingPile.cell),
          fallingPile.pieces,
          fallingPile.health,
          fallingPile.surfaceSamples,
          fallingPile.visualChunks
        );
        this.promoteLargePiles(world, landedCluster);
        changed = true;
      }
    }

    if (changed) this.refreshStats();
  }

  getSupportHeight(bounds: CollisionBounds): number | null {
    this.flushDirtyClusterMeshes();
    const minX = Math.floor(bounds.minX);
    const maxX = Math.floor(bounds.maxX - RUBBLE_COLLISION_EPSILON);
    const minY = Math.floor(bounds.minY - RUBBLE_MAX_HEIGHT - RUBBLE_COLLISION_EPSILON);
    const maxY = Math.floor(bounds.maxY);
    const minZ = Math.floor(bounds.minZ);
    const maxZ = Math.floor(bounds.maxZ - RUBBLE_COLLISION_EPSILON);
    let supportY: number | null = null;

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const cluster = this.clustersByCell.get(getRubbleCellCoordinateKey({ x, y, z }));
          const pile = cluster?.cells.get(getRubbleCellCoordinateKey({ x, y, z }));
          if (!cluster || !pile || !boundsOverlapPileHorizontally(bounds, pile)) continue;

          const pileSupportY = getPileSupportHeight(cluster, pile, bounds, this.surfaceWorld);
          if (pileSupportY === null || pileSupportY > bounds.maxY + RUBBLE_COLLISION_EPSILON) {
            continue;
          }
          supportY = supportY === null ? pileSupportY : Math.max(supportY, pileSupportY);
        }
      }
    }

    return supportY;
  }

  resolveCoreCollision(core: PhysicsToy): boolean {
    if (!core.damagesBlocks || core.isExpired || core.isSleeping) {
      return false;
    }

    this.flushDirtyClusterMeshes();

    // Only thrown cores interact with rubble for this first gameplay pass.
    // Debris settling into debris would recreate the expensive pile behavior
    // we removed from the physics broadphase.
    let collided = false;
    const corePosition = core.mesh.position;
    for (const cluster of this.getNearbyClusters(corePosition, core.radius + RUBBLE_NEARBY_SEARCH_PADDING)) {
      if (core.isExpired) break;
      if (this.resolveCoreClusterCollision(core, cluster)) {
        collided = true;
      }
    }
    return collided;
  }

  damageNearest(position: THREE.Vector3, amount: number, radius = 1.2): boolean {
    this.flushDirtyClusterMeshes();
    const nearestTarget = this.findNearestPileDamageTarget(position, radius);

    if (!nearestTarget) return false;
    this.damageClusterFromPile(nearestTarget.cluster, nearestTarget.pile, amount);
    return true;
  }

  consumeDamageEvents(): RubbleDamageEvent[] {
    const events = this.damageEvents.map((event) => ({
      ...event,
      cell: { ...event.cell },
      position: event.position.clone()
    }));
    this.damageEvents.length = 0;
    return events;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RubbleRaycastHit | null {
    this.flushDirtyClusterMeshes();
    let closestHit: RubbleRaycastHit | null = null;

    // The shooter-facing contract is intentionally simple: cover proxies can
    // participate in line tests without making every visible shard queryable.
    this.rayInverseDirection.set(
      direction.x === 0 ? Number.POSITIVE_INFINITY : 1 / direction.x,
      direction.y === 0 ? Number.POSITIVE_INFINITY : 1 / direction.y,
      direction.z === 0 ? Number.POSITIVE_INFINITY : 1 / direction.z
    );

    for (const cluster of this.clustersById.values()) {
      for (const pile of cluster.cells.values()) {
        const distance = intersectRayWithPile(
          origin,
          direction,
          this.rayInverseDirection,
          pile,
          maxDistance
        );
        if (distance === null) continue;
        if (closestHit && distance >= closestHit.distance) continue;

        closestHit = {
          clusterId: cluster.id,
          block: cluster.block,
          distance,
          point: origin.clone().addScaledVector(direction, distance)
        };
      }
    }

    return closestHit;
  }

  clear(): void {
    for (const cluster of Array.from(this.clustersById.values())) {
      this.removeCluster(cluster);
    }
    this.damageEvents.length = 0;
    this.surfaceWorld = null;
    this.stats = EMPTY_RUBBLE_STATS;
  }

  dispose(): void {
    this.clear();
  }

  private createCluster(block: number): RubbleCluster {
    const id = this.nextClusterId;
    this.nextClusterId += 1;

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), getFragmentMaterial(block));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `Rubble patch ${id}`;
    this.scene.add(mesh);

    const cluster: RubbleCluster = {
      id,
      block,
      cells: new Map(),
      mesh,
      bounds: new THREE.Box3(),
      pieces: 0,
      health: 0
    };
    this.clustersById.set(cluster.id, cluster);
    return cluster;
  }

  private absorbPileAtCell(
    block: number,
    cell: RubbleCell,
    pieces: number,
    health: number,
    surfaceSamples: readonly RubbleSurfaceSample[] = [],
    visualChunks: readonly RubbleStoredVisualChunkSample[] = []
  ): RubbleCluster {
    const existingCluster = this.clustersByCell.get(getRubbleCellCoordinateKey(cell));
    if (existingCluster) {
      this.addPileToCluster(existingCluster, cell, pieces, health, surfaceSamples, visualChunks);
      this.mergeAdjacentClusters(existingCluster);
      return existingCluster;
    }

    const mergeCandidates = this.getAdjacentClustersForCell(cell)
      .filter((cluster) => this.canAddNewCell(cluster, cell));
    const targetCluster = chooseRubbleMergeTarget(mergeCandidates, block) ?? this.createCluster(block);

    this.addPileToCluster(targetCluster, cell, pieces, health, surfaceSamples, visualChunks);
    this.mergeAdjacentClusters(targetCluster);
    return targetCluster;
  }

  private addPileToCluster(
    cluster: RubbleCluster,
    cell: RubbleCell,
    pieces: number,
    health: number,
    surfaceSamples: readonly RubbleSurfaceSample[] = [],
    visualChunks: readonly RubbleStoredVisualChunkSample[] = []
  ): void {
    const key = getRubbleCellCoordinateKey(cell);
    const pile = cluster.cells.get(key);
    if (pile) {
      pile.pieces += pieces;
      pile.health += health;
      appendRubbleSurfaceSamples(pile, surfaceSamples);
      appendRubbleVisualChunks(pile, visualChunks);
    } else {
      cluster.cells.set(key, {
        cell,
        pieces,
        health,
        surfaceSamples: surfaceSamples.map((sample) => ({ ...sample })),
        visualChunks: visualChunks.map(cloneStoredVisualChunkSample)
      });
      this.clustersByCell.set(key, cluster);
    }

    cluster.pieces += pieces;
    cluster.health += health;
    this.markClusterDirty(cluster);
  }

  private mergeAdjacentClusters(target: RubbleCluster): void {
    let merged = true;

    // Re-run until stable because adding one neighbor can expose another.
    // The cap keeps a whole crater from becoming one enormous inaccurate AABB.
    while (merged) {
      merged = false;
      for (const candidate of this.getAdjacentClustersForCluster(target)) {
        if (candidate === target) continue;
        if (!this.canMergeClusters(target, candidate)) continue;

        this.mergeClusters(target, candidate);
        merged = true;
        break;
      }
    }
  }

  private updateClusterMesh(cluster: RubbleCluster): void {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const bounds = new THREE.Box3();

    // Build one low patch mesh out of all occupied cells. Internal vertical
    // faces are skipped, so adjacent piles read as connected rubble instead of
    // separate stacked tiles.
    for (const pile of cluster.cells.values()) {
      const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
      const footprint = getRubblePileFootprint(pile);
      const surfaceGrid = createRubbleSurfaceGrid(cluster, pile, this.surfaceWorld, footprint);

      bounds.expandByPoint(new THREE.Vector3(surfaceGrid.minX, baseY, surfaceGrid.minZ));
      bounds.expandByPoint(new THREE.Vector3(surfaceGrid.maxX, surfaceGrid.maxY, surfaceGrid.maxZ));

      addRubbleTopSurface(positions, normals, indices, surfaceGrid, pile);
      addQuad(
        positions,
        normals,
        indices,
        [surfaceGrid.minX, baseY, surfaceGrid.minZ],
        [surfaceGrid.maxX, baseY, surfaceGrid.minZ],
        [surfaceGrid.maxX, baseY, surfaceGrid.maxZ],
        [surfaceGrid.minX, baseY, surfaceGrid.maxZ],
        [0, -1, 0]
      );

      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x, y: pile.cell.y, z: pile.cell.z - 1 }))) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "north");
      } else if (footprint.minZ > RUBBLE_COLLISION_EPSILON) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "north");
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x, y: pile.cell.y, z: pile.cell.z + 1 }))) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "south");
      } else if (footprint.maxZ < 1 - RUBBLE_COLLISION_EPSILON) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "south");
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x - 1, y: pile.cell.y, z: pile.cell.z }))) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "west");
      } else if (footprint.minX > RUBBLE_COLLISION_EPSILON) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "west");
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x + 1, y: pile.cell.y, z: pile.cell.z }))) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "east");
      } else if (footprint.maxX < 1 - RUBBLE_COLLISION_EPSILON) {
        addRubbleBoundarySide(positions, normals, indices, surfaceGrid, "east");
      }

      addRubbleVisualChunks(positions, normals, indices, bounds, pile);
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    cluster.mesh.geometry.dispose();
    cluster.mesh.geometry = geometry;
    cluster.mesh.updateMatrixWorld();
    cluster.bounds.copy(bounds);
  }

  private resolveCoreClusterCollision(core: PhysicsToy, cluster: RubbleCluster): boolean {
    const corePosition = core.mesh.position;
    const targetPile = this.findCoreCollisionPile(core, cluster);
    if (!targetPile) return false;

    const distanceSq = this.sphereDelta.copy(corePosition).sub(this.sphereClosestPoint).lengthSq();

    const distance = Math.sqrt(distanceSq);
    const normal = distance > RUBBLE_COLLISION_EPSILON
      ? this.sphereDelta.multiplyScalar(1 / distance)
      : this.fallbackNormal.copy(core.velocity).multiplyScalar(-1).normalize();
    if (normal.lengthSq() <= RUBBLE_COLLISION_EPSILON) {
      normal.set(0, 1, 0);
    }

    corePosition.addScaledVector(normal, core.radius - distance + 0.001);
    const impact = core.velocity.dot(normal);
    if (impact < 0) {
      const impactSpeed = -impact;
      // Bounce the core so rubble reads as physically present, then chip the
      // cover only for meaningful impacts using the same speed gate as blocks.
      core.velocity.addScaledVector(normal, -impact * RUBBLE_CORE_RESTITUTION);
      core.velocity.multiplyScalar(RUBBLE_CORE_DAMPING);
      if (impactSpeed > BLOCK_DAMAGE_IMPACT_SPEED) {
        const destroyedImpactedPile = this.damageClusterFromPile(cluster, targetPile, PHYSICS_CORE_BLOCK_DAMAGE);
        if (destroyedImpactedPile) core.expire();
      }
    }

    return true;
  }

  private damageClusterFromPile(
    cluster: RubbleCluster,
    targetPile: RubbleCellPile,
    amount: number
  ): boolean {
    const hitHealthBefore = targetPile.health;
    const hitDamage = Math.min(targetPile.health, Math.max(0, amount));
    targetPile.health -= hitDamage;
    targetPile.pieces = Math.ceil(targetPile.health / RUBBLE_PIECE_HEALTH);

    const destroyedTargetPile = targetPile.health <= RUBBLE_COLLISION_EPSILON || targetPile.pieces <= 0;
    this.recordDamageEvent(cluster.block, targetPile, hitHealthBefore, destroyedTargetPile, false);

    if (destroyedTargetPile) {
      const destroyedCell = targetPile.cell;
      const key = getRubbleCellCoordinateKey(destroyedCell);
      cluster.cells.delete(key);
      if (this.clustersByCell.get(key) === cluster) {
        this.clustersByCell.delete(key);
      }
      this.chipAdjacentPiles(cluster, destroyedCell);
    }

    if (cluster.cells.size === 0) {
      this.removeCluster(cluster);
    } else {
      this.recomputeClusterTotals(cluster);
      this.markClusterDirty(cluster);
    }
    this.refreshStats();
    return destroyedTargetPile;
  }

  private chipAdjacentPiles(cluster: RubbleCluster, destroyedCell: RubbleCell): void {
    // A destroyed pile can kick a little material out of immediate neighbors,
    // but it should never keep spending the original core's huge damage through
    // the whole merged patch. Connected rubble is visual/topological, not one
    // shared hit-point bucket.
    for (const pile of cluster.cells.values()) {
      if (!areHorizontalNeighborCells(destroyedCell, pile.cell)) continue;
      if (pile.health <= RUBBLE_COLLISION_EPSILON) continue;

      const healthBefore = pile.health;
      const chipDamage = Math.min(RUBBLE_NEIGHBOR_CHIP_DAMAGE, Math.max(0, pile.health - RUBBLE_COLLISION_EPSILON));
      if (chipDamage <= 0) continue;

      pile.health = Math.max(RUBBLE_COLLISION_EPSILON, pile.health - chipDamage);
      pile.pieces = Math.max(1, Math.ceil(pile.health / RUBBLE_PIECE_HEALTH));
      this.recordDamageEvent(cluster.block, pile, healthBefore, false, true);
    }
  }

  private recordDamageEvent(
    block: number,
    pile: RubbleCellPile,
    healthBefore: number,
    destroyed: boolean,
    collateral: boolean
  ): void {
    this.damageEvents.push({
      cell: pile.cell,
      position: getRubblePileDamageIndicatorPosition(pile),
      block,
      remainingHealth: Math.max(0, pile.health),
      maxHealth: Math.max(healthBefore, RUBBLE_COLLISION_EPSILON),
      destroyed,
      collateral
    });
  }

  private findNearestPileDamageTarget(position: THREE.Vector3, radius: number): RubbleDamageTarget | null {
    let nearestTarget: RubbleDamageTarget | null = null;
    let nearestDistanceSq = radius * radius;

    // Damage must target the cell actually hit, not the merged patch's broad
    // bounds. Otherwise a wide patch can appear to take damage in random cells.
    for (const cluster of this.getNearbyClusters(position, radius + RUBBLE_NEARBY_SEARCH_PADDING)) {
      for (const pile of cluster.cells.values()) {
        const distanceSq = getPointPileDistanceSq(position, pile);
        if (distanceSq > nearestDistanceSq) continue;

        nearestDistanceSq = distanceSq;
        nearestTarget = { cluster, pile, distanceSq };
      }
    }

    return nearestTarget;
  }

  private findCoreCollisionPile(core: PhysicsToy, cluster: RubbleCluster): RubbleCellPile | null {
    const corePosition = core.mesh.position;
    let closestPile: RubbleCellPile | null = null;
    let closestDistanceSq = core.radius * core.radius;

    // Resolve against the nearest occupied pile cell. The cluster AABB is only
    // a coarse lookup bound and can include empty space between merged cells.
    for (const pile of cluster.cells.values()) {
      const distanceSq = setClosestPointOnPile(corePosition, pile, this.pileClosestPoint);
      if (distanceSq >= closestDistanceSq) continue;

      closestDistanceSq = distanceSq;
      closestPile = pile;
      this.sphereClosestPoint.copy(this.pileClosestPoint);
    }

    return closestPile;
  }

  private removeCluster(cluster: RubbleCluster): void {
    this.scene.remove(cluster.mesh);
    cluster.mesh.geometry.dispose();
    this.clustersById.delete(cluster.id);
    this.dirtyClusters.delete(cluster);
    for (const key of cluster.cells.keys()) {
      if (this.clustersByCell.get(key) === cluster) {
        this.clustersByCell.delete(key);
      }
    }
  }

  private detachPile(cluster: RubbleCluster, pile: RubbleCellPile): void {
    const key = getRubbleCellCoordinateKey(pile.cell);
    cluster.cells.delete(key);
    if (this.clustersByCell.get(key) === cluster) {
      this.clustersByCell.delete(key);
    }

    if (cluster.cells.size === 0) {
      this.removeCluster(cluster);
    } else {
      this.recomputeClusterTotals(cluster);
      this.markClusterDirty(cluster);
    }
  }

  private hasPileTerrainSupport(world: RubbleFieldWorld, pile: RubbleCellPile): boolean {
    return world.isSolid(pile.cell.x, pile.cell.y - 1, pile.cell.z);
  }

  private promoteLargePiles(world: RubbleFieldWorld, cluster: RubbleCluster): boolean {
    let changed = false;

    for (const pile of Array.from(cluster.cells.values())) {
      if (pile.pieces < RUBBLE_BLOCK_PROMOTION_PIECES) continue;
      if (!this.hasPileTerrainSupport(world, pile)) continue;
      if (world.getBlock(pile.cell.x, pile.cell.y, pile.cell.z) !== BLOCK.air) continue;

      // Promotion is per occupied cell, not per patch. A broad patch can keep
      // acting as cover while only truly dense cells graduate into terrain.
      world.setBlock(pile.cell.x, pile.cell.y, pile.cell.z, BLOCK.rubble);
      const key = getRubbleCellCoordinateKey(pile.cell);
      cluster.cells.delete(key);
      if (this.clustersByCell.get(key) === cluster) {
        this.clustersByCell.delete(key);
      }
      changed = true;
    }

    if (!changed) return false;
    if (cluster.cells.size === 0) {
      this.removeCluster(cluster);
    } else {
      this.recomputeClusterTotals(cluster);
      this.markClusterDirty(cluster);
    }
    return true;
  }

  private mergeClusters(target: RubbleCluster, source: RubbleCluster): void {
    for (const [key, pile] of source.cells.entries()) {
      target.cells.set(key, pile);
      this.clustersByCell.set(key, target);
    }
    this.recomputeClusterTotals(target);
    this.scene.remove(source.mesh);
    source.mesh.geometry.dispose();
    this.clustersById.delete(source.id);
    this.dirtyClusters.delete(source);
    this.markClusterDirty(target);
  }

  private getNearbyClusters(position: THREE.Vector3, radius: number): RubbleCluster[] {
    const minX = Math.floor((position.x - radius) / RUBBLE_CELL_SIZE);
    const maxX = Math.floor((position.x + radius) / RUBBLE_CELL_SIZE);
    const minY = Math.floor((position.y - radius) / RUBBLE_CELL_SIZE);
    const maxY = Math.floor((position.y + radius) / RUBBLE_CELL_SIZE);
    const minZ = Math.floor((position.z - radius) / RUBBLE_CELL_SIZE);
    const maxZ = Math.floor((position.z + radius) / RUBBLE_CELL_SIZE);
    const clusters = new Set<RubbleCluster>();

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const cluster = this.clustersByCell.get(getRubbleCellCoordinateKey({ x, y, z }));
          if (cluster) clusters.add(cluster);
        }
      }
    }

    return Array.from(clusters);
  }

  private getAdjacentClustersForCell(cell: RubbleCell): RubbleCluster[] {
    const clusters = new Set<RubbleCluster>();
    for (const offset of HORIZONTAL_NEIGHBOR_OFFSETS) {
      const cluster = this.clustersByCell.get(getRubbleCellCoordinateKey({
        x: cell.x + offset.x,
        y: cell.y,
        z: cell.z + offset.z
      }));
      if (cluster) clusters.add(cluster);
    }
    return Array.from(clusters);
  }

  private getAdjacentClustersForCluster(target: RubbleCluster): RubbleCluster[] {
    const clusters = new Set<RubbleCluster>();
    for (const pile of target.cells.values()) {
      for (const candidate of this.getAdjacentClustersForCell(pile.cell)) {
        if (candidate !== target) clusters.add(candidate);
      }
    }
    return Array.from(clusters);
  }

  private canAddNewCell(cluster: RubbleCluster, cell: RubbleCell): boolean {
    return cluster.cells.has(getRubbleCellCoordinateKey(cell)) || cluster.cells.size < RUBBLE_MAX_PATCH_CELLS;
  }

  private canMergeClusters(target: RubbleCluster, source: RubbleCluster): boolean {
    return target.cells.size + source.cells.size <= RUBBLE_MAX_PATCH_CELLS;
  }

  private recomputeClusterTotals(cluster: RubbleCluster): void {
    let pieces = 0;
    let health = 0;
    for (const pile of cluster.cells.values()) {
      pieces += pile.pieces;
      health += pile.health;
    }
    cluster.pieces = pieces;
    cluster.health = health;
  }

  private markClusterDirty(cluster: RubbleCluster): void {
    if (this.clustersById.has(cluster.id)) {
      this.dirtyClusters.add(cluster);
    }
  }

  private flushDirtyClusterMeshes(): void {
    for (const cluster of Array.from(this.dirtyClusters)) {
      this.dirtyClusters.delete(cluster);
      if (!this.clustersById.has(cluster.id)) continue;
      this.updateClusterMesh(cluster);
    }
  }

  private refreshStats(): void {
    let pieces = 0;
    let health = 0;
    let maxCoverHeight = 0;
    let visualChunks = 0;
    for (const cluster of this.clustersById.values()) {
      pieces += cluster.pieces;
      health += cluster.health;
      for (const pile of cluster.cells.values()) {
        maxCoverHeight = Math.max(maxCoverHeight, getRubblePileVisualHeight(pile));
        visualChunks += pile.visualChunks.length;
      }
    }

    this.stats = {
      clusters: this.clustersById.size,
      pieces,
      health,
      maxCoverHeight,
      visualChunks
    };
  }
}

function getRubbleCell(position: THREE.Vector3): RubbleCell {
  return {
    x: Math.floor(position.x / RUBBLE_CELL_SIZE),
    y: Math.floor(position.y / RUBBLE_CELL_SIZE),
    z: Math.floor(position.z / RUBBLE_CELL_SIZE)
  };
}

function getRubbleCellBelow(cell: RubbleCell): RubbleCell {
  return {
    x: cell.x,
    y: cell.y - 1,
    z: cell.z
  };
}

function areHorizontalNeighborCells(left: RubbleCell, right: RubbleCell): boolean {
  const deltaX = Math.abs(left.x - right.x);
  const deltaZ = Math.abs(left.z - right.z);

  return left.y === right.y && (deltaX > 0 || deltaZ > 0) && deltaX <= 1 && deltaZ <= 1;
}

function getRubblePileDamageIndicatorPosition(pile: RubbleCellPile): THREE.Vector3 {
  const apex = getRubblePileSurfaceApex(pile);

  // Health bars want to hover over the visible draped cover surface, not the
  // cell center. Using the same apex helper keeps the debug marker attached to
  // the piece of rubble the core actually hit.
  return new THREE.Vector3(apex.x, apex.y + 0.22, apex.z);
}

function clonePile(pile: RubbleCellPile): RubbleCellPile {
  return {
    cell: pile.cell,
    pieces: pile.pieces,
    health: pile.health,
    surfaceSamples: pile.surfaceSamples.map((sample) => ({ ...sample })),
    visualChunks: pile.visualChunks.map(cloneStoredVisualChunkSample)
  };
}

function createRubbleVisualChunkSample(fragment: PhysicsToy): RubbleVisualChunkSample {
  return {
    position: fragment.mesh.position.clone(),
    quaternion: fragment.mesh.quaternion.clone(),
    size: BLOCK_FRAGMENT_VISUAL_SIZE
  };
}

function createStoredVisualChunkSample(
  cell: RubbleCell,
  sample: RubbleVisualChunkSample
): RubbleStoredVisualChunkSample {
  const baseX = cell.x * RUBBLE_CELL_SIZE;
  const baseY = cell.y * RUBBLE_CELL_SIZE;
  const baseZ = cell.z * RUBBLE_CELL_SIZE;

  return {
    localX: sample.position.x - baseX,
    localY: sample.position.y - baseY,
    localZ: sample.position.z - baseZ,
    quaternion: sample.quaternion.clone(),
    size: clamp(sample.size, BLOCK_FRAGMENT_VISUAL_SIZE * 0.5, BLOCK_FRAGMENT_VISUAL_SIZE * 1.35)
  };
}

function cloneStoredVisualChunkSample(
  sample: RubbleStoredVisualChunkSample
): RubbleStoredVisualChunkSample {
  return {
    localX: sample.localX,
    localY: sample.localY,
    localZ: sample.localZ,
    quaternion: sample.quaternion.clone(),
    size: sample.size
  };
}

function createRubbleSurfaceSamples(
  cell: RubbleCell,
  position: THREE.Vector3,
  pieces: number
): RubbleSurfaceSample[] {
  const baseX = cell.x * RUBBLE_CELL_SIZE;
  const baseY = cell.y * RUBBLE_CELL_SIZE;
  const baseZ = cell.z * RUBBLE_CELL_SIZE;
  const localX = clamp((position.x - baseX) / RUBBLE_CELL_SIZE, 0, 1);
  const localZ = clamp((position.z - baseZ) / RUBBLE_CELL_SIZE, 0, 1);
  const noise = getSurfaceNoise(cell, localX, localZ);

  // Surface samples are the "sheet over the heap" anchors. The old pile logic
  // only knew how many pieces were in a cell; this keeps where the temporary
  // cubes actually settled so the final proxy does not collapse into a flat lid.
  const sampleHeight = clamp(
    position.y - baseY +
      RUBBLE_SURFACE_SAMPLE_HEIGHT_PADDING +
      (noise - 0.35) * RUBBLE_SURFACE_SAMPLE_HEIGHT_VARIATION,
    RUBBLE_MIN_HEIGHT,
    RUBBLE_MAX_HEIGHT
  );

  return [{
    localX,
    localZ,
    height: sampleHeight,
    weight: normalizeRubblePieceCount(pieces)
  }];
}

function appendRubbleSurfaceSamples(
  pile: RubbleCellPile,
  samples: readonly RubbleSurfaceSample[]
): void {
  if (samples.length === 0) return;

  pile.surfaceSamples.push(...samples.map((sample) => ({ ...sample })));
  if (pile.surfaceSamples.length <= RUBBLE_MAX_SURFACE_SAMPLES_PER_PILE) return;

  // Surface samples are only for the visible draped sheet, not gameplay truth.
  // Keep the most shape-defining samples when dense batches dump many material
  // units into the same cell, so one pile does not grow an unbounded mini-cloud.
  pile.surfaceSamples.sort((left, right) => (
    (right.height * right.weight) - (left.height * left.weight)
  ));
  pile.surfaceSamples.length = RUBBLE_MAX_SURFACE_SAMPLES_PER_PILE;
}

function appendRubbleVisualChunks(
  pile: RubbleCellPile,
  chunks: readonly RubbleStoredVisualChunkSample[]
): void {
  if (chunks.length === 0) return;

  pile.visualChunks.push(...chunks.map(cloneStoredVisualChunkSample));
  if (pile.visualChunks.length <= RUBBLE_MAX_VISUAL_CHUNKS_PER_PILE) return;

  // The baked chunks are the future re-break seed and the current silhouette.
  // When the cap is hit, keep the higher chunks first because those are what
  // stop the final pile from reading as a blanket draped over empty air.
  pile.visualChunks.sort((left, right) => (
    right.localY - left.localY ||
    distanceFromPileCenterSq(right) - distanceFromPileCenterSq(left)
  ));
  pile.visualChunks.length = RUBBLE_MAX_VISUAL_CHUNKS_PER_PILE;
}

function distanceFromPileCenterSq(chunk: RubbleStoredVisualChunkSample): number {
  const dx = chunk.localX - 0.5;
  const dz = chunk.localZ - 0.5;
  return dx * dx + dz * dz;
}

function normalizeRubblePieceCount(pieces: number): number {
  if (!Number.isFinite(pieces)) return 1;
  return Math.max(1, Math.round(pieces));
}

function boundsOverlapPileHorizontally(bounds: CollisionBounds, pile: RubbleCellPile): boolean {
  const { minX, maxX, minZ, maxZ } = getRubblePileWorldFootprint(pile);

  return (
    bounds.minX < maxX &&
    bounds.maxX > minX &&
    bounds.minZ < maxZ &&
    bounds.maxZ > minZ
  );
}

function getPileSupportHeight(
  cluster: RubbleCluster,
  pile: RubbleCellPile,
  bounds: CollisionBounds,
  world: RubbleFieldWorld | null
): number | null {
  const { minX, maxX, minZ, maxZ } = getRubblePileWorldFootprint(pile);
  const overlapMinX = Math.max(bounds.minX, minX);
  const overlapMaxX = Math.min(bounds.maxX, maxX);
  const overlapMinZ = Math.max(bounds.minZ, minZ);
  const overlapMaxZ = Math.min(bounds.maxZ, maxZ);
  if (overlapMinX >= overlapMaxX || overlapMinZ >= overlapMaxZ) return null;

  // Sample the overlapped footprint, not just the pile center. A player hull can
  // stand with only part of its capsule over a sloped pile, so support should use
  // the highest local surface under the feet.
  const sampleCenterX = (overlapMinX + overlapMaxX) * 0.5;
  const sampleCenterZ = (overlapMinZ + overlapMaxZ) * 0.5;
  return Math.max(
    getRubblePileSurfaceYAt(cluster, pile, sampleCenterX, sampleCenterZ, world),
    getRubblePileSurfaceYAt(cluster, pile, overlapMinX, overlapMinZ, world),
    getRubblePileSurfaceYAt(cluster, pile, overlapMinX, overlapMaxZ, world),
    getRubblePileSurfaceYAt(cluster, pile, overlapMaxX, overlapMinZ, world),
    getRubblePileSurfaceYAt(cluster, pile, overlapMaxX, overlapMaxZ, world)
  );
}

function getRubblePileSurfaceYAt(
  cluster: RubbleCluster,
  pile: RubbleCellPile,
  x: number,
  z: number,
  world: RubbleFieldWorld | null
): number {
  const u = clamp((x - pile.cell.x * RUBBLE_CELL_SIZE) / RUBBLE_CELL_SIZE, 0, 1);
  const v = clamp((z - pile.cell.z * RUBBLE_CELL_SIZE) / RUBBLE_CELL_SIZE, 0, 1);
  let surfaceY = getRubblePileOwnSurfaceYAt(cluster, pile, u, v, world);

  // Heightfield rubble has more vertices than the old corner/apex mesh. Share
  // edge samples with neighboring cells so broad patches stay stitched instead
  // of opening cracks where two faceted "sheets" meet.
  if (u <= RUBBLE_COLLISION_EPSILON) {
    surfaceY = Math.max(surfaceY, getNeighborRubbleSurfaceY(cluster, pile, -1, 0, 1, v, world));
  }
  if (u >= 1 - RUBBLE_COLLISION_EPSILON) {
    surfaceY = Math.max(surfaceY, getNeighborRubbleSurfaceY(cluster, pile, 1, 0, 0, v, world));
  }
  if (v <= RUBBLE_COLLISION_EPSILON) {
    surfaceY = Math.max(surfaceY, getNeighborRubbleSurfaceY(cluster, pile, 0, -1, u, 1, world));
  }
  if (v >= 1 - RUBBLE_COLLISION_EPSILON) {
    surfaceY = Math.max(surfaceY, getNeighborRubbleSurfaceY(cluster, pile, 0, 1, u, 0, world));
  }

  return surfaceY;
}

function getNeighborRubbleSurfaceY(
  cluster: RubbleCluster,
  pile: RubbleCellPile,
  offsetX: number,
  offsetZ: number,
  neighborLocalX: number,
  neighborLocalZ: number,
  world: RubbleFieldWorld | null
): number {
  const neighbor = cluster.cells.get(getRubbleCellCoordinateKey({
    x: pile.cell.x + offsetX,
    y: pile.cell.y,
    z: pile.cell.z + offsetZ
  }));

  if (!neighbor) return Number.NEGATIVE_INFINITY;
  return getRubblePileOwnSurfaceYAt(cluster, neighbor, neighborLocalX, neighborLocalZ, world);
}

function getRubblePileOwnSurfaceYAt(
  cluster: RubbleCluster,
  pile: RubbleCellPile,
  u: number,
  v: number,
  world: RubbleFieldWorld | null
): number {
  const northWestY = getRubbleSurfaceCornerY(
    cluster,
    pile.cell.x,
    pile.cell.y,
    pile.cell.z,
    world
  );
  const southWestY = getRubbleSurfaceCornerY(
    cluster,
    pile.cell.x,
    pile.cell.y,
    pile.cell.z + 1,
    world
  );
  const southEastY = getRubbleSurfaceCornerY(
    cluster,
    pile.cell.x + 1,
    pile.cell.y,
    pile.cell.z + 1,
    world
  );
  const northEastY = getRubbleSurfaceCornerY(
    cluster,
    pile.cell.x + 1,
    pile.cell.y,
    pile.cell.z,
    world
  );
  const northY = lerp(northWestY, northEastY, u);
  const southY = lerp(southWestY, southEastY, u);
  const drapedEdgeY = lerp(northY, southY, v);
  const sampleDrivenY = pile.cell.y * RUBBLE_CELL_SIZE + getRubblePileDrapedLocalHeight(pile, u, v);
  const apex = getRubblePileSurfaceApex(pile);
  const apexU = clamp((apex.x - pile.cell.x * RUBBLE_CELL_SIZE) / RUBBLE_CELL_SIZE, 0, 1);
  const apexV = clamp((apex.z - pile.cell.z * RUBBLE_CELL_SIZE) / RUBBLE_CELL_SIZE, 0, 1);
  const apexDistance = Math.max(Math.abs(u - apexU), Math.abs(v - apexV));
  const apexInfluence = clamp(1 - apexDistance * 3.2, 0, 1);
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const surfaceY = Math.max(
    drapedEdgeY,
    sampleDrivenY,
    lerp(drapedEdgeY, apex.y, apexInfluence)
  );
  const terrainRise = getRubbleLocalTerrainRise(pile.cell, u, v, world);

  return baseY + clamp(
    surfaceY - baseY + terrainRise,
    RUBBLE_MIN_HEIGHT,
    RUBBLE_MAX_HEIGHT
  );
}

function getRubblePileSurfaceApex(pile: RubbleCellPile): { readonly x: number; readonly y: number; readonly z: number } {
  const baseX = pile.cell.x * RUBBLE_CELL_SIZE;
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const baseZ = pile.cell.z * RUBBLE_CELL_SIZE;
  let weightedDeltaX = 0;
  let weightedDeltaZ = 0;
  let totalWeight = 0;
  let peakHeight = getRubblePileEdgeHeight(pile);

  for (const sample of pile.surfaceSamples) {
    const weight = Math.max(1, sample.weight);
    weightedDeltaX += (sample.localX - 0.5) * weight;
    weightedDeltaZ += (sample.localZ - 0.5) * weight;
    totalWeight += weight;
    peakHeight = Math.max(peakHeight, sample.height);
  }

  let weightedLocalX = 0.5;
  let weightedLocalZ = 0.5;
  if (totalWeight > 0) {
    weightedLocalX = clamp(0.5 + (weightedDeltaX / totalWeight), 0.18, 0.82);
    weightedLocalZ = clamp(0.5 + (weightedDeltaZ / totalWeight), 0.18, 0.82);
  }

  const noise = getSurfaceNoise(pile.cell, weightedLocalX, weightedLocalZ);
  const jaggedPeakHeight = clamp(
    peakHeight + (noise - 0.5) * RUBBLE_SURFACE_PEAK_VARIATION,
    RUBBLE_MIN_HEIGHT,
    RUBBLE_MAX_HEIGHT
  );

  return {
    x: baseX + weightedLocalX * RUBBLE_CELL_SIZE,
    y: baseY + Math.max(getRubblePileEdgeHeight(pile), jaggedPeakHeight),
    z: baseZ + weightedLocalZ * RUBBLE_CELL_SIZE
  };
}

function getRubblePileDrapedLocalHeight(pile: RubbleCellPile, localX: number, localZ: number): number {
  const edgeHeight = getRubblePileEdgeHeight(pile);
  let drapedHeight = edgeHeight * RUBBLE_SURFACE_EDGE_FLOOR_SCALE;

  for (const sample of pile.surfaceSamples) {
    const distance = Math.hypot(localX - sample.localX, localZ - sample.localZ);
    const weightedHeight = sample.height - distance * RUBBLE_SURFACE_SAMPLE_FALLOFF;
    drapedHeight = Math.max(drapedHeight, weightedHeight);
  }

  return clamp(
    Math.max(edgeHeight * RUBBLE_SURFACE_EDGE_FLOOR_SCALE, drapedHeight),
    RUBBLE_MIN_HEIGHT,
    RUBBLE_MAX_HEIGHT
  );
}

function getRubbleLocalTerrainRise(
  cell: RubbleCell,
  localX: number,
  localZ: number,
  world: RubbleFieldWorld | null
): number {
  if (!world) return 0;

  let rise = 0;
  if (world.isSolid(cell.x - 1, cell.y, cell.z)) rise += (1 - localX) * RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE;
  if (world.isSolid(cell.x + 1, cell.y, cell.z)) rise += localX * RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE;
  if (world.isSolid(cell.x, cell.y, cell.z - 1)) rise += (1 - localZ) * RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE;
  if (world.isSolid(cell.x, cell.y, cell.z + 1)) rise += localZ * RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE;
  return Math.min(RUBBLE_SOLID_NEIGHBOR_SURFACE_RISE, rise);
}

function getRubbleSurfaceCornerY(
  cluster: RubbleCluster,
  cornerX: number,
  cellY: number,
  cornerZ: number,
  world: RubbleFieldWorld | null
): number {
  let height = RUBBLE_MIN_HEIGHT;
  let nearbySolidBlocks = 0;

  // The four cells touching a grid corner should agree on that corner's height.
  // That gives neighboring piles shared edges instead of little mismatched lids.
  for (let dz = -1; dz <= 0; dz += 1) {
    for (let dx = -1; dx <= 0; dx += 1) {
      const cell = { x: cornerX + dx, y: cellY, z: cornerZ + dz };
      const key = getRubbleCellCoordinateKey(cell);
      const pile = cluster.cells.get(key);
      if (pile) {
        const localX = clamp(cornerX - cell.x, 0, 1);
        const localZ = clamp(cornerZ - cell.z, 0, 1);
        height = Math.max(height, getRubblePileDrapedLocalHeight(pile, localX, localZ));
        continue;
      }

      if (world?.isSolid(cell.x, cell.y, cell.z)) {
        nearbySolidBlocks += 1;
      }
    }
  }

  // Adjacent terrain should gently bank a rubble patch into surrounding blocks,
  // not lift every corner into a square tactical dinner table. Keep the effect
  // subtle because batch-finalized regions can already contain a full block of
  // material in one cell.
  const pileRise = Math.min(
    RUBBLE_SOLID_NEIGHBOR_CORNER_RISE,
    nearbySolidBlocks * RUBBLE_SOLID_NEIGHBOR_CORNER_RISE * RUBBLE_SUPPORTED_CORNER_RISE_SCALE
  );
  return (
    cellY * RUBBLE_CELL_SIZE +
    clamp(height + pileRise, RUBBLE_MIN_HEIGHT, RUBBLE_MAX_HEIGHT)
  );
}

function getRubbleCellCoordinateKey(cell: RubbleCell): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

function chooseRubbleMergeTarget(clusters: readonly RubbleCluster[], block: number): RubbleCluster | null {
  const sameMaterial = clusters
    .filter((cluster) => cluster.block === block)
    .sort((left, right) => right.cells.size - left.cells.size)[0];
  if (sameMaterial) return sameMaterial;

  return clusters.slice().sort((left, right) => right.cells.size - left.cells.size)[0] ?? null;
}

function compareClustersForFalling(left: RubbleCluster, right: RubbleCluster): number {
  return getLowestClusterCellY(left) - getLowestClusterCellY(right);
}

function getLowestClusterCellY(cluster: RubbleCluster): number {
  let lowestY = Number.POSITIVE_INFINITY;
  for (const pile of cluster.cells.values()) {
    lowestY = Math.min(lowestY, pile.cell.y);
  }
  return lowestY;
}

function getRubblePileVisualHeight(pile: RubbleCellPile): number {
  return Math.max(
    getRubblePileEdgeHeight(pile),
    ...pile.surfaceSamples.map((sample) => sample.height)
  );
}

function getRubblePileWorldFootprint(pile: RubbleCellPile): {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
} {
  const footprint = getRubblePileFootprint(pile);
  const baseX = pile.cell.x * RUBBLE_CELL_SIZE;
  const baseZ = pile.cell.z * RUBBLE_CELL_SIZE;

  return {
    minX: baseX + footprint.minX * RUBBLE_CELL_SIZE,
    maxX: baseX + footprint.maxX * RUBBLE_CELL_SIZE,
    minZ: baseZ + footprint.minZ * RUBBLE_CELL_SIZE,
    maxZ: baseZ + footprint.maxZ * RUBBLE_CELL_SIZE
  };
}

function getRubblePileFootprint(pile: RubbleCellPile): RubbleLocalFootprint {
  const radius = getRubblePileFootprintRadius(pile);
  let minX = 0.5 - radius;
  let maxX = 0.5 + radius;
  let minZ = 0.5 - radius;
  let maxZ = 0.5 + radius;

  if (pile.surfaceSamples.length > 0) {
    minX = Number.POSITIVE_INFINITY;
    maxX = Number.NEGATIVE_INFINITY;
    minZ = Number.POSITIVE_INFINITY;
    maxZ = Number.NEGATIVE_INFINITY;

    for (const sample of pile.surfaceSamples) {
      minX = Math.min(minX, sample.localX - radius);
      maxX = Math.max(maxX, sample.localX + radius);
      minZ = Math.min(minZ, sample.localZ - radius);
      maxZ = Math.max(maxZ, sample.localZ + radius);
    }
  }

  return {
    minX: clamp(minX, 0, 1),
    maxX: clamp(maxX, 0, 1),
    minZ: clamp(minZ, 0, 1),
    maxZ: clamp(maxZ, 0, 1)
  };
}

function getRubblePileFootprintRadius(pile: RubbleCellPile): number {
  // One lonely shard should remain a little mound. As material approaches a
  // whole block-fracture budget, the proxy grows into real cover that can span
  // the cell. This keeps the gameplay value stable without making confetti
  // behave like a poured concrete square.
  const materialRatio = clamp(
    (Math.max(1, pile.pieces) - 1) / Math.max(1, BLOCK_RUBBLE_MATERIAL_UNITS - 1),
    0,
    1
  );
  return lerp(RUBBLE_MIN_FOOTPRINT_RADIUS, RUBBLE_MAX_FOOTPRINT_RADIUS, Math.sqrt(materialRatio));
}

function getRubblePileEdgeHeight(pile: RubbleCellPile): number {
  const visualWeight = Math.min(RUBBLE_MAX_VISUAL_PIECES, Math.max(1, pile.pieces));
  const height = RUBBLE_MIN_HEIGHT
    + Math.sqrt(visualWeight) * RUBBLE_HEIGHT_PER_ROOT_PIECE
    + (getCellNoise(pile.cell) - 0.5) * RUBBLE_HEIGHT_VARIATION;
  return clamp(height, RUBBLE_MIN_HEIGHT, RUBBLE_MAX_HEIGHT);
}

function getCellNoise(cell: RubbleCell): number {
  const value = Math.sin(cell.x * 12.9898 + cell.y * 78.233 + cell.z * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function getSurfaceNoise(cell: RubbleCell, localX: number, localZ: number): number {
  const value = Math.sin(
    cell.x * 91.123 +
    cell.y * 37.719 +
    cell.z * 53.177 +
    localX * 23.733 +
    localZ * 41.971
  ) * 24634.6345;
  return value - Math.floor(value);
}

function createRubbleSurfaceGrid(
  cluster: RubbleCluster,
  pile: RubbleCellPile,
  world: RubbleFieldWorld | null,
  footprint: RubbleLocalFootprint
): RubbleSurfaceGrid {
  const cellMinX = pile.cell.x * RUBBLE_CELL_SIZE;
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const cellMinZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const minX = cellMinX + footprint.minX * RUBBLE_CELL_SIZE;
  const maxX = cellMinX + footprint.maxX * RUBBLE_CELL_SIZE;
  const minZ = cellMinZ + footprint.minZ * RUBBLE_CELL_SIZE;
  const maxZ = cellMinZ + footprint.maxZ * RUBBLE_CELL_SIZE;
  const width = Math.max(RUBBLE_COLLISION_EPSILON, maxX - minX);
  const depth = Math.max(RUBBLE_COLLISION_EPSILON, maxZ - minZ);
  const heights: number[] = [];
  let maxY = baseY + RUBBLE_MIN_HEIGHT;

  for (let zIndex = 0; zIndex <= RUBBLE_SURFACE_GRID_STEPS; zIndex += 1) {
    const footprintZ = zIndex / RUBBLE_SURFACE_GRID_STEPS;
    const worldZ = minZ + footprintZ * depth;
    for (let xIndex = 0; xIndex <= RUBBLE_SURFACE_GRID_STEPS; xIndex += 1) {
      const footprintX = xIndex / RUBBLE_SURFACE_GRID_STEPS;
      const worldX = minX + footprintX * width;
      const height = getRubblePileSurfaceYAt(cluster, pile, worldX, worldZ, world);
      heights.push(height);
      maxY = Math.max(maxY, height);
    }
  }

  return { minX, maxX, baseY, minZ, maxZ, heights, maxY };
}

function addRubbleTopSurface(
  positions: number[],
  normals: number[],
  indices: number[],
  grid: RubbleSurfaceGrid,
  pile: RubbleCellPile
): void {
  for (let zIndex = 0; zIndex < RUBBLE_SURFACE_GRID_STEPS; zIndex += 1) {
    for (let xIndex = 0; xIndex < RUBBLE_SURFACE_GRID_STEPS; xIndex += 1) {
      const width = grid.maxX - grid.minX;
      const depth = grid.maxZ - grid.minZ;
      const westX = grid.minX + (xIndex / RUBBLE_SURFACE_GRID_STEPS) * width;
      const eastX = grid.minX + ((xIndex + 1) / RUBBLE_SURFACE_GRID_STEPS) * width;
      const northZ = grid.minZ + (zIndex / RUBBLE_SURFACE_GRID_STEPS) * depth;
      const southZ = grid.minZ + ((zIndex + 1) / RUBBLE_SURFACE_GRID_STEPS) * depth;
      const northWest: RubbleQuadVertex = [westX, getGridHeight(grid, xIndex, zIndex), northZ];
      const northEast: RubbleQuadVertex = [eastX, getGridHeight(grid, xIndex + 1, zIndex), northZ];
      const southWest: RubbleQuadVertex = [westX, getGridHeight(grid, xIndex, zIndex + 1), southZ];
      const southEast: RubbleQuadVertex = [eastX, getGridHeight(grid, xIndex + 1, zIndex + 1), southZ];
      const noise = getSurfaceNoise(
        pile.cell,
        (xIndex + 0.5) / RUBBLE_SURFACE_GRID_STEPS,
        (zIndex + 0.5) / RUBBLE_SURFACE_GRID_STEPS
      );

      // Alternate diagonals with deterministic noise. A regular grid with the
      // same diagonal everywhere reads too manufactured; this keeps the cheap
      // heightfield faceted and debris-like without adding random runtime state.
      if (noise > 0.5) {
        addTriangle(positions, normals, indices, northWest, southWest, southEast);
        addTriangle(positions, normals, indices, northWest, southEast, northEast);
      } else {
        addTriangle(positions, normals, indices, northWest, southWest, northEast);
        addTriangle(positions, normals, indices, northEast, southWest, southEast);
      }
    }
  }
}

function addRubbleBoundarySide(
  positions: number[],
  normals: number[],
  indices: number[],
  grid: RubbleSurfaceGrid,
  side: "north" | "south" | "west" | "east"
): void {
  for (let step = 0; step < RUBBLE_SURFACE_GRID_STEPS; step += 1) {
    if (side === "north") {
      const width = grid.maxX - grid.minX;
      const x0 = grid.minX + (step / RUBBLE_SURFACE_GRID_STEPS) * width;
      const x1 = grid.minX + ((step + 1) / RUBBLE_SURFACE_GRID_STEPS) * width;
      addQuad(
        positions,
        normals,
        indices,
        [x0, grid.baseY, grid.minZ],
        [x0, getGridHeight(grid, step, 0), grid.minZ],
        [x1, getGridHeight(grid, step + 1, 0), grid.minZ],
        [x1, grid.baseY, grid.minZ],
        [0, 0, -1]
      );
      continue;
    }

    if (side === "south") {
      const width = grid.maxX - grid.minX;
      const x0 = grid.minX + (step / RUBBLE_SURFACE_GRID_STEPS) * width;
      const x1 = grid.minX + ((step + 1) / RUBBLE_SURFACE_GRID_STEPS) * width;
      addQuad(
        positions,
        normals,
        indices,
        [x0, grid.baseY, grid.maxZ],
        [x1, grid.baseY, grid.maxZ],
        [x1, getGridHeight(grid, step + 1, RUBBLE_SURFACE_GRID_STEPS), grid.maxZ],
        [x0, getGridHeight(grid, step, RUBBLE_SURFACE_GRID_STEPS), grid.maxZ],
        [0, 0, 1]
      );
      continue;
    }

    if (side === "west") {
      const depth = grid.maxZ - grid.minZ;
      const z0 = grid.minZ + (step / RUBBLE_SURFACE_GRID_STEPS) * depth;
      const z1 = grid.minZ + ((step + 1) / RUBBLE_SURFACE_GRID_STEPS) * depth;
      addQuad(
        positions,
        normals,
        indices,
        [grid.minX, grid.baseY, z0],
        [grid.minX, grid.baseY, z1],
        [grid.minX, getGridHeight(grid, 0, step + 1), z1],
        [grid.minX, getGridHeight(grid, 0, step), z0],
        [-1, 0, 0]
      );
      continue;
    }

    const depth = grid.maxZ - grid.minZ;
    const z0 = grid.minZ + (step / RUBBLE_SURFACE_GRID_STEPS) * depth;
    const z1 = grid.minZ + ((step + 1) / RUBBLE_SURFACE_GRID_STEPS) * depth;
    addQuad(
      positions,
      normals,
      indices,
      [grid.maxX, grid.baseY, z0],
      [grid.maxX, getGridHeight(grid, RUBBLE_SURFACE_GRID_STEPS, step), z0],
      [grid.maxX, getGridHeight(grid, RUBBLE_SURFACE_GRID_STEPS, step + 1), z1],
      [grid.maxX, grid.baseY, z1],
      [1, 0, 0]
    );
  }
}

function addRubbleVisualChunks(
  positions: number[],
  normals: number[],
  indices: number[],
  bounds: THREE.Box3,
  pile: RubbleCellPile
): void {
  if (pile.visualChunks.length === 0) return;

  for (const chunk of pile.visualChunks) {
    const center = new THREE.Vector3(
      pile.cell.x * RUBBLE_CELL_SIZE + chunk.localX,
      pile.cell.y * RUBBLE_CELL_SIZE + chunk.localY,
      pile.cell.z * RUBBLE_CELL_SIZE + chunk.localZ
    );
    const halfSize = chunk.size * 0.5;
    const corners = createVisualChunkCorners(center, chunk.quaternion, halfSize);

    for (const corner of corners) {
      bounds.expandByPoint(corner);
    }

    // These static cubes are deliberately baked into the same rubble mesh as
    // the support surface. They give the pile a chunky silhouette without
    // creating persistent rigid bodies or extra draw calls.
    addVisualChunkQuad(positions, normals, indices, corners[1], corners[5], corners[7], corners[3]);
    addVisualChunkQuad(positions, normals, indices, corners[0], corners[2], corners[6], corners[4]);
    addVisualChunkQuad(positions, normals, indices, corners[2], corners[3], corners[7], corners[6]);
    addVisualChunkQuad(positions, normals, indices, corners[0], corners[4], corners[5], corners[1]);
    addVisualChunkQuad(positions, normals, indices, corners[4], corners[6], corners[7], corners[5]);
    addVisualChunkQuad(positions, normals, indices, corners[0], corners[1], corners[3], corners[2]);
  }
}

function createVisualChunkCorners(
  center: THREE.Vector3,
  quaternion: THREE.Quaternion,
  halfSize: number
): readonly THREE.Vector3[] {
  return [
    new THREE.Vector3(-halfSize, -halfSize, -halfSize),
    new THREE.Vector3(halfSize, -halfSize, -halfSize),
    new THREE.Vector3(-halfSize, halfSize, -halfSize),
    new THREE.Vector3(halfSize, halfSize, -halfSize),
    new THREE.Vector3(-halfSize, -halfSize, halfSize),
    new THREE.Vector3(halfSize, -halfSize, halfSize),
    new THREE.Vector3(-halfSize, halfSize, halfSize),
    new THREE.Vector3(halfSize, halfSize, halfSize)
  ].map((corner) => corner.applyQuaternion(quaternion).add(center));
}

function addVisualChunkQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  first: THREE.Vector3,
  second: THREE.Vector3,
  third: THREE.Vector3,
  fourth: THREE.Vector3
): void {
  addTriangle(
    positions,
    normals,
    indices,
    vectorToRubbleVertex(first),
    vectorToRubbleVertex(second),
    vectorToRubbleVertex(third)
  );
  addTriangle(
    positions,
    normals,
    indices,
    vectorToRubbleVertex(first),
    vectorToRubbleVertex(third),
    vectorToRubbleVertex(fourth)
  );
}

function vectorToRubbleVertex(vector: THREE.Vector3): RubbleQuadVertex {
  return [vector.x, vector.y, vector.z];
}

function getGridHeight(grid: RubbleSurfaceGrid, xIndex: number, zIndex: number): number {
  return grid.heights[zIndex * (RUBBLE_SURFACE_GRID_STEPS + 1) + xIndex] ?? grid.baseY + RUBBLE_MIN_HEIGHT;
}

function addTriangle(
  positions: number[],
  normals: number[],
  indices: number[],
  first: RubbleQuadVertex,
  second: RubbleQuadVertex,
  third: RubbleQuadVertex
): void {
  const startIndex = positions.length / 3;
  const normal = getTriangleNormal(first, second, third);
  positions.push(...first, ...second, ...third);
  normals.push(...normal, ...normal, ...normal);
  indices.push(startIndex, startIndex + 1, startIndex + 2);
}

function getTriangleNormal(
  first: RubbleQuadVertex,
  second: RubbleQuadVertex,
  third: RubbleQuadVertex
): RubbleQuadVertex {
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

  if (length <= RUBBLE_COLLISION_EPSILON) return [0, 1, 0];
  return [nx / length, ny / length, nz / length];
}

function addQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  first: RubbleQuadVertex,
  second: RubbleQuadVertex,
  third: RubbleQuadVertex,
  fourth: RubbleQuadVertex,
  normal: RubbleQuadVertex
): void {
  const startIndex = positions.length / 3;
  positions.push(...first, ...second, ...third, ...fourth);
  normals.push(...normal, ...normal, ...normal, ...normal);
  indices.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function getPointPileDistanceSq(point: THREE.Vector3, pile: RubbleCellPile): number {
  const { minX, maxX, minZ, maxZ } = getRubblePileWorldFootprint(pile);
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);
  const closestX = clamp(point.x, minX, maxX);
  const closestY = clamp(point.y, baseY, topY);
  const closestZ = clamp(point.z, minZ, maxZ);
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  const dz = point.z - closestZ;
  return dx * dx + dy * dy + dz * dz;
}

function setClosestPointOnPile(
  point: THREE.Vector3,
  pile: RubbleCellPile,
  target: THREE.Vector3
): number {
  const { minX, maxX, minZ, maxZ } = getRubblePileWorldFootprint(pile);
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);

  target.set(
    clamp(point.x, minX, maxX),
    clamp(point.y, baseY, topY),
    clamp(point.z, minZ, maxZ)
  );
  return target.distanceToSquared(point);
}

function intersectRayWithPile(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  inverseDirection: THREE.Vector3,
  pile: RubbleCellPile,
  maxDistance: number
): number | null {
  const { minX, maxX, minZ, maxZ } = getRubblePileWorldFootprint(pile);
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);
  const tx1 = (minX - origin.x) * inverseDirection.x;
  const tx2 = (maxX - origin.x) * inverseDirection.x;
  const ty1 = (baseY - origin.y) * inverseDirection.y;
  const ty2 = (topY - origin.y) * inverseDirection.y;
  const tz1 = (minZ - origin.z) * inverseDirection.z;
  const tz2 = (maxZ - origin.z) * inverseDirection.z;

  const tMin = Math.max(
    Math.min(tx1, tx2),
    Math.min(ty1, ty2),
    Math.min(tz1, tz2)
  );
  const tMax = Math.min(
    Math.max(tx1, tx2),
    Math.max(ty1, ty2),
    Math.max(tz1, tz2)
  );

  if (tMax < 0 || tMin > tMax) return null;

  const distance = Math.max(0, tMin);
  if (distance > maxDistance || direction.lengthSq() <= RUBBLE_COLLISION_EPSILON) return null;
  return distance;
}
