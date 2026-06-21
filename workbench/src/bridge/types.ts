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

export type ApprovedDryRunActionId = "realc-check-hello-example";

export interface ApprovedDryRunInput {
  approvalAcknowledged: boolean;
}

export interface ApprovedDryRunExecution {
  actionId: ApprovedDryRunActionId;
  title: string;
  commandSummary: string;
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
