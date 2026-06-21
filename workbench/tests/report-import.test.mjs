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

// --- 0.3.1 trust hardening ---

test("imported JSON cannot downgrade its own untrusted label (generic path)", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify({ provider: "x", untrusted: false }), "auto", {});
  assert.equal(preview.untrusted, true);
  assert.ok(preview.safetyLabels.includes("UNTRUSTED"));
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("UNTRUSTED"));
});

test("imported JSON cannot downgrade untrusted via an adapter (vision path)", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(
    JSON.stringify({ provider: "x", task: "t", image_hashes: ["h"], untrusted: false }),
    "auto",
    {}
  );
  assert.equal(preview.typeId, "vision_report");
  assert.equal(preview.untrusted, true);
  assert.ok(preview.safetyLabels.includes("UNTRUSTED"));
});

test("source-declared VALIDATED is shown as claimed, never RealForge-verified", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(
    JSON.stringify({ provider: "x", task: "t", image_hashes: ["h"], status: "VALIDATED", safety_labels: ["VALIDATED"] }),
    "auto",
    {}
  );
  assert.equal(preview.claimedValidated, true);
  assert.ok(!preview.safetyLabels.includes("VALIDATED"));
  assert.ok(preview.safetyLabels.includes("UNTRUSTED"));
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("VALIDATION CLAIMED"));
  assert.ok(html.includes("CLAIMED"));
});

test("staff_only:false cannot unlock a staff-only update bundle when staff is off", async () => {
  const sandbox = await loadWorkbench();
  const bundle = { ...sandbox.RealForgeFixtureData.updateBundle, staff_only: false };
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(bundle), "auto", { staffMode: false });
  assert.equal(preview.typeId, "update_bundle");
  assert.equal(preview.staffOnly, true);
  assert.equal(preview.gated, true);
});

test("staff_only:false cannot unlock a scheduler run report when staff is off", async () => {
  const sandbox = await loadWorkbench();
  const report = { id: "sched-1", schedule_id: "nightly", run_number: 1, candidate_count: 0, staff_only: false };
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(report), "auto", { staffMode: false });
  assert.equal(preview.typeId, "scheduler_run");
  assert.equal(preview.gated, true);
});

test("real backend skill-bench shape normalizes (domain_scores + normalized_score + task_results)", async () => {
  const sandbox = await loadWorkbench();
  const backend = {
    id: "skill-bench-real-001",
    provider: "mock",
    suite: "all",
    normalized_score: 0.91,
    total_score: 273,
    passed: true,
    safety_failures: [],
    domain_scores: { code: 0.9, docs: 0.8, safety: 0.95 },
    task_results: [{ task_id: "a" }, { task_id: "b" }]
  };
  const adapted = sandbox.RealForgeReportAdapters.adaptSkillBenchmarkReport(backend);
  assert.equal(adapted.data.overall, 0.91);
  assert.equal(adapted.data.domains.length, 3);
  assert.equal(adapted.data.taskCount, 2);
  assert.equal(adapted.data.passed, true);
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(backend), "auto", {});
  assert.equal(preview.typeId, "skill_benchmark");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("0.91"));
});

test("real backend eval shape normalizes (tasks + scores + total_score + passed + failures)", async () => {
  const sandbox = await loadWorkbench();
  const backend = {
    id: "eval-real-001",
    provider: "mock",
    suite: "smoke",
    tasks: [{ task_id: "x" }, { task_id: "y" }],
    scores: { x: 80, y: 90 },
    total_score: 170,
    passed: true,
    failures: ["none"]
  };
  const adapted = sandbox.RealForgeReportAdapters.adaptEvalReport(backend);
  assert.equal(adapted.data.suite, "smoke");
  assert.equal(adapted.data.totalScore, 170);
  assert.equal(adapted.data.taskCount, 2);
  assert.equal(adapted.data.passed, true);
  assert.equal(sandbox.RealForgeReportImport.detectReportType(backend), "eval_report");
});

