import { isDesktopRuntime } from "./detect-runtime";
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
  UpdateCheckResult,
  UpdateStatus,
  WorkspacePaths,
  WorkspaceResolution,
  ProviderStatus,
  ProviderChatSandboxCancelResult,
  ProviderChatSandboxInput,
  ProviderChatSandboxReport,
  ProviderChatSandboxResult,
  ChatStreamEvent,
  ProviderImageGenInput,
  ProviderImageGenResult,
  ProviderSmokeInput,
  ProviderSmokeResult
} from "./types";
import type { PersistedApprovalAuditEntry } from "./types";
import {
  webBridgeCapabilities,
  webBridgeHealth,
  webClearApprovalAuditLog,
  webListRealFiles,
  webListSecurityScanSources,
  webLoadApprovalAuditLog,
  webLoadProviderStatus,
  webLoadReadOnlyReportSource,
  webReadOnlyReportSources,
  webRunApprovedDryRunAction,
  webCancelPrivateProviderChatSandbox,
  webRunPrivateProviderChatSandbox,
  webRunPrivateProviderImageGen,
  webRunPrivateProviderSmoke,
  webRunSecurityScanSource,
  webRuntimeInfo,
  webSaveApprovalAuditLog,
  webSavedWorkspace,
  webUpdateCheckResult,
  webUpdateStatus,
  webWorkspacePaths,
  webWorkspaceResolution
} from "./web-fallback";

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** Platform and bridge runtime metadata (IPC in desktop, static fallback on web). */
export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  if (!isDesktopRuntime()) return webRuntimeInfo();
  try {
    return await invokeDesktop<RuntimeInfo>("get_runtime_info");
  } catch {
    return webRuntimeInfo();
  }
}

/** Bridge capability flags — read-only CLI spawn in desktop; metadata-only on web. */
export async function listBridgeCapabilities(): Promise<BridgeCapabilities> {
  if (!isDesktopRuntime()) return webBridgeCapabilities();
  try {
    return await invokeDesktop<BridgeCapabilities>("get_bridge_capabilities");
  } catch {
    return webBridgeCapabilities();
  }
}

/** Allowlisted read-only report source catalog (source IDs only; no execution). */
export async function listReadOnlyReportSources(): Promise<ReadOnlyReportSourceMeta[]> {
  if (!isDesktopRuntime()) return webReadOnlyReportSources();
  try {
    return await invokeDesktop<ReadOnlyReportSourceMeta[]>("list_readonly_report_sources");
  } catch {
    return webReadOnlyReportSources();
  }
}

/** Load one allowlisted read-only CLI report by source ID (desktop only). */
export async function loadReadOnlyReportSource(sourceId: string): Promise<LoadReadOnlyReportResult> {
  if (!isDesktopRuntime()) return webLoadReadOnlyReportSource(sourceId);
  try {
    return await invokeDesktop<LoadReadOnlyReportResult>("load_readonly_report_source", { sourceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: "ipc_failed", message }
    };
  }
}

/** Allowlisted read-only security scan source catalog (source IDs only). */
export async function listSecurityScanSources(): Promise<SecurityScanSourceMeta[]> {
  if (!isDesktopRuntime()) return webListSecurityScanSources();
  try {
    return await invokeDesktop<SecurityScanSourceMeta[]>("list_security_scan_sources");
  } catch {
    return webListSecurityScanSources();
  }
}

/**
 * Run one allowlisted read-only security scan by source ID (desktop only).
 * Source ID only — never argv, never shell. Output is untrusted; nothing is
 * written and no remediation is performed.
 */
export async function runSecurityScanSource(sourceId: string): Promise<SecurityScanResult> {
  if (!isDesktopRuntime()) return webRunSecurityScanSource(sourceId);
  try {
    return await invokeDesktop<SecurityScanResult>("run_security_scan_source", { sourceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "ipc_failed", message } };
  }
}

