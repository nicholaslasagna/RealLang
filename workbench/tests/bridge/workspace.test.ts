import { describe, expect, it } from "vitest";
import {
  checkBridgeHealth,
  getWorkspaceResolution,
  platformDisplayName,
  workspaceStatusLabel,
  workspaceStatusTone
} from "../../src/bridge";
import { webBridgeHealth, webWorkspaceResolution } from "../../src/bridge/web-fallback";

describe("workspace resolution (web mode)", () => {
  it("returns web-preview fallback without executing CLI", async () => {
    const resolution = await getWorkspaceResolution();
    expect(resolution.status).toBe("unknown");
    expect(resolution.repoRoot).toBeNull();
    expect(resolution.bridgeMode).toBe("metadata-only");
    expect(resolution.errors[0]).toMatch(/desktop shell only/i);
    expect(resolution.supportedSources.map((s) => s.id)).toEqual([
      "capabilities",
      "slash",
      "settings-doctor"
    ]);
  });

  it("reports bridge health fallback on web", async () => {
    const health = await checkBridgeHealth();
    expect(health.healthy).toBe(false);
    expect(health.probeAttempted).toBe(false);
    expect(health.nextActions.length).toBeGreaterThan(0);
    expect(health.resolution.status).toBe("unknown");
  });

  it("web fallback helpers stay aligned with bridge client", () => {
    expect(webWorkspaceResolution().discoveryMethod).toBe("web_preview");
    expect(webBridgeHealth().probeOk).toBe(false);
  });

  it("labels workspace statuses for UI", () => {
    expect(workspaceStatusLabel("ready")).toBe("Ready");
    expect(workspaceStatusLabel("venv_missing")).toBe("Virtualenv missing");
    expect(workspaceStatusTone("ready")).toBe("green");
    expect(workspaceStatusTone("invalid")).toBe("violet");
    expect(platformDisplayName("macos")).toBe("macOS");
    expect(platformDisplayName("windows")).toBe("Windows");
  });
});
