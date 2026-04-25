import * as THREE from "three";
import { clamp } from "./math.js";

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.32;
const LOOK_SENSITIVITY = 0.0022;

export class PlayerController {
  constructor(camera, domElement, world) {
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
      window.clearTimeout(this.lockTimeout);
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
      window.clearTimeout(this.lockTimeout);
      this.updateCursor();
    });
    document.addEventListener("mousemove", (event) => this.handleMouse(event));
    document.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        this.releaseLook();
        return;
      }
      if (!this.active) return;
      this.keys.add(event.code);
    });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code));
  }

  resume() {
    if (this.active) {
      if (!this.locked && !this.pendingLock) this.requestLock();
      return;
    }

    this.active = true;
    this.onPauseChange(false);
    this.updateCursor();
    this.requestLock();
  }

  requestLock() {
    if (!this.active || this.locked || this.pendingLock) return;

    if (!this.domElement.requestPointerLock) {
      return;
    }

    this.domElement.focus();
    this.pendingLock = true;
    this.updateCursor();

    const lockRequest = this.domElement.requestPointerLock();
    lockRequest?.catch?.(() => {
      this.pendingLock = false;
      this.updateCursor();
    });

    window.clearTimeout(this.lockTimeout);
    this.lockTimeout = window.setTimeout(() => {
      if (this.pendingLock && !this.locked) {
        this.pendingLock = false;
        this.updateCursor();
      }
    }, 1200);
  }

  handleMouse(event) {
    if (this.active) {
      this.applyMouseDelta(event.movementX, event.movementY);
    }
  }

  applyMouseDelta(x, y) {
    this.yaw -= x * LOOK_SENSITIVITY;
    this.pitch -= y * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  isLooking() {
    return this.active;
  }

  releaseLook() {
    this.pause(true);
  }

  pause(exitPointerLock = true) {
    this.active = false;
    this.pendingLock = false;
    window.clearTimeout(this.lockTimeout);
    this.keys.clear();
    this.onPauseChange(true);
    if (exitPointerLock && document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
    this.updateCursor();
  }

  updateCursor() {
    document.body.classList.toggle("playing", this.active);
  }

  update(delta) {
    if (!this.active) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();

    if (this.keys.has("KeyW")) wish.add(forward);
    if (this.keys.has("KeyS")) wish.sub(forward);
    if (this.keys.has("KeyD")) wish.add(right);
    if (this.keys.has("KeyA")) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const speed = this.keys.has("ShiftLeft") ? 8.5 : 5.4;
    this.velocity.x = wish.x * speed;
    this.velocity.z = wish.z * speed;
    this.velocity.y -= 22 * delta;

    if (this.onGround && this.keys.has("Space")) {
      this.velocity.y = 8.2;
      this.onGround = false;
    }

    this.moveAxis("x", this.velocity.x * delta);
    this.moveAxis("z", this.velocity.z * delta);
    this.moveAxis("y", this.velocity.y * delta);

    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    this.camera.position[axis] += amount;

    if (!this.collides()) return;

    this.camera.position[axis] -= amount;
    if (axis === "y" && amount < 0) this.onGround = true;
    if (axis === "y") this.velocity.y = 0;
  }

  overlapsBlock(x, y, z) {
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

  getBounds() {
    return {
      minX: this.camera.position.x - PLAYER_RADIUS,
      maxX: this.camera.position.x + PLAYER_RADIUS,
      minY: this.camera.position.y - PLAYER_HEIGHT,
      maxY: this.camera.position.y - 0.05,
      minZ: this.camera.position.z - PLAYER_RADIUS,
      maxZ: this.camera.position.z + PLAYER_RADIUS
    };
  }

  collides() {
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
