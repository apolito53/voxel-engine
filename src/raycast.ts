export function voxelRaycast(world, origin, direction, maxDistance = 8) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = direction.x > 0 ? 1 : -1;
  const stepY = direction.y > 0 ? 1 : -1;
  const stepZ = direction.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / (direction.x || 0.000001));
  const tDeltaY = Math.abs(1 / (direction.y || 0.000001));
  const tDeltaZ = Math.abs(1 / (direction.z || 0.000001));

  let tMaxX = intBound(origin.x, direction.x);
  let tMaxY = intBound(origin.y, direction.y);
  let tMaxZ = intBound(origin.z, direction.z);
  let face = { x: 0, y: 0, z: 0 };

  for (let distance = 0; distance <= maxDistance; ) {
    if (world.isSolid(x, y, z)) {
      return { block: { x, y, z }, normal: face, distance };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
        face = { x: -stepX, y: 0, z: 0 };
      } else {
        z += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        face = { x: 0, y: 0, z: -stepZ };
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      distance = tMaxY;
      tMaxY += tDeltaY;
      face = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      distance = tMaxZ;
      tMaxZ += tDeltaZ;
      face = { x: 0, y: 0, z: -stepZ };
    }
  }

  return null;
}

function intBound(value, direction) {
  if (direction === 0) return Number.POSITIVE_INFINITY;
  const next = direction > 0 ? Math.ceil(value) : Math.floor(value);
  return (next - value) / direction;
}
