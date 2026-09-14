---
description: Propose a ZTA export (script preferred) as a pending draft — nothing written without accept
---

Load the **zta** skill and classify this session's successful work as `script` (preferred), `skill+script`, `skill`, or `skip`.

Rules:
1. Create a **pending** draft only (`zta draft ...` or files under `~/.zta/pending/`).
2. Do **not** install into `~/.config/opencode/skills`, `.opencode/skills`, or `~/.zta/scripts` yourself.
3. Prefer a deterministic script; if a skill is added, it must instruct `zta run <name>`.
4. Redact secrets. Show a short proposal (name, kind, command, redactions) and wait for the user to run `zta accept` / `zta reject`.

If the session was a one-off or failed, say `skip` and write nothing.
