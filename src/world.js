import { BLOCK } from "./blocks.js";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from "./chunk.js";
import { createNullChunkStorage } from "./chunkStorage.js";
import { createTerrainContext, generateChunkBlocks } from "./terrain.js";

const LOAD_RADIUS = 4;
const UNLOAD_RADIUS = 5;
const MAX_CHUNK_LOADS_PER_FRAME = 2;
const MAX_CHUNK_REBUILDS_PER_FRAME = 4;
const VIEW_PRIORITY_NEAR_RADIUS = 2;
const VIEW_PRIORITY_FRONT_DOT = 0.42;
const VIEW_PRIORITY_SIDE_DOT = -0.15;
const FRUSTUM_PRIORITY_PADDING = CHUNK_SIZE * 0.5;

export class VoxelWorld {
  constructor({ storage = createNullChunkStorage(), seed = "" } = {}) {
    this.chunks = new Map();
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed);
    // The key set is cheap to keep in memory; full chunk payloads are loaded only when needed.
    this.savedChunkKeys = new Set();
    this.savedChunks = new Map();
    this.chunkLoadQueue = new Map();
    this.pendingChunkLoads = new Map();
    this.pendingChunkKeys = new Set();
    this.pendingSavedChunkLoads = new Map();
    this.pendingSavedChunkKeys = new Set();
    this.pendingMeshBuilds = new Map();
    this.pendingMeshKeys = new Set();
    this.workerResults = [];
    this.savedChunkResults = [];
    this.storageOperations = new Set();
    this.storageGeneration = 0;
    this.workerRequestId = 0;
    this.worker = this.createWorker();
    this.priorityCx = 0;
    this.priorityCz = 0;
    this.priorityViewX = 0;
    this.priorityViewZ = -1;
    this.priorityViewActive = false;
    this.priorityFrustum = null;
    this.priorityFrustumActive = false;
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
  }

  async switchStorage(storage, scene, seed = "") {
    await this.flushStorageWrites();
    this.storageGeneration += 1;
    this.disposeLoadedChunks(scene);
    this.storage = storage;
    this.seed = String(seed || "");
    this.terrain = createTerrainContext(this.seed);
    this.savedChunks.clear();
    await this.loadSavedChunkIndex();
    this.lastLoadedChunks = 0;
    this.lastRequestedChunkLoads = 0;
    this.lastMeshedChunks = 0;
    this.lastRequestedMeshes = 0;
  }

  async loadSavedChunkIndex() {
    // The index is tiny compared with full chunk data, so it is safe to read at world-load time.
    try {
      this.savedChunkKeys = new Set(await this.storage.listChunkKeys());
    } catch (error) {
      console.warn("Could not read saved chunk index", error);
      this.savedChunkKeys = new Set();
    }
  }

  async preloadSavedChunksAround(x, z, radius = LOAD_RADIUS) {
    const center = this.toChunkCoords(x, z);
    const loads = [];

    // Initial spawn gets a blocking preload so saved edits near spawn are visible immediately.
    for (let cz = center.cz - radius; cz <= center.cz + radius; cz += 1) {
      for (let cx = center.cx - radius; cx <= center.cx + radius; cx += 1) {
        const key = this.key(cx, cz);
        if (this.savedChunkKeys.has(key)) loads.push(this.loadSavedChunkNow(key));
      }
    }

    await Promise.all(loads);
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
    this.pendingSavedChunkLoads.clear();
    this.pendingSavedChunkKeys.clear();
    this.pendingMeshBuilds.clear();
    this.pendingMeshKeys.clear();
    this.workerResults.length = 0;
    this.savedChunkResults.length = 0;
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
    this.setPriority(center.cx, center.cz);
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
    maxLoads = MAX_CHUNK_LOADS_PER_FRAME,
    viewDirection = null,
    viewFrustum = null
  ) {
    this.lastLoadedChunks = 0;
    this.processSavedChunkResults();
    this.processGeneratedChunkResults();
    const center = this.toChunkCoords(x, z);
    this.setPriority(center.cx, center.cz, viewDirection, viewFrustum);
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
          this.pendingChunkKeys.has(key) ||
          this.pendingSavedChunkKeys.has(key)
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

  setPriority(centerCx, centerCz, viewDirection = null, viewFrustum = null) {
    this.priorityCx = centerCx;
    this.priorityCz = centerCz;
    this.priorityFrustum = viewFrustum?.planes?.length ? viewFrustum : null;
    this.priorityFrustumActive = Boolean(this.priorityFrustum);

    // Keep the horizontal camera direction normalized so chunk scheduling can
    // prefer work the player is likely to see next.
    const viewX = viewDirection?.x ?? 0;
    const viewZ = viewDirection?.z ?? 0;
    const viewLength = Math.hypot(viewX, viewZ);
    this.priorityViewActive = viewLength > 0.001;
    if (!this.priorityViewActive) return;

    this.priorityViewX = viewX / viewLength;
    this.priorityViewZ = viewZ / viewLength;
  }

  requestQueuedChunkLoads(centerCx, centerCz, maxLoads = MAX_CHUNK_LOADS_PER_FRAME) {
    if (maxLoads <= 0) return 0;

    const queuedChunks = this.pickNearestQueuedChunks(centerCx, centerCz, maxLoads);

    let requested = 0;
    for (const queued of queuedChunks) {
      if (requested >= maxLoads) break;
      const key = this.key(queued.cx, queued.cz);

      if (this.savedChunkKeys.has(key) && !this.savedChunks.has(key)) {
        this.requestSavedChunkLoad(queued.cx, queued.cz);
        requested += 1;
        continue;
      }

      if (!this.worker || this.savedChunks.has(key)) {
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

  pickNearestQueuedChunks(centerCx, centerCz, limit) {
    const nearest = [];

    // Huge quality tiers can queue thousands of chunks; keep only the few this frame can request.
    for (const queued of this.chunkLoadQueue.values()) {
      this.insertNearest(nearest, queued, centerCx, centerCz, limit);
    }

    return nearest.map((entry) => entry.item);
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

  requestSavedChunkLoad(cx, cz) {
    const key = this.key(cx, cz);
    if (
      this.pendingSavedChunkKeys.has(key) ||
      this.chunks.has(key) ||
      !this.savedChunkKeys.has(key)
    ) {
      return;
    }

    const generation = this.storageGeneration;
    this.chunkLoadQueue.delete(key);
    this.pendingSavedChunkKeys.add(key);
    this.pendingSavedChunkLoads.set(key, { key, cx, cz, generation });

    this.storage.loadChunk(key)
      .then((blocks) => {
        this.savedChunkResults.push({ key, cx, cz, blocks, generation });
      })
      .catch((error) => {
        console.warn("Could not stream saved chunk", key, error);
        this.savedChunkResults.push({ key, cx, cz, blocks: null, generation });
      });
  }

  processSavedChunkResults() {
    if (this.savedChunkResults.length === 0) return;

    for (const result of this.savedChunkResults) {
      const pending = this.pendingSavedChunkLoads.get(result.key);
      if (!pending || pending.generation !== result.generation) continue;

      this.pendingSavedChunkLoads.delete(result.key);
      this.pendingSavedChunkKeys.delete(result.key);

      if (!result.blocks) {
        this.forgetSavedChunk(result.key);
        continue;
      }

      this.savedChunks.set(result.key, result.blocks);
      if (!this.chunks.has(result.key)) {
        this.addGeneratedChunk(result.cx, result.cz, result.blocks, true);
        this.lastLoadedChunks += 1;
      }
    }

    this.savedChunkResults.length = 0;
  }

  processGeneratedChunkResults() {
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
    if (!chunk) return;

    // Neighbor loads and edge edits can invalidate a mesh even when this chunk's
    // blocks did not change, so bump the revision to reject stale worker results.
    chunk.dirty = true;
    chunk.revision += 1;
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
    this.savedChunkKeys.add(key);
    this.savedChunks.set(key, snapshot);
    this.queueStorageOperation(this.storage.saveChunk(key, snapshot));
  }

  forgetSavedChunk(key) {
    // Dropping a saved chunk lets terrain generation own that coordinate again.
    this.savedChunkKeys.delete(key);
    this.savedChunks.delete(key);
    this.queueStorageOperation(this.storage.deleteChunk(key));
  }

  async loadSavedChunkNow(key) {
    if (this.savedChunks.has(key)) return this.savedChunks.get(key);

    const blocks = await this.storage.loadChunk(key);
    if (!blocks) {
      this.forgetSavedChunk(key);
      return null;
    }

    this.savedChunks.set(key, blocks);
    return blocks;
  }

  queueStorageOperation(operation) {
    const trackedOperation = Promise.resolve(operation)
      .catch((error) => {
        console.warn("Save storage operation failed", error);
      })
      .finally(() => {
        this.storageOperations.delete(trackedOperation);
      });

    this.storageOperations.add(trackedOperation);
    return trackedOperation;
  }

  async flushStorageWrites() {
    await Promise.allSettled(Array.from(this.storageOperations));
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
    const dirtyChunks = this.pickNearestDirtyChunks(maxRebuilds);
    for (const chunk of dirtyChunks) {
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

    const dirtyChunks = this.pickNearestDirtyChunks(maxBuilds);

    let requested = 0;
    for (const chunk of dirtyChunks) {
      const key = this.key(chunk.cx, chunk.cz);
      this.requestMeshBuild(chunk, key);
      requested += 1;
      if (requested >= maxBuilds) break;
    }

    return requested;
  }

  pickNearestDirtyChunks(limit) {
    const nearest = [];

    // Mesh budgets are tiny compared with loaded chunks, so avoid sorting the whole world.
    for (const chunk of this.chunks.values()) {
      const key = this.key(chunk.cx, chunk.cz);
      if (!chunk.dirty || this.pendingMeshKeys.has(key)) continue;
      this.insertNearest(nearest, chunk, this.priorityCx, this.priorityCz, limit);
    }

    return nearest.map((entry) => entry.item);
  }

  insertNearest(nearest, item, centerCx, centerCz, limit) {
    const entry = this.createPriorityEntry(item, centerCx, centerCz);

    let insertAt = nearest.length;
    while (insertAt > 0 && this.isNearer(entry, nearest[insertAt - 1])) {
      insertAt -= 1;
    }

    if (insertAt >= limit) return;
    nearest.splice(insertAt, 0, entry);
    if (nearest.length > limit) nearest.pop();
  }

  createPriorityEntry(item, centerCx, centerCz) {
    const dx = item.cx - centerCx;
    const dz = item.cz - centerCz;
    const distance = dx * dx + dz * dz;
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    const alignment = this.chunkViewAlignment(dx, dz, distance);
    const visible = this.chunkIntersectsFrustum(item.cx, item.cz);

    return {
      item,
      distance,
      alignment,
      visible,
      lane: this.priorityLane(ring, alignment, visible)
    };
  }

  chunkViewAlignment(dx, dz, distance) {
    if (!this.priorityViewActive || distance === 0) return 0;
    return (dx * this.priorityViewX + dz * this.priorityViewZ) / Math.sqrt(distance);
  }

  chunkIntersectsFrustum(cx, cz) {
    if (!this.priorityFrustumActive) return true;

    const minX = cx * CHUNK_SIZE - FRUSTUM_PRIORITY_PADDING;
    const maxX = (cx + 1) * CHUNK_SIZE + FRUSTUM_PRIORITY_PADDING;
    const minY = -FRUSTUM_PRIORITY_PADDING;
    const maxY = WORLD_HEIGHT + FRUSTUM_PRIORITY_PADDING;
    const minZ = cz * CHUNK_SIZE - FRUSTUM_PRIORITY_PADDING;
    const maxZ = (cz + 1) * CHUNK_SIZE + FRUSTUM_PRIORITY_PADDING;

    for (const plane of this.priorityFrustum.planes) {
      const normal = plane.normal;
      const x = normal.x >= 0 ? maxX : minX;
      const y = normal.y >= 0 ? maxY : minY;
      const z = normal.z >= 0 ? maxZ : minZ;
      if (normal.x * x + normal.y * y + normal.z * z + plane.constant < 0) {
        return false;
      }
    }

    return true;
  }

  priorityLane(ring, alignment, visible) {
    // Lanes keep the immediate neighborhood complete, then spend the remaining
    // budget on chunks in the frustum before broader front-to-back catch-up work.
    if (ring <= VIEW_PRIORITY_NEAR_RADIUS) return 0;
    if (visible) return 1;
    if (!this.priorityViewActive) return 2;
    if (alignment >= VIEW_PRIORITY_FRONT_DOT) return 2;
    if (alignment >= VIEW_PRIORITY_SIDE_DOT) return 3;
    return 4;
  }

  isNearer(a, b) {
    if (a.lane !== b.lane) return a.lane < b.lane;
    if (a.distance !== b.distance) return a.distance < b.distance;
    if (a.alignment !== b.alignment) return a.alignment > b.alignment;
    if (a.item.cz !== b.item.cz) return a.item.cz < b.item.cz;
    return a.item.cx < b.item.cx;
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
    let visibleChunks = 0;
    let visibleDirtyChunks = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) dirtyChunks += 1;
      if (chunk.modified) modifiedChunks += 1;
      if (!this.chunkIntersectsFrustum(chunk.cx, chunk.cz)) continue;
      visibleChunks += 1;
      if (chunk.dirty) visibleDirtyChunks += 1;
    }

    return {
      loadedChunks: this.chunks.size,
      visibleChunks,
      culledChunks: this.chunks.size - visibleChunks,
      savedChunks: this.savedChunkKeys.size,
      queuedChunks: this.chunkLoadQueue.size,
      loadedThisFrame: this.lastLoadedChunks,
      requestedLoadsThisFrame: this.lastRequestedChunkLoads,
      pendingChunkLoads: this.pendingChunkLoads.size + this.pendingSavedChunkLoads.size,
      meshedThisFrame: this.lastMeshedChunks,
      requestedMeshesThisFrame: this.lastRequestedMeshes,
      pendingMeshBuilds: this.pendingMeshBuilds.size,
      dirtyChunks,
      visibleDirtyChunks,
      culledDirtyChunks: dirtyChunks - visibleDirtyChunks,
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
