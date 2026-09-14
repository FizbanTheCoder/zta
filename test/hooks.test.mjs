#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const TRACE = join(REPO, "hooks", "trace.mjs");
const PROPOSE = join(REPO, "hooks", "propose.mjs");
const FIXTURES = join(__dirname, "fixtures");

function runHook(script, home, stdinObj, envExtra = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    input: JSON.stringify(stdinObj),
    env: {
      ...process.env,
      ZTA_HOME: home,
      ZTA_MIN_TOOL_CALLS: "5",
      ...envExtra,
    },
  });
}

test("trace writes session jsonl from fixture stdin", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-tr-"));
  try {
    const payload = JSON.parse(
      readFileSync(join(FIXTURES, "postToolUse.json"), "utf8"),
    );
    const res = runHook(TRACE, home, payload);
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout.trim() || "{}"), {});
    const file = join(home, "sessions", "sess-fixture.jsonl");
    assert.ok(existsSync(file), "session jsonl missing");
    const line = JSON.parse(readFileSync(file, "utf8").trim().split("\n")[0]);
    assert.equal(line.tool, "Shell");
    assert.match(line.command, /npm test/);
    assert.equal(line.sessionId, "sess-fixture");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("propose emits followup when tool count ≥ N", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-prop-"));
  try {
    const sessions = join(home, "sessions");
    mkdirSync(sessions, { recursive: true });
    const lines = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "postToolUse",
        tool: "Shell",
        command: `echo ${i}`,
        sessionId: "sess-rich",
      }),
    ).join("\n");
    writeFileSync(join(sessions, "sess-rich.jsonl"), lines + "\n");

    const stopPayload = JSON.parse(
      readFileSync(join(FIXTURES, "stop-rich.json"), "utf8"),
    );
    const res = runHook(PROPOSE, home, stopPayload);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout.trim() || "{}");
    assert.ok(out.followup_message, "expected followup_message");
    assert.match(out.followup_message, /zta/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("propose stays silent when tool count < N", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-quiet-"));
  try {
    const sessions = join(home, "sessions");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(
      join(sessions, "sess-thin.jsonl"),
      JSON.stringify({
        event: "postToolUse",
        tool: "Read",
        sessionId: "sess-thin",
      }) + "\n",
    );

    const stopPayload = JSON.parse(
      readFileSync(join(FIXTURES, "stop-thin.json"), "utf8"),
    );
    const res = runHook(PROPOSE, home, stopPayload);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout.trim() || "{}");
    assert.equal(out.followup_message, undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("propose fail-open on invalid JSON stdin", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-bad-"));
  try {
    const res = spawnSync(process.execPath, [PROPOSE], {
      encoding: "utf8",
      input: "not-json",
      env: { ...process.env, ZTA_HOME: home },
    });
    assert.equal(res.status, 0);
    assert.deepEqual(JSON.parse(res.stdout.trim()), {});
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
