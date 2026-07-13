import {
  CHUNK_SIZE,
  EXPANDED_TERRAIN_SURFACE_OFFSET,
  LEGACY_WORLD_HEIGHT,
  WORLD_HEIGHT
} from "./voxelConstants";
import { BLOCKS, PLACEABLE_BLOCKS } from "./blocks";
import {
  createSavedDayNightState,
  normalizeSavedDayNightState,
  type DayNightState,
  type SavedDayNightState
} from "./dayNightCycle";
import {
  cloneInventoryState,
  createDefaultInventoryState,
  createVoxelSandboxInventoryOptions,
  normalizeInventoryState,
  type InventoryState
} from "./inventory";
import { createVoxelSandboxItemRegistry } from "./items";
import { isSuperflatSeed, type TerrainProfile } from "./terrain";

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
const VARIED_TERRAIN_PROFILE_INTRODUCED_AT = Date.UTC(2026, 4, 25, 4, 31, 0);
const CHUNK_BYTE_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
const LEGACY_CHUNK_BYTE_LENGTH = CHUNK_SIZE * LEGACY_WORLD_HEIGHT * CHUNK_SIZE;
const PARTIAL_BLOCK_VISUAL_CELL_COUNT = 27;
const SAVED_ITEM_REGISTRY = createVoxelSandboxItemRegistry(BLOCKS, PLACEABLE_BLOCKS);
const SAVED_INVENTORY_OPTIONS = createVoxelSandboxInventoryOptions(
  SAVED_ITEM_REGISTRY,
  PLACEABLE_BLOCKS
);

export type SavedWorld = {
  readonly id: string;
  name: string;
  seed: string;
  terrainProfile: TerrainProfile;
  createdAt: number;
  updatedAt: number;
  playerState?: SavedPlayerState;
  dayNightState?: SavedDayNightState;
  inventoryState?: InventoryState;
};

export type SavedPlayerPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type SavedPlayerStateSnapshot = {
  readonly feetPosition: SavedPlayerPosition;
  readonly yaw: number;
  readonly pitch: number;
};

export type SavedPlayerState = SavedPlayerStateSnapshot & {
  readonly savedAt: number;
  readonly worldHeight: number;
};

export type SavedPartialBlockVector = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type SavedPartialBlockSurfaceSample = {
  readonly localX: number;
  readonly localZ: number;
  readonly height: number;
  readonly weight: number;
};

export type SavedPartialBlockCut = {
  readonly normal: SavedPartialBlockVector;
  readonly localPoint: SavedPartialBlockVector;
  readonly trajectory?: SavedPartialBlockVector;
  readonly coreRadius?: number;
  readonly exactRemovedVisualCellIndexes?: readonly number[];
  readonly radius: number;
  readonly depth: number;
  readonly seed: number;
};

export type SavedPartialBlockCell = {
  readonly block: number;
  readonly position: SavedPartialBlockVector;
  readonly cuts: readonly SavedPartialBlockCut[];
  readonly removedVisualCellIndexes?: readonly number[];
  readonly surfaceSamples?: readonly SavedPartialBlockSurfaceSample[];
  readonly damage: number;
  readonly maxHealth: number;
};

export type SavedChunkSnapshot = {
  readonly blocks: Uint8Array;
  readonly partialBlocks: readonly SavedPartialBlockCell[];
};

export interface SaveDatabase {
  getMetadata(key: string): Promise<string | null>;
  setMetadata(key: string, value: string): Promise<void>;
  listWorlds(): Promise<SavedWorld[]>;
  getWorld(worldId: string): Promise<SavedWorld | null>;
  putWorld(world: SavedWorld): Promise<void>;
  updateWorldTimestamp(worldId: string): Promise<void>;
  updateWorldPlayerState(worldId: string, playerState: SavedPlayerState): Promise<SavedWorld | null>;
  updateWorldDayNightState(worldId: string, dayNightState: SavedDayNightState): Promise<SavedWorld | null>;
  updateWorldInventoryState(worldId: string, inventoryState: InventoryState): Promise<SavedWorld | null>;
  deleteWorld(worldId: string): Promise<void>;
  listChunkKeys(worldId: string): Promise<string[]>;
  loadChunkSnapshot(worldId: string, chunkKey: string, options?: ChunkLoadOptions): Promise<SavedChunkSnapshot | null>;
  saveChunkSnapshot(worldId: string, chunkKey: string, snapshot: SavedChunkSnapshot): Promise<void>;
  loadChunk(worldId: string, chunkKey: string, options?: ChunkLoadOptions): Promise<Uint8Array | null>;
  saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void>;
  deleteChunk(worldId: string, chunkKey: string): Promise<void>;
}

