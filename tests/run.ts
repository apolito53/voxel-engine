import * as THREE from "three";
import {
  BLOCK_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_GRID_SIZE,
  BLOCK_FRAGMENT_SPACING,
  getBlockFragmentOffset
} from "../src/blockFragments";
import { BLOCK } from "../src/blocks";
import { Chunk } from "../src/chunk";
import type { ChunkGeneratedResult } from "../src/chunkProtocol";
import { BLOCK_DAMAGE_IMPACT_SPEED, PhysicsToy } from "../src/physics";
import {
  DEFAULT_PHYSICS_OBJECT_BUDGET,
  MAX_PHYSICS_OBJECT_BUDGET,
  MIN_PHYSICS_OBJECT_BUDGET,
  normalizePhysicsObjectBudget,
  PHYSICS_OBJECT_BUDGET_STEP,
  stepPhysicsObjectBudget
} from "../src/physicsBudget";
import { shouldShowSuperUltraOptIn } from "../src/qualityController";
import { QUALITY_PRESET_ORDER, QUALITY_PRESETS, SUPER_ULTRA_PRESET_ID } from "../src/qualityPresets";
import { voxelRaycast } from "../src/raycast";
import {
  createDirectionalShadowBasis,
  getShadowTexelSize,
  snapShadowAnchorToTexelGrid
} from "../src/shadows";
import type { ChunkStorage } from "../src/chunkStorage";
import { TargetBlockHighlighter } from "../src/targetHighlighter";
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

test("raycast handles grid boundaries and exact edge crossings", () => {
  const boundaryWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "3,0,0";
    }
  };

  assertDeepEqual(
    voxelRaycast(boundaryWorld, { x: 2, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 8),
    { block: { x: 3, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 }, distance: 1 },
    "starting exactly on a grid line should not hit the next block at zero distance"
  );

  const diagonalDirection = new THREE.Vector3(1, 0, 1).normalize();
  const sideOnlyWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "0,0,1";
    }
  };
  const diagonalWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "1,0,1";
    }
  };

  assertEqual(
    voxelRaycast(sideOnlyWorld, { x: 0.5, y: 0.5, z: 0.5 }, diagonalDirection, 2),
    null,
    "edge-crossing rays should not hit side-neighbors they only graze"
  );
  assertDeepEqual(
    voxelRaycast(diagonalWorld, { x: 0.5, y: 0.5, z: 0.5 }, diagonalDirection, 2),
    { block: { x: 1, y: 0, z: 1 }, normal: { x: -1, y: 0, z: 0 }, distance: Math.SQRT1_2 },
    "edge-crossing rays should advance into the diagonal voxel"
  );
});