/** List workspace-relative `.real` files (read-only; desktop only). */
export async function listRealFiles(): Promise<RealFileListResult> {
  if (!isDesktopRuntime()) return webListRealFiles();
  try {
    return await invokeDesktop<RealFileListResult>("list_real_files");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, files: [], truncated: false, workspacePath: null, error: { code: "ipc_failed", message } };
  }
}

/** Run an approval-gated, no-write validation action (desktop only). */
export async function runApprovedDryRunAction(
  actionId: ApprovedDryRunActionId,
  input: ApprovedDryRunInput
): Promise<ApprovedDryRunResult> {
  if (!isDesktopRuntime()) return webRunApprovedDryRunAction(actionId, input);
  try {
    return await invokeDesktop<ApprovedDryRunResult>("run_approved_dry_run_action", { actionId, input });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: "ipc_failed", message }
    };
  }
}

/** Load the fixed app-config approval history (desktop only; never a user path). */
export async function loadApprovalAuditLog(): Promise<ApprovalAuditLoadResult> {
  if (!isDesktopRuntime()) return webLoadApprovalAuditLog();
  try {
    return await invokeDesktop<ApprovalAuditLoadResult>("load_approval_audit_log");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "ipc_failed", message } };
  }
}

/** Replace the fixed app-config history with already stripped metadata entries. */
export async function saveApprovalAuditLog(
  entries: readonly PersistedApprovalAuditEntry[]
): Promise<ApprovalAuditSaveResult> {
  if (!isDesktopRuntime()) return webSaveApprovalAuditLog();
  try {
    return await invokeDesktop<ApprovalAuditSaveResult>("save_approval_audit_log", { entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "ipc_failed", message }, droppedEntries: entries.length };
  }
}

/** Remove only the fixed app-config approval history file. */
export async function clearApprovalAuditLog(): Promise<ApprovalAuditClearResult> {
  if (!isDesktopRuntime()) return webClearApprovalAuditLog();
  try {
    return await invokeDesktop<ApprovalAuditClearResult>("clear_approval_audit_log");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "ipc_failed", message } };
  }
}

/** Tauri app paths only — never reads arbitrary user files. */
export async function getWorkspacePaths(): Promise<WorkspacePaths> {
  if (!isDesktopRuntime()) return webWorkspacePaths();
  try {
    return await invokeDesktop<WorkspacePaths>("get_workspace_paths");
  } catch {
    return webWorkspacePaths();
  }
}

/** Desktop workspace discovery — metadata only, no subprocess. */
export async function getWorkspaceResolution(): Promise<WorkspaceResolution> {
  if (!isDesktopRuntime()) return webWorkspaceResolution();
  try {
    return await invokeDesktop<WorkspaceResolution>("get_workspace_resolution");
  } catch {
    return webWorkspaceResolution();
  }
}

/** Bridge health — filesystem checks plus optional allowlisted CLI probe. */
export async function checkBridgeHealth(): Promise<BridgeHealth> {
  if (!isDesktopRuntime()) return webBridgeHealth();
  try {
    return await invokeDesktop<BridgeHealth>("check_bridge_health");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const resolution = await getWorkspaceResolution();
    return {
      resolution,
      healthy: false,
      probeAttempted: false,
      probeOk: false,
      probeSourceId: null,
      nextActions: [`Retry health check: ${message}`]
    };
  }
}

/** Open a folder picker, validate, persist, and resolve the workspace (desktop only). */
export async function selectWorkspaceDirectory(): Promise<WorkspaceResolution> {
  if (!isDesktopRuntime()) {
    throw new Error("Workspace selection is available in the desktop shell only.");
  }
  return invokeDesktop<WorkspaceResolution>("select_workspace_directory");
}

/** Load persisted workspace metadata from the app config file. */
export async function getSavedWorkspace(): Promise<SavedWorkspace | null> {
  if (!isDesktopRuntime()) return webSavedWorkspace();
  try {
    return await invokeDesktop<SavedWorkspace | null>("get_saved_workspace");
  } catch {
    return webSavedWorkspace();
  }
}

