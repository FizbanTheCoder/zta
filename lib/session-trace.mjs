/**
 * Shared session-trace helpers for OpenCode plugin and optional Cursor hooks.
 * No LLM — append redacted tool events; propose when tool-call count ≥ N.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ZTA_HOME = process.env.ZTA_HOME || join(homedir(), ".zta");
export const SESSIONS_DIR = join(ZTA_HOME, "sessions");
export const PROPOSALS_DIR = join(ZTA_HOME, "proposals");

export const DEFAULT_MIN_TOOL_CALLS = Number(
  process.env.ZTA_MIN_TOOL_CALLS || 5,
);

export const FOLLOWUP =
  "This session looks like a repeatable workflow (multiple tool calls). " +
  "Load the **zta** skill (or run `/zta`) and propose exporting it as a " +
  "script (preferred) or skill+script. Create a **pending** draft only — " +
  "do not write to ~/.config/opencode/skills, ~/.cursor/skills, or " +
  "~/.zta/scripts without explicit user accept.";

export function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== "") return v;
  }
  return null;
}

/** Strip obvious secret-looking values from a shallow command string. */
export function redactCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  return cmd
    .replace(
      /(api[_-]?key|token|password|secret|authorization)=([^\s]+)/gi,
      "$1=***",
    )
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***");
}

export function extractCommandFromArgs(args) {
  if (!args || typeof args !== "object") return null;
  return (
    pick(args, ["command", "cmd", "shell_command"]) ||
    (typeof args.command === "string" ? args.command : null)
  );
}

export function sessionFile(sessionId) {
  return join(SESSIONS_DIR, `${sanitizeId(sessionId)}.jsonl`);
}

export function ensureSessionsDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function appendToolEvent({
  sessionId,
  tool,
  command,
  cwd,
  event = "tool.execute.after",
  extra = {},
}) {
  ensureSessionsDir();
  const id = sessionId || `unknown-${Date.now()}`;
  const row = {
    ts: new Date().toISOString(),
    event,
    tool: tool || "unknown",
    command: command ? redactCommand(command) : null,
    cwd: cwd || null,
    sessionId: id,
    ...extra,
  };
  appendFileSync(sessionFile(id), JSON.stringify(row) + "\n");
  return id;
}

export function lineCount(file) {
  if (!existsSync(file)) return 0;
  const text = readFileSync(file, "utf8").trim();
  if (!text) return 0;
  return text.split("\n").filter(Boolean).length;
}

export function countToolCalls(sessionId) {
  if (sessionId) {
    return lineCount(sessionFile(sessionId));
  }
  if (!existsSync(SESSIONS_DIR)) return 0;
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) return 0;
  let best = null;
  let bestMtime = 0;
  for (const f of files) {
    const p = join(SESSIONS_DIR, f);
    try {
      const st = statSync(p);
      if (st.mtimeMs >= bestMtime) {
        bestMtime = st.mtimeMs;
        best = p;
      }
    } catch {
      /* skip */
    }
  }
  return best ? lineCount(best) : 0;
}

/**
 * Whether we should propose an export for this idle/stop.
 * Returns { propose, count, minCalls, followup } .
 */
export function shouldPropose(sessionId, minCalls = DEFAULT_MIN_TOOL_CALLS) {
  const count = countToolCalls(sessionId);
  const min = Number(minCalls) || DEFAULT_MIN_TOOL_CALLS;
  return {
    propose: count >= min,
    count,
    minCalls: min,
    followup: FOLLOWUP,
  };
}

/** One propose nudge per session per process / day file marker. */
export function alreadyProposed(sessionId) {
  if (!sessionId) return false;
  const marker = join(PROPOSALS_DIR, `${sanitizeId(sessionId)}.proposed`);
  return existsSync(marker);
}

export function markProposed(sessionId, followup = FOLLOWUP) {
  if (!sessionId) return;
  mkdirSync(PROPOSALS_DIR, { recursive: true });
  const id = sanitizeId(sessionId);
  writeFileSync(join(PROPOSALS_DIR, `${id}.proposed`), new Date().toISOString());
  writeFileSync(join(PROPOSALS_DIR, `${id}.txt`), followup + "\n");
}

/**
 * Skill install roots by host target.
 * @param {"opencode"|"cursor"} target
 * @param {"user"|"project"} scope
 * @param {string} cwd
 */
export function skillRoot(target, scope, cwd, home = homedir()) {
  if (target === "cursor") {
    if (scope === "project") return join(cwd, ".cursor", "skills");
    return join(home, ".cursor", "skills");
  }
  // opencode (default)
  if (scope === "project") return join(cwd, ".opencode", "skills");
  return join(home, ".config", "opencode", "skills");
}

export function resolveTarget(explicit) {
  const t = (explicit || process.env.ZTA_TARGET || "opencode").toLowerCase();
  if (t === "cursor" || t === "opencode") return t;
  return "opencode";
}
