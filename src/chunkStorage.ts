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

export type SavedWorld = {
  readonly id: string;
  name: string;
  seed: string;
  createdAt: number;
  updatedAt: number;
};

export interface SaveDatabase {
  getMetadata(key: string): Promise<string | null>;
  setMetadata(key: string, value: string): Promise<void>;
  listWorlds(): Promise<SavedWorld[]>;
  getWorld(worldId: string): Promise<SavedWorld | null>;
  putWorld(world: SavedWorld): Promise<void>;
  updateWorldTimestamp(worldId: string): Promise<void>;
  listChunkKeys(worldId: string): Promise<string[]>;
  loadChunk(worldId: string, chunkKey: string): Promise<Uint8Array | null>;
  saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void>;
  deleteChunk(worldId: string, chunkKey: string): Promise<void>;
}

export interface ChunkStorage {
  readonly worldId: string;
  listChunkKeys(): Promise<string[]>;
  loadChunk(key: string): Promise<Uint8Array | null>;
  saveChunk(key: string, blocks: Uint8Array): Promise<void>;
  deleteChunk(key: string): Promise<void>;
}

type StoreName = typeof METADATA_STORE | typeof WORLDS_STORE | typeof CHUNKS_STORE;

type MetadataRecord = {
  key: string;
  value: string;
};

type ChunkRecord = {
  id: string;
  worldId: string;
  chunkKey: string;
  blocks: ArrayBuffer | Uint8Array;
  updatedAt: number;
};

let sharedDatabasePromise: Promise<SaveDatabase> | null = null;

// IndexedDB is the real browser save backend. The memory backend keeps smoke tests and
// restricted/private browser contexts usable without pretending that data is persisted.
export async function createChunkStorage(
  worldId = DEFAULT_WORLD_ID,
  database: SaveDatabase | Promise<SaveDatabase> = openSaveDatabase()
): Promise<ChunkStorage> {
  return new IndexedDbChunkStorage(await database, worldId);
}

export function createNullChunkStorage(worldId = DEFAULT_WORLD_ID): ChunkStorage {
  return new NullChunkStorage(worldId);
}

export function createMemorySaveDatabase(): SaveDatabase {
  return new MemorySaveDatabase();
}

export async function createWorldRegistry(
  database: SaveDatabase | Promise<SaveDatabase> = openSaveDatabase()
): Promise<WorldRegistry> {
  const registry = new WorldRegistry(await database);
  await registry.ensureDefaultWorld();
  return registry;
}

async function openSaveDatabase(): Promise<SaveDatabase> {
  if (!sharedDatabasePromise) {
    sharedDatabasePromise = openIndexedDbSaveDatabase()
      .catch((error) => {
        console.warn("IndexedDB save storage is unavailable; using memory saves.", error);
        return createMemorySaveDatabase();
      });
  }
  return sharedDatabasePromise;
}

