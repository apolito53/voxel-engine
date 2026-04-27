// @ts-nocheck
import * as THREE from "three";

export class PhysicsToy {
  constructor(position, velocity) {
    this.radius = 0.35;
    this.velocity = velocity.clone();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 18, 12),
      new THREE.MeshStandardMaterial({
        color: 0xff3d52,
        roughness: 0.48,
        metalness: 0.1,
        emissive: 0x330008
      })
    );
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);
  }

  update(delta, world) {
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
            this.velocity.addScaledVector(normal, -impact * 1.55);
            this.velocity.multiplyScalar(0.985);
          }
        }
      }
    }
  }
}
