# Voxel Sandbox Engine

A tiny browser-based voxel sandbox prototype. Three.js handles rendering, while the engine code owns chunks, terrain generation, voxel meshing, collision, ray picking, block edits, and simple physics toys.

## Run

```powershell
npm.cmd install
npm.cmd run dev -- --port 5173
```

Open `http://127.0.0.1:5173`.

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

- `src/world.js`: chunk ownership, terrain generation, block reads/writes
- `src/chunk.js`: voxel storage and visible-face mesh building
- `src/player.js`: first-person controller and voxel collision
- `src/raycast.js`: grid DDA block picking
- `src/physics.js`: simple sphere-vs-voxel rigid toy

## Sensible Next Steps

- Stream chunks around the player instead of generating a fixed radius.
- Add greedy meshing to reduce vertex count.
- Persist edited chunks to local storage.
- Add a debug overlay for frame time, triangle count, and current chunk.
- Give physics toys voxel damage so thrown objects can punch little craters.
