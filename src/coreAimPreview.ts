import * as THREE from "three";
import { BLOCK_FRAGMENT_GRID_SIZE } from "./blockFragments";
import type { CollisionVector, CollisionWorld, ProjectileBlockSweepHit } from "./collision";
import type { BlockDamageBrushPreview } from "./world";

export const PHYSICS_CORE_AIM_PREVIEW_GRAVITY = 18;
export const PHYSICS_CORE_AIM_PREVIEW_STEP_SECONDS = 1 / 60;
export const PHYSICS_CORE_AIM_PREVIEW_MAX_SECONDS = 4;
export const PHYSICS_CORE_AIM_PREVIEW_MAX_POINTS = Math.ceil(
  PHYSICS_CORE_AIM_PREVIEW_MAX_SECONDS / PHYSICS_CORE_AIM_PREVIEW_STEP_SECONDS
) + 1;

const SWEEP_EPSILON = 0.000001;
const LATTICE_CELL_SIZE = 1 / BLOCK_FRAGMENT_GRID_SIZE;

export type PhysicsCoreTrajectoryImpact = {
  readonly block: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly incomingVelocity: THREE.Vector3;
  readonly speed: number;
};

export type PhysicsCoreTrajectoryPrediction = {
  readonly points: readonly THREE.Vector3[];
  readonly impact?: PhysicsCoreTrajectoryImpact;
};

export type PhysicsCoreTrajectoryPredictionInput = {
  readonly origin: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly stepSeconds?: number;
  readonly maxSeconds?: number;
};

type SweptTerrainHit = {
  readonly block: { readonly x: number; readonly y: number; readonly z: number };
  readonly t: number;
  readonly normal: THREE.Vector3;
};

export class PhysicsCoreAimPreview {
  readonly object: THREE.Group;
  private readonly trajectoryLine: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private readonly landingRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly affectedCells: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  constructor(scene: THREE.Scene) {
    this.object = new THREE.Group();
    this.object.name = "Physics core aim preview";
    this.object.visible = false;

    this.trajectoryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.2,
        gapSize: 0.13,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false
      })
    );
    this.trajectoryLine.name = "Physics core dotted arc";
    this.trajectoryLine.frustumCulled = false;
    this.trajectoryLine.renderOrder = 950;
    this.object.add(this.trajectoryLine);

    this.landingRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.014, 8, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd45a,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
      })
    );
    this.landingRing.name = "Physics core predicted impact";
    this.landingRing.frustumCulled = false;
    this.landingRing.renderOrder = 951;
    this.object.add(this.landingRing);

    this.affectedCells = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false
      })
    );
    this.affectedCells.name = "Physics core predicted bite cells";
    this.affectedCells.frustumCulled = false;
    this.affectedCells.renderOrder = 952;
    this.object.add(this.affectedCells);

    scene.add(this.object);
  }

  update(
    prediction: PhysicsCoreTrajectoryPrediction,
    brushPreview: BlockDamageBrushPreview | null
  ): void {
    if (prediction.points.length < 2) {
      this.hide();
      return;
    }

    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints([...prediction.points]);
    this.trajectoryLine.computeLineDistances();

    this.updateLandingRing(prediction.impact);
    this.updateAffectedCellGeometry(brushPreview);
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.material.dispose();
    this.landingRing.geometry.dispose();
    this.landingRing.material.dispose();
    this.affectedCells.geometry.dispose();
    this.affectedCells.material.dispose();
  }

  private updateLandingRing(impact: PhysicsCoreTrajectoryImpact | undefined): void {
    this.landingRing.visible = Boolean(impact);
    if (!impact) return;

    const normal = impact.normal.lengthSq() > SWEEP_EPSILON
      ? impact.normal.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    this.landingRing.position.copy(impact.position).addScaledVector(normal, 0.018);
    this.landingRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }

  private updateAffectedCellGeometry(brushPreview: BlockDamageBrushPreview | null): void {
    const positions: number[] = [];

    if (brushPreview) {
      for (const target of brushPreview.targets) {
        const inset = target.primary ? 0.014 : 0.026;
        for (const cellIndex of target.affectedVisualCellIndexes) {
          addLatticeCellEdges(positions, target.position, cellIndex, inset);
        }
      }
    }

    this.affectedCells.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.affectedCells.geometry = geometry;
    this.affectedCells.visible = positions.length > 0;
  }
}

