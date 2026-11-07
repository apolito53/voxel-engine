import * as THREE from "three";

import type { DayNightVisualState, RgbColorTuple } from "./dayNightCycle";
import type { QualityPreset } from "./qualityPresets";
import { SKY_ATMOSPHERE_GLSL, getProceduralSkySunDirection } from "./skybox";
import { CLOUD_SHADOW_FULL_RADIUS } from "./shadows";

export const CLOUD_BASE_HEIGHT_METERS = 144;
export const CLOUD_CELL_SIZE_METERS = 16;
export const CLOUD_STEP_HEIGHT_METERS = 4;
export const CLOUD_TOP_HEIGHT_METERS = CLOUD_BASE_HEIGHT_METERS + CLOUD_STEP_HEIGHT_METERS * 3;
export const CLOUD_TILE_CELLS = 64;
export const CLOUD_TILE_SIZE_METERS = CLOUD_TILE_CELLS * CLOUD_CELL_SIZE_METERS;
export const CLOUD_MAX_VIEW_DISTANCE_METERS = 920;
export const CLOUD_WIND_METERS_PER_SECOND = { x: 0.85, z: 0.28 } as const;
const MAX_FRAME_DELTA_SECONDS = 0.25;
const MAX_TILE_INSTANCES = 9;

export type CloudColumn = { readonly bottom: number; readonly top: number };
export type CloudPalette = { readonly top: RgbColorTuple; readonly underside: RgbColorTuple };
export type CloudWindOffset = { readonly x: number; readonly z: number };
type CloudAdvanceOptions = {
  readonly active: boolean;
  readonly unpaused: boolean;
  readonly visible: boolean;
};

// This is a periodic world field, not noise sampled relative to the camera.
// Neighbor samples cross the tile seam, so the mesh contains no internal seam
// faces and recentering only exchanges already invisible distant copies.
export function sampleCloudColumn(cellX: number, cellZ: number): CloudColumn {
  const density = periodicNoise(cellX, cellZ, 16) * 0.52 +
    periodicNoise(cellX, cellZ, 8) * 0.31 + periodicNoise(cellX, cellZ, 4) * 0.17;
  if (density < 0.55) return { bottom: 0, top: 0 };
  const bottom = density > 0.65 && periodicNoise(cellX + 13, cellZ - 7, 4) > 0.57 ? 1 : 0;
  const top = density > 0.69 ? 3 : density > 0.60 ? 2 : 1;
  return { bottom, top: Math.max(bottom + 1, top) };
}

export function advanceCloudElapsedTime(
  elapsedSeconds: number,
  deltaSeconds: number,
  options: CloudAdvanceOptions
): number {
  if (!options.active || !options.unpaused || !options.visible || !Number.isFinite(deltaSeconds)) {
    return elapsedSeconds;
  }
  return elapsedSeconds + Math.max(0, Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS));
}

export function getCloudWindOffset(elapsedSeconds: number): CloudWindOffset {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  // Reduce each axis independently: a common elapsed-time modulus would make
  // diagonal wind jump whenever only one component had completed a tile.
  return {
    x: positiveModulo(elapsed * CLOUD_WIND_METERS_PER_SECOND.x, CLOUD_TILE_SIZE_METERS),
    z: positiveModulo(elapsed * CLOUD_WIND_METERS_PER_SECOND.z, CLOUD_TILE_SIZE_METERS)
  };
}

export function getCloudTileAnchor(cameraCoordinate: number, windOffset: number): number {
  return Math.floor((cameraCoordinate - windOffset) / CLOUD_TILE_SIZE_METERS + 0.5);
}

export function getCloudViewDistance(quality: Pick<QualityPreset, "distanceScale">): number {
  if (quality.distanceScale <= 0.5) return 520;
  if (quality.distanceScale <= 1) return 680;
  return CLOUD_MAX_VIEW_DISTANCE_METERS;
}

export function createCloudPalette(visual: DayNightVisualState): CloudPalette {
  return {
    top: mixColor(
      mixColor([0.21, 0.28, 0.43], [0.98, 0.99, 1], visual.dayFactor),
      [1, 0.65, 0.46], visual.twilightFactor * 0.76
    ),
    underside: mixColor(
      mixColor([0.075, 0.105, 0.18], [0.65, 0.73, 0.82], visual.dayFactor),
      [0.39, 0.32, 0.43], visual.twilightFactor * 0.72
    )
  };
}