test("target block highlighter follows targeted block positions", () => {
  const highlighter = new TargetBlockHighlighter();

  assert(!highlighter.object.visible, "target highlighter should start hidden");
  highlighter.showBlock({ x: 4, y: 12, z: -3 });
  assert(highlighter.object.visible, "target highlighter should become visible when a block is targeted");
  assertVectorNearlyEqual(
    highlighter.object.position,
    new THREE.Vector3(4.5, 12.5, -2.5),
    "target highlighter should sit on the target block center"
  );

  highlighter.hide();
  assert(!highlighter.object.visible, "target highlighter should hide when no block is targeted");
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

test("world applies completed generated chunks within the frame budget", () => {
  const world = new VoxelWorld({ seed: "worker-result-budget-test" });
  const chunkByteLength = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

  for (let cx = 0; cx < 5; cx += 1) {
    const requestId = cx + 1;
    const key = world.key(cx, 0);
    world.pendingChunkKeys.add(key);
    world.pendingChunkLoads.set(requestId, { key, cx, cz: 0 });
    world.workerResults.push({
      type: "generated",
      requestId,
      cx,
      cz: 0,
      blocks: new Uint8Array(chunkByteLength)
    } satisfies ChunkGeneratedResult);
  }

  world.setPriority(4, 0);
  world.processGeneratedChunkResults(2);

  assertEqual(world.getStats().loadedChunks, 2, "only the budgeted generated chunks should be applied");
  assert(Boolean(world.getChunk(4, 0)), "the closest completed result should be applied first");
  assert(Boolean(world.getChunk(3, 0)), "the next closest completed result should use the remaining budget");
  assertEqual(world.workerResults.length, 3, "extra generated chunks should remain queued for later frames");
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

test("world coalesces repeated chunk saves before flushing storage", async () => {
  const savedSnapshots: Uint8Array[] = [];
  const storage: ChunkStorage = {
    worldId: "coalesce-test",
    async listChunkKeys(): Promise<string[]> {
      return [];
    },
    async loadChunk(): Promise<Uint8Array | null> {
      return null;
    },
    async saveChunk(_key: string, blocks: Uint8Array): Promise<void> {
      savedSnapshots.push(blocks.slice());
    },
    async deleteChunk(): Promise<void> {}
  };
  const world = new VoxelWorld({ seed: "save-coalesce-test", storage });
  world.ensureChunksAround(0, 0, 0);

  world.setBlock(1, WORLD_HEIGHT - 2, 3, BLOCK.ember);
  world.setBlock(1, WORLD_HEIGHT - 2, 4, BLOCK.sand);

  assertEqual(world.getStats().pendingChunkSaves, 1, "multiple edits in one chunk should queue one latest save");
  assertEqual(savedSnapshots.length, 0, "debounced chunk saves should not write every intermediate edit");

  await world.flushStorageWrites();

  assertEqual(savedSnapshots.length, 1, "flushing should persist the coalesced chunk snapshot once");
  const snapshot = savedSnapshots[0];
  assert(snapshot instanceof Uint8Array, "flush should provide a concrete saved chunk snapshot");
  assertEqual(
    snapshot[1 + CHUNK_SIZE * (4 + CHUNK_SIZE * (WORLD_HEIGHT - 2))],
    BLOCK.sand,
    "coalesced save should contain the latest edit"
  );
});

test("block damage tracks health before removing voxels", () => {
  const world = new VoxelWorld({ seed: "damage-test" });
  world.setBlock(2, 3, 4, BLOCK.stone);

  const firstHit = world.damageBlock(2, 3, 4, 1);
  assertDeepEqual(
    firstHit,
    { block: BLOCK.stone, position: { x: 2, y: 3, z: 4 }, remainingHealth: 1, destroyed: false },
    "first meaningful hit should damage but not remove a two-health block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.stone, "damaged block should remain in the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 1, "world should remember sparse block damage");
  assertEqual(world.getStats().damagedBlocks, 1, "debug stats should count damaged blocks");

  const secondHit = world.damageBlock(2, 3, 4, 1);
  assertDeepEqual(
    secondHit,
    { block: BLOCK.stone, position: { x: 2, y: 3, z: 4 }, remainingHealth: 0, destroyed: true },
    "second meaningful hit should destroy a two-health block"
  );
  assertEqual(world.getBlock(2, 3, 4), BLOCK.air, "destroyed block should leave the voxel grid");
  assertEqual(world.getBlockDamage(2, 3, 4), 0, "destroyed blocks should clear transient damage state");
});

test("block fracture pattern produces a centered 3x3x3 debris grid", () => {
  assertEqual(BLOCK_FRAGMENT_GRID_SIZE, 3, "block fracture grid should be three pieces per axis");
  assertEqual(BLOCK_FRAGMENT_COUNT, 27, "block fracture grid should create 27 loose pieces");

  const uniqueOffsets = new Set<string>();
  const uniqueX = new Set<number>();
  const uniqueY = new Set<number>();
  const uniqueZ = new Set<number>();

  for (let index = 0; index < BLOCK_FRAGMENT_COUNT; index += 1) {
    const offset = getBlockFragmentOffset(index);
    uniqueOffsets.add(`${offset.x},${offset.y},${offset.z}`);
    uniqueX.add(offset.x);
    uniqueY.add(offset.y);
    uniqueZ.add(offset.z);
  }

  assertEqual(uniqueOffsets.size, BLOCK_FRAGMENT_COUNT, "each debris piece should get a unique local offset");
  assertEqual(uniqueX.size, BLOCK_FRAGMENT_GRID_SIZE, "x axis should span the full fracture grid");
  assertEqual(uniqueY.size, BLOCK_FRAGMENT_GRID_SIZE, "y axis should span the full fracture grid");
  assertEqual(uniqueZ.size, BLOCK_FRAGMENT_GRID_SIZE, "z axis should span the full fracture grid");
  assertDeepEqual(
    getBlockFragmentOffset(Math.floor(BLOCK_FRAGMENT_COUNT / 2)),
    { x: 0, y: 0, z: 0 },
    "odd fracture grids should include a centered shard"
  );
  assertDeepEqual(
    getBlockFragmentOffset(0),
    {
      x: -BLOCK_FRAGMENT_SPACING,
      y: -BLOCK_FRAGMENT_SPACING,
      z: -BLOCK_FRAGMENT_SPACING
    },
    "first shard should sit at the low corner of the centered grid"
  );
});

test("physics impacts report speed so block damage can be thresholded", () => {
  const collisionWorld = {
    isSolid(x: number, y: number, z: number): boolean {
      return `${x},${y},${z}` === "2,2,2";
    }
  };
  const slowToy = new PhysicsToy(
    new THREE.Vector3(1.7, 2.5, 2.5),
    new THREE.Vector3(BLOCK_DAMAGE_IMPACT_SPEED, 0, 0)
  );
  const fastToy = new PhysicsToy(
    new THREE.Vector3(1.7, 2.5, 2.5),
    new THREE.Vector3(BLOCK_DAMAGE_IMPACT_SPEED + 0.5, 0, 0)
  );

  const slowImpacts = slowToy.update(0, collisionWorld);
  const fastImpacts = fastToy.update(0, collisionWorld);

  assertEqual(slowImpacts.length, 1, "slow contact should still report the collision for tuning");
  assertEqual(fastImpacts.length, 1, "fast contact should report the collision for damage handling");
  assert(
    slowImpacts[0].speed <= BLOCK_DAMAGE_IMPACT_SPEED,
    "exactly-threshold impacts should remain below the current damage gate"
  );
  assert(
    fastImpacts[0].speed > BLOCK_DAMAGE_IMPACT_SPEED,
    "faster impacts should clear the current block damage gate"
  );
});

test("physics object budget clamps and steps predictably", () => {
  assertEqual(
    normalizePhysicsObjectBudget(null, QUALITY_PRESETS.high.physicsObjectBudget),
    QUALITY_PRESETS.high.physicsObjectBudget,
    "missing stored budget should use the active quality fallback"
  );
  assertEqual(
    normalizePhysicsObjectBudget(null),
    DEFAULT_PHYSICS_OBJECT_BUDGET,
    "missing fallback should use the default budget"
  );
  assertEqual(
    normalizePhysicsObjectBudget(MIN_PHYSICS_OBJECT_BUDGET - PHYSICS_OBJECT_BUDGET_STEP),
    MIN_PHYSICS_OBJECT_BUDGET,
    "budget should clamp to the lower safety bound"
  );
  assertEqual(
    normalizePhysicsObjectBudget(MAX_PHYSICS_OBJECT_BUDGET + PHYSICS_OBJECT_BUDGET_STEP),
    MAX_PHYSICS_OBJECT_BUDGET,
    "budget should clamp to the upper safety bound"
  );
  assertEqual(
    stepPhysicsObjectBudget(96, "increase"),
    96 + PHYSICS_OBJECT_BUDGET_STEP,
    "increase should move by one configured step"
  );
  assertEqual(
    stepPhysicsObjectBudget(96, "decrease"),
    96 - PHYSICS_OBJECT_BUDGET_STEP,
    "decrease should move by one configured step"
  );
});

test("quality presets keep scheduler and render-distance invariants", () => {
  const presetIds = [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID];
  let previousPhysicsBudget = 0;

  for (const presetId of presetIds) {
    const preset = QUALITY_PRESETS[presetId];
    assert(preset.unloadRadius > preset.loadRadius, `${preset.label} unload radius should exceed load radius`);
    assert(preset.chunkLoads >= 1, `${preset.label} should request at least one chunk load`);
    assert(preset.chunkRebuilds >= 1, `${preset.label} should request at least one chunk rebuild`);
    assert(preset.cameraFar > preset.fogNear, `${preset.label} camera far should exceed fog near`);
    assert(preset.fogFar > preset.fogNear, `${preset.label} fog far should exceed fog near`);
    assert(isPowerOfTwo(preset.shadowMapSize), `${preset.label} shadow map size should stay GPU-friendly`);
    assert(preset.minimapRowsPerFrame >= 1, `${preset.label} minimap should process at least one row`);
    assert(
      preset.physicsObjectBudget >= MIN_PHYSICS_OBJECT_BUDGET,
      `${preset.label} physics budget should respect the lower safety bound`
    );
    assert(
      preset.physicsObjectBudget <= MAX_PHYSICS_OBJECT_BUDGET,
      `${preset.label} physics budget should respect the upper safety bound`
    );
    assertEqual(
      preset.physicsObjectBudget % PHYSICS_OBJECT_BUDGET_STEP,
      0,
      `${preset.label} physics budget should stay step-aligned`
    );
    assert(
      preset.physicsObjectBudget >= previousPhysicsBudget,
      `${preset.label} physics budget should not shrink as quality increases`
    );
    previousPhysicsBudget = preset.physicsObjectBudget;
  }

  assertEqual(QUALITY_PRESETS.potato.distanceScale, 0.5, "Potato should remain the 0.5x baseline");
  assertEqual(QUALITY_PRESETS.normal.distanceScale, 2, "Normal should remain 2x distance");
  assertEqual(QUALITY_PRESETS.high.distanceScale, 4, "High should remain 4x distance");
  assertEqual(QUALITY_PRESETS.ultra.distanceScale, 6, "Ultra should remain 6x distance");
  assertEqual(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].distanceScale, 12, "Super Ultra should remain the 12x stress preset");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].physicsObjectBudget,
    1024,
    "Super Ultra should carry the largest physics-object stress budget"
  );
  assertEqual(
    QUALITY_PRESET_ORDER.filter(shouldShowSuperUltraOptIn).join(","),
    "ultra",
    "Super Ultra opt-in should only appear once normal cycling reaches Ultra"
  );
  assert(
    shouldShowSuperUltraOptIn(SUPER_ULTRA_PRESET_ID),
    "Super Ultra opt-in should remain visible while active so players can disable it"
  );
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
