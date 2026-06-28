# Future WebGPU Overhaul

Status: planned future experiment, not active mainline work.

The old `experiment/gpu-ripple-field` WebGL2 branch is shelved. It is useful
reference material, but it should not be merged wholesale into current `main`.
Main has moved ahead in world height, traversal, audio, local lights, terrain
profiles, and horizon work; the next GPU renderer pass should start fresh from
current `main`.

## Why WebGPU Next

WebGL2 proved that compact terrain records and renderer-owned presentation are
worth pursuing, but it is an awkward home for the bigger goal: material-specific
visual debris, high-count particles, persistent render buffers, modern
instrumentation, and eventually optional GPU-side simulation work.

WebGPU is a better fit because it can be designed around explicit buffers,
compute-friendly data flow, command encoding, and cleaner GPU/CPU ownership
boundaries from the first slice.

## Lessons To Keep

- Keep gameplay truth explicit. Saves, block HP, terrain damage, player
  collision, support checks, raycasts, and durable debris/rubble state should
  remain CPU-authored until a deliberate GPU simulation architecture replaces
  that model.
- Make renderer input data-oriented. Terrain, partial terrain, debris, beams,
  poofs, lights, and diagnostics should move toward compact records instead of
  renderer code walking gameplay objects directly.
- Split debris by purpose. CPU/Rapier should own important gameplay pieces;
  WebGPU should sell high-volume visual chaos.
- Material identity should drive debris lanes. Leaves can be floaty and
  wind-sensitive, sand can become particle/cloud spray, stone can stay chunky,
  and wood can use long splinters.
- Add measurement early. GPU timing, upload bytes, draw/dispatch counts,
  buffer pressure, and resource disposal should be visible before the renderer
  gets complicated.
- Treat fallback as a design choice, not a panic button. If WebGPU becomes the
  high-end renderer, the fallback path should be intentional and scoped.

## First Good Branch Shape

Create a new branch from current `main`, likely:

```text
experiment/webgpu-overhaul
```

Initial milestones should be small enough to validate in the browser:

1. Add a backend-neutral renderer contract that can host a WebGPU backend.
2. Build a minimal WebGPU capability/device layer with clear unsupported-browser
   behavior.
3. Render a tiny diagnostic scene or terrain page from explicit GPU buffers.
4. Move terrain pages over once measurement and disposal are boring.
5. Add renderer-owned transient VFX before touching fancy debris simulation.
6. Add material debris profiles and visual-only WebGPU debris lanes.
7. Consider GPU simulation only after render buffers, events, saves, and
   CPU/GPU sync boundaries are honest.

## Reference Branch

The shelved branch is:

```text
experiment/gpu-ripple-field
```

Useful reference commit:

```text
1190e66 Document shelved WebGL GPU experiment
```

Use that branch for ideas around renderer seams and diagnostics, not as an
integration target.
