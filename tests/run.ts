import * as THREE from "three";
import { BLOCK } from "../src/blocks";
import { Chunk } from "../src/chunk";
import { QUALITY_PRESET_ORDER, QUALITY_PRESETS, SUPER_ULTRA_PRESET_ID } from "../src/qualityPresets";
import { voxelRaycast } from "../src/raycast";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "../src/shadows";
import { createTerrainContext, generateChunkBlocks, getTerrainHeight } from "../src/terrain";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../src/voxelConstants";
import { VoxelWorld } from "../src/world";

type TestCase = {
  readonly name: string;
  readonly run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}. Expected ${expectedJson}, got ${actualJson}.`);
  }
}

function assertUint8ArraysEqual(actual: Uint8Array, expected: Uint8Array, message: string): void {
  assertEqual(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${message}. First difference at ${index}: ${actual[index]} !== ${expected[index]}.`);
    }
  }
}

function hasAnyDifference(left: Uint8Array, right: Uint8Array): boolean {
  assertEqual(left.length, right.length, "Compared chunk payloads should have equal length");
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true;
  }
  return false;
}

test("world chunk coordinates wrap cleanly across zero", () => {
  const world = new VoxelWorld({ seed: "coord-test" });

  assertDeepEqual(world.toChunkCoords(0, 0), { cx: 0, cz: 0, lx: 0, lz: 0 }, "origin coordinate");
  assertDeepEqual(world.toChunkCoords(15.9, 15.9), { cx: 0, cz: 0, lx: 15, lz: 15 }, "positive chunk edge");
  assertDeepEqual(world.toChunkCoords(16, 16), { cx: 1, cz: 1, lx: 0, lz: 0 }, "next positive chunk");
  assertDeepEqual(world.toChunkCoords(-0.1, -0.1), { cx: -1, cz: -1, lx: 15, lz: 15 }, "negative fractional edge");
  assertDeepEqual(world.toChunkCoords(-16, -16), { cx: -1, cz: -1, lx: 0, lz: 0 }, "negative exact chunk edge");
  assertDeepEqual(world.toChunkCoords(-16.1, 32), { cx: -2, cz: 2, lx: 15, lz: 0 }, "mixed-sign coordinates");
});

test("chunk top-column cache follows block edits", () => {
  const chunk = new Chunk(0, 0);

  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.air, y: 0 }, "empty column top");
  assert(chunk.setLocal(2, 4, 3, BLOCK.stone), "placing a block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.stone, y: 4 }, "placed block becomes top");
  assert(chunk.setLocal(2, 7, 3, BLOCK.grass), "higher block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.grass, y: 7 }, "higher block wins top");
  assert(chunk.setLocal(2, 7, 3, BLOCK.air), "removing the top block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.stone, y: 4 }, "top falls back to next solid block");
  assert(chunk.setLocal(2, 4, 3, BLOCK.air), "removing final block should mutate the chunk");
  assertDeepEqual(chunk.getTopLocal(2, 3), { block: BLOCK.air, y: 0 }, "empty column returns air again");
});

test("terrain generation is deterministic by seed", () => {
  const alphaTerrainA = createTerrainContext("alpha");
  const alphaTerrainB = createTerrainContext("alpha");
  const betaTerrain = createTerrainContext("beta");

  assertDeepEqual(alphaTerrainA, alphaTerrainB, "same seed should produce same terrain context");
  assert(
    getTerrainHeight(11, -7, alphaTerrainA) !== getTerrainHeight(11, -7, betaTerrain) ||
      getTerrainHeight(41, 19, alphaTerrainA) !== getTerrainHeight(41, 19, betaTerrain),
    "different seeds should affect at least one sampled terrain height"
  );

  const alphaChunkA = generateChunkBlocks(1, -2, alphaTerrainA);
  const alphaChunkB = generateChunkBlocks(1, -2, alphaTerrainB);
  const betaChunk = generateChunkBlocks(1, -2, betaTerrain);
  assertUint8ArraysEqual(alphaChunkA, alphaChunkB, "same seed should generate identical chunk blocks");
  assert(hasAnyDifference(alphaChunkA, betaChunk), "different seed should generate a different chunk payload");
});

test("raycast returns hit block and entry face", () => {
  const solids = new Set(["3,1,0", "0,0,0"]);
  const world = {
    isSolid(x: number, y: number, z: number): boolean {
      return solids.has(`${x},${y},${z}`);
    }
  };

  assertDeepEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 8),
    { block: { x: 3, y: 1, z: 0 }, normal: { x: -1, y: 0, z: 0 }, distance: 2.5 },
    "positive x raycast should hit the west face of the target block"
  );
  assertDeepEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 8),
    { block: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 0.5 },
    "downward raycast should hit the top face of the target block"
  );
  assertEqual(
    voxelRaycast(world, { x: 0.5, y: 1.5, z: 0.5 }, { x: 0, y: 0, z: 1 }, 2),
    null,
    "raycast should miss when no solid is within reach"
  );
});

