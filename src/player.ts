import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import { clamp } from "./math";
import {
  AIR_ACCELERATION,
  AIR_DRAG,
  AIR_SPEED_LIMIT,
  CROUCH_OR_DESCEND_KEY,
  CROUCH_VIEW_DROP,
  FLIGHT_DRAG,
  FLIGHT_TOGGLE_KEY,
  GROUND_ACCELERATION,
  GROUND_FRICTION,
  GRAVITY,
  JUMP_SPEED,
  LOOK_SENSITIVITY,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  getAirMovementSpeed,
  getCrouchViewTargetOffset,
  getFlightMovementAcceleration,
  getFlightMovementSpeed,
  getGroundMovementSpeed,
  getJumpSpeed,
  getSlideEntrySpeed,
  getSlideFriction,
  getSlideSpeedLimit,
  smoothCrouchViewOffset,
  shouldContinueSlide,
  shouldPreserveSlideJumpMomentum,
  shouldStartLandingSlide,
  shouldStartSlide
} from "./playerMovement";

type MovementAxis = "x" | "y" | "z";
export type PlayerMovementMode = "walk" | "crouch" | "slide" | "flight";
const PARTIAL_SURFACE_STEP_HEIGHT = 0.55;
const PARTIAL_SURFACE_SNAP_EPSILON = 0.025;