test("real backend patch proposal shape normalizes (patch_sha256 + patch_targets + files_to_modify)", async () => {
  const sandbox = await loadWorkbench();
  const backend = {
    id: "patch-real-001",
    provider: "mock",
    title: "Backend patch",
    patch_sha256: "deadbeef",
    patch_targets: ["src/a.py"],
    files_to_modify: ["src/a.py"],
    unified_diff: "--- a\n+++ b\n",
    validation_commands: ["pytest -q"]
  };
  const adapted = sandbox.RealForgeReportAdapters.adaptPatchProposal(backend);
  assert.equal(adapted.data.patchHash, "deadbeef");
  assert.equal(adapted.data.targetFiles.join(","), "src/a.py");
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(backend), "auto", {});
  assert.equal(preview.typeId, "patch_proposal");
  assert.equal(preview.reviewOnly, true);
});

test("image-understanding JSON routes to the richer adapter, not generic vision", async () => {
  const sandbox = await loadWorkbench();
  const report = {
    id: "iu-001",
    provider: "mock",
    task: "Understand a concept image",
    detected_subjects: ["statue"],
    asset_opportunities: ["forest altar prop"],
    map_design_opportunities: ["ritual clearing"],
    gameplay_relevance: ["set dressing"],
    risks: ["mock only"],
    limitations: ["no semantic recognition"],
    confidence: 0,
    semantic_analysis_performed: false
  };
  assert.equal(sandbox.RealForgeReportImport.detectReportType(report), "image_understanding_report");
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(report), "auto", {});
  assert.equal(preview.typeId, "image_understanding_report");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("forest altar prop"));
  assert.ok(html.includes("ritual clearing"));
});

test("large arrays and long text are capped in the preview", async () => {
  const sandbox = await loadWorkbench();
  const limits = sandbox.RealForgeReportImport.LIMITS;
  const big = { items: Array.from({ length: 50 }, (_, i) => `item-${i}`), blob: "x".repeat(limits.MAX_TEXT_CHARS + 200) };
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(big), "auto", {});
  const listField = preview.fields.find((field) => field.type === "list");
  assert.ok(listField);
  assert.equal(listField.value.length, limits.MAX_LIST_ITEMS);
  assert.equal(listField.moreCount, 50 - limits.MAX_LIST_ITEMS);
  const textField = preview.fields.find((field) => field.type === "text" && field.truncatedChars > 0);
  assert.ok(textField);
  assert.equal(textField.truncatedChars, 200);
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("more"));
});

test("manual type that disagrees with detection shows a mismatch warning", async () => {
  const sandbox = await loadWorkbench();
  const doctor = sandbox.RealForgeFixtureData.doctorStatus;
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(doctor), "patch_proposal", {});
  assert.equal(preview.typeId, "patch_proposal");
  assert.ok(preview.mismatch);
  assert.equal(preview.mismatch.detectedId, "doctor_status");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("This JSON looks like"));
});

test("failed auto-detect shows UNRECOGNIZED, not MANUAL TYPE", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify({ mystery: true, count: 1 }), "auto", {});
  assert.equal(preview.selectionMode, "unrecognized");
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("UNRECOGNIZED"));
  assert.ok(!html.includes("MANUAL TYPE"));
});

test("staff-gated import preview offers a local staff-preview affordance", async () => {
  const sandbox = await loadWorkbench();
  const preview = sandbox.RealForgeReportImport.parseAndAdapt(JSON.stringify(sandbox.RealForgeFixtureData.updateBundle), "auto", { staffMode: false });
  const html = sandbox.RealForgeComponents.renderMain({ ...baseState, screen: "reports", importPreview: preview });
  assert.ok(html.includes("Enable staff UI preview"));
  assert.ok(html.includes('data-action="toggle-staff-preview"'));
});
