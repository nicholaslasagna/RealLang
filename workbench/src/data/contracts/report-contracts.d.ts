export type ReportStatus = "PASS" | "WARN" | "BLOCKED" | "VALIDATED" | "PENDING" | "UNKNOWN";
export type SafetyLabel =
  | "DRY RUN"
  | "UNTRUSTED"
  | "STAFF ONLY"
  | "APPROVAL REQUIRED"
  | "LOCAL ONLY"
  | "NETWORK OFF"
  | "VALIDATED"
  | "READONLY"
  | "NO WRITES";

export interface AdapterWarning {
  path: string;
  code: "missing" | "invalid" | "defaulted";
  message: string;
}

export interface AdapterResult<T> {
  data: T;
  warnings: AdapterWarning[];
}

export interface ReportMeta {
  id: string;
  kind: string;
  createdAt?: string;
  provider?: string;
  model?: string;
  status: ReportStatus;
  safetyLabels: SafetyLabel[];
  untrusted: boolean;
  dryRun: boolean;
  staffOnly: boolean;
  approvalRequired: boolean;
  readonly: boolean;
  noWrites: boolean;
  gated: boolean;
}

export interface DoctorCheck {
  name: string;
  status: "PASS" | "WARN" | "BLOCKED";
  detail: string;
}

export interface DoctorStatusSummary extends ReportMeta {
  workspace: string;
  provider: string;
  network: "ON" | "OFF";
  staffMode: "ON" | "OFF";
  checks: DoctorCheck[];
  totals: { pass: number; warn: number; blocked: number };
}

export interface SettingValue {
  label: string;
  value: string;
  note: string;
  staffOnly: boolean;
}

export interface SettingsSection {
  id: string;
  label: string;
  icon: string;
  values: SettingValue[];
}

export interface SettingsSummary extends ReportMeta {
  sections: SettingsSection[];
}

export interface CapabilityEntry {
  domain: string;
  icon: string;
  status: "available" | "experimental" | "staff-only" | "unavailable";
  safety: string;
  writes: "yes" | "no" | "optional";
  staffRequired: boolean;
  networkRequired: boolean;
  description: string;
  suggestedCommand: string;
}

export interface CapabilityRegistry extends ReportMeta {
  capabilities: CapabilityEntry[];
}

export interface SlashCommandEntry {
  command: string;
  domain: string;
  description: string;
  safety: string;
  writes: "yes" | "no" | "optional";
  staffOnly: boolean;
  networkRequired: boolean;
}

export interface SlashCommandRegistry extends ReportMeta {
  commands: SlashCommandEntry[];
}

export interface EvalReport extends ReportMeta {
  suite: string;
  score: number;
  passed: number;
  failed: number;
  notes: string[];
}

export interface TaskBenchmarkReport extends ReportMeta {
  suite: string;
  taskCount: number;
  score: number;
  gate: number;
  durationMs?: number;
}

export interface SkillDomainScore {
  domain: string;
  score: number;
  taskCount?: number;
}

export interface SkillBenchmarkReport extends ReportMeta {
  suite: string;
  overall: number;
  gate: number;
  taskCount: number;
  domains: SkillDomainScore[];
}

export interface LeaderboardEntry {
  provider: string;
  model?: string;
  score: number;
  domain?: string;
}

export interface LeaderboardSummary extends ReportMeta {
  entries: LeaderboardEntry[];
}

export interface PatchProposal extends ReportMeta {
  title: string;
  summary: string;
  targetFiles: string[];
  patchHash?: string;
  validationCommands: string[];
  risks: string[];
}

export interface ExperimentReport extends ReportMeta {
  proposalId: string;
  isolated: boolean;
  commands: string[];
  results: string[];
}

export interface MergeProposal extends ReportMeta {
  sourceRef: string;
  targetRef: string;
  changeCount: number;
  reviewRequired: boolean;
}

export interface UpdateStage {
  title: string;
  description: string;
  status?: ReportStatus;
}

export interface UpdateBundle extends ReportMeta {
  version: string;
  proposal: PatchProposal;
  stages: UpdateStage[];
  validationSummary: string;
}

export interface SchedulerRunReport extends ReportMeta {
  scheduleId: string;
  runNumber: number;
  candidateCount: number;
  stoppedReason: string;
}

export interface CreativeBrief extends ReportMeta {
  title: string;
  genre?: string;
  goals: string[];
  constraints: string[];
}

