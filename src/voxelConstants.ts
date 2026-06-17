export const METERS_PER_BLOCK = 1;
export const CHUNK_SIZE = 16;
export const LEGACY_WORLD_HEIGHT = 48;
export const WORLD_HEIGHT = LEGACY_WORLD_HEIGHT * 2;

// New varied terrain is lifted into the 96m world so the extra height becomes
// both deeper underground material and useful build headroom, not just empty sky.
export const EXPANDED_TERRAIN_SURFACE_OFFSET = Math.floor((LEGACY_WORLD_HEIGHT * 2) / 3);
