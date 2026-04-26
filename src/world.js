import { BLOCK } from "./blocks.js";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk.js";
import { createChunkStorage } from "./chunkStorage.js";
import { createTerrainContext, generateChunkBlocks } from "./terrain.js";

const LOAD_RADIUS = 4;
const UNLOAD_RADIUS = 5;
const MAX_CHUNK_LOADS_PER_FRAME = 2;
const MAX_CHUNK_REBUILDS_PER_FRAME = 4;

export class VoxelWorld {
  constructor({ storage = createChunkStorage(), seed = "" } = {}) {
    this.chunks = new Map();
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed);
    // savedChunks mirrors persisted edited chunks; generated terrain is never stored.
    this.savedChunks = this.storage.loadAll();
    this.chunkLoadQueue = new Map();
    this.pendingChunkLoads = new Map();
    this.pendingChunkKeys = new Set();
    this.pendingMeshBuilds = new Map();
    this.pendingMeshKeys = new Set();
    this.workerResults = [];
    this.workerRequestId = 0;
    this.worker = this.createWorker();
    this.priorityCx = 0;
    this.priorityCz = 0;
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
  }

  switchStorage(storage, scene, seed = "") {
    this.disposeLoadedChunks(scene);
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed);
    // Switching worlds swaps the saved edit set; generated chunks will stream back in normally.
    this.savedChunks = this.storage.loadAll();
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
  }

  disposeLoadedChunks(scene) {
    // Meshes belong to the currently active world; world switches and home exits drop them all.
    for (const chunk of this.chunks.values()) {
      chunk.disposeMesh(scene);
    }
    this.chunks.clear();
    this.chunkLoadQueue.clear();
    this.pendingChunkLoads.clear();
    this.pendingChunkKeys.clear();
    this.pendingMeshBuilds.clear();
    this.pendingMeshKeys.clear();
    this.workerResults.length = 0;
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.key(cx, cz));
  }

  createWorker() {
    if (typeof Worker === "undefined") return null;

    const worker = new Worker(new URL("./chunkWorker.js", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event) => {
      this.workerResults.push(event.data);
    };
    worker.onerror = (event) => {
      console.error("Chunk worker failed", event.message);
      worker.terminate();
      this.worker = null;
      this.pendingChunkLoads.clear();
      this.pendingChunkKeys.clear();
      this.pendingMeshBuilds.clear();
      this.pendingMeshKeys.clear();
    };
    return worker;
  }

  ensureChunk(cx, cz) {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      const savedBlocks = this.savedChunks.get(key);
      if (savedBlocks) {
        // Saved chunks are full block snapshots, so loading one replaces terrain generation.
        this.populateChunk(chunk, savedBlocks);
        chunk.modified = true;
      } else {
        this.generateChunk(chunk);
      }
      this.chunks.set(key, chunk);
      this.chunkLoadQueue.delete(key);
      this.markNeighborChunksDirty(cx, cz);
    }
    return chunk;
  }

  populateChunk(chunk, blocks) {
    chunk.blocks.set(blocks);
    chunk.refreshTopColumns();
    chunk.dirty = true;
    chunk.revision = 0;
  }

  addGeneratedChunk(cx, cz, blocks, modified = false) {
    const key = this.key(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this.populateChunk(chunk, blocks);
    chunk.modified = modified;
    this.chunks.set(key, chunk);
    this.chunkLoadQueue.delete(key);
    this.pendingChunkKeys.delete(key);
    this.markNeighborChunksDirty(cx, cz);
    return chunk;
  }

  generateInitialWorld() {
    this.ensureChunksAround(0, 0);
  }

  ensureChunksAround(x, z, radius = LOAD_RADIUS) {
    const center = this.toChunkCoords(x, z);
    this.priorityCx = center.cx;
    this.priorityCz = center.cz;
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
    unloadRadius = UNLOAD_RADIUS,
    maxLoads = MAX_CHUNK_LOADS_PER_FRAME
  ) {
    this.processGeneratedChunkResults();
    const center = this.toChunkCoords(x, z);
    this.priorityCx = center.cx;
    this.priorityCz = center.cz;
    this.queueChunksAround(center.cx, center.cz, loadRadius);
    this.pruneQueuedChunks(center.cx, center.cz, loadRadius);
    this.lastRequestedChunkLoads = this.requestQueuedChunkLoads(
      center.cx,
      center.cz,
      maxLoads
    );
    this.unloadChunksOutside(center.cx, center.cz, unloadRadius, scene);
    return center;
  }

  queueChunksAround(centerCx, centerCz, radius = LOAD_RADIUS) {
    for (let cz = centerCz - radius; cz <= centerCz + radius; cz += 1) {
      for (let cx = centerCx - radius; cx <= centerCx + radius; cx += 1) {
        const key = this.key(cx, cz);
        if (
          this.chunks.has(key) ||
          this.chunkLoadQueue.has(key) ||
          this.pendingChunkKeys.has(key)
        ) {
          continue;
        }

        this.chunkLoadQueue.set(key, {
          cx,
          cz
        });
      }
    }
  }

  pruneQueuedChunks(centerCx, centerCz, radius = LOAD_RADIUS) {
    for (const [key, queued] of this.chunkLoadQueue.entries()) {
      const distance = Math.max(
        Math.abs(queued.cx - centerCx),
        Math.abs(queued.cz - centerCz)
      );
      if (distance > radius || this.chunks.has(key)) {
        this.chunkLoadQueue.delete(key);
      }
    }
  }

  requestQueuedChunkLoads(centerCx, centerCz, maxLoads = MAX_CHUNK_LOADS_PER_FRAME) {
    if (maxLoads <= 0) return 0;

    const queuedChunks = Array.from(this.chunkLoadQueue.values()).sort(
      (a, b) => {
        const ax = a.cx - centerCx;
        const az = a.cz - centerCz;
        const bx = b.cx - centerCx;
        const bz = b.cz - centerCz;
        const aDistance = ax * ax + az * az;
        const bDistance = bx * bx + bz * bz;
        return aDistance - bDistance || a.cz - b.cz || a.cx - b.cx;
      }
    );

    let requested = 0;
    for (const queued of queuedChunks) {
      if (requested >= maxLoads) break;
      const key = this.key(queued.cx, queued.cz);
      const savedBlocks = this.savedChunks.get(key);

      if (!this.worker || savedBlocks) {
        this.ensureChunk(queued.cx, queued.cz);
        this.lastLoadedChunks += 1;
        requested += 1;
        continue;
      }

      this.requestChunkGeneration(queued.cx, queued.cz);
      requested += 1;
    }

    return requested;
  }

  requestChunkGeneration(cx, cz) {
    const key = this.key(cx, cz);
    if (!this.worker || this.pendingChunkKeys.has(key) || this.chunks.has(key)) {
      return;
    }

    const requestId = this.nextWorkerRequestId();
    this.chunkLoadQueue.delete(key);
    this.pendingChunkKeys.add(key);
    this.pendingChunkLoads.set(requestId, { key, cx, cz });
    this.worker.postMessage({
      type: "generate",
      requestId,
      cx,
      cz,
      seed: this.seed
    });
  }

  processGeneratedChunkResults() {
    this.lastLoadedChunks = 0;
    if (this.workerResults.length === 0) return;

    const remaining = [];
    for (const result of this.workerResults) {
      if (result.type !== "generated") {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingChunkLoads.get(result.requestId);
      if (!pending) continue;

      this.pendingChunkLoads.delete(result.requestId);
      this.pendingChunkKeys.delete(pending.key);
      if (!this.chunks.has(pending.key)) {
        this.addGeneratedChunk(result.cx, result.cz, result.blocks);
        this.lastLoadedChunks += 1;
      }
    }

    this.workerResults = remaining;
  }

  nextWorkerRequestId() {
    this.workerRequestId += 1;
    return this.workerRequestId;
  }

  generateChunk(chunk) {
    chunk.blocks.set(generateChunkBlocks(chunk.cx, chunk.cz, this.terrain));
    chunk.dirty = true;
    chunk.modified = false;
    chunk.revision = 0;
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
    const key = this.key(cx, cz);
    const chunk = this.ensureChunk(cx, cz);
    if (!chunk.setLocal(lx, Math.floor(y), lz, block)) return;
    chunk.modified = true;
    this.rememberModifiedChunk(key, chunk.blocks);

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

  rememberModifiedChunk(key, blocks) {
    // Copy before saving so later in-memory edits cannot mutate the stored snapshot by reference.
    const snapshot = blocks.slice();
    this.savedChunks.set(key, snapshot);
    this.storage.saveChunk(key, snapshot);
  }

  forgetSavedChunk(key) {
    // Dropping a saved chunk lets terrain generation own that coordinate again.
    this.savedChunks.delete(key);
    this.storage.deleteChunk(key);
  }

  unloadChunksOutside(centerCx, centerCz, unloadRadius, scene) {
    for (const [key, chunk] of Array.from(this.chunks.entries())) {
      const distance = Math.max(
        Math.abs(chunk.cx - centerCx),
        Math.abs(chunk.cz - centerCz)
      );
      if (distance <= unloadRadius) continue;

      if (chunk.modified) {
        this.rememberModifiedChunk(key, chunk.blocks);
      } else {
        this.forgetSavedChunk(key);
      }

      chunk.disposeMesh(scene);
      this.chunks.delete(key);
      this.chunkLoadQueue.delete(key);
      this.pendingMeshKeys.delete(key);
      this.markNeighborChunksDirty(chunk.cx, chunk.cz);
    }
  }

  isSolid(x, y, z) {
    if (y < 0) return true;
    const block = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return block !== BLOCK.air;
  }

  rebuildDirty(scene, material, maxRebuilds = MAX_CHUNK_REBUILDS_PER_FRAME) {
    if (this.worker) {
      this.processMeshResults(scene, material);
      this.lastRequestedMeshes = this.requestDirtyMeshBuilds(maxRebuilds);
      return this.lastMeshedChunks;
    }

    this.lastRequestedMeshes = 0;
    this.lastMeshedChunks = 0;
    let rebuilt = 0;
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty) continue;
      const mesh = chunk.rebuildMesh(this, material);
      if (!mesh.parent) scene.add(mesh);
      rebuilt += 1;
      if (rebuilt >= maxRebuilds) break;
    }
    this.lastMeshedChunks = rebuilt;
    return rebuilt;
  }

  processMeshResults(scene, material) {
    this.lastMeshedChunks = 0;
    if (this.workerResults.length === 0) return;

    const remaining = [];
    for (const result of this.workerResults) {
      if (result.type !== "meshed") {
        remaining.push(result);
        continue;
      }

      const pending = this.pendingMeshBuilds.get(result.requestId);
      if (!pending) continue;

      this.pendingMeshBuilds.delete(result.requestId);
      this.pendingMeshKeys.delete(pending.key);

      const chunk = this.getChunk(result.cx, result.cz);
      if (!chunk || chunk.revision !== result.revision) {
        if (chunk) chunk.dirty = true;
        continue;
      }

      const mesh = chunk.applyMeshData(
        {
          positions: result.positions,
          normals: result.normals,
          colors: result.colors,
          indices: result.indices
        },
        material
      );
      if (!mesh.parent) scene.add(mesh);
      this.lastMeshedChunks += 1;
    }

    this.workerResults = remaining;
  }

  requestDirtyMeshBuilds(maxBuilds = MAX_CHUNK_REBUILDS_PER_FRAME) {
    if (maxBuilds <= 0) return 0;

    const dirtyChunks = Array.from(this.chunks.values())
      .filter((chunk) => {
        const key = this.key(chunk.cx, chunk.cz);
        return chunk.dirty && !this.pendingMeshKeys.has(key);
      })
      .sort((a, b) => {
        const ax = a.cx - this.priorityCx;
        const az = a.cz - this.priorityCz;
        const bx = b.cx - this.priorityCx;
        const bz = b.cz - this.priorityCz;
        const aDistance = ax * ax + az * az;
        const bDistance = bx * bx + bz * bz;
        return aDistance - bDistance || a.cz - b.cz || a.cx - b.cx;
      });

    let requested = 0;
    for (const chunk of dirtyChunks) {
      const key = this.key(chunk.cx, chunk.cz);
      this.requestMeshBuild(chunk, key);
      requested += 1;
      if (requested >= maxBuilds) break;
    }

    return requested;
  }

  requestMeshBuild(chunk, key) {
    const requestId = this.nextWorkerRequestId();
    const blocks = chunk.blocks.slice();
    const neighbors = this.snapshotNeighborBlocks(chunk.cx, chunk.cz);
    const transfers = [
      blocks.buffer,
      ...Object.values(neighbors).filter(Boolean)
    ];

    this.pendingMeshKeys.add(key);
    this.pendingMeshBuilds.set(requestId, {
      key,
      revision: chunk.revision
    });
    this.worker.postMessage(
      {
        type: "mesh",
        requestId,
        cx: chunk.cx,
        cz: chunk.cz,
        revision: chunk.revision,
        blocks: blocks.buffer,
        neighbors
      },
      transfers
    );
  }

  snapshotNeighborBlocks(cx, cz) {
    return {
      negativeX: this.getChunk(cx - 1, cz)?.blocks.slice().buffer ?? null,
      positiveX: this.getChunk(cx + 1, cz)?.blocks.slice().buffer ?? null,
      negativeZ: this.getChunk(cx, cz - 1)?.blocks.slice().buffer ?? null,
      positiveZ: this.getChunk(cx, cz + 1)?.blocks.slice().buffer ?? null
    };
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
      queuedChunks: this.chunkLoadQueue.size,
      loadedThisFrame: this.lastLoadedChunks,
      requestedLoadsThisFrame: this.lastRequestedChunkLoads,
      pendingChunkLoads: this.pendingChunkLoads.size,
      meshedThisFrame: this.lastMeshedChunks,
      requestedMeshesThisFrame: this.lastRequestedMeshes,
      pendingMeshBuilds: this.pendingMeshBuilds.size,
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
