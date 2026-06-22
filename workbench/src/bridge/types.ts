/** Runtime surface exposed by the Workbench bridge (web fallback or Tauri IPC). */

export type RuntimeKind = "web" | "desktop";
export type BridgeMode = "disabled" | "metadata-only" | "read-only";

export interface RuntimeInfo {
  runtime: RuntimeKind;
  appName: string;
  workbenchVersion: string;
  platform: string;
  arch: string;
  bridgeMode: BridgeMode;
}

export interface BridgeCapabilities {
  bridgeMode: BridgeMode;
  readOnly: boolean;
  writes: boolean;
  network: boolean;
  shellExecution: boolean;
  cliSpawn: boolean;
  approvalGatedWrites: boolean;
  approvalGatedDryRun: boolean;
  approvedDryRunActionCount: number;
  metadataOnly: boolean;
}

/** Public metadata for one allowlisted read-only CLI report source (no argv in IPC). */
export interface ReadOnlyReportSourceMeta {
  id: string;
  label: string;
  description: string;
  displayCommand: string;
  detectType: string;
  readOnly: true;
}

export interface WorkspacePaths {
  appDataDir: string | null;
  appConfigDir: string | null;
  resourceDir: string | null;
  configFile: string | null;
}

export interface SavedWorkspace {
  repoRoot: string;
  discoveryMethod: string;
  savedAt: string;
  lastHealthOkAt: string | null;
  lastHealthStatus: string | null;
}

export type WorkspaceResolutionStatus =
  | "unknown"
  | "found_by_saved"
  | "found_by_env"
  | "found_by_walkup"
  | "selected_by_user"
  | "saved_path_missing"
  | "missing"
  | "invalid"
  | "cli_unavailable"
  | "venv_missing"
  | "python_missing"
  | "ready";

export interface WorkspaceResolution {
  status: WorkspaceResolutionStatus;
  repoRoot: string | null;
  workbenchPath: string | null;
  pythonPath: string | null;
  discoveryMethod: string;
  errors: string[];
  warnings: string[];
  bridgeMode: BridgeMode;
  platform: string;
  arch: string;
  supportedSources: ReadOnlyReportSourceMeta[];
}

export interface BridgeHealth {
  resolution: WorkspaceResolution;
  healthy: boolean;
  probeAttempted: boolean;
  probeOk: boolean;
  probeSourceId: string | null;
  nextActions: string[];
}

export interface BridgeError {
  code: string;
  message: string;
}

export interface LoadedReadOnlyReport {
  source: ReadOnlyReportSourceMeta;
  stdoutJson: string;
  untrusted: true;
  safetyLabels: string[];
}

export type LoadReadOnlyReportResult =
  | { ok: true; data: LoadedReadOnlyReport }
  | { ok: false; error: BridgeError };

export type ApprovedDryRunActionId = "realc-check-hello-example" | "realc-check-workspace-file";

export interface ApprovedDryRunInput {
  approvalAcknowledged: boolean;
  /** Workspace-relative .real path for the workspace-file check (validated in Rust). */
  relativePath?: string;
}

export interface ApprovedDryRunExecution {
  actionId: ApprovedDryRunActionId;
  title: string;
  commandSummary: string;
  relativePath: string | null;
  workspacePath: string;
  exitCode: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  writesFiles: false;
  networkRequired: false;
  untrusted: true;
  safetyLabels: string[];
}

export type ApprovedDryRunResult =
  | { ok: true; data: ApprovedDryRunExecution }
  | { ok: false; error: BridgeError };

/** Strict metadata-only approval entry stored by the desktop app-config bridge. */
export interface PersistedApprovalAuditEntry {
  id: string;
  timestamp: string;
  actionId: string;
  actionTitle: string;
  targetKind: string;
  targetRelativePath: string;
  workspaceLabel: string;
  commandSummary: string;
  acknowledgementKind: string;
  status: string;
  errorCode?: string;
  exitCode?: number;
  durationMs: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  untrustedOutput: boolean;
  writesFiles: boolean;
  networkRequired: boolean;
  safetyLabels: string[];
  source: string;
}

export interface ApprovalAuditLogPayload {
  version: 1;
  savedAt: string;
  entries: PersistedApprovalAuditEntry[];
}

export interface ApprovalAuditStorageWarning {
  code: string;
  message: string;
  droppedEntries: number;
}

export type ApprovalAuditLoadResult =
  | { ok: true; data: ApprovalAuditLogPayload; warning?: ApprovalAuditStorageWarning }
  | { ok: false; error: BridgeError };

export type ApprovalAuditSaveResult =
  | { ok: true; data: ApprovalAuditLogPayload; droppedEntries: number }
  | { ok: false; error: BridgeError; droppedEntries: number };

export type ApprovalAuditClearResult =
  | { ok: true }
  | { ok: false; error: BridgeError };

/** Read-only workspace .real file listing (desktop only). */
export interface RealFileListResult {
  ok: boolean;
  files: string[];
  truncated: boolean;
  workspacePath: string | null;
  error?: BridgeError;
}

export type BridgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeError };

