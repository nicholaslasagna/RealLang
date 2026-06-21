import { describe, expect, it } from "vitest";
import { cliReportSources } from "../../src/data/cli/cli-report-sources";
import { isDesktopRuntime, isWebPreviewRuntime } from "../../src/bridge/detect-runtime";
import {
  bridgeModeLabel,
  clearApprovalAuditLog,
  getRuntimeInfo,
  listBridgeCapabilities,
  listReadOnlyReportSources,
  loadApprovalAuditLog,
  loadReadOnlyReportSource,
  runApprovedDryRunAction,
  runtimeModeLabel,
  saveApprovalAuditLog
} from "../../src/bridge/workbench-bridge";
import {
  webBridgeCapabilities,
  webClearApprovalAuditLog,
  webLoadApprovalAuditLog,
  webLoadReadOnlyReportSource,
  webReadOnlyReportSources,
  webRunApprovedDryRunAction,
  webRuntimeInfo,
  webSaveApprovalAuditLog
} from "../../src/bridge/web-fallback";

describe("workbench bridge client (web mode)", () => {
  it("detects web preview runtime by default", () => {
    expect(isDesktopRuntime()).toBe(false);
    expect(isWebPreviewRuntime()).toBe(true);
  });

  it("falls back to static runtime metadata without fetch or IPC", async () => {
    const info = await getRuntimeInfo();
    expect(info.runtime).toBe("web");
    expect(info.appName).toBe("RealForge Workbench");
    expect(info.bridgeMode).toBe("metadata-only");
    expect(runtimeModeLabel(info)).toBe("Web preview");
  });

  it("exposes metadata-only bridge capabilities in web mode", async () => {
    const caps = await listBridgeCapabilities();
    expect(caps.metadataOnly).toBe(true);
    expect(caps.cliSpawn).toBe(false);
    expect(caps.shellExecution).toBe(false);
    expect(caps.writes).toBe(false);
    expect(caps.network).toBe(false);
    expect(caps.approvalGatedDryRun).toBe(false);
    expect(caps.approvedDryRunActionCount).toBe(0);
    expect(bridgeModeLabel(caps)).toBe("Metadata only");
  });

  it("refuses approved local checks in web mode", async () => {
    const result = await runApprovedDryRunAction("realc-check-hello-example", {
      approvalAcknowledged: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_web");
    expect(webRunApprovedDryRunAction("realc-check-hello-example", { approvalAcknowledged: true }).ok).toBe(false);
  });

  it("keeps approval history session-only in web mode", async () => {
    const loaded = await loadApprovalAuditLog();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.entries).toEqual([]);
      expect(loaded.warning?.code).toBe("session_only_web");
    }
    const saved = await saveApprovalAuditLog([]);
    expect(saved.ok).toBe(false);
    const cleared = await clearApprovalAuditLog();
    expect(cleared.ok).toBe(false);
    expect(webLoadApprovalAuditLog().ok).toBe(true);
    expect(webSaveApprovalAuditLog().ok).toBe(false);
    expect(webClearApprovalAuditLog().ok).toBe(false);
  });

  it("refuses CLI load in web mode with explicit unsupported result", async () => {
    const result = await loadReadOnlyReportSource("capabilities");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unsupported_web");
      expect(result.error.message).toMatch(/desktop shell only/i);
    }
    expect(webLoadReadOnlyReportSource("capabilities").error.code).toBe("unsupported_web");
  });

  it("returns web workspace resolution without IPC", async () => {
    const { getWorkspaceResolution, checkBridgeHealth } = await import("../../src/bridge/workbench-bridge");
    const resolution = await getWorkspaceResolution();
    expect(resolution.status).toBe("unknown");
    const health = await checkBridgeHealth();
    expect(health.healthy).toBe(false);
    expect(health.probeAttempted).toBe(false);
  });

  it("lists the shared read-only CLI catalog with fixed argv in data layer", async () => {
    const sources = await listReadOnlyReportSources();
    expect(sources.length).toBe(cliReportSources.SOURCES.length);
    for (const source of sources) {
      expect(source.readOnly).toBe(true);
      expect(source.id).toBeTruthy();
      expect(source.displayCommand.startsWith("realforge ")).toBe(true);
      expect("argv" in source).toBe(false);
    }
    const allowlisted = cliReportSources.SOURCES.find((s) => s.id === "capabilities");
    expect(allowlisted?.argv).toEqual(["capabilities", "--json"]);
    expect(webReadOnlyReportSources().map((s) => s.id)).toEqual(sources.map((s) => s.id));
  });

  it("web fallback helpers match bridge client defaults", () => {
    expect(webRuntimeInfo().runtime).toBe("web");
    expect(webBridgeCapabilities().metadataOnly).toBe(true);
  });
});
