(function registerReportAdapters(global) {
  "use strict";

  const status = global.RealForgeDataStatus;
  if (!status) throw new Error("RealForgeDataStatus must load before report adapters");

  const { STATUS, SAFETY, normalizeStatus, normalizeSafetyLabels, warning, asObject, readString, readBoolean, readNumber, readArray } = status;

  function stringList(source, key, warnings) {
    return readArray(source, key, warnings).flatMap((value, index) => {
      if (typeof value === "string" && value.trim()) return [value.trim()];
      warnings.push(warning(`${key}[${index}]`, "invalid", "Expected a non-empty string; item was ignored."));
      return [];
    });
  }

  function objectList(source, key, warnings) {
    return readArray(source, key, warnings).flatMap((value, index) => {
      if (value && typeof value === "object" && !Array.isArray(value)) return [value];
      warnings.push(warning(`${key}[${index}]`, "invalid", "Expected an object; item was ignored."));
      return [];
    });
  }

  function boundedScore(value) {
    return Math.max(0, Math.min(1, value));
  }

  function adaptMeta(raw, kind, warnings, options = {}) {
    const source = asObject(raw, warnings);
    const provider = readString(source, "provider", warnings);
    const untrusted = typeof source.untrusted === "boolean" ? source.untrusted : Boolean(provider) || options.defaultUntrusted === true;
    if (source.untrusted === undefined && untrusted) warnings.push(warning("untrusted", "defaulted", "Provider or generated output defaults to untrusted."));
    const dryRun = readBoolean(source, "dry_run", warnings, options.dryRun === true);
    const staffOnly = readBoolean(source, "staff_only", warnings, options.staffOnly === true);
    const approvalRequired = readBoolean(source, "approval_required", warnings, options.approvalRequired === true);
    const readonly = readBoolean(source, "readonly", warnings, options.readonly !== false);
    const noWrites = readBoolean(source, "no_writes", warnings, options.noWrites !== false);
    const labels = [];
    if (untrusted) labels.push(SAFETY.UNTRUSTED);
    if (dryRun) labels.push(SAFETY.DRY_RUN);
    if (staffOnly) labels.push(SAFETY.STAFF_ONLY);
    if (approvalRequired) labels.push(SAFETY.APPROVAL_REQUIRED);
    if (readonly) labels.push(SAFETY.READONLY);
    if (noWrites) labels.push(SAFETY.NO_WRITES);
    if (options.localOnly !== false) labels.push(SAFETY.LOCAL_ONLY);
    if (options.networkOff !== false) labels.push(SAFETY.NETWORK_OFF);
    const reportStatus = normalizeStatus(source.status, options.status || STATUS.UNKNOWN);
    if (reportStatus === STATUS.VALIDATED) labels.push(SAFETY.VALIDATED);
    return {
      source,
      meta: {
        id: readString(source, "id", warnings, `${kind}-unknown`),
        kind,
        createdAt: readString(source, "created_at", warnings) || undefined,
        provider: provider || undefined,
        model: readString(source, "model", warnings) || undefined,
        status: reportStatus,
        safetyLabels: normalizeSafetyLabels(source.safety_labels, labels),
        untrusted,
        dryRun,
        staffOnly,
        approvalRequired,
        readonly,
        noWrites,
        gated: staffOnly && options.staffMode !== true
      }
    };
  }

  function result(data, warnings) {
    return Object.freeze({ data: Object.freeze(data), warnings: Object.freeze(warnings) });
  }

  function adaptDoctorSummary(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "doctor_status", warnings, { status: STATUS.WARN });
    const checks = objectList(source, "checks", warnings).map((check, index) => ({
      name: readString(check, "name", warnings, `Check ${index + 1}`, true),
      status: normalizeStatus(check.status, STATUS.WARN),
      detail: readString(check, "detail", warnings, "No detail supplied.")
    }));
    const totals = checks.reduce((counts, check) => {
      if (check.status === STATUS.PASS) counts.pass += 1;
      else if (check.status === STATUS.BLOCKED) counts.blocked += 1;
      else counts.warn += 1;
      return counts;
    }, { pass: 0, warn: 0, blocked: 0 });
    return result({ ...meta, workspace: readString(source, "workspace", warnings, "RealLang"), provider: readString(source, "provider", warnings, "mock"), network: readString(source, "network", warnings, "OFF").toUpperCase() === "ON" ? "ON" : "OFF", staffMode: readString(source, "staff_mode", warnings, "OFF").toUpperCase() === "ON" ? "ON" : "OFF", checks, totals }, warnings);
  }

  function adaptSettingsSummary(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "settings_summary", warnings, { status: STATUS.PASS });
    const sections = objectList(source, "sections", warnings).map((section, sectionIndex) => ({
      id: readString(section, "id", warnings, `section-${sectionIndex + 1}`, true),
      label: readString(section, "label", warnings, `Section ${sectionIndex + 1}`, true),
      icon: readString(section, "icon", warnings, "settings"),
      values: objectList(section, "values", warnings).map((entry, entryIndex) => ({
        label: readString(entry, "label", warnings, `Value ${entryIndex + 1}`, true),
        value: readString(entry, "value", warnings, "UNKNOWN"),
        note: readString(entry, "note", warnings, "No additional detail."),
        staffOnly: readBoolean(entry, "staff_only", warnings, false)
      }))
    }));
    return result({ ...meta, sections }, warnings);
  }

  function adaptCapabilityRegistry(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "capability_registry", warnings, { status: STATUS.PASS });
    const capabilities = objectList(source, "capabilities", warnings).map((entry, index) => {
      const statusValue = readString(entry, "status", warnings, "unavailable").toLowerCase();
      const allowedStatus = ["available", "experimental", "staff-only", "unavailable"].includes(statusValue) ? statusValue : "unavailable";
      if (allowedStatus !== statusValue) warnings.push(warning(`capabilities[${index}].status`, "invalid", "Unknown capability status; using unavailable."));
      // Real `realforge capabilities --json` uses safety_level / writes_files /
      // requires_staff / requires_network / next_suggested_command. Fall back to
      // those when the simplified fixture field names are absent.
      const safety = (typeof entry.safety === "string" && entry.safety.trim())
        ? entry.safety.trim()
        : readString(entry, "safety_level", warnings, "read-only");
      let writes;
      if (entry.writes !== undefined) {
        const value = readString(entry, "writes", warnings, "no").toLowerCase();
        writes = ["yes", "no", "optional"].includes(value) ? value : "no";
      } else if (typeof entry.writes_files === "boolean") {
        writes = entry.writes_files ? "yes" : "no";
      } else {
        writes = "no";
      }
      const staffRequired = entry.staff_required !== undefined
        ? readBoolean(entry, "staff_required", warnings, allowedStatus === "staff-only")
        : readBoolean(entry, "requires_staff", warnings, allowedStatus === "staff-only");
      const networkRequired = entry.network_required !== undefined
        ? readBoolean(entry, "network_required", warnings, false)
        : readBoolean(entry, "requires_network", warnings, false);
      const suggestedCommand = (typeof entry.suggested_command === "string" && entry.suggested_command.trim())
        ? entry.suggested_command.trim()
        : readString(entry, "next_suggested_command", warnings, "realforge capabilities");
      return {
        domain: readString(entry, "domain", warnings, `capability-${index + 1}`, true),
        icon: readString(entry, "icon", warnings, "blocks"),
        status: allowedStatus,
        safety,
        writes,
        staffRequired,
        networkRequired,
        description: readString(entry, "description", warnings, "No capability description supplied."),
        suggestedCommand
      };
    });
    return result({ ...meta, capabilities }, warnings);
  }

  function adaptSlashCommandRegistry(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "slash_command_registry", warnings, { status: STATUS.PASS });
    const commands = objectList(source, "commands", warnings).map((entry, index) => {
      const writes = readString(entry, "writes", warnings, "no").toLowerCase();
      // Real `realforge slash --json` uses shortcut / safety_label / requires_staff
      // / maps_to. Fall back to those when the simplified field names are absent.
      const command = (typeof entry.command === "string" && entry.command.trim())
        ? entry.command.trim()
        : (typeof entry.shortcut === "string" && entry.shortcut.trim())
          ? entry.shortcut.trim()
          : readString(entry, "command", warnings, `/unknown-${index + 1}`, true);
      const safety = (typeof entry.safety === "string" && entry.safety.trim())
        ? entry.safety.trim().toUpperCase()
        : readString(entry, "safety_label", warnings, SAFETY.UNTRUSTED).toUpperCase();
      const staffOnly = entry.staff_only !== undefined
        ? readBoolean(entry, "staff_only", warnings, false)
        : readBoolean(entry, "requires_staff", warnings, false);
      return {
        command,
        domain: readString(entry, "domain", warnings, "core"),
        description: readString(entry, "description", warnings, "No command description supplied."),
        safety,
        writes: ["yes", "no", "optional"].includes(writes) ? writes : "no",
        staffOnly,
        networkRequired: readBoolean(entry, "network_required", warnings, false),
        mapsTo: readString(entry, "maps_to", warnings) || undefined
      };
    });
    return result({ ...meta, commands }, warnings);
  }

  function adaptEvalReport(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "eval_report", warnings, { defaultUntrusted: true });
    // Real RealForge eval reports use `passed` as a boolean and `failures` as a
    // list; older/simplified shapes use numeric passed/failed counts. Support both.
    const passed = typeof source.passed === "boolean"
      ? source.passed
      : (source.passed === undefined ? undefined : readNumber(source, "passed", warnings, 0));
    const taskCount = Array.isArray(source.tasks)
      ? source.tasks.length
      : (source.task_count === undefined ? undefined : readNumber(source, "task_count", warnings, 0));
    return result({
      ...meta,
      suite: readString(source, "suite", warnings, "unknown", true),
      score: source.score === undefined ? undefined : boundedScore(readNumber(source, "score", warnings, 0)),
      totalScore: source.total_score === undefined ? undefined : readNumber(source, "total_score", warnings, 0),
      taskCount,
      passed,
      failed: source.failed === undefined ? undefined : readNumber(source, "failed", warnings, 0),
      failures: stringList(source, "failures", warnings),
      notes: stringList(source, "notes", warnings),
      safetyNotes: stringList(source, "safety_notes", warnings)
    }, warnings);
  }

  function adaptTaskBenchmarkReport(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "task_benchmark", warnings, { status: STATUS.PENDING });
    return result({ ...meta, suite: readString(source, "suite", warnings, "unknown", true), taskCount: readNumber(source, "task_count", warnings, 0), score: boundedScore(readNumber(source, "score", warnings, 0)), gate: boundedScore(readNumber(source, "gate", warnings, 0)), durationMs: source.duration_ms === undefined ? undefined : readNumber(source, "duration_ms", warnings, 0) }, warnings);
  }

  function adaptSkillBenchmarkReport(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "skill_benchmark", warnings, { status: STATUS.PENDING });
    let domains = objectList(source, "domains", warnings).map((entry, index) => ({
      domain: readString(entry, "domain", warnings, `domain-${index + 1}`, true),
      score: boundedScore(readNumber(entry, "score", warnings, 0)),
      taskCount: entry.task_count === undefined ? undefined : readNumber(entry, "task_count", warnings, 0)
    }));
    // Real RealForge 2.7 skill-bench reports carry `domain_scores` as a
    // { domain: score } map and `normalized_score`/`task_results` instead of
    // `overall`/`task_count`. Fall back to those when the simplified fields are absent.
    if (!domains.length && source.domain_scores && typeof source.domain_scores === "object" && !Array.isArray(source.domain_scores)) {
      domains = Object.entries(source.domain_scores)
        .filter(([, score]) => typeof score === "number" && Number.isFinite(score))
        .map(([domain, score]) => ({ domain, score: boundedScore(score), taskCount: undefined }));
    }
    const overall = source.overall !== undefined
      ? boundedScore(readNumber(source, "overall", warnings, 0))
      : (source.normalized_score !== undefined ? boundedScore(readNumber(source, "normalized_score", warnings, 0)) : 0);
    const taskCount = source.task_count !== undefined
      ? readNumber(source, "task_count", warnings, 0)
      : (Array.isArray(source.task_results) ? source.task_results.length : 0);
    return result({
      ...meta,
      suite: readString(source, "suite", warnings, "unknown", true),
      overall,
      gate: source.gate === undefined ? undefined : boundedScore(readNumber(source, "gate", warnings, 0)),
      normalizedScore: source.normalized_score === undefined ? undefined : boundedScore(readNumber(source, "normalized_score", warnings, 0)),
      totalScore: source.total_score === undefined ? undefined : readNumber(source, "total_score", warnings, 0),
      passed: typeof source.passed === "boolean" ? source.passed : undefined,
      safetyFailures: stringList(source, "safety_failures", warnings),
      taskCount,
      domains
    }, warnings);
  }

  function adaptLeaderboardSummary(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "leaderboard", warnings, { status: STATUS.PENDING });
    const entries = objectList(source, "entries", warnings).map((entry, index) => ({ provider: readString(entry, "provider", warnings, `provider-${index + 1}`, true), model: readString(entry, "model", warnings) || undefined, score: boundedScore(readNumber(entry, "score", warnings, 0)), domain: readString(entry, "domain", warnings) || undefined }));
    return result({ ...meta, entries }, warnings);
  }

  function adaptPatchProposal(raw, options = {}) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "patch_proposal", warnings, { defaultUntrusted: true, dryRun: true, approvalRequired: true, ...options });
    // Real RealForge patch proposals use patch_targets/files_to_modify and
    // patch_sha256; the simplified shape uses target_files/patch_hash.
    let targetFiles;
    if (source.target_files !== undefined) targetFiles = stringList(source, "target_files", warnings);
    else if (source.patch_targets !== undefined) targetFiles = stringList(source, "patch_targets", warnings);
    else targetFiles = stringList(source, "files_to_modify", warnings);
    const patchHash = readString(source, "patch_hash", warnings) || readString(source, "patch_sha256", warnings) || undefined;
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled patch proposal"), summary: readString(source, "summary", warnings, "No proposal summary supplied."), targetFiles, patchHash, validationCommands: stringList(source, "validation_commands", warnings), risks: stringList(source, "risks", warnings), unifiedDiff: readString(source, "unified_diff", warnings) || undefined }, warnings);
  }

  function adaptExperimentReport(raw, options = {}) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "experiment_report", warnings, { defaultUntrusted: true, dryRun: true, ...options });
    return result({ ...meta, proposalId: readString(source, "proposal_id", warnings, "unknown", true), isolated: readBoolean(source, "isolated", warnings, true), commands: stringList(source, "commands", warnings), results: stringList(source, "results", warnings) }, warnings);
  }

  function adaptMergeProposal(raw, options = {}) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "merge_proposal", warnings, { defaultUntrusted: true, approvalRequired: true, ...options });
    return result({ ...meta, sourceRef: readString(source, "source_ref", warnings, "unknown", true), targetRef: readString(source, "target_ref", warnings, "unknown", true), changeCount: readNumber(source, "change_count", warnings, 0), reviewRequired: readBoolean(source, "review_required", warnings, true) }, warnings);
  }

  function adaptUpdateBundle(raw, options = {}) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "update_bundle", warnings, { defaultUntrusted: true, dryRun: true, staffOnly: true, approvalRequired: true, ...options });
    const proposalResult = adaptPatchProposal(source.proposal, options);
    warnings.push(...proposalResult.warnings.map((item) => ({ ...item, path: `proposal.${item.path}` })));
    const stages = objectList(source, "stages", warnings).map((stage, index) => ({ title: readString(stage, "title", warnings, `Stage ${index + 1}`, true), description: readString(stage, "description", warnings, "No stage description supplied."), status: normalizeStatus(stage.status, STATUS.PENDING) }));
    return result({ ...meta, version: readString(source, "version", warnings, "0.0.0"), proposal: proposalResult.data, stages, validationSummary: readString(source, "validation_summary", warnings, "Validation has not run.") }, warnings);
  }

  function adaptSchedulerRunReport(raw, options = {}) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "scheduler_run", warnings, { staffOnly: true, dryRun: true, ...options });
    return result({ ...meta, scheduleId: readString(source, "schedule_id", warnings, "unknown", true), runNumber: readNumber(source, "run_number", warnings, 0), candidateCount: readNumber(source, "candidate_count", warnings, 0), stoppedReason: readString(source, "stopped_reason", warnings, "No run executed.") }, warnings);
  }

  function adaptCreativeBrief(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "creative_brief", warnings, { defaultUntrusted: true, dryRun: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled creative brief"), genre: readString(source, "genre", warnings) || undefined, goals: stringList(source, "goals", warnings), constraints: stringList(source, "constraints", warnings) }, warnings);
  }

  function adaptMapDesignPlan(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "map_design_plan", warnings, { defaultUntrusted: true, dryRun: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled map plan"), traversal: stringList(source, "traversal", warnings), landmarks: stringList(source, "landmarks", warnings), encounterZones: stringList(source, "encounter_zones", warnings), performanceNotes: stringList(source, "performance_notes", warnings) }, warnings);
  }

  function adaptAssetBrief(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "asset_brief", warnings, { defaultUntrusted: true, dryRun: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled asset brief"), assetType: readString(source, "asset_type", warnings) || undefined, materials: stringList(source, "materials", warnings), collision: stringList(source, "collision", warnings), lods: stringList(source, "lods", warnings) }, warnings);
  }

  function adaptImageJob(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "image_job", warnings, { defaultUntrusted: true, dryRun: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled image job"), task: readString(source, "task", warnings, "No task supplied."), intendedUse: readString(source, "intended_use", warnings) || undefined, promptSpecIds: stringList(source, "prompt_spec_ids", warnings), outputCount: readNumber(source, "output_count", warnings, 1) }, warnings);
  }

  function adaptPromptPack(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "prompt_pack", warnings, { defaultUntrusted: true, dryRun: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled prompt pack"), basePrompt: readString(source, "base_prompt", warnings, "", true), negativePrompt: readString(source, "negative_prompt", warnings) || undefined, variants: stringList(source, "variants", warnings), intendedTool: readString(source, "intended_tool", warnings) || undefined }, warnings);
  }

  function adaptReferenceBoard(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "reference_board", warnings, { defaultUntrusted: true, readonly: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled reference board"), referenceHashes: stringList(source, "reference_hashes", warnings), styleSummary: readString(source, "style_summary", warnings) || undefined, limitations: stringList(source, "limitations", warnings) }, warnings);
  }

  function adaptVisionReport(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "vision_report", warnings, { defaultUntrusted: true, readonly: true });
    // Real RealForge vision/understanding reports use `image_sha256_values`.
    const imageHashes = source.image_hashes !== undefined
      ? stringList(source, "image_hashes", warnings)
      : stringList(source, "image_sha256_values", warnings);
    return result({ ...meta, task: readString(source, "task", warnings, "No vision task supplied."), imageHashes, observedElements: stringList(source, "observed_elements", warnings), limitations: stringList(source, "limitations", warnings), confidence: boundedScore(readNumber(source, "confidence", warnings, 0)) }, warnings);
  }

  function adaptImageUnderstandingReport(raw) {
    const base = adaptVisionReport(raw);
    const warnings = [...base.warnings];
    const source = asObject(raw, warnings);
    // Support both the simplified shape (likely_use_cases/planning_notes) and the
    // real RealForge 2.7 ImageUnderstandingReport fields.
    return result({
      ...base.data,
      kind: "image_understanding_report",
      detectedSubjects: stringList(source, "detected_subjects", warnings),
      likelyUseCases: stringList(source, "likely_use_cases", warnings),
      assetOpportunities: stringList(source, "asset_opportunities", warnings),
      mapDesignOpportunities: stringList(source, "map_design_opportunities", warnings),
      gameplayRelevance: stringList(source, "gameplay_relevance", warnings),
      planningNotes: stringList(source, "planning_notes", warnings),
      risks: stringList(source, "risks", warnings),
      semanticAnalysisPerformed: typeof source.semantic_analysis_performed === "boolean" ? source.semantic_analysis_performed : undefined
    }, warnings);
  }

  function adaptEngineProjectProfile(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "engine_project_profile", warnings, { readonly: true, noWrites: true });
    return result({ ...meta, engine: readString(source, "engine", warnings, "unknown"), projectName: readString(source, "project_name", warnings, "Unknown project"), projectPath: readString(source, "project_path", warnings, "."), modules: stringList(source, "modules", warnings), plugins: stringList(source, "plugins", warnings), contentRoots: stringList(source, "content_roots", warnings) }, warnings);
  }

  function adaptUnrealPlan(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "unreal_plan", warnings, { defaultUntrusted: true, dryRun: true, approvalRequired: true });
    return result({ ...meta, projectProfileId: readString(source, "project_profile_id", warnings) || undefined, task: readString(source, "task", warnings, "No Unreal task supplied."), steps: stringList(source, "steps", warnings), validationChecklist: stringList(source, "validation_checklist", warnings) }, warnings);
  }

  function adaptAssetPipelinePlan(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "asset_pipeline_plan", warnings, { defaultUntrusted: true, dryRun: true, approvalRequired: true });
    const budgets = source.budgets && typeof source.budgets === "object" && !Array.isArray(source.budgets) ? source.budgets : {};
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled asset pipeline"), stages: stringList(source, "stages", warnings), budgets, validationChecklist: stringList(source, "validation_checklist", warnings) }, warnings);
  }

  function adaptBlenderAssetPlan(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "blender_asset_plan", warnings, { defaultUntrusted: true, dryRun: true, approvalRequired: true });
    return result({ ...meta, title: readString(source, "title", warnings, "Untitled Blender asset plan"), modeling: stringList(source, "modeling", warnings), uv: stringList(source, "uv", warnings), bake: stringList(source, "bake", warnings), export: stringList(source, "export", warnings) }, warnings);
  }

  function adaptEnginePipelineReport(raw) {
    const warnings = [];
    const { source, meta } = adaptMeta(raw, "engine_pipeline_report", warnings, { defaultUntrusted: true, dryRun: true, approvalRequired: true });
    return result({ ...meta, engine: readString(source, "engine", warnings, "unknown"), operations: stringList(source, "operations", warnings), inertCommands: stringList(source, "inert_commands", warnings), validationResults: stringList(source, "validation_results", warnings) }, warnings);
  }

  global.RealForgeReportAdapters = Object.freeze({
    adaptDoctorSummary,
    adaptSettingsSummary,
    adaptCapabilityRegistry,
    adaptSlashCommandRegistry,
    adaptEvalReport,
    adaptTaskBenchmarkReport,
    adaptSkillBenchmarkReport,
    adaptLeaderboardSummary,
    adaptPatchProposal,
    adaptExperimentReport,
    adaptMergeProposal,
    adaptUpdateBundle,
    adaptSchedulerRunReport,
    adaptCreativeBrief,
    adaptMapDesignPlan,
    adaptAssetBrief,
    adaptImageJob,
    adaptPromptPack,
    adaptReferenceBoard,
    adaptVisionReport,
    adaptImageUnderstandingReport,
    adaptEngineProjectProfile,
    adaptUnrealPlan,
    adaptAssetPipelinePlan,
    adaptBlenderAssetPlan,
    adaptEnginePipelineReport
  });
})(window);
