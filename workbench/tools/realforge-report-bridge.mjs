// RealForge Workbench — read-only CLI report bridge (0.4)
//
// A tiny, dev-only local helper that runs ONLY an allowlisted set of read-only
// RealForge CLI commands and prints their JSON to stdout for import into the
// Workbench Reports screen.
//
// This is NOT a command runner, shell, apply bridge, or backend server:
//   * It executes only fixed argument arrays from the shared allowlist
//     (workbench/src/data/import/cli-report-sources.js) — never a shell string,
//     never user-supplied args, never command composition.
//   * It uses execFileSync (argument-array execution), not a shell.
//   * It never writes files, never reaches the network, and never runs a
//     write/apply/scheduler/staff command.
//   * Output is untrusted import data until adapted by the Workbench import pipeline.
//
// Usage:
//   node tools/realforge-report-bridge.mjs list
//   node tools/realforge-report-bridge.mjs load <source-id>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKBENCH_DIR = resolve(__dirname, "..");
export const REPO_ROOT = resolve(__dirname, "..", "..");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

// Load the browser-shared allowlist in an isolated context so the bridge and the
// UI can never disagree about which commands are permitted.
export function loadSourcesApi() {
  const sourcesPath = join(WORKBENCH_DIR, "src", "data", "import", "cli-report-sources.js");
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(sourcesPath, "utf8"), sandbox, { filename: "cli-report-sources.js" });
  if (!sandbox.RealForgeCliSources) {
    throw new Error("failed to load CLI report sources allowlist");
  }
  return sandbox.RealForgeCliSources;
}

export function publicSource(source) {
  if (!source) return null;
  return {
    id: source.id,
    label: source.label,
    description: source.description,
    displayCommand: source.displayCommand,
    detectType: source.detectType,
    readOnly: source.readOnly === true
  };
}

export function listSources(api) {
  const sources = (api || loadSourcesApi()).SOURCES;
  return sources.map(publicSource);
}

// Prefer the repo virtualenv interpreter; fall back to a PATH-resolved python3.
// The command name is fixed (never user-supplied).
export function resolvePython(repoRoot = REPO_ROOT) {
  const venvPython = join(repoRoot, ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

function sanitizedEnv(repoRoot) {
  // Minimal, fixed environment. No inherited secrets beyond PATH/HOME/locale.
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    LANG: process.env.LANG || "C.UTF-8",
    PYTHONPATH: join(repoRoot, "src")
  };
}

export function buildInvocation(source, { repoRoot = REPO_ROOT, python, timeoutMs, maxBuffer } = {}) {
  const interpreter = python || resolvePython(repoRoot);
  // Fixed argument array: python -m realforge.cli <allowlisted argv...>
  const args = ["-m", "realforge.cli", ...source.argv];
  const options = {
    cwd: repoRoot,
    timeout: timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBuffer: maxBuffer || DEFAULT_MAX_BUFFER,
    encoding: "utf8",
    env: sanitizedEnv(repoRoot)
  };
  return { file: interpreter, args, options };
}

function defaultRunner(file, args, options) {
  try {
    const stdout = execFileSync(file, args, options);
    return { stdout: stdout.toString(), stderr: "", status: 0 };
  } catch (err) {
    return {
      stdout: err && err.stdout ? err.stdout.toString() : "",
      stderr: err && err.stderr ? err.stderr.toString() : String((err && err.message) || err),
      status: typeof (err && err.status) === "number" ? err.status : 1,
      signal: (err && err.signal) || null,
      failed: true
    };
  }
}

/**
 * Load one allowlisted read-only report source. Always returns a structured
 * result and never throws for an unknown source or a failed command.
 */
export function loadSource(id, opts = {}) {
  const api = opts.sources || loadSourcesApi();
  if (!api.isAllowed(id)) {
    return { ok: false, error: `unknown report source: ${id}`, source: null };
  }
  const source = api.getSource(id);
  if (!api.isReadOnlySource(source)) {
    return { ok: false, error: `source is not a permitted read-only command: ${id}`, source: publicSource(source) };
  }

  const repoRoot = opts.repoRoot || REPO_ROOT;
  const { file, args, options } = buildInvocation(source, {
    repoRoot,
    python: opts.python,
    timeoutMs: opts.timeoutMs,
    maxBuffer: opts.maxBuffer
  });
  const runner = opts.runner || defaultRunner;

  let result;
  try {
    result = runner(file, args, options);
  } catch (err) {
    return { ok: false, error: `bridge execution error: ${(err && err.message) || err}`, source: publicSource(source) };
  }

  const stdout = (result && result.stdout) || "";
  if (result && (result.failed || (typeof result.status === "number" && result.status !== 0))) {
    const detail = (result.stderr || "").trim() || `command exited with status ${result.status}`;
    return { ok: false, error: detail, exitCode: result.status, stdout, source: publicSource(source) };
  }

  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch (parseError) {
    return { ok: false, error: `command output was not valid JSON: ${parseError.message}`, stdout, source: publicSource(source) };
  }

  return { ok: true, source: publicSource(source), command: source.displayCommand, json, stdout };
}

function printHelp() {
  process.stdout.write(
    [
      "RealForge Workbench read-only CLI report bridge (0.4)",
      "",
      "Usage:",
      "  node tools/realforge-report-bridge.mjs list",
      "  node tools/realforge-report-bridge.mjs load <source-id>",
      "",
      "Runs only allowlisted read-only RealForge commands and prints JSON to stdout.",
      "No writes, no network, no apply, no shell. Paste the output into the",
      "Workbench Reports import box; it remains untrusted until adapted.",
      ""
    ].join("\n")
  );
}

export function main(argv) {
  const [command, arg] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command === "list") {
    process.stdout.write(`${JSON.stringify(listSources(), null, 2)}\n`);
    return 0;
  }
  if (command === "load") {
    if (!arg) {
      process.stderr.write("error: `load` requires a source id (see `list`).\n");
      return 2;
    }
    const result = loadSource(arg);
    if (!result.ok) {
      process.stderr.write(`error: ${result.error}\n`);
      return 1;
    }
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
    return 0;
  }
  process.stderr.write(`error: unknown bridge command: ${command} (try 'list' or 'load <id>').\n`);
  return 2;
}

// Only run when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