export interface ChunkStorage {
  readonly worldId: string;
  listChunkKeys(): Promise<string[]>;
  loadChunkSnapshot(key: string): Promise<SavedChunkSnapshot | null>;
  saveChunkSnapshot(key: string, snapshot: SavedChunkSnapshot): Promise<void>;
  loadChunk(key: string): Promise<Uint8Array | null>;
  saveChunk(key: string, blocks: Uint8Array): Promise<void>;
  deleteChunk(key: string): Promise<void>;
}

export type ChunkLoadOptions = {
  readonly legacyHeightOffset?: number;
};

type ChunkStorageOptions = ChunkLoadOptions;

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
  partialBlocks?: unknown;
  updatedAt: number;
};

let sharedDatabasePromise: Promise<SaveDatabase> | null = null;

// IndexedDB is the real browser save backend. The memory backend keeps smoke tests and
// restricted/private browser contexts usable without pretending that data is persisted.
export async function createChunkStorage(
  worldId = DEFAULT_WORLD_ID,
  database: SaveDatabase | Promise<SaveDatabase> = openSaveDatabase(),
  options: ChunkStorageOptions = {}
): Promise<ChunkStorage> {
  return new IndexedDbChunkStorage(await database, worldId, options);
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
    await this.updateWorldRecord(worldId, (world) => ({
      ...world,
      updatedAt: Date.now()
    }));
  }

  async updateWorldPlayerState(worldId: string, playerState: SavedPlayerState): Promise<SavedWorld | null> {
    return this.updateWorldRecord(worldId, (world) => ({
      ...world,
      playerState: cloneSavedPlayerState(playerState),
      updatedAt: Date.now()
    }));
  }

  async updateWorldDayNightState(
    worldId: string,
    dayNightState: SavedDayNightState
  ): Promise<SavedWorld | null> {
    return this.updateWorldRecord(worldId, (world) => ({
      ...world,
      dayNightState: cloneSavedDayNightState(dayNightState),
      updatedAt: Date.now()
    }));
  }

  async updateWorldInventoryState(
    worldId: string,
    inventoryState: InventoryState
  ): Promise<SavedWorld | null> {
    return this.updateWorldRecord(worldId, (world) => ({
      ...world,
      inventoryState: cloneNormalizedInventoryState(inventoryState),
      updatedAt: Date.now()
    }));
  }

  async deleteWorld(worldId: string): Promise<void> {
    const transaction = this.database.transaction([WORLDS_STORE, CHUNKS_STORE], "readwrite");
    const done = transactionDone(transaction);
    const chunks = transaction.objectStore(CHUNKS_STORE);
    const chunkWorldIndex = chunks.index(CHUNK_WORLD_INDEX);
    const cursorRequest = chunkWorldIndex.openCursor(globalThis.IDBKeyRange.only(worldId));

    // World deletion removes both the metadata row and every edited chunk snapshot.
    // Using one transaction keeps the save list from drifting away from chunk payloads.
    transaction.objectStore(WORLDS_STORE).delete(worldId);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;

      cursor.delete();
      cursor.continue();
    };

    await done;
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

  async loadChunkSnapshot(
    worldId: string,
    chunkKey: string,
    options: ChunkLoadOptions = {}
  ): Promise<SavedChunkSnapshot | null> {
    const record = await this.getRecord<ChunkRecord>(CHUNKS_STORE, chunkRecordId(worldId, chunkKey));
    const blocks = decodeStoredBlocks(record?.blocks, options);
    if (!blocks) return null;

    return {
      blocks,
      partialBlocks: normalizeSavedPartialBlockCells(record?.partialBlocks)
    };
  }

  async saveChunkSnapshot(worldId: string, chunkKey: string, snapshot: SavedChunkSnapshot): Promise<void> {
    // Store the raw ArrayBuffer, not base64 text. IndexedDB can clone binary data directly.
    await this.putRecord(CHUNKS_STORE, {
      id: chunkRecordId(worldId, chunkKey),
      worldId,
      chunkKey,
      blocks: cloneChunkBuffer(snapshot.blocks),
      partialBlocks: cloneSavedPartialBlockCells(snapshot.partialBlocks),
      updatedAt: Date.now()
    });
    await this.updateWorldTimestamp(worldId);
  }

  async loadChunk(worldId: string, chunkKey: string, options: ChunkLoadOptions = {}): Promise<Uint8Array | null> {
    return (await this.loadChunkSnapshot(worldId, chunkKey, options))?.blocks ?? null;
  }

  async saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void> {
    await this.saveChunkSnapshot(worldId, chunkKey, {
      blocks,
      partialBlocks: []
    });
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

  private async updateWorldRecord(
    worldId: string,
    update: (world: SavedWorld) => SavedWorld
  ): Promise<SavedWorld | null> {
    const transaction = this.database.transaction(WORLDS_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(WORLDS_STORE);
    const currentWorld = normalizeWorld(await requestToPromise(store.get(worldId)));
    if (!currentWorld) {
      await done;
      return null;
    }

    // Keep metadata mutations in one readwrite transaction so chunk-save timestamp
    // touches cannot accidentally overwrite player-location saves from a stale read.
    const nextWorld = update(currentWorld);
    await requestToPromise(store.put(cloneSavedWorld(nextWorld)));
    await done;
    return cloneSavedWorld(nextWorld);
  }
}

class MemorySaveDatabase implements SaveDatabase {
  private readonly metadata = new Map<string, string>();
  private readonly worlds = new Map<string, SavedWorld>();
  private readonly chunks = new Map<string, SavedChunkSnapshot>();

  async getMetadata(key: string): Promise<string | null> {
    return this.metadata.get(key) ?? null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    this.metadata.set(key, value);
  }

  async listWorlds(): Promise<SavedWorld[]> {
    return Array.from(this.worlds.values())
      .map(normalizeWorld)
      .filter((world): world is SavedWorld => Boolean(world));
  }

  async getWorld(worldId: string): Promise<SavedWorld | null> {
    return normalizeWorld(this.worlds.get(worldId));
  }

  async putWorld(world: SavedWorld): Promise<void> {
    this.worlds.set(world.id, cloneSavedWorld(world));
  }

  async updateWorldTimestamp(worldId: string): Promise<void> {
    const world = this.worlds.get(worldId);
    if (!world) return;

    this.worlds.set(worldId, cloneSavedWorld({
      ...world,
      updatedAt: Date.now()
    }));
  }

  async updateWorldPlayerState(worldId: string, playerState: SavedPlayerState): Promise<SavedWorld | null> {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const updatedWorld = cloneSavedWorld({
      ...world,
      playerState: cloneSavedPlayerState(playerState),
      updatedAt: Date.now()
    });
    this.worlds.set(worldId, updatedWorld);
    return cloneSavedWorld(updatedWorld);
  }

  async updateWorldDayNightState(
    worldId: string,
    dayNightState: SavedDayNightState
  ): Promise<SavedWorld | null> {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const updatedWorld = cloneSavedWorld({
      ...world,
      dayNightState: cloneSavedDayNightState(dayNightState),
      updatedAt: Date.now()
    });
    this.worlds.set(worldId, updatedWorld);
    return cloneSavedWorld(updatedWorld);
  }

  async updateWorldInventoryState(
    worldId: string,
    inventoryState: InventoryState
  ): Promise<SavedWorld | null> {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const updatedWorld = cloneSavedWorld({
      ...world,
      inventoryState: cloneNormalizedInventoryState(inventoryState),
      updatedAt: Date.now()
    });
    this.worlds.set(worldId, updatedWorld);
    return cloneSavedWorld(updatedWorld);
  }

  async deleteWorld(worldId: string): Promise<void> {
    const prefix = `${worldId}|`;
    this.worlds.delete(worldId);

    for (const recordId of this.chunks.keys()) {
      if (recordId.startsWith(prefix)) {
        this.chunks.delete(recordId);
      }
    }
  }

  async listChunkKeys(worldId: string): Promise<string[]> {
    const prefix = `${worldId}|`;
    return Array.from(this.chunks.keys())
      .filter((recordId) => recordId.startsWith(prefix))
      .map((recordId) => recordId.slice(prefix.length));
  }

  async loadChunkSnapshot(
    worldId: string,
    chunkKey: string,
    options: ChunkLoadOptions = {}
  ): Promise<SavedChunkSnapshot | null> {
    const snapshot = this.chunks.get(chunkRecordId(worldId, chunkKey));
    const blocks = decodeStoredBlocks(snapshot?.blocks, options);
    if (!blocks) return null;

    return {
      blocks,
      partialBlocks: cloneSavedPartialBlockCells(snapshot?.partialBlocks ?? [])
    };
  }

  async saveChunkSnapshot(worldId: string, chunkKey: string, snapshot: SavedChunkSnapshot): Promise<void> {
    this.chunks.set(chunkRecordId(worldId, chunkKey), cloneSavedChunkSnapshot(snapshot));
    await this.updateWorldTimestamp(worldId);
  }

  async loadChunk(worldId: string, chunkKey: string, options: ChunkLoadOptions = {}): Promise<Uint8Array | null> {
    return (await this.loadChunkSnapshot(worldId, chunkKey, options))?.blocks ?? null;
  }

  async saveChunk(worldId: string, chunkKey: string, blocks: Uint8Array): Promise<void> {
    await this.saveChunkSnapshot(worldId, chunkKey, {
      blocks,
      partialBlocks: []
    });
  }

  async deleteChunk(worldId: string, chunkKey: string): Promise<void> {
    this.chunks.delete(chunkRecordId(worldId, chunkKey));
    await this.updateWorldTimestamp(worldId);
  }
}

class IndexedDbChunkStorage implements ChunkStorage {
  readonly worldId: string;
  private readonly database: SaveDatabase;
  private readonly legacyHeightOffset: number;

  constructor(database: SaveDatabase, worldId: string, options: ChunkStorageOptions = {}) {
    this.database = database;
    this.worldId = worldId || DEFAULT_WORLD_ID;
    this.legacyHeightOffset = Math.trunc(options.legacyHeightOffset ?? 0);
  }

  async listChunkKeys(): Promise<string[]> {
    return this.database.listChunkKeys(this.worldId);
  }

  async loadChunkSnapshot(key: string): Promise<SavedChunkSnapshot | null> {
    try {
      return await this.database.loadChunkSnapshot(this.worldId, key, {
        legacyHeightOffset: this.legacyHeightOffset
      });
    } catch (error) {
      console.warn("Could not load persisted chunk edit", key, error);
      return null;
    }
  }

  async saveChunkSnapshot(key: string, snapshot: SavedChunkSnapshot): Promise<void> {
    try {
      await this.database.saveChunkSnapshot(this.worldId, key, snapshot);
    } catch (error) {
      console.warn("Could not persist chunk edit", key, error);
    }
  }

  async loadChunk(key: string): Promise<Uint8Array | null> {
    try {
      return (await this.loadChunkSnapshot(key))?.blocks ?? null;
    } catch (error) {
      console.warn("Could not load persisted chunk edit", key, error);
      return null;
    }
  }

  async saveChunk(key: string, blocks: Uint8Array): Promise<void> {
    try {
      await this.saveChunkSnapshot(key, {
        blocks,
        partialBlocks: []
      });
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

  async loadChunkSnapshot(): Promise<SavedChunkSnapshot | null> {
    return null;
  }

  async saveChunk(): Promise<void> {}

  async saveChunkSnapshot(): Promise<void> {}

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

  async createWorld(name: string, seed: string, terrainProfile?: TerrainProfile): Promise<SavedWorld> {
    const now = Date.now();
    const worldSeed = sanitizeWorldSeed(seed) || createRandomSeed(now);
    const worldTerrainProfile = getNewWorldTerrainProfile(worldSeed, terrainProfile);
    const world: SavedWorld = {
      id: createWorldId(now),
      name: sanitizeWorldName(name),
      seed: worldSeed,
      terrainProfile: worldTerrainProfile,
      createdAt: now,
      updatedAt: now,
      dayNightState: createSavedDayNightState(undefined, now),
      inventoryState: createDefaultInventoryState(SAVED_INVENTORY_OPTIONS)
    };

    await this.database.putWorld(world);
    await this.database.setMetadata(ACTIVE_WORLD_KEY, world.id);
    return world;
  }

  async deleteWorld(worldId: string): Promise<SavedWorld> {
    const activeWorldId = await this.getActiveWorldId();
    await this.database.deleteWorld(worldId);

    let worlds = await this.listWorlds();
    if (worlds.length === 0) {
      await this.ensureDefaultWorld();
      worlds = await this.listWorlds();
    }

    const activeWorldStillExists = worlds.some((world) => world.id === activeWorldId);
    const userCreatedWorlds = worlds.filter((world) => world.id !== DEFAULT_WORLD_ID);
    const nextActiveWorld = activeWorldStillExists
      ? worlds.find((world) => world.id === activeWorldId) ?? worlds[0]
      : userCreatedWorlds[0] ?? worlds[0];

    await this.database.setMetadata(ACTIVE_WORLD_KEY, nextActiveWorld.id);
    return nextActiveWorld;
  }

  async ensureDefaultWorld(): Promise<void> {
    const defaultWorld = await this.database.getWorld(DEFAULT_WORLD_ID);
    if (defaultWorld) return;

    const now = Date.now();
    await this.database.putWorld({
      id: DEFAULT_WORLD_ID,
      name: DEFAULT_WORLD_NAME,
      seed: DEFAULT_WORLD_SEED,
      terrainProfile: "classic",
      createdAt: now,
      updatedAt: now,
      dayNightState: createSavedDayNightState(undefined, now),
      inventoryState: createDefaultInventoryState(SAVED_INVENTORY_OPTIONS)
    });
  }

  async updatePlayerState(
    worldId: string,
    snapshot: SavedPlayerStateSnapshot
  ): Promise<SavedWorld | null> {
    const playerState = createSavedPlayerState(snapshot);
    if (!playerState) return null;

    return this.database.updateWorldPlayerState(worldId, playerState);
  }

  async updateDayNightState(
    worldId: string,
    state: DayNightState
  ): Promise<SavedWorld | null> {
    return this.database.updateWorldDayNightState(worldId, createSavedDayNightState(state));
  }

  async updateInventoryState(
    worldId: string,
    state: InventoryState
  ): Promise<SavedWorld | null> {
    return this.database.updateWorldInventoryState(
      worldId,
      cloneNormalizedInventoryState(state)
    );
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
  const seed = sanitizeWorldSeed(world.seed);
  const createdAt = readTimestamp(world.createdAt);
  const updatedAt = readTimestamp(world.updatedAt);

  // Normalize on read so future metadata additions can be optional and backwards-compatible.
  const normalizedWorld: SavedWorld = {
    id: world.id,
    name: sanitizeWorldName(world.name),
    seed,
    terrainProfile: normalizeSavedTerrainProfile(world.terrainProfile, seed, createdAt),
    createdAt,
    updatedAt
  };

  const playerState = normalizeSavedPlayerState(world.playerState);
  if (playerState) normalizedWorld.playerState = playerState;

  const dayNightState = normalizeSavedDayNightState(world.dayNightState);
  if (dayNightState) normalizedWorld.dayNightState = dayNightState;

  // Inventory metadata lives in the existing world record, so old databases do
  // not need a schema upgrade. Missing, stale, and malformed ids/quantities are
  // normalized against the current registry every time a world is read.
  normalizedWorld.inventoryState = normalizeSavedWorldInventoryState(world.inventoryState);

  return normalizedWorld;
}

function cloneSavedWorld(world: SavedWorld): SavedWorld {
  const clonedWorld: SavedWorld = { ...world };
  if (world.playerState) clonedWorld.playerState = cloneSavedPlayerState(world.playerState);
  if (world.dayNightState) clonedWorld.dayNightState = cloneSavedDayNightState(world.dayNightState);
  if (world.inventoryState) {
    clonedWorld.inventoryState = cloneNormalizedInventoryState(world.inventoryState);
  }
  return clonedWorld;
}

function normalizeSavedWorldInventoryState(value: unknown): InventoryState {
  return normalizeInventoryState(value, SAVED_INVENTORY_OPTIONS);
}

function cloneNormalizedInventoryState(value: unknown): InventoryState {
  return cloneInventoryState(normalizeSavedWorldInventoryState(value));
}

function cloneSavedDayNightState(state: SavedDayNightState): SavedDayNightState {
  return createSavedDayNightState(state, state.savedAt);
}

export function getNewWorldTerrainProfile(seed: string, requestedProfile?: TerrainProfile): TerrainProfile {
  if (isSuperflatSeed(seed)) return "classic";
  if (requestedProfile === "floating-islands") return "floating-islands";
  if (requestedProfile === "classic" || requestedProfile === "varied") return requestedProfile;
  return "varied";
}

export function normalizeSavedTerrainProfile(
  value: unknown,
  seed = "",
  createdAt = 0
): TerrainProfile {
  if (value === "varied" || value === "classic" || value === "floating-islands") return value;
  if (!seed || isSuperflatSeed(seed)) return "classic";

  // Legacy saved worlds predate terrain-profile metadata, so keep them on the
  // old seeded generator instead of mixing saved old chunks with newly streamed
  // varied-profile neighbors. Worlds created during the short v0.6.26 window
  // after varied terrain shipped but before this metadata existed stay varied.
  return createdAt >= VARIED_TERRAIN_PROFILE_INTRODUCED_AT ? "varied" : "classic";
}

function readTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createSavedPlayerState(snapshot: SavedPlayerStateSnapshot): SavedPlayerState | null {
  const normalizedSnapshot = normalizeSavedPlayerState({
    ...snapshot,
    savedAt: Date.now(),
    worldHeight: WORLD_HEIGHT
  });
  return normalizedSnapshot;
}

function normalizeSavedPlayerState(value: unknown): SavedPlayerState | null {
  if (!isRecord(value)) return null;

  // The persisted point is the player's feet, not the camera. That keeps crouch
  // view smoothing from turning into a corrupted spawn height after reload.
  const rawFeetPosition = isRecord(value.feetPosition)
    ? value.feetPosition
    : isRecord(value.position)
      ? value.position
      : null;
  if (!rawFeetPosition) return null;

  const x = readFiniteNumber(rawFeetPosition.x);
  const y = readFiniteNumber(rawFeetPosition.y);
  const z = readFiniteNumber(rawFeetPosition.z);
  const yaw = readFiniteNumber(value.yaw);
  const pitch = readFiniteNumber(value.pitch);
  if (x === null || y === null || z === null || yaw === null || pitch === null) return null;

  return {
    feetPosition: { x, y, z },
    yaw,
    pitch,
    savedAt: readTimestamp(value.savedAt),
    worldHeight: readPositiveInteger(value.worldHeight) ?? LEGACY_WORLD_HEIGHT
  };
}

function cloneSavedPlayerState(playerState: SavedPlayerState): SavedPlayerState {
  return {
    feetPosition: { ...playerState.feetPosition },
    yaw: playerState.yaw,
    pitch: playerState.pitch,
    savedAt: playerState.savedAt,
    worldHeight: playerState.worldHeight
  };
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFiniteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function readNonNegativeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function cloneSavedChunkSnapshot(snapshot: SavedChunkSnapshot): SavedChunkSnapshot {
  return {
    blocks: snapshot.blocks.slice(),
    partialBlocks: cloneSavedPartialBlockCells(snapshot.partialBlocks)
  };
}

function cloneSavedPartialBlockCells(cells: readonly SavedPartialBlockCell[]): SavedPartialBlockCell[] {
  return cells.map(cloneSavedPartialBlockCell);
}

function cloneSavedPartialBlockCell(cell: SavedPartialBlockCell): SavedPartialBlockCell {
  return {
    block: cell.block,
    position: { ...cell.position },
    cuts: cell.cuts.map(cloneSavedPartialBlockCut),
    ...(cell.removedVisualCellIndexes
      ? { removedVisualCellIndexes: [...cell.removedVisualCellIndexes] }
      : {}),
    ...(cell.surfaceSamples
      ? { surfaceSamples: cell.surfaceSamples.map(cloneSavedPartialBlockSurfaceSample) }
      : {}),
    damage: cell.damage,
    maxHealth: cell.maxHealth
  };
}

function cloneSavedPartialBlockCut(cut: SavedPartialBlockCut): SavedPartialBlockCut {
  return {
    normal: { ...cut.normal },
    localPoint: { ...cut.localPoint },
    ...(cut.trajectory ? { trajectory: { ...cut.trajectory } } : {}),
    ...(typeof cut.coreRadius === "number" ? { coreRadius: cut.coreRadius } : {}),
    ...(cut.exactRemovedVisualCellIndexes
      ? { exactRemovedVisualCellIndexes: [...cut.exactRemovedVisualCellIndexes] }
      : {}),
    radius: cut.radius,
    depth: cut.depth,
    seed: cut.seed
  };
}

function cloneSavedPartialBlockSurfaceSample(sample: SavedPartialBlockSurfaceSample): SavedPartialBlockSurfaceSample {
  return { ...sample };
}

function normalizeSavedPartialBlockCells(value: unknown): SavedPartialBlockCell[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeSavedPartialBlockCell)
    .filter((cell): cell is SavedPartialBlockCell => Boolean(cell));
}

function normalizeSavedPartialBlockCell(value: unknown): SavedPartialBlockCell | null {
  if (!isRecord(value)) return null;

  const block = readFiniteInteger(value.block);
  const position = normalizeSavedPartialBlockVector(value.position, true);
  const damage = readNonNegativeFiniteNumber(value.damage);
  const maxHealth = readNonNegativeFiniteNumber(value.maxHealth);
  if (block === null || !position || damage === null || maxHealth === null || maxHealth <= 0) return null;

  const cuts = Array.isArray(value.cuts)
    ? value.cuts
      .map(normalizeSavedPartialBlockCut)
      .filter((cut): cut is SavedPartialBlockCut => Boolean(cut))
    : [];
  const removedVisualCellIndexes = normalizeSavedCellIndexes(value.removedVisualCellIndexes);
  const surfaceSamples = Array.isArray(value.surfaceSamples)
    ? value.surfaceSamples
      .map(normalizeSavedPartialBlockSurfaceSample)
      .filter((sample): sample is SavedPartialBlockSurfaceSample => Boolean(sample))
    : [];

  return {
    block,
    position,
    cuts,
    ...(removedVisualCellIndexes.length > 0 ? { removedVisualCellIndexes } : {}),
    ...(surfaceSamples.length > 0 ? { surfaceSamples } : {}),
    damage: Math.min(damage, maxHealth),
    maxHealth
  };
}

function normalizeSavedPartialBlockCut(value: unknown): SavedPartialBlockCut | null {
  if (!isRecord(value)) return null;

  const normal = normalizeSavedPartialBlockVector(value.normal);
  const localPoint = normalizeSavedPartialBlockVector(value.localPoint);
  const trajectory = normalizeSavedPartialBlockVector(value.trajectory);
  const radius = readNonNegativeFiniteNumber(value.radius);
  const depth = readNonNegativeFiniteNumber(value.depth);
  const seed = readFiniteInteger(value.seed);
  if (!normal || !localPoint || radius === null || depth === null || seed === null) return null;

  const coreRadius = readNonNegativeFiniteNumber(value.coreRadius);
  const exactRemovedVisualCellIndexes = normalizeSavedCellIndexes(value.exactRemovedVisualCellIndexes);
  return {
    normal,
    localPoint,
    ...(trajectory ? { trajectory } : {}),
    ...(coreRadius !== null ? { coreRadius } : {}),
    ...(exactRemovedVisualCellIndexes.length > 0 ? { exactRemovedVisualCellIndexes } : {}),
    radius,
    depth,
    seed
  };
}

function normalizeSavedPartialBlockVector(value: unknown, integer = false): SavedPartialBlockVector | null {
  if (!isRecord(value)) return null;

  const x = integer ? readFiniteInteger(value.x) : readFiniteNumber(value.x);
  const y = integer ? readFiniteInteger(value.y) : readFiniteNumber(value.y);
  const z = integer ? readFiniteInteger(value.z) : readFiniteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function normalizeSavedPartialBlockSurfaceSample(value: unknown): SavedPartialBlockSurfaceSample | null {
  if (!isRecord(value)) return null;

  const localX = readFiniteNumber(value.localX);
  const localZ = readFiniteNumber(value.localZ);
  const height = readFiniteNumber(value.height);
  const weight = readNonNegativeFiniteNumber(value.weight);
  if (localX === null || localZ === null || height === null || weight === null) return null;

  return {
    localX: Math.max(0, Math.min(1, localX)),
    localZ: Math.max(0, Math.min(1, localZ)),
    height: Math.max(0, Math.min(1, height)),
    weight
  };
}

function normalizeSavedCellIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const uniqueIndexes = new Set<number>();
  for (const entry of value) {
    const index = readFiniteInteger(entry);
    if (index === null || index < 0 || index >= PARTIAL_BLOCK_VISUAL_CELL_COUNT) continue;
    uniqueIndexes.add(index);
  }
  return [...uniqueIndexes].sort((left, right) => left - right);
}

function cloneChunkBuffer(blocks: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(blocks.byteLength);
  copy.set(blocks);
  return copy.buffer;
}

function decodeStoredBlocks(blocks: unknown, options: ChunkLoadOptions = {}): Uint8Array | null {
  if (!blocks) return null;

  const decoded = decodeBinaryPayload(blocks);
  if (!decoded) return null;

  if (decoded.length !== CHUNK_BYTE_LENGTH) {
    if (decoded.length === LEGACY_CHUNK_BYTE_LENGTH) {
      return expandLegacyChunkBlocks(decoded, Math.trunc(options.legacyHeightOffset ?? 0));
    }

    // A non-migratable length mismatch means this payload belongs to another chunk shape or a corrupt save.
    return null;
  }

  return decoded;
}

function expandLegacyChunkBlocks(blocks: Uint8Array, verticalOffset: number): Uint8Array {
  const expanded = new Uint8Array(CHUNK_BYTE_LENGTH);
  const safeOffset = Math.max(0, Math.min(WORLD_HEIGHT - LEGACY_WORLD_HEIGHT, verticalOffset));

  // Old saves used the same X/Z footprint and a 48-block Y span. Classic worlds
  // keep absolute Y. Varied worlds opt into the expanded terrain lift so edited
  // chunks line up with their newly generated neighbors instead of forming old
  // low shelves beside raised terrain.
  for (let y = 0; y < LEGACY_WORLD_HEIGHT; y += 1) {
    const sourceStart = CHUNK_SIZE * CHUNK_SIZE * y;
    const targetStart = CHUNK_SIZE * CHUNK_SIZE * (y + safeOffset);
    expanded.set(blocks.subarray(sourceStart, sourceStart + CHUNK_SIZE * CHUNK_SIZE), targetStart);
  }

  return expanded;
}

export function getLegacyWorldHeightOffset(terrainProfile: TerrainProfile): number {
  return terrainProfile === "varied" ? EXPANDED_TERRAIN_SURFACE_OFFSET : 0;
}

export function migrateSavedPlayerStateHeight(savedWorld: SavedWorld): SavedPlayerStateSnapshot | null {
  const playerState = savedWorld.playerState;
  if (!playerState) return null;

  const legacyOffset = getLegacyWorldHeightOffset(savedWorld.terrainProfile);
  if (legacyOffset <= 0 || playerState.worldHeight >= WORLD_HEIGHT) return playerState;

  return {
    feetPosition: {
      ...playerState.feetPosition,
      y: playerState.feetPosition.y + legacyOffset
    },
    yaw: playerState.yaw,
    pitch: playerState.pitch
  };
}

function decodeBinaryPayload(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload.slice();
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload.slice(0));
  if (!ArrayBuffer.isView(payload)) return null;

  // IndexedDB should give us ArrayBuffer/Uint8Array here, but accepting typed-array views keeps
  // older experimental saves readable if their shape is otherwise correct.
  const view = payload as ArrayBufferView;
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  return new Uint8Array(buffer);
}
