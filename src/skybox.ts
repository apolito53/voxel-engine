import * as THREE from "three";

const SKYBOX_TEXTURE_URL = new URL("./assets/skybox-sunlit-day.png", import.meta.url).href;
const SKYBOX_RADIUS_METERS = 96;
const SKYBOX_UP_AXIS = new THREE.Vector3(0, 1, 0);

// Measured from the generated panorama's brightest sun-disc centroid. Three's
// SphereGeometry maps horizontal UVs with 0.25 at +Z, 0.5 at +X, and 0.75 at
// -Z, so these asset-space values need a real conversion before yaw alignment.
const GENERATED_SKYBOX_SUN_U = 0.7637;
const GENERATED_SKYBOX_SUN_TOP_V = 0.2756;

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

export function getSkyboxYawForSunDirection(sunOffset: THREE.Vector3): number {
  const targetAzimuth = getHorizontalAzimuth(sunOffset);
  const generatedSunAzimuth = getHorizontalAzimuth(getGeneratedSkyboxSunDirection());
  return targetAzimuth - generatedSunAzimuth;
}

export function getSkyboxAlignedSunDirection(
  sunOffset: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  return getGeneratedSkyboxSunDirection(target)
    .applyAxisAngle(SKYBOX_UP_AXIS, getSkyboxYawForSunDirection(sunOffset))
    .normalize();
}

function getGeneratedSkyboxSunDirection(target = new THREE.Vector3()): THREE.Vector3 {
  const phi = GENERATED_SKYBOX_SUN_U * Math.PI * 2;
  const theta = GENERATED_SKYBOX_SUN_TOP_V * Math.PI;
  const horizontal = Math.sin(theta);

  return target
    .set(
      -Math.cos(phi) * horizontal,
      Math.cos(theta),
      Math.sin(phi) * horizontal
    )
    .normalize();
}

function getHorizontalAzimuth(direction: THREE.Vector3): number {
  return Math.atan2(direction.x, direction.z);
}