export type PlayerBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export type PlayerFeetPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type CatchablePointerLockRequest = {
  catch(onRejected: () => void): unknown;
};

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly domElement: HTMLElement;
  readonly world: CollisionWorld;
  readonly velocity: THREE.Vector3;
  readonly keys: Set<string>;
  pitch: number;
  yaw: number;
  onGround: boolean;
  active: boolean;
  locked: boolean;
  flying: boolean;
  crouching: boolean;
  sliding: boolean;
  pendingLock: boolean;
  lockTimeout: number | null;
  onPauseChange: (paused: boolean) => void;
  private slideElapsed = 0;
  private slideSpeedLimit = 0;
  private slideMomentumAirborne = false;
  private crouchViewOffset = 0;
  private readonly eventAbortController = new AbortController();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, world: CollisionWorld) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.velocity = new THREE.Vector3();
    this.keys = new Set();
    this.pitch = 0;
    this.yaw = 0;
    this.onGround = false;
    this.active = false;
    this.locked = false;
    this.flying = false;
    this.crouching = false;
    this.sliding = false;
    this.pendingLock = false;
    this.lockTimeout = null;
    this.onPauseChange = () => {};

    const listenerOptions = { signal: this.eventAbortController.signal };

    domElement.tabIndex = 0;
    domElement.addEventListener("click", () => {
      if (this.active && !this.locked && !this.pendingLock) {
        this.requestLock();
      }
    }, listenerOptions);
    document.addEventListener("pointerlockchange", () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === domElement;
      this.pendingLock = false;
      this.clearLockTimeout();
      if (this.locked) {
        this.updateCursor();
        return;
      }

      if (wasLocked && this.active) {
        this.pause(false);
        return;
      }

      this.updateCursor();
    }, listenerOptions);
    document.addEventListener("pointerlockerror", () => {
      this.pendingLock = false;
      this.clearLockTimeout();
      this.updateCursor();
    }, listenerOptions);
    document.addEventListener("mousemove", (event) => this.handleMouse(event), listenerOptions);
    document.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        this.releaseLook();
        return;
      }
      if (!this.active) return;
      if (shouldPreventGameKeyDefault(event.code)) {
        event.preventDefault();
      }
      if (event.code === FLIGHT_TOGGLE_KEY && !event.repeat) {
        event.preventDefault();
        this.toggleFlight();
        return;
      }
      this.keys.add(event.code);
    }, listenerOptions);
    document.addEventListener("keyup", (event) => this.keys.delete(event.code), listenerOptions);
  }

  resume(): void {
    if (this.active) {
      if (!this.locked && !this.pendingLock) this.requestLock();
      return;
    }

    this.active = true;
    this.onPauseChange(false);
    this.updateCursor();
    this.requestLock();
  }

  requestLock(): void {
    if (!this.active || this.locked || this.pendingLock) return;

    if (!this.domElement.requestPointerLock) {
      return;
    }

    this.domElement.focus();
    this.pendingLock = true;
    this.updateCursor();

    // Chromium returns a promise here, while Firefox can still return void.
    // Keep both paths alive so pointer lock failures do not spam console errors.
    const lockRequest = this.domElement.requestPointerLock() as unknown;
    if (isCatchablePointerLockRequest(lockRequest)) {
      void lockRequest.catch(() => {
        this.pendingLock = false;
        this.clearLockTimeout();
        this.updateCursor();
      });
    }

    this.clearLockTimeout();
    this.lockTimeout = window.setTimeout(() => {
      if (this.pendingLock && !this.locked) {
        this.pendingLock = false;
        this.updateCursor();
      }
    }, 1200);
  }

  clearLockTimeout(): void {
    if (this.lockTimeout === null) return;

    window.clearTimeout(this.lockTimeout);
    this.lockTimeout = null;
  }

  handleMouse(event: MouseEvent): void {
    if (this.active) {
      this.applyMouseDelta(event.movementX, event.movementY);
    }
  }

  applyMouseDelta(x: number, y: number): void {
    this.yaw -= x * LOOK_SENSITIVITY;
    this.pitch -= y * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  isLooking(): boolean {
    return this.active;
  }

  isSprintFeedbackActive(): boolean {
    if (!this.active || !this.isSprintHeld()) return false;
    if (this.flying) return this.hasFlightMovementInput();
    return this.isGroundSprintActive(this.onGround) && this.hasHorizontalMovementInput();
  }

  get movementMode(): PlayerMovementMode {
    if (this.flying) return "flight";
    if (this.sliding || this.slideMomentumAirborne) return "slide";
    if (this.crouching) return "crouch";
    return "walk";
  }

  releaseLook(): void {
    this.pause(true);
  }

  suspendForTextInput(): void {
    // Chat/input overlays need the cursor and keyboard without raising the pause
    // menu. Flip the gameplay controller inactive before releasing pointer lock
    // so the browser's pointerlockchange event does not treat this as Esc pause.
    this.active = false;
    this.pendingLock = false;
    this.clearLockTimeout();
    this.keys.clear();
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
    this.updateCursor();
  }

  pause(exitPointerLock = true): void {
    this.active = false;
    this.pendingLock = false;
    this.clearLockTimeout();
    this.keys.clear();
    this.onPauseChange(true);
    if (exitPointerLock && document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
    this.updateCursor();
  }

  dispose(): void {
    // Vite dev reloads and browser navigations can otherwise strand document
    // listeners that still point at an old camera/world pair. AbortController
    // gives the owner one switch to remove every listener registered above.
    this.pause(false);
    this.eventAbortController.abort();
    this.clearLockTimeout();
  }

  teleportToFeetPosition(position: PlayerFeetPosition, yaw = this.yaw, pitch = this.pitch): void {
    // Save/load uses feet position rather than raw camera height so a player who
    // exits while crouched does not reload with their standing collision hull sunk
    // into the terrain. Teleporting is also a clean movement-state reset.
    this.velocity.set(0, 0, 0);
    this.keys.clear();
    this.onGround = false;
    this.flying = false;
    this.crouching = false;
    this.slideMomentumAirborne = false;
    this.endSlide();
    this.crouchViewOffset = 0;
    this.yaw = Number.isFinite(yaw) ? yaw : 0;
    this.pitch = clamp(
      Number.isFinite(pitch) ? pitch : 0,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );
    this.camera.position.set(position.x, position.y + this.getVisualEyeHeight(), position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  updateCursor(): void {
    document.body.classList.toggle("playing", this.active);
  }

  update(delta: number): void {
    if (!this.active) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.flying) {
      this.updateFlight(delta, forward, right);
      this.updateCrouchViewOffset(delta);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      return;
    }

    const wasGrounded = this.onGround;
    const wish = new THREE.Vector3();

    if (this.keys.has("KeyW")) wish.add(forward);
    if (this.keys.has("KeyS")) wish.sub(forward);
    if (this.keys.has("KeyD")) wish.add(right);
    if (this.keys.has("KeyA")) wish.sub(right);
    const hasWish = wish.lengthSq() > 0;
    if (hasWish) wish.normalize();

    if (wasGrounded) this.slideMomentumAirborne = false;

    const wantsCrouch = this.isCrouchOrDescendHeld();
    const justStartedCrouching = wantsCrouch && !this.crouching;
    const holdingForward = this.keys.has("KeyW");

    // Slide owns crouch while it is active. That lets the player release C
    // during the committed slide without popping back to standing early.
    this.syncCrouchState(wantsCrouch || this.sliding);
    this.updateSlideState(delta, wasGrounded, justStartedCrouching, holdingForward);
    this.syncCrouchState(wantsCrouch || this.sliding);

    const groundSpeed = getGroundMovementSpeed({
      sprinting: this.isGroundSprintActive(wasGrounded),
      crouching: this.crouching,
      sliding: this.sliding
    });
    const movementSpeed = wasGrounded ? groundSpeed : getAirMovementSpeed();

    if (wasGrounded) {
      this.applyHorizontalFriction(this.sliding ? getSlideFriction(holdingForward) : GROUND_FRICTION, delta);
    } else if (!this.slideMomentumAirborne) {
      this.applyHorizontalFriction(AIR_DRAG, delta);
    }

    if (hasWish && !this.sliding && !this.slideMomentumAirborne) {
      this.applyHorizontalAcceleration(
        wish,
        movementSpeed,
        wasGrounded ? GROUND_ACCELERATION : AIR_ACCELERATION,
        delta
      );
    }

    const groundSpeedLimit = this.sliding ? Math.max(groundSpeed, this.slideSpeedLimit) : groundSpeed;
    const horizontalSpeedLimit = this.slideMomentumAirborne
      ? Math.max(AIR_SPEED_LIMIT, Math.hypot(this.velocity.x, this.velocity.z))
      : AIR_SPEED_LIMIT;
    this.limitHorizontalSpeed(wasGrounded ? groundSpeedLimit : horizontalSpeedLimit);
    this.velocity.y -= GRAVITY * delta;

    this.onGround = false;
    if (wasGrounded && this.keys.has("Space")) {
      const jumpingFromSlide = this.sliding;
      this.velocity.y = getJumpSpeed(jumpingFromSlide);
      this.onGround = false;
      // A slide jump should carry the stored horizontal velocity instead of
      // immediately becoming a normal air-control jump.
      this.slideMomentumAirborne = shouldPreserveSlideJumpMomentum(jumpingFromSlide, true);
      if (jumpingFromSlide) this.endSlide();
    }

    this.moveAxis("x", this.velocity.x * delta);
    this.moveAxis("z", this.velocity.z * delta);
    this.moveAxis("y", this.velocity.y * delta);
    this.updateLandingSlideState(!wasGrounded && this.onGround);

    this.updateCrouchViewOffset(delta);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  updateFlight(delta: number, forward: THREE.Vector3, right: THREE.Vector3): void {
    const wish = new THREE.Vector3();

    if (this.keys.has("KeyW")) wish.add(forward);
    if (this.keys.has("KeyS")) wish.sub(forward);
    if (this.keys.has("KeyD")) wish.add(right);
    if (this.keys.has("KeyA")) wish.sub(right);
    if (this.keys.has("Space")) wish.y += 1;
    if (this.isCrouchOrDescendHeld()) wish.y -= 1;

    const hasWish = wish.lengthSq() > 0;
    if (hasWish) wish.normalize();

    this.applyDirectionalFriction(FLIGHT_DRAG, delta);
    if (hasWish) {
      this.applyDirectionalAcceleration(
        wish,
        getFlightMovementSpeed(this.isSprintHeld()),
        getFlightMovementAcceleration(this.isSprintHeld()),
        delta
      );
    }

    this.limitDirectionalSpeed(getFlightMovementSpeed(this.isSprintHeld()));
    this.onGround = false;
    this.moveAxis("x", this.velocity.x * delta);
    this.moveAxis("z", this.velocity.z * delta);
    this.moveAxis("y", this.velocity.y * delta);
  }

  applyHorizontalAcceleration(
    wish: THREE.Vector3,
    targetSpeed: number,
    acceleration: number,
    delta: number
  ): void {
    const currentSpeed = this.velocity.x * wish.x + this.velocity.z * wish.z;
    const addSpeed = targetSpeed - currentSpeed;
    if (addSpeed <= 0) return;

    const accelerationStep = Math.min(addSpeed, acceleration * delta);
    this.velocity.x += wish.x * accelerationStep;
    this.velocity.z += wish.z * accelerationStep;
  }

  applyHorizontalFriction(friction: number, delta: number): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed < 0.001) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    const nextSpeed = Math.max(0, speed - speed * friction * delta);
    const scale = nextSpeed / speed;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  applyDirectionalAcceleration(
    wish: THREE.Vector3,
    targetSpeed: number,
    acceleration: number,
    delta: number
  ): void {
    const currentSpeed = this.velocity.dot(wish);
    const addSpeed = targetSpeed - currentSpeed;
    if (addSpeed <= 0) return;

    const accelerationStep = Math.min(addSpeed, acceleration * delta);
    this.velocity.addScaledVector(wish, accelerationStep);
  }

  applyDirectionalFriction(friction: number, delta: number): void {
    const speed = this.velocity.length();
    if (speed < 0.001) {
      this.velocity.set(0, 0, 0);
      return;
    }

    const nextSpeed = Math.max(0, speed - speed * friction * delta);
    this.velocity.multiplyScalar(nextSpeed / speed);
  }

  limitHorizontalSpeed(maxSpeed: number): void {
    const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
    if (speedSq <= maxSpeed * maxSpeed) return;

    const scale = maxSpeed / Math.sqrt(speedSq);
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  limitDirectionalSpeed(maxSpeed: number): void {
    const speedSq = this.velocity.lengthSq();
    if (speedSq <= maxSpeed * maxSpeed) return;

    this.velocity.multiplyScalar(maxSpeed / Math.sqrt(speedSq));
  }

  toggleFlight(): void {
    this.setFlightEnabled(!this.flying);
  }

  setFlightEnabled(enabled: boolean): void {
    if (this.flying === enabled) return;

    this.flying = enabled;
    this.velocity.y = 0;
    this.endSlide();
    this.slideMomentumAirborne = false;

    if (enabled) {
      this.syncCrouchState(false);
    }
  }

  syncCrouchState(wantsCrouch: boolean): void {
    if (wantsCrouch === this.crouching) return;

    if (wantsCrouch) {
      this.crouching = true;
      return;
    }

    this.crouching = false;
    if (!this.collides()) return;

    // If there is a ceiling overhead, stay crouched and keep retrying on later
    // frames after the player moves clear of it. No skull-clipping allowed.
    this.crouching = true;
  }

  updateCrouchViewOffset(delta: number): void {
    const targetOffset = getCrouchViewTargetOffset(this.crouching);
    this.setCrouchViewOffset(smoothCrouchViewOffset(this.crouchViewOffset, targetOffset, delta));
  }

  setCrouchViewOffset(nextOffset: number): void {
    const clampedOffset = clamp(nextOffset, 0, CROUCH_VIEW_DROP);
    const offsetDelta = clampedOffset - this.crouchViewOffset;
    if (Math.abs(offsetDelta) <= 0.000001) return;

    // The camera is the rendered eye point, so changing the visual crouch offset
    // moves only the view. Feet/collision stay anchored through getFeetY().
    this.camera.position.y -= offsetDelta;
    this.crouchViewOffset = clampedOffset;
  }

  updateSlideState(
    delta: number,
    wasGrounded: boolean,
    justStartedCrouching: boolean,
    holdingForward: boolean
  ): void {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const sprinting = this.isSprintHeld();

    if (this.sliding && !wasGrounded) {
      this.slideMomentumAirborne = true;
      this.endSlide();
      return;
    }

    if (this.sliding) {
      this.slideElapsed += delta;
      // Release timing is speed-based after the minimum lock: forward keeps
      // the low-friction glide alive longer, while letting go bleeds speed down
      // quickly until the controller is back at crouch pace.
      if (!shouldContinueSlide(wasGrounded, this.slideElapsed, horizontalSpeed)) {
        this.endSlide();
      }
      return;
    }

    if (shouldStartSlide(wasGrounded, justStartedCrouching, sprinting, holdingForward, horizontalSpeed)) {
      this.startSlide(horizontalSpeed, true);
    }
  }

  updateLandingSlideState(landedThisFrame: boolean): void {
    if (!landedThisFrame) return;

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.slideMomentumAirborne = false;
    if (!this.sliding && shouldStartLandingSlide(true, this.crouching, horizontalSpeed)) {
      this.startSlide(horizontalSpeed, false);
    }
  }

  startSlide(horizontalSpeed: number, applyEntryBoost: boolean): void {
    this.sliding = true;
    this.crouching = true;
    this.slideElapsed = 0;
    const slideEntrySpeed = getSlideEntrySpeed(horizontalSpeed, applyEntryBoost);
    if (horizontalSpeed > 0) {
      const entrySpeedScale = slideEntrySpeed / horizontalSpeed;
      this.velocity.x *= entrySpeedScale;
      this.velocity.z *= entrySpeedScale;
    }
    // Preserve the speed the player actually brought into the slide. Without
    // this, high-speed landings or slide jumps can get chopped down by the
    // normal ground movement cap before friction has a chance to feel physical.
    this.slideSpeedLimit = getSlideSpeedLimit(slideEntrySpeed);
  }

  endSlide(): void {
    this.sliding = false;
    this.slideElapsed = 0;
    this.slideSpeedLimit = 0;
  }

  isSprintHeld(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  isGroundSprintActive(grounded: boolean): boolean {
    return grounded && this.isSprintHeld() && !this.crouching && !this.sliding;
  }

  isCrouchOrDescendHeld(): boolean {
    return this.keys.has(CROUCH_OR_DESCEND_KEY);
  }

  hasHorizontalMovementInput(): boolean {
    return (
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD")
    );
  }

  hasFlightMovementInput(): boolean {
    return this.hasHorizontalMovementInput() || this.keys.has("Space") || this.isCrouchOrDescendHeld();
  }

  moveAxis(axis: MovementAxis, amount: number): void {
    if (amount === 0) return;
    const previousFeetY = this.getFeetY();
    this.camera.position[axis] += amount;

    if (!this.collides()) {
      if (axis === "y" && amount < 0 && this.snapDownToPartialSupport(previousFeetY)) return;
      if (axis !== "y") this.stepUpOntoPartialSupport(previousFeetY);
      return;
    }

    this.camera.position[axis] -= amount;
    if (axis === "y" && amount < 0) this.onGround = true;
    if (axis === "y") this.velocity.y = 0;
    else this.velocity[axis] = 0;
  }

  overlapsBlock(x: number, y: number, z: number): boolean {
    const bounds = this.getBounds();
    return (
      x < bounds.maxX &&
      x + 1 > bounds.minX &&
      y < bounds.maxY &&
      y + 1 > bounds.minY &&
      z < bounds.maxZ &&
      z + 1 > bounds.minZ
    );
  }

  getBounds(): PlayerBounds {
    const feetY = this.getFeetY();
    const height = this.getCollisionHeight();

    return {
      minX: this.camera.position.x - PLAYER_RADIUS,
      maxX: this.camera.position.x + PLAYER_RADIUS,
      minY: feetY,
      maxY: feetY + height - 0.05,
      minZ: this.camera.position.z - PLAYER_RADIUS,
      maxZ: this.camera.position.z + PLAYER_RADIUS
    };
  }

  getFeetY(): number {
    return this.camera.position.y - this.getVisualEyeHeight();
  }

  getVisualEyeHeight(): number {
    return PLAYER_HEIGHT - this.crouchViewOffset;
  }

  getCollisionHeight(): number {
    return this.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  collides(): boolean {
    const bounds = this.getBounds();
    const minX = Math.floor(bounds.minX);
    const maxX = Math.floor(bounds.maxX);
    const minY = Math.floor(bounds.minY);
    const maxY = Math.floor(bounds.maxY);
    const minZ = Math.floor(bounds.minZ);
    const maxZ = Math.floor(bounds.maxZ);

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private snapDownToPartialSupport(previousFeetY: number): boolean {
    const bounds = this.getBounds();
    const supportY = this.world.getPlayerFootprintSupportHeight
      ? this.world.getPlayerFootprintSupportHeight(bounds)
      : this.world.getSupportHeight?.(bounds);
    if (supportY === undefined || supportY === null) return false;

    const feetY = this.getFeetY();
    if (supportY > previousFeetY + PARTIAL_SURFACE_SNAP_EPSILON) return false;
    if (feetY > supportY + PARTIAL_SURFACE_SNAP_EPSILON) return false;

    this.camera.position.y += supportY - feetY;
    this.onGround = true;
    this.velocity.y = 0;
    return true;
  }

  private stepUpOntoPartialSupport(previousFeetY: number): boolean {
    const bounds = this.getBounds();
    const supportY = this.world.getPlayerFootprintSupportHeight
      ? this.world.getPlayerFootprintSupportHeight(bounds)
      : this.world.getSupportHeight?.(bounds);
    if (supportY === undefined || supportY === null) return false;

    const feetY = this.getFeetY();
    const stepHeight = supportY - feetY;
    if (stepHeight <= PARTIAL_SURFACE_SNAP_EPSILON) return false;
    if (stepHeight > PARTIAL_SURFACE_STEP_HEIGHT) return false;
    if (previousFeetY + PARTIAL_SURFACE_STEP_HEIGHT < supportY) return false;

    // Rubble and other partial-height surfaces are not full voxels, so they
    // need a small step-up path separate from ordinary block collision. After
    // lifting the camera, re-run full voxel collision so a low ceiling or block
    // overhang can still reject the move cleanly.
    const previousCameraY = this.camera.position.y;
    this.camera.position.y += stepHeight;
    if (this.collides()) {
      this.camera.position.y = previousCameraY;
      return false;
    }

    this.onGround = true;
    if (this.velocity.y < 0) this.velocity.y = 0;
    return true;
  }
}

function shouldPreventGameKeyDefault(code: string): boolean {
  return (
    code === "Space" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === CROUCH_OR_DESCEND_KEY ||
    code === FLIGHT_TOGGLE_KEY
  );
}

export function isCatchablePointerLockRequest(value: unknown): value is CatchablePointerLockRequest {
  if (typeof value !== "object" || value === null) return false;

  const maybeCatchable = value as { readonly catch?: unknown };
  return typeof maybeCatchable.catch === "function";
}
