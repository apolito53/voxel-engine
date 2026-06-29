import * as THREE from "three";

import type { QualityPreset } from "./qualityPresets";
import type { TerrainProfile } from "./terrain";
import { CHUNK_SIZE } from "./voxelConstants";

export const HORIZON_MATTE_INSET_CHUNKS = 0.5;
export const HORIZON_MATTE_EXTENSION_CHUNKS = 100;

const HORIZON_MATTE_SEGMENTS = 192;
const HORIZON_MATTE_HEIGHT_OFFSET_METERS = -1;
const HORIZON_MATTE_HEIGHT_SMOOTHING = 0.08;
const MINIMUM_MATTE_THICKNESS_METERS = CHUNK_SIZE;

export type HorizonMatteRadii = {
  readonly innerRadius: number;
  readonly outerRadius: number;
};

export type HorizonMatteSurfaceProvider = {
  readonly getTerrainProfile: () => TerrainProfile | null;
  readonly getReferenceHeight: (cameraPosition: THREE.Vector3) => number | null;
};

export type HorizonMatteUpdateOptions = {
  readonly camera: THREE.Camera;
  readonly inWorld: boolean;
  readonly quality: Pick<QualityPreset, "fogFar">;
  readonly surfaceProvider: HorizonMatteSurfaceProvider | null;
};

export function getHorizonMatteRadii(quality: Pick<QualityPreset, "fogFar">): HorizonMatteRadii {
  const fogFar = Number.isFinite(quality.fogFar) ? Math.max(0, quality.fogFar) : 0;
  const innerRadius = Math.max(0, fogFar - HORIZON_MATTE_INSET_CHUNKS * CHUNK_SIZE);
  const requestedOuterRadius = fogFar + HORIZON_MATTE_EXTENSION_CHUNKS * CHUNK_SIZE;

  return {
    innerRadius,
    outerRadius: Math.max(requestedOuterRadius, innerRadius + MINIMUM_MATTE_THICKNESS_METERS)
  };
}

export function shouldShowHorizonMatte(terrainProfile: TerrainProfile | null | undefined): boolean {
  return Boolean(terrainProfile) && terrainProfile !== "floating-islands";
}

export class HorizonMatte {
  readonly object: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  private currentInnerRadius = -1;
  private currentOuterRadius = -1;
  private smoothedHeight: number | null = null;
  private lastReferenceHeight: number | null = null;

  constructor(color: THREE.ColorRepresentation) {
    const geometry = new THREE.RingGeometry(1, 2, HORIZON_MATTE_SEGMENTS, 1);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide
    });

    this.object = new THREE.Mesh(geometry, material);
    this.object.name = "Horizon matte";
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.castShadow = false;
    this.object.receiveShadow = false;
    this.object.renderOrder = -950;
    this.object.rotation.x = -Math.PI / 2;
    this.object.raycast = () => {
      // The matte is only a horizon illusion. It must never become terrain,
      // collision, picking, or a hidden source of gameplay interactions.
    };
  }

  setColor(color: THREE.ColorRepresentation): void {
    this.object.material.color.set(color);
  }

  update(options: HorizonMatteUpdateOptions): void {
    const provider = options.surfaceProvider;
    const terrainProfile = provider?.getTerrainProfile() ?? null;
    if (!options.inWorld || !provider || !shouldShowHorizonMatte(terrainProfile)) {
      this.object.visible = false;
      return;
    }

    const radii = getHorizonMatteRadii(options.quality);
    this.updateGeometry(radii);

    const referenceHeight = provider.getReferenceHeight(options.camera.position);
    const hasFreshReference = referenceHeight !== null && Number.isFinite(referenceHeight);
    if (hasFreshReference) {
      this.lastReferenceHeight = referenceHeight;
    }

    const fallbackReference = this.lastReferenceHeight;
    if (fallbackReference === null) {
      this.object.visible = false;
      return;
    }

    const targetHeight = fallbackReference + HORIZON_MATTE_HEIGHT_OFFSET_METERS;
    this.smoothedHeight = this.smoothedHeight === null
      ? targetHeight
      : THREE.MathUtils.lerp(this.smoothedHeight, targetHeight, HORIZON_MATTE_HEIGHT_SMOOTHING);

    this.object.position.set(
      options.camera.position.x,
      this.smoothedHeight,
      options.camera.position.z
    );
    this.object.visible = radii.outerRadius > radii.innerRadius;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }

  private updateGeometry(radii: HorizonMatteRadii): void {
    if (
      radii.innerRadius === this.currentInnerRadius &&
      radii.outerRadius === this.currentOuterRadius
    ) {
      return;
    }

    this.object.geometry.dispose();
    this.object.geometry = new THREE.RingGeometry(
      radii.innerRadius,
      radii.outerRadius,
      HORIZON_MATTE_SEGMENTS,
      1
    );
    this.currentInnerRadius = radii.innerRadius;
    this.currentOuterRadius = radii.outerRadius;
  }
}
