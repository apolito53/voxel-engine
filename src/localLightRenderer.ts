import * as THREE from "three";
import {
  getLocalLightDefinition,
  type LocalLightSelection
} from "./localLights";
import type { QualityPreset } from "./qualityPresets";

const LOCAL_LIGHT_IDLE_Y = -10000;

export type LocalLightRendererStats = {
  readonly sourceCount: number;
  readonly activePointLights: number;
  readonly pointLightCapacity: number;
  readonly allocatedPointLights: number;
  readonly blockLightOnlySources: number;
  readonly shadowCastingPointLights: number;
};

function createEmptyLocalLightRendererStats(allocatedPointLights = 0): LocalLightRendererStats {
  return {
    sourceCount: 0,
    activePointLights: 0,
    pointLightCapacity: 0,
    allocatedPointLights,
    blockLightOnlySources: 0,
    shadowCastingPointLights: 0
  };
}

export class LocalLightRenderer {
  private readonly scene: THREE.Scene;
  private readonly lights: THREE.PointLight[] = [];
  private lastStats = createEmptyLocalLightRendererStats();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(sources: readonly LocalLightSelection[], preset: QualityPreset): void {
    const pointLightCapacity = normalizePointLightCapacity(preset.localLightPointProxyCapacity);
    this.ensureLightPool(pointLightCapacity);

    let activePointLights = 0;
    let shadowCastingPointLights = 0;
    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      if (index >= pointLightCapacity) {
        this.deactivateLight(light, false);
        continue;
      }

      const source = sources[index];
      if (!source) {
        // Keep every slot inside the current preset's budget visible at zero
        // intensity. Three.js compiles the visible light count into material
        // programs, so source churn must not create a new shader variant.
        this.deactivateLight(light, true);
        continue;
      }

      const definition = getLocalLightDefinition(source.block);
      if (!definition) {
        this.deactivateLight(light, true);
        continue;
      }

      light.visible = true;
      light.color.setHex(definition.color);
      light.intensity = definition.intensity * source.intensityScale;
      light.distance = definition.distance * source.distanceScale;
      light.decay = definition.decay;
      light.position.set(source.centerX, source.centerY, source.centerZ);

      // Lamp shadow maps stay parked until the emitter voxel can be excluded
      // from its own cube-map. Block light supplies occluded terrain spill;
      // these proxies are now only the smoother near-field highlight layer.
      light.castShadow = false;
      activePointLights += 1;
      if (light.castShadow) shadowCastingPointLights += 1;
    }

    this.lastStats = {
      sourceCount: sources.length,
      activePointLights,
      pointLightCapacity,
      allocatedPointLights: this.lights.length,
      // Overflow Lamps still glow and illuminate terrain through cached voxel
      // block light. They skip only the expensive per-fragment PointLight pass.
      blockLightOnlySources: Math.max(0, sources.length - activePointLights),
      shadowCastingPointLights
    };
  }

  hide(): void {
    for (const light of this.lights) {
      light.visible = false;
      light.castShadow = false;
    }
    this.lastStats = createEmptyLocalLightRendererStats(this.lights.length);
  }

  getStats(): LocalLightRendererStats {
    return this.lastStats;
  }

  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
    this.lastStats = createEmptyLocalLightRendererStats();
  }

  private ensureLightPool(capacity: number): void {
    while (this.lights.length < capacity) {
      const light = new THREE.PointLight(0xffb45f, 0, 12, 1.75);
      // Allocation follows a high-water mark. Lower quality presets hide extra
      // objects instead of destroying them, so returning to a larger preset
      // reuses the same PointLights and cached shader program.
      light.visible = false;
      light.castShadow = false;
      light.position.set(0, LOCAL_LIGHT_IDLE_Y, 0);
      light.name = `Local voxel light ${this.lights.length + 1}`;
      this.scene.add(light);
      this.lights.push(light);
    }
  }

  private deactivateLight(light: THREE.PointLight, keepInShader: boolean): void {
    light.visible = keepInShader;
    light.intensity = 0;
    light.castShadow = false;
    light.position.set(0, LOCAL_LIGHT_IDLE_Y, 0);
  }
}

function normalizePointLightCapacity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
