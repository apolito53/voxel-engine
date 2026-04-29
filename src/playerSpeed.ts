export type PlayerVelocitySample = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export function getPlayerSpeedMetersPerSecond(velocity: PlayerVelocitySample): number {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  return Number.isFinite(speed) ? speed : 0;
}

export function formatPlayerSpeedMetersPerSecond(velocity: PlayerVelocitySample): string {
  return `${getPlayerSpeedMetersPerSecond(velocity).toFixed(1)} m/s`;
}
