#!/usr/bin/env node
/**
 * ZTA exported script — run with: zta run <name> -- [args...]
 * Keep this deterministic. No LLM calls. Fail loudly on missing inputs.
 */
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: zta run <name> -- [args...]
Exported Zero Token script. Replace this body with the repeatable steps.`);
  process.exit(0);
}

// TODO: replace with the exported procedure
console.log(JSON.stringify({ ok: true, args: positionals }, null, 2));
process.exit(0);
