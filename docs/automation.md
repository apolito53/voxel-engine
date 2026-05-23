# Automation And Visual Testing

Voxel has in-game automation hooks so tests can play real gameplay paths instead
of only poking DOM state.

## F8 Test Avatar

`F8` toggles the scripted runtime avatar. It currently runs a small core-break
integration scenario that stages a target voxel and fires through the real player
Physics Core path.

## Codex Pilot Bridge

Browser automation can use `globalThis.__VOXEL_CODEX_PILOT__` as a high-level
play bridge. It drives real in-world inputs, selection, player movement, aiming,
and weapon fire.

Common calls:

```js
await globalThis.__VOXEL_CODEX_PILOT__.superflat()
await globalThis.__VOXEL_CODEX_PILOT__.scenario("wall-range")
await globalThis.__VOXEL_CODEX_PILOT__.move({ forward: 1, ms: 500 })
await globalThis.__VOXEL_CODEX_PILOT__.lookAt({ x: 0, y: 4, z: -8 })
await globalThis.__VOXEL_CODEX_PILOT__.fire()
await globalThis.__VOXEL_CODEX_PILOT__.play("preview-parity")
await globalThis.__VOXEL_CODEX_PILOT__.play("debris-pressure")
await globalThis.__VOXEL_CODEX_PILOT__.snapshot()
await globalThis.__VOXEL_CODEX_PILOT__.startPass("label")
```

Current scripted plays include:

- `preview-parity`
- `debris-pressure`
- `wall-range`
- `debris-grounding`
- `hitscan-tunnel`

## Visual Test Recorder

Local browser test runs can use `globalThis.__VOXEL_VISUAL_TEST__` while
`npm.cmd run debug:logs` is listening.

Useful calls:

```js
globalThis.__VOXEL_VISUAL_TEST__.listScenarios()
globalThis.__VOXEL_VISUAL_TEST__.scenarioSnapshot("debris-pressure")
await globalThis.__VOXEL_VISUAL_TEST__.recordScenario("debris-grounding")
```

The browser records the game canvas as WebM, samples review frames, and posts
the run to `logs/visual-runs/YYYY-MM-DD/...` with `recording.webm`,
`manifest.json`, `review.html`, and extracted frames when local `ffmpeg` is
available. `recordPilotPlay("wall-range")` remains as a compatibility shortcut.

Scenario snapshots and recording manifests include compact runtime pressure and
hitch receipts.

## Scenario Catalog

Current visual scenarios:

- `preview-parity`
- `debris-pressure`
- `debris-grounding`
- `hitscan-tunnel`
- `builder-fixture`
- `wall-range`
- `free-roam`

`preview-parity` protects player trust in Core Aim Preview by comparing the
visible prediction against the actual fired damage path. `debris-pressure`
creates bounded destruction pressure and watches debris, support collider, and
hitch behavior through the settle window.

## Browser Choice

Use Chrome for gameplay validation that depends on pointer lock, raw mouse
movement, or first-person feel. The in-app browser is fine for DOM/UI smoke
checks, but it does not exercise cursor lock reliably enough for real gameplay.

Chrome can stay relatively dumb if the in-game scenario catalog keeps exposing
rich setup, play, snapshot, and recording hooks.
