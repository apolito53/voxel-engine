import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants.js";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = `voxel-engine:v${STORAGE_VERSION}`;
const ACTIVE_WORLD_KEY = `${STORAGE_PREFIX}:active-world`;
const WORLDS_KEY = `${STORAGE_PREFIX}:worlds`;
const DEFAULT_WORLD_ID = "default";
const DEFAULT_WORLD_NAME = "Default World";
const LEGACY_INDEX_KEY = `${STORAGE_PREFIX}:chunk-index`;
const LEGACY_CHUNK_KEY_PREFIX = `${STORAGE_PREFIX}:chunk:`;
const CHUNK_BYTE_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

// Storage is deliberately versioned and isolated so old save formats can be ignored later.
export function createChunkStorage(storage = readBrowserStorage(), worldId = readActiveWorldId(storage)) {
  return storage ? new LocalChunkStorage(storage, worldId) : new NullChunkStorage(worldId);
}

export function createWorldRegistry(storage = readBrowserStorage()) {
  return storage ? new LocalWorldRegistry(storage) : new NullWorldRegistry();
}

function readActiveWorldId(storage = readBrowserStorage()) {
  if (!storage) return DEFAULT_WORLD_ID;

  try {
    return storage.getItem(ACTIVE_WORLD_KEY) || DEFAULT_WORLD_ID;
  } catch {
    return DEFAULT_WORLD_ID;
  }
}

class LocalChunkStorage {
  constructor(storage, worldId) {
    this.storage = storage;
    this.worldId = worldId || DEFAULT_WORLD_ID;
  }

  loadAll() {
    const chunks = new Map();

    // The index keeps startup cheap: we only scan keys that this engine wrote.
    for (const key of this.readIndex()) {
      const blocks = this.loadChunk(key);
      if (blocks) {
        chunks.set(key, blocks);
      } else {
        this.deleteChunk(key);
      }
    }

    return chunks;
  }

  saveChunk(key, blocks) {
    // Each saved chunk is a full Uint8Array snapshot. Wasteful, yes; wonderfully simple, also yes.
    const keys = this.readIndex();
    if (!keys.includes(key)) keys.push(key);

    try {
      this.storage.setItem(this.chunkKey(key), encodeBlocks(blocks));
      this.writeIndex(keys);
      updateWorldTimestamp(this.storage, this.worldId);
    } catch (error) {
      console.warn("Could not persist chunk edit", key, error);
    }
  }

  deleteChunk(key) {
    // Keep the index and payload in sync so deleted edits stop shadowing generated terrain.
    const keys = this.readIndex().filter((storedKey) => storedKey !== key);

    try {
      this.storage.removeItem(this.chunkKey(key));
      this.writeIndex(keys);
    } catch (error) {
      console.warn("Could not delete persisted chunk edit", key, error);
    }
  }

  loadChunk(key) {
    // Bad payloads are treated as missing chunks instead of breaking the whole world load.
    try {
      const encoded = this.storage.getItem(this.chunkKey(key));
      return encoded ? decodeBlocks(encoded) : null;
    } catch (error) {
      console.warn("Could not load persisted chunk edit", key, error);
      return null;
    }
  }

