import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants.js";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = `voxel-engine:v${STORAGE_VERSION}`;
const INDEX_KEY = `${STORAGE_PREFIX}:chunk-index`;
const CHUNK_KEY_PREFIX = `${STORAGE_PREFIX}:chunk:`;
const CHUNK_BYTE_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

// Storage is deliberately versioned and isolated so old save formats can be ignored later.
export function createChunkStorage(storage = readBrowserStorage()) {
  return storage ? new LocalChunkStorage(storage) : new NullChunkStorage();
}

class LocalChunkStorage {
  constructor(storage) {
    this.storage = storage;
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
      const encoded = this.storage.getItem(INDEX_KEY);
      const parsed = encoded ? JSON.parse(encoded) : [];
      return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  writeIndex(keys) {
    this.storage.setItem(INDEX_KEY, JSON.stringify(keys));
  }

  chunkKey(key) {
    return `${CHUNK_KEY_PREFIX}${key}`;
  }
}

class NullChunkStorage {
  // Node smoke tests and privacy-restricted browsers can run without persistent storage.
  loadAll() {
    return new Map();
  }

  saveChunk() {}

  deleteChunk() {}
}

function readBrowserStorage() {
  // Accessing localStorage itself can throw in restricted browser contexts.
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
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