export function predictPhysicsCoreTrajectory(
  world: CollisionWorld,
  input: PhysicsCoreTrajectoryPredictionInput
): PhysicsCoreTrajectoryPrediction {
  const stepSeconds = normalizePositive(input.stepSeconds, PHYSICS_CORE_AIM_PREVIEW_STEP_SECONDS);
  const maxSeconds = normalizePositive(input.maxSeconds, PHYSICS_CORE_AIM_PREVIEW_MAX_SECONDS);
  const maxSteps = Math.max(1, Math.min(
    PHYSICS_CORE_AIM_PREVIEW_MAX_POINTS,
    Math.ceil(maxSeconds / stepSeconds)
  ));
  const radius = Number.isFinite(input.radius) ? Math.max(0, input.radius) : 0;
  const position = input.origin.clone();
  const velocity = input.velocity.clone();
  const points: THREE.Vector3[] = [position.clone()];

  for (let step = 0; step < maxSteps; step += 1) {
    const previousPosition = position.clone();
    velocity.y -= PHYSICS_CORE_AIM_PREVIEW_GRAVITY * stepSeconds;
    const movement = velocity.clone().multiplyScalar(stepSeconds);
    const terrainHit = findSweptTerrainHit(world, previousPosition, movement, radius);

    if (terrainHit) {
      const impactPosition = previousPosition
        .clone()
        .addScaledVector(movement, terrainHit.t)
        .addScaledVector(terrainHit.normal, 0.001);
      points.push(impactPosition.clone());
      return {
        points,
        impact: {
          block: terrainHit.block,
          normal: terrainHit.normal,
          position: impactPosition,
          incomingVelocity: velocity.clone(),
          speed: Math.max(0, -velocity.dot(terrainHit.normal))
        }
      };
    }

    position.add(movement);
    points.push(position.clone());
  }

  return { points };
}

function findSweptTerrainHit(
  world: CollisionWorld,
  start: THREE.Vector3,
  movement: THREE.Vector3,
  radius: number
): SweptTerrainHit | null {
  if (movement.lengthSq() <= SWEEP_EPSILON) return null;

  const endX = start.x + movement.x;
  const endY = start.y + movement.y;
  const endZ = start.z + movement.z;
  const minX = Math.floor(Math.min(start.x, endX) - radius);
  const maxX = Math.floor(Math.max(start.x, endX) + radius);
  const minY = Math.floor(Math.min(start.y, endY) - radius);
  const maxY = Math.floor(Math.max(start.y, endY) + radius);
  const minZ = Math.floor(Math.min(start.z, endZ) - radius);
  const maxZ = Math.floor(Math.max(start.z, endZ) + radius);
  let bestHit: SweptTerrainHit | null = null;

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!world.isSolid(x, y, z)) continue;
        const hit = getProjectileBlockSweepHit(world, x, y, z, start, movement, radius);
        if (!hit || (bestHit && hit.t >= bestHit.t)) continue;
        bestHit = {
          block: { x, y, z },
          t: hit.t,
          normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)
        };
      }
    }
  }

  return bestHit;
}

function getProjectileBlockSweepHit(
  world: CollisionWorld,
  x: number,
  y: number,
  z: number,
  start: THREE.Vector3,
  movement: THREE.Vector3,
  radius: number
): ProjectileBlockSweepHit | null {
  if (world.getProjectileBlockSweepHit) {
    return world.getProjectileBlockSweepHit(x, y, z, start, movement, radius);
  }
  if (world.canProjectileHitBlock && !world.canProjectileHitBlock(x, y, z, start, movement, radius)) {
    return null;
  }
  return getFallbackProjectileSweepHit(start, movement, radius, x, y, z);
}

