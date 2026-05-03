import * as THREE from "three";
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
// Promotion intentionally needs more material than the visible pile cap and a
// single 27-piece block fracture. Piles can keep accruing hidden material after
// the proxy mesh stops growing, so craters do not seal from one normal break.
export const RUBBLE_BLOCK_PROMOTION_PIECES = 48;
const RUBBLE_MAX_PATCH_CELLS = 18;
const RUBBLE_PIECE_HEALTH = 1;
const RUBBLE_NEARBY_SEARCH_PADDING = 1.25;
const RUBBLE_MIN_HEIGHT = 0.08;
const RUBBLE_HEIGHT_PER_ROOT_PIECE = 0.055;
const RUBBLE_HEIGHT_VARIATION = 0.035;
const RUBBLE_MAX_HEIGHT = 0.5;
const RUBBLE_SOLID_NEIGHBOR_CORNER_RISE = 0.16;
// Rubble should behave like rough cover, but cores are still supposed to read
// as bouncy projectiles. Keep the rebound near terrain-block bounce strength
// so piles feel physical without turning the launcher into a glue gun.
const RUBBLE_CORE_RESTITUTION = 1.55;
const RUBBLE_CORE_DAMPING = 0.95;
const RUBBLE_COLLISION_EPSILON = 0.000001;

type RubbleCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type RubbleCellPile = {
  readonly cell: RubbleCell;
  pieces: number;
  health: number;
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
};

export type RubbleRaycastHit = {
  readonly clusterId: number;
  readonly block: number;
  readonly distance: number;
  readonly point: THREE.Vector3;
};

