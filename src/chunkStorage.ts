// @ts-nocheck
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

const DATABASE_NAME = "voxel-engine";
const DATABASE_VERSION = 1;
const METADATA_STORE = "metadata";
const WORLDS_STORE = "worlds";
const CHUNKS_STORE = "chunks";
const CHUNK_WORLD_INDEX = "worldId";
const ACTIVE_WORLD_KEY = "active-world";
const DEFAULT_WORLD_ID = "default";
const DEFAULT_WORLD_NAME = "Default World";
const DEFAULT_WORLD_SEED = "";
const CHUNK_BYTE_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

let sharedDatabasePromise = null;

// IndexedDB is the real browser save backend. The memory backend keeps smoke tests and
// restricted/private browser contexts usable without pretending that data is persisted.
export async function createChunkStorage(worldId = DEFAULT_WORLD_ID, database = openSaveDatabase()) {
  return new IndexedDbChunkStorage(await database, worldId);
}

export function createNullChunkStorage(worldId = DEFAULT_WORLD_ID) {
  return new NullChunkStorage(worldId);
}

export function createMemorySaveDatabase() {
  return new MemorySaveDatabase();
}

export async function createWorldRegistry(database = openSaveDatabase()) {
  const registry = new WorldRegistry(await database);
  await registry.ensureDefaultWorld();
  return registry;
}

async function openSaveDatabase() {
  if (!sharedDatabasePromise) {
    sharedDatabasePromise = openIndexedDbSaveDatabase()
      .catch((error) => {
        console.warn("IndexedDB save storage is unavailable; using memory saves.", error);
        return createMemorySaveDatabase();
      });
  }
  return sharedDatabasePromise;
}

async function openIndexedDbSaveDatabase() {
  const indexedDb = readIndexedDb();
  if (!indexedDb) {
    throw new Error("IndexedDB is not available.");
  }

  const database = await new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(WORLDS_STORE)) {
        db.createObjectStore(WORLDS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const chunks = db.createObjectStore(CHUNKS_STORE, { keyPath: "id" });
        chunks.createIndex(CHUNK_WORLD_INDEX, CHUNK_WORLD_INDEX, { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
    request.onblocked = () => {
      console.warn("IndexedDB upgrade is blocked by another open voxel-engine tab.");
    };
  });

  return new IndexedDbSaveDatabase(database);
}

class IndexedDbSaveDatabase {
  constructor(database) {
    this.database = database;
  }

  async getMetadata(key) {
    const record = await this.getRecord(METADATA_STORE, key);
    return record?.value ?? null;
  }

  async setMetadata(key, value) {
    await this.putRecord(METADATA_STORE, { key, value });
  }

  async listWorlds() {
    const worlds = await this.getAllRecords(WORLDS_STORE);
    return worlds.map(normalizeWorld).filter(Boolean);
  }

  async getWorld(worldId) {
    return normalizeWorld(await this.getRecord(WORLDS_STORE, worldId));
  }

  async putWorld(world) {
    await this.putRecord(WORLDS_STORE, normalizeWorld(world));
  }

  async updateWorldTimestamp(worldId) {
    const world = await this.getWorld(worldId);
    if (!world) return;

    world.updatedAt = Date.now();
    await this.putWorld(world);
  }

  async listChunkKeys(worldId) {
    const transaction = this.database.transaction(CHUNKS_STORE, "readonly");
    const index = transaction.objectStore(CHUNKS_STORE).index(CHUNK_WORLD_INDEX);
    const done = transactionDone(transaction);
    const request = index.getAllKeys(globalThis.IDBKeyRange.only(worldId));
    const recordIds = await requestToPromise(request);
    await done;
    const prefix = `${worldId}|`;

    // Only keys are loaded here; chunk payloads stay lazy so big worlds do not punish startup.
    return recordIds
      .map((recordId) => String(recordId))
      .filter((recordId) => recordId.startsWith(prefix))
      .map((recordId) => recordId.slice(prefix.length));
  }

  async loadChunk(worldId, chunkKey) {
    const record = await this.getRecord(CHUNKS_STORE, chunkRecordId(worldId, chunkKey));
    return decodeStoredBlocks(record?.blocks);
  }

  async saveChunk(worldId, chunkKey, blocks) {
    // Store the raw ArrayBuffer, not base64 text. IndexedDB can clone binary data directly.
    await this.putRecord(CHUNKS_STORE, {
      id: chunkRecordId(worldId, chunkKey),
      worldId,
      chunkKey,
      blocks: cloneChunkBuffer(blocks),
      updatedAt: Date.now()
    });
    await this.updateWorldTimestamp(worldId);
  }

  async deleteChunk(worldId, chunkKey) {
    await this.deleteRecord(CHUNKS_STORE, chunkRecordId(worldId, chunkKey));
    await this.updateWorldTimestamp(worldId);
  }

  async getRecord(storeName, key) {
    const transaction = this.database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(storeName).get(key);
    const record = await requestToPromise(request);
    await done;
    return record ?? null;
  }

  async getAllRecords(storeName) {
    const transaction = this.database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(storeName).getAll();
    const records = await requestToPromise(request);
    await done;
    return records;
  }

  async putRecord(storeName, record) {
    const transaction = this.database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(storeName).put(record));
    await done;
  }

  async deleteRecord(storeName, key) {
    const transaction = this.database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(storeName).delete(key));
    await done;
  }
}

class MemorySaveDatabase {
  constructor() {
    this.metadata = new Map();
    this.worlds = new Map();
    this.chunks = new Map();
  }

  async getMetadata(key) {
    return this.metadata.get(key) ?? null;
  }

  async setMetadata(key, value) {
    this.metadata.set(key, value);
  }

