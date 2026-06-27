import * as THREE from "three";
import type { CollisionBounds, CollisionWorld } from "./collision";
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
type HorizontalMovementAxis = "x" | "z";
export type PlayerMovementMode = "walk" | "crouch" | "slide" | "flight";
const SUB_BLOCK_HEIGHT = 1 / 3;
const PASSIVE_STEP_MAX_HEIGHT = 0.55;
const VAULT_MAX_HEIGHT = 4 * SUB_BLOCK_HEIGHT;
const CLAMBER_MIN_HEIGHT = 5 * SUB_BLOCK_HEIGHT;
const CLAMBER_EXTRA_HEAD_REACH = SUB_BLOCK_HEIGHT;
const CLAMBER_BASE_DURATION_SECONDS = 0.16;
const CLAMBER_DURATION_PER_METER = 0.08;
const CLAMBER_MAX_DURATION_SECONDS = 0.34;
const CLAMBER_HORIZONTAL_DELAY = 0.22;
const VAULT_BASE_DURATION_SECONDS = 0.09;
const VAULT_DURATION_PER_METER = 0.035;
const VAULT_MAX_DURATION_SECONDS = 0.16;
const VAULT_ARC_HEIGHT = 0.12;
const STEP_UP_BASE_DURATION_SECONDS = 0.055;
const STEP_UP_DURATION_PER_METER = 0.06;
const STEP_UP_MAX_DURATION_SECONDS = 0.085;
const PARTIAL_SURFACE_SNAP_EPSILON = 0.025;
const PLAYER_COLLISION_OVERLAP_EPSILON = 0.000001;
const CLAMBER_CLEARANCE_EPSILON = 0.002;
// Long jumps can pass close enough to a ledge to feel catchable without ever
// producing a direct body/terrain collision on that frame. This short reach
// gives jump-held falling players a deliberate grab window without becoming a
// broad wall magnet.
const AIR_CLAMBER_GRAB_REACH = PLAYER_RADIUS + SUB_BLOCK_HEIGHT;
const JUMP_KEY = "Space";

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

type TraversalAnimation = {
  readonly kind: "step" | "vault" | "clamber";
  readonly start: THREE.Vector3;
  readonly target: THREE.Vector3;
  elapsed: number;
  readonly duration: number;
};

type TraversalKind = TraversalAnimation["kind"];

