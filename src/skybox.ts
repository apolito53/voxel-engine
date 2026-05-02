import * as THREE from "three";

const SKYBOX_TEXTURE_URL = new URL("./assets/skybox-sunlit-day.png", import.meta.url).href;
const SKYBOX_RADIUS_METERS = 96;

export type Skybox = {
  readonly object: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  update(camera: THREE.Camera): void;
  dispose(): void;
};

export function createSkybox(sunOffset: THREE.Vector3): Skybox {
  const texture = new THREE.TextureLoader().load(SKYBOX_TEXTURE_URL);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS_METERS, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  material.toneMapped = false;

  const object = new THREE.Mesh(geometry, material);
  object.name = "Sunlit day skybox";
  object.frustumCulled = false;
  object.renderOrder = -1000;
  object.rotation.y = getSkyboxYawForSunDirection(sunOffset);

  return {
    object,
    update(camera: THREE.Camera): void {
      // The sphere is just a visual background. Keep it centered on the camera
      // so quality presets and render-distance changes never clip the sky.
      object.position.copy(camera.position);
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  };
}

function getSkyboxYawForSunDirection(sunOffset: THREE.Vector3): number {
  // The generated equirectangular texture has its sun in the right half of the
  // panorama. Rotating that longitude toward the real directional-light vector
  // makes the visible sun read as the source of the current shadows.
  const targetAzimuth = Math.atan2(sunOffset.x, sunOffset.z);
  const generatedSunAzimuth = Math.PI * 0.5;
  return targetAzimuth - generatedSunAzimuth;
}
