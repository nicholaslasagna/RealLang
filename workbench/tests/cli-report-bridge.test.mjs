import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildInvocation,
  loadSource,
  loadSourcesApi,
  listSources,
  publicSource,
  resolvePython
} from "../tools/realforge-report-bridge.mjs";
import { resolvePython as resolvePythonDirect, VENV_PYTHON_CANDIDATES } from "../tools/resolve-python.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("CLI report sources allowlist is shared and read-only", () => {
  const api = loadSourcesApi();
  assert.ok(api.SOURCES.length >= 3);
  for (const source of api.SOURCES) {
    assert.equal(api.isReadOnlySource(source), true, `source must be read-only: ${source.id}`);
    assert.equal(source.writes, false);
    assert.equal(source.network, false);
    assert.equal(source.staff, false);
    assert.equal(source.apply, false);
    assert.ok(Array.isArray(source.argv));
    assert.ok(source.argv.every((token) => typeof token === "string" && token.length > 0));
    assert.equal(api.DENIED_SUBCOMMANDS.includes(source.argv[0]), false);
  }
});

test("bridge refuses unknown and non-read-only sources", () => {
  const unknown = loadSource("not-a-real-source");
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /unknown report source/);

  const api = loadSourcesApi();
  const tampered = {
    ...api.getSource("capabilities"),
    argv: ["scheduler-run"],
    readOnly: true,
    writes: false
  };
  assert.equal(api.isReadOnlySource(tampered), false);
});

test("buildInvocation uses fixed argv arrays only", () => {
  const api = loadSourcesApi();
  const source = api.getSource("capabilities");
  const { file, args } = buildInvocation(source, { python: "/usr/bin/python3", repoRoot: "/tmp/repo" });
  assert.equal(file, "/usr/bin/python3");
  assert.deepEqual(args, ["-m", "realforge.cli", "capabilities", "--json"]);
  assert.equal(args.some((token) => token.includes(" ")), false);
});

test("listSources exposes metadata without argv internals", () => {
  const listed = listSources();
  assert.ok(listed.some((entry) => entry.id === "capabilities"));
  for (const entry of listed) {
    assert.equal(entry.readOnly, true);
    assert.ok(entry.displayCommand.startsWith("realforge "));
    assert.equal("argv" in entry, false);
  }
});

test("loadSource parses JSON from a mocked runner without touching the network", () => {
  const payload = { ok: true, sample: "bridge-test" };
  const result = loadSource("capabilities", {
    runner: () => ({ stdout: `${JSON.stringify(payload)}\n`, stderr: "", status: 0 })
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.json, payload);
  assert.equal(publicSource(result.source).readOnly, true);
});

test("browser catalog module contains no execution primitives", async () => {
  const source = await read("src/data/cli/cli-report-sources.ts");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /child_process/, /exec\s*\(/, /execFile/]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.doesNotMatch(source, /@ts-nocheck/);
  assert.match(source, /cliReportSources/);
  assert.match(source, /DENIED_SUBCOMMANDS/);
});

test("resolvePython prefers venv interpreters on macOS and Windows layouts", () => {
  const unixRepo = "/repo/root";
  const unixPython = join(unixRepo, ".venv", "bin", "python");
  const winRepo = "C:\\repo";
  const winPython = join(winRepo, ".venv", "Scripts", "python.exe");
  const exists = (path) => path === unixPython || path === winPython;

  assert.equal(resolvePythonDirect(unixRepo, { exists }), unixPython);
  assert.equal(resolvePythonDirect(winRepo, { exists, platform: "win32" }), winPython);
  assert.equal(resolvePythonDirect("/empty", { exists: () => false, platform: "darwin" }), "python3");
  assert.equal(resolvePythonDirect("/empty", { exists: () => false, platform: "win32" }), "python");
  assert.equal(resolvePythonDirect("/empty", { exists: () => false, allowPathFallback: false }), null);
  assert.equal(VENV_PYTHON_CANDIDATES.length, 4);
  assert.equal(resolvePython(unixRepo, { exists }), unixPython);
});
