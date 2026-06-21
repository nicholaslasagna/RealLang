import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

async function loadWorkbench() {
  const sandbox = { console, JSON };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const path of [
    "src/data/fixtures/fixture-bundle.generated.js",
    "src/data/status.js",
    "src/data/adapters/report-adapters.js",
    "src/data/viewModels/workbench-view-models.js",
    "src/data/import/report-import.js",
    "js/mock-data.js",
    "js/components.js"
  ]) {
    vm.runInContext(await read(path), sandbox, { filename: path });
  }
  return sandbox;
}

const baseState = {
  screen: "home",
  settingsSection: "general",
  staffPreview: false,
  commandQuery: "",
  stagedTask: "",
  importRaw: "",
  importType: "auto",
  importPreview: null
};

test("reports screen renders the import panel with the untrusted banner", async () => {
  const sandbox = await loadWorkbench();
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports" });
  assert.ok(html.includes("Imported JSON is untrusted"));
  assert.ok(html.includes("will not execute commands"));
  assert.ok(html.includes('id="import-input"'));
  assert.ok(html.includes('id="import-type"'));
  assert.ok(html.includes("Preview report"));
});

test("invalid JSON produces a parse error preview and never throws", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt("{ not valid json", "auto", {});
  assert.equal(preview.ok, false);
  assert.equal(preview.parseError, true);
  assert.match(preview.error, /JSON parse error/);
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("Could not parse JSON"));
});

test("a valid skill benchmark fixture renders an adapted summary", async () => {
  const sandbox = await loadWorkbench();
  const fixture = sandbox.RealForgeFixtureData.skillBenchmark;
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(fixture), "auto", {});
  assert.equal(preview.ok, true);
  assert.equal(preview.typeId, "skill_benchmark");
  assert.equal(preview.autoDetected, true);
  assert.equal(preview.label, "Skill benchmark report");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("Skill benchmark report"));
  assert.ok(html.includes("Overall"));
  assert.ok(html.includes("0.86"));
});

test("an update bundle is staff-gated when staff preview is off and unlocked when on", async () => {
  const sandbox = await loadWorkbench();
  const fixture = sandbox.RealForgeFixtureData.updateBundle;
  const raw = JSON.stringify(fixture);

  const off = sandbox.RealForgeReportImport.parseAndAdapt(raw, "auto", { staffMode: false });
  assert.equal(off.typeId, "update_bundle");
  assert.equal(off.staffOnly, true);
  assert.equal(off.gated, true);
  const offHtml = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: off });
  assert.ok(offHtml.includes("advanced details locked"));
  assert.ok(offHtml.includes("LOCKED"));

  const on = sandbox.RealForgeReportImport.parseAndAdapt(raw, "auto", { staffMode: true });
  assert.equal(on.gated, false);
  const onHtml = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: on, staffPreview: true });
  assert.ok(!onHtml.includes("advanced details locked"));
});

test("unknown JSON renders a generic preview with a warning", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify({ unexpected: "shape", count: 3 }), "auto", {});
  assert.equal(preview.ok, true);
  assert.equal(preview.generic, true);
  assert.match(preview.reason, /No known RealForge report type/);
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("Unexpected"));
  assert.ok(html.includes("raw field preview") || html.includes("Unrecognized"));
});

test("suggested commands are shown only as not-executed and patches stay review-only", async () => {
  const sandbox = await loadWorkbench();
  const proposal = {
    id: "patch-import-001",
    provider: "mock",
    title: "Example imported patch",
    patch_targets: ["examples/looptest.real"],
    patch_sha256: "abc123",
    validation_commands: ["realc --check", "pytest -q"]
  };
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(proposal), "auto", {});
  assert.equal(preview.typeId, "patch_proposal");
  assert.equal(preview.reviewOnly, true);
  assert.equal(preview.suggestedCommands.join(" | "), "realc --check | pytest -q");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("NOT EXECUTED"));
  assert.ok(html.includes("realc --check"));
  assert.ok(html.includes("Review only"));
  assert.ok(html.includes("Apply (disabled)"));
  assert.ok(html.includes("disabled"));
  // There is no apply/execute action anywhere in the import surface.
  assert.ok(!html.includes('data-action="apply'));
});

test("imported provider output defaults to untrusted", async () => {
  const sandbox = await loadWorkbench();
  const vision = sandbox.RealForgeFixtureData.studioReports.vision.report;
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(vision), "auto", {});
  assert.equal(preview.untrusted, true);
  assert.ok(preview.safetyLabels.includes("UNTRUSTED"));
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("PROVIDER OUTPUT UNTRUSTED"));
});

test("sample fixture loader exposes parseable samples", async () => {
  const sandbox = await loadWorkbench();
  const samples = sandbox.RealForgeReportImport.getSamples();
  assert.ok(samples.length >= 5);
  for (const sample of samples) {
    assert.equal(typeof sample.json, "string");
    assert.doesNotThrow(() => JSON.parse(sample.json));
    const preview = sandbox.RealForgeReportImport.parseAndAdapt(sample.json, "auto", {});
    assert.equal(preview.ok, true);
  }
  const byId = sandbox.RealForgeReportImport.getSampleById("skill");
  assert.ok(byId && byId.id === "skill");
  assert.equal(sandbox.RealForgeReportImport.getSampleById("missing"), null);
});

test("auto-detection maps key fields to the right adapters", async () => {
  const sandbox = await loadWorkbench();
  const detect = sandbox.RealForgeReportImport.detectReportType;
  assert.equal(detect({ task_results: [], domain_scores: {} }), "skill_benchmark");
  assert.equal(detect({ patch_sha256: "x", patch_targets: [] }), "patch_proposal");
  assert.equal(detect({ candidate_version: "1.0" }), "update_bundle");
  assert.equal(detect({ capabilities: [] }), "capability_registry");
  assert.equal(detect({ sections: [] }), "settings_summary");
  assert.equal(detect({ nothing: true }), null);
});

test("all 14 screens still render including reports", async () => {
  const sandbox = await loadWorkbench();
  const components = sandbox.RealForgeComponents;
  for (const screen of ["home", "workbench", "capabilities", "code", "research", "creative", "image", "vision", "engine", "assets", "benchmarks", "reports", "updates", "settings"]) {
    const html = components.renderMain({ ...baseState, screen });
    assert.ok(html.length > 100, `screen did not render: ${screen}`);
  }
});

test("slash palette still filters fixture-backed commands", async () => {
  const sandbox = await loadWorkbench();
  const html = sandbox.RealForgeComponents.renderCommandPalette({ commandQuery: "vision" });
  assert.ok(html.includes("/vision analyze"));
  assert.equal((html.match(/data-command-pick=/g) || []).length, 2);
});

test("report import module has no network or execution primitive", async () => {
  const source = await read("src/data/import/report-import.js");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /navigator\.sendBeacon/, /child_process/, /\beval\s*\(/, /new Function/]) {
    assert.doesNotMatch(source, forbidden);
  }
});