type AirClamberGrabCandidate = {
  readonly target: THREE.Vector3;
  readonly liftHeight: number;
  readonly faceDistance: number;
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
  private traversalAnimation: TraversalAnimation | null = null;
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
    this.completeTraversalAnimation();
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
    this.completeTraversalAnimation();
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
    this.cancelTraversalAnimation();
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

    if (this.traversalAnimation) {
      this.updateTraversalAnimation(delta);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      return;
    }

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
    if (wasGrounded && this.keys.has(JUMP_KEY)) {
      const jumpingFromSlide = this.sliding;
      this.velocity.y = getJumpSpeed(jumpingFromSlide);
      this.onGround = false;
      // A slide jump should carry the stored horizontal velocity instead of
      // immediately becoming a normal air-control jump.
      this.slideMomentumAirborne = shouldPreserveSlideJumpMomentum(jumpingFromSlide, true);
      if (jumpingFromSlide) this.endSlide();
    }

    this.moveAxis("x", this.velocity.x * delta, wasGrounded);
    this.moveAxis("z", this.velocity.z * delta, wasGrounded);
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
    if (this.keys.has(JUMP_KEY)) wish.y += 1;
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

    this.completeTraversalAnimation();
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
    return this.hasHorizontalMovementInput() || this.keys.has(JUMP_KEY) || this.isCrouchOrDescendHeld();
  }

  moveAxis(axis: MovementAxis, amount: number, groundedForTraversal = this.onGround): void {
    if (amount === 0) return;
    if (this.traversalAnimation) return;

    const movementStart = this.camera.position.clone();
    const previousFeetY = this.getFeetY();
    this.camera.position[axis] += amount;

    if (!this.collides()) {
      if (axis === "y" && amount < 0 && this.snapDownToPartialSupport(previousFeetY)) return;
      if (axis !== "y" && !this.flying) {
        if (this.stepUpOntoPartialSupport(previousFeetY, groundedForTraversal)) return;
        if (this.tryAirClamberGrab(axis, amount, previousFeetY, movementStart)) return;
      }
      return;
    }

    // Low 1/3m ledges and taller climbable lips collide at the old foot height
    // before support-height queries can help. While the horizontal move is still
    // applied, inspect the blocking collision boxes directly and lift onto the
    // lowest reachable top surface that leaves the player's body clear.
    if (
      axis !== "y"
      && !this.flying
      && this.traverseHorizontalObstacle(previousFeetY, movementStart, groundedForTraversal)
    ) return;

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
    return this.getBoundsAtCameraPosition(this.camera.position);
  }

  private getBoundsAtCameraPosition(position: THREE.Vector3): PlayerBounds {
    const feetY = position.y - this.getVisualEyeHeight();
    const height = this.getCollisionHeight();

    return {
      minX: position.x - PLAYER_RADIUS,
      maxX: position.x + PLAYER_RADIUS,
      minY: feetY,
      maxY: feetY + height - 0.05,
      minZ: position.z - PLAYER_RADIUS,
      maxZ: position.z + PLAYER_RADIUS
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
    return doesPlayerBoundsCollideWithWorld(this.getBounds(), this.world);
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

  private stepUpOntoPartialSupport(previousFeetY: number, groundedForTraversal: boolean): boolean {
    const bounds = this.getBounds();
    const supportY = this.world.getPlayerFootprintSupportHeight
      ? this.world.getPlayerFootprintSupportHeight(bounds)
      : this.world.getSupportHeight?.(bounds);
    if (supportY === undefined || supportY === null) return false;

    const feetY = this.getFeetY();
    const stepHeight = supportY - feetY;
    if (stepHeight <= PARTIAL_SURFACE_SNAP_EPSILON) return false;
    const traversalKind = this.chooseTraversalKind(stepHeight, groundedForTraversal);
    if (traversalKind === null || traversalKind === "clamber") return false;
    if (previousFeetY + stepHeight < supportY - PARTIAL_SURFACE_SNAP_EPSILON) return false;

    // Rubble and other partial-height surfaces can be low enough to walk up
    // without a blocking side-face collision. Apply the same traversal rules as
    // direct ledges, then re-run full collision so ceilings still reject cleanly.
    const previousCameraY = this.camera.position.y;
    this.camera.position.y += stepHeight;
    if (this.collides()) {
      this.camera.position.y = previousCameraY;
      return false;
    }

    this.onGround = true;
    if (this.velocity.y < 0) this.velocity.y = 0;
    this.startTraversalAnimation(traversalKind, previousCameraY, this.camera.position.clone(), stepHeight);
    return true;
  }

  private traverseHorizontalObstacle(
    previousFeetY: number,
    movementStart: THREE.Vector3,
    groundedForTraversal: boolean
  ): boolean {
    // One-sub-block ledges are passive steps, two-to-four-sub-block ledges are
    // sprint vaults, and taller ledges become deliberate clambers only while
    // jump is held. The same path also handles falling edge-grabs because a
    // falling player with jump held may choose the clamber branch below.
    return this.liftOntoReachableSurface(
      previousFeetY,
      this.getCollisionHeight() + CLAMBER_EXTRA_HEAD_REACH,
      movementStart,
      groundedForTraversal
    );
  }

  private tryAirClamberGrab(
    axis: HorizontalMovementAxis,
    amount: number,
    previousFeetY: number,
    movementStart: THREE.Vector3
  ): boolean {
    if (!this.canStartAirClamber()) return false;

    const direction = Math.sign(amount);
    if (direction === 0) return false;

    const currentPosition = this.camera.position.clone();
    const candidates = this.findAirClamberGrabCandidates(axis, direction, previousFeetY, movementStart);

    for (const candidate of candidates) {
      const target = candidate.target.clone();
      this.camera.position.copy(target);
      if (this.collides()) {
        this.camera.position.copy(currentPosition);
        continue;
      }

      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.startTraversalAnimation("clamber", currentPosition.y, target, candidate.liftHeight, currentPosition);
      return true;
    }

    this.camera.position.copy(currentPosition);
    return false;
  }

  private findAirClamberGrabCandidates(
    axis: HorizontalMovementAxis,
    direction: number,
    previousFeetY: number,
    movementStart: THREE.Vector3
  ): readonly AirClamberGrabCandidate[] {
    const currentBounds = this.getBounds();
    const startBounds = this.getBoundsAtCameraPosition(movementStart);
    const probeBounds = createAirClamberProbeBounds(startBounds, currentBounds, axis, direction);
    const currentFeetY = this.getFeetY();
    const maxSurfaceY = previousFeetY + this.getCollisionHeight() + CLAMBER_EXTRA_HEAD_REACH;
    const candidates: AirClamberGrabCandidate[] = [];

    const minX = Math.floor(probeBounds.minX);
    const maxX = Math.floor(probeBounds.maxX);
    const minY = Math.floor(previousFeetY - PLAYER_COLLISION_OVERLAP_EPSILON);
    const maxY = Math.floor(maxSurfaceY + PLAYER_COLLISION_OVERLAP_EPSILON);
    const minZ = Math.floor(probeBounds.minZ);
    const maxZ = Math.floor(probeBounds.maxZ);

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          for (const box of this.getCollisionBoxesForCell(x, y, z)) {
            if (!perpendicularBoundsOverlap(currentBounds, box, axis)) continue;
            if (box.maxY <= currentFeetY + PARTIAL_SURFACE_SNAP_EPSILON) continue;
            if (box.maxY > maxSurfaceY + PARTIAL_SURFACE_SNAP_EPSILON) continue;

            const faceDistance = getForwardFaceDistance(currentBounds, box, axis, direction);
            if (faceDistance < -PLAYER_COLLISION_OVERLAP_EPSILON) continue;
            if (faceDistance > AIR_CLAMBER_GRAB_REACH + PLAYER_COLLISION_OVERLAP_EPSILON) continue;

            const liftHeight = box.maxY - currentFeetY;
            if (this.chooseTraversalKind(liftHeight, false) !== "clamber") continue;

            const target = this.camera.position.clone();
            target.y = box.maxY + CLAMBER_CLEARANCE_EPSILON + this.getVisualEyeHeight();
            // Land just past the contacted lip, not at the center of the block.
            // That keeps the pull-up readable and avoids an unnecessary snap
            // across a whole voxel when the player merely brushed the edge.
            if (axis === "x") {
              target.x = direction > 0
                ? box.minX + PLAYER_RADIUS + CLAMBER_CLEARANCE_EPSILON
                : box.maxX - PLAYER_RADIUS - CLAMBER_CLEARANCE_EPSILON;
            } else {
              target.z = direction > 0
                ? box.minZ + PLAYER_RADIUS + CLAMBER_CLEARANCE_EPSILON
                : box.maxZ - PLAYER_RADIUS - CLAMBER_CLEARANCE_EPSILON;
            }

            candidates.push({ target, liftHeight, faceDistance });
          }
        }
      }
    }

    return candidates.sort((left, right) => {
      const distanceDelta = left.faceDistance - right.faceDistance;
      if (Math.abs(distanceDelta) > PLAYER_COLLISION_OVERLAP_EPSILON) return distanceDelta;
      return left.liftHeight - right.liftHeight;
    });
  }

  private liftOntoReachableSurface(
    previousFeetY: number,
    maxLiftHeight: number,
    clamberStart: THREE.Vector3 | undefined,
    groundedForTraversal: boolean
  ): boolean {
    const surfaceCandidates = this.findReachableSurfaceHeights(previousFeetY, maxLiftHeight);
    const currentFeetY = this.getFeetY();

    for (const surfaceY of surfaceCandidates) {
      const previousCameraY = this.camera.position.y;
      const liftHeight = surfaceY - currentFeetY;
      if (liftHeight <= PARTIAL_SURFACE_SNAP_EPSILON) continue;

      // Place the feet from the chosen surface instead of adding the lift delta.
      // Tall clambers can otherwise accumulate tiny float error and make the
      // follow-up collision pass think the player is still touching the ledge.
      const landingClearance = liftHeight > VAULT_MAX_HEIGHT + PARTIAL_SURFACE_SNAP_EPSILON
        ? CLAMBER_CLEARANCE_EPSILON
        : 0;
      this.camera.position.y = surfaceY + landingClearance + this.getVisualEyeHeight();
      if (this.collides()) {
        this.camera.position.y = previousCameraY;
        continue;
      }
      const traversalKind = this.chooseTraversalKind(liftHeight, groundedForTraversal);
      if (traversalKind === null) {
        this.camera.position.y = previousCameraY;
        continue;
      }

      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.startTraversalAnimation(
        traversalKind,
        previousCameraY,
        this.camera.position.clone(),
        liftHeight,
        clamberStart
      );
      return true;
    }

    const lowestCandidateLift = surfaceCandidates[0] === undefined
      ? Number.POSITIVE_INFINITY
      : surfaceCandidates[0] - currentFeetY;
    const hasTallCandidate = surfaceCandidates.some(
      (surfaceY) => surfaceY - currentFeetY > VAULT_MAX_HEIGHT + PARTIAL_SURFACE_SNAP_EPSILON
    );
    if (!hasTallCandidate && lowestCandidateLift <= VAULT_MAX_HEIGHT + PARTIAL_SURFACE_SNAP_EPSILON) {
      return false;
    }

    return this.liftUntilClear(previousFeetY, maxLiftHeight, clamberStart, groundedForTraversal);
  }

  private liftUntilClear(
    previousFeetY: number,
    maxLiftHeight: number,
    clamberStart: THREE.Vector3 | undefined,
    groundedForTraversal: boolean
  ): boolean {
    // Full-block clamber can be blocked by a lower collision box while the
    // actual top surface is one or two voxels above it. If the explicit surface
    // candidate path cannot find a clean landing, sweep upward in sub-block
    // increments and accept the first height where the already-applied
    // horizontal move no longer intersects terrain. This stays bounded and only
    // runs after a real horizontal collision, so it cannot become a general
    // "walk up air" cheat.
    for (
      let liftHeight = SUB_BLOCK_HEIGHT;
      liftHeight <= maxLiftHeight + PLAYER_COLLISION_OVERLAP_EPSILON;
      liftHeight += SUB_BLOCK_HEIGHT
    ) {
      const previousCameraY = this.camera.position.y;
      const traversalKind = this.chooseTraversalKind(liftHeight, groundedForTraversal);
      if (traversalKind === null) continue;
      this.camera.position.y = previousFeetY + liftHeight + CLAMBER_CLEARANCE_EPSILON + this.getVisualEyeHeight();
      if (this.collides()) {
        this.camera.position.y = previousCameraY;
        continue;
      }

      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.startTraversalAnimation(
        traversalKind,
        previousCameraY,
        this.camera.position.clone(),
        liftHeight,
        clamberStart
      );
      return true;
    }

    return false;
  }

  private chooseTraversalKind(liftHeight: number, groundedForTraversal: boolean): TraversalKind | null {
    if (liftHeight <= PASSIVE_STEP_MAX_HEIGHT + PARTIAL_SURFACE_SNAP_EPSILON) return "step";
    if (liftHeight <= VAULT_MAX_HEIGHT + PARTIAL_SURFACE_SNAP_EPSILON) {
      return this.canStartVault(groundedForTraversal) ? "vault" : null;
    }
    if (liftHeight < CLAMBER_MIN_HEIGHT - PARTIAL_SURFACE_SNAP_EPSILON && !this.canStartAirClamber()) {
      return null;
    }
    return this.canStartClamber() ? "clamber" : null;
  }

  private canStartVault(groundedForTraversal: boolean): boolean {
    return groundedForTraversal && this.isSprintHeld() && !this.crouching && !this.sliding;
  }

  private canStartClamber(): boolean {
    return this.keys.has(JUMP_KEY);
  }

  private canStartAirClamber(): boolean {
    return this.velocity.y < -0.2 && this.canStartClamber();
  }

  private findReachableSurfaceHeights(previousFeetY: number, maxLiftHeight: number): readonly number[] {
    const bounds = this.getBounds();
    const maxSurfaceY = previousFeetY + maxLiftHeight;
    const minX = Math.floor(bounds.minX);
    const maxX = Math.floor(bounds.maxX);
    const minY = Math.floor(previousFeetY - PLAYER_COLLISION_OVERLAP_EPSILON);
    const maxY = Math.floor(maxSurfaceY + PLAYER_COLLISION_OVERLAP_EPSILON);
    const minZ = Math.floor(bounds.minZ);
    const maxZ = Math.floor(bounds.maxZ);
    const surfaceHeights: number[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          for (const box of this.getCollisionBoxesForCell(x, y, z)) {
            if (!horizontalBoundsOverlap(bounds, box)) continue;
            if (box.maxY <= previousFeetY + PARTIAL_SURFACE_SNAP_EPSILON) continue;
            if (box.maxY > maxSurfaceY + PARTIAL_SURFACE_SNAP_EPSILON) continue;
            if (!surfaceHeights.some((height) => Math.abs(height - box.maxY) <= PLAYER_COLLISION_OVERLAP_EPSILON)) {
              surfaceHeights.push(box.maxY);
            }
          }
        }
      }
    }

    return surfaceHeights.sort((left, right) => left - right);
  }

  private getCollisionBoxesForCell(x: number, y: number, z: number): readonly CollisionBounds[] {
    const partialBoxes = this.world.getCellCollisionBoxes?.(x, y, z);
    if (partialBoxes) return partialBoxes;
    if (!this.world.isSolid(x, y, z)) return [];

    return [{
      minX: x,
      maxX: x + 1,
      minY: y,
      maxY: y + 1,
      minZ: z,
      maxZ: z + 1
    }];
  }

  private startTraversalAnimation(
    kind: TraversalKind,
    previousCameraY: number,
    target: THREE.Vector3,
    liftHeight: number,
    clamberStart?: THREE.Vector3
  ): void {
    if (kind === "clamber") {
      this.startClamberAnimation(clamberStart ?? this.camera.position, target, liftHeight);
      return;
    }

    this.startStepOrVaultAnimation(kind, previousCameraY, target, liftHeight);
  }

  private startStepOrVaultAnimation(
    kind: "step" | "vault",
    previousCameraY: number,
    target: THREE.Vector3,
    liftHeight: number
  ): void {
    const start = target.clone();
    start.y = previousCameraY;
    const baseDuration = kind === "vault" ? VAULT_BASE_DURATION_SECONDS : STEP_UP_BASE_DURATION_SECONDS;
    const durationPerMeter = kind === "vault" ? VAULT_DURATION_PER_METER : STEP_UP_DURATION_PER_METER;
    const maxDuration = kind === "vault" ? VAULT_MAX_DURATION_SECONDS : STEP_UP_MAX_DURATION_SECONDS;

    // Low steps and sprint vaults already passed collision at the final pose.
    // Move x/z to the approved pose immediately so vaulting does not steal
    // horizontal momentum, then ease only the camera's vertical lift.
    this.camera.position.copy(start);
    this.traversalAnimation = {
      kind,
      start,
      target: target.clone(),
      elapsed: 0,
      duration: clamp(
        baseDuration + liftHeight * durationPerMeter,
        baseDuration,
        maxDuration
      )
    };
  }

  private startClamberAnimation(start: THREE.Vector3, target: THREE.Vector3, liftHeight: number): void {
    this.endSlide();
    this.slideMomentumAirborne = false;
    this.velocity.set(0, 0, 0);
    this.onGround = true;

    // Collision has already approved the target pose. Restore the camera to the
    // last safe pose and then play a short visual climb toward the approved
    // landing, raising first and sliding forward second so it reads as a pull-up
    // instead of the old instant y-snap.
    this.camera.position.copy(start);
    this.traversalAnimation = {
      kind: "clamber",
      start: start.clone(),
      target: target.clone(),
      elapsed: 0,
      duration: clamp(
        CLAMBER_BASE_DURATION_SECONDS + liftHeight * CLAMBER_DURATION_PER_METER,
        CLAMBER_BASE_DURATION_SECONDS,
        CLAMBER_MAX_DURATION_SECONDS
      )
    };
  }

  private updateTraversalAnimation(delta: number): void {
    const animation = this.traversalAnimation;
    if (!animation) return;

    animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, delta));
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    const verticalProgress = animation.kind === "clamber" ? easeOutCubic(progress) : smoothStep(progress);
    const horizontalProgress = animation.kind === "clamber"
      ? smoothStep(clamp((progress - CLAMBER_HORIZONTAL_DELAY) / (1 - CLAMBER_HORIZONTAL_DELAY), 0, 1))
      : 1;
    const vaultArc = animation.kind === "vault" ? Math.sin(Math.PI * progress) * VAULT_ARC_HEIGHT : 0;

    this.camera.position.set(
      lerp(animation.start.x, animation.target.x, horizontalProgress),
      lerp(animation.start.y, animation.target.y, verticalProgress) + vaultArc,
      lerp(animation.start.z, animation.target.z, horizontalProgress)
    );

    if (progress >= 1) {
      this.completeTraversalAnimation();
    }
  }

  private completeTraversalAnimation(): void {
    const animation = this.traversalAnimation;
    if (!animation) return;

    this.camera.position.copy(animation.target);
    this.traversalAnimation = null;
    this.onGround = true;
    if (animation.kind === "clamber") {
      this.velocity.set(0, 0, 0);
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }
  }

  private cancelTraversalAnimation(): void {
    this.traversalAnimation = null;
  }
}