  async listWorlds() {
    return Array.from(this.worlds.values()).map(cloneWorld);
  }

  async getWorld(worldId) {
    return cloneWorld(this.worlds.get(worldId));
  }

  async putWorld(world) {
    this.worlds.set(world.id, cloneWorld(world));
  }

  async updateWorldTimestamp(worldId) {
    const world = this.worlds.get(worldId);
    if (!world) return;

    world.updatedAt = Date.now();
    this.worlds.set(worldId, cloneWorld(world));
  }

  async listChunkKeys(worldId) {
    const prefix = `${worldId}|`;
    return Array.from(this.chunks.keys())
      .filter((recordId) => recordId.startsWith(prefix))
      .map((recordId) => recordId.slice(prefix.length));
  }

  async loadChunk(worldId, chunkKey) {
    const blocks = this.chunks.get(chunkRecordId(worldId, chunkKey));
    return blocks ? blocks.slice() : null;
  }

  async saveChunk(worldId, chunkKey, blocks) {
    this.chunks.set(chunkRecordId(worldId, chunkKey), blocks.slice());
    await this.updateWorldTimestamp(worldId);
  }

  async deleteChunk(worldId, chunkKey) {
    this.chunks.delete(chunkRecordId(worldId, chunkKey));
    await this.updateWorldTimestamp(worldId);
  }
}

class IndexedDbChunkStorage {
  constructor(database, worldId) {
    this.database = database;
    this.worldId = worldId || DEFAULT_WORLD_ID;
  }

  async listChunkKeys() {
    return this.database.listChunkKeys(this.worldId);
  }

  async loadChunk(key) {
    try {
      return await this.database.loadChunk(this.worldId, key);
    } catch (error) {
      console.warn("Could not load persisted chunk edit", key, error);
      return null;
    }
  }

  async saveChunk(key, blocks) {
    try {
      await this.database.saveChunk(this.worldId, key, blocks);
    } catch (error) {
      console.warn("Could not persist chunk edit", key, error);
    }
  }

  async deleteChunk(key) {
    try {
      await this.database.deleteChunk(this.worldId, key);
    } catch (error) {
      console.warn("Could not delete persisted chunk edit", key, error);
    }
  }
}

class NullChunkStorage {
  constructor(worldId = DEFAULT_WORLD_ID) {
    this.worldId = worldId;
  }

  async listChunkKeys() {
    return [];
  }

  async loadChunk() {
    return null;
  }

  async saveChunk() {}

  async deleteChunk() {}
}

class WorldRegistry {
  constructor(database) {
    this.database = database;
  }

  async listWorlds() {
    const worlds = await this.database.listWorlds();
    // Most recently edited worlds float to the top of the menu.
    return worlds.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getActiveWorldId() {
    return await this.database.getMetadata(ACTIVE_WORLD_KEY) || DEFAULT_WORLD_ID;
  }

  async getActiveWorld() {
    const worlds = await this.listWorlds();
    const activeWorldId = await this.getActiveWorldId();
    return worlds.find((world) => world.id === activeWorldId) ?? worlds[0];
  }

  async setActiveWorld(worldId) {
    const worlds = await this.listWorlds();
    if (!worlds.some((world) => world.id === worldId)) return this.getActiveWorldId();

    await this.database.setMetadata(ACTIVE_WORLD_KEY, worldId);
    return worldId;
  }

  async createWorld(name, seed) {
    const now = Date.now();
    const world = {
      id: createWorldId(now),
      name: sanitizeWorldName(name),
      seed: sanitizeWorldSeed(seed) || createRandomSeed(now),
      createdAt: now,
      updatedAt: now
    };

    await this.database.putWorld(world);
    await this.database.setMetadata(ACTIVE_WORLD_KEY, world.id);
    return world;
  }

  async ensureDefaultWorld() {
    const defaultWorld = await this.database.getWorld(DEFAULT_WORLD_ID);
    if (defaultWorld) return;

    const now = Date.now();
    await this.database.putWorld({
      id: DEFAULT_WORLD_ID,
      name: DEFAULT_WORLD_NAME,
      seed: DEFAULT_WORLD_SEED,
      createdAt: now,
      updatedAt: now
    });
  }
}

function readIndexedDb() {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function chunkRecordId(worldId, chunkKey) {
  return `${worldId}|${chunkKey}`;
}

function createWorldId(now) {
  const random = Math.random().toString(36).slice(2, 8);
  return `world-${now.toString(36)}-${random}`;
}

function createRandomSeed(now) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${random}`;
}

function sanitizeWorldName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Untitled World";
}

function sanitizeWorldSeed(seed) {
  return String(seed || "").trim();
}

function normalizeWorld(world) {
  if (!world || typeof world.id !== "string") return null;

  // Normalize on read so future metadata additions can be optional and backwards-compatible.
  return {
    id: world.id,
    name: sanitizeWorldName(world.name),
    seed: sanitizeWorldSeed(world.seed),
    createdAt: Number.isFinite(world.createdAt) ? world.createdAt : 0,
    updatedAt: Number.isFinite(world.updatedAt) ? world.updatedAt : 0
  };
}

function cloneWorld(world) {
  return world ? { ...world } : null;
}

function cloneChunkBuffer(blocks) {
  return blocks.buffer.slice(blocks.byteOffset, blocks.byteOffset + blocks.byteLength);
}

function decodeStoredBlocks(blocks) {
  if (!blocks) return null;

  const decoded = blocks instanceof Uint8Array
    ? blocks.slice()
    : new Uint8Array(blocks);

  if (decoded.length !== CHUNK_BYTE_LENGTH) {
    // A length mismatch means this payload belongs to another chunk shape or a corrupt save.
    return null;
  }

  return decoded;
}
