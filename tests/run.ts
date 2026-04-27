import * as THREE from "three";
import {
  BLOCK_FRAGMENT_COUNT,
  BLOCK_FRAGMENT_GRID_SIZE,
  BLOCK_FRAGMENT_SPACING,
  getBlockFragmentOffset,
  getDistributedBlockFragmentIndex,
  normalizeBlockFragmentCount
} from "../src/blockFragments";
import { BLOCK } from "../src/blocks";
import { Chunk } from "../src/chunk";
import type { ChunkGeneratedResult } from "../src/chunkProtocol";
import { BLOCK_DAMAGE_IMPACT_SPEED, PhysicsToy } from "../src/physics";
import {
  CROUCH_OR_DESCEND_KEY,
  CROUCH_SPEED,
  CROUCH_VIEW_DROP,
  CROUCH_VIEW_RESPONSE,
  FLIGHT_ACCELERATION,
  FLIGHT_BOOST_ACCELERATION,
  FLIGHT_BOOST_SPEED,
  FLIGHT_DRAG,
  FLIGHT_TOGGLE_KEY,
  PREVIOUS_SPRINT_SPEED,
  SLIDE_END_SPEED,
  SLIDE_FORWARD_FRICTION,
  SLIDE_MIN_DURATION,
  SLIDE_PRIME_SPEED,
  SLIDE_RELEASE_FRICTION,
  SPRINT_SPEED,
  SPRINT_SPEED_MULTIPLIER,
  WALK_SPEED,
  getAirMovementSpeed,
  getCrouchViewTargetOffset,
  getFlightMovementAcceleration,
  getFlightMovementSpeed,
  getGroundMovementSpeed,
  getSlideFriction,
  getSlideSpeedLimit,
  isSlideMinimumLocked,
  smoothCrouchViewOffset,
  shouldContinueSlide,
  shouldPreserveSlideJumpMomentum,
  shouldStartLandingSlide,
  shouldStartSlide
} from "../src/playerMovement";
import { isCatchablePointerLockRequest } from "../src/player";
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
import {
  BASE_CAMERA_FOV,
  SPRINT_FOV_MULTIPLIER,
  SPRINT_FOV_RESPONSE,
  getSprintFeedbackTargetFov,
  smoothSprintFeedbackFov
} from "../src/sprintFeedback";
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