const EMPTY_RUBBLE_STATS: RubbleFieldStats = {
  clusters: 0,
  pieces: 0,
  health: 0,
  maxCoverHeight: 0
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

    this.absorb(fragment.fragmentBlock, fragment.mesh.position, fragment.rubbleMaterialUnits);
    return true;
  }

  absorb(block: number, position: THREE.Vector3, pieces = 1): void {
    // Settled shards become cell piles, and adjacent piles are stitched into a
    // capped patch. That keeps rubble readable as debris fields instead of
    // rendering hundreds of tiny standalone boxes.
    const normalizedPieces = normalizeRubblePieceCount(pieces);
    this.absorbPileAtCell(
      block,
      getRubbleCell(position),
      normalizedPieces,
      normalizedPieces * RUBBLE_PIECE_HEALTH
    );
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
          fallingPile.health
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
    this.damageClusterFromPile(nearestTarget.cluster, nearestTarget.pile, amount, position);
    return true;
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

  private absorbPileAtCell(block: number, cell: RubbleCell, pieces: number, health: number): RubbleCluster {
    const existingCluster = this.clustersByCell.get(getRubbleCellCoordinateKey(cell));
    if (existingCluster) {
      this.addPileToCluster(existingCluster, cell, pieces, health);
      this.mergeAdjacentClusters(existingCluster);
      return existingCluster;
    }

    const mergeCandidates = this.getAdjacentClustersForCell(cell)
      .filter((cluster) => this.canAddNewCell(cluster, cell));
    const targetCluster = chooseRubbleMergeTarget(mergeCandidates, block) ?? this.createCluster(block);

    this.addPileToCluster(targetCluster, cell, pieces, health);
    this.mergeAdjacentClusters(targetCluster);
    return targetCluster;
  }

  private addPileToCluster(cluster: RubbleCluster, cell: RubbleCell, pieces: number, health: number): void {
    const key = getRubbleCellCoordinateKey(cell);
    const pile = cluster.cells.get(key);
    if (pile) {
      pile.pieces += pieces;
      pile.health += health;
    } else {
      cluster.cells.set(key, { cell, pieces, health });
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
      const minX = pile.cell.x * RUBBLE_CELL_SIZE;
      const maxX = minX + RUBBLE_CELL_SIZE;
      const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
      const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
      const maxZ = minZ + RUBBLE_CELL_SIZE;
      const northWestY = getRubbleSurfaceCornerY(
        cluster,
        pile.cell.x,
        pile.cell.y,
        pile.cell.z,
        this.surfaceWorld
      );
      const southWestY = getRubbleSurfaceCornerY(
        cluster,
        pile.cell.x,
        pile.cell.y,
        pile.cell.z + 1,
        this.surfaceWorld
      );
      const southEastY = getRubbleSurfaceCornerY(
        cluster,
        pile.cell.x + 1,
        pile.cell.y,
        pile.cell.z + 1,
        this.surfaceWorld
      );
      const northEastY = getRubbleSurfaceCornerY(
        cluster,
        pile.cell.x + 1,
        pile.cell.y,
        pile.cell.z,
        this.surfaceWorld
      );
      const maxTopY = Math.max(northWestY, southWestY, southEastY, northEastY);

      bounds.expandByPoint(new THREE.Vector3(minX, baseY, minZ));
      bounds.expandByPoint(new THREE.Vector3(maxX, maxTopY, maxZ));

      addQuad(
        positions,
        normals,
        indices,
        [minX, northWestY, minZ],
        [minX, southWestY, maxZ],
        [maxX, southEastY, maxZ],
        [maxX, northEastY, minZ],
        [0, 1, 0]
      );
      addQuad(
        positions,
        normals,
        indices,
        [minX, baseY, minZ],
        [maxX, baseY, minZ],
        [maxX, baseY, maxZ],
        [minX, baseY, maxZ],
        [0, -1, 0]
      );

      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x, y: pile.cell.y, z: pile.cell.z - 1 }))) {
        addQuad(
          positions,
          normals,
          indices,
          [minX, baseY, minZ],
          [minX, northWestY, minZ],
          [maxX, northEastY, minZ],
          [maxX, baseY, minZ],
          [0, 0, -1]
        );
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x, y: pile.cell.y, z: pile.cell.z + 1 }))) {
        addQuad(
          positions,
          normals,
          indices,
          [minX, baseY, maxZ],
          [maxX, baseY, maxZ],
          [maxX, southEastY, maxZ],
          [minX, southWestY, maxZ],
          [0, 0, 1]
        );
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x - 1, y: pile.cell.y, z: pile.cell.z }))) {
        addQuad(
          positions,
          normals,
          indices,
          [minX, baseY, minZ],
          [minX, baseY, maxZ],
          [minX, southWestY, maxZ],
          [minX, northWestY, minZ],
          [-1, 0, 0]
        );
      }
      if (!cluster.cells.has(getRubbleCellCoordinateKey({ x: pile.cell.x + 1, y: pile.cell.y, z: pile.cell.z }))) {
        addQuad(
          positions,
          normals,
          indices,
          [maxX, baseY, minZ],
          [maxX, northEastY, minZ],
          [maxX, southEastY, maxZ],
          [maxX, baseY, maxZ],
          [1, 0, 0]
        );
      }
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
        const destroyedImpactedPile = this.damageClusterFromPile(
          cluster,
          targetPile,
          PHYSICS_CORE_BLOCK_DAMAGE,
          this.sphereClosestPoint
        );
        if (destroyedImpactedPile) core.expire();
      }
    }

    return true;
  }

  private damageClusterFromPile(
    cluster: RubbleCluster,
    targetPile: RubbleCellPile,
    amount: number,
    origin: THREE.Vector3
  ): boolean {
    let remainingDamage = amount;
    let destroyedTargetPile = false;
    const piles = this.sortClusterPilesForDamage(cluster, targetPile, origin);

    for (const pile of piles) {
      if (remainingDamage <= 0) break;

      const damage = Math.min(pile.health, remainingDamage);
      pile.health -= damage;
      remainingDamage -= damage;
      pile.pieces = Math.ceil(pile.health / RUBBLE_PIECE_HEALTH);
      if (pile.health <= RUBBLE_COLLISION_EPSILON || pile.pieces <= 0) {
        if (pile === targetPile) destroyedTargetPile = true;
        const key = getRubbleCellCoordinateKey(pile.cell);
        cluster.cells.delete(key);
        if (this.clustersByCell.get(key) === cluster) {
          this.clustersByCell.delete(key);
        }
      }
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

  private sortClusterPilesForDamage(
    cluster: RubbleCluster,
    targetPile: RubbleCellPile,
    origin: THREE.Vector3
  ): RubbleCellPile[] {
    return Array.from(cluster.cells.values()).sort((left, right) => {
      if (left === targetPile) return -1;
      if (right === targetPile) return 1;

      const distanceDelta = getPointPileDistanceSq(origin, left) - getPointPileDistanceSq(origin, right);
      if (Math.abs(distanceDelta) > RUBBLE_COLLISION_EPSILON) return distanceDelta;

      // If excess damage spills into equally close cells, chew through the
      // weaker material first so results are deterministic and locally sensible.
      return left.health - right.health;
    });
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
    for (const cluster of this.clustersById.values()) {
      pieces += cluster.pieces;
      health += cluster.health;
      for (const pile of cluster.cells.values()) {
        maxCoverHeight = Math.max(maxCoverHeight, getRubblePileVisualHeight(pile));
      }
    }

    this.stats = {
      clusters: this.clustersById.size,
      pieces,
      health,
      maxCoverHeight
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

function clonePile(pile: RubbleCellPile): RubbleCellPile {
  return {
    cell: pile.cell,
    pieces: pile.pieces,
    health: pile.health
  };
}

function normalizeRubblePieceCount(pieces: number): number {
  if (!Number.isFinite(pieces)) return 1;
  return Math.max(1, Math.round(pieces));
}

function boundsOverlapPileHorizontally(bounds: CollisionBounds, pile: RubbleCellPile): boolean {
  const minX = pile.cell.x * RUBBLE_CELL_SIZE;
  const maxX = minX + RUBBLE_CELL_SIZE;
  const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const maxZ = minZ + RUBBLE_CELL_SIZE;

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
  const minX = pile.cell.x * RUBBLE_CELL_SIZE;
  const maxX = minX + RUBBLE_CELL_SIZE;
  const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const maxZ = minZ + RUBBLE_CELL_SIZE;
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
  return lerp(northY, southY, v);
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
        height = Math.max(height, getRubblePileVisualHeight(pile));
        continue;
      }

      if (world?.isSolid(cell.x, cell.y, cell.z)) {
        nearbySolidBlocks += 1;
      }
    }
  }

  const neighborRise = Math.min(
    RUBBLE_SOLID_NEIGHBOR_CORNER_RISE,
    nearbySolidBlocks * RUBBLE_SOLID_NEIGHBOR_CORNER_RISE * 0.45
  );
  return (
    cellY * RUBBLE_CELL_SIZE +
    clamp(height + neighborRise, RUBBLE_MIN_HEIGHT, RUBBLE_MAX_HEIGHT)
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
  const minX = pile.cell.x * RUBBLE_CELL_SIZE;
  const maxX = minX + RUBBLE_CELL_SIZE;
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);
  const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const maxZ = minZ + RUBBLE_CELL_SIZE;
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
  const minX = pile.cell.x * RUBBLE_CELL_SIZE;
  const maxX = minX + RUBBLE_CELL_SIZE;
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);
  const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const maxZ = minZ + RUBBLE_CELL_SIZE;

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
  const minX = pile.cell.x * RUBBLE_CELL_SIZE;
  const maxX = minX + RUBBLE_CELL_SIZE;
  const baseY = pile.cell.y * RUBBLE_CELL_SIZE;
  const topY = baseY + getRubblePileVisualHeight(pile);
  const minZ = pile.cell.z * RUBBLE_CELL_SIZE;
  const maxZ = minZ + RUBBLE_CELL_SIZE;
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
