import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks.js";

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;

const FACE_DEFS = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1]
    ]
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0]
    ]
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0]
    ]
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1]
    ]
  },
  {
    normal: [0, 0, 1],
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1]
    ]
  },
  {
    normal: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0]
    ]
  }
];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.dirty = true;
  }

  index(x, y, z) {
    return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  }

  inBounds(x, y, z) {
    return (
      x >= 0 &&
      x < CHUNK_SIZE &&
      y >= 0 &&
      y < WORLD_HEIGHT &&
      z >= 0 &&
      z < CHUNK_SIZE
    );
  }

  getLocal(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.air;
    return this.blocks[this.index(x, y, z)];
  }

  setLocal(x, y, z, block) {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[this.index(x, y, z)] = block;
    this.dirty = true;
  }

  rebuildMesh(world, material) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const ox = this.cx * CHUNK_SIZE;
    const oz = this.cz * CHUNK_SIZE;

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < CHUNK_SIZE; z += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const block = this.getLocal(x, y, z);
          if (!BLOCKS[block].solid) continue;

          for (const face of FACE_DEFS) {
            const nx = ox + x + face.normal[0];
            const ny = y + face.normal[1];
            const nz = oz + z + face.normal[2];
            if (world.isSolid(nx, ny, nz)) continue;

            const base = positions.length / 3;
            const shade = face.normal[1] > 0 ? 1 : face.normal[1] < 0 ? 0.45 : 0.72;
            const color = BLOCKS[block].color.map((channel) => channel * shade);

            for (const corner of face.corners) {
              positions.push(ox + x + corner[0], y + corner[1], oz + z + corner[2]);
              normals.push(...face.normal);
              colors.push(...color);
            }

            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    } else {
      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
    }

    this.dirty = false;
    return this.mesh;
  }
}