export type UpdateChannel = "stable" | "preview" | "local_dev";

export type UpdateStatusState =
  | "unavailable_web"
  | "not_configured"
  | "missing_public_key"
  | "missing_endpoint"
  | "ready_to_check"
  | "checking"
  | "update_available"
  | "up_to_date"
  | "download_ready"
  | "install_and_restart"
  | "error";

export interface UpdateConfiguration {
  configured: boolean;
  channel: UpdateChannel;
  endpointConfigured: boolean;
  endpointUrl: string | null;
  publicKeyConfigured: boolean;
  signingRequired: boolean;
  installAllowed: boolean;
  disabledReason: string | null;
}

export interface ReleaseChecklistItem {
  id: string;
  label: string;
  status: "pending" | "future" | "complete" | "n/a";
}

export interface UpdateStatus {
  state: UpdateStatusState;
  configured: boolean;
  currentVersion: string;
  platform: string;
  arch: string;
  channel: UpdateChannel;
  configuration: UpdateConfiguration;
  latestVersion: string | null;
  releaseNotes: string | null;
  message: string;
  safetyNotes: string[];
  releaseChecklist: ReleaseChecklistItem[];
}

export interface UpdateCheckResult {
  ok: boolean;
  state: UpdateStatusState;
  configured: boolean;
  message: string;
  latestVersion: string | null;
  releaseNotes: string | null;
}

/** Metadata for one allowlisted read-only security scan source (no argv in IPC). */
export interface SecurityScanSourceMeta {
  id: string;
  label: string;
  description: string;
  displayCommand: string;
  ecosystem: string;
  outputFormat: "json" | "text";
  requiresNetwork: boolean;
  readOnly: true;
}

export interface SecurityScanExecution {
  source: SecurityScanSourceMeta;
  commandSummary: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  outputFormat: "json" | "text";
  stdoutTruncated: boolean;
  durationMs: number;
  writesFiles: false;
  networkUsed: boolean;
  untrusted: true;
  safetyLabels: string[];
}

export type SecurityScanResult =
  | { ok: true; data: SecurityScanExecution }
  | { ok: false; error: BridgeError };

export interface ProviderStatusError {
  code: string;
  message: string;
}

export interface ChatProviderConfigStatus {
  configured: boolean;
  provider_kind: string | null;
  trust: "local_untrusted";
  endpoint_configured: boolean;
  endpoint_host: string | null;
  model_configured: boolean;
  api_key_configured: boolean;
}

export interface ImageProviderConfigStatus {
  image_provider_configured: boolean;
  image_provider_kind: "local_image_provider" | null;
  image_endpoint_host: string | null;
  image_provider_execution_enabled: boolean;
}

/** Sanitized multimodal status aligned with `realforge provider status --json`. */
export interface MultimodalPrivateLocalProviderStatus
  extends ChatProviderConfigStatus, ImageProviderConfigStatus {
  ok: boolean;
  source: string;
  warnings: string[];
  errors: ProviderStatusError[];
}

export type ProviderStatus = MultimodalPrivateLocalProviderStatus;
export type PrivateLocalProviderConfig = ProviderStatus;

/** The only frontend-controlled value accepted by the fixed provider smoke IPC. */
export interface ProviderSmokeInput {
  approvalAcknowledged: boolean;
}

export interface ProviderSmokeError {
  code: string;
  message: string;
}

/** Sanitized CLI-parity provider smoke report. Exact identity and secrets are absent by design. */
export interface ProviderSmokeReport {
  ok: boolean;
  attempted: boolean;
  configured: boolean;
  provider_kind: string | null;
  endpoint_configured: boolean;
  endpoint_host: string | null;
  model_configured: boolean;
  api_key_configured: boolean;
  status: "pass" | "fail" | "not_configured";
  duration_ms: number;
  response_preview: string | null;
  response_truncated: boolean;
  untrusted_output: true;
  error: ProviderSmokeError | null;
}

export type ProviderSmokeResult =
  | { ok: true; data: ProviderSmokeReport }
  | { ok: false; error: BridgeError };

/** The complete frontend-controlled input for one private chat sandbox request. */
export interface ProviderChatSandboxInput {
  prompt: string;
  approvalAcknowledged: boolean;
}

export interface ProviderChatSandboxError {
  code: string;
  message: string;
}

/** Sanitized single-turn response. Prompt text and private provider identity are absent. */
export interface ProviderChatSandboxReport {
  ok: boolean;
  attempted: boolean;
  configured: boolean;
  provider_kind: string | null;
  status: "pass" | "fail" | "not_configured" | "rejected";
  input_length: number;
  duration_ms: number;
  response: string | null;
  response_truncated: boolean;
  untrusted_output: true;
  error: ProviderChatSandboxError | null;
}

export type ProviderChatSandboxResult =
  | { ok: true; data: ProviderChatSandboxReport }
  | { ok: false; error: BridgeError };

export type ProviderChatSandboxCancelResult =
  | { ok: true; status: "cancellation_requested" | "idle" }
  | { ok: false; status: "unavailable"; error: BridgeError };
