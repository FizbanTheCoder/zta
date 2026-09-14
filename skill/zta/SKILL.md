---
name: zta
description: >-
  Zero Token Architecture learner: after successful agent work, classify as
  script / skill+script / skill / skip, write a pending draft only, and never
  install without explicit user accept. Use when the user says "zapisz to",
  "/zta", "zrób z tego skrypt", "save as script", or an OpenCode idle toast /
  Cursor stop-hook follow-up asks to load the zta skill. Prefer scripts
  (0 tokens); skills must invoke scripts when steps are known.
---

# ZTA — Infer once, export, run without inference

You turn a finished agent workflow into a **reusable artifact**. Default is a **script** (zero tokens on reuse). A skill is an optional add-on that **must invoke the script**, not rediscover the procedure.

Primary host: **OpenCode** (`~/.config/opencode/skills`, `/zta` command, `zta-learner` plugin). Cursor hooks are optional.

## Hard rules

1. **Nothing lands permanently without explicit user accept.** Pending drafts only until the user says yes / runs `zta accept`.
2. **Prefer script.** Classification order: `script` → `skill+script` → `skill` → `skip`.
3. **Skills that wrap scripts must tell the agent to run `zta run <name>`** — never re-plan the same steps.
4. **Do not write secrets** into drafts (tokens, passwords, API keys, `.env` contents). Redact and list what was cut.
5. **Do not overwrite** existing `~/.config/opencode/skills/<name>/`, `~/.cursor/skills/<name>/`, or `~/.zta/scripts/<name>/` without the user confirming the name.
6. **Skip** one-offs, failures, and workflows that already have a good skill/script.

## When to activate

- User: "zapisz to", `/zta`, "zrób z tego skrypt", "save this as a script/skill"
- OpenCode idle toast / prompt nudge, or Cursor stop-hook follow-up
- User asks to reuse a prior ZTA export → run `zta run <name>` (or `zta list`)

## Workflow

### 1. Gather evidence

- Conversation: what succeeded, commands run, files touched
- Session trace (if present): `~/.zta/sessions/<session-id>.jsonl`
- Existing exports: `zta list` and `zta pending`

### 2. Classify

Read [references.md](references.md) for criteria. Output one of:

| Kind | Use when | Reuse path |
|------|----------|------------|
| `script` | Deterministic steps (lint, migrate, curl, generate table) | `zta run <name>` — **0 tokens** |
| `skill+script` | Known steps + light judgment | Skill loads → **must** run script |
| `skill` | Judgment-only (e.g. review rubric) | Still uses tokens; no rediscovery |
| `skip` | One-off, failed, secret-heavy, already covered | Nothing written |

### 3. Propose a pending draft (do not install)

Show a short proposal:

- **name** (slug: `lowercase-hyphen`)
- **kind**
- **command**: `zta run <name>` (if script involved)
- **whether SKILL.md** will be created
- **secrets redacted**
- **scope / target**: user OpenCode (`~/.config/opencode/skills`) vs project (`.opencode/skills`); ask if unclear. Cursor paths only if user requests `--target cursor`.

Create the draft with the CLI (preferred):

```bash
zta draft <name> --kind script --description "..."
# or:
zta draft <name> --kind skill+script --description "..."
```

Or write under `~/.zta/pending/<name>/` with `draft.json` + `run.mjs` and/or `SKILL.md` matching the CLI layout — still **pending only**.

### 4. Wait for accept

Ask clearly: accept / reject / rename / change kind?

- User accepts → run `zta accept <name> [--scope user|project] [--target opencode|cursor]`
- User rejects → `zta reject <name>`
- **Never** copy into skills dirs or `~/.zta/scripts/` yourself before accept

### 5. Reuse

Next time:

```bash
zta run <name> -- <args>
```

If a skill exists, load it and **invoke the script** — do not reinvent steps.

## CLI cheat sheet

```text
zta draft <name> --kind <script|skill+script|skill> [--description ...]
zta pending
zta accept <name> [--scope user|project] [--target opencode|cursor]
zta reject <name>
zta run <name> -- [args...]
zta list [--target opencode|cursor]
```

## Anti-patterns

- Generating SKILL.md that re-lists shell steps instead of calling `zta run`
- Installing on disk because "the user will probably want it"
- Using an LLM inside a hook/plugin to decide exports
- Saving failed or partial sessions
- Auto-submitting a follow-up prompt without the user approving the export
