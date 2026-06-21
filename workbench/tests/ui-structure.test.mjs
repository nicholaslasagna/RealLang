import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("entrypoint is offline and uses repository-owned assets", async () => {
  const html = await read("index.html");
  for (const id of ["topbar", "sidebar", "main", "status-rail", "command-palette"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]+src="(?!\.\/)/i);
});

test("all requested navigation and settings screens are registered", async () => {
  const source = await read("js/mock-data.js");
  for (const label of ["Home", "Workbench", "Capabilities", "Code", "Research", "Creative", "Image", "Vision", "Engine", "Assets", "Benchmarks", "Updates", "Settings"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  for (const section of ["General", "Workspace", "Provider / Local Model", "Permissions", "Research / Network", "Staff Mode", "Scheduler", "Benchmarks / Gates", "Creative / Multimodal", "Engine Integrations", "Safety / Doctor"]) {
    assert.ok(source.includes(section), `missing settings section: ${section}`);
  }
});

test("slash palette includes the approved command grammar", async () => {
  const source = await read("js/mock-data.js");
  for (const command of ["/ask", "/plan", "/check", "/repair", "/context", "/research", "/creative brief", "/creative map", "/image prompt", "/image job", "/vision analyze", "/vision understand", "/engine scan", "/unreal plan", "/asset pipeline", "/bench", "/skill-bench", "/leaderboard", "/doctor", "/settings", "/staff-status", "/update-check", "/scheduler"]) {
    assert.ok(source.includes(`["${command}"`), `missing command: ${command}`);
  }
});

test("prototype has no browser network or backend execution primitive", async () => {
  const source = [await read("js/mock-data.js"), await read("js/components.js"), await read("js/app.js")].join("\n");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /navigator\.sendBeacon/, /child_process/]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /NO AUTO-APPLY/);
  assert.match(source, /NO AUTO-COMMIT/);
  assert.match(source, /no auto-merge/i);
  assert.match(source, /no backend command executed/i);
});

test("staff UI is a preview and defaults off", async () => {
  const app = await read("js/app.js");
  const components = await read("js/components.js");
  assert.match(app, /staffPreview: false/);
  assert.match(components, /STAFF OFF/);
  assert.match(components, /STAFF UI PREVIEW/);
  assert.match(components, /backend remains off/i);
});

test("local Lucide subset and license are present", async () => {
  const files = await readdir(join(root, "assets/icons"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.filter((file) => file.endsWith(".svg")).length >= 50);
  for (const icon of ["house.svg", "square-terminal.svg", "command.svg", "shield-check.svg", "workflow.svg"]) assert.ok(files.includes(icon), `missing icon asset: ${icon}`);
});

test("public copy avoids unsupported superiority claims", async () => {
  const source = [await read("index.html"), await read("js/mock-data.js"), await read("js/components.js")].join("\n").toLowerCase();
  for (const phrase of ["better than claude", "better than codex", "best ai ever", "fully autonomous", "infinite self-improvement", "aaa asset generation achieved"]) assert.ok(!source.includes(phrase), `unsupported claim found: ${phrase}`);
});
