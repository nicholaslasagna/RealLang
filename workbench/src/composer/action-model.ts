import { cliReportSources } from "../data/cli/cli-report-sources";
import type { ApprovedDryRunActionId } from "../bridge/types";

export type ActionCategory =
  | "read_only_report"
  | "plan"
  | "check"
  | "repair_dry_run"
  | "research_plan"
  | "creative_plan"
  | "image_plan"
  | "vision_plan"
  | "engine_plan"
  | "asset_pipeline_plan"
  | "benchmark_run"
  | "proposal_review"
  | "update_review"
  | "staff_improvement_dry_run"
  | "write_action_preview_only";

export type ActionExecutionStatus =
  | "preview_only"
  | "unsupported"
  | "read_only_available"
  | "approval_required"
  | "approval_bridge_required";

export type ComposerSafetyLabel =
  | "PREVIEW ONLY"
  | "UNTRUSTED"
  | "DRY RUN"
  | "STAFF ONLY"
  | "APPROVAL REQUIRED"
  | "APPROVAL BRIDGE REQUIRED"
  | "READONLY"
  | "NO WRITES"
  | "LOCAL ONLY"
  | "NETWORK OFF";

export type FixedReadOnlySourceId = "capabilities" | "slash" | "settings-doctor";

export interface CommandActionDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: ActionCategory;
  readonly description: string;
  readonly source: string;
  readonly domain: string;
  readonly slashCommands: readonly string[];
  readonly staffRequired: boolean;
  readonly writesFiles: boolean;
  readonly runsCommands: boolean;
  readonly networkRequired: boolean;
  readonly approvalRequired: boolean;
  readonly destructive: boolean;
  readonly supportedInWeb: boolean;
  readonly supportedInDesktop: boolean;
  readonly safetyLabels: readonly ComposerSafetyLabel[];
  readonly fixedSourceId?: FixedReadOnlySourceId;
  readonly approvedDryRunActionId?: ApprovedDryRunActionId;
  readonly fixedArgvTemplate?: readonly string[];
  readonly allowedInputs?: readonly string[];
  /** Display-only tokens. These are never passed to IPC or a process API. */
  readonly proposedArgvPreview?: readonly string[];
  readonly warnings: readonly string[];
  readonly futureRequirements: readonly string[];
  readonly nextSafeStep: string;
}

export interface ComposerRuntimeContext {
  readonly runtime: "web" | "desktop";
  readonly bridgeHealthy: boolean;
  readonly staffMode: boolean;
  readonly allowlistedSourceIds: readonly string[];
}

export interface ComposedAction extends CommandActionDefinition {
  readonly actionId: string;
  readonly currentExecutionStatus: ActionExecutionStatus;
  readonly runtimeWarnings: readonly string[];
  readonly canLoadNow: boolean;
  readonly canRequestApproval: boolean;
}

const NO_WRITE_REQUIREMENTS = Object.freeze([
  "Review generated output as untrusted",
  "Validate the resulting report before relying on it"
]);

const FUTURE_WRITE_REQUIREMENTS = Object.freeze([
  "Approval-gated bridge",
  "Dry-run first",
  "Validation command",
  "Patch target review",
  "Rollback plan"
]);

