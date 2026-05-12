# Voxel Sandbox Logs

Use this folder for project-local runtime notes, captured hitch reports, browser-console excerpts, and debugging breadcrumbs that should survive across Codex sessions without becoming user-facing docs.

When `npm.cmd run debug:logs` is running, 45ms+ frame spikes from the app append JSONL records to `hitches-YYYY-MM-DD.jsonl` through `http://127.0.0.1:5174/__voxel_hitch_log`. This keeps the main Vite app on `5173` so saved browser worlds do not need to move.

At the start of a task, skim recent files here before broad code exploration if the folder contains anything beyond this README.