test("player movement tuning supports sprint, flight, crouch, and slide states", () => {
  assertEqual(FLIGHT_TOGGLE_KEY, "KeyF", "flight should toggle with the F key");
  assertEqual(CROUCH_OR_DESCEND_KEY, "KeyC", "crouch and flight descent should use the C key");
  assertEqual(
    SPRINT_SPEED_MULTIPLIER,
    1.5 * 1.5,
    "sprint tuning should stack the earlier 50 percent bump with another 50 percent bump"
  );
  assertEqual(
    SPRINT_SPEED,
    PREVIOUS_SPRINT_SPEED * SPRINT_SPEED_MULTIPLIER,
    "sprint speed should follow the documented sprint multiplier"
  );
  assertEqual(FLIGHT_BOOST_SPEED, SPRINT_SPEED * 2, "flight boost should be twice the ground sprint speed");
  assert(CROUCH_VIEW_RESPONSE > 0, "crouch view smoothing should move toward its target");
  assertEqual(getCrouchViewTargetOffset(false), 0, "standing view should have no crouch offset");
  assertEqual(getCrouchViewTargetOffset(true), CROUCH_VIEW_DROP, "crouched view should target the full crouch drop");
  const firstCrouchStep = smoothCrouchViewOffset(0, CROUCH_VIEW_DROP, 1 / 60);
  assert(
    firstCrouchStep > 0 && firstCrouchStep < CROUCH_VIEW_DROP,
    "crouch view should ease down instead of snapping to the target"
  );
  const firstStandStep = smoothCrouchViewOffset(CROUCH_VIEW_DROP, 0, 1 / 60);
  assert(
    firstStandStep > 0 && firstStandStep < CROUCH_VIEW_DROP,
    "crouch view should ease back up instead of snapping to standing"
  );
  assertEqual(
    smoothCrouchViewOffset(CROUCH_VIEW_DROP - 0.0001, CROUCH_VIEW_DROP, 1 / 60),
    CROUCH_VIEW_DROP,
    "tiny crouch-view gaps should settle exactly on the target"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: false, crouching: false, sliding: false }),
    WALK_SPEED,
    "plain movement should use walk speed"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: true, crouching: false, sliding: false }),
    SPRINT_SPEED,
    "sprinting should use boosted sprint speed"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: true, crouching: true, sliding: false }),
    CROUCH_SPEED,
    "crouch should slow grounded movement even if sprint is held"
  );
  assertEqual(
    getGroundMovementSpeed({ sprinting: false, crouching: true, sliding: true }),
    SPRINT_SPEED,
    "active slides should keep the fast horizontal cap while friction bleeds speed"
  );
  assertEqual(
    getAirMovementSpeed(),
    WALK_SPEED,
    "ordinary airborne control should ignore sprint boost; only flight mode uses boosted Shift movement"
  );
  assertEqual(getFlightMovementSpeed(false), WALK_SPEED, "plain flight should use walk speed");
  assertEqual(getFlightMovementSpeed(true), FLIGHT_BOOST_SPEED, "boosted flight should use the larger flight cap");
  assertEqual(
    getFlightMovementAcceleration(false),
    FLIGHT_ACCELERATION,
    "plain flight should use floaty baseline acceleration"
  );
  assertEqual(
    getFlightMovementAcceleration(true),
    FLIGHT_BOOST_ACCELERATION,
    "boosted flight should use enough acceleration to overcome flight drag"
  );
  assert(
    FLIGHT_BOOST_SPEED > SPRINT_SPEED,
    "boosted flight cap should be faster than ground sprint"
  );
  assert(
    FLIGHT_BOOST_ACCELERATION / FLIGHT_DRAG > FLIGHT_BOOST_SPEED,
    "boosted flight acceleration should be high enough to actually reach its cap through drag"
  );

  assert(
    shouldStartSlide(true, true, true, true, SLIDE_PRIME_SPEED),
    "grounded sprint-crouch movement should prime a slide once speed is high enough"
  );
  assert(
    !shouldStartSlide(true, true, true, true, SLIDE_PRIME_SPEED - 0.01),
    "slow movement should not prime a slide"
  );
  assert(
    !shouldStartSlide(true, false, true, true, SLIDE_PRIME_SPEED),
    "holding crouch before sprinting should not retroactively start a slide"
  );
  assert(
    shouldStartLandingSlide(true, true, SLIDE_PRIME_SPEED),
    "landing while crouched with enough speed should enter the slide lock"
  );
  assert(
    !shouldStartLandingSlide(true, true, SLIDE_PRIME_SPEED - 0.01),
    "slow crouched landings should stay crouched without forcing a slide"
  );
  assert(
    !shouldStartLandingSlide(true, false, SLIDE_PRIME_SPEED),
    "landing upright should not enter a slide"
  );
  assert(
    shouldContinueSlide(true, SLIDE_MIN_DURATION - 0.01, SLIDE_END_SPEED * 0.5),
    "slides should remain locked for the minimum duration even after bleeding below crouch speed"
  );
  assert(
    shouldContinueSlide(true, SLIDE_MIN_DURATION + 0.01, SLIDE_END_SPEED + 0.01),
    "slides should continue after the minimum duration until speed reaches crouch pace"
  );
  assert(
    !shouldContinueSlide(true, SLIDE_MIN_DURATION + 0.01, SLIDE_END_SPEED),
    "slides should end after the lock once they reach crouch speed"
  );
  assert(
    !shouldContinueSlide(false, SLIDE_MIN_DURATION - 0.01, SLIDE_END_SPEED + 1),
    "leaving the ground should hand slide state to airborne momentum preservation"
  );
  assertEqual(getSlideFriction(true), SLIDE_FORWARD_FRICTION, "holding forward should keep the longer slide glide");
  assertEqual(getSlideFriction(false), SLIDE_RELEASE_FRICTION, "releasing forward should bleed slide speed faster");
  assertEqual(
    getSlideSpeedLimit(SPRINT_SPEED * 1.25),
    SPRINT_SPEED * 1.25,
    "slides should preserve above-sprint entry speed instead of clamping momentum away"
  );
  assertEqual(
    getSlideSpeedLimit(SPRINT_SPEED * 0.75),
    SPRINT_SPEED,
    "ordinary slides should still use the sprint cap as their baseline speed limit"
  );
  assert(isSlideMinimumLocked(0.5), "slides should be locked during their first second");
  assert(
    !isSlideMinimumLocked(SLIDE_MIN_DURATION),
    "slide minimum lock should release exactly at the configured duration"
  );
  assert(
    shouldPreserveSlideJumpMomentum(true, true),
    "jumping from an active slide should preserve horizontal momentum until landing"
  );
  assert(
    !shouldPreserveSlideJumpMomentum(false, true),
    "normal jumps should not enter slide momentum preservation"
  );
});

test("sprint feedback widens FOV smoothly without touching base camera setup", () => {
  const sprintFov = BASE_CAMERA_FOV * SPRINT_FOV_MULTIPLIER;

  assertEqual(getSprintFeedbackTargetFov(false), BASE_CAMERA_FOV, "inactive sprint feedback should use base FOV");
  assertEqual(getSprintFeedbackTargetFov(true), sprintFov, "active sprint feedback should widen FOV by 15 percent");
  assert(SPRINT_FOV_RESPONSE > 0, "sprint feedback FOV smoothing should move toward its target");

  const firstSprintStep = smoothSprintFeedbackFov(BASE_CAMERA_FOV, sprintFov, 1 / 60);
  assert(
    firstSprintStep > BASE_CAMERA_FOV && firstSprintStep < sprintFov,
    "sprint feedback should ease outward instead of snapping"
  );

  const firstReleaseStep = smoothSprintFeedbackFov(sprintFov, BASE_CAMERA_FOV, 1 / 60);
  assert(
    firstReleaseStep > BASE_CAMERA_FOV && firstReleaseStep < sprintFov,
    "sprint feedback should ease back to base FOV"
  );
});

