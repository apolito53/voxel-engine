# Working Memory

Current handoff: 2026-11-07.

The project now has [local instructions](AGENTS.md), selective
[durable memory](CRYSTALIZED_MEMORY.md), and entry-document routes to its
memory and planning files. The populated idea collection is now
[SPITBALL.md](SPITBALL.md); its original feature ideas are preserved. The
documentation checker covers all four instruction/memory/idea files alongside
the existing README, codebase index, changelog, TODO, and focused docs.

The app remains `v0.18.0.1`. [CODEBASE_INDEX.md](CODEBASE_INDEX.md) is the small
ownership map; [docs/architecture.md](docs/architecture.md) remains the deeper
contract reference. [TODO.md](TODO.md#current-recommended-next-slice) keeps
equipment/pickup gameplay and sound as the current next lanes. This
documentation setup did not select a new gameplay slice.

## Local Runtime Snapshot

On 2026-11-07, the app at `http://127.0.0.1:5173` and the collector at
`http://127.0.0.1:5174/health` were verified. The home screen browser smoke,
collector hitch/combat writes, and Vite same-origin combat writes passed.
These ports are centrally reserved. Recheck listeners and health before relying
on this snapshot; no preview service was launched or reserved by this work.
Local runtime details live in ignored `logs/local-runtime-20261107.jsonl`.

Locked dependencies were installed without a lockfile change. Node was
available, but npm was absent from the shell PATH during the session; recheck
tool availability before future app validation. Docs checks run directly with
`node scripts/check_docs_links.mjs`.

## Remaining Follow-up

On 2026-11-07, two Ubuntu / Node `22.23.4` CI attempts failed in different
rigid-debris tests before docs checks or the build. A
[subsequent full CI run](https://github.com/apolito53/voxel-engine/actions/runs/42356216133)
passed with app/test code unchanged. The intermittent cause is unknown; no
physics changes were made. Investigation and prior failure evidence are
tracked in [TODO: CI Rigid-Debris Validation](TODO.md#development-follow-up-ci-rigid-debris-validation).

The existing logger is useful but has verified standard gaps. Concrete work is
recorded once in [TODO: Local Diagnostics](TODO.md#development-follow-up-local-diagnostics).
Follow that entry when diagnostics work is chosen; no logger behavior was
changed during the documentation setup.

## Verification

`node scripts/check_docs_links.mjs` passes across 17 Markdown files;
`git diff --check` and the checker syntax check are clean. A temporary missing
link in this memory file was rejected by the checker, then restored before the
clean check. All 92 original idea bullets in SPITBALL remain verbatim.

`node scripts/run_tests.mjs` passed all 324 engine robustness tests locally on
Windows / Node `24.22.1`, including the CI's first failing fast-fall case. Its
output is retained in ignored `logs/ci-test-repro-20261107.log`.
