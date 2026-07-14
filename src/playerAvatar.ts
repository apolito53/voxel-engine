import * as THREE from "three";
import {
  FLIGHT_BOOST_SPEED,
  PLAYER_HEIGHT,
  SPRINT_SPEED,
  WALK_SPEED
} from "./playerMovement";

const AVATAR_WALK_RESPONSE = 14;
const AVATAR_POSE_RESPONSE = 12;
const AVATAR_IDLE_BREATH_SPEED = 1.8;
const AVATAR_MAX_STRIDE_RADIANS = 0.72;
const AVATAR_FLIGHT_PIVOT_HEIGHT_METERS = PLAYER_HEIGHT * 0.58;
const AVATAR_FLIGHT_TILT_RESPONSE = 7;
const AVATAR_FLIGHT_BOOST_TILT_RESPONSE = 9;
const AVATAR_FLIGHT_RECOVERY_RESPONSE = 11;
const AVATAR_FLIGHT_TILT_EPSILON = 0.000001;
const AVATAR_LOCAL_UP = new THREE.Vector3(0, 1, 0);

export const AVATAR_BASE_FLIGHT_TILT_RADIANS = THREE.MathUtils.degToRad(16);
export const AVATAR_BOOST_FLIGHT_TILT_RADIANS = THREE.MathUtils.degToRad(72);

export type PlayerAvatarFrame = {
  readonly eyePosition: THREE.Vector3;
  readonly feetY: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly velocity: THREE.Vector3;
  readonly onGround: boolean;
  readonly crouching: boolean;
  readonly sliding: boolean;
  readonly flying: boolean;
};

type AvatarLeg = {
  readonly hip: THREE.Group;
  readonly knee: THREE.Group;
};

/**
 * First player-body pass for the v0.19 camera/flight line.
 *
 * The shape is deliberately authored from small reusable Three primitives so
 * it remains lightweight, inspectable, and easy to replace with a skinned model
 * later. Its compact back rig and emissive nozzles establish a visual language
 * for the upcoming physical flight mechanic without making that mechanic part
 * of this camera prerequisite.
 */
export class PlayerAvatar {
  readonly object = new THREE.Group();

  private readonly flightPivot = new THREE.Group();
  private readonly poseRoot = new THREE.Group();
  private readonly upperBody = new THREE.Group();
  private readonly helmet = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg: AvatarLeg;
  private readonly rightLeg: AvatarLeg;
  private readonly thrusterGlowMaterial: THREE.MeshStandardMaterial;
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  private readonly facingForward = new THREE.Vector3();
  private readonly facingRight = new THREE.Vector3();
  private readonly flightTiltDirection = new THREE.Vector3();
  private readonly flightTiltTarget = new THREE.Quaternion();
  private walkCycle = 0;
  private visible = false;