async function openIndexedDbSaveDatabase(): Promise<SaveDatabase> {
  const indexedDb = readIndexedDb();
  if (!indexedDb) {
    throw new Error("IndexedDB is not available.");
  }

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
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

class IndexedDbSaveDatabase implements SaveDatabase {
  private readonly database: IDBDatabase;

  constructor(database: IDBDatabase) {
    this.database = database;
  }

  async getMetadata(key: string): Promise<string | null> {
    const record = await this.getRecord<MetadataRecord>(METADATA_STORE, key);
    return record?.value ?? null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    await this.putRecord(METADATA_STORE, { key, value });
  }

  async listWorlds(): Promise<SavedWorld[]> {
    const worlds = await this.getAllRecords<unknown>(WORLDS_STORE);
    return worlds.map(normalizeWorld).filter((world): world is SavedWorld => Boolean(world));
  }

  async getWorld(worldId: string): Promise<SavedWorld | null> {
    return normalizeWorld(await this.getRecord(WORLDS_STORE, worldId));
  }

  async putWorld(world: SavedWorld): Promise<void> {
    await this.putRecord(WORLDS_STORE, cloneSavedWorld(world));
  }

  async updateWorldTimestamp(worldId: string): Promise<void> {
    const world = await this.getWorld(worldId);
    if (!world) return;

    world.updatedAt = Date.now();
    await this.putWorld(world);
  }

  async listChunkKeys(worldId: string): Promise<string[]> {
    const transaction = this.database.transaction(CHUNKS_STORE, "readonly");
    const index = transaction.objectStore(CHUNKS_STORE).index(CHUNK_WORLD_INDEX);
    const done = transactionDone(transaction);
    const request = index.getAllKeys(globalThis.IDBKeyRange.only(worldId));
    const recordIds = await requestToPromise<IDBValidKey[]>(request);
    await done;
    const prefix = `${worldId}|`;

    // Only keys are loaded here; chunk payloads stay lazy so big worlds do not punish startup.
    return recordIds
      .map((recordId) => String(recordId))
      .filter((recordId) => recordId.startsWith(prefix))
      .map((recordId) => recordId.slice(prefix.length));
  }

  async loadChunk(worldId: string, chunkKey: string): Promise<Uint8Array | null> {
    const record = await this.getRecord<ChunkRecord>(CHUNKS_STORE, chunkRecordId(worldId, chunkKey));
    return decodeStoredBlocks(record?.blocks);
  }

  async saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void> {
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

  async deleteChunk(worldId: string, chunkKey: string): Promise<void> {
    await this.deleteRecord(CHUNKS_STORE, chunkRecordId(worldId, chunkKey));
    await this.updateWorldTimestamp(worldId);
  }

  private async getRecord<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
    const transaction = this.database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(storeName).get(key);
    const record = await requestToPromise<T | undefined>(request);
    await done;
    return record ?? null;
  }

  private async getAllRecords<T>(storeName: StoreName): Promise<T[]> {
    const transaction = this.database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(storeName).getAll();
    const records = await requestToPromise<T[]>(request);
    await done;
    return records;
  }

  private async putRecord(storeName: StoreName, record: unknown): Promise<void> {
    const transaction = this.database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(storeName).put(record));
    await done;
  }

  private async deleteRecord(storeName: StoreName, key: IDBValidKey): Promise<void> {
    const transaction = this.database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(storeName).delete(key));
    await done;
  }
}

class MemorySaveDatabase implements SaveDatabase {
  private readonly metadata = new Map<string, string>();
  private readonly worlds = new Map<string, SavedWorld>();
  private readonly chunks = new Map<string, Uint8Array>();

  async getMetadata(key: string): Promise<string | null> {
    return this.metadata.get(key) ?? null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    this.metadata.set(key, value);
  }

  async listWorlds(): Promise<SavedWorld[]> {
    return Array.from(this.worlds.values()).map(cloneSavedWorld);
  }

  async getWorld(worldId: string): Promise<SavedWorld | null> {
    return cloneWorld(this.worlds.get(worldId));
  }

  async putWorld(world: SavedWorld): Promise<void> {
    this.worlds.set(world.id, cloneSavedWorld(world));
  }

  async updateWorldTimestamp(worldId: string): Promise<void> {
    const world = this.worlds.get(worldId);
    if (!world) return;

    world.updatedAt = Date.now();
    this.worlds.set(worldId, cloneSavedWorld(world));
  }

  async listChunkKeys(worldId: string): Promise<string[]> {
    const prefix = `${worldId}|`;
    return Array.from(this.chunks.keys())
      .filter((recordId) => recordId.startsWith(prefix))
      .map((recordId) => recordId.slice(prefix.length));
  }

  async loadChunk(worldId: string, chunkKey: string): Promise<Uint8Array | null> {
    const blocks = this.chunks.get(chunkRecordId(worldId, chunkKey));
    return blocks ? blocks.slice() : null;
  }

  async saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void> {
    this.chunks.set(chunkRecordId(worldId, chunkKey), blocks.slice());
    await this.updateWorldTimestamp(worldId);
  }

  async deleteChunk(worldId: string, chunkKey: string): Promise<void> {
    this.chunks.delete(chunkRecordId(worldId, chunkKey));
    await this.updateWorldTimestamp(worldId);
  }
}

class IndexedDbChunkStorage implements ChunkStorage {
  readonly worldId: string;
  private readonly database: SaveDatabase;

  constructor(database: SaveDatabase, worldId: string) {
    this.database = database;
    this.worldId = worldId || DEFAULT_WORLD_ID;
  }

  async listChunkKeys(): Promise<string[]> {
    return this.database.listChunkKeys(this.worldId);
  }

