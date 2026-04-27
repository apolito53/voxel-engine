import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import { clamp } from "./math";
import {
  AIR_ACCELERATION,
  AIR_DRAG,
  AIR_SPEED_LIMIT,
  CROUCH_OR_DESCEND_KEY,
  FLIGHT_ACCELERATION,
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
  SLIDE_FRICTION,
  SLIDE_PRIME_SPEED,
  SPRINT_SPEED,
  WALK_SPEED,
  getGroundMovementSpeed,
  shouldContinueSlide,
  shouldPrimeSlide
} from "./playerMovement";

type MovementAxis = "x" | "y" | "z";
export type PlayerMovementMode = "walk" | "crouch" | "slide" | "flight";

export type PlayerBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
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
  private slidePrimed = false;

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

    domElement.tabIndex = 0;
    domElement.addEventListener("click", () => {
      if (this.active && !this.locked && !this.pendingLock) {
        this.requestLock();
      }
    });
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
    });
    document.addEventListener("pointerlockerror", () => {
      this.pendingLock = false;
      this.clearLockTimeout();
      this.updateCursor();
    });
    document.addEventListener("mousemove", (event) => this.handleMouse(event));
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
    });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code));
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

    const lockRequest = this.domElement.requestPointerLock();
    void lockRequest.catch(() => {
      this.pendingLock = false;
      this.clearLockTimeout();
      this.updateCursor();
    });

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

  get movementMode(): PlayerMovementMode {
    if (this.flying) return "flight";
    if (this.sliding) return "slide";
    if (this.crouching) return "crouch";
    return "walk";
  }

  releaseLook(): void {
    this.pause(true);
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

  updateCursor(): void {
    document.body.classList.toggle("playing", this.active);
  }

  update(delta: number): void {
    if (!this.active) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.flying) {
      this.updateFlight(delta, forward, right);
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

    this.syncCrouchState(this.isCrouchOrDescendHeld());
    this.updateSlideState(wasGrounded, hasWish);
    const speed = getGroundMovementSpeed({
      sprinting: this.isSprintHeld(),
      crouching: this.crouching,
      sliding: this.sliding,
      slidePrimed: this.slidePrimed
    });

    if (wasGrounded) {
      this.applyHorizontalFriction(this.sliding ? SLIDE_FRICTION : GROUND_FRICTION, delta);
    } else {
      this.applyHorizontalFriction(AIR_DRAG, delta);
    }

    if (hasWish && !this.sliding) {
      this.applyHorizontalAcceleration(
        wish,
        speed,
        wasGrounded ? GROUND_ACCELERATION : AIR_ACCELERATION,
        delta
      );
    }

    this.limitHorizontalSpeed(wasGrounded ? speed : AIR_SPEED_LIMIT);
    this.velocity.y -= GRAVITY * delta;

    this.onGround = false;
    if (wasGrounded && this.keys.has("Space")) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this.moveAxis("x", this.velocity.x * delta);
    this.moveAxis("z", this.velocity.z * delta);
    this.moveAxis("y", this.velocity.y * delta);

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
        this.isSprintHeld() ? SPRINT_SPEED : WALK_SPEED,
        FLIGHT_ACCELERATION,
        delta
      );
    }

    this.limitDirectionalSpeed(this.isSprintHeld() ? SPRINT_SPEED : WALK_SPEED);
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
    this.flying = !this.flying;
    this.velocity.y = 0;
    this.sliding = false;
    this.slidePrimed = false;

    if (this.flying) {
      this.syncCrouchState(false);
    }
  }

  syncCrouchState(wantsCrouch: boolean): void {
    if (wantsCrouch === this.crouching) return;

    if (wantsCrouch) {
      this.crouching = true;
      this.camera.position.y -= PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;
      return;
    }

    this.camera.position.y += PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;
    this.crouching = false;
    if (!this.collides()) return;

    // If there is a ceiling overhead, stay crouched and keep retrying on later
    // frames after the player moves clear of it. No skull-clipping allowed.
    this.camera.position.y -= PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;
    this.crouching = true;
  }

  updateSlideState(wasGrounded: boolean, hasWish: boolean): void {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const sprinting = this.isSprintHeld();

    if (shouldPrimeSlide(wasGrounded, this.crouching, sprinting, hasWish, horizontalSpeed)) {
      this.slidePrimed = true;
    }

    if (this.sliding) {
      this.sliding = shouldContinueSlide(wasGrounded, this.crouching, hasWish, horizontalSpeed);
      if (!this.sliding) this.slidePrimed = false;
      return;
    }

    this.sliding = (this.slidePrimed || (sprinting && horizontalSpeed >= SLIDE_PRIME_SPEED)) &&
      shouldContinueSlide(wasGrounded, this.crouching, hasWish, horizontalSpeed);

    if (!this.crouching || !wasGrounded || (hasWish && !sprinting)) {
      this.slidePrimed = false;
    }
  }

  isSprintHeld(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  isCrouchOrDescendHeld(): boolean {
    return this.keys.has(CROUCH_OR_DESCEND_KEY);
  }

  moveAxis(axis: MovementAxis, amount: number): void {
    if (amount === 0) return;
    this.camera.position[axis] += amount;

    if (!this.collides()) return;

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
    const height = this.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    return {
      minX: this.camera.position.x - PLAYER_RADIUS,
      maxX: this.camera.position.x + PLAYER_RADIUS,
      minY: this.camera.position.y - height,
      maxY: this.camera.position.y - 0.05,
      minZ: this.camera.position.z - PLAYER_RADIUS,
      maxZ: this.camera.position.z + PLAYER_RADIUS
    };
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
