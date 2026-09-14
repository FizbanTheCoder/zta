#!/usr/bin/env node
/**
 * Cursor stop hook (OPTIONAL secondary target).
 * Prefer the OpenCode plugin (session.idle → toast + appendPrompt).
 *
 * Cheap heuristic only (NO LLM). If the session trace has ≥ N tool calls,
 * emit followup_message asking the agent to load the zta skill.
 * Fail-open: errors → empty JSON, exit 0.
 */
import {
  DEFAULT_MIN_TOOL_CALLS,
  FOLLOWUP,
  pick,
  shouldPropose,
} from "../lib/session-trace.mjs";

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

    const status = pick(payload, [
      "status",
      "reason",
      "stop_reason",
      "stopReason",
    ]);
    if (
      status &&
      /fail|error|abort|cancel|interrupt/i.test(String(status))
    ) {
      process.stdout.write("{}\n");
      return;
    }

    const minCalls = Number(
      process.env.ZTA_MIN_TOOL_CALLS ||
        payload.min_tool_calls ||
        DEFAULT_MIN_TOOL_CALLS,
    );
    const sessionId = resolveSessionId(payload);
    const { propose } = shouldPropose(sessionId, minCalls);

    if (propose) {
      process.stdout.write(
        JSON.stringify({ followup_message: FOLLOWUP }) + "\n",
      );
      return;
    }

    process.stdout.write("{}\n");
  } catch {
    process.stdout.write("{}\n");
  }
}

main();