function getFallbackProjectileSweepHit(
  start: CollisionVector,
  movement: CollisionVector,
  radius: number,
  blockX: number,
  blockY: number,
  blockZ: number
): ProjectileBlockSweepHit | null {
  let entryTime = 0;
  let exitTime = 1;
  let normal: CollisionVector = { x: 0, y: 0, z: 0 };

  const xHit = getAxisSweepTimes(start.x, movement.x, blockX - radius, blockX + 1 + radius, { x: -1, y: 0, z: 0 });
  if (!xHit) return null;
  if (xHit.entryTime > entryTime) {
    entryTime = xHit.entryTime;
    normal = xHit.normal;
  }
  exitTime = Math.min(exitTime, xHit.exitTime);
  if (entryTime > exitTime) return null;

  const yHit = getAxisSweepTimes(start.y, movement.y, blockY - radius, blockY + 1 + radius, { x: 0, y: -1, z: 0 });
  if (!yHit) return null;
  if (yHit.entryTime > entryTime) {
    entryTime = yHit.entryTime;
    normal = yHit.normal;
  }
  exitTime = Math.min(exitTime, yHit.exitTime);
  if (entryTime > exitTime) return null;

  const zHit = getAxisSweepTimes(start.z, movement.z, blockZ - radius, blockZ + 1 + radius, { x: 0, y: 0, z: -1 });
  if (!zHit) return null;
  if (zHit.entryTime > entryTime) {
    entryTime = zHit.entryTime;
    normal = zHit.normal;
  }
  exitTime = Math.min(exitTime, zHit.exitTime);
  if (entryTime > exitTime) return null;

  return entryTime > SWEEP_EPSILON && entryTime <= 1 ? { t: entryTime, normal } : null;
}

function getAxisSweepTimes(
  start: number,
  movement: number,
  min: number,
  max: number,
  entryNormal: CollisionVector
): { readonly entryTime: number; readonly exitTime: number; readonly normal: CollisionVector } | null {
  if (Math.abs(movement) <= SWEEP_EPSILON) {
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
    normal = { x: -entryNormal.x, y: -entryNormal.y, z: -entryNormal.z };
  }

  return { entryTime, exitTime, normal };
}

function addLatticeCellEdges(
  positions: number[],
  blockPosition: { readonly x: number; readonly y: number; readonly z: number },
  cellIndex: number,
  inset: number
): void {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= BLOCK_FRAGMENT_GRID_SIZE ** 3) return;

  const x = cellIndex % BLOCK_FRAGMENT_GRID_SIZE;
  const y = Math.floor(cellIndex / BLOCK_FRAGMENT_GRID_SIZE) % BLOCK_FRAGMENT_GRID_SIZE;
  const z = Math.floor(cellIndex / (BLOCK_FRAGMENT_GRID_SIZE ** 2)) % BLOCK_FRAGMENT_GRID_SIZE;
  const min = {
    x: blockPosition.x + x * LATTICE_CELL_SIZE + inset,
    y: blockPosition.y + y * LATTICE_CELL_SIZE + inset,
    z: blockPosition.z + z * LATTICE_CELL_SIZE + inset
  };
  const max = {
    x: blockPosition.x + (x + 1) * LATTICE_CELL_SIZE - inset,
    y: blockPosition.y + (y + 1) * LATTICE_CELL_SIZE - inset,
    z: blockPosition.z + (z + 1) * LATTICE_CELL_SIZE - inset
  };

  addBoxEdges(positions, min, max);
}

function addBoxEdges(
  positions: number[],
  min: { readonly x: number; readonly y: number; readonly z: number },
  max: { readonly x: number; readonly y: number; readonly z: number }
): void {
  const corners = [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [max.x, max.y, min.z],
    [min.x, max.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [max.x, max.y, max.z],
    [min.x, max.y, max.z]
  ] as const;
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ] as const;

  for (const [from, to] of edges) {
    positions.push(...corners[from], ...corners[to]);
  }
}

function normalizePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
