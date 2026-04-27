import { METERS_PER_BLOCK } from "./voxelConstants";

export const PLAYER_HEIGHT = 1.8 * METERS_PER_BLOCK;
export const PLAYER_CROUCH_HEIGHT = 1.15 * METERS_PER_BLOCK;
export const PLAYER_RADIUS = 0.32 * METERS_PER_BLOCK;
export const LOOK_SENSITIVITY = 0.0022;

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
// and drag so it feels floaty without drifting forever.
export const FLIGHT_ACCELERATION = 56 * METERS_PER_BLOCK;
export const FLIGHT_DRAG = 7.5;

// A slide is deliberately a "carry sprint momentum" state, not a separate
// rocket boost. C primes it while sprinting, then releasing movement lets
// friction bleed that stored speed down.
export const SLIDE_PRIME_SPEED = PREVIOUS_SPRINT_SPEED * 0.9;
export const SLIDE_STOP_SPEED = WALK_SPEED * 0.55;
export const SLIDE_FRICTION = 1.45;

export type GroundMovementSpeedOptions = {
  readonly sprinting: boolean;
  readonly crouching: boolean;
  readonly sliding: boolean;
  readonly slidePrimed?: boolean;
};

export function getGroundMovementSpeed(options: GroundMovementSpeedOptions): number {
  if (options.sliding || options.slidePrimed) return SPRINT_SPEED;
  if (options.crouching) return CROUCH_SPEED;
  return options.sprinting ? SPRINT_SPEED : WALK_SPEED;
}

export function shouldPrimeSlide(
  grounded: boolean,
  crouching: boolean,
  sprinting: boolean,
  hasMovementInput: boolean,
  horizontalSpeed: number
): boolean {
  return (
    grounded &&
    crouching &&
    sprinting &&
    hasMovementInput &&
    horizontalSpeed >= SLIDE_PRIME_SPEED
  );
}

export function shouldContinueSlide(
  grounded: boolean,
  crouching: boolean,
  hasMovementInput: boolean,
  horizontalSpeed: number
): boolean {
  return grounded && crouching && !hasMovementInput && horizontalSpeed > SLIDE_STOP_SPEED;
}