  readIndex() {
    // If the index is missing or corrupt, fall back to an empty save set.
    try {
      const encoded = this.storage.getItem(this.indexKey());
      const parsed = encoded ? JSON.parse(encoded) : [];
      return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  writeIndex(keys) {
    this.storage.setItem(this.indexKey(), JSON.stringify(keys));
  }

  chunkKey(key) {
    return `${this.chunkKeyPrefix()}${key}`;
  }

  indexKey() {
    // The original single-world save used the legacy keys; keeping default there migrates nothing.
    return this.worldId === DEFAULT_WORLD_ID
      ? LEGACY_INDEX_KEY
      : `${STORAGE_PREFIX}:world:${this.worldId}:chunk-index`;
  }

  chunkKeyPrefix() {
    return this.worldId === DEFAULT_WORLD_ID
      ? LEGACY_CHUNK_KEY_PREFIX
      : `${STORAGE_PREFIX}:world:${this.worldId}:chunk:`;
  }
}

class LocalWorldRegistry {
  constructor(storage) {
    this.storage = storage;
    // The default world is where the old single-save chunks live, so it must always exist.
    this.ensureDefaultWorld();
  }

  listWorlds() {
    // Most recently edited worlds float to the top of the menu.
    return this.readWorlds().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getActiveWorldId() {
    return readActiveWorldId(this.storage);
  }

  setActiveWorld(worldId) {
    const worlds = this.readWorlds();
    if (!worlds.some((world) => world.id === worldId)) return this.getActiveWorldId();

    this.storage.setItem(ACTIVE_WORLD_KEY, worldId);
    return worldId;
  }

  createWorld(name) {
    const now = Date.now();
    // World metadata is intentionally tiny; chunk payloads live under per-world keys.
    const world = {
      id: createWorldId(now),
      name: sanitizeWorldName(name),
      createdAt: now,
      updatedAt: now
    };
    const worlds = [world, ...this.readWorlds()];
    this.writeWorlds(worlds);
    this.storage.setItem(ACTIVE_WORLD_KEY, world.id);
    return world;
  }

  ensureDefaultWorld() {
    const worlds = this.readWorlds();
    if (worlds.some((world) => world.id === DEFAULT_WORLD_ID)) return;

    const now = Date.now();
    worlds.push({
      id: DEFAULT_WORLD_ID,
      name: DEFAULT_WORLD_NAME,
      createdAt: now,
      updatedAt: now
    });
    this.writeWorlds(worlds);
  }

  readWorlds() {
    // Corrupt world metadata should not stop the engine from booting into the default world.
    try {
      const encoded = this.storage.getItem(WORLDS_KEY);
      const parsed = encoded ? JSON.parse(encoded) : [];
      return Array.isArray(parsed)
        ? parsed.map(normalizeWorld).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  writeWorlds(worlds) {
    this.storage.setItem(WORLDS_KEY, JSON.stringify(worlds));
  }
}

class NullChunkStorage {
  // Node smoke tests and privacy-restricted browsers can run without persistent storage.
  constructor(worldId = DEFAULT_WORLD_ID) {
    this.worldId = worldId;
  }

  loadAll() {
    return new Map();
  }

  saveChunk() {}

  deleteChunk() {}
}

class NullWorldRegistry {
  listWorlds() {
    return [{
      id: DEFAULT_WORLD_ID,
      name: DEFAULT_WORLD_NAME,
      createdAt: 0,
      updatedAt: 0
    }];
  }

  getActiveWorldId() {
    return DEFAULT_WORLD_ID;
  }

  setActiveWorld() {
    return DEFAULT_WORLD_ID;
  }

  createWorld() {
    return this.listWorlds()[0];
  }
}

function readBrowserStorage() {
  // Accessing localStorage itself can throw in restricted browser contexts.
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function updateWorldTimestamp(storage, worldId) {
  // Timestamps are menu metadata only; failing to update one should never affect chunk saves.
  const registry = new LocalWorldRegistry(storage);
  const worlds = registry.readWorlds();
  const world = worlds.find((candidate) => candidate.id === worldId);
  if (!world) return;

  world.updatedAt = Date.now();
  registry.writeWorlds(worlds);
}

function createWorldId(now) {
  const random = Math.random().toString(36).slice(2, 8);
  return `world-${now.toString(36)}-${random}`;
}

function sanitizeWorldName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Untitled World";
}

function normalizeWorld(world) {
  if (!world || typeof world.id !== "string") return null;

  // Normalize on read so future metadata additions can be optional and backwards-compatible.
  return {
    id: world.id,
    name: sanitizeWorldName(world.name),
    createdAt: Number.isFinite(world.createdAt) ? world.createdAt : 0,
    updatedAt: Number.isFinite(world.updatedAt) ? world.updatedAt : 0
  };
}

function encodeBlocks(blocks) {
  if (typeof btoa === "function") {
    let binary = "";
    // Build the binary string in slices so large chunks do not overflow the argument stack.
    for (let offset = 0; offset < blocks.length; offset += 0x8000) {
      const slice = blocks.subarray(offset, offset + 0x8000);
      binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(blocks).toString("base64");
  }

  throw new Error("No base64 encoder is available.");
}

function decodeBlocks(encoded) {
  let binary;

  if (typeof atob === "function") {
    binary = atob(encoded);
  } else if (typeof Buffer !== "undefined") {
    binary = Buffer.from(encoded, "base64").toString("binary");
  } else {
    throw new Error("No base64 decoder is available.");
  }

  if (binary.length !== CHUNK_BYTE_LENGTH) {
    // A length mismatch means this payload belongs to another chunk shape or a corrupt save.
    return null;
  }

  const blocks = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    blocks[index] = binary.charCodeAt(index);
  }
  return blocks;
}
