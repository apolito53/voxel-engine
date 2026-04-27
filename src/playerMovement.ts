import { METERS_PER_BLOCK } from "./voxelConstants";

export const PLAYER_HEIGHT = 1.8 * METERS_PER_BLOCK;
export const PLAYER_CROUCH_HEIGHT = 1.15 * METERS_PER_BLOCK;
export const PLAYER_RADIUS = 0.32 * METERS_PER_BLOCK;
export const LOOK_SENSITIVITY = 0.0022;
export const CROUCH_VIEW_DROP = PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;
export const CROUCH_VIEW_RESPONSE = 18;

export const WALK_SPEED = 5.4 * METERS_PER_BLOCK;
export const PREVIOUS_SPRINT_SPEED = 8.5 * METERS_PER_BLOCK;
export const SPRINT_SPEED = PREVIOUS_SPRINT_SPEED * 1.5;
export const CROUCH_SPEED = WALK_SPEED * 0.48;
export const AIR_SPEED_LIMIT = SPRINT_SPEED;
export const GROUND_ACCELERATION = 96 * METERS_PER_BLOCK;
export const AIR_ACCELERATION = 15 * METERS_PER_BLOCK;
export const GROUND_FRICTION = 12;
export const AIR_DRAG = 0.08;
export const GRAVITY = 22 * METERS_PER_BLOCK;
export const JUMP_SPEED = 8.2 * METERS_PER_BLOCK;

export const FLIGHT_TOGGLE_KEY = "KeyF";
export const CROUCH_OR_DESCEND_KEY = "KeyC";
// Flight uses the same speed tiers as walking, but gets its own acceleration
// and drag so it feels floaty without drifting forever. Boosted flight needs
// extra acceleration too; otherwise drag keeps it far below its speed cap.
export const FLIGHT_BOOST_SPEED = SPRINT_SPEED * 2;
export const FLIGHT_ACCELERATION = 56 * METERS_PER_BLOCK;
export const FLIGHT_BOOST_ACCELERATION = FLIGHT_ACCELERATION * 4;
export const FLIGHT_DRAG = 7.5;

// A slide is deliberately a "carry sprint momentum" state, not a separate
// rocket boost. Entering crouch while sprinting commits to a short forced
// crouch, then friction bleeds the stored speed down to normal crouch pace.
export const SLIDE_PRIME_SPEED = PREVIOUS_SPRINT_SPEED * 0.9;
export const SLIDE_END_SPEED = CROUCH_SPEED;
export const SLIDE_MIN_DURATION = 1;
export const SLIDE_FORWARD_FRICTION = 0.95;
export const SLIDE_RELEASE_FRICTION = 2.25;

export type GroundMovementSpeedOptions = {
  readonly sprinting: boolean;
  readonly crouching: boolean;
  readonly sliding: boolean;
};

export function getGroundMovementSpeed(options: GroundMovementSpeedOptions): number {
  if (options.sliding) return SPRINT_SPEED;
  if (options.crouching) return CROUCH_SPEED;
  return options.sprinting ? SPRINT_SPEED : WALK_SPEED;
}

export function getAirMovementSpeed(): number {
  // Ordinary jumps get gentle air control, not the flight boost path. Sprint
  // momentum can still carry through the jump via AIR_SPEED_LIMIT, but holding
  // Shift mid-air should not keep accelerating the player like flight mode.
  return WALK_SPEED;
}

export function getFlightMovementSpeed(sprinting: boolean): number {
  return sprinting ? FLIGHT_BOOST_SPEED : WALK_SPEED;
}

export function getFlightMovementAcceleration(sprinting: boolean): number {
  return sprinting ? FLIGHT_BOOST_ACCELERATION : FLIGHT_ACCELERATION;
}

export function getCrouchViewTargetOffset(crouching: boolean): number {
  return crouching ? CROUCH_VIEW_DROP : 0;
}

export function smoothCrouchViewOffset(currentOffset: number, targetOffset: number, delta: number): number {
  if (delta <= 0 || currentOffset === targetOffset) return currentOffset;

  const blend = 1 - Math.exp(-CROUCH_VIEW_RESPONSE * delta);
  const nextOffset = currentOffset + (targetOffset - currentOffset) * blend;
  return Math.abs(targetOffset - nextOffset) < 0.0005 ? targetOffset : nextOffset;
}

export function shouldStartSlide(
  grounded: boolean,
  justStartedCrouching: boolean,
  sprinting: boolean,
  holdingForward: boolean,
  horizontalSpeed: number
): boolean {
  return (
    grounded &&
    justStartedCrouching &&
    sprinting &&
    holdingForward &&
    horizontalSpeed >= SLIDE_PRIME_SPEED
  );
}

export function shouldStartLandingSlide(
  landed: boolean,
  crouching: boolean,
  horizontalSpeed: number
): boolean {
  return landed && crouching && horizontalSpeed >= SLIDE_PRIME_SPEED;
}

export function shouldContinueSlide(
  grounded: boolean,
  elapsed: number,
  horizontalSpeed: number
): boolean {
  return grounded && (elapsed < SLIDE_MIN_DURATION || horizontalSpeed > SLIDE_END_SPEED);
}

export function getSlideFriction(holdingForward: boolean): number {
  return holdingForward ? SLIDE_FORWARD_FRICTION : SLIDE_RELEASE_FRICTION;
}

export function getSlideSpeedLimit(entryHorizontalSpeed: number): number {
  return Math.max(SPRINT_SPEED, entryHorizontalSpeed);
}

export function isSlideMinimumLocked(elapsed: number): boolean {
  return elapsed < SLIDE_MIN_DURATION;
}

export function shouldPreserveSlideJumpMomentum(
  wasSliding: boolean,
  jumpedFromGround: boolean
): boolean {
  return wasSliding && jumpedFromGround;
}
