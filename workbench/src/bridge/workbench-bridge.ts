import { isDesktopRuntime } from "./detect-runtime";
import type {
  BridgeCapabilities,
  BridgeHealth,
  LoadReadOnlyReportResult,
  ReadOnlyReportSourceMeta,
  RuntimeInfo,
  SavedWorkspace,
  UpdateCheckResult,
  UpdateStatus,
  WorkspacePaths,
  WorkspaceResolution
} from "./types";
import {
  webBridgeCapabilities,
  webBridgeHealth,
  webLoadReadOnlyReportSource,
  webReadOnlyReportSources,
  webRuntimeInfo,
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
