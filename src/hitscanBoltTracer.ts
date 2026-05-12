import * as THREE from "three";

const HITSCAN_BOLT_TEXTURE_URL = new URL("./assets/hitscan-energy-bolt.png", import.meta.url).href;
const HITSCAN_BOLT_MIN_DISTANCE_METERS = 0.25;
const HITSCAN_BOLT_RADIUS_METERS = 0.085;
const HITSCAN_BOLT_TEXTURE_DIAMETER_METERS = 0.42;
const HITSCAN_BOLT_LIFETIME_SECONDS = 0.14;
const HITSCAN_BOLT_FORWARD_EPSILON = 0.000001;
const HITSCAN_BOLT_AXIS = new THREE.Vector3(1, 0, 0);
const HITSCAN_BOLT_PLANE_ROTATIONS = [0, Math.PI / 3, Math.PI * 2 / 3] as const;

type HitscanBoltInstance = {
  readonly group: THREE.Group;
  readonly materials: THREE.Material[];
  ageSeconds: number;
};

export class HitscanBoltTracer {
  private readonly texture: THREE.Texture;
  private readonly cylinderGeometry = createUnitBeamCylinderGeometry();
  private readonly planeGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly activeBolts: HitscanBoltInstance[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.texture = new THREE.TextureLoader().load(HITSCAN_BOLT_TEXTURE_URL);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  spawn(start: THREE.Vector3, end: THREE.Vector3): void {
    const beam = createSafeBeamSegment(start, end);
    if (!beam) return;

    const group = new THREE.Group();
    group.name = "Hitscan energy beam";
    group.position.copy(beam.midpoint);
    group.quaternion.setFromUnitVectors(HITSCAN_BOLT_AXIS, beam.direction);
    group.renderOrder = 40;

    const materials = this.createBeamMaterials();
    const coreMaterial = materials[0];
    const core = new THREE.Mesh(this.cylinderGeometry, coreMaterial);
    core.name = "Hitscan energy beam core";
    core.renderOrder = 40;
    core.frustumCulled = false;
    core.scale.set(beam.length, HITSCAN_BOLT_RADIUS_METERS, HITSCAN_BOLT_RADIUS_METERS);
    group.add(core);

    for (let index = 0; index < HITSCAN_BOLT_PLANE_ROTATIONS.length; index += 1) {
      const material = materials[index + 1];
      const plane = new THREE.Mesh(this.planeGeometry, material);
      plane.name = "Hitscan energy beam texture wrap";
      plane.renderOrder = 41;
      plane.frustumCulled = false;
      plane.rotation.x = HITSCAN_BOLT_PLANE_ROTATIONS[index] ?? 0;
      plane.scale.set(beam.length, HITSCAN_BOLT_TEXTURE_DIAMETER_METERS, 1);
      group.add(plane);
    }

    this.activeBolts.push({ group, materials, ageSeconds: 0 });
    this.scene.add(group);
  }

  update(deltaSeconds: number): void {
    if (this.activeBolts.length === 0) return;

    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (let index = this.activeBolts.length - 1; index >= 0; index -= 1) {
      const bolt = this.activeBolts[index];
      if (!bolt) continue;

      bolt.ageSeconds += safeDelta;
      updateBeamVisual(bolt);

      if (bolt.ageSeconds >= HITSCAN_BOLT_LIFETIME_SECONDS) {
        this.removeAt(index);
      }
    }
  }

  clear(): void {
    for (let index = this.activeBolts.length - 1; index >= 0; index -= 1) {
      this.removeAt(index);
    }
  }

  dispose(): void {
    this.clear();
    this.texture.dispose();
    this.cylinderGeometry.dispose();
    this.planeGeometry.dispose();
  }

  private createBeamMaterials(): THREE.Material[] {
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x8cecff,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide
    });
    coreMaterial.toneMapped = false;

    const textureMaterials = HITSCAN_BOLT_PLANE_ROTATIONS.map(() => {
      const material = new THREE.MeshBasicMaterial({
        map: this.texture,
        color: 0xd8fbff,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false,
        side: THREE.DoubleSide
      });
      material.toneMapped = false;
      return material;
    });

    return [coreMaterial, ...textureMaterials];
  }

  private removeAt(index: number): void {
    const bolt = this.activeBolts[index];
    if (!bolt) return;

    this.scene.remove(bolt.group);
    for (const material of bolt.materials) {
      material.dispose();
    }
    bolt.group.clear();
    this.activeBolts.splice(index, 1);
  }
}

export function getHitscanBoltLifetimeSeconds(): number {
  return HITSCAN_BOLT_LIFETIME_SECONDS;
}

function createSafeBeamSegment(
  start: THREE.Vector3,
  end: THREE.Vector3
): {
  readonly midpoint: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly length: number;
} | null {
  const offset = end.clone().sub(start);
  const distance = offset.length();
  if (!Number.isFinite(distance)) return null;

  if (distance <= HITSCAN_BOLT_FORWARD_EPSILON) return null;

  const direction = offset.clone().normalize();
  const length = Math.max(HITSCAN_BOLT_MIN_DISTANCE_METERS, distance);
  const safeEnd = start.clone().addScaledVector(direction, length);

  return {
    midpoint: start.clone().add(safeEnd).multiplyScalar(0.5),
    direction,
    length
  };
}

function updateBeamVisual(bolt: HitscanBoltInstance): void {
  const lifeProgress = Math.min(1, bolt.ageSeconds / HITSCAN_BOLT_LIFETIME_SECONDS);
  const opacity = 1 - easeInQuad(lifeProgress);
  const pulse = 1 + Math.sin(lifeProgress * Math.PI) * 0.16;
  bolt.group.scale.set(1, pulse, pulse);

  for (const material of bolt.materials) {
    material.opacity = getBaseMaterialOpacity(material) * opacity;
  }
}

function getBaseMaterialOpacity(material: THREE.Material): number {
  if (material instanceof THREE.MeshBasicMaterial && material.map) return 0.72;
  return 0.38;
}

function easeInQuad(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped;
}

function createUnitBeamCylinderGeometry(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
  // Three's cylinder height axis is Y by default. Rotate the shared unit mesh
  // so local X becomes the beam length, matching the generated bolt texture.
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}
