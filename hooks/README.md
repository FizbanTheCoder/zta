# Optional Cursor hooks

Primary target is **OpenCode** (see `plugins/zta-learner.js` and `commands/zta.md`).

These Cursor hooks remain for users who also want observation + propose-on-stop in Cursor:

| File | Cursor event | Role |
|------|--------------|------|
| `trace.mjs` | `postToolUse` | Append redacted tool events to `~/.zta/sessions/` |
| `propose.mjs` | `stop` | Emit `followup_message` when tool count ≥ `ZTA_MIN_TOOL_CALLS` |
| `hooks.json` | merge target | Reference config merged into `~/.cursor/hooks.json` on `--cursor` install |

Install Cursor support explicitly:

```bash
node scripts/install.mjs --cursor
```

OpenCode does **not** use these files; it uses the plugin API instead.
