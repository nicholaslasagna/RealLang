import { reportAdapters } from "../adapters/report-adapters";
import type {
  AdapterResult,
  AdapterWarning,
  ImportPreviewField,
  ImportedReportPreview,
  ImportParseResult,
  ImportSample,
  ImportTypeMismatch,
  ImportTypeOption,
  ReportAdapterName,
  ReportMeta,
  SafetyLabel
} from "../contracts/report-contracts";
import { fixtureBundle } from "../fixtures";

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
] satisfies readonly ImportTypeOption[]);

const TYPE_BY_ID = Object.freeze(
  Object.fromEntries(IMPORT_TYPES.map((entry) => [entry.id, entry])) as Record<string, ImportTypeOption>
);

const IMPORT_FORCED_LABELS = Object.freeze([
  "UNTRUSTED",
  "READONLY",
  "NO WRITES",
  "LOCAL ONLY",
  "NETWORK OFF"
] satisfies SafetyLabel[]);

const MAX_LIST_ITEMS = 12;
const MAX_TEXT_CHARS = 600;
const MAX_FIELDS = 32;
const MAX_COMMANDS = 12;

const META_KEYS = new Set([
  "id",
  "kind",
  "createdAt",
  "provider",
  "model",
  "status",
  "safetyLabels",
  "untrusted",
  "dryRun",
  "staffOnly",
  "approvalRequired",
  "readonly",
  "noWrites",
  "gated"
]);

const COMMAND_KEYS = Object.freeze([
  "validation_commands",
  "command_suggestions",
  "commands_to_run",
  "inert_commands",
  "commands"
]);

type JsonObject = Record<string, unknown>;
type AdapterFn = (raw: unknown, options?: { staffMode?: boolean }) => AdapterResult<ReportMeta & Record<string, unknown>>;

function hasKey(record: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object" && !Array.isArray(value[0]);
}

function labelForType(id: string | null | undefined): string {
  const entry = id ? TYPE_BY_ID[id] : undefined;
  return entry ? entry.label : id || "unknown";
}

function detectReportType(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonObject;

  if (hasKey(record, "task_results") && hasKey(record, "domain_scores")) return "skill_benchmark";
  if (hasKey(record, "task_results")) return "task_benchmark";
  if (hasKey(record, "tasks") && (hasKey(record, "scores") || hasKey(record, "total_score"))) return "eval_report";
  if (hasKey(record, "domains") && hasKey(record, "overall")) return "skill_benchmark";

  if (hasKey(record, "candidate_version")) return "update_bundle";
  if (hasKey(record, "stages") && hasKey(record, "proposal")) return "update_bundle";
  if (hasKey(record, "proposal_id") && (hasKey(record, "results") || hasKey(record, "commands"))) return "experiment_report";
  if (hasKey(record, "source_ref") || hasKey(record, "target_ref")) return "merge_proposal";
  if (hasKey(record, "patch_sha256") || hasKey(record, "patch_targets")) return "patch_proposal";
  if ((hasKey(record, "patch_hash") || hasKey(record, "unified_diff")) && !hasKey(record, "proposal") && !hasKey(record, "stages")) {
    return "patch_proposal";
  }

  if (hasKey(record, "schedule_id") || (hasKey(record, "run_number") && hasKey(record, "candidate_count"))) return "scheduler_run";
  if (hasKey(record, "capabilities") && Array.isArray(record.capabilities)) return "capability_registry";
  if (hasKey(record, "sections") && Array.isArray(record.sections)) return "settings_summary";
  if (hasKey(record, "checks") && Array.isArray(record.checks)) return "doctor_status";
  if (hasKey(record, "entries") && Array.isArray(record.entries)) return "leaderboard";
  if (hasKey(record, "commands") && isObjectArray(record.commands)) return "slash_command_registry";

  if (
    hasKey(record, "detected_subjects") ||
    hasKey(record, "asset_opportunities") ||
    hasKey(record, "map_design_opportunities") ||
    hasKey(record, "gameplay_relevance") ||
    hasKey(record, "semantic_analysis_performed") ||
    hasKey(record, "likely_use_cases") ||
    hasKey(record, "planning_notes")
  ) {
    return "image_understanding_report";
  }
  if (
    hasKey(record, "observed_elements") ||
    hasKey(record, "image_hashes") ||
    (hasKey(record, "confidence") && hasKey(record, "limitations"))
  ) {
    return "vision_report";
  }
  if (hasKey(record, "variants") && hasKey(record, "base_prompt")) return "prompt_pack";
  if (hasKey(record, "prompt_spec_ids") || (hasKey(record, "task") && hasKey(record, "output_count"))) return "image_job";
  if (hasKey(record, "operations") && hasKey(record, "engine")) return "engine_pipeline_report";
  if (hasKey(record, "stages") && hasKey(record, "title")) return "asset_pipeline_plan";
  if (hasKey(record, "genre") || hasKey(record, "goals")) return "creative_brief";
  if (hasKey(record, "engine") && hasKey(record, "project_path")) return "engine_project_profile";
  if (hasKey(record, "suite") && (hasKey(record, "score") || hasKey(record, "gate"))) return "task_benchmark";

  return null;
}

