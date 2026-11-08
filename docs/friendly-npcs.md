# Friendly NPCs

The first NPC slice adds a small group of friendly wanderers near the player's
world-entry position. They stroll within a local home area, stop to idle, and
notice a nearby player. Approach an unobstructed wanderer and press `E` when
the greeting hint appears. Nova Pilot remains a separate companion system.

## Scope And Lifecycle

Mira, Bram, and Fern have distinct palettes and authored greetings. The
population is transient and bounded to three characters per visit; a sparse or
heavily edited entry area can have fewer when safe spawn positions are absent. A world
load or switch creates a fresh group after terrain and the saved player pose
are ready. Leaving the world clears them. NPC state is not saved in IndexedDB;
this introduces no migration or change to existing world data.

The simulation advances only during active play. Menus, hidden tabs, and idle
hibernation do not accumulate catch-up time. Rendering resources and the
interaction overlay have explicit runtime disposal.

These characters have no combat, damage, inventory, jobs, or quests. Greetings
are authored local text. They do not consume model tokens or require a server.
NPCs do not block the player or become targets for terrain-destruction tools.

## Navigation Contract

[friendlyNpcNavigation.ts](../src/friendlyNpcNavigation.ts) consumes
`CollisionWorld` plus a loaded-column predicate. It queries bounded nearby
cells and surviving partial-block collision boxes. It never generates chunks,
uses imaginary ground below the world, or treats missing terrain as clear air.
Full-body clearance and several footprint support samples keep both feet and
head out of terrain.

Movement uses small swept steps with a one-third-block step limit and a bounded
drop allowance. Unsupported ground, excessive ledges, obstacles, and unloaded
columns reject the move. Roaming chooses and rechecks short local routes; it
does not promise a route around every obstacle or across disconnected islands.
Edits are queried again during play, including when a character is idle. If
support disappears or a placed block intersects someone, the character hides
and retries a nearby safe position. This first slice does not simulate falling.

[friendlyNpcs.ts](../src/friendlyNpcs.ts) owns stable roster definitions and
the per-visit simulation. [friendlyNpcController.ts](../src/friendlyNpcController.ts)
owns meshes, name labels, animation, and the dialogue overlay, styled by
[friendlyNpcs.css](../src/friendlyNpcs.css). Keep NPC decisions out of the world,
player, worker, and debris owners. [main.ts](../src/main.ts) provides the actual loaded terrain
adapter and owns entry, update, input, exit, and runtime teardown.

## Verification

Run the focused NPC contracts with `npm.cmd run test:npcs`, plus typechecking.
Use the [testing map](testing.md) to select affected collision/world consumers.
The [Codex Pilot bridge](automation.md#codex-pilot-bridge) exposes NPC snapshots
and explicit fixture controls for browser playtests.

A relevant browser pass covers visible spawn, walking and facing, the `E` hint
and greeting, pause/resume, world switching, and clearing the population. Use
Chrome to verify the real pointer-lock input path. Unit tests cover bounded
navigation, partial boxes, missing chunks, terrain edits, perception, and
lifecycle state; they do not establish long-session population balance or
general navigation through arbitrary player-built mazes.
