---
name: {{name}}
description: >-
  {{description}}
  Prefer running the exported script via `zta run {{name}}` — do not rediscover the procedure.
---

# {{name}}

## Zero Token path (preferred)

Run the exported script. Do **not** re-plan or rediscover steps:

```bash
zta run {{name}} --
```

Script location (after accept): `~/.zta/scripts/{{name}}/run.mjs`

## When to use the agent

Only use model judgment when the script cannot decide (ambiguous inputs, review, classification).
Otherwise invoke the script and report its output.

## Instructions

1. Confirm inputs the script needs.
2. Run `zta run {{name}} -- <args>`.
3. Surface stdout/stderr; do not invent a parallel procedure.
