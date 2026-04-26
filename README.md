# Voxel Sandbox Engine

A tiny browser-based voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, block edits, and simple physics toys.

World units are metric: `1 block = 1 meter`.

Edited chunks persist in IndexedDB browser storage. Clear this site's browser data to reset saved worlds.
The home screen creates and loads local saved worlds. New worlds store a name and seed.

## Run

Windows:

```powershell
.\start.ps1
```

Linux/Ubuntu:

```bash
chmod +x ./start.sh
./start.sh
```

Open `http://127.0.0.1:5173`.

Pass a different port as the first argument, for example `.\start.ps1 5174` or `./start.sh 5174`.

## Controls

- `WASD` move
- Home screen creates or loads a world
- `Resume` captures mouse after pausing
- `Exit to Home` returns to the world list; switch worlds from there
- `Mouse` look while playing
- `Space` jump
- `Shift` sprint
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` throw a physics core
- `F3` toggle debug overlay
- `F4` cycle quality: Potato, Low, Normal, High, Ultra
- `Esc` pause and release mouse

## Quality Presets

- `Potato`: 0.5x render distance, no shadows
- `Low`: current low-end baseline, no shadows
- `Normal`: 2x render distance, shadows
- `High`: 4x render distance, shadows
- `Ultra`: 6x render distance, higher shadow resolution

## Engine Pieces

- `src/world.js`: chunk ownership, worker scheduling, streaming, block reads/writes
- `src/chunkStorage.js`: IndexedDB adapter for saved worlds and edited chunk persistence
- `src/terrain.js`: seeded terrain generation shared by main-thread fallback and the worker
- `src/chunk.js`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.js`: worker-side terrain generation and greedy mesh building
- `src/player.js`: first-person controller and voxel collision
- `src/raycast.js`: grid DDA block picking
- `src/physics.js`: simple sphere-vs-voxel rigid toy

## Sensible Next Steps

- Give physics toys voxel damage so thrown objects can punch little craters.
