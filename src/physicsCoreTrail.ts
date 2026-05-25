import * as THREE from "three";
import type { PhysicsToy } from "./physics";

const CORE_TRAIL_MAX_POINTS = 22;
const CORE_TRAIL_MIN_POINT_DISTANCE = 0.12;
const CORE_TRAIL_RELEASE_SECONDS = 0.28;
const CORE_TRAIL_BASE_OPACITY = 0.5;

type CoreTrailEntry = {
  readonly toy: PhysicsToy;
  readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.LineBasicMaterial;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly positions: Float32Array;
  readonly points: THREE.Vector3[];
  releaseAgeSeconds: number | null;
};

export class PhysicsCoreTrail {
  private readonly entries = new Map<PhysicsToy, CoreTrailEntry>();

  constructor(private readonly scene: THREE.Scene) {}

  track(toy: PhysicsToy, color: THREE.Color): void {
    if (toy.isInstancedFragment || this.entries.has(toy)) return;

    const positions = new Float32Array(CORE_TRAIL_MAX_POINTS * 3);
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: CORE_TRAIL_BASE_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    material.toneMapped = false;

    const line = new THREE.Line(geometry, material);
    line.name = "Physics Core trail";
    line.renderOrder = 35;
    line.frustumCulled = false;
    this.scene.add(line);

    const entry: CoreTrailEntry = {
      toy,
      line,
      geometry,
      material,
      positionAttribute,
      positions,
      points: [],
      releaseAgeSeconds: null
    };
    this.entries.set(toy, entry);
    appendTrailPoint(entry, toy.mesh.position);
  }

  update(deltaSeconds: number): void {
    if (this.entries.size === 0) return;

    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (const [toy, entry] of this.entries) {
      if (toy.isExpired || toy.isSleeping) {
        entry.releaseAgeSeconds = (entry.releaseAgeSeconds ?? 0) + safeDelta;
      } else {
        entry.releaseAgeSeconds = null;
        appendTrailPoint(entry, toy.mesh.position);
      }

      updateTrailMaterial(entry);
      if (entry.releaseAgeSeconds !== null && entry.releaseAgeSeconds >= CORE_TRAIL_RELEASE_SECONDS) {
        this.forget(toy);
      }
    }
  }

  setColor(color: THREE.Color): void {
    for (const entry of this.entries.values()) {
      entry.material.color.copy(color);
    }
  }

  forget(toy: PhysicsToy): void {
    const entry = this.entries.get(toy);
    if (!entry) return;

    this.scene.remove(entry.line);
    entry.geometry.dispose();
    entry.material.dispose();
    this.entries.delete(toy);
  }

  clear(): void {
    for (const toy of [...this.entries.keys()]) {
      this.forget(toy);
    }
  }

  dispose(): void {
    this.clear();
  }

  getActiveTrailCount(): number {
    return this.entries.size;
  }
}

function appendTrailPoint(entry: CoreTrailEntry, position: THREE.Vector3): void {
  const lastPoint = entry.points[entry.points.length - 1];
  if (
    lastPoint &&
    lastPoint.distanceToSquared(position) < CORE_TRAIL_MIN_POINT_DISTANCE * CORE_TRAIL_MIN_POINT_DISTANCE
  ) {
    return;
  }

  entry.points.push(position.clone());
  while (entry.points.length > CORE_TRAIL_MAX_POINTS) {
    entry.points.shift();
  }
  syncTrailGeometry(entry);
}

function syncTrailGeometry(entry: CoreTrailEntry): void {
  for (let index = 0; index < entry.points.length; index += 1) {
    const point = entry.points[index];
    const offset = index * 3;
    entry.positions[offset] = point?.x ?? 0;
    entry.positions[offset + 1] = point?.y ?? 0;
    entry.positions[offset + 2] = point?.z ?? 0;
  }
  entry.geometry.setDrawRange(0, entry.points.length);
  entry.positionAttribute.needsUpdate = true;
}

function updateTrailMaterial(entry: CoreTrailEntry): void {
  const releaseProgress = entry.releaseAgeSeconds === null
    ? 0
    : Math.min(1, entry.releaseAgeSeconds / CORE_TRAIL_RELEASE_SECONDS);
  entry.material.opacity = CORE_TRAIL_BASE_OPACITY * (1 - releaseProgress);
}
