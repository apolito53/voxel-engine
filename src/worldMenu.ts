import type { SavedWorld, WorldRegistry } from "./chunkStorage";
import type { TerrainProfile } from "./terrain";

export type LoadWorldHandler = (worldId: string) => void | Promise<void>;
export type DeleteWorldHandler = (world: SavedWorld) => void | Promise<void>;
export type RenderHomeWorldListOptions = {
  readonly shouldCommit?: () => boolean;
};

export async function renderHomeWorldList(
  registry: WorldRegistry,
  container: HTMLElement,
  onLoadWorld: LoadWorldHandler,
  onDeleteWorld?: DeleteWorldHandler,
  options: RenderHomeWorldListOptions = {}
): Promise<void> {
  const activeWorldId = await registry.getActiveWorldId();
  const worlds = await registry.listWorlds();
  if (options.shouldCommit && !options.shouldCommit()) return;

  // Rebuild visible save rows from registry metadata so storage remains the single source of truth.
  container.replaceChildren(
    ...worlds.map((savedWorld) => {
      const row = document.createElement("div");
      const button = document.createElement("button");
      const isActive = savedWorld.id === activeWorldId;
      row.className = "world-slot-row";
      button.type = "button";
      button.className = `world-slot${isActive ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", String(isActive));
      button.addEventListener("click", () => {
        void onLoadWorld(savedWorld.id);
      });
      button.append(
        createWorldSlotLine("world-slot-name", savedWorld.name),
        createWorldSlotLine("world-slot-meta", formatWorldMeta(savedWorld, isActive)),
        createWorldSlotLine("world-slot-seed", `Seed: ${savedWorld.seed || "classic"} | Terrain: ${formatTerrainProfile(savedWorld.terrainProfile)}`)
      );
      row.append(button);

      if (onDeleteWorld) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "world-delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete ${savedWorld.name}`);
        deleteButton.addEventListener("click", () => {
          void onDeleteWorld(savedWorld);
        });
        row.append(deleteButton);
      }

      return row;
    })
  );
}

export function createReadableSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createWorldSlotLine(className: string, text: string): HTMLSpanElement {
  const line = document.createElement("span");
  line.className = className;
  line.textContent = text;
  return line;
}

function formatWorldMeta(savedWorld: SavedWorld, isActive: boolean): string {
  // The date is intentionally compact so long world names still fit in the pause menu.
  const date = savedWorld.updatedAt
    ? new Date(savedWorld.updatedAt).toLocaleDateString()
    : "new";
  return `${isActive ? "Current" : "Saved"} - ${date}`;
}

function formatTerrainProfile(profile: TerrainProfile): string {
  if (profile === "floating-islands") return "Floating Islands";
  if (profile === "varied") return "Varied";
  return "Classic";
}
