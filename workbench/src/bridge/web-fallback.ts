import { cliReportSources } from "../data/cli/cli-report-sources";
import { SECURITY_SCAN_CATALOG } from "../data/security/security-model";
import type {
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
