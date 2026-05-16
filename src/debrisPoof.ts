import * as THREE from "three";
import { BLOCKS } from "./blocks";

const DEBRIS_POOF_LIFETIME_SECONDS = 0.42;
const DEBRIS_POOF_PARTICLES = 7;
const DEBRIS_POOF_MAX_ACTIVE = 96;
const DEBRIS_POOF_BASE_OPACITY = 0.34;
const DEBRIS_POOF_BASE_SCALE = 0.045;
const DEBRIS_POOF_SCALE_RANGE = 0.055;
const DEBRIS_POOF_SPEED_MIN = 0.28;
const DEBRIS_POOF_SPEED_RANGE = 0.42;
const DEBRIS_POOF_UPWARD_BIAS = 0.18;

type DebrisPoofParticle = {
  readonly mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  readonly velocity: THREE.Vector3;
  readonly baseScale: number;
  readonly spin: THREE.Vector3;
};

type DebrisPoof = {
  readonly group: THREE.Group;
  readonly material: THREE.MeshBasicMaterial;
  readonly particles: DebrisPoofParticle[];
  ageSeconds: number;
};

export type DebrisPoofStats = {
  readonly activePoofs: number;
  readonly activeParticles: number;
};

export class DebrisPoofRenderer {
  private readonly particleGeometry = new THREE.IcosahedronGeometry(1, 0);
  private readonly activePoofs: DebrisPoof[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawn(position: THREE.Vector3, block: number | null): void {
    if (this.activePoofs.length >= DEBRIS_POOF_MAX_ACTIVE) {
      this.removeAt(0);
    }

    const material = this.createPoofMaterial(block);
    const group = new THREE.Group();
    group.name = "Material poof";
    group.position.copy(position);
    group.renderOrder = 25;

    const particles: DebrisPoofParticle[] = [];
    for (let index = 0; index < DEBRIS_POOF_PARTICLES; index += 1) {
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.name = "Material poof particle";
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 25;

      const velocity = createPoofParticleVelocity(index);
      const baseScale = DEBRIS_POOF_BASE_SCALE + Math.random() * DEBRIS_POOF_SCALE_RANGE;
      mesh.position.copy(velocity).multiplyScalar(0.04 + Math.random() * 0.05);
      mesh.scale.setScalar(baseScale);
      group.add(mesh);
      particles.push({
        mesh,
        velocity,
        baseScale,
        spin: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).multiplyScalar(3.5)
      });
    }

    this.scene.add(group);
    this.activePoofs.push({ group, material, particles, ageSeconds: 0 });
  }

  update(deltaSeconds: number): void {
    if (this.activePoofs.length === 0) return;

    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (let index = this.activePoofs.length - 1; index >= 0; index -= 1) {
      const poof = this.activePoofs[index];
      if (!poof) continue;

      poof.ageSeconds += safeDelta;
      updatePoofVisual(poof, safeDelta);
      if (poof.ageSeconds >= DEBRIS_POOF_LIFETIME_SECONDS) {
        this.removeAt(index);
      }
    }
  }

  getStats(): DebrisPoofStats {
    return {
      activePoofs: this.activePoofs.length,
      activeParticles: this.activePoofs.reduce((sum, poof) => sum + poof.particles.length, 0)
    };
  }

  clear(): void {
    for (let index = this.activePoofs.length - 1; index >= 0; index -= 1) {
      this.removeAt(index);
    }
  }

  dispose(): void {
    this.clear();
    this.particleGeometry.dispose();
  }

  private createPoofMaterial(block: number | null): THREE.MeshBasicMaterial {
    const definition = block === null ? undefined : BLOCKS[block];
    const color = definition
      ? new THREE.Color(definition.color[0], definition.color[1], definition.color[2])
      : new THREE.Color(0.62, 0.62, 0.56);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: DEBRIS_POOF_BASE_OPACITY,
      depthWrite: false,
      depthTest: true,
      fog: true
    });
    material.toneMapped = false;
    return material;
  }

  private removeAt(index: number): void {
    const poof = this.activePoofs[index];
    if (!poof) return;

    this.scene.remove(poof.group);
    poof.group.clear();
    poof.material.dispose();
    this.activePoofs.splice(index, 1);
  }
}

export function getDebrisPoofLifetimeSeconds(): number {
  return DEBRIS_POOF_LIFETIME_SECONDS;
}

function createPoofParticleVelocity(index: number): THREE.Vector3 {
  const angle = (index / DEBRIS_POOF_PARTICLES) * Math.PI * 2 + Math.random() * 0.45;
  const upward = DEBRIS_POOF_UPWARD_BIAS + Math.random() * 0.3;
  const radial = 0.75 + Math.random() * 0.55;
  const velocity = new THREE.Vector3(
    Math.cos(angle) * radial,
    upward,
    Math.sin(angle) * radial
  );
  return velocity.normalize().multiplyScalar(DEBRIS_POOF_SPEED_MIN + Math.random() * DEBRIS_POOF_SPEED_RANGE);
}

function updatePoofVisual(poof: DebrisPoof, deltaSeconds: number): void {
  const progress = Math.min(1, poof.ageSeconds / DEBRIS_POOF_LIFETIME_SECONDS);
  const fade = 1 - easeOutQuad(progress);
  poof.material.opacity = DEBRIS_POOF_BASE_OPACITY * fade;

  for (const particle of poof.particles) {
    particle.mesh.position.addScaledVector(particle.velocity, deltaSeconds);
    particle.mesh.rotation.x += particle.spin.x * deltaSeconds;
    particle.mesh.rotation.y += particle.spin.y * deltaSeconds;
    particle.mesh.rotation.z += particle.spin.z * deltaSeconds;
    particle.mesh.scale.setScalar(particle.baseScale * (1 + progress * 1.8));
  }
}

function easeOutQuad(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return 1 - (1 - clamped) * (1 - clamped);
}