test("pointer lock request detection supports promise and void browser APIs", () => {
  assert(
    isCatchablePointerLockRequest(Promise.resolve()),
    "promise-returning pointer lock requests should attach rejection handling"
  );
  assert(
    isCatchablePointerLockRequest({ catch: () => undefined }),
    "promise-like pointer lock requests should attach rejection handling"
  );
  assert(
    !isCatchablePointerLockRequest(undefined),
    "void-returning pointer lock requests should rely on the pending-lock timeout"
  );
  assert(
    !isCatchablePointerLockRequest({ then: () => undefined }),
    "then-only values should not be treated as catchable pointer lock requests"
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

test("quality-scaled block fracture counts sample the full debris grid", () => {
  assertEqual(normalizeBlockFragmentCount(-1), 1, "fragment count should keep at least one shard");
  assertEqual(normalizeBlockFragmentCount(99), BLOCK_FRAGMENT_COUNT, "fragment count should clamp to the full grid");

  assertEqual(getDistributedBlockFragmentIndex(0, BLOCK_FRAGMENT_COUNT), 0, "full debris should keep first grid index");
  assertEqual(
    getDistributedBlockFragmentIndex(BLOCK_FRAGMENT_COUNT - 1, BLOCK_FRAGMENT_COUNT),
    BLOCK_FRAGMENT_COUNT - 1,
    "full debris should keep final grid index"
  );
  assertEqual(
    getDistributedBlockFragmentIndex(3, 7),
    Math.floor(BLOCK_FRAGMENT_COUNT / 2),
    "normal-quality debris should include the center shard"
  );

  const highQualityIndexes = new Set<number>();
  for (let index = 0; index < QUALITY_PRESETS.high.blockFragmentCount; index += 1) {
    highQualityIndexes.add(getDistributedBlockFragmentIndex(index, QUALITY_PRESETS.high.blockFragmentCount));
  }
  assertEqual(
    highQualityIndexes.size,
    QUALITY_PRESETS.high.blockFragmentCount,
    "high-quality debris should choose unique grid indexes"
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
    assert(
      preset.blockFragmentCount >= 1 && preset.blockFragmentCount <= BLOCK_FRAGMENT_COUNT,
      `${preset.label} debris count should stay within the fracture grid`
    );
    previousPhysicsBudget = preset.physicsObjectBudget;
  }

  assertEqual(QUALITY_PRESETS.potato.distanceScale, 0.5, "Potato should remain the 0.5x baseline");
  assertEqual(QUALITY_PRESETS.normal.distanceScale, 2, "Normal should remain 2x distance");
  assertEqual(QUALITY_PRESETS.high.distanceScale, 4, "High should remain 4x distance");
  assertEqual(QUALITY_PRESETS.ultra.distanceScale, 6, "Ultra should remain 6x distance");
  assertEqual(QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].distanceScale, 12, "Super Ultra should remain the 12x stress preset");
  assertEqual(QUALITY_PRESETS.potato.physicsObjectBudget, 64, "Potato should allow 64 physics bodies by default");
  assertEqual(QUALITY_PRESETS.low.physicsObjectBudget, 128, "Low should allow 128 physics bodies by default");
  assertEqual(QUALITY_PRESETS.normal.physicsObjectBudget, 192, "Normal should allow 192 physics bodies by default");
  assertEqual(QUALITY_PRESETS.high.physicsObjectBudget, 512, "High should allow 512 physics bodies by default");
  assertEqual(QUALITY_PRESETS.ultra.physicsObjectBudget, 1024, "Ultra should allow 1024 physics bodies by default");
  assertEqual(QUALITY_PRESETS.potato.blockFragmentCount, 2, "Potato should spawn only two shards per destroyed block");
  assertEqual(QUALITY_PRESETS.low.blockFragmentCount, 4, "Low should spawn four shards per destroyed block");
  assertEqual(QUALITY_PRESETS.normal.blockFragmentCount, 7, "Normal should spawn seven shards per destroyed block");
  assertEqual(QUALITY_PRESETS.high.blockFragmentCount, 14, "High should spawn about half of the full shard count");
  assertEqual(QUALITY_PRESETS.ultra.blockFragmentCount, 27, "Ultra should keep the full fracture grid");
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].blockFragmentCount,
    27,
    "Super Ultra should keep the full fracture grid"
  );
  assertEqual(
    QUALITY_PRESETS[SUPER_ULTRA_PRESET_ID].physicsObjectBudget,
    2048,
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