const definitions = [
  {
    id: "load-capabilities",
    title: "Load capabilities report",
    category: "read_only_report",
    description: "Load the fixed capability registry source through the existing read-only desktop bridge.",
    source: "realforge_cli_allowlist",
    domain: "capabilities",
    slashCommands: [],
    staffRequired: false,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: false,
    supportedInDesktop: true,
    safetyLabels: ["READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF", "UNTRUSTED"],
    fixedSourceId: "capabilities",
    proposedArgvPreview: ["realforge", "capabilities", "--json"],
    warnings: ["Loaded output remains untrusted until adapted and reviewed."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Use Load now only when the desktop bridge reports healthy."
  },
  {
    id: "load-slash-registry",
    title: "Load slash registry",
    category: "read_only_report",
    description: "Load the fixed slash-command registry source through the existing read-only desktop bridge.",
    source: "realforge_cli_allowlist",
    domain: "system",
    slashCommands: [],
    staffRequired: false,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: false,
    supportedInDesktop: true,
    safetyLabels: ["READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF", "UNTRUSTED"],
    fixedSourceId: "slash",
    proposedArgvPreview: ["realforge", "slash", "--json"],
    warnings: ["Registry output is imported as untrusted JSON."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Confirm desktop bridge health before loading the fixed source ID."
  },
  {
    id: "settings-doctor",
    title: "Run settings doctor",
    category: "check",
    description: "Load the fixed settings-doctor safety report through the read-only desktop bridge.",
    source: "realforge_cli_allowlist",
    domain: "system",
    slashCommands: ["/doctor", "/settings"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: false,
    supportedInDesktop: true,
    safetyLabels: ["READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF", "UNTRUSTED"],
    fixedSourceId: "settings-doctor",
    proposedArgvPreview: ["realforge", "settings", "doctor", "--json"],
    warnings: ["A PASS value is report data and still enters the untrusted import pipeline."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Load only from the allowlisted settings-doctor source ID."
  },
  {
    id: "general-plan",
    title: "Compose a local task plan",
    category: "plan",
    description: "Preview a bounded provider-planning request without calling a provider or changing the workspace.",
    source: "composer_preview",
    domain: "core",
    slashCommands: ["/ask", "/plan"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "plan", "<reviewed-task>", "--json"],
    warnings: ["No provider is called. Any future provider output remains untrusted."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Review task scope and expected validation before provider use."
  },
  {
    id: "workspace-context-preview",
    title: "Build workspace context preview",
    category: "plan",
    description: "Preview a bounded workspace-context request without reading files in web mode.",
    source: "composer_preview",
    domain: "code",
    slashCommands: ["/context"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "context", "<reviewed-scope>", "--json"],
    warnings: ["No workspace files are read by the 0.11 composer."],
    futureRequirements: ["Workspace-relative scope validation", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Review the intended directory and file boundaries."
  },
  {
    id: "check-reallang-file",
    title: "Check the fixed hello.real example",
    category: "check",
    description: "Run one approval-gated RealLang typecheck against the fixed examples/hello.real target.",
    source: "approved_dry_run_bridge",
    domain: "code",
    slashCommands: ["/check"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: false,
    supportedInDesktop: true,
    safetyLabels: ["UNTRUSTED", "DRY RUN", "APPROVAL REQUIRED", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    approvedDryRunActionId: "realc-check-hello-example",
    fixedArgvTemplate: ["realc", "examples/hello.real", "--check"],
    allowedInputs: ["approvalAcknowledged: true"],
    proposedArgvPreview: ["realc", "examples/hello.real", "--check"],
    warnings: ["Execution output remains untrusted. The target and argv cannot be changed in 0.12."],
    futureRequirements: ["Explicit local check approval", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Review the exact fixed check, then explicitly approve one local run."
  },
  {
    id: "repair-diagnostic-dry-run",
    title: "Repair diagnostic dry-run",
    category: "repair_dry_run",
    description: "Compose a conservative repair plan without changing a source file.",
    source: "composer_preview",
    domain: "code",
    slashCommands: ["/repair"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "APPROVAL REQUIRED", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "repair", "<diagnostic-id>", "--dry-run", "--json"],
    warnings: ["Repair execution is not wired. The preview cannot mutate workspace files."],
    futureRequirements: FUTURE_WRITE_REQUIREMENTS,
    nextSafeStep: "Review diagnostic scope and validation commands before any future approval request."
  },
  {
    id: "research-plan",
    title: "Plan permissioned research",
    category: "research_plan",
    description: "Compose a research plan with an explicit future domain allowlist.",
    source: "composer_preview",
    domain: "research",
    slashCommands: ["/research"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: true,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "APPROVAL REQUIRED", "NO WRITES"],
    proposedArgvPreview: ["realforge", "research", "<approved-url>", "--allow-domain", "<approved-domain>", "--dry-run"],
    warnings: ["Network remains off. No URL or domain is accepted for execution in 0.11."],
    futureRequirements: ["Explicit network permission", "Domain allowlist", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Define research scope without enabling network access."
  },
  {
    id: "creative-brief",
    title: "Generate creative brief",
    category: "creative_plan",
    description: "Compose an untrusted creative-planning request for later provider execution.",
    source: "composer_preview",
    domain: "creative",
    slashCommands: ["/creative brief", "/creative map"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "creative", "brief", "--task", "<reviewed-task>", "--json"],
    warnings: ["No provider is called. Generated planning output would remain untrusted."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Review the brief intent and constraints before provider use."
  },
  {
    id: "image-prompt-pack",
    title: "Generate image prompt pack",
    category: "image_plan",
    description: "Compose a prompt-pack planning request without generating binary images.",
    source: "composer_preview",
    domain: "image",
    slashCommands: ["/image prompt", "/image job"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "image", "prompt-pack", "--task", "<reviewed-task>", "--json"],
    warnings: ["No binary image generation or provider call occurs in 0.11."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Review prompt intent, provenance needs, and output constraints."
  },
  {
    id: "vision-analysis",
    title: "Analyze concept image",
    category: "vision_plan",
    description: "Compose an image-understanding plan without reading a file or calling a vision provider.",
    source: "composer_preview",
    domain: "vision",
    slashCommands: ["/vision analyze", "/vision understand"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "vision", "understand", "--image", "<selected-workspace-image>", "--json"],
    warnings: ["No image is opened and no semantic recognition is performed in 0.11."],
    futureRequirements: ["Workspace-bounded image validation", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Review image scope and the required limitations statement."
  },
  {
    id: "engine-scan-preview",
    title: "Scan engine project preview",
    category: "engine_plan",
    description: "Preview a read-only engine scan without opening a project or traversing files in web mode.",
    source: "composer_preview",
    domain: "engine",
    slashCommands: ["/engine scan"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "engine", "scan", "<selected-project>", "--json"],
    warnings: ["No engine project is opened or scanned in 0.11."],
    futureRequirements: ["Validated project boundary", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Review the project root and excluded directories."
  },
  {
    id: "unreal-import-plan",
    title: "Generate Unreal import plan",
    category: "engine_plan",
    description: "Compose an engine-aware Unreal plan without launching or mutating the editor.",
    source: "composer_preview",
    domain: "engine",
    slashCommands: ["/unreal plan"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "APPROVAL REQUIRED", "NO WRITES", "LOCAL ONLY"],
    proposedArgvPreview: ["realforge", "unreal", "import-plan", "--path", "<selected-project>", "--json"],
    warnings: ["No Unreal process starts and no project file is modified."],
    futureRequirements: ["Validated project boundary", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Review project scope, target paths, and validation checklist."
  },
  {
    id: "asset-pipeline-plan",
    title: "Plan Blender asset pipeline",
    category: "asset_pipeline_plan",
    description: "Compose a modeling-to-engine pipeline plan without launching Blender or importing assets.",
    source: "composer_preview",
    domain: "assets",
    slashCommands: ["/asset pipeline"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "APPROVAL REQUIRED", "NO WRITES", "LOCAL ONLY"],
    proposedArgvPreview: ["realforge", "asset", "pipeline", "--task", "<reviewed-task>", "--json"],
    warnings: ["No DCC tool runs and no binary asset is generated."],
    futureRequirements: ["Asset target review", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Review budgets, collision, LOD, export, and import gates."
  },
  {
    id: "skill-benchmark",
    title: "Run skill benchmark",
    category: "benchmark_run",
    description: "Compose a benchmark run that would create local report artifacts in a future bridge.",
    source: "composer_preview",
    domain: "eval",
    slashCommands: ["/bench", "/skill-bench"],
    staffRequired: false,
    writesFiles: true,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "APPROVAL REQUIRED", "APPROVAL BRIDGE REQUIRED", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "skill-bench", "--provider", "<selected-provider>", "--suite", "<selected-suite>"],
    warnings: ["Benchmark execution and artifact writes are disabled in 0.11."],
    futureRequirements: FUTURE_WRITE_REQUIREMENTS,
    nextSafeStep: "Review suite, provider, artifact target, and score gate."
  },
  {
    id: "leaderboard-review",
    title: "Review local leaderboard",
    category: "read_only_report",
    description: "Preview a read-only local leaderboard request without running a benchmark.",
    source: "composer_preview",
    domain: "eval",
    slashCommands: ["/leaderboard"],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "READONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "leaderboard", "--json"],
    warnings: ["Leaderboard loading is not part of the current desktop allowlist."],
    futureRequirements: NO_WRITE_REQUIREMENTS,
    nextSafeStep: "Use a future fixed read-only source after its schema and allowlist entry are reviewed."
  },
  {
    id: "proposal-review",
    title: "Review patch proposal",
    category: "proposal_review",
    description: "Compose a review-only inspection of proposal metadata and validation evidence.",
    source: "composer_preview",
    domain: "code",
    slashCommands: [],
    staffRequired: false,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "APPROVAL REQUIRED", "NO WRITES"],
    warnings: ["Proposal apply is not available. Review does not imply validation."],
    futureRequirements: FUTURE_WRITE_REQUIREMENTS,
    nextSafeStep: "Inspect patch targets, hash, risks, and validation results."
  },
  {
    id: "update-review",
    title: "Review update bundle",
    category: "update_review",
    description: "Compose a staff-gated review of update metadata without downloading or installing anything.",
    source: "composer_preview",
    domain: "updates",
    slashCommands: ["/update-check"],
    staffRequired: true,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "STAFF ONLY", "APPROVAL REQUIRED", "NO WRITES", "NETWORK OFF"],
    warnings: ["Staff Mode is required for preview details. Signed update installation remains unavailable."],
    futureRequirements: ["Staff Mode", "Verified signing key", "Verified update endpoint", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Enable only the visual staff preview to inspect gated metadata."
  },
  {
    id: "staff-status-review",
    title: "Review staff-mode status",
    category: "proposal_review",
    description: "Preview staff-mode state and policy gates without changing backend staff state.",
    source: "composer_preview",
    domain: "staff",
    slashCommands: ["/staff-status"],
    staffRequired: true,
    writesFiles: false,
    runsCommands: false,
    networkRequired: false,
    approvalRequired: false,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "STAFF ONLY", "NO WRITES", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "staff-status", "--json"],
    warnings: ["The visual Staff Mode preview never changes backend staff state."],
    futureRequirements: ["Staff Mode", ...NO_WRITE_REQUIREMENTS],
    nextSafeStep: "Keep Staff Mode off unless a staff-only review is explicitly needed."
  },
  {
    id: "staff-improvement-dry-run",
    title: "Staff improvement dry-run",
    category: "staff_improvement_dry_run",
    description: "Compose a bounded staff improvement experiment without applying or committing a patch.",
    source: "composer_preview",
    domain: "self-improvement",
    slashCommands: [],
    staffRequired: true,
    writesFiles: false,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: false,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "UNTRUSTED", "DRY RUN", "STAFF ONLY", "APPROVAL REQUIRED", "NO WRITES", "LOCAL ONLY"],
    proposedArgvPreview: ["realforge", "improve", "--dry-run", "--json"],
    warnings: ["Staff execution is not wired. No experiment process starts in 0.11."],
    futureRequirements: ["Staff Mode", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Review the candidate scope and benchmark gate in Staff UI preview."
  },
  {
    id: "apply-proposal-future",
    title: "Apply proposal (future)",
    category: "write_action_preview_only",
    description: "Show the future safety requirements for applying an approved proposal.",
    source: "composer_preview",
    domain: "code",
    slashCommands: [],
    staffRequired: true,
    writesFiles: true,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: true,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "STAFF ONLY", "APPROVAL REQUIRED", "APPROVAL BRIDGE REQUIRED", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "apply-proposal", "<reviewed-proposal-id>"],
    warnings: ["Disabled: no approval bridge, patch apply, commit, or merge path exists."],
    futureRequirements: ["Staff Mode", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Review requirements only; applying remains unsupported."
  },
  {
    id: "scheduler-run-future",
    title: "Run scheduler (future)",
    category: "write_action_preview_only",
    description: "Show the future gates for one bounded staff scheduler run.",
    source: "composer_preview",
    domain: "scheduler",
    slashCommands: ["/scheduler"],
    staffRequired: true,
    writesFiles: true,
    runsCommands: true,
    networkRequired: false,
    approvalRequired: true,
    destructive: true,
    supportedInWeb: true,
    supportedInDesktop: true,
    safetyLabels: ["PREVIEW ONLY", "STAFF ONLY", "APPROVAL REQUIRED", "APPROVAL BRIDGE REQUIRED", "LOCAL ONLY", "NETWORK OFF"],
    proposedArgvPreview: ["realforge", "scheduler-run", "--dry-run"],
    warnings: ["Disabled: scheduler execution is explicitly outside the 0.11 bridge."],
    futureRequirements: ["Staff Mode", "One-run hard cap", ...FUTURE_WRITE_REQUIREMENTS],
    nextSafeStep: "Review gates only; scheduler execution remains unsupported."
  }
] as const satisfies readonly CommandActionDefinition[];

export type CommandActionId = (typeof definitions)[number]["id"];
type CatalogActionDefinition = (typeof definitions)[number];

export const commandActionDefinitions: readonly CommandActionDefinition[] = Object.freeze(definitions);

export function getActionDefinition(actionId: string): CatalogActionDefinition | null {
  return definitions.find((action) => action.id === actionId) ?? null;
}

export function getActionForSlashCommand(command: string): CatalogActionDefinition | null {
  return definitions.find((action) => (action.slashCommands as readonly string[]).includes(command)) ?? null;
}

function executionStatus(action: CommandActionDefinition, context: ComposerRuntimeContext): ActionExecutionStatus {
  if (action.staffRequired && !context.staffMode) return "unsupported";
  if (action.fixedSourceId) {
    const allowed = context.allowlistedSourceIds.includes(action.fixedSourceId);
    return context.runtime === "desktop" && context.bridgeHealthy && allowed ? "read_only_available" : "unsupported";
  }
  if (action.approvedDryRunActionId) {
    return context.runtime === "desktop" && context.bridgeHealthy ? "approval_required" : "unsupported";
  }
  if (action.writesFiles || action.destructive) return "approval_bridge_required";
  return "preview_only";
}

export function composeActionPlan(actionId: string, context: ComposerRuntimeContext): ComposedAction {
  const action: CommandActionDefinition = getActionDefinition(actionId) ?? commandActionDefinitions[0];
  const currentExecutionStatus = executionStatus(action, context);
  const runtimeWarnings = [...action.warnings];

  if (action.staffRequired && !context.staffMode) runtimeWarnings.push("Staff Mode is off. Staff-only action details remain gated.");
  if (action.fixedSourceId && context.runtime === "web") runtimeWarnings.push("Web mode cannot load CLI reports. Use the desktop app or manual Reports import.");
  if (action.fixedSourceId && context.runtime === "desktop" && !context.bridgeHealthy) runtimeWarnings.push("Desktop bridge health is not ready; Load now remains disabled.");
  if (action.fixedSourceId && !context.allowlistedSourceIds.includes(action.fixedSourceId)) runtimeWarnings.push("The fixed source ID is not present in the read-only allowlist.");
  if (action.approvedDryRunActionId && context.runtime === "web") runtimeWarnings.push("Web mode cannot run approved local checks. Use the desktop app.");
  if (action.approvedDryRunActionId && context.runtime === "desktop" && !context.bridgeHealthy) runtimeWarnings.push("Workspace bridge health must be ready before approval can begin.");
  if (action.writesFiles || action.destructive) runtimeWarnings.push("Write execution is unavailable until a separately reviewed approval-gated bridge exists.");

  return Object.freeze({
    ...action,
    actionId: action.id,
    currentExecutionStatus,
    runtimeWarnings: Object.freeze(runtimeWarnings),
    canLoadNow: currentExecutionStatus === "read_only_available",
    canRequestApproval: currentExecutionStatus === "approval_required"
  });
}

export function actionStatusLabel(status: ActionExecutionStatus): string {
  if (status === "read_only_available") return "READ-ONLY AVAILABLE";
  if (status === "approval_required") return "APPROVAL REQUIRED";
  if (status === "approval_bridge_required") return "APPROVAL BRIDGE REQUIRED";
  if (status === "unsupported") return "UNSUPPORTED NOW";
  return "PREVIEW ONLY";
}

export function actionStatusTone(status: ActionExecutionStatus): "green" | "violet" | "amber" | "blue" {
  if (status === "read_only_available") return "green";
  if (status === "approval_required") return "amber";
  if (status === "approval_bridge_required") return "violet";
  if (status === "unsupported") return "amber";
  return "blue";
}

export function validateActionCatalog(): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  let approvedDryRunActions = 0;
  for (const action of commandActionDefinitions) {
    if (ids.has(action.id)) errors.push(`Duplicate action ID: ${action.id}`);
    ids.add(action.id);
    if (action.fixedSourceId) {
      const source = cliReportSources.getSource(action.fixedSourceId);
      if (!source || !cliReportSources.isReadOnlySource(source)) errors.push(`Invalid fixed source ID: ${action.fixedSourceId}`);
      if (action.writesFiles || action.networkRequired || action.destructive) errors.push(`Read-only action is unsafe: ${action.id}`);
    }
    if (action.approvedDryRunActionId) {
      approvedDryRunActions += 1;
      if (action.writesFiles || action.networkRequired || action.destructive || !action.approvalRequired) {
        errors.push(`Approved dry-run action has unsafe metadata: ${action.id}`);
      }
      if (!action.fixedArgvTemplate?.length || action.fixedArgvTemplate.some((token) => token.includes("<"))) {
        errors.push(`Approved dry-run action lacks a fixed argv template: ${action.id}`);
      }
    }
    if ((action.writesFiles || action.destructive) && !action.safetyLabels.includes("APPROVAL BRIDGE REQUIRED")) {
      errors.push(`Write action lacks approval bridge label: ${action.id}`);
    }
  }
  if (approvedDryRunActions !== 1) errors.push(`Expected exactly one approved dry-run action, found ${approvedDryRunActions}`);
  return Object.freeze(errors);
}