  async loadChunk(key: string): Promise<Uint8Array | null> {
    try {
      return await this.database.loadChunk(this.worldId, key);
    } catch (error) {
      console.warn("Could not load persisted chunk edit", key, error);
      return null;
    }
  }

  async saveChunk(key: string, blocks: Uint8Array): Promise<void> {
    try {
      await this.database.saveChunk(this.worldId, key, blocks);
    } catch (error) {
      console.warn("Could not persist chunk edit", key, error);
    }
  }

  async deleteChunk(key: string): Promise<void> {
    try {
      await this.database.deleteChunk(this.worldId, key);
    } catch (error) {
      console.warn("Could not delete persisted chunk edit", key, error);
    }
  }
}

class NullChunkStorage implements ChunkStorage {
  readonly worldId: string;

  constructor(worldId = DEFAULT_WORLD_ID) {
    this.worldId = worldId;
  }

  async listChunkKeys(): Promise<string[]> {
    return [];
  }

  async loadChunk(): Promise<Uint8Array | null> {
    return null;
  }

  async saveChunk(): Promise<void> {}

  async deleteChunk(): Promise<void> {}
}

export class WorldRegistry {
  private readonly database: SaveDatabase;

  constructor(database: SaveDatabase) {
    this.database = database;
  }

  async listWorlds(): Promise<SavedWorld[]> {
    const worlds = await this.database.listWorlds();
    // Most recently edited worlds float to the top of the menu.
    return worlds.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getActiveWorldId(): Promise<string> {
    return await this.database.getMetadata(ACTIVE_WORLD_KEY) || DEFAULT_WORLD_ID;
  }

  async getActiveWorld(): Promise<SavedWorld> {
    const worlds = await this.listWorlds();
    const activeWorldId = await this.getActiveWorldId();
    return worlds.find((world) => world.id === activeWorldId) ?? worlds[0];
  }

  async setActiveWorld(worldId: string): Promise<string> {
    const worlds = await this.listWorlds();
    if (!worlds.some((world) => world.id === worldId)) return this.getActiveWorldId();

    await this.database.setMetadata(ACTIVE_WORLD_KEY, worldId);
    return worldId;
  }

  async createWorld(name: string, seed: string): Promise<SavedWorld> {
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

  async ensureDefaultWorld(): Promise<void> {
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

function readIndexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function chunkRecordId(worldId: string, chunkKey: string): string {
  return `${worldId}|${chunkKey}`;
}

function createWorldId(now: number): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `world-${now.toString(36)}-${random}`;
}

function createRandomSeed(now: number): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${random}`;
}

function sanitizeWorldName(name: unknown): string {
  const trimmed = String(name || "").trim();
  return trimmed || "Untitled World";
}

function sanitizeWorldSeed(seed: unknown): string {
  return String(seed || "").trim();
}

function normalizeWorld(world: unknown): SavedWorld | null {
  if (!isRecord(world) || typeof world.id !== "string") return null;

  // Normalize on read so future metadata additions can be optional and backwards-compatible.
  return {
    id: world.id,
    name: sanitizeWorldName(world.name),
    seed: sanitizeWorldSeed(world.seed),
    createdAt: readTimestamp(world.createdAt),
    updatedAt: readTimestamp(world.updatedAt)
  };
}

function cloneWorld(world: SavedWorld | undefined | null): SavedWorld | null {
  return world ? cloneSavedWorld(world) : null;
}

function cloneSavedWorld(world: SavedWorld): SavedWorld {
  return { ...world };
}

function readTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneChunkBuffer(blocks: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(blocks.byteLength);
  copy.set(blocks);
  return copy.buffer;
}

function decodeStoredBlocks(blocks: unknown): Uint8Array | null {
  if (!blocks) return null;

  const decoded = decodeBinaryPayload(blocks);
  if (!decoded) return null;

  if (decoded.length !== CHUNK_BYTE_LENGTH) {
    // A length mismatch means this payload belongs to another chunk shape or a corrupt save.
    return null;
  }

  return decoded;
}

function decodeBinaryPayload(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload.slice();
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload.slice(0));
  if (!ArrayBuffer.isView(payload)) return null;

  // IndexedDB should give us ArrayBuffer/Uint8Array here, but accepting any view keeps
  // older experimental saves readable if their shape is otherwise correct.
  const view = payload as ArrayBufferView;
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  return new Uint8Array(buffer);
}
