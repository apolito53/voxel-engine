import * as THREE from "three";
import {
  getLocalLightDefinition,
  type LocalLightSelection
} from "./localLights";
import type { QualityPreset } from "./qualityPresets";

export class LocalLightRenderer {
  private readonly scene: THREE.Scene;
  private readonly lights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(sources: readonly LocalLightSelection[], preset: QualityPreset): void {
    this.ensureLightPool(preset.localLightBudget);

    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      const source = sources[index];
      if (!source || index >= preset.localLightBudget) {
        light.visible = false;
        light.castShadow = false;
        continue;
      }

      const definition = getLocalLightDefinition(source.block);
      if (!definition) {
        light.visible = false;
        light.castShadow = false;
        continue;
      }

      light.visible = true;
      light.color.setHex(definition.color);
      light.intensity = definition.intensity * source.intensityScale;
      light.distance = definition.distance * source.distanceScale;
      light.decay = definition.decay;
      light.position.set(source.centerX, source.centerY, source.centerZ);

      // Point-light shadows are cubemap shadows, so the cap is deliberately
      // separate from "how many lamps can glow." This keeps local lights useful
      // on modest settings while letting high settings spend shadow work nearby.
      const castsShadow = preset.shadows && index < preset.localLightShadowBudget;
      light.castShadow = castsShadow;
      if (castsShadow) {
        light.shadow.mapSize.set(preset.localLightShadowMapSize, preset.localLightShadowMapSize);
        light.shadow.camera.near = 0.05;
        light.shadow.camera.far = light.distance;
        light.shadow.bias = -0.00008;
        light.shadow.normalBias = 0.012;
      }
    }
  }

  hide(): void {
    for (const light of this.lights) {
      light.visible = false;
      light.castShadow = false;
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
  }

  private ensureLightPool(budget: number): void {
    const targetCount = Math.max(0, Math.floor(budget));
    while (this.lights.length < targetCount) {
      const light = new THREE.PointLight(0xffb45f, 0, 12, 1.75);
      light.visible = false;
      light.name = `Local voxel light ${this.lights.length + 1}`;
      this.scene.add(light);
      this.lights.push(light);
    }
  }
}
