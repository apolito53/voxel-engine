// @ts-nocheck
import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export { CHUNK_SIZE, WORLD_HEIGHT };

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.dirty = true;
    this.modified = false;
    this.revision = 0;
    this.topBlocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    this.topYs = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    this.topColumnsDirty = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    this.topColumnsDirty.fill(1);
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
    if (!this.inBounds(x, y, z)) return false;
    const blockIndex = this.index(x, y, z);
    if (this.blocks[blockIndex] === block) return false;
    this.blocks[blockIndex] = block;
    this.dirty = true;
    this.revision += 1;
    this.topColumnsDirty[this.columnIndex(x, z)] = 1;
    return true;
  }

  columnIndex(x, z) {
    return x + CHUNK_SIZE * z;
  }

  getTopLocal(x, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
      return { block: BLOCK.air, y: 0 };
    }

    const column = this.columnIndex(x, z);
    if (this.topColumnsDirty[column]) {
      this.rebuildTopColumn(x, z);
    }

    return {
      block: this.topBlocks[column],
      y: this.topYs[column]
    };
  }

  refreshTopColumns() {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        this.rebuildTopColumn(x, z);
      }
    }
  }

  rebuildTopColumn(x, z) {
    const column = this.columnIndex(x, z);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
      const block = this.blocks[this.index(x, y, z)];
      if (!BLOCKS[block].solid) continue;

      this.topBlocks[column] = block;
      this.topYs[column] = y;
      this.topColumnsDirty[column] = 0;
      return;
    }

    this.topBlocks[column] = BLOCK.air;
    this.topYs[column] = 0;
    this.topColumnsDirty[column] = 0;
  }

  rebuildMesh(world, material) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const ox = this.cx * CHUNK_SIZE;
    const oz = this.cz * CHUNK_SIZE;

    this.buildXFaces(world, ox, oz, positions, normals, colors, indices);
    this.buildYFaces(world, ox, oz, positions, normals, colors, indices);
    this.buildZFaces(world, ox, oz, positions, normals, colors, indices);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    if (positions.length > 0) {
      geometry.computeBoundingSphere();
    } else {
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(ox + CHUNK_SIZE / 2, WORLD_HEIGHT / 2, oz + CHUNK_SIZE / 2),
        0
      );
    }

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

  applyMeshData(meshData, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(meshData.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

    const ox = this.cx * CHUNK_SIZE;
    const oz = this.cz * CHUNK_SIZE;
    if (meshData.positions.length > 0) {
      geometry.computeBoundingSphere();
    } else {
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(ox + CHUNK_SIZE / 2, WORLD_HEIGHT / 2, oz + CHUNK_SIZE / 2),
        0
      );
    }

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

  disposeMesh(scene) {
    if (!this.mesh) return;
    if (this.mesh.parent) scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  buildXFaces(world, ox, oz, positions, normals, colors, indices) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      emitGreedyFaces(
        WORLD_HEIGHT,
        CHUNK_SIZE,
        (y, z) => exposedBlock(this, world, x, y, z, ox + x + 1, y, oz + z, 1, 0, 0),
        (y, z, height, width, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [1, 0, 0],
            [
              [ox + x + 1, y, oz + z],
              [ox + x + 1, y + height, oz + z],
              [ox + x + 1, y + height, oz + z + width],
              [ox + x + 1, y, oz + z + width]
            ]
          );
        }
      );

      emitGreedyFaces(
        WORLD_HEIGHT,
        CHUNK_SIZE,
        (y, z) => exposedBlock(this, world, x, y, z, ox + x - 1, y, oz + z, -1, 0, 0),
        (y, z, height, width, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [-1, 0, 0],
            [
              [ox + x, y, oz + z + width],
              [ox + x, y + height, oz + z + width],
              [ox + x, y + height, oz + z],
              [ox + x, y, oz + z]
            ]
          );
        }
      );
    }
  }

  buildYFaces(world, ox, oz, positions, normals, colors, indices) {
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      emitGreedyFaces(
        CHUNK_SIZE,
        CHUNK_SIZE,
        (x, z) => exposedBlock(this, world, x, y, z, ox + x, y + 1, oz + z, 0, 1, 0),
        (x, z, width, depth, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [0, 1, 0],
            [
              [ox + x, y + 1, oz + z + depth],
              [ox + x + width, y + 1, oz + z + depth],
              [ox + x + width, y + 1, oz + z],
              [ox + x, y + 1, oz + z]
            ]
          );
        }
      );

      emitGreedyFaces(
        CHUNK_SIZE,
        CHUNK_SIZE,
        (x, z) => exposedBlock(this, world, x, y, z, ox + x, y - 1, oz + z, 0, -1, 0),
        (x, z, width, depth, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [0, -1, 0],
            [
              [ox + x, y, oz + z],
              [ox + x + width, y, oz + z],
              [ox + x + width, y, oz + z + depth],
              [ox + x, y, oz + z + depth]
            ]
          );
        }
      );
    }
  }

  buildZFaces(world, ox, oz, positions, normals, colors, indices) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      emitGreedyFaces(
        CHUNK_SIZE,
        WORLD_HEIGHT,
        (x, y) => exposedBlock(this, world, x, y, z, ox + x, y, oz + z + 1, 0, 0, 1),
        (x, y, width, height, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [0, 0, 1],
            [
              [ox + x + width, y, oz + z + 1],
              [ox + x + width, y + height, oz + z + 1],
              [ox + x, y + height, oz + z + 1],
              [ox + x, y, oz + z + 1]
            ]
          );
        }
      );

      emitGreedyFaces(
        CHUNK_SIZE,
        WORLD_HEIGHT,
        (x, y) => exposedBlock(this, world, x, y, z, ox + x, y, oz + z - 1, 0, 0, -1),
        (x, y, width, height, block) => {
          addQuad(
            positions,
            normals,
            colors,
            indices,
            block,
            [0, 0, -1],
            [
              [ox + x, y, oz + z],
              [ox + x, y + height, oz + z],
              [ox + x + width, y + height, oz + z],
              [ox + x + width, y, oz + z]
            ]
          );
        }
      );
    }
  }
}

