# ZTA Learner

**Infer once. Export. Run without inference.**

OpenCode-first package (meta-skill + plugin + `/zta` command + CLI) that turns a successful agent session into a reusable **script** (Zero Token Architecture) or optional **skill** that must invoke that script. Nothing is written permanently without your explicit accept.

Inspired by Hightower’s ZTA talk and Hermes-style write approval — not a Hermes clone, not a second LLM in a hook, not a marketplace plugin (v1).

Cursor hooks remain available as an **optional secondary** target (`--cursor`).

## Layout

```text
zta-learner/
  README.md
  skill/zta/SKILL.md              # meta-skill (OpenCode + Cursor compatible)
  skill/zta/references.md
  commands/zta.md                 # OpenCode /zta slash command
  plugins/zta-learner.js          # OpenCode: tool.execute.after + session.idle
  hooks/                          # OPTIONAL Cursor postToolUse + stop
  cli/zta.mjs                     # pending / accept / reject / run / list
  lib/session-trace.mjs           # shared trace + propose helpers
  templates/script.mjs
  templates/SKILL.md
  scripts/install.mjs
  test/
```

## Install (OpenCode)

Requires Node ≥ 18. OpenCode config lives under `~/.config/opencode/`.

```bash
cd ~/Developer/zta-learner
node scripts/install.mjs
```

This will:

1. Symlink the skill → `~/.config/opencode/skills/zta/`
2. Symlink the plugin → `~/.config/opencode/plugins/zta-learner.js`
3. Symlink the command → `~/.config/opencode/commands/zta.md`
4. Symlink the CLI → `~/.local/bin/zta` (ensure `~/.local/bin` is on `PATH`)

Restart OpenCode or start a new session so the plugin and skill load.

### Optional Cursor

```bash
node scripts/install.mjs --cursor
# or both hosts:
node scripts/install.mjs --all
```

### Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `ZTA_HOME` | `~/.zta` | Pending drafts, scripts, session traces |
| `ZTA_MIN_TOOL_CALLS` | `5` | Idle/stop threshold before proposing export |
| `ZTA_TARGET` | `opencode` | Default skill host for `zta accept` / `zta list` |

## Usage

1. Do a task once in OpenCode (infer once).
2. Say **“zapisz to”**, run **`/zta`**, or wait for the idle **toast** (plugin appends `/zta` to the TUI prompt — it does **not** auto-submit).
3. Agent loads the **zta** skill, classifies (`script` preferred), creates a **pending** draft under `~/.zta/pending/`.
4. You accept:

```bash
zta pending
zta accept <name>            # → ~/.config/opencode/skills/<name>/ when skill included
# project scope:
zta accept <name> --scope project
# Cursor skill path (optional):
zta accept <name> --target cursor
zta reject <name>
```

5. Next time — **no model**:

```bash
zta run <name> --
zta list
```

### CLI

```text
zta draft <name> --kind <script|skill+script|skill> [--description ...]
zta pending
zta accept <name> [--scope user|project] [--target opencode|cursor]
zta reject <name>
zta run <name> -- [args...]
zta list [--target opencode|cursor]
```

Kinds:

- **script** — deterministic; reuse with `zta run` (0 tokens)
- **skill+script** — light judgment; skill must call `zta run`
- **skill** — judgment-only rubric (still uses tokens, no rediscovery)

## OpenCode integration surface

| Piece | Path / API | Role |
|-------|------------|------|
| Skill | `~/.config/opencode/skills/zta/SKILL.md` | Classify + pending draft instructions |
| Command | `~/.config/opencode/commands/zta.md` → `/zta` | Explicit propose trigger |
| Plugin | `~/.config/opencode/plugins/zta-learner.js` | Observe tools; propose on idle |
| Plugin hooks | `tool.execute.after`, `event` → `session.idle` | Trace + toast + `tui.appendPrompt` |
| Accepted skills | `~/.config/opencode/skills/<name>/` or `.opencode/skills/` | After `zta accept` |
| Zero-token runner | `zta` CLI + `~/.zta/scripts/` | No inference |

Skill format matches OpenCode Agent Skills: YAML frontmatter `name` + `description`, then markdown (same shape as Cursor `SKILL.md`).

### Gap vs Cursor stop hooks

OpenCode has **no** Cursor-style `stop` → `followup_message` that auto-starts another agent turn. The plugin instead:

1. Shows a TUI **toast** when `session.idle` and tool count ≥ N
2. **Appends** `/zta` to the prompt box (you submit)
3. Relies on explicit `/zta` or “zapisz to”

It does **not** call `session.prompt` automatically (that would burn tokens without consent).

## Manual OpenCode path (verify)

1. In any project, ask OpenCode to do a small repeatable task.
2. When done, run `/zta` (or say `zapisz to jako skrypt zta`).
3. Confirm the proposal → `zta accept <name>`.
4. In a fresh terminal: `zta run <name>` — exit 0, same artifact.
5. Optional: new session loads the exported skill — it should instruct `zta run`, not re-plan.

## Tests

```bash
cd ~/Developer/zta-learner
npm test
```

Coverage:

- CLI: `draft` → `accept` → `run` exits 0; OpenCode skill path; `reject`; skill+script template
- Lib / plugin helpers: append + propose threshold; propose marker
- Cursor hooks (optional): fixture stdin → JSONL / `followup_message`

## Paths after accept

| Artifact | Location |
|----------|----------|
| Pending drafts | `~/.zta/pending/<name>/` |
| Accepted scripts | `~/.zta/scripts/<name>/run.mjs` |
| Accepted skills (OpenCode user) | `~/.config/opencode/skills/<name>/` |
| Accepted skills (OpenCode project) | `<repo>/.opencode/skills/<name>/` |
| Accepted skills (Cursor, optional) | `~/.cursor/skills/<name>/` or `.cursor/skills/` |
| Session traces | `~/.zta/sessions/<session-id>.jsonl` |

## Design constraints (v1)

- No LLM inside plugin/hooks — heuristic only
- No marketplace plugin package (local file under `plugins/`)
- Default to script; skill is optional and must invoke the script
- Hermes-style write approval: pending until accept
- Does not modify `qa-copilot-demo` or any other project
