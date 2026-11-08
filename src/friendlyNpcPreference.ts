export const FRIENDLY_NPC_PREFERENCE_KEY = "voxel-sandbox-friendly-npcs-enabled";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readFriendlyNpcPreference(storage?: PreferenceStorage): boolean {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(FRIENDLY_NPC_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeFriendlyNpcPreference(enabled: boolean, storage?: PreferenceStorage): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(FRIENDLY_NPC_PREFERENCE_KEY, String(enabled));
  } catch {
    // The experiment remains usable for this session when preferences cannot save.
  }
}
