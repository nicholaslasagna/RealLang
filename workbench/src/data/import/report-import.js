(function registerReportImport(global) {
  "use strict";

  // Read-only JSON report import for the Workbench (0.3).
  //
  // This module never executes commands, never writes files, never reaches a
  // backend, and never makes a network request. It only parses pasted JSON and
  // runs it through the existing 0.2 report adapters, which already treat every
  // provider/generated field as untrusted and warn instead of throwing.

  function getAdapters() {
    return global.RealForgeReportAdapters || null;
  }

  // Type id -> { label, adapter, reviewOnly }. The adapter name resolves against
  // RealForgeReportAdapters at preview time so adapter logic is never duplicated.
  const IMPORT_TYPES = Object.freeze([
    { id: "auto", label: "Auto-detect", adapter: null },
    { id: "doctor_status", label: "Doctor / status summary", adapter: "adaptDoctorSummary" },
    { id: "settings_summary", label: "Settings summary", adapter: "adaptSettingsSummary" },
    { id: "capability_registry", label: "Capability registry", adapter: "adaptCapabilityRegistry" },
    { id: "slash_command_registry", label: "Slash command registry", adapter: "adaptSlashCommandRegistry" },
    { id: "eval_report", label: "Eval report", adapter: "adaptEvalReport" },
    { id: "task_benchmark", label: "Task benchmark report", adapter: "adaptTaskBenchmarkReport" },
    { id: "skill_benchmark", label: "Skill benchmark report", adapter: "adaptSkillBenchmarkReport" },
    { id: "leaderboard", label: "Leaderboard summary", adapter: "adaptLeaderboardSummary" },
    { id: "patch_proposal", label: "Patch proposal", adapter: "adaptPatchProposal", reviewOnly: true },
    { id: "experiment_report", label: "Experiment report", adapter: "adaptExperimentReport", reviewOnly: true },
    { id: "merge_proposal", label: "Merge proposal", adapter: "adaptMergeProposal", reviewOnly: true },
    { id: "update_bundle", label: "Update bundle", adapter: "adaptUpdateBundle", reviewOnly: true },
    { id: "scheduler_run", label: "Scheduler run report", adapter: "adaptSchedulerRunReport" },
    { id: "creative_brief", label: "Creative brief", adapter: "adaptCreativeBrief" },
    { id: "image_job", label: "Image job", adapter: "adaptImageJob" },
    { id: "prompt_pack", label: "Prompt pack", adapter: "adaptPromptPack" },
    { id: "vision_report", label: "Vision / image understanding report", adapter: "adaptVisionReport" },
    { id: "engine_pipeline_report", label: "Engine pipeline report", adapter: "adaptEnginePipelineReport" },
    { id: "asset_pipeline_plan", label: "Asset pipeline plan", adapter: "adaptAssetPipelinePlan" }
  ]);

  const TYPE_BY_ID = Object.freeze(Object.fromEntries(IMPORT_TYPES.map((entry) => [entry.id, entry])));

  // Metadata fields surfaced separately from type-specific key fields.
  const META_KEYS = new Set([
    "id", "kind", "createdAt", "provider", "model", "status", "safetyLabels",
    "untrusted", "dryRun", "staffOnly", "approvalRequired", "readonly", "noWrites", "gated"
  ]);

  // Raw keys that may carry suggested shell commands. Always shown as
  // suggestions only and explicitly marked "not executed".
  const COMMAND_KEYS = Object.freeze([
    "validation_commands", "command_suggestions", "commands_to_run", "inert_commands", "commands"
  ]);

  function has(value, key) {
    return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
  }

  function isObjectArray(value) {
    return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object" && !Array.isArray(value[0]);
  }

  function detectReportType(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    if (has(value, "task_results") && has(value, "domain_scores")) return "skill_benchmark";
    if (has(value, "task_results")) return "task_benchmark";
    if (has(value, "tasks") && (has(value, "scores") || has(value, "total_score"))) return "eval_report";
    if (has(value, "domains") && has(value, "overall")) return "skill_benchmark";

    if (has(value, "candidate_version")) return "update_bundle";
    if (has(value, "stages") && has(value, "proposal")) return "update_bundle";
    if (has(value, "proposal_id") && (has(value, "results") || has(value, "commands"))) return "experiment_report";
    if (has(value, "source_ref") || has(value, "target_ref")) return "merge_proposal";
    if (has(value, "patch_sha256") || has(value, "patch_targets")) return "patch_proposal";
    if ((has(value, "patch_hash") || has(value, "unified_diff")) && !has(value, "proposal") && !has(value, "stages")) {
      return "patch_proposal";
    }

    if (has(value, "schedule_id") || (has(value, "run_number") && has(value, "candidate_count"))) return "scheduler_run";
    if (has(value, "capabilities") && Array.isArray(value.capabilities)) return "capability_registry";
    if (has(value, "sections") && Array.isArray(value.sections)) return "settings_summary";
    if (has(value, "checks") && Array.isArray(value.checks)) return "doctor_status";
    if (has(value, "entries") && Array.isArray(value.entries)) return "leaderboard";
    if (has(value, "commands") && isObjectArray(value.commands)) return "slash_command_registry";

    if (has(value, "observed_elements") || has(value, "image_hashes") || (has(value, "confidence") && has(value, "limitations"))) {
      return "vision_report";
    }
    if (has(value, "variants") && has(value, "base_prompt")) return "prompt_pack";
    if (has(value, "prompt_spec_ids") || (has(value, "task") && has(value, "output_count"))) return "image_job";
    if (has(value, "operations") && has(value, "engine")) return "engine_pipeline_report";
    if (has(value, "stages") && has(value, "title")) return "asset_pipeline_plan";
    if (has(value, "genre") || has(value, "goals")) return "creative_brief";
    if (has(value, "engine") && has(value, "project_path")) return "engine_project_profile";
    if (has(value, "suite") && (has(value, "score") || has(value, "gate"))) return "task_benchmark";

    return null;
  }

  function humanizeLabel(key) {
    const spaced = String(key)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    if (!spaced) return key;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function fieldFromValue(label, value) {
    if (Array.isArray(value)) {
      const strings = value.filter((item) => typeof item === "string" && item.trim());
      if (strings.length === value.length) return { label, type: "list", value: strings };
      return { label, type: "count", value: value.length };
    }
    if (value && typeof value === "object") {
      return { label, type: "count", value: Object.keys(value).length };
    }
    if (typeof value === "boolean") return { label, type: "flag", value };
    if (typeof value === "number") return { label, type: "number", value };
    if (typeof value === "string") return { label, type: "text", value };
    return { label, type: "text", value: String(value) };
  }

  function keyFieldsFromData(data) {
    const fields = [];
    for (const [key, value] of Object.entries(data)) {
      if (META_KEYS.has(key)) continue;
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && !value.trim()) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      fields.push(fieldFromValue(humanizeLabel(key), value));
    }
    return fields;
  }

  function genericFields(value) {
    if (!value || typeof value !== "object") {
      return [{ label: "Value", type: "text", value: String(value) }];
    }
    if (Array.isArray(value)) return [{ label: "Items", type: "count", value: value.length }];
    return Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => fieldFromValue(humanizeLabel(key), entry));
  }

  function collectSuggestedCommands(value) {
    const found = [];
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      for (const key of COMMAND_KEYS) {
        const entry = node[key];
        if (Array.isArray(entry)) {
          for (const item of entry) {
            if (typeof item === "string" && item.trim()) found.push(item.trim());
          }
        }
      }
      if (node.proposal && typeof node.proposal === "object") visit(node.proposal);
    };
    visit(value);
    return [...new Set(found)];
  }

  function parseAndAdapt(rawText, typeChoice, options) {
    const opts = options || {};
    const text = typeof rawText === "string" ? rawText : "";
    if (!text.trim()) {
      return { ok: false, empty: true, error: "Paste a RealForge report as JSON, or load a sample, to preview it." };
    }

    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return { ok: false, parseError: true, error: `JSON parse error: ${error.message}` };
    }

    const isObject = value && typeof value === "object" && !Array.isArray(value);
    const choice = typeChoice && typeChoice !== "auto" ? typeChoice : null;
    const detectedId = isObject ? detectReportType(value) : null;
    const resolvedId = choice || detectedId;
    const typeDef = resolvedId ? TYPE_BY_ID[resolvedId] : null;
    const adapters = getAdapters();
    const suggestedCommands = collectSuggestedCommands(value);

    if (!typeDef || !typeDef.adapter || !adapters || typeof adapters[typeDef.adapter] !== "function") {
      return Object.freeze({
        ok: true,
        generic: true,
        reviewOnly: false,
        typeId: resolvedId || "unknown",
        label: typeDef ? typeDef.label : "Unrecognized report",
        autoDetected: false,
        detectedId,
        reason: choice
          ? "Selected type has no adapter; showing a raw JSON field preview."
          : "No known RealForge report type matched these fields. Showing a raw JSON field preview.",
        fields: genericFields(value),
        warnings: [],
        suggestedCommands,
        untrusted: true,
        staffOnly: false,
        gated: false,
        safetyLabels: ["UNTRUSTED", "READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"]
      });
    }

    const adapterResult = adapters[typeDef.adapter](value, { staffMode: opts.staffMode === true });
    const data = adapterResult.data;
    return Object.freeze({
      ok: true,
      generic: false,
      reviewOnly: typeDef.reviewOnly === true,
      typeId: typeDef.id,
      label: typeDef.label,
      autoDetected: !choice && Boolean(detectedId),
      detectedId,
      meta: {
        id: data.id,
        kind: data.kind,
        provider: data.provider,
        model: data.model,
        createdAt: data.createdAt,
        status: data.status
      },
      safetyLabels: data.safetyLabels || [],
      untrusted: data.untrusted === true,
      staffOnly: data.staffOnly === true,
      gated: data.gated === true,
      approvalRequired: data.approvalRequired === true,
      dryRun: data.dryRun === true,
      fields: keyFieldsFromData(data),
      warnings: adapterResult.warnings || [],
      suggestedCommands
    });
  }

  function getSamples() {
    const fixtures = global.RealForgeFixtureData || {};
    const studio = fixtures.studioReports && typeof fixtures.studioReports === "object" ? fixtures.studioReports : {};
    const candidates = [
      { id: "skill", label: "Skill benchmark", value: fixtures.skillBenchmark },
      { id: "update", label: "Update bundle + proposal", value: fixtures.updateBundle },
      { id: "creative", label: "Creative brief", value: studio.creative && studio.creative.report },
      { id: "vision", label: "Vision report", value: studio.vision && studio.vision.report },
      { id: "settings", label: "Settings summary", value: fixtures.settings },
      { id: "capabilities", label: "Capability registry", value: fixtures.capabilities }
    ];
    return candidates
      .filter((entry) => entry.value && typeof entry.value === "object")
      .map((entry) => ({ id: entry.id, label: entry.label, json: JSON.stringify(entry.value, null, 2) }));
  }

  function getSampleById(id) {
    return getSamples().find((sample) => sample.id === id) || null;
  }

  global.RealForgeReportImport = Object.freeze({
    IMPORT_TYPES,
    detectReportType,
    parseAndAdapt,
    getSamples,
    getSampleById
  });
})(window);
