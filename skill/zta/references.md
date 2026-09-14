# ZTA classification & layout reference

## Classification criteria

### `script` (default)

Choose when the successful path is **deterministic**:

- Same inputs → same commands/files
- No open-ended judgment (no "decide which approach")
- Examples: DB migration runner, lint+fix, generate markdown table from CSV, checkout+pull branch, repeatable `curl` sequence

Reuse: `zta run <name>` — **zero model tokens**.

### `skill+script`

Choose when steps are known but a thin judgment layer remains:

- Pick among a small fixed set of flags
- Validate human-provided inputs before running
- Explain script output to the user

The skill **must** instruct: run `zta run <name>`; do not rediscover.

### `skill` (no script)

Choose when the value is **judgment/rubric**, not a command sequence:

- Code review checklist
- Writing style guide application
- Triage heuristics

Still saves rediscovery tokens; does **not** achieve zero tokens.

### `skip`

- One-off exploration
- Failed or aborted work
- Would embed secrets
- Duplicate of an existing skill/script (`zta list`)
- Too vague to name

## Pending draft layout

```text
~/.zta/pending/<name>/
  draft.json      # { name, kind, description, script?, skill?, secretsRedacted[] }
  run.mjs         # optional — present for script | skill+script
  SKILL.md        # optional — present for skill | skill+script
```

`draft.json` example:

```json
{
  "name": "create-expired-code-table",
  "kind": "script",
  "description": "Build markdown table of expired codes from CSV",
  "createdAt": "2026-09-14T12:00:00.000Z",
  "script": "run.mjs",
  "skill": null,
  "secretsRedacted": ["API_TOKEN"]
}
```

## Accepted layout

```text
~/.zta/scripts/<name>/
  run.mjs
  meta.json

# OpenCode (default --target opencode)
~/.config/opencode/skills/<name>/     # --scope user
  SKILL.md
  zta-meta.json

<project>/.opencode/skills/<name>/    # --scope project
  SKILL.md
  zta-meta.json

# Cursor (optional --target cursor)
~/.cursor/skills/<name>/
<project>/.cursor/skills/<name>/
```

## Session traces

```text
~/.zta/sessions/<session-id>.jsonl
~/.zta/proposals/<session-id>.txt     # last idle/stop propose text (OpenCode)
```

Each line is one tool event (no raw stdout — avoid secrets):

```json
{
  "ts": "2026-09-14T12:00:00.000Z",
  "event": "tool.execute.after",
  "tool": "bash",
  "command": "npm test",
  "cwd": "/Users/you/proj",
  "sessionId": "..."
}
```

### OpenCode (primary)

Plugin `plugins/zta-learner.js`:

- `tool.execute.after` → append event
- `session.idle` → if ≥ `ZTA_MIN_TOOL_CALLS`: toast + append `/zta` to TUI prompt (does **not** auto-submit)

### Cursor (optional)

Hooks `hooks/trace.mjs` + `hooks/propose.mjs`:

- `postToolUse` → append event
- `stop` → `followup_message` when count ≥ N

## Proposal diff (show the user)

Keep it short:

```text
Name:    create-expired-code-table
Kind:    script
Command: zta run create-expired-code-table
Skill:   no
Target:  opencode
Redacted: (none)
Accept?  zta accept create-expired-code-table
```

## Hermes-style write approval

Mirror Hermes `write_approval`: **propose → wait → accept/reject**. Disk install happens only on accept.
