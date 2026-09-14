#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
// spawnSync also used for accept with fake HOME
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const ZTA = join(REPO, "cli", "zta.mjs");

function runZta(home, args, opts = {}) {
  return spawnSync(process.execPath, [ZTA, ...args], {
    encoding: "utf8",
    env: { ...process.env, ZTA_HOME: home, PATH: process.env.PATH },
    ...opts,
  });
}

test("pending → accept → zta run exits 0", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-cli-"));

  try {
    const draft = runZta(home, [
      "draft",
      "hello-zta",
      "--kind",
      "script",
      "--description",
      "fixture script",
    ]);
    assert.equal(draft.status, 0, draft.stderr || draft.stdout);
    assert.ok(existsSync(join(home, "pending", "hello-zta", "draft.json")));

    const pending = runZta(home, ["pending"]);
    assert.equal(pending.status, 0);
    assert.match(pending.stdout, /hello-zta/);

    const accept = runZta(home, ["accept", "hello-zta"]);
    assert.equal(accept.status, 0, accept.stderr || accept.stdout);
    assert.ok(existsSync(join(home, "scripts", "hello-zta", "run.mjs")));
    assert.ok(!existsSync(join(home, "pending", "hello-zta")));

    const run = runZta(home, ["run", "hello-zta", "--", "x"]);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /"ok": true/);

    const list = runZta(home, ["list"]);
    assert.equal(list.status, 0);
    assert.match(list.stdout, /hello-zta/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reject removes pending draft", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-rej-"));
  try {
    const draft = runZta(home, ["draft", "tmp-draft", "--kind", "script"]);
    assert.equal(draft.status, 0);
    const reject = runZta(home, ["reject", "tmp-draft"]);
    assert.equal(reject.status, 0);
    assert.ok(!existsSync(join(home, "pending", "tmp-draft")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("skill+script draft includes SKILL.md invoking zta run", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-sk-"));
  try {
    const draft = runZta(home, [
      "draft",
      "wrap-me",
      "--kind",
      "skill+script",
      "--description",
      "wrap",
    ]);
    assert.equal(draft.status, 0, draft.stderr);
    const skill = readFileSync(
      join(home, "pending", "wrap-me", "SKILL.md"),
      "utf8",
    );
    assert.match(skill, /zta run wrap-me/);
    assert.ok(existsSync(join(home, "pending", "wrap-me", "run.mjs")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("accept installs skill under OpenCode path by default", () => {
  const home = mkdtempSync(join(tmpdir(), "zta-oc-"));
  const fakeHome = mkdtempSync(join(tmpdir(), "zta-home-"));
  try {
    const draft = runZta(home, [
      "draft",
      "oc-skill",
      "--kind",
      "skill+script",
      "--description",
      "opencode skill",
    ]);
    assert.equal(draft.status, 0, draft.stderr);

    const accept = spawnSync(
      process.execPath,
      [ZTA, "accept", "oc-skill", "--scope", "user"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ZTA_HOME: home,
          HOME: fakeHome,
          ZTA_TARGET: "opencode",
        },
      },
    );
    assert.equal(accept.status, 0, accept.stderr || accept.stdout);
    const skillDir = join(
      fakeHome,
      ".config",
      "opencode",
      "skills",
      "oc-skill",
    );
    assert.ok(existsSync(join(skillDir, "SKILL.md")));
    assert.ok(existsSync(join(skillDir, "zta-meta.json")));
    assert.match(accept.stdout, /target=opencode/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