  constructor() {
    this.object.name = "PlayerAvatar";
    this.object.visible = false;
    // Rotate flight around the body's center instead of its feet. Keeping the
    // authored pose root offset beneath this pivot preserves the exact grounded
    // coordinates while allowing the whole silhouette to approach horizontal.
    this.flightPivot.name = "AvatarFlightPivot";
    this.flightPivot.position.y = AVATAR_FLIGHT_PIVOT_HEIGHT_METERS;
    this.object.add(this.flightPivot);
    this.poseRoot.position.y = -AVATAR_FLIGHT_PIVOT_HEIGHT_METERS;
    this.flightPivot.add(this.poseRoot);
    this.poseRoot.add(this.upperBody);

    const suitMaterial = this.createMaterial({
      color: 0x202a31,
      roughness: 0.78,
      metalness: 0.12
    });
    const armorMaterial = this.createMaterial({
      color: 0xd6dde0,
      roughness: 0.52,
      metalness: 0.28
    });
    const jointMaterial = this.createMaterial({
      color: 0x0e1519,
      roughness: 0.86,
      metalness: 0.16
    });
    const visorMaterial = this.createMaterial({
      color: 0xffc65a,
      emissive: 0x9b4a08,
      emissiveIntensity: 1.25,
      roughness: 0.24,
      metalness: 0.42
    });
    const accentMaterial = this.createMaterial({
      color: 0x38c8b2,
      emissive: 0x0a5f59,
      emissiveIntensity: 0.82,
      roughness: 0.36,
      metalness: 0.34
    });
    this.thrusterGlowMaterial = this.createMaterial({
      color: 0x73ead7,
      emissive: 0x1ba897,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.4
    });

    const torsoGeometry = this.ownGeometry(new THREE.CapsuleGeometry(0.23, 0.34, 4, 8));
    const chestPlateGeometry = this.ownGeometry(new THREE.BoxGeometry(0.43, 0.34, 0.08));
    const pelvisGeometry = this.ownGeometry(new THREE.BoxGeometry(0.42, 0.2, 0.27));
    const helmetGeometry = this.ownGeometry(new THREE.SphereGeometry(0.22, 10, 7));
    const visorGeometry = this.ownGeometry(new THREE.BoxGeometry(0.32, 0.12, 0.035));
    const neckGeometry = this.ownGeometry(new THREE.CylinderGeometry(0.1, 0.11, 0.13, 8));
    const armGeometry = this.ownGeometry(new THREE.CapsuleGeometry(0.075, 0.34, 3, 7));
    const handGeometry = this.ownGeometry(new THREE.SphereGeometry(0.085, 7, 5));
    const upperLegGeometry = this.ownGeometry(new THREE.CapsuleGeometry(0.09, 0.18, 3, 7));
    const lowerLegGeometry = this.ownGeometry(new THREE.CapsuleGeometry(0.085, 0.2, 3, 7));
    const bootGeometry = this.ownGeometry(new THREE.BoxGeometry(0.19, 0.14, 0.31));
    const harnessGeometry = this.ownGeometry(new THREE.BoxGeometry(0.38, 0.46, 0.13));
    const harnessPlateGeometry = this.ownGeometry(new THREE.BoxGeometry(0.22, 0.29, 0.035));
    const harnessSpineGeometry = this.ownGeometry(new THREE.BoxGeometry(0.052, 0.18, 0.025));
    const harnessBeaconGeometry = this.ownGeometry(new THREE.SphereGeometry(0.035, 7, 5));
    const thrusterGeometry = this.ownGeometry(new THREE.CylinderGeometry(0.08, 0.105, 0.42, 8));
    const nozzleGeometry = this.ownGeometry(new THREE.CylinderGeometry(0.105, 0.075, 0.11, 8));
    const glowRingGeometry = this.ownGeometry(new THREE.TorusGeometry(0.078, 0.018, 5, 10));
    const shoulderGeometry = this.ownGeometry(new THREE.BoxGeometry(0.17, 0.15, 0.25));
    const chestAccentGeometry = this.ownGeometry(new THREE.BoxGeometry(0.12, 0.045, 0.025));

    const torso = this.createMesh(torsoGeometry, suitMaterial, "Torso");
    torso.position.y = 1.15;
    torso.scale.set(1.08, 1, 0.82);
    this.upperBody.add(torso);

    const chestPlate = this.createMesh(chestPlateGeometry, armorMaterial, "ChestPlate");
    chestPlate.position.set(0, 1.23, -0.205);
    this.upperBody.add(chestPlate);

    const chestAccent = this.createMesh(chestAccentGeometry, accentMaterial, "ChestBeacon");
    chestAccent.position.set(0.105, 1.28, -0.26);
    this.upperBody.add(chestAccent);

    const pelvis = this.createMesh(pelvisGeometry, armorMaterial, "PelvisArmor");
    pelvis.position.y = 0.76;
    this.poseRoot.add(pelvis);

    const neck = this.createMesh(neckGeometry, jointMaterial, "NeckJoint");
    neck.position.y = 1.45;
    this.upperBody.add(neck);

    this.helmet.name = "HelmetRig";
    this.helmet.position.y = 1.61;
    this.upperBody.add(this.helmet);

    const helmetShell = this.createMesh(helmetGeometry, armorMaterial, "HelmetShell");
    helmetShell.scale.set(1, 0.95, 0.9);
    this.helmet.add(helmetShell);

    const visor = this.createMesh(visorGeometry, visorMaterial, "AmberVisor");
    visor.position.set(0, 0.005, -0.205);
    visor.rotation.x = -0.08;
    this.helmet.add(visor);

    const leftHelmetAccent = this.createMesh(chestAccentGeometry, accentMaterial, "LeftHelmetAccent");
    leftHelmetAccent.position.set(-0.205, -0.015, 0.015);
    leftHelmetAccent.rotation.y = Math.PI / 2;
    this.helmet.add(leftHelmetAccent);

    const rightHelmetAccent = leftHelmetAccent.clone();
    rightHelmetAccent.name = "RightHelmetAccent";
    rightHelmetAccent.position.x = 0.205;
    this.helmet.add(rightHelmetAccent);

    this.leftArm = this.createArm(
      "LeftArm",
      -0.31,
      armGeometry,
      handGeometry,
      shoulderGeometry,
      suitMaterial,
      armorMaterial,
      jointMaterial
    );
    this.rightArm = this.createArm(
      "RightArm",
      0.31,
      armGeometry,
      handGeometry,
      shoulderGeometry,
      suitMaterial,
      armorMaterial,
      jointMaterial
    );
    this.upperBody.add(this.leftArm, this.rightArm);

    this.leftLeg = this.createLeg(
      "LeftLeg",
      -0.145,
      upperLegGeometry,
      lowerLegGeometry,
      bootGeometry,
      suitMaterial,
      armorMaterial,
      jointMaterial
    );
    this.rightLeg = this.createLeg(
      "RightLeg",
      0.145,
      upperLegGeometry,
      lowerLegGeometry,
      bootGeometry,
      suitMaterial,
      armorMaterial,
      jointMaterial
    );
    this.poseRoot.add(this.leftLeg.hip, this.rightLeg.hip);

    const harness = this.createMesh(harnessGeometry, jointMaterial, "FlightHarness");
    harness.position.set(0, 1.18, 0.23);
    this.upperBody.add(harness);

    // Third-person spends most of its time looking at the back rig, so give it
    // a readable service panel and power spine instead of leaving one broad
    // dark rectangle between the thrusters.
    const harnessPlate = this.createMesh(harnessPlateGeometry, armorMaterial, "HarnessServicePlate");
    harnessPlate.position.set(0, 1.2, 0.314);
    this.upperBody.add(harnessPlate);

    const harnessSpine = this.createMesh(harnessSpineGeometry, accentMaterial, "HarnessPowerSpine");
    harnessSpine.position.set(0, 1.17, 0.344);
    this.upperBody.add(harnessSpine);

    const harnessBeacon = this.createMesh(harnessBeaconGeometry, visorMaterial, "HarnessStatusBeacon");
    harnessBeacon.position.set(0, 1.34, 0.345);
    this.upperBody.add(harnessBeacon);

    for (const side of [-1, 1] as const) {
      const thruster = this.createMesh(thrusterGeometry, armorMaterial, `${side < 0 ? "Left" : "Right"}Thruster`);
      thruster.position.set(side * 0.21, 1.08, 0.31);
      this.upperBody.add(thruster);

      const nozzle = this.createMesh(nozzleGeometry, jointMaterial, `${side < 0 ? "Left" : "Right"}Nozzle`);
      nozzle.position.set(side * 0.21, 0.815, 0.31);
      this.upperBody.add(nozzle);

      const glowRing = this.createMesh(
        glowRingGeometry,
        this.thrusterGlowMaterial,
        `${side < 0 ? "Left" : "Right"}ThrusterGlow`
      );
      glowRing.position.set(side * 0.21, 0.755, 0.31);
      glowRing.rotation.x = Math.PI / 2;
      this.upperBody.add(glowRing);
    }

    // The authored body is 1.78m tall, just under the 1.8m player collision
    // hull. That small margin keeps the visual helmet out of low ceilings that
    // the physical player is still legally allowed to stand beneath.
    this.object.scale.setScalar(PLAYER_HEIGHT / 1.8);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object.visible = visible;
  }

