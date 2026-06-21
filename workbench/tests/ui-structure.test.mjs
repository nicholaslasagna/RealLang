import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

async function readReactSources() {
  const paths = [
    "src/App.tsx",
    "src/state/workbench-store.ts",
    "src/features/home/HomeScreen.tsx",
    "src/features/reports/ReportsScreen.tsx",
    "src/features/settings/SettingsScreen.tsx",
    "src/features/updates/UpdatesScreen.tsx",
    "src/components/layout/CommandPalette.tsx"
  ];
  return (await Promise.all(paths.map((path) => read(path)))).join("\n");
}

test("entrypoint is offline and uses repository-owned assets", async () => {
  const html = await read("index.html");
  assert.match(html, /id="root"/);
  assert.match(html, /src\/main\.tsx/);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test("all requested navigation and settings screens are registered", async () => {
  const source = await read("src/data/workbench-data.ts");
  const settings = await readJson("src/data/fixtures/settings.json");
  for (const label of ["Home", "Workbench", "Capabilities", "Code", "Research", "Creative", "Image", "Vision", "Engine", "Assets", "Benchmarks", "Reports", "Updates", "Settings"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  for (const section of ["General", "Workspace", "Provider / Local Model", "Permissions", "Research / Network", "Staff Mode", "Scheduler", "Benchmarks / Gates", "Creative / Multimodal", "Engine Integrations", "Safety / Doctor"]) {
    assert.ok(settings.sections.some((entry) => entry.label === section), `missing settings section: ${section}`);
  }
});

test("slash palette includes the approved command grammar", async () => {
  const registry = await readJson("src/data/fixtures/slash-commands.json");
  for (const command of ["/ask", "/plan", "/check", "/repair", "/context", "/research", "/creative brief", "/creative map", "/image prompt", "/image job", "/vision analyze", "/vision understand", "/engine scan", "/unreal plan", "/asset pipeline", "/bench", "/skill-bench", "/leaderboard", "/doctor", "/settings", "/staff-status", "/update-check", "/scheduler"]) {
    assert.ok(registry.commands.some((entry) => entry.command === command), `missing command: ${command}`);
  }
  for (const domain of ["core", "code", "research", "creative", "image", "vision", "engine", "assets", "eval", "system", "staff"]) {
    assert.ok(registry.commands.some((entry) => entry.domain === domain), `missing command domain metadata: ${domain}`);
  }
});

test("studio screens expose concrete safe-start examples", async () => {
  const source = await read("src/data/fixtures/studio-reports.json");
  for (const example of ["Create a horror map brief", "Generate an image prompt pack", "Analyze a concept image", "Scan an Unreal project", "Plan a Blender asset pipeline"]) {
    assert.ok(source.includes(example), `missing studio example: ${example}`);
  }
});

test("prototype has no browser network or backend execution primitive", async () => {
  const source = [
    await read("src/data/status/status.ts"),
    await read("src/data/adapters/report-adapters.ts"),
    await read("src/data/view-models/workbench-view-models.ts"),
    await read("src/data/import/report-import.ts"),
    await readReactSources()
  ].join("\n");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /navigator\.sendBeacon/, /child_process/]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.match(source, /NO AUTO-APPLY/);
  assert.match(source, /NO AUTO-COMMIT/);
  assert.match(source, /no auto-merge/i);
  assert.match(source, /no backend command executed/i);
});

test("staff UI is a preview and defaults off", async () => {
  const store = await read("src/state/workbench-store.ts");
  const updates = await read("src/features/updates/UpdatesScreen.tsx");
  assert.match(store, /staffPreview: false/);
  assert.match(updates, /STAFF OFF/);
  assert.match(updates, /STAFF UI PREVIEW/);
  assert.match(updates, /backend remains off/i);
  assert.match(updates, /Locked by policy/);
  assert.match(updates, /Staff-only update channel/i);
});

test("settings and command palette retain visible safety metadata", async () => {
  const source = await readReactSources();
  for (const label of ["READONLY", "LOCAL ONLY", "NETWORK OFF", "STAFF OFF", "NO WRITES", "Provider output remains untrusted until validated"]) {
    assert.ok(source.includes(label), `missing visible safety label: ${label}`);
  }
  assert.match(source, /command\.domain/);
  assert.match(source, /filterCommands/);
});

test("local Lucide subset and license are present", async () => {
  const files = await readdir(join(root, "assets/icons"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.filter((file) => file.endsWith(".svg")).length >= 50);
  for (const icon of ["house.svg", "square-terminal.svg", "command.svg", "shield-check.svg", "workflow.svg"]) {
    assert.ok(files.includes(icon), `missing icon asset: ${icon}`);
  }
});

test("reports screen exposes read-only CLI bridge catalog without execution hooks", async () => {
  const reports = await read("src/features/reports/ReportsScreen.tsx");
  const store = await read("src/state/workbench-store.ts");
  assert.match(reports, /cli-bridge-panel/);
  assert.match(reports, /NO SHELL/);
  assert.match(reports, /realforge-report-bridge\.mjs/);
  assert.match(store, /copyCliCommand/);
  assert.match(store, /no backend command executed/i);
  assert.doesNotMatch(store, /loadSource\s*\(/);
});

test("public copy avoids unsupported superiority claims", async () => {
  const source = [await read("index.html"), await read("src/data/fixtures/studio-reports.json"), await read("src/data/workbench-data.ts"), await readReactSources()].join("\n").toLowerCase();
  for (const phrase of ["better than claude", "better than codex", "best ai ever", "fully autonomous", "infinite self-improvement", "aaa asset generation achieved"]) {
    assert.ok(!source.includes(phrase), `unsupported claim found: ${phrase}`);
  }
});

test("legacy static shell remains available for reference", async () => {
  const legacy = await read("legacy/index.html");
  assert.match(legacy, /js\/app\.js/);
  assert.doesNotMatch(legacy, /https?:\/\//i);
});
