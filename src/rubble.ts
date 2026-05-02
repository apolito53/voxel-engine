import * as THREE from "three";
import { BLOCK } from "./blocks";
import { BLOCK_DAMAGE_IMPACT_SPEED, getFragmentMaterial, type PhysicsToy } from "./physics";

const RUBBLE_CELL_SIZE = 1;
const RUBBLE_MAX_VISUAL_PIECES = 36;
// Promotion intentionally needs more material than a single 27-piece block
// fracture, otherwise fresh craters seal themselves as soon as debris settles.
export const RUBBLE_BLOCK_PROMOTION_PIECES = RUBBLE_MAX_VISUAL_PIECES;
const RUBBLE_PIECE_HEALTH = 1;
const RUBBLE_MIN_WIDTH = 0.36;
const RUBBLE_MAX_WIDTH = 1.18;
const RUBBLE_MIN_HEIGHT = 0.12;
const RUBBLE_MAX_HEIGHT = 0.9;
const RUBBLE_CORE_RESTITUTION = 1.15;
const RUBBLE_CORE_DAMPING = 0.82;
const RUBBLE_COLLISION_EPSILON = 0.000001;

type RubbleCell = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type RubbleCluster = {
  readonly id: number;
  key: string;
  readonly block: number;
  cell: RubbleCell;
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly bounds: THREE.Box3;
  pieces: number;
  health: number;
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

const rubbleGeometry = new THREE.BoxGeometry(1, 1, 1);

export class RubbleField {
  private readonly scene: THREE.Scene;
  private readonly clustersByKey = new Map<string, RubbleCluster>();
  private readonly clustersByCell = new Map<string, RubbleCluster[]>();
  private readonly sphereClosestPoint = new THREE.Vector3();
  private readonly sphereDelta = new THREE.Vector3();
  private readonly fallbackNormal = new THREE.Vector3(0, 1, 0);
  private readonly rayInverseDirection = new THREE.Vector3();
  private stats: RubbleFieldStats = EMPTY_RUBBLE_STATS;
  private nextClusterId = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  getStats(): RubbleFieldStats {
    return this.stats;
  }

  absorbFragment(fragment: PhysicsToy): boolean {
    if (!fragment.isInstancedFragment || fragment.fragmentBlock === null) {
      return false;
    }

    this.absorb(fragment.fragmentBlock, fragment.mesh.position);
    return true;
  }

  absorb(block: number, position: THREE.Vector3): void {
    // Rubble is grouped into meter-ish cells so many tiny settled shards become
    // one gameplay object: cover can be queried, damaged, and rendered cheaply.
    const cell = getRubbleCell(position);
    const key = getRubbleCellKey(cell, block);
    let cluster = this.clustersByKey.get(key);

    if (!cluster) {
      cluster = this.createCluster(key, block, cell);
      this.clustersByKey.set(key, cluster);
      this.addClusterToCellIndex(cluster);
    }

    cluster.pieces += 1;
    cluster.health += RUBBLE_PIECE_HEALTH;
    this.updateClusterMesh(cluster);
    this.refreshStats();
  }

  settle(world: RubbleFieldWorld): void {
    const clusters = Array.from(this.clustersByKey.values()).sort((left, right) => left.cell.y - right.cell.y);
    let changed = false;

    for (const cluster of clusters) {
      if (this.clustersByKey.get(cluster.key) !== cluster) continue;

      if (this.hasTerrainSupport(world, cluster)) {
        changed = this.promoteClusterIfLargeEnough(world, cluster) || changed;
        continue;
      }

      const belowCell = getRubbleCellBelow(cluster.cell);
      const mergeTarget = this.getMergeTargetInCell(belowCell, cluster);
      if (mergeTarget) {
        // Falling onto an existing pile makes the pile larger instead of
        // creating stacked proxy boxes. That gives us the cover-gameplay result
        // without doing debris/debris physics for every settled cube.
        this.mergeClusters(mergeTarget, cluster);
        this.promoteClusterIfLargeEnough(world, mergeTarget);
        changed = true;
        continue;
      }

      // Unsupported rubble falls one voxel cell per frame. It is intentionally
      // discrete for now: cheap, deterministic, and easy to replace later with
      // smoother motion if rubble becomes a centerpiece mechanic.
      const movedCluster = this.moveClusterToCell(cluster, belowCell);
      changed = true;
      if (movedCluster && this.hasTerrainSupport(world, movedCluster)) {
        this.promoteClusterIfLargeEnough(world, movedCluster);
      }
    }

    if (changed) this.refreshStats();
  }

  resolveCoreCollision(core: PhysicsToy): boolean {
    if (!core.damagesBlocks || core.isExpired || core.isSleeping) {
      return false;
    }

    // Only thrown cores interact with rubble for this first gameplay pass.
    // Debris settling into debris would recreate the expensive pile behavior
    // we just removed from the physics broadphase.
    let collided = false;
    const corePosition = core.mesh.position;
    for (const cluster of this.getNearbyClusters(corePosition, core.radius + RUBBLE_MAX_WIDTH)) {
      if (this.resolveCoreClusterCollision(core, cluster)) {
        collided = true;
      }
    }
    return collided;
  }

  damageNearest(position: THREE.Vector3, amount: number, radius = 1.2): boolean {
    let nearestCluster: RubbleCluster | null = null;
    let nearestDistanceSq = radius * radius;

    // This is the future-facing destructibility hook: bullets/explosions can
    // chip the nearest cover proxy without needing to know about visual shards.
    for (const cluster of this.getNearbyClusters(position, radius + RUBBLE_MAX_WIDTH)) {
      const distanceSq = cluster.mesh.position.distanceToSquared(position);
      if (distanceSq > nearestDistanceSq) continue;

      nearestDistanceSq = distanceSq;
      nearestCluster = cluster;
    }

    if (!nearestCluster) return false;
    this.damageCluster(nearestCluster, amount);
    return true;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RubbleRaycastHit | null {
    let closestHit: RubbleRaycastHit | null = null;

    // The shooter-facing contract is intentionally simple: cover proxies can
    // participate in line tests without making every visible shard queryable.
    this.rayInverseDirection.set(
      direction.x === 0 ? Number.POSITIVE_INFINITY : 1 / direction.x,
      direction.y === 0 ? Number.POSITIVE_INFINITY : 1 / direction.y,
      direction.z === 0 ? Number.POSITIVE_INFINITY : 1 / direction.z
    );

    for (const cluster of this.clustersByKey.values()) {
      const distance = intersectRayWithBox(
        origin,
        direction,
        this.rayInverseDirection,
        cluster.bounds,
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

    return closestHit;
  }

  clear(): void {
    for (const cluster of this.clustersByKey.values()) {
      this.scene.remove(cluster.mesh);
    }
    this.clustersByKey.clear();
    this.clustersByCell.clear();
    this.stats = EMPTY_RUBBLE_STATS;
  }

  dispose(): void {
    this.clear();
  }

  private createCluster(key: string, block: number, cell: RubbleCell): RubbleCluster {
    const mesh = new THREE.Mesh(rubbleGeometry, getFragmentMaterial(block));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `Rubble cover ${key}`;
    this.scene.add(mesh);

    const cluster: RubbleCluster = {
      id: this.nextClusterId,
      key,
      block,
      cell,
      mesh,
      bounds: new THREE.Box3(),
      pieces: 0,
      health: 0
    };
    this.nextClusterId += 1;
    return cluster;
  }

  private updateClusterMesh(cluster: RubbleCluster): void {
    // The pile grows sublinearly: a few pieces form a little ankle-high mess,
    // while many settled pieces become a crouch-cover shape instead of a full
    // replacement block.
    const visualWeight = Math.min(RUBBLE_MAX_VISUAL_PIECES, Math.max(1, cluster.pieces));
    const width = Math.min(RUBBLE_MAX_WIDTH, RUBBLE_MIN_WIDTH + Math.sqrt(visualWeight) * 0.14);
    const height = Math.min(RUBBLE_MAX_HEIGHT, RUBBLE_MIN_HEIGHT + visualWeight * 0.022);
    const depth = width;
    const centerX = (cluster.cell.x + 0.5) * RUBBLE_CELL_SIZE;
    const baseY = cluster.cell.y * RUBBLE_CELL_SIZE;
    const centerZ = (cluster.cell.z + 0.5) * RUBBLE_CELL_SIZE;

    cluster.mesh.scale.set(width, height, depth);
    cluster.mesh.position.set(centerX, baseY + height / 2, centerZ);
    cluster.mesh.updateMatrixWorld();
    cluster.bounds.setFromCenterAndSize(
      cluster.mesh.position,
      this.sphereDelta.set(width, height, depth)
    );
  }

  private resolveCoreClusterCollision(core: PhysicsToy, cluster: RubbleCluster): boolean {
    const corePosition = core.mesh.position;
    this.sphereClosestPoint.set(
      clamp(corePosition.x, cluster.bounds.min.x, cluster.bounds.max.x),
      clamp(corePosition.y, cluster.bounds.min.y, cluster.bounds.max.y),
      clamp(corePosition.z, cluster.bounds.min.z, cluster.bounds.max.z)
    );
    const distanceSq = this.sphereDelta.copy(corePosition).sub(this.sphereClosestPoint).lengthSq();
    if (distanceSq >= core.radius * core.radius) return false;

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
        this.damageCluster(cluster, Math.max(1, impactSpeed / 5));
      }
    }

    return true;
  }

  private damageCluster(cluster: RubbleCluster, amount: number): void {
    cluster.health = Math.max(0, cluster.health - amount);
    cluster.pieces = Math.ceil(cluster.health / RUBBLE_PIECE_HEALTH);

    if (cluster.health <= 0 || cluster.pieces <= 0) {
      this.removeCluster(cluster);
    } else {
      this.updateClusterMesh(cluster);
    }
    this.refreshStats();
  }

  private removeCluster(cluster: RubbleCluster): void {
    this.scene.remove(cluster.mesh);
    this.clustersByKey.delete(cluster.key);
    this.removeClusterFromCellIndex(cluster);
  }

  private hasTerrainSupport(world: RubbleFieldWorld, cluster: RubbleCluster): boolean {
    return world.isSolid(cluster.cell.x, cluster.cell.y - 1, cluster.cell.z);
  }

  private promoteClusterIfLargeEnough(world: RubbleFieldWorld, cluster: RubbleCluster): boolean {
    if (cluster.pieces < RUBBLE_BLOCK_PROMOTION_PIECES) return false;
    if (world.getBlock(cluster.cell.x, cluster.cell.y, cluster.cell.z) !== BLOCK.air) return false;

    // Once enough settled debris occupies one meter cell, it graduates back
    // into the voxel terrain. That lets later terrain systems treat it like a
    // normal solid block while small piles remain cheap cover proxies.
    world.setBlock(cluster.cell.x, cluster.cell.y, cluster.cell.z, BLOCK.rubble);
    this.removeCluster(cluster);
    return true;
  }

  private mergeClusters(target: RubbleCluster, source: RubbleCluster): void {
    target.pieces += source.pieces;
    target.health += source.health;
    this.removeCluster(source);
    this.updateClusterMesh(target);
  }

  private moveClusterToCell(cluster: RubbleCluster, cell: RubbleCell): RubbleCluster | null {
    this.removeClusterFromCellIndex(cluster);
    this.clustersByKey.delete(cluster.key);

    const nextKey = getRubbleCellKey(cell, cluster.block);
    const existingCluster = this.clustersByKey.get(nextKey);
    if (existingCluster && existingCluster !== cluster) {
      this.mergeClusters(existingCluster, cluster);
      return existingCluster;
    }

    cluster.cell = cell;
    cluster.key = nextKey;
    this.clustersByKey.set(nextKey, cluster);
    this.addClusterToCellIndex(cluster);
    this.updateClusterMesh(cluster);
    return cluster;
  }

  private getNearbyClusters(position: THREE.Vector3, radius: number): RubbleCluster[] {
    const minX = Math.floor((position.x - radius) / RUBBLE_CELL_SIZE);
    const maxX = Math.floor((position.x + radius) / RUBBLE_CELL_SIZE);
    const minY = Math.floor((position.y - radius) / RUBBLE_CELL_SIZE);
    const maxY = Math.floor((position.y + radius) / RUBBLE_CELL_SIZE);
    const minZ = Math.floor((position.z - radius) / RUBBLE_CELL_SIZE);
    const maxZ = Math.floor((position.z + radius) / RUBBLE_CELL_SIZE);
    const clusters: RubbleCluster[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          for (const cluster of this.getClustersForCell({ x, y, z })) {
            clusters.push(cluster);
          }
        }
      }
    }

    return clusters;
  }

  private getClustersForCell(cell: RubbleCell): RubbleCluster[] {
    return this.clustersByCell.get(getRubbleCellCoordinateKey(cell)) ?? [];
  }

  private getMergeTargetInCell(cell: RubbleCell, fallingCluster: RubbleCluster): RubbleCluster | null {
    const clusters = this.getClustersForCell(cell).filter((cluster) => cluster !== fallingCluster);
    if (clusters.length === 0) return null;

    // Prefer preserving material identity when possible. If a different
    // material pile is already there, combine into it anyway; gameplay wants
    // one pile in that cell more than it wants perfect material accounting.
    return clusters.find((cluster) => cluster.block === fallingCluster.block) ?? clusters[0] ?? null;
  }

  private addClusterToCellIndex(cluster: RubbleCluster): void {
    const key = getRubbleCellCoordinateKey(cluster.cell);
    const clusters = this.clustersByCell.get(key);
    if (clusters) {
      clusters.push(cluster);
    } else {
      this.clustersByCell.set(key, [cluster]);
    }
  }

  private removeClusterFromCellIndex(cluster: RubbleCluster): void {
    const key = getRubbleCellCoordinateKey(cluster.cell);
    const clusters = this.clustersByCell.get(key);
    if (!clusters) return;

    const index = clusters.indexOf(cluster);
    if (index >= 0) clusters.splice(index, 1);
    if (clusters.length === 0) {
      this.clustersByCell.delete(key);
    }
  }

  private refreshStats(): void {
    let pieces = 0;
    let health = 0;
    let maxCoverHeight = 0;
    for (const cluster of this.clustersByKey.values()) {
      pieces += cluster.pieces;
      health += cluster.health;
      maxCoverHeight = Math.max(maxCoverHeight, cluster.mesh.scale.y);
    }

    this.stats = {
      clusters: this.clustersByKey.size,
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

function getRubbleCellKey(cell: RubbleCell, block: number): string {
  return `${cell.x},${cell.y},${cell.z}:${block}`;
}

function getRubbleCellCoordinateKey(cell: RubbleCell): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intersectRayWithBox(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  inverseDirection: THREE.Vector3,
  box: THREE.Box3,
  maxDistance: number
): number | null {
  const tx1 = (box.min.x - origin.x) * inverseDirection.x;
  const tx2 = (box.max.x - origin.x) * inverseDirection.x;
  const ty1 = (box.min.y - origin.y) * inverseDirection.y;
  const ty2 = (box.max.y - origin.y) * inverseDirection.y;
  const tz1 = (box.min.z - origin.z) * inverseDirection.z;
  const tz2 = (box.max.z - origin.z) * inverseDirection.z;

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