  /**
   * Returns the current animated right-hand center in world space. Third-person
   * tools can use this as a visible muzzle while leaving reticle aim and hit
   * tests anchored to the authoritative player-eye camera.
   */
  getRightHandWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return this.rightArm.localToWorld(target.set(0, -0.55, 0));
  }

  update(deltaSeconds: number, frame: PlayerAvatarFrame): void {
    if (!this.visible) return;

    this.object.position.set(frame.eyePosition.x, frame.feetY, frame.eyePosition.z);
    this.object.rotation.y = frame.yaw;

    const horizontalSpeed = Math.hypot(frame.velocity.x, frame.velocity.z);
    const movingOnGround = frame.onGround && horizontalSpeed > 0.08 && !frame.sliding;
    const locomotionStrength = movingOnGround
      ? THREE.MathUtils.clamp(horizontalSpeed / WALK_SPEED, 0, 1.2)
      : 0;
    const cycleSpeed = movingOnGround ? 4.6 + horizontalSpeed * 1.15 : AVATAR_IDLE_BREATH_SPEED;
    this.walkCycle += deltaSeconds * cycleSpeed;

    const stride = Math.sin(this.walkCycle) * AVATAR_MAX_STRIDE_RADIANS * locomotionStrength;
    const breathing = Math.sin(this.walkCycle) * 0.008;
    const crouchStrength = frame.crouching ? 1 : 0;
    const slideStrength = frame.sliding ? 1 : 0;
    const flightStrength = frame.flying ? 1 : 0;

    // Reuse both basis vectors; pose mirroring runs every active frame and
    // should not create a steady stream of short-lived garbage collections.
    this.facingForward.set(-Math.sin(frame.yaw), 0, -Math.cos(frame.yaw));
    this.facingRight.set(Math.cos(frame.yaw), 0, -Math.sin(frame.yaw));
    const forwardSpeed = frame.velocity.dot(this.facingForward);
    const lateralSpeed = frame.velocity.dot(this.facingRight);
    this.updateFlightTilt(deltaSeconds, frame.flying, horizontalSpeed, forwardSpeed, lateralSpeed);

    // Grounded torso lean stays independent from full-body flight orientation.
    // Mixing both would double the pitch and make boosted flight look folded.
    const groundPoseStrength = frame.flying ? 0 : 1;
    const motionLean = THREE.MathUtils.clamp(forwardSpeed / SPRINT_SPEED, -1, 1) * -0.16 * groundPoseStrength;
    const lateralLean = THREE.MathUtils.clamp(lateralSpeed / SPRINT_SPEED, -1, 1) * -0.12 * groundPoseStrength;

    const bodyDrop = crouchStrength * 0.24 + slideStrength * 0.08;
    const bodyPitch = motionLean - slideStrength * 0.34;
    this.upperBody.position.y = damp(this.upperBody.position.y, -bodyDrop + breathing, AVATAR_POSE_RESPONSE, deltaSeconds);
    this.upperBody.rotation.x = damp(this.upperBody.rotation.x, bodyPitch, AVATAR_POSE_RESPONSE, deltaSeconds);
    this.upperBody.rotation.z = damp(this.upperBody.rotation.z, lateralLean, AVATAR_POSE_RESPONSE, deltaSeconds);

    const leftHipTarget = stride + crouchStrength * 0.48 + slideStrength * 0.7 - flightStrength * 0.14;
    const rightHipTarget = -stride + crouchStrength * 0.48 + slideStrength * 0.62 - flightStrength * 0.14;
    const kneeTarget = -crouchStrength * 0.92 - slideStrength * 0.48 + flightStrength * 0.16;
    this.leftLeg.hip.rotation.x = damp(this.leftLeg.hip.rotation.x, leftHipTarget, AVATAR_WALK_RESPONSE, deltaSeconds);
    this.rightLeg.hip.rotation.x = damp(this.rightLeg.hip.rotation.x, rightHipTarget, AVATAR_WALK_RESPONSE, deltaSeconds);
    this.leftLeg.knee.rotation.x = damp(this.leftLeg.knee.rotation.x, kneeTarget, AVATAR_POSE_RESPONSE, deltaSeconds);
    this.rightLeg.knee.rotation.x = damp(this.rightLeg.knee.rotation.x, kneeTarget, AVATAR_POSE_RESPONSE, deltaSeconds);

    const armSweep = flightStrength * -0.5 + slideStrength * -0.28;
    this.leftArm.rotation.x = damp(
      this.leftArm.rotation.x,
      -stride * 0.72 + armSweep,
      AVATAR_WALK_RESPONSE,
      deltaSeconds
    );
    this.rightArm.rotation.x = damp(
      this.rightArm.rotation.x,
      stride * 0.72 + armSweep,
      AVATAR_WALK_RESPONSE,
      deltaSeconds
    );

    this.helmet.rotation.x = damp(
      this.helmet.rotation.x,
      THREE.MathUtils.clamp(frame.pitch * 0.55, -0.62, 0.62),
      AVATAR_POSE_RESPONSE,
      deltaSeconds
    );

    const groundedBob = movingOnGround ? Math.abs(Math.sin(this.walkCycle * 2)) * 0.025 * locomotionStrength : 0;
    this.poseRoot.position.y = damp(
      this.poseRoot.position.y,
      -AVATAR_FLIGHT_PIVOT_HEIGHT_METERS + groundedBob,
      AVATAR_WALK_RESPONSE,
      deltaSeconds
    );
    this.thrusterGlowMaterial.emissiveIntensity = damp(
      this.thrusterGlowMaterial.emissiveIntensity,
      frame.flying ? 2.2 : 0.35,
      frame.flying ? 18 : 6,
      deltaSeconds
    );
  }

  private updateFlightTilt(
    deltaSeconds: number,
    flying: boolean,
    horizontalSpeed: number,
    forwardSpeed: number,
    lateralSpeed: number
  ): void {
    const tiltRadians = getAvatarFlightTiltRadians(horizontalSpeed, flying);
    if (tiltRadians <= AVATAR_FLIGHT_TILT_EPSILON || horizontalSpeed <= AVATAR_FLIGHT_TILT_EPSILON) {
      this.flightTiltTarget.identity();
    } else {
      const inverseHorizontalSpeed = 1 / horizontalSpeed;
      const sinTilt = Math.sin(tiltRadians);

      // Build the desired body-up axis in avatar-local space. Forward is -Z,
      // right is +X, so this works for backward, strafe, and diagonal velocity
      // just as naturally as the ordinary forward-flight case.
      this.flightTiltDirection.set(
        lateralSpeed * inverseHorizontalSpeed * sinTilt,
        Math.cos(tiltRadians),
        -forwardSpeed * inverseHorizontalSpeed * sinTilt
      ).normalize();
      this.flightTiltTarget.setFromUnitVectors(AVATAR_LOCAL_UP, this.flightTiltDirection);
    }

    const boostBlend = THREE.MathUtils.clamp(
      (tiltRadians - AVATAR_BASE_FLIGHT_TILT_RADIANS) /
        (AVATAR_BOOST_FLIGHT_TILT_RADIANS - AVATAR_BASE_FLIGHT_TILT_RADIANS),
      0,
      1
    );
    const response = flying
      ? THREE.MathUtils.lerp(AVATAR_FLIGHT_TILT_RESPONSE, AVATAR_FLIGHT_BOOST_TILT_RESPONSE, boostBlend)
      : AVATAR_FLIGHT_RECOVERY_RESPONSE;
    dampQuaternion(this.flightPivot.quaternion, this.flightTiltTarget, response, deltaSeconds);
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
  }

  private createArm(
    name: string,
    x: number,
    armGeometry: THREE.BufferGeometry,
    handGeometry: THREE.BufferGeometry,
    shoulderGeometry: THREE.BufferGeometry,
    suitMaterial: THREE.Material,
    armorMaterial: THREE.Material,
    jointMaterial: THREE.Material
  ): THREE.Group {
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(x, 1.4, 0);

    const shoulder = this.createMesh(shoulderGeometry, armorMaterial, `${name}Shoulder`);
    shoulder.position.y = -0.02;
    arm.add(shoulder);

    const sleeve = this.createMesh(armGeometry, suitMaterial, `${name}Sleeve`);
    sleeve.position.y = -0.28;
    arm.add(sleeve);

    const hand = this.createMesh(handGeometry, jointMaterial, `${name}Hand`);
    hand.position.y = -0.55;
    arm.add(hand);
    return arm;
  }

  private createLeg(
    name: string,
    x: number,
    upperLegGeometry: THREE.BufferGeometry,
    lowerLegGeometry: THREE.BufferGeometry,
    bootGeometry: THREE.BufferGeometry,
    suitMaterial: THREE.Material,
    armorMaterial: THREE.Material,
    jointMaterial: THREE.Material
  ): AvatarLeg {
    const hip = new THREE.Group();
    hip.name = `${name}Hip`;
    hip.position.set(x, 0.75, 0);

    const upperLeg = this.createMesh(upperLegGeometry, suitMaterial, `${name}Upper`);
    upperLeg.position.y = -0.17;
    hip.add(upperLeg);

    const knee = new THREE.Group();
    knee.name = `${name}Knee`;
    knee.position.y = -0.34;
    hip.add(knee);

    const kneeJoint = this.createMesh(
      this.ownGeometry(new THREE.SphereGeometry(0.092, 7, 5)),
      jointMaterial,
      `${name}KneeJoint`
    );
    knee.add(kneeJoint);

    const lowerLeg = this.createMesh(lowerLegGeometry, armorMaterial, `${name}Lower`);
    lowerLeg.position.y = -0.18;
    knee.add(lowerLeg);

    const boot = this.createMesh(bootGeometry, jointMaterial, `${name}Boot`);
    boot.position.set(0, -0.39, -0.055);
    knee.add(boot);
    return { hip, knee };
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private ownGeometry<TGeometry extends THREE.BufferGeometry>(geometry: TGeometry): TGeometry {
    this.ownedGeometries.add(geometry);
    return geometry;
  }

  private createMaterial(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      ...parameters,
      flatShading: true
    });
    this.ownedMaterials.add(material);
    return material;
  }
}

