# Voxel Sandbox Engine

A tiny browser-based voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, block edits, and simple physics toys.

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
- `Resume` captures mouse and starts play
- `Mouse` look while playing
- `Space` jump
- `Shift` sprint
- `Left click` break block
- `Right click` place block
- `1-5` select block
- `F` throw a physics core
- `Esc` pause and release mouse

## Engine Pieces

- `src/world.js`: chunk ownership, worker scheduling, streaming, block reads/writes
- `src/chunk.js`: voxel storage, sync mesh fallback, worker mesh upload
- `src/chunkWorker.js`: worker-side terrain generation and greedy mesh building
- `src/player.js`: first-person controller and voxel collision
- `src/raycast.js`: grid DDA block picking
- `src/physics.js`: simple sphere-vs-voxel rigid toy

## Sensible Next Steps

- Persist edited chunks to local storage.
- Give physics toys voxel damage so thrown objects can punch little craters.
