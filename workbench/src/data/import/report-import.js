(function registerReportImport(global) {
  "use strict";

  // Read-only JSON report import for the Workbench (0.3 / hardened in 0.3.1).
  //
  // This module never executes commands, never writes files, never reaches a
  // backend, and never makes a network request. It only parses pasted JSON and
  // runs it through the existing report adapters.
  //
  // 0.3.1 trust hardening: imported JSON is ALWAYS treated as untrusted. Source
  // fields cannot remove the UNTRUSTED label, claim RealForge verification, or
  // unlock staff-gated report types. Staff gating is enforced by this preview
  // layer (report type default + Workbench staff state), not by the payload.

  function getAdapters() {
    return global.RealForgeReportAdapters || null;
  }

  // Type id -> { label, adapter, reviewOnly, staffOnly }. The adapter name
  // resolves against RealForgeReportAdapters at preview time so adapter logic is
  // never duplicated. `staffOnly` marks report types whose advanced details stay
  // gated regardless of any staff_only field inside the imported JSON.
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
    { id: "update_bundle", label: "Update bundle", adapter: "adaptUpdateBundle", reviewOnly: true, staffOnly: true },
    { id: "scheduler_run", label: "Scheduler run report", adapter: "adaptSchedulerRunReport", staffOnly: true },
    { id: "creative_brief", label: "Creative brief", adapter: "adaptCreativeBrief" },
    { id: "image_job", label: "Image job", adapter: "adaptImageJob" },
    { id: "prompt_pack", label: "Prompt pack", adapter: "adaptPromptPack" },
    { id: "vision_report", label: "Vision report", adapter: "adaptVisionReport" },
    { id: "image_understanding_report", label: "Image understanding report", adapter: "adaptImageUnderstandingReport" },
    { id: "engine_pipeline_report", label: "Engine pipeline report", adapter: "adaptEnginePipelineReport" },
    { id: "asset_pipeline_plan", label: "Asset pipeline plan", adapter: "adaptAssetPipelinePlan" }
  ]);

  const TYPE_BY_ID = Object.freeze(Object.fromEntries(IMPORT_TYPES.map((entry) => [entry.id, entry])));

  // Labels forced onto every imported preview. UNTRUSTED can never be removed by
  // the payload; VALIDATED is never forwarded (it would imply RealForge
  // verification of untrusted data).
  const IMPORT_FORCED_LABELS = Object.freeze(["UNTRUSTED", "READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"]);

  // Bounds for preview rendering so pathological reports cannot blow up the DOM.
  const MAX_LIST_ITEMS = 12;
  const MAX_TEXT_CHARS = 600;
  const MAX_FIELDS = 32;
  const MAX_COMMANDS = 12;

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

  function labelForType(id) {
    const entry = id ? TYPE_BY_ID[id] : null;
    return entry ? entry.label : (id || "unknown");
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

    // Richer image-understanding reports must route before the simpler vision report.
    if (
      has(value, "detected_subjects") || has(value, "asset_opportunities") ||
      has(value, "map_design_opportunities") || has(value, "gameplay_relevance") ||
      has(value, "semantic_analysis_performed") || has(value, "likely_use_cases") ||
      has(value, "planning_notes")
    ) {
      return "image_understanding_report";
    }
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
      if (strings.length === value.length) {
        const shown = strings.slice(0, MAX_LIST_ITEMS);
        return { label, type: "list", value: shown, moreCount: strings.length - shown.length };
      }
      return { label, type: "count", value: value.length };
    }
    if (value && typeof value === "object") {
      return { label, type: "count", value: Object.keys(value).length };
    }
    if (typeof value === "boolean") return { label, type: "flag", value };
    if (typeof value === "number") return { label, type: "number", value };
    if (typeof value === "string") {
      if (value.length > MAX_TEXT_CHARS) {
        return { label, type: "text", value: value.slice(0, MAX_TEXT_CHARS), truncatedChars: value.length - MAX_TEXT_CHARS };
      }
      return { label, type: "text", value };
    }
    return { label, type: "text", value: String(value) };
  }

  function capFields(fields) {
    if (fields.length <= MAX_FIELDS) return fields;
    const shown = fields.slice(0, MAX_FIELDS);
    shown.push({ label: "", type: "more", value: fields.length - MAX_FIELDS });
    return shown;
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
    return capFields(fields);
  }

  function genericFields(value) {
    if (!value || typeof value !== "object") {
      return [{ label: "Value", type: "text", value: String(value) }];
    }
    if (Array.isArray(value)) return [{ label: "Items", type: "count", value: value.length }];
    const fields = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => fieldFromValue(humanizeLabel(key), entry));
    return capFields(fields);
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

  // Never let imported JSON upgrade trust: force the import-context labels, keep
  // informative caution labels, and drop any claimed VALIDATED label.
  function enforceImportSafetyLabels(labels) {
    const out = [...IMPORT_FORCED_LABELS];
    for (const label of labels || []) {
      if (label === "VALIDATED") continue;
      if (!out.includes(label)) out.push(label);
    }
    return out;
  }

  function buildMismatch(choice, detectedId, typeDef) {
    if (!choice || !detectedId || !typeDef || detectedId === typeDef.id) return null;
    return {
      detectedId,
      detectedLabel: labelForType(detectedId),
      selectedLabel: typeDef.label
    };
  }

  function parseAndAdapt(rawText, typeChoice, options) {
    const opts = options || {};
    const staffMode = opts.staffMode === true;
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
    const allCommands = collectSuggestedCommands(value);
    const suggestedCommands = allCommands.slice(0, MAX_COMMANDS);
    const suggestedCommandsMore = Math.max(0, allCommands.length - suggestedCommands.length);
    const sourceStaffOnly = isObject && value.staff_only === true;

    if (!typeDef || !typeDef.adapter || !adapters || typeof adapters[typeDef.adapter] !== "function") {
      // Generic / unrecognized: still fully untrusted; gate only if the payload
      // (or a manual choice) opts into staff-only — never auto-unlock.
      const importStaffOnly = (typeDef && typeDef.staffOnly === true) || sourceStaffOnly;
      return Object.freeze({
        ok: true,
        generic: true,
        reviewOnly: false,
        typeId: resolvedId || "unknown",
        label: typeDef ? typeDef.label : "Unrecognized report",
        selectionMode: choice ? "manual" : "unrecognized",
        autoDetected: false,
        detectedId,
        detectedLabel: detectedId ? labelForType(detectedId) : undefined,
        mismatch: buildMismatch(choice, detectedId, typeDef),
        hasProvider: isObject && Boolean(value.provider),
        claimedValidated: false,
        reason: choice
          ? "Selected type has no adapter; showing a raw JSON field preview."
          : "No known RealForge report type matched these fields. Showing a raw JSON field preview.",
        fields: genericFields(value),
        warnings: [],
        suggestedCommands,
        suggestedCommandsMore,
        untrusted: true,
        staffOnly: importStaffOnly,
        gated: importStaffOnly && !staffMode,
        approvalRequired: false,
        dryRun: false,
        safetyLabels: enforceImportSafetyLabels(importStaffOnly ? ["STAFF ONLY"] : [])
      });
    }

    const adapterResult = adapters[typeDef.adapter](value, { staffMode });
    const data = adapterResult.data;
    const sourceSafetyLabels = data.safetyLabels || [];
    const claimedValidated = sourceSafetyLabels.includes("VALIDATED") || data.status === "VALIDATED";
    // Staff gating is enforced by report type + Workbench state. A staff_only
    // type stays gated even if the payload claims staff_only:false; a payload may
    // only opt INTO stricter gating, never out of it.
    const importStaffOnly = typeDef.staffOnly === true || sourceStaffOnly;

    return Object.freeze({
      ok: true,
      generic: false,
      reviewOnly: typeDef.reviewOnly === true,
      typeId: typeDef.id,
      label: typeDef.label,
      selectionMode: choice ? "manual" : "auto",
      autoDetected: !choice && Boolean(detectedId),
      detectedId,
      detectedLabel: detectedId ? labelForType(detectedId) : undefined,
      mismatch: buildMismatch(choice, detectedId, typeDef),
      meta: {
        id: data.id,
        kind: data.kind,
        provider: data.provider,
        model: data.model,
        createdAt: data.createdAt,
        status: data.status
      },
      hasProvider: Boolean(data.provider),
      claimedValidated,
      // Enforced import trust invariants (payload cannot weaken these):
      untrusted: true,
      safetyLabels: enforceImportSafetyLabels(sourceSafetyLabels),
      staffOnly: importStaffOnly,
      gated: importStaffOnly && !staffMode,
      approvalRequired: data.approvalRequired === true,
      dryRun: data.dryRun === true,
      fields: keyFieldsFromData(data),
      warnings: adapterResult.warnings || [],
      suggestedCommands,
      suggestedCommandsMore
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
    LIMITS: Object.freeze({ MAX_LIST_ITEMS, MAX_TEXT_CHARS, MAX_FIELDS, MAX_COMMANDS }),
    detectReportType,
    parseAndAdapt,
    getSamples,
    getSampleById
  });
})(window);