function humanizeLabel(key: string): string {
  const spaced = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldFromValue(label: string, value: unknown): ImportPreviewField {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (strings.length === value.length) {
      const shown = strings.slice(0, MAX_LIST_ITEMS);
      return { label, type: "list", value: shown, moreCount: strings.length - shown.length };
    }
    return { label, type: "count", value: value.length };
  }
  if (value && typeof value === "object") {
    return { label, type: "count", value: Object.keys(value as object).length };
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

function capFields(fields: ImportPreviewField[]): ImportPreviewField[] {
  if (fields.length <= MAX_FIELDS) return fields;
  const shown = fields.slice(0, MAX_FIELDS);
  shown.push({ label: "", type: "more", value: fields.length - MAX_FIELDS });
  return shown;
}

function keyFieldsFromData(data: Record<string, unknown>): ImportPreviewField[] {
  const fields: ImportPreviewField[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (META_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    fields.push(fieldFromValue(humanizeLabel(key), value));
  }
  return capFields(fields);
}

function genericFields(value: unknown): ImportPreviewField[] {
  if (!value || typeof value !== "object") {
    return [{ label: "Value", type: "text", value: String(value) }];
  }
  if (Array.isArray(value)) return [{ label: "Items", type: "count", value: value.length }];
  const fields = Object.entries(value as JsonObject)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => fieldFromValue(humanizeLabel(key), entry));
  return capFields(fields);
}

function collectSuggestedCommands(value: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as JsonObject;
    for (const key of COMMAND_KEYS) {
      const entry = record[key];
      if (Array.isArray(entry)) {
        for (const item of entry) {
          if (typeof item === "string" && item.trim()) found.push(item.trim());
        }
      }
    }
    if (record.proposal && typeof record.proposal === "object") visit(record.proposal);
  };
  visit(value);
  return [...new Set(found)];
}

function enforceImportSafetyLabels(labels: SafetyLabel[] | undefined): SafetyLabel[] {
  const out: SafetyLabel[] = [...IMPORT_FORCED_LABELS];
  for (const label of labels || []) {
    if (label === "VALIDATED") continue;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

function buildMismatch(
  choice: string | null,
  detectedId: string | null,
  typeDef: ImportTypeOption | undefined
): ImportTypeMismatch | null {
  if (!choice || !detectedId || !typeDef || detectedId === typeDef.id) return null;
  return {
    detectedId,
    detectedLabel: labelForType(detectedId),
    selectedLabel: typeDef.label
  };
}

function getAdapter(name: ReportAdapterName): AdapterFn | null {
  const fn = (reportAdapters as Record<string, AdapterFn | undefined>)[name];
  return typeof fn === "function" ? fn : null;
}

function parseAndAdapt(rawText: string, typeChoice: string, options?: { staffMode?: boolean }): ImportParseResult {
  const staffMode = options?.staffMode === true;
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) {
    return { ok: false, empty: true, error: "Paste a RealForge report as JSON, or load a sample, to preview it." };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, parseError: true, error: `JSON parse error: ${message}` };
  }

  const isObject = value && typeof value === "object" && !Array.isArray(value);
  const record = isObject ? (value as JsonObject) : null;
  const choice = typeChoice && typeChoice !== "auto" ? typeChoice : null;
  const detectedId = isObject ? detectReportType(value) : null;
  const resolvedId = choice || detectedId;
  const typeDef = resolvedId ? TYPE_BY_ID[resolvedId] : undefined;
  const allCommands = collectSuggestedCommands(value);
  const suggestedCommands = allCommands.slice(0, MAX_COMMANDS);
  const suggestedCommandsMore = Math.max(0, allCommands.length - suggestedCommands.length);
  const sourceStaffOnly = Boolean(record && record.staff_only === true);

  if (!typeDef || !typeDef.adapter) {
    const importStaffOnly = typeDef?.staffOnly === true || sourceStaffOnly;
    const preview: ImportedReportPreview = {
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
      hasProvider: Boolean(record?.provider),
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
    };
    return Object.freeze(preview);
  }

  const adapter = getAdapter(typeDef.adapter);
  if (!adapter) {
    const importStaffOnly = typeDef.staffOnly === true || sourceStaffOnly;
    const preview: ImportedReportPreview = {
      ok: true,
      generic: true,
      reviewOnly: false,
      typeId: resolvedId || "unknown",
      label: typeDef.label,
      selectionMode: choice ? "manual" : "unrecognized",
      autoDetected: false,
      detectedId,
      detectedLabel: detectedId ? labelForType(detectedId) : undefined,
      mismatch: buildMismatch(choice, detectedId, typeDef),
      hasProvider: Boolean(record?.provider),
      claimedValidated: false,
      reason: "Selected type has no adapter; showing a raw JSON field preview.",
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
    };
    return Object.freeze(preview);
  }

  const adapterResult = adapter(value, { staffMode });
  const data = adapterResult.data;
  const sourceSafetyLabels = data.safetyLabels || [];
  const claimedValidated = sourceSafetyLabels.includes("VALIDATED") || data.status === "VALIDATED";
  const importStaffOnly = typeDef.staffOnly === true || sourceStaffOnly;

  const preview: ImportedReportPreview = {
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
    untrusted: true,
    safetyLabels: enforceImportSafetyLabels(sourceSafetyLabels),
    staffOnly: importStaffOnly,
    gated: importStaffOnly && !staffMode,
    approvalRequired: data.approvalRequired === true,
    dryRun: data.dryRun === true,
    fields: keyFieldsFromData(data),
    warnings: (adapterResult.warnings || []) as AdapterWarning[],
    suggestedCommands,
    suggestedCommandsMore
  };
  return Object.freeze(preview);
}

function getSamples(): ImportSample[] {
  const fixtures = fixtureBundle;
  const studio =
    fixtures.studioReports && typeof fixtures.studioReports === "object" ? fixtures.studioReports : ({} as JsonObject);
  const candidates = [
    { id: "skill", label: "Skill benchmark", value: fixtures.skillBenchmark },
    { id: "update", label: "Update bundle + proposal", value: fixtures.updateBundle },
    {
      id: "creative",
      label: "Creative brief",
      value: (studio.creative as JsonObject | undefined)?.report
    },
    {
      id: "vision",
      label: "Vision report",
      value: (studio.vision as JsonObject | undefined)?.report
    },
    { id: "settings", label: "Settings summary", value: fixtures.settings },
    { id: "capabilities", label: "Capability registry", value: fixtures.capabilities }
  ];
  return candidates
    .filter((entry) => entry.value && typeof entry.value === "object")
    .map((entry) => ({ id: entry.id, label: entry.label, json: JSON.stringify(entry.value, null, 2) }));
}

function getSampleById(id: string): ImportSample | null {
  return getSamples().find((sample) => sample.id === id) ?? null;
}

export interface ReportImportApi {
  readonly IMPORT_TYPES: readonly ImportTypeOption[];
  readonly LIMITS: Readonly<{
    readonly MAX_LIST_ITEMS: number;
    readonly MAX_TEXT_CHARS: number;
    readonly MAX_FIELDS: number;
    readonly MAX_COMMANDS: number;
  }>;
  detectReportType(value: unknown): string | null;
  parseAndAdapt(rawText: string, typeChoice: string, options?: { staffMode?: boolean }): ImportParseResult;
  getSamples(): ImportSample[];
  getSampleById(id: string): ImportSample | null;
}

export const reportImport: ReportImportApi = Object.freeze({
  IMPORT_TYPES,
  LIMITS: Object.freeze({ MAX_LIST_ITEMS, MAX_TEXT_CHARS, MAX_FIELDS, MAX_COMMANDS }),
  detectReportType,
  parseAndAdapt,
  getSamples,
  getSampleById
});