export function doesPlayerBoundsCollideWithWorld(bounds: PlayerBounds, world: CollisionWorld): boolean {
  const minX = Math.floor(bounds.minX);
  const maxX = Math.floor(bounds.maxX);
  const minY = Math.floor(bounds.minY);
  const maxY = Math.floor(bounds.maxY);
  const minZ = Math.floor(bounds.minZ);
  const maxZ = Math.floor(bounds.maxZ);

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const partialBoxes = world.getCellCollisionBoxes?.(x, y, z);

        // Damaged terrain remains a non-air macro block so world.isSolid() stays
        // true for projectile/raycast bookkeeping. Player collision has to use
        // the surviving 3x3x3 lattice boxes instead, or a carved hole still
        // behaves like an invisible full cube.
        if (partialBoxes) {
          for (const box of partialBoxes) {
            if (collisionBoundsOverlap(bounds, box)) return true;
          }
          continue;
        }

        if (world.isSolid(x, y, z)) return true;
      }
    }
  }

  return false;
}

function collisionBoundsOverlap(a: CollisionBounds, b: CollisionBounds): boolean {
  return (
    a.minX < b.maxX - PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.maxX > b.minX + PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.minY < b.maxY - PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.maxY > b.minY + PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.minZ < b.maxZ - PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.maxZ > b.minZ + PLAYER_COLLISION_OVERLAP_EPSILON
  );
}