/**
 * Maps actual horizontal flight speed onto the authored presentation range.
 * Base flight reaches a restrained lean; speed carried into the boost band
 * progressively lays the body down without ever reaching a brittle 90 degrees.
 */
export function getAvatarFlightTiltRadians(horizontalSpeed: number, flying: boolean): number {
  if (!flying) return 0;

  const safeSpeed = Number.isFinite(horizontalSpeed) ? Math.max(0, horizontalSpeed) : 0;
  const baseBlend = THREE.MathUtils.smoothstep(safeSpeed, 0, WALK_SPEED);
  const boostBlend = THREE.MathUtils.smoothstep(safeSpeed, WALK_SPEED, FLIGHT_BOOST_SPEED);
  return THREE.MathUtils.clamp(
    AVATAR_BASE_FLIGHT_TILT_RADIANS * baseBlend +
      (AVATAR_BOOST_FLIGHT_TILT_RADIANS - AVATAR_BASE_FLIGHT_TILT_RADIANS) * boostBlend,
    0,
    AVATAR_BOOST_FLIGHT_TILT_RADIANS
  );
}

function damp(current: number, target: number, response: number, deltaSeconds: number): number {
  if (deltaSeconds <= 0 || current === target) return current;
  const blend = 1 - Math.exp(-response * deltaSeconds);
  return current + (target - current) * blend;
}

function dampQuaternion(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  response: number,
  deltaSeconds: number
): void {
  if (deltaSeconds <= 0 || current.equals(target)) return;
  const blend = 1 - Math.exp(-response * deltaSeconds);
  current.slerp(target, blend).normalize();
}
