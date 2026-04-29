import type { SavedWorld } from "./chunkStorage";

export function createDeleteWorldDialogCopy(world: SavedWorld): string {
  return [
    `Are you SURE you want to delete "${world.name}"?`,
    "This permanently removes the saved world and every edited chunk stored in this browser.",
    "This cannot be undone."
  ].join(" ");
}
