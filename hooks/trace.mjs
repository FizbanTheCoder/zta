#!/usr/bin/env node
/**
 * Cursor postToolUse hook (OPTIONAL secondary target).
 * Prefer the OpenCode plugin for the primary integration.
 *
 * Appends a redacted tool event to ~/.zta/sessions/<id>.jsonl.
 * Fail-open: never block the agent; on error exit 0 with {}.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ZTA_HOME,
  appendToolEvent,
  pick,
  redactCommand,
} from "../lib/session-trace.mjs";

const MIN_PAYLOAD_LOG = join(ZTA_HOME, "last-postToolUse-payload.json");

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", () => resolve(""));
  });
}

function resolveSessionId(payload) {
  return (
    pick(payload, [
      "session_id",
      "sessionId",
      "conversation_id",
      "conversationId",
      "generation_id",
      "generationId",
      "composerId",
      "composer_id",
    ]) ||
    pick(payload?.session ?? {}, ["id", "sessionId", "session_id"]) ||
    null
  );
}

function resolveCwd(payload) {
  return (
    pick(payload, ["cwd", "working_directory", "workspaceRoots"]) ||
    pick(payload?.workspace ?? {}, ["rootPath", "cwd"]) ||
    process.cwd()
  );
}

function resolveTool(payload) {
  return (
    pick(payload, ["tool_name", "toolName", "tool", "name"]) ||
    pick(payload?.tool_input ?? payload?.toolInput ?? {}, ["toolName"]) ||
    "unknown"
  );
}

function resolveCommand(payload) {
  const input =
    payload?.tool_input ||
    payload?.toolInput ||
    payload?.input ||
    payload?.arguments ||
    {};
  return (
    pick(input, ["command", "cmd", "shell_command"]) ||
    pick(payload, ["command"]) ||
    null
  );
}

async function main() {
  try {
    const raw = await readStdin();
    let payload = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        process.stdout.write("{}\n");
        return;
      }
    }

    const sessionId = resolveSessionId(payload);
    const cwd = resolveCwd(payload);
    const tool = resolveTool(payload);
    const command = redactCommand(resolveCommand(payload));

    if (!sessionId) {
      try {
        writeFileSync(
          MIN_PAYLOAD_LOG,
          JSON.stringify(
            {
              note: "session id missing — inspect keys for schema discovery",
              keys: Object.keys(payload),
              sample: payload,
              savedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      } catch {
        /* ignore */
      }
    }

    appendToolEvent({
      sessionId,
      tool,
      command,
      cwd: typeof cwd === "string" ? cwd : JSON.stringify(cwd),
      event: "postToolUse",
    });

    process.stdout.write("{}\n");
  } catch {
    process.stdout.write("{}\n");
  }
}

main();
