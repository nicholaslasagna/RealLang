import { cliReportSources } from "../data/cli/cli-report-sources";
import { SECURITY_SCAN_CATALOG } from "../data/security/security-model";
import type {
  ApprovalAuditClearResult,
  ApprovalAuditLoadResult,
  ApprovalAuditSaveResult,
  ApprovedDryRunActionId,
  ApprovedDryRunInput,
  ApprovedDryRunResult,
  BridgeCapabilities,
  BridgeHealth,
  LoadReadOnlyReportResult,
  ReadOnlyReportSourceMeta,
  RealFileListResult,
  RuntimeInfo,
  SavedWorkspace,
  SecurityScanResult,
  SecurityScanSourceMeta,
  ProviderStatus,
  ProviderChatSandboxCancelResult,
  ProviderChatSandboxInput,
  ProviderChatSandboxResult,
  ProviderSmokeInput,
  ProviderSmokeResult,
  UpdateCheckResult,
  UpdateConfiguration,
  UpdateStatus,
  WorkspacePaths,
  WorkspaceResolution
} from "./types";

const WORKBENCH_VERSION = "0.16.0";

const WEB_UPDATE_CONFIGURATION: UpdateConfiguration = {
  configured: false,
  channel: "stable",
  endpointConfigured: false,
  endpointUrl: null,
  publicKeyConfigured: false,
  signingRequired: true,
  installAllowed: false,
  disabledReason: "App updates are managed by the desktop shell only."
};

export function webRuntimeInfo(): RuntimeInfo {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    runtime: "web",
    appName: "RealForge Workbench",
    workbenchVersion: WORKBENCH_VERSION,
    platform: nav?.platform ?? "unknown",
    arch: "unknown",
    bridgeMode: "metadata-only"
  };
}

export function webBridgeCapabilities(): BridgeCapabilities {
  return {
    bridgeMode: "metadata-only",
    readOnly: true,
    writes: false,
    network: false,
    shellExecution: false,
    cliSpawn: false,
    approvalGatedWrites: false,
    approvalGatedDryRun: false,
    approvedDryRunActionCount: 0,
    metadataOnly: true
  };
}

export function webRunApprovedDryRunAction(
  _actionId: ApprovedDryRunActionId,
  _input: ApprovedDryRunInput
): ApprovedDryRunResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message: "Approved local checks are available in the desktop shell only. Web mode never executes commands."
    }
  };
}

export function webRunPrivateProviderSmoke(_input: ProviderSmokeInput): ProviderSmokeResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message: "Provider smoke is available in the desktop shell only. Web mode never executes provider checks."
    }
  };
}

export function webRunPrivateProviderChatSandbox(
  _input: ProviderChatSandboxInput
): ProviderChatSandboxResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message: "Private chat sandbox is available in the desktop shell only. Web mode never contacts providers."
    }
  };
}

export function webCancelPrivateProviderChatSandbox(): ProviderChatSandboxCancelResult {
  return {
    ok: false,
    status: "unavailable",
    error: {
      code: "unsupported_web",
      message: "Private chat cancellation is available in the desktop shell only. Web mode never contacts providers."
    }
  };
}

export function webLoadApprovalAuditLog(): ApprovalAuditLoadResult {
  return {
    ok: true,
    data: { version: 1, savedAt: "0", entries: [] },
    warning: {
      code: "session_only_web",
      message: "Web preview keeps approval history in memory for this session only.",
      droppedEntries: 0
    }
  };
}

export function webSaveApprovalAuditLog(): ApprovalAuditSaveResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message: "Approval history persistence is available in the desktop shell only."
    },
    droppedEntries: 0
  };
}

export function webClearApprovalAuditLog(): ApprovalAuditClearResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message: "Web preview has no persisted approval history file."
    }
  };
}

export function webListSecurityScanSources(): SecurityScanSourceMeta[] {
  return SECURITY_SCAN_CATALOG.map((source) => ({ ...source }));
}