function horizontalBoundsOverlap(a: CollisionBounds, b: CollisionBounds): boolean {
  return (
    a.minX < b.maxX - PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.maxX > b.minX + PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.minZ < b.maxZ - PLAYER_COLLISION_OVERLAP_EPSILON &&
    a.maxZ > b.minZ + PLAYER_COLLISION_OVERLAP_EPSILON
  );
}

function createAirClamberProbeBounds(
  startBounds: PlayerBounds,
  currentBounds: PlayerBounds,
  axis: HorizontalMovementAxis,
  direction: number
): PlayerBounds {
  const bounds = {
    minX: Math.min(startBounds.minX, currentBounds.minX),
    maxX: Math.max(startBounds.maxX, currentBounds.maxX),
    minY: Math.min(startBounds.minY, currentBounds.minY),
    maxY: Math.max(startBounds.maxY, currentBounds.maxY),
    minZ: Math.min(startBounds.minZ, currentBounds.minZ),
    maxZ: Math.max(startBounds.maxZ, currentBounds.maxZ)
  };

  if (axis === "x") {
    if (direction > 0) bounds.maxX += AIR_CLAMBER_GRAB_REACH;
    else bounds.minX -= AIR_CLAMBER_GRAB_REACH;
  } else if (direction > 0) {
    bounds.maxZ += AIR_CLAMBER_GRAB_REACH;
  } else {
    bounds.minZ -= AIR_CLAMBER_GRAB_REACH;
  }

  return bounds;
}

