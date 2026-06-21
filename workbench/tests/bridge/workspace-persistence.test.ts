import { describe, expect, it } from "vitest";
import {
  checkForUpdate,
  getSavedWorkspace,
  getUpdateStatus,
  getWorkspaceResolution,
  platformDisplayName,
  workspaceStatusLabel
} from "../../src/bridge";
import {
  webBridgeHealth,
  webSavedWorkspace,
  webUpdateCheckResult,
  webUpdateStatus,
  webWorkspaceResolution
} from "../../src/bridge/web-fallback";

describe("workspace persistence (web mode)", () => {
  it("returns no saved workspace in web preview", async () => {
    const saved = await getSavedWorkspace();
    expect(saved).toBeNull();
    expect(webSavedWorkspace()).toBeNull();
  });

  it("still resolves workspace metadata without persistence", async () => {
    const resolution = await getWorkspaceResolution();
    expect(resolution.discoveryMethod).toBe("web_preview");
    expect(webWorkspaceResolution().status).toBe("unknown");
    expect(webBridgeHealth().healthy).toBe(false);
  });

  it("labels saved workspace status for UI", () => {
    expect(workspaceStatusLabel("found_by_saved")).toBe("Saved workspace");
    expect(platformDisplayName("macos")).toBe("macOS");
  });
});

describe("update center (web mode)", () => {
  it("reports unavailable in web preview", async () => {
    const status = await getUpdateStatus();
    expect(status.state).toBe("unavailable_web");
    expect(status.configured).toBe(false);
    expect(webUpdateStatus().message).toMatch(/desktop shell only/i);
  });

  it("refuses update checks without network primitives", async () => {
    const result = await checkForUpdate();
    expect(result.ok).toBe(false);
    expect(result.state).toBe("unavailable_web");
    expect(webUpdateCheckResult().configured).toBe(false);
  });
});