export function createCloudTileGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const halfTile = CLOUD_TILE_SIZE_METERS / 2;

  const quad = (vertices: readonly (readonly [number, number, number])[], normal: readonly number[]): void => {
    const first = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(...vertex);
      normals.push(...normal);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };

  for (let z = 0; z < CLOUD_TILE_CELLS; z += 1) {
    for (let x = 0; x < CLOUD_TILE_CELLS; x += 1) {
      const column = sampleCloudColumn(x, z);
      if (column.top === 0) continue;
      const x0 = x * CLOUD_CELL_SIZE_METERS - halfTile;
      const x1 = x0 + CLOUD_CELL_SIZE_METERS;
      const z0 = z * CLOUD_CELL_SIZE_METERS - halfTile;
      const z1 = z0 + CLOUD_CELL_SIZE_METERS;
      const bottom = column.bottom * CLOUD_STEP_HEIGHT_METERS;
      const top = column.top * CLOUD_STEP_HEIGHT_METERS;
      quad([[x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0]], [0, 1, 0]);
      quad([[x0, bottom, z1], [x0, bottom, z0], [x1, bottom, z0], [x1, bottom, z1]], [0, -1, 0]);

      const sides = [
        { dx: -1, dz: 0, normal: [-1, 0, 0], edge: [[x0, z0], [x0, z1]] },
        { dx: 1, dz: 0, normal: [1, 0, 0], edge: [[x1, z1], [x1, z0]] },
        { dx: 0, dz: -1, normal: [0, 0, -1], edge: [[x1, z0], [x0, z0]] },
        { dx: 0, dz: 1, normal: [0, 0, 1], edge: [[x0, z1], [x1, z1]] }
      ];
      for (const side of sides) {
        const neighbor = sampleCloudColumn(x + side.dx, z + side.dz);
        const intervals = neighbor.top === 0
          ? [[column.bottom, column.top]]
          : [
            [column.bottom, Math.min(column.top, neighbor.bottom)],
            [Math.max(column.bottom, neighbor.top), column.top]
          ];
        for (const [low, high] of intervals) {
          if (low >= high) continue;
          const y0 = low * CLOUD_STEP_HEIGHT_METERS;
          const y1 = high * CLOUD_STEP_HEIGHT_METERS;
          const [a, b] = side.edge;
          quad([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], side.normal);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class CloudLayer {
  readonly object: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private elapsedSeconds = 0;
  private disposed = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly shadowUniforms = {
    cloudShadowCoverage: { value: 0 },
    cloudShadowMapSize: { value: 1 }
  };
  private readonly uniforms = {
    skyTopColor: { value: new THREE.Color() },
    skyHorizonColor: { value: new THREE.Color() },
    skyLowerColor: { value: new THREE.Color() },
    skyFogColor: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() },
    twilightFactor: { value: 0 },
    sunDiscIntensity: { value: 0 },
    cloudTopColor: { value: new THREE.Color() },
    cloudUndersideColor: { value: new THREE.Color() },
    cloudViewDistance: { value: CLOUD_MAX_VIEW_DISTANCE_METERS }
  };

  constructor(private readonly sunOffset: THREE.Vector3, visual: DayNightVisualState) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vCloudNormal;
        varying vec3 vCloudWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vCloudWorldPosition = worldPosition.xyz;
          vCloudNormal = normal;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        ${SKY_ATMOSPHERE_GLSL}
        uniform vec3 cloudTopColor;
        uniform vec3 cloudUndersideColor;
        uniform float cloudViewDistance;
        varying vec3 vCloudNormal;
        varying vec3 vCloudWorldPosition;
        void main() {
          vec3 viewOffset = vCloudWorldPosition - cameraPosition;
          float distanceToCloud = length(viewOffset);
          if (distanceToCloud >= cloudViewDistance) discard;
          vec3 normal = normalize(vCloudNormal);
          float topLight = normal.y * 0.5 + 0.5;
          vec3 cloud = mix(cloudUndersideColor, cloudTopColor, topLight);
          cloud *= 0.88 + max(dot(normal, sunDirection), 0.0) * 0.12;
          float haze = smoothstep(cloudViewDistance * 0.5, cloudViewDistance, distanceToCloud);
          vec3 sky = sampleSkyAtmosphere(normalize(viewOffset));
          gl_FragColor = vec4(mix(cloud, sky, haze), 1.0);
        }
      `,
      side: THREE.DoubleSide,
      fog: false,
      depthTest: true,
      depthWrite: true
    });
    material.toneMapped = false;
    this.object = new THREE.InstancedMesh(createCloudTileGeometry(), material, MAX_TILE_INSTANCES);
    this.object.name = "Elevated voxel cloud banks";
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.customDepthMaterial = this.createDepthMaterial();
    this.object.raycast = () => { /* Atmosphere never participates in world picking. */ };
    this.setState(visual);
  }

  setState(visual: DayNightVisualState): void {
    const palette = createCloudPalette(visual);
    this.uniforms.skyTopColor.value.setRGB(...visual.skyTopColor);
    this.uniforms.skyHorizonColor.value.setRGB(...visual.skyHorizonColor);
    this.uniforms.skyLowerColor.value.setRGB(...visual.skyLowerColor);
    this.uniforms.skyFogColor.value.setRGB(...visual.fogColor);
    this.uniforms.sunColor.value.setRGB(...visual.sunColor);
    getProceduralSkySunDirection(visual.timeOfDay, this.sunOffset, this.uniforms.sunDirection.value);
    this.uniforms.twilightFactor.value = visual.twilightFactor;
    this.uniforms.sunDiscIntensity.value = visual.sunDiscIntensity;
    this.uniforms.cloudTopColor.value.setRGB(...palette.top);
    this.uniforms.cloudUndersideColor.value.setRGB(...palette.underside);
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.object.visible = false;
    this.object.count = 0;
    this.object.castShadow = false;
  }

  setShadows(coverage: number, shadowMapSize: number): void {
    const normalizedCoverage = Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0;
    this.shadowUniforms.cloudShadowCoverage.value = normalizedCoverage;
    this.shadowUniforms.cloudShadowMapSize.value = Math.max(1, shadowMapSize);
    this.object.castShadow = !this.disposed && normalizedCoverage > 0;
  }

  update(
    camera: THREE.Camera,
    deltaSeconds: number,
    options: CloudAdvanceOptions,
    quality: Pick<QualityPreset, "distanceScale">
  ): void {
    this.object.visible = !this.disposed && options.active;
    if (!this.object.visible) return;
    this.elapsedSeconds = advanceCloudElapsedTime(this.elapsedSeconds, deltaSeconds, options);
    const wind = getCloudWindOffset(this.elapsedSeconds);
    const anchorX = getCloudTileAnchor(camera.position.x, wind.x);
    const anchorZ = getCloudTileAnchor(camera.position.z, wind.z);
    const viewDistance = getCloudViewDistance(quality);
    this.uniforms.cloudViewDistance.value = viewDistance;
    let count = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = (anchorX + dx) * CLOUD_TILE_SIZE_METERS + wind.x;
        const z = (anchorZ + dz) * CLOUD_TILE_SIZE_METERS + wind.z;
        const nearestX = Math.max(0, Math.abs(x - camera.position.x) - CLOUD_TILE_SIZE_METERS / 2);
        const nearestZ = Math.max(0, Math.abs(z - camera.position.z) - CLOUD_TILE_SIZE_METERS / 2);
        if (Math.hypot(nearestX, nearestZ) >= viewDistance) continue;
        this.matrix.makeTranslation(x, CLOUD_BASE_HEIGHT_METERS, z);
        this.object.setMatrixAt(count, this.matrix);
        count += 1;
      }
    }
    this.object.count = count;
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.visible = false;
    this.object.castShadow = false;
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.object.customDepthMaterial?.dispose();
    this.object.dispose();
  }

  private createDepthMaterial(): THREE.MeshDepthMaterial {
    // Reuse Three's depth vertex shader, including instanceMatrix, so moving
    // cloud banks and their shadows always use exactly the same geometry.
    const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shadowUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `
          #include <common>
          uniform float cloudShadowCoverage;
          uniform float cloudShadowMapSize;
          float cloudBayer2(vec2 p) {
            return 2.0 * p.x + 3.0 * p.y - 4.0 * p.x * p.y;
          }
        `)
        .replace("#include <clipping_planes_fragment>", `
          #include <clipping_planes_fragment>
          vec2 cloudShadowUv = gl_FragCoord.xy / cloudShadowMapSize;
          float cloudRadius = length(cloudShadowUv * 2.0 - 1.0);
          float cloudEdgeFade = 1.0 - smoothstep(${CLOUD_SHADOW_FULL_RADIUS.toFixed(2)}, 1.0, cloudRadius);
          vec2 cloudPixel = mod(floor(gl_FragCoord.xy), 4.0);
          float cloudThreshold = (4.0 * cloudBayer2(mod(cloudPixel, 2.0)) +
            cloudBayer2(floor(cloudPixel / 2.0)) + 0.5) / 16.0;
          if (cloudThreshold >= cloudShadowCoverage * cloudEdgeFade) discard;
        `);
    };
    // Stable ordered shadow-texel coverage softens daylight and edge fades
    // through the existing PCF filter, without blending depth or a second map.
    // Its radial edge fade cannot reveal the map's hard square boundary.
    material.customProgramCacheKey = () => "voxel-cloud-depth-v1";
    return material;
  }
}

function periodicNoise(x: number, z: number, scale: number): number {
  const px = x / scale;
  const pz = z / scale;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const tx = smoothFraction(px - ix);
  const tz = smoothFraction(pz - iz);
  const period = CLOUD_TILE_CELLS / scale;
  const a = latticeHash(positiveModulo(ix, period), positiveModulo(iz, period));
  const b = latticeHash(positiveModulo(ix + 1, period), positiveModulo(iz, period));
  const c = latticeHash(positiveModulo(ix, period), positiveModulo(iz + 1, period));
  const d = latticeHash(positiveModulo(ix + 1, period), positiveModulo(iz + 1, period));
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

function latticeHash(x: number, z: number): number {
  let hash = Math.imul(x + 17, 374761393) ^ Math.imul(z + 53, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function positiveModulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function smoothFraction(value: number): number {
  return value * value * (3 - 2 * value);
}

function mixColor(a: RgbColorTuple, b: RgbColorTuple, fraction: number): RgbColorTuple {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction];
}
