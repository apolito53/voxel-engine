import { BLOCK } from "./blocks.js";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk.js";
import { fbm2 } from "./math.js";

const LOAD_RADIUS = 4;
const UNLOAD_RADIUS = 5;
const MAX_CHUNK_REBUILDS_PER_FRAME = 4;

export class VoxelWorld {
  constructor() {
    this.chunks = new Map();
    this.savedChunks = new Map();
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.key(cx, cz));
  }

  ensureChunk(cx, cz) {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      const savedBlocks = this.savedChunks.get(key);
      if (savedBlocks) {
        chunk.blocks.set(savedBlocks);
        chunk.refreshTopColumns();
        chunk.modified = true;
      } else {
        this.generateChunk(chunk);
      }
      this.chunks.set(key, chunk);
      this.markNeighborChunksDirty(cx, cz);
    }
    return chunk;
  }

  generateInitialWorld() {
    this.ensureChunksAround(0, 0);
  }

  ensureChunksAround(x, z, radius = LOAD_RADIUS) {
    const center = this.toChunkCoords(x, z);
    for (let cz = center.cz - radius; cz <= center.cz + radius; cz += 1) {
      for (let cx = center.cx - radius; cx <= center.cx + radius; cx += 1) {
        this.ensureChunk(cx, cz);
      }
    }
    return center;
  }

  streamChunksAround(
    x,
    z,
    scene,
    loadRadius = LOAD_RADIUS,
    unloadRadius = UNLOAD_RADIUS
  ) {
    const center = this.ensureChunksAround(x, z, loadRadius);
    this.unloadChunksOutside(center.cx, center.cz, unloadRadius, scene);
    return center;
  }

  generateChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const wx = ox + x;
        const wz = oz + z;
        const continent = fbm2(wx * 0.018, wz * 0.018, 4);
        const detail = fbm2(wx * 0.07 + 9.2, wz * 0.07 - 4.8, 3);
        const height = Math.floor(8 + continent * 18 + detail * 5);
        for (let y = 0; y < WORLD_HEIGHT; y += 1) {
          if (y > height) continue;
          let block = BLOCK.stone;
          if (y === height) block = height < 14 ? BLOCK.sand : BLOCK.grass;
          else if (y > height - 4) block = BLOCK.dirt;
          chunk.setLocal(x, y, z, block);
        }
      }
    }
    chunk.dirty = true;
    chunk.modified = false;
    chunk.refreshTopColumns();
  }

  toChunkCoords(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((Math.floor(x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cz, lx, lz };
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.air;
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    return this.getChunk(cx, cz)?.getLocal(lx, Math.floor(y), lz) ?? BLOCK.air;
  }

  setBlock(x, y, z, block) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    const chunk = this.ensureChunk(cx, cz);
    if (!chunk.setLocal(lx, Math.floor(y), lz, block)) return;
    chunk.modified = true;

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  markNeighborChunksDirty(cx, cz) {
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
  }

  unloadChunksOutside(centerCx, centerCz, unloadRadius, scene) {
    for (const [key, chunk] of Array.from(this.chunks.entries())) {
      const distance = Math.max(
        Math.abs(chunk.cx - centerCx),
        Math.abs(chunk.cz - centerCz)
      );
      if (distance <= unloadRadius) continue;

      if (chunk.modified) {
        this.savedChunks.set(key, chunk.blocks.slice());
      } else {
        this.savedChunks.delete(key);
      }

      chunk.disposeMesh(scene);
      this.chunks.delete(key);
      this.markNeighborChunksDirty(chunk.cx, chunk.cz);
    }
  }

  isSolid(x, y, z) {
    if (y < 0) return true;
    const block = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return block !== BLOCK.air;
  }

  rebuildDirty(scene, material, maxRebuilds = MAX_CHUNK_REBUILDS_PER_FRAME) {
    let rebuilt = 0;
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty) continue;
      const mesh = chunk.rebuildMesh(this, material);
      if (!mesh.parent) scene.add(mesh);
      rebuilt += 1;
      if (rebuilt >= maxRebuilds) break;
    }
    return rebuilt;
  }

  getStats() {
    let dirtyChunks = 0;
    let modifiedChunks = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) dirtyChunks += 1;
      if (chunk.modified) modifiedChunks += 1;
    }

    return {
      loadedChunks: this.chunks.size,
      savedChunks: this.savedChunks.size,
      dirtyChunks,
      modifiedChunks
    };
  }

  highestSolidY(x, z) {
    return this.getTopBlock(x, z).y;
  }

  getTopBlock(x, z) {
    const { cx, cz, lx, lz } = this.toChunkCoords(x, z);
    return this.getChunk(cx, cz)?.getTopLocal(lx, lz) ?? { block: BLOCK.air, y: 0 };
  }
}
