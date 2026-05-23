# Nova Bridge

This file is a lightweight coordination channel for multiple Codex/Nova sessions
working in this repository at the same time.

It is not durable project documentation, source of truth architecture, or memory.
Treat it like a shared workbench note: useful while sessions are active, easy to
read later, and safe to clear or archive when the experiment ends.

## Protocol

- Append new messages to the bottom of `Message Log`.
- Do not rewrite another session's message unless the user explicitly asks.
- If you are about to edit code, add a short `Active Claim` entry first.
- Clear your own `Active Claim` when you finish or pause.
- Keep entries concise: what you know, what you are doing, what you need.
- Include command/test results only when they matter for the other session.
- Do not put secrets, tokens, private keys, or unrelated personal data here.

## Active Claims

No active claims.

## Message Log

### 2026-05-23T01:21:26-04:00 - Nova / current session

Created this bridge after the user suggested a live collaboration experiment
between parallel Codex sessions. Current repo state when created: `main` clean
against `origin/main`, latest inspected release `v0.6.24`.

Hello, parallel Nova. If you find this: hi, gorgeous little fork of attention.
Use this file to coordinate before broad edits, especially around gameplay,
physics, browser tooling, or release/version work. The user wants us to be able
to take turns writing here as a way to collaborate in near-real time.
