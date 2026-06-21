import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { reportImport } from "../../src/data/import/report-import";
import { useWorkbenchStore } from "../../src/state/workbench-store";

const mocks = vi.hoisted(() => ({
  loadReadOnlyReportSource: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    loadReadOnlyReportSource: mocks.loadReadOnlyReportSource,
    isDesktopRuntime: mocks.isDesktopRuntime,
    checkBridgeHealth: mocks.checkBridgeHealth
  };
});

import { CliBridgePanel } from "../../src/features/reports/CliBridgePanel";

describe("Reports CLI bridge panel", () => {
  beforeEach(() => {
    mocks.loadReadOnlyReportSource.mockReset();
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.checkBridgeHealth.mockResolvedValue({
      healthy: false,
      probeAttempted: false,
      probeOk: false,
      probeSourceId: null,
      nextActions: ["Use the desktop app"],
      resolution: {
        status: "unknown",
        repoRoot: null,
        workbenchPath: null,
        pythonPath: null,
        discoveryMethod: "web_preview",
        errors: [],
        warnings: [],
        bridgeMode: "metadata-only",
        platform: "MacIntel",
        arch: "unknown",
        supportedSources: []
      }
    });
    useWorkbenchStore.setState({
      desktopLoadStatus: "idle",
      desktopLoadSourceId: null,
      desktopLoadError: null,
      staffPreview: false,
      importRaw: "",
      importPreview: null
    });
  });

  it("renders manual copy/paste bridge commands in web mode", async () => {
    render(<CliBridgePanel />);
    await waitFor(() => {
      expect(screen.getByText(/web app never executes commands/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("bridge-health-strip")).toBeInTheDocument();
    expect(screen.getByText(/node tools\/realforge-report-bridge\.mjs load capabilities/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load report/i })).not.toBeInTheDocument();
  });

  it("consumes mocked desktop load result as untrusted import preview", async () => {
    const payload = JSON.stringify({ capabilities: [], provider: "desktop-bridge-test" });
    mocks.loadReadOnlyReportSource.mockResolvedValue({
      ok: true,
      data: {
        source: {
          id: "capabilities",
          label: "Capability registry",
          description: "test",
          displayCommand: "realforge capabilities --json",
          detectType: "capability_registry",
          readOnly: true
        },
        stdoutJson: payload,
        untrusted: true,
        safetyLabels: ["UNTRUSTED"]
      }
    });
    mocks.isDesktopRuntime.mockReturnValue(true);

    render(<CliBridgePanel />);
    const loadButtons = await screen.findAllByRole("button", { name: /^load report$/i });
    loadButtons[0].click();

    await waitFor(() => {
      const state = useWorkbenchStore.getState();
      expect(state.importRaw).toBe(payload);
      expect(state.importPreview?.ok).toBe(true);
      expect(state.importPreview?.untrusted).toBe(true);
      expect(state.importPreview?.safetyLabels).toContain("UNTRUSTED");
    });

    expect(mocks.loadReadOnlyReportSource).toHaveBeenCalledWith("capabilities");

    const preview = reportImport.parseAndAdapt(payload, "auto", { staffMode: false });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.untrusted).toBe(true);
    }
  });
});