function perpendicularBoundsOverlap(
  playerBounds: PlayerBounds,
  blockBounds: CollisionBounds,
  movementAxis: HorizontalMovementAxis
): boolean {
  if (movementAxis === "x") {
    return (
      playerBounds.minZ < blockBounds.maxZ - PLAYER_COLLISION_OVERLAP_EPSILON &&
      playerBounds.maxZ > blockBounds.minZ + PLAYER_COLLISION_OVERLAP_EPSILON
    );
  }

  return (
    playerBounds.minX < blockBounds.maxX - PLAYER_COLLISION_OVERLAP_EPSILON &&
    playerBounds.maxX > blockBounds.minX + PLAYER_COLLISION_OVERLAP_EPSILON
  );
}

function getForwardFaceDistance(
  playerBounds: PlayerBounds,
  blockBounds: CollisionBounds,
  movementAxis: HorizontalMovementAxis,
  direction: number
): number {
  if (movementAxis === "x") {
    return direction > 0
      ? blockBounds.minX - playerBounds.maxX
      : playerBounds.minX - blockBounds.maxX;
  }

  return direction > 0
    ? blockBounds.minZ - playerBounds.maxZ
    : playerBounds.minZ - blockBounds.maxZ;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function easeOutCubic(progress: number): number {
  const remaining = 1 - progress;
  return 1 - remaining * remaining * remaining;
}

function smoothStep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

function shouldPreventGameKeyDefault(code: string): boolean {
  return (
    code === JUMP_KEY ||
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