/** Persist a validated workspace root path (desktop only). */
export async function saveWorkspaceSelection(path: string): Promise<SavedWorkspace> {
  if (!isDesktopRuntime()) {
    throw new Error("Workspace persistence is available in the desktop shell only.");
  }
  return invokeDesktop<SavedWorkspace>("save_workspace_selection", { path });
}

/** Remove persisted workspace selection (desktop only). */
export async function clearSavedWorkspace(): Promise<void> {
  if (!isDesktopRuntime()) {
    throw new Error("Workspace persistence is available in the desktop shell only.");
  }
  await invokeDesktop<void>("clear_saved_workspace");
}

/** Load sanitized provider status from fixed home config (desktop only). */
export async function loadProviderStatus(): Promise<ProviderStatus> {
  if (!isDesktopRuntime()) return webLoadProviderStatus();
  try {
    return await invokeDesktop<ProviderStatus>("load_private_local_provider_config");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      configured: false,
      source: "home_private",
      provider_kind: null,
      trust: "local_untrusted",
      endpoint_configured: false,
      endpoint_host: null,
      model_configured: false,
      api_key_configured: false,
      image_provider_configured: false,
      image_provider_kind: null,
      image_endpoint_host: null,
      image_provider_execution_enabled: false,
      warnings: [],
      errors: [{ code: "ipc_failed", message }]
    };
  }
}

/**
 * Run the fixed, approval-gated provider reachability check (desktop only).
 * The only input is acknowledgement; Rust owns the executable and all argv.
 */
export async function runPrivateProviderSmoke(input: ProviderSmokeInput): Promise<ProviderSmokeResult> {
  if (!isDesktopRuntime()) return webRunPrivateProviderSmoke(input);
  try {
    return await invokeDesktop<ProviderSmokeResult>("run_private_provider_smoke", { input });
  } catch {
    return {
      ok: false,
      error: {
        code: "ipc_failed",
        message: "The provider smoke bridge could not return a sanitized result."
      }
    };
  }
}

/**
 * Generate one approval-gated, bounded image via the user-configured local image
 * backend (ComfyUI or OpenAI-compatible; desktop only). Rust owns the executable
 * and argv; the backend and model are chosen only by the gitignored home config.
 * Output is one sanitized base64 PNG, always LOCAL UNTRUSTED.
 */
export async function runPrivateProviderImageGen(
  input: ProviderImageGenInput
): Promise<ProviderImageGenResult> {
  if (!isDesktopRuntime()) return webRunPrivateProviderImageGen(input);
  try {
    return await invokeDesktop<ProviderImageGenResult>("run_private_provider_image_gen", { input });
  } catch {
    return {
      ok: false,
      error: {
        code: "ipc_failed",
        message: "The image generation bridge could not return a sanitized result."
      }
    };
  }
}

// Single-flight live-token sink. The Rust bridge runs at most one chat request
// at a time and the UI disables send while running, so one active listener is
// sufficient. ponytail: single-flight → one global listener, not a registry.
let chatStreamDeltaListener: ((text: string) => void) | null = null;

/** Subscribe to live response tokens for the active chat request (or clear with null). */
export function setChatStreamDeltaListener(listener: ((text: string) => void) | null): void {
  chatStreamDeltaListener = listener;
}

function buildStreamReport(
  event: Extract<ChatStreamEvent, { type: "final" | "error" }>,
  response: string
): ProviderChatSandboxReport {
  return {
    ok: event.type === "final" ? event.ok : false,
    attempted: event.attempted,
    configured: event.configured,
    provider_kind: event.provider_kind,
    status: event.status,
    input_length: event.input_length,
    duration_ms: event.duration_ms,
    response: response.length ? response : null,
    response_truncated: event.type === "final" ? event.response_truncated : false,
    untrusted_output: true,
    error: event.type === "error" ? event.error : null
  };
}

