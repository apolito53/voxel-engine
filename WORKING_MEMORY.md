# Working Memory

Current handoff: 2026-11-07, Cloud Shadow Guides for `v0.19.3`.

## Current State

`Settings > Experimental > Cloud Shadow Guides` links nearby cloud banks to
their terrain contacts using matching colored cloud edges, a representative
fixed-sun ray, sparse contact crosses, and named labels/legend. Amber marks the
actual map's full-coverage/fade boundary; white marks its outer edge. This
independent debug preference defaults off and persists without changing quality,
real shadow coverage, wind, or terrain receivers.

`src/cloudShadowDebug.ts` owns periodic connected-bank identities and the bounded
diagnostic. It reads owned CloudLayer wind, uses actual shadow anchor/depth/radial
coverage, and asks the existing partial-aware terrain picker for contacts.
Unloaded spans reject uncertain contacts; void has no fabricated floor. Sampling
is explicitly local rather than shadow-pixel ownership: at most three banks /
128 contacts plus 96 ring queries per refresh, normally four refreshes/second.
Buffers/topology/colors are reused; off/night/shadow gates skip queries and
hide guides; world reset and disposal clear resources/state. Focused contracts
are in [lighting and sky](docs/architecture.md#lighting-and-sky) and
[settings](docs/controls.md#settings).

The [Codex Pilot](docs/automation.md#codex-pilot-bridge) exposes
`cloudShadowGuides(enabled?)` for inspection/control, with selected/relevant bank
counts, colors, contact/source coordinates, unknown paths, and inactive reason.
Changing it takes effect on the next frame.

## Verification And Delivery

Full local `validate` passes: all 340 engine robustness tests, typecheck,
107-file source hygiene, 17-file Markdown links, production build, and whitespace
checks. Five new tests cover toroidal identities, fixed-sun projection, genuine
partial-terrain contact/unloaded uncertainty, bounded cadence/buffer reuse/
off/disposal behavior, and backward-safe debug persistence. Output is retained
in ignored `logs/cloud-shadow-guides-{tests,validate}.log`. The existing temporary
npm shim was reused because npm remains absent from PATH. Only package/root-lock
version fields changed; dependencies and physics are untouched. The known vendor
chunk-size warning remains.

In-app browser review in the separate `Sky Review` world verified the setting,
matching source edges/ray/terrain contacts, visible map-boundary guides, and
night / Cloud Shadows Off / global shadows Off / debug Off gates. The saved
preference survived reloads without changing Normal quality. The legend clears
the minimap; saturated accents and fog-independent, depth-tested lines keep the
guides readable at cloud height. Final material changes passed typecheck and
production build after the full validation run. Captures are retained in ignored
`logs/visual-runs/2026-11-07-cloud-shadow-guides/`; the review tab was left with
guides enabled at frozen noon. This was visual/behavioral review, not a frame-rate
benchmark or Chrome pointer-lock test.

Implementation is complete for normal `main` delivery. Reserved Vite
`127.0.0.1:5173` and collector `127.0.0.1:5174` still respond successfully;
no services or ports changed. Git history and configured CI/deployment checks
remain the delivery records.

## Remaining Follow-up

No new gameplay/sky tuning is selected. The
[current gameplay shortlist](TODO.md#current-recommended-next-slice) remains
equipment/pickup gameplay and sound work. Existing
[local-logger gaps](TODO.md#development-follow-up-local-diagnostics) and
[intermittent Rapier/CI validation failures](TODO.md#development-follow-up-ci-rigid-debris-validation)
remain tracked once in TODO. No diagnostics transport, physics, dependencies,
or test runner behavior changed here.
