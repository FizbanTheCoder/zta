#!/usr/bin/env node
/**
 * ZTA CLI — pending drafts, accept/reject gate, zero-token run.
 *
 * Paths:
 *   drafts:   ~/.zta/pending/<name>/
 *   scripts:  ~/.zta/scripts/<name>/
 *   skills:   ~/.config/opencode/skills/<name>/  (default target: opencode)
 *             or ~/.cursor/skills/<name>/ when --target cursor
 *             or project .opencode/skills / .cursor/skills when --scope project
 */
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolveTarget, skillRoot } from "../lib/session-trace.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATES = join(REPO_ROOT, "templates");

const ZTA_HOME = process.env.ZTA_HOME || join(homedir(), ".zta");
const PENDING_DIR = join(ZTA_HOME, "pending");
const SCRIPTS_DIR = join(ZTA_HOME, "scripts");

const KINDS = new Set(["script", "skill+script", "skill"]);

function ensureDirs() {
  for (const d of [ZTA_HOME, PENDING_DIR, SCRIPTS_DIR]) {
    mkdirSync(d, { recursive: true });
  }
}

function usage(exitCode = 0) {
  const text = `zta — Zero Token Architecture CLI

Usage:
  zta draft <name> --kind <script|skill+script|skill> [options]
  zta pending
  zta accept <name> [--scope user|project] [--target opencode|cursor] [--cwd <path>]
  zta reject <name>
  zta run <name> [--] [script-args...]
  zta list [--target opencode|cursor]
  zta help

Draft options:
  --kind <k>           Required. script | skill+script | skill
  --description <t>    Short description
  --script <path>      Source script file (default: templates/script.mjs)
  --skill <path>       Source SKILL.md (default: templates/SKILL.md when kind includes skill)
  --force              Overwrite existing pending draft

Accept:
  --scope user         Install skill to user skills dir (default)
  --scope project      Install skill to <cwd>/.opencode/skills/<name>/ (or .cursor/ when --target cursor)
  --target opencode    Skill host: OpenCode (default; also ZTA_TARGET)
  --target cursor      Skill host: Cursor (~/.cursor/skills)
  --cwd <path>         Project root when --scope project (default: process.cwd())

Environment:
  ZTA_HOME             Override ~/.zta (useful in tests)
  ZTA_TARGET           Default skill host: opencode | cursor (default: opencode)
`;
  console.log(text);
  process.exit(exitCode);
}

function die(msg, code = 1) {
  console.error(`zta: ${msg}`);
  process.exit(code);
}

function slugOk(name) {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(name);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function pendingMetaPath(name) {
  return join(PENDING_DIR, name, "draft.json");
}

function loadPending(name) {
  const metaPath = pendingMetaPath(name);
  if (!existsSync(metaPath)) die(`no pending draft named "${name}"`);
  return readJson(metaPath);
}

function renderTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : `{{${key}}}`,
  );
}