/**
 * Stream one bounded request over a Tauri channel, forwarding live tokens to the
 * active delta listener and resolving with the aggregated sanitized result.
 * Rust guarantees exactly one terminal (final/error) event per request.
 */
async function streamPrivateProviderChatSandbox(
  input: ProviderChatSandboxInput
): Promise<ProviderChatSandboxResult> {
  const { invoke, Channel } = await import("@tauri-apps/api/core");
  const channel = new Channel<ChatStreamEvent>();
  let response = "";
  let settled = false;
  let resolveResult!: (result: ProviderChatSandboxResult) => void;
  const result = new Promise<ProviderChatSandboxResult>((resolve) => {
    resolveResult = resolve;
  });
  channel.onmessage = (event) => {
    if (settled) return;
    if (event.type === "delta") {
      response += event.text;
      chatStreamDeltaListener?.(event.text);
      return;
    }
    settled = true;
    resolveResult({ ok: true, data: buildStreamReport(event, response) });
  };
  try {
    await invoke("run_private_provider_chat_sandbox_stream", { input, onEvent: channel });
  } catch (error) {
    if (!settled) {
      settled = true;
      const message = error instanceof Error ? error.message : String(error);
      resolveResult({ ok: false, error: { code: "ipc_failed", message } });
    }
  }
  return result;
}

/**
 * Run one approval-gated, bounded, user-only provider request (desktop only).
 * Rust accepts no path, argv, tools, file content, or persistence option. In the
 * desktop shell this streams live tokens; the resolved result is identical in
 * shape to the single-shot command.
 */
export async function runPrivateProviderChatSandbox(
  input: ProviderChatSandboxInput
): Promise<ProviderChatSandboxResult> {
  if (!isDesktopRuntime()) return webRunPrivateProviderChatSandbox(input);
  try {
    return await streamPrivateProviderChatSandbox(input);
  } catch {
    return {
      ok: false,
      error: {
        code: "ipc_failed",
        message: "The private chat sandbox bridge could not return a sanitized result."
      }
    };
  }
}

/** Signal only the currently active fixed sandbox child process (desktop only). */
export async function cancelPrivateProviderChatSandbox(): Promise<ProviderChatSandboxCancelResult> {
  if (!isDesktopRuntime()) return webCancelPrivateProviderChatSandbox();
  try {
    return await invokeDesktop<ProviderChatSandboxCancelResult>("cancel_private_provider_chat_sandbox");
  } catch {
    return {
      ok: false,
      status: "unavailable",
      error: {
        code: "ipc_failed",
        message: "The private chat sandbox cancellation signal could not be delivered."
      }
    };
  }
}

/** @deprecated Use loadProviderStatus */
export async function loadPrivateLocalProviderConfig(): Promise<ProviderStatus> {
  return loadProviderStatus();
}

/** Desktop update center metadata — not configured until signed releases exist. */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  if (!isDesktopRuntime()) return webUpdateStatus();
  try {
    return await invokeDesktop<UpdateStatus>("get_update_status");
  } catch {
    return webUpdateStatus();
  }
}

/** Check for signed updates — returns not_configured when updater is disabled. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isDesktopRuntime()) return webUpdateCheckResult();
  try {
    return await invokeDesktop<UpdateCheckResult>("check_for_update");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      state: "error",
      configured: false,
      message,
      latestVersion: null,
      releaseNotes: null
    };
  }
}

export function runtimeModeLabel(info: RuntimeInfo): string {
  return info.runtime === "desktop" ? "Desktop shell" : "Web preview";
}

export function bridgeModeLabel(capabilities: BridgeCapabilities): string {
  if (capabilities.bridgeMode === "metadata-only") return "Metadata only";
  if (capabilities.bridgeMode === "read-only") return "Read-only";
  return "Disabled";
}
