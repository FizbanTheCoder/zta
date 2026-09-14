#!/usr/bin/env node
/**
 * Install ZTA Learner.
 *
 * Default target: OpenCode
 *   - symlink skill → ~/.config/opencode/skills/zta/
 *   - symlink plugin → ~/.config/opencode/plugins/zta-learner.js
 *   - symlink command → ~/.config/opencode/commands/zta.md
 *   - symlink CLI → ~/.local/bin/zta
 *
 * Optional Cursor (--cursor):
 *   - symlink skill → ~/.cursor/skills/zta/
 *   - symlink hooks → ~/.cursor/hooks/zta/{trace,propose}.mjs
 *   - merge postToolUse + stop into ~/.cursor/hooks.json
 *
 * Flags:
 *   (none)            OpenCode + CLI
 *   --opencode        OpenCode + CLI
 *   --cursor          Cursor + CLI
 *   --opencode --cursor | --all   Both + CLI
 *   --cli-only        Only symlink the CLI
 *
 * Idempotent. Does not overwrite unrelated hooks / plugins.
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const HOME = homedir();
const OPENCODE = join(HOME, ".config", "opencode");
const CURSOR = join(HOME, ".cursor");
const LOCAL_BIN = join(HOME, ".local", "bin");
const CLI_LINK = join(LOCAL_BIN, "zta");

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function forceSymlink(target, linkPath) {
  ensureDir(dirname(linkPath));
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath);
  console.log(`linked ${linkPath} → ${target}`);
}

function installCli() {
  ensureDir(LOCAL_BIN);
  const cli = join(REPO, "cli", "zta.mjs");
  chmodSync(cli, 0o755);
  forceSymlink(cli, CLI_LINK);
  console.log(`CLI available as: ${CLI_LINK}`);
  console.log(`Ensure ~/.local/bin is on PATH.`);
}

function installOpenCode() {
  const skillSrc = join(REPO, "skill", "zta");
  const pluginSrc = join(REPO, "plugins", "zta-learner.js");
  const commandSrc = join(REPO, "commands", "zta.md");

  for (const p of [skillSrc, pluginSrc, commandSrc]) {
    if (!existsSync(p)) {
      console.error(`missing: ${p}`);
      process.exit(1);
    }
  }

  forceSymlink(skillSrc, join(OPENCODE, "skills", "zta"));
  forceSymlink(pluginSrc, join(OPENCODE, "plugins", "zta-learner.js"));
  forceSymlink(commandSrc, join(OPENCODE, "commands", "zta.md"));

  console.log("\nOpenCode install complete.");
  console.log(
    "Restart OpenCode (or start a new session) so the plugin and skill load.",
  );
  console.log(
    "Trigger export with /zta after a successful workflow, or wait for the idle toast.",
  );
}

function mergeCursorHooksJson() {
  ensureDir(CURSOR);
  const HOOKS_JSON = join(CURSOR, "hooks.json");
  let existing = { version: 1, hooks: {} };
  if (existsSync(HOOKS_JSON)) {
    try {
      existing = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
    } catch {
      console.warn(
        `warning: could not parse ${HOOKS_JSON}; creating backup merge`,
      );
    }
  }
  if (!existing.hooks) existing.hooks = {};
  if (!existing.version) existing.version = 1;

  const traceCmd = "./hooks/zta/trace.mjs";
  const proposeCmd = "./hooks/zta/propose.mjs";

  const post = existing.hooks.postToolUse || [];
  if (!post.some((h) => h.command === traceCmd)) {
    post.push({ command: traceCmd, timeout: 10 });
  }
  existing.hooks.postToolUse = post;

  const stop = existing.hooks.stop || [];
  if (!stop.some((h) => h.command === proposeCmd)) {
    stop.push({ command: proposeCmd, timeout: 10, loop_limit: 1 });
  }
  existing.hooks.stop = stop;

  writeFileSync(HOOKS_JSON, JSON.stringify(existing, null, 2) + "\n");
  console.log(`updated ${HOOKS_JSON}`);
}

function installCursor() {
  const skillSrc = join(REPO, "skill", "zta");
  const traceSrc = join(REPO, "hooks", "trace.mjs");
  const proposeSrc = join(REPO, "hooks", "propose.mjs");
  const HOOKS_DIR = join(CURSOR, "hooks", "zta");

  for (const p of [skillSrc, traceSrc, proposeSrc]) {
    if (!existsSync(p)) {
      console.error(`missing: ${p}`);
      process.exit(1);
    }
  }

  chmodSync(traceSrc, 0o755);
  chmodSync(proposeSrc, 0o755);

  forceSymlink(skillSrc, join(CURSOR, "skills", "zta"));
  ensureDir(HOOKS_DIR);
  forceSymlink(traceSrc, join(HOOKS_DIR, "trace.mjs"));
  forceSymlink(proposeSrc, join(HOOKS_DIR, "propose.mjs"));
  mergeCursorHooksJson();

  console.log("\nCursor (optional) install complete.");
  console.log("Reload Cursor hooks or restart Cursor if needed.");
}

function main() {
  chmodSync(join(REPO, "cli", "zta.mjs"), 0o755);

  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const cliOnly = flags.includes("--cli-only");
  const all = flags.includes("--all");
  const oc = all || flags.includes("--opencode") || flags.length === 0;
  const cu = all || flags.includes("--cursor");

  if (cliOnly) {
    installCli();
    console.log("\nCLI-only install complete.");
    return;
  }

  if (oc) installOpenCode();
  if (cu) installCursor();
  installCli();

  console.log("\nDone.");
  if (oc && !cu) {
    console.log(
      "Tip: add Cursor hooks with: node scripts/install.mjs --cursor",
    );
  }
}

main();
