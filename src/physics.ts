import * as THREE from "three";
import { BLOCKS } from "./blocks";
import type { CollisionWorld } from "./collision";

export const BLOCK_DAMAGE_IMPACT_SPEED = 2;

export type PhysicsImpact = {
  readonly block: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly normal: THREE.Vector3;
  readonly speed: number;
  readonly position: THREE.Vector3;
};

type PhysicsToyOptions = {
  readonly radius?: number;
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: THREE.MeshStandardMaterial;
  readonly damagesBlocks?: boolean;
};

export class PhysicsToy {
  readonly radius: number;
  readonly velocity: THREE.Vector3;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly damagesBlocks: boolean;

  constructor(position: THREE.Vector3, velocity: THREE.Vector3, options: PhysicsToyOptions = {}) {
    this.radius = options.radius ?? 0.35;
    this.velocity = velocity.clone();
    this.mesh = new THREE.Mesh(
      options.geometry ?? new THREE.SphereGeometry(this.radius, 18, 12),
      options.material ?? new THREE.MeshStandardMaterial({
        color: 0xff3d52,
        roughness: 0.48,
        metalness: 0.1,
        emissive: 0x330008
      })
    );
    this.damagesBlocks = options.damagesBlocks ?? true;
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);
  }

  static createBlockFragment(block: number, position: THREE.Vector3, velocity: THREE.Vector3): PhysicsToy {
    const definition = BLOCKS[block];
    const fragmentColor = new THREE.Color().setRGB(
      definition.color[0],
      definition.color[1],
      definition.color[2]
    );

    return new PhysicsToy(position, velocity, {
      radius: 0.21,
      geometry: new THREE.BoxGeometry(0.34, 0.34, 0.34),
      material: new THREE.MeshStandardMaterial({
        color: fragmentColor,
        roughness: 0.88,
        metalness: 0.02
      }),
      damagesBlocks: false
    });
  }

  update(delta: number, world: CollisionWorld): PhysicsImpact[] {
    const impacts: PhysicsImpact[] = [];
    this.velocity.y -= 18 * delta;
    this.mesh.position.addScaledVector(this.velocity, delta);

    const p = this.mesh.position;
    const minX = Math.floor(p.x - this.radius);
    const maxX = Math.floor(p.x + this.radius);
    const minY = Math.floor(p.y - this.radius);
    const maxY = Math.floor(p.y + this.radius);
    const minZ = Math.floor(p.z - this.radius);
    const maxZ = Math.floor(p.z + this.radius);

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!world.isSolid(x, y, z)) continue;

          const closest = new THREE.Vector3(
            Math.max(x, Math.min(p.x, x + 1)),
            Math.max(y, Math.min(p.y, y + 1)),
            Math.max(z, Math.min(p.z, z + 1))
          );
          const deltaToCenter = p.clone().sub(closest);
          const distance = deltaToCenter.length();
          if (distance >= this.radius || distance === 0) continue;

          const normal = deltaToCenter.multiplyScalar(1 / distance);
          p.addScaledVector(normal, this.radius - distance + 0.001);
          const impact = this.velocity.dot(normal);
          if (impact < 0) {
            if (this.damagesBlocks) {
              impacts.push({
                block: { x, y, z },
                normal: normal.clone(),
                speed: -impact,
                position: p.clone()
              });
            }
            this.velocity.addScaledVector(normal, -impact * 1.55);
            this.velocity.multiplyScalar(0.985);
          }
        }
      }
    }

    return impacts;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
