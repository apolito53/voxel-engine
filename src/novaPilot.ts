import * as THREE from "three";

export const NOVA_PILOT_TOGGLE_KEY = "KeyN";
export const NOVA_PILOT_THROW_KEY = "KeyB";

const NOVA_PILOT_ORBIT_RADIUS = 4.6;
const NOVA_PILOT_FORWARD_DRIFT = 2.4;
const NOVA_PILOT_FOLLOW_HEIGHT = 2.35;
const NOVA_PILOT_GROUND_CLEARANCE = 1.65;
const NOVA_PILOT_MAX_SPEED = 11;
const NOVA_PILOT_STEERING_RESPONSE = 5.4;
const NOVA_PILOT_BOB_SPEED = 1.7;
const NOVA_PILOT_BOB_HEIGHT = 0.32;
const NOVA_PILOT_THROW_SPEED = 15;
const NOVA_PILOT_PULSE_DECAY = 3.6;
const NOVA_PILOT_BASE_GLOW_OPACITY = 0.5;

export type NovaPilotWorld = {
  highestSolidY(x: number, z: number): number;
};

export type NovaPilotCoreLaunch = {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
};

const up = new THREE.Vector3(0, 1, 0);
const fallbackForward = new THREE.Vector3(0, 0, -1);

export function getNovaPilotDesiredPosition(
  playerPosition: THREE.Vector3,
  playerForward: THREE.Vector3,
  terrainY: number,
  timeSeconds: number
): THREE.Vector3 {
  const forward = flattenForward(playerForward);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const orbitPhase = timeSeconds * 0.72;
  const sideOffset = Math.sin(orbitPhase) * NOVA_PILOT_ORBIT_RADIUS;
  const forwardOffset = Math.cos(orbitPhase * 0.83) * NOVA_PILOT_FORWARD_DRIFT - 1.4;
  const bob = Math.sin(timeSeconds * NOVA_PILOT_BOB_SPEED) * NOVA_PILOT_BOB_HEIGHT;
  const desired = playerPosition.clone()
    .addScaledVector(right, sideOffset)
    .addScaledVector(forward, forwardOffset);

  // The pilot follows the player vertically, but never dives into terrain if
  // the player crests a ridge or drops into a hole faster than the companion.
  desired.y = Math.max(
    playerPosition.y + NOVA_PILOT_FOLLOW_HEIGHT + bob,
    terrainY + NOVA_PILOT_GROUND_CLEARANCE + bob
  );
  return desired;
}

export function createNovaPilotCoreLaunch(
  pilotPosition: THREE.Vector3,
  aimDirection: THREE.Vector3,
  pilotVelocity: THREE.Vector3
): NovaPilotCoreLaunch {
  const direction = normalizeOrFallback(aimDirection, fallbackForward);
  return {
    position: pilotPosition.clone().addScaledVector(direction, 0.9),
    velocity: direction
      .clone()
      .multiplyScalar(NOVA_PILOT_THROW_SPEED)
      .addScaledVector(pilotVelocity, 0.18)
  };
}