export interface MapDesignPlan extends ReportMeta {
  title: string;
  traversal: string[];
  landmarks: string[];
  encounterZones: string[];
  performanceNotes: string[];
}

export interface AssetBrief extends ReportMeta {
  title: string;
  assetType?: string;
  materials: string[];
  collision: string[];
  lods: string[];
}

export interface ImageJob extends ReportMeta {
  title: string;
  task: string;
  intendedUse?: string;
  promptSpecIds: string[];
  outputCount: number;
}

export interface PromptPack extends ReportMeta {
  title: string;
  basePrompt: string;
  negativePrompt?: string;
  variants: string[];
  intendedTool?: string;
}

export interface ReferenceBoard extends ReportMeta {
  title: string;
  referenceHashes: string[];
  styleSummary?: string;
  limitations: string[];
}

export interface VisionReport extends ReportMeta {
  task: string;
  imageHashes: string[];
  observedElements: string[];
  limitations: string[];
  confidence: number;
}

export interface ImageUnderstandingReport extends VisionReport {
  likelyUseCases: string[];
  risks: string[];
  planningNotes: string[];
}

export interface EngineProjectProfile extends ReportMeta {
  engine: string;
  projectName: string;
  projectPath: string;
  modules: string[];
  plugins: string[];
  contentRoots: string[];
}

export interface UnrealPlan extends ReportMeta {
  projectProfileId?: string;
  task: string;
  steps: string[];
  validationChecklist: string[];
}

export interface AssetPipelinePlan extends ReportMeta {
  title: string;
  stages: string[];
  budgets: Record<string, number | string>;
  validationChecklist: string[];
}

export interface BlenderAssetPlan extends ReportMeta {
  title: string;
  modeling: string[];
  uv: string[];
  bake: string[];
  export: string[];
}

export interface EnginePipelineReport extends ReportMeta {
  engine: string;
  operations: string[];
  inertCommands: string[];
  validationResults: string[];
}

// --- Read-only report import (0.3, trust-hardened in 0.3.1) ---

export type ImportFieldType = "text" | "number" | "flag" | "list" | "count" | "more";

export interface ImportPreviewField {
  label: string;
  type: ImportFieldType;
  value: string | number | boolean | string[];
  /** For capped lists: how many items were omitted (+N more). */
  moreCount?: number;
  /** For capped text: how many characters were omitted. */
  truncatedChars?: number;
}

export interface ImportTypeOption {
  id: string;
  label: string;
  adapter: string | null;
  reviewOnly?: boolean;
  /** Report types whose advanced details stay gated regardless of payload. */
  staffOnly?: boolean;
}

export type ImportSelectionMode = "auto" | "manual" | "unrecognized";

export interface ImportTypeMismatch {
  detectedId: string;
  detectedLabel: string;
  selectedLabel: string;
}

/**
 * Result of parsing pasted JSON and running it through an existing adapter.
 * Never describes an executable action: imported reports are read-only and
 * untrusted, and any suggested commands are display-only.
 *
 * Trust invariants (0.3.1): `untrusted` is always true and the payload cannot
 * remove the UNTRUSTED label, claim RealForge verification (a source-declared
 * VALIDATED state surfaces only as `claimedValidated`), or lower `staffOnly`
 * gating for a staff-only report type.
 */
export interface ImportedReportPreview {
  ok: boolean;
  empty?: boolean;
  parseError?: boolean;
  error?: string;
  generic?: boolean;
  reviewOnly: boolean;
  typeId: string;
  label: string;
  selectionMode: ImportSelectionMode;
  autoDetected: boolean;
  detectedId: string | null;
  detectedLabel?: string;
  mismatch?: ImportTypeMismatch | null;
  reason?: string;
  meta?: Pick<ReportMeta, "id" | "kind" | "provider" | "model" | "createdAt" | "status">;
  hasProvider: boolean;
  /** True when the imported JSON merely *claims* validation (not verified). */
  claimedValidated: boolean;
  safetyLabels: SafetyLabel[];
  /** Always true for imported reports; cannot be lowered by the payload. */
  untrusted: boolean;
  staffOnly: boolean;
  gated: boolean;
  approvalRequired?: boolean;
  dryRun?: boolean;
  fields: ImportPreviewField[];
  warnings: AdapterWarning[];
  suggestedCommands: string[];
  suggestedCommandsMore?: number;
}