function exposedBlock(chunk, world, x, y, z, nx, ny, nz) {
  const block = chunk.getLocal(x, y, z);
  if (!BLOCKS[block].solid || world.isSolid(nx, ny, nz)) return BLOCK.air;
  return block;
}

function emitGreedyFaces(width, height, getBlock, emit) {
  const consumed = new Uint8Array(width * height);

  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const index = u + v * width;
      if (consumed[index]) continue;

      const block = getBlock(u, v);
      if (block === BLOCK.air) continue;

      let runWidth = 1;
      while (
        u + runWidth < width &&
        !consumed[u + runWidth + v * width] &&
        getBlock(u + runWidth, v) === block
      ) {
        runWidth += 1;
      }

      let runHeight = 1;
      let canGrow = true;
      while (v + runHeight < height && canGrow) {
        for (let du = 0; du < runWidth; du += 1) {
          const nextIndex = u + du + (v + runHeight) * width;
          if (consumed[nextIndex] || getBlock(u + du, v + runHeight) !== block) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) runHeight += 1;
      }

      for (let dv = 0; dv < runHeight; dv += 1) {
        for (let du = 0; du < runWidth; du += 1) {
          consumed[u + du + (v + dv) * width] = 1;
        }
      }

      emit(u, v, runWidth, runHeight, block);
    }
  }
}

function addQuad(positions, normals, colors, indices, block, normal, corners) {
  const base = positions.length / 3;
  const shade = normal[1] > 0 ? 1 : normal[1] < 0 ? 0.45 : 0.72;
  const color = BLOCKS[block].color.map((channel) => channel * shade);

  for (const corner of corners) {
    positions.push(corner[0], corner[1], corner[2]);
    normals.push(...normal);
    colors.push(...color);
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