export class NovaPilot {
  readonly object: THREE.Group;
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fd8ff,
    emissive: 0x17496a,
    roughness: 0.42,
    metalness: 0.05
  });
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  private readonly accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5bd6,
    emissive: 0x461044,
    roughness: 0.35,
    metalness: 0.15
  });
  private readonly bodyGeometry = new THREE.IcosahedronGeometry(0.34, 1);
  private readonly glowGeometry = new THREE.SphereGeometry(0.48, 16, 10);
  private readonly ringGeometry = new THREE.TorusGeometry(0.55, 0.018, 8, 48);
  private readonly noseGeometry = new THREE.ConeGeometry(0.13, 0.34, 10);
  private readonly glowMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly velocity = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly steering = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3(0, 0, -1);
  private readonly lookTarget = new THREE.Vector3();
  private timeSeconds = 0;
  private pulseStrength = 0;
  private enabled = false;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = "Nova Pilot";
    this.object.visible = false;

    this.glowMesh = new THREE.Mesh(this.glowGeometry, this.glowMaterial);
    this.glowMesh.name = "Nova pilot glow";
    this.glowMesh.scale.set(1, 0.72, 1);
    this.object.add(this.glowMesh);

    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    body.name = "Nova pilot core";
    body.castShadow = true;
    body.receiveShadow = true;
    this.object.add(body);

    const ring = new THREE.Mesh(this.ringGeometry, this.accentMaterial);
    ring.name = "Nova pilot orbit ring";
    ring.rotation.x = Math.PI / 2;
    this.object.add(ring);

    const nose = new THREE.Mesh(this.noseGeometry, this.accentMaterial);
    nose.name = "Nova pilot direction marker";
    nose.position.set(0, 0, -0.48);
    nose.rotation.x = -Math.PI / 2;
    this.object.add(nose);
  }

  get active(): boolean {
    return this.enabled;
  }

  setActive(active: boolean, playerPosition: THREE.Vector3, playerForward: THREE.Vector3, world: NovaPilotWorld): void {
    this.enabled = active;
    this.object.visible = active;
    if (!active) {
      this.velocity.set(0, 0, 0);
      this.pulseStrength = 0;
      this.glowMaterial.opacity = NOVA_PILOT_BASE_GLOW_OPACITY;
      this.bodyMaterial.emissiveIntensity = 1;
      this.accentMaterial.emissiveIntensity = 1;
      this.object.scale.setScalar(1);
      return;
    }

    this.timeSeconds = 0;
    this.object.position.copy(
      getNovaPilotDesiredPosition(
        playerPosition,
        playerForward,
        world.highestSolidY(playerPosition.x, playerPosition.z),
        this.timeSeconds
      )
    );
    this.object.position.y = Math.max(
      this.object.position.y,
      world.highestSolidY(this.object.position.x, this.object.position.z) + NOVA_PILOT_GROUND_CLEARANCE
    );
    this.aimDirection.copy(flattenForward(playerForward));
  }

  toggle(playerPosition: THREE.Vector3, playerForward: THREE.Vector3, world: NovaPilotWorld): boolean {
    this.setActive(!this.enabled, playerPosition, playerForward, world);
    return this.enabled;
  }

  pulse(strength = 1): void {
    this.pulseStrength = Math.max(this.pulseStrength, Math.max(0, strength));
  }

  update(delta: number, playerPosition: THREE.Vector3, playerForward: THREE.Vector3, world: NovaPilotWorld): void {
    if (!this.enabled || delta <= 0) return;

    this.timeSeconds += delta;
    this.updatePulse(delta);
    this.desiredPosition.copy(
      getNovaPilotDesiredPosition(
        playerPosition,
        playerForward,
        world.highestSolidY(playerPosition.x, playerPosition.z),
        this.timeSeconds
      )
    );
    // The first pass uses the player's terrain column so Nova tracks the
    // player smoothly. This second, cheap column check keeps the actual orbit
    // point from clipping into a ridge beside the player.
    this.desiredPosition.y = Math.max(
      this.desiredPosition.y,
      world.highestSolidY(this.desiredPosition.x, this.desiredPosition.z) + NOVA_PILOT_GROUND_CLEARANCE
    );

    const blend = 1 - Math.exp(-NOVA_PILOT_STEERING_RESPONSE * delta);
    this.steering.copy(this.desiredPosition).sub(this.object.position);
    const targetVelocity = this.steering.clampLength(0, NOVA_PILOT_MAX_SPEED);
    this.velocity.lerp(targetVelocity, blend);
    this.object.position.addScaledVector(this.velocity, delta);

    // Aim slightly ahead of the player's view so my throws and facing read like
    // I am sharing attention with the player, not staring creepily at their back.
    this.aimDirection.copy(normalizeOrFallback(playerForward, fallbackForward));
    this.lookTarget
      .copy(playerPosition)
      .addScaledVector(this.aimDirection, 7)
      .addScaledVector(up, 0.4);
    this.object.lookAt(this.lookTarget);
    this.object.rotateZ(Math.sin(this.timeSeconds * 2.1) * 0.08);
  }

  createCoreLaunch(): NovaPilotCoreLaunch | null {
    if (!this.enabled) return null;
    return createNovaPilotCoreLaunch(this.object.position, this.aimDirection, this.velocity);
  }

  private updatePulse(delta: number): void {
    this.pulseStrength = Math.max(0, this.pulseStrength - delta * NOVA_PILOT_PULSE_DECAY);
    const easedPulse = this.pulseStrength * this.pulseStrength;
    this.glowMaterial.opacity = NOVA_PILOT_BASE_GLOW_OPACITY + easedPulse * 0.24;
    this.bodyMaterial.emissiveIntensity = 1 + easedPulse * 1.1;
    this.accentMaterial.emissiveIntensity = 1 + easedPulse * 0.85;
    this.object.scale.setScalar(1 + easedPulse * 0.08);
  }

  dispose(): void {
    this.bodyGeometry.dispose();
    this.glowGeometry.dispose();
    this.ringGeometry.dispose();
    this.noseGeometry.dispose();
    this.bodyMaterial.dispose();
    this.glowMaterial.dispose();
    this.accentMaterial.dispose();
  }
}

function flattenForward(forward: THREE.Vector3): THREE.Vector3 {
  return normalizeOrFallback(new THREE.Vector3(forward.x, 0, forward.z), fallbackForward);
}

function normalizeOrFallback(vector: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (vector.lengthSq() <= 0.000001) {
    return fallback.clone();
  }
  return vector.clone().normalize();
}