export function webListRealFiles(): RealFileListResult {
  return {
    ok: false,
    files: [],
    truncated: false,
    workspacePath: null,
    error: {
      code: "unsupported_web",
      message: "Listing workspace .real files is available in the desktop shell only. Web mode never reads the workspace."
    }
  };
}

export function webRunSecurityScanSource(_sourceId: string): SecurityScanResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message:
        "Security scans run in the desktop shell only. Web mode never executes commands — copy the command and run it manually."
    }
  };
}

export function webReadOnlyReportSources(): ReadOnlyReportSourceMeta[] {
  return cliReportSources.SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    description: source.description,
    displayCommand: source.displayCommand,
    detectType: source.detectType,
    readOnly: true
  }));
}

export function webWorkspacePaths(): WorkspacePaths {
  return {
    appDataDir: null,
    appConfigDir: null,
    resourceDir: null,
    configFile: null
  };
}

export function webSavedWorkspace(): SavedWorkspace | null {
  return null;
}

export function webLoadReadOnlyReportSource(_sourceId: string): LoadReadOnlyReportResult {
  return {
    ok: false,
    error: {
      code: "unsupported_web",
      message:
        "Read-only CLI load is available in the desktop shell only. Copy the Node bridge command or paste JSON manually."
    }
  };
}

function webSupportedSources(): ReadOnlyReportSourceMeta[] {
  return cliReportSources.SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    description: source.description,
    displayCommand: source.displayCommand,
    detectType: source.detectType,
    readOnly: true
  }));
}

export function webWorkspaceResolution(): WorkspaceResolution {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    status: "unknown",
    repoRoot: null,
    workbenchPath: null,
    pythonPath: null,
    discoveryMethod: "web_preview",
    errors: ["Workspace resolution runs in the desktop shell only."],
    warnings: [],
    bridgeMode: "metadata-only",
    platform: nav?.platform ?? "unknown",
    arch: "unknown",
    supportedSources: webSupportedSources()
  };
}

export function webBridgeHealth(): BridgeHealth {
  return {
    resolution: webWorkspaceResolution(),
    healthy: false,
    probeAttempted: false,
    probeOk: false,
    probeSourceId: null,
    nextActions: [
      "Install and open the desktop app to connect to a local RealForge repository.",
      "In web preview, paste CLI JSON manually or use the Node dev bridge."
    ]
  };
}

export function webUpdateStatus(): UpdateStatus {
  return {
    state: "unavailable_web",
    configured: false,
    currentVersion: WORKBENCH_VERSION,
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    arch: "unknown",
    channel: "stable",
    configuration: WEB_UPDATE_CONFIGURATION,
    latestVersion: null,
    releaseNotes: null,
    message: "App updates are managed by the desktop shell only.",
    safetyNotes: [
      "Signed updates are required before any install or restart.",
      "Web preview never downloads or installs application updates."
    ],
    releaseChecklist: []
  };
}

export function webUpdateCheckResult(): UpdateCheckResult {
  return {
    ok: false,
    state: "unavailable_web",
    configured: false,
    message: "Update checks are available in the desktop shell only.",
    latestVersion: null,
    releaseNotes: null
  };
}

export function webLoadPrivateLocalProviderConfig(): ProviderStatus {
  return webLoadProviderStatus();
}

export function webLoadProviderStatus(): ProviderStatus {
  return {
    ok: true,
    configured: false,
    source: "unavailable",
    provider_kind: "mock",
    trust: "local_untrusted",
    endpoint_configured: false,
    endpoint_host: null,
    model_configured: false,
    api_key_configured: false,
    image_provider_configured: false,
    image_provider_kind: null,
    image_endpoint_host: null,
    image_provider_execution_enabled: false,
    warnings: ["Provider status is read from the desktop shell only."],
    errors: []
  };
}