function cmdDraft(args) {
  ensureDirs();
  const name = args.positionals[0];
  if (!name) die("draft requires <name>");
  if (!slugOk(name)) die("name must be lowercase letters/numbers/hyphens (max 63)");

  const kind = args.values.kind;
  if (!kind || !KINDS.has(kind)) {
    die(`--kind required: script | skill+script | skill`);
  }

  const dest = join(PENDING_DIR, name);
  if (existsSync(dest) && !args.values.force) {
    die(`pending draft "${name}" already exists (use --force)`);
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  const description =
    args.values.description ||
    `Exported ZTA workflow: ${name}`;

  const wantsScript = kind === "script" || kind === "skill+script";
  const wantsSkill = kind === "skill" || kind === "skill+script";

  let scriptRel = null;
  if (wantsScript) {
    const src = args.values.script
      ? resolve(args.values.script)
      : join(TEMPLATES, "script.mjs");
    if (!existsSync(src)) die(`script source not found: ${src}`);
    const scriptDest = join(dest, "run.mjs");
    copyFileSync(src, scriptDest);
    scriptRel = "run.mjs";
  }

  let skillRel = null;
  if (wantsSkill) {
    const src = args.values.skill
      ? resolve(args.values.skill)
      : join(TEMPLATES, "SKILL.md");
    if (!existsSync(src)) die(`skill source not found: ${src}`);
    let body = readFileSync(src, "utf8");
    body = renderTemplate(body, { name, description });
    const skillDest = join(dest, "SKILL.md");
    writeFileSync(skillDest, body);
    skillRel = "SKILL.md";
  }

  const meta = {
    name,
    kind,
    description,
    createdAt: new Date().toISOString(),
    script: scriptRel,
    skill: skillRel,
    secretsRedacted: [],
  };
  writeJson(join(dest, "draft.json"), meta);
  console.log(`pending draft created: ${dest}`);
  console.log(`  kind: ${kind}`);
  console.log(`  accept with: zta accept ${name}`);
}

function cmdPending() {
  ensureDirs();
  const names = listDirs(PENDING_DIR);
  if (names.length === 0) {
    console.log("No pending drafts.");
    return;
  }
  for (const name of names) {
    const meta = readJson(pendingMetaPath(name));
    console.log(`${name}\tkind=${meta.kind}\t${meta.description || ""}`);
  }
}

function skillInstallDir(name, scope, cwd, target) {
  return join(skillRoot(target, scope, cwd), name);
}

function cmdAccept(args) {
  ensureDirs();
  const name = args.positionals[0];
  if (!name) die("accept requires <name>");
  const meta = loadPending(name);
  const scope = args.values.scope || "user";
  if (scope !== "user" && scope !== "project") {
    die("--scope must be user or project");
  }
  const target = resolveTarget(args.values.target);
  const cwd = args.values.cwd ? resolve(args.values.cwd) : process.cwd();
  const pendingDir = join(PENDING_DIR, name);

  if (meta.script) {
    const scriptDest = join(SCRIPTS_DIR, name);
    mkdirSync(scriptDest, { recursive: true });
    const src = join(pendingDir, meta.script);
    const dest = join(scriptDest, "run.mjs");
    copyFileSync(src, dest);
    writeJson(join(scriptDest, "meta.json"), {
      name,
      kind: meta.kind,
      description: meta.description,
      acceptedAt: new Date().toISOString(),
      entry: "run.mjs",
      target,
    });
    console.log(`script installed: ${dest}`);
  }

  if (meta.skill) {
    const skillDir = skillInstallDir(name, scope, cwd, target);
    mkdirSync(skillDir, { recursive: true });
    copyFileSync(join(pendingDir, meta.skill), join(skillDir, "SKILL.md"));
    writeJson(join(skillDir, "zta-meta.json"), {
      name,
      kind: meta.kind,
      scope,
      target,
      acceptedAt: new Date().toISOString(),
      run: `zta run ${name}`,
    });
    console.log(`skill installed: ${skillDir}`);
  }

  rmSync(pendingDir, { recursive: true, force: true });
  console.log(`accepted: ${name} (target=${target})`);
}

function cmdReject(args) {
  ensureDirs();
  const name = args.positionals[0];
  if (!name) die("reject requires <name>");
  const pendingDir = join(PENDING_DIR, name);
  if (!existsSync(pendingDir)) die(`no pending draft named "${name}"`);
  rmSync(pendingDir, { recursive: true, force: true });
  console.log(`rejected (deleted pending): ${name}`);
}

function listSkillsForTarget(target) {
  const root = skillRoot(target, "user", process.cwd());
  const label =
    target === "cursor"
      ? "Skills (~/.cursor/skills with zta-meta.json):"
      : "Skills (~/.config/opencode/skills with zta-meta.json):";
  console.log(label);
  let found = false;
  if (existsSync(root)) {
    for (const name of listDirs(root)) {
      const metaPath = join(root, name, "zta-meta.json");
      if (!existsSync(metaPath)) continue;
      found = true;
      const meta = readJson(metaPath);
      console.log(
        `  ${name}\tkind=${meta.kind || "?"}\tscope=${meta.scope || "user"}\ttarget=${meta.target || target}`,
      );
    }
  }
  if (!found) console.log("  (none)");
}

function cmdList(args) {
  ensureDirs();
  const scripts = listDirs(SCRIPTS_DIR);
  console.log("Scripts (~/.zta/scripts):");
  if (scripts.length === 0) console.log("  (none)");
  for (const name of scripts) {
    const metaPath = join(SCRIPTS_DIR, name, "meta.json");
    const meta = existsSync(metaPath) ? readJson(metaPath) : {};
    console.log(`  ${name}\tkind=${meta.kind || "?"}\t${meta.description || ""}`);
  }

  const target = resolveTarget(args?.values?.target);
  listSkillsForTarget(target);
  if (target === "opencode") {
    // Also peek at cursor if any leftover exports
    const cursorRoot = skillRoot("cursor", "user", process.cwd());
    if (existsSync(cursorRoot)) {
      const any = listDirs(cursorRoot).some((n) =>
        existsSync(join(cursorRoot, n, "zta-meta.json")),
      );
      if (any) {
        console.log("(also found Cursor-hosted ZTA skills — list with: zta list --target cursor)");
      }
    }
  }
}

function cmdRun(argv) {
  ensureDirs();
  const raw = argv.slice();
  const name = raw.shift();
  if (!name || name === "help" || name === "-h" || name === "--help") {
    usage(name ? 0 : 1);
  }
  if (raw[0] === "--") raw.shift();

  const entry = join(SCRIPTS_DIR, name, "run.mjs");
  if (!existsSync(entry)) {
    die(`no accepted script "${name}" at ${entry}`);
  }

  const child = spawn(process.execPath, [entry, ...raw], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") usage(0);

  if (cmd === "run") {
    cmdRun(argv.slice(1));
    return;
  }

  const { values, positionals } = parseArgs({
    args: argv.slice(1),
    allowPositionals: true,
    strict: false,
    options: {
      kind: { type: "string" },
      description: { type: "string" },
      script: { type: "string" },
      skill: { type: "string" },
      force: { type: "boolean", default: false },
      scope: { type: "string" },
      target: { type: "string" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) usage(0);

  switch (cmd) {
    case "draft":
      cmdDraft({ values, positionals });
      break;
    case "pending":
      cmdPending();
      break;
    case "accept":
      cmdAccept({ values, positionals });
      break;
    case "reject":
      cmdReject({ values, positionals });
      break;
    case "list":
      cmdList({ values, positionals });
      break;
    default:
      die(`unknown command: ${cmd}\nRun: zta help`);
  }
}

main();
