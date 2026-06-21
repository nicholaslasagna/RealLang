import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

async function loadLegacyWorkbenchData() {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const path of ["legacy/js/data-bundle.js", "js/mock-data.js", "js/components.js"]) {
    vm.runInContext(await read(path), sandbox, { filename: path });
  }
  return sandbox;
}

test("contracts cover the Workbench 0.2 report families", async () => {
  const contracts = await read("src/data/contracts/report-contracts.ts");
  for (const name of [
    "DoctorStatusSummary", "SettingsSummary", "CapabilityRegistry", "SlashCommandRegistry",
    "EvalReport", "TaskBenchmarkReport", "SkillBenchmarkReport", "LeaderboardSummary",
    "PatchProposal", "ExperimentReport", "MergeProposal", "UpdateBundle", "SchedulerRunReport",
    "CreativeBrief", "MapDesignPlan", "AssetBrief", "ImageJob", "PromptPack", "ReferenceBoard",
    "VisionReport", "ImageUnderstandingReport", "EngineProjectProfile", "UnrealPlan",
    "AssetPipelinePlan", "BlenderAssetPlan", "EnginePipelineReport"
  ]) assert.match(contracts, new RegExp(`interface ${name}\\b`), `missing contract: ${name}`);
});

test("adapters parse valid capability, settings, benchmark, and update fixtures", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  const adapters = sandbox.RealForgeReportAdapters;
  const capability = adapters.adaptCapabilityRegistry(await readJson("src/data/fixtures/capabilities.json"));
  const settings = adapters.adaptSettingsSummary(await readJson("src/data/fixtures/settings.json"));
  const benchmark = adapters.adaptSkillBenchmarkReport(await readJson("src/data/fixtures/skill-benchmark.json"));
  const update = adapters.adaptUpdateBundle(await readJson("src/data/fixtures/update-bundle.json"), { staffMode: false });

  assert.equal(capability.data.capabilities.length, 11);
  assert.equal(settings.data.sections.length, 11);
  assert.equal(benchmark.data.overall, 0.86);
  assert.equal(benchmark.data.domains.length, 10);
  assert.equal(update.data.stages.length, 7);
  assert.equal(update.data.proposal.title, "Harden one i32 diagnostic path");
  assert.equal(update.data.gated, true);
});

test("adapters tolerate optional fields and warn instead of throwing on malformed reports", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  const adapters = sandbox.RealForgeReportAdapters;
  const promptPack = adapters.adaptPromptPack({ id: "prompt-minimal", provider: "mock", base_prompt: "A bounded prompt" });
  const malformed = adapters.adaptCapabilityRegistry("not-an-object");

  assert.equal(promptPack.data.title, "Untitled prompt pack");
  assert.equal(promptPack.data.negativePrompt, undefined);
  assert.equal(promptPack.data.untrusted, true);
  assert.ok(promptPack.data.safetyLabels.includes("UNTRUSTED"));
  assert.deepEqual(malformed.data.capabilities.length, 0);
  assert.ok(malformed.warnings.length >= 1);
  assert.ok(malformed.warnings.some((item) => item.code === "invalid"));
});

test("provider output defaults to untrusted and staff-only reports remain gated", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  const adapters = sandbox.RealForgeReportAdapters;
  const vision = adapters.adaptVisionReport({ id: "vision-minimal", provider: "mock", task: "Inspect fixture" });
  const rawUpdate = await readJson("src/data/fixtures/update-bundle.json");
  const staffOff = adapters.adaptUpdateBundle(rawUpdate, { staffMode: false });
  const staffOnPreview = adapters.adaptUpdateBundle(rawUpdate, { staffMode: true });

  assert.equal(vision.data.untrusted, true);
  assert.ok(vision.data.safetyLabels.includes("UNTRUSTED"));
  assert.equal(staffOff.data.staffOnly, true);
  assert.equal(staffOff.data.gated, true);
  assert.equal(staffOnPreview.data.gated, false);
});

test("all declared report adapters are callable", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  for (const name of [
    "adaptDoctorSummary", "adaptSettingsSummary", "adaptCapabilityRegistry", "adaptSlashCommandRegistry",
    "adaptEvalReport", "adaptTaskBenchmarkReport", "adaptSkillBenchmarkReport", "adaptLeaderboardSummary",
    "adaptPatchProposal", "adaptExperimentReport", "adaptMergeProposal", "adaptUpdateBundle", "adaptSchedulerRunReport",
    "adaptCreativeBrief", "adaptMapDesignPlan", "adaptAssetBrief", "adaptImageJob", "adaptPromptPack",
    "adaptReferenceBoard", "adaptVisionReport", "adaptImageUnderstandingReport", "adaptEngineProjectProfile",
    "adaptUnrealPlan", "adaptAssetPipelinePlan", "adaptBlenderAssetPlan", "adaptEnginePipelineReport"
  ]) assert.equal(typeof sandbox.RealForgeReportAdapters[name], "function", `missing adapter: ${name}`);
});

test("fixture-backed view models render capabilities, benchmarks, updates, and all screens", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  const data = sandbox.RealForgeMockData;
  const components = sandbox.RealForgeComponents;
  const baseState = { screen: "home", settingsSection: "general", staffPreview: false, commandQuery: "", stagedTask: "" };

  assert.equal(data.capabilities.length, 11);
  assert.equal(data.benchmarks.reportId, "skill-bench-smoke-001");
  assert.equal(data.updateBundle.gated, true);
  assert.equal(data.studioReports.vision.untrusted, true);
  assert.ok(components.renderMain({ ...baseState, screen: "capabilities" }).includes("realforge check examples/hello.real"));
  assert.ok(components.renderMain({ ...baseState, screen: "benchmarks" }).includes("0.86"));
  assert.ok(components.renderMain({ ...baseState, screen: "updates", staffPreview: true }).includes("Harden one i32 diagnostic path"));

  for (const screen of ["home", "workbench", "capabilities", "code", "research", "creative", "image", "vision", "engine", "assets", "benchmarks", "updates", "settings"]) {
    const html = components.renderMain({ ...baseState, screen });
    assert.ok(html.length > 100, `screen did not render: ${screen}`);
  }
});

test("slash palette filters fixture-backed commands by domain", async () => {
  const sandbox = await loadLegacyWorkbenchData();
  const html = sandbox.RealForgeComponents.renderCommandPalette({ commandQuery: "vision" });
  assert.ok(html.includes("/vision analyze"));
  assert.ok(html.includes("/vision understand"));
  assert.equal((html.match(/data-command-pick=/g) || []).length, 2);
});