test("world fallback streaming loads and unloads bounded chunk windows", () => {
  const world = new VoxelWorld({ seed: "stream-test" });
  const scene = new THREE.Scene();

  world.streamChunksAround(0, 0, scene, 1, 2, 32);
  assertEqual(world.getStats().loadedChunks, 9, "radius-one stream should load a 3x3 chunk window without a worker");
  assertEqual(world.getStats().queuedChunks, 0, "large fallback budget should drain the queue");

  world.streamChunksAround(CHUNK_SIZE * 8, 0, scene, 1, 2, 32);
  const stats = world.getStats();
  assertEqual(stats.loadedChunks, 9, "unload radius should keep the new 3x3 window bounded");
  assertEqual(stats.pendingChunkLoads, 0, "fallback streaming should not leave pending worker loads");
});

test("world block reads, writes, and solidity follow bounds", async () => {
  const world = new VoxelWorld({ seed: "block-test" });
  world.ensureChunksAround(0, 0, 0);

  world.setBlock(1, 2, 3, BLOCK.ember);
  assertEqual(world.getBlock(1, 2, 3), BLOCK.ember, "setBlock should update world reads");
  assert(world.isSolid(1.2, 2.1, 3.8), "solid placed block should collide");
  assert(world.isSolid(1, -1, 3), "space below the world is solid collision ground");
  assertEqual(world.getBlock(1, WORLD_HEIGHT, 3), BLOCK.air, "reads above world height return air");

  await world.flushStorageWrites();
  assertEqual(world.getStats().savedChunks, 1, "edited chunk should be tracked as saved");
});

test("quality presets keep scheduler and render-distance invariants", () => {
  const presetIds = [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID];

  for (const presetId of presetIds) {
    const preset = QUALITY_PRESETS[presetId];
    assert(preset.unloadRadius > preset.loadRadius, `${preset.label} unload radius should exceed load radius`);
    assert(preset.chunkLoads >= 1, `${preset.label} should request at least one chunk load`);
    assert(preset.chunkRebuilds >= 1, `${preset.label} should request at least one chunk rebuild`);
    assert(preset.cameraFar > preset.fogNear, `${preset.label} camera far should exceed fog near`);
    assert(preset.fogFar > preset.fogNear, `${preset.label} fog far should exceed fog near`);
    assert(isPowerOfTwo(preset.shadowMapSize), `${preset.label} shadow map size should stay GPU-friendly`);
    assert(preset.minimapRowsPerFrame >= 1, `${preset.label} minimap should process at least one row`);
  }

  assertEqual(QUALITY_PRESETS.potato.distanceScale, 0.5, "Potato should remain the 0.5x baseline");
  assertEqual(QUALITY_PRESETS.normal.distanceScale, 2, "Normal should remain 2x distance");
  assertEqual(QUALITY_PRESETS.high.distanceScale, 4, "High should remain 4x distance");
  assertEqual(QUALITY_PRESETS.ultra.distanceScale, 6, "Ultra should remain 6x distance");
  assertEqual(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].distanceScale, 12, "Super Ultra should remain the 12x stress preset");
});

test("directional shadow anchor snaps to stable light-space texels", () => {
  const sunOffset = new THREE.Vector3(18, 132, 10);
  const basis = createDirectionalShadowBasis(sunOffset);
  const texelSize = getShadowTexelSize(QUALITY_PRESETS.normal);
  const anchor = new THREE.Vector3(12.345, 0, -7.89);
  const snappedAnchor = snapShadowAnchorToTexelGrid(anchor, basis, texelSize);
  const subTexelAnchor = anchor.clone().addScaledVector(basis.right, texelSize * 0.2);
  const snappedSubTexelAnchor = snapShadowAnchorToTexelGrid(subTexelAnchor, basis, texelSize);

  assertNearlyInteger(snappedAnchor.dot(basis.right) / texelSize, "right shadow coordinate");
  assertNearlyInteger(snappedAnchor.dot(basis.up) / texelSize, "up shadow coordinate");
  assertVectorNearlyEqual(
    snappedSubTexelAnchor,
    snappedAnchor,
    "sub-texel motion should not move the stabilized shadow anchor"
  );
});

let passed = 0;
for (const { name, run } of tests) {
  await run();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

console.log(`\n${passed}/${tests.length} engine robustness tests passed`);

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function assertNearlyInteger(value: number, message: string): void {
  const nearest = Math.round(value);
  assert(
    Math.abs(value - nearest) < 0.000001,
    `${message} should land on an integer texel coordinate`
  );
}

function assertVectorNearlyEqual(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  message: string
): void {
  const distance = actual.distanceTo(expected);
  assert(distance < 0.000001, `${message}. Distance was ${distance}.`);
}
