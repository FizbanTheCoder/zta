#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

async function loadLib(home) {
  process.env.ZTA_HOME = home;
  // Fresh import per home via query bust — session-trace reads ZTA_HOME at module load
  const url =
    pathToFileURL(join(REPO, "lib", "session-trace.mjs")).href +
    `?t=${Date.now()}-${Math.random()}`;
  return import(url);
}

test("appendToolEvent writes jsonl and shouldPropose respects threshold", async () => {
  const home = mkdtempSync(join(tmpdir(), "zta-lib-"));
  try {
    const lib = await loadLib(home);
    for (let i = 0; i < 5; i++) {
      lib.appendToolEvent({
        sessionId: "oc-sess",
        tool: "bash",
        command: `echo ${i}`,
        cwd: "/tmp",
      });
    }
    const file = join(home, "sessions", "oc-sess.jsonl");
    assert.ok(existsSync(file));
    const lines = readFileSync(file, "utf8").trim().split("\n");
    assert.equal(lines.length, 5);
    const row = JSON.parse(lines[0]);
    assert.equal(row.tool, "bash");
    assert.equal(row.event, "tool.execute.after");

    const rich = lib.shouldPropose("oc-sess", 5);
    assert.equal(rich.propose, true);
    assert.match(rich.followup, /zta/i);

    const thinHome = mkdtempSync(join(tmpdir(), "zta-lib-thin-"));
    try {
      process.env.ZTA_HOME = thinHome;
      const lib2 = await loadLib(thinHome);
      lib2.appendToolEvent({
        sessionId: "thin",
        tool: "read",
        command: null,
        cwd: "/tmp",
      });
      assert.equal(lib2.shouldPropose("thin", 5).propose, false);
    } finally {
      rmSync(thinHome, { recursive: true, force: true });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    delete process.env.ZTA_HOME;
  }
});

test("redactCommand strips tokens", async () => {
  const home = mkdtempSync(join(tmpdir(), "zta-red-"));
  try {
    const lib = await loadLib(home);
    const out = lib.redactCommand("curl -H 'Authorization=secret123' https://x");
    assert.match(out, /Authorization=\*\*\*/);
    assert.doesNotMatch(out, /secret123/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    delete process.env.ZTA_HOME;
  }
});

test("skillRoot defaults to OpenCode paths", async () => {
  const home = mkdtempSync(join(tmpdir(), "zta-root-"));
  try {
    const lib = await loadLib(home);
    assert.equal(
      lib.skillRoot("opencode", "user", "/proj", "/fake-home"),
      join("/fake-home", ".config", "opencode", "skills"),
    );
    assert.equal(
      lib.skillRoot("opencode", "project", "/proj", "/fake-home"),
      join("/proj", ".opencode", "skills"),
    );
    assert.equal(
      lib.skillRoot("cursor", "user", "/proj", "/fake-home"),
      join("/fake-home", ".cursor", "skills"),
    );
    assert.equal(lib.resolveTarget(undefined), "opencode");
    assert.equal(lib.resolveTarget("cursor"), "cursor");
  } finally {
    rmSync(home, { recursive: true, force: true });
    delete process.env.ZTA_HOME;
  }
});

test("OpenCode plugin exports ZtaLearnerPlugin and records tools", async () => {
  const home = mkdtempSync(join(tmpdir(), "zta-plug-"));
  try {
    process.env.ZTA_HOME = home;
    process.env.ZTA_MIN_TOOL_CALLS = "3";

    const pluginUrl =
      pathToFileURL(join(REPO, "plugins", "zta-learner.js")).href +
      `?t=${Date.now()}`;
    const mod = await import(pluginUrl);
    assert.equal(typeof mod.ZtaLearnerPlugin, "function");

    const toasts = [];
    const prompts = [];
    const hooks = await mod.ZtaLearnerPlugin({
      directory: "/proj",
      client: {
        tui: {
          showToast: async (opts) => {
            toasts.push(opts);
          },
          appendPrompt: async (opts) => {
            prompts.push(opts);
          },
        },
      },
    });

    for (let i = 0; i < 3; i++) {
      await hooks["tool.execute.after"](
        {
          tool: "bash",
          sessionID: "plug-sess",
          callID: `c${i}`,
          args: { command: `echo ${i}` },
        },
        { title: "", output: "", metadata: {} },
      );
    }

    const file = join(home, "sessions", "plug-sess.jsonl");
    assert.ok(existsSync(file));
    assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 3);

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "plug-sess" } },
    });
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].body.message, /\/zta|ZTA/i);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].body.text, /\/zta/);

    // Second idle should not re-nudge (marker)
    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "plug-sess" } },
    });
    assert.equal(toasts.length, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
    delete process.env.ZTA_HOME;
    delete process.env.ZTA_MIN_TOOL_CALLS;
  }
});
