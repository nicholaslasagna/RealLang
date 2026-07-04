import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReadOnlyReportSource: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn(),
  listReadOnlyReportSources: vi.fn(),
  runApprovedDryRunAction: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { CommandPalette } from "../../src/components/layout/CommandPalette";
import type { CommandActionId } from "../../src/composer/action-model";
import { WorkbenchScreen } from "../../src/features/workbench/WorkbenchScreen";
import { useWorkbenchStore } from "../../src/state/workbench-store";

const fixedSources = [
  { id: "capabilities", label: "Capability registry", description: "test", displayCommand: "realforge capabilities --json", detectType: "capability_registry", readOnly: true },
  { id: "slash", label: "Slash registry", description: "test", displayCommand: "realforge slash --json", detectType: "slash_command_registry", readOnly: true },
  { id: "settings-doctor", label: "Settings doctor", description: "test", displayCommand: "realforge settings doctor --json", detectType: "settings_summary", readOnly: true }
];

function resetStore(actionId: CommandActionId = "repair-diagnostic-dry-run") {
  useWorkbenchStore.setState({
    screen: "workbench",
    staffPreview: false,
    commandQuery: "",
    stagedTask: "",
    composedActionId: actionId,
    importRaw: "",
    importPreview: null,
    paletteOpen: false,
    desktopLoadStatus: "idle",
    desktopLoadSourceId: null,
    desktopLoadError: null,
    approvalAuditEntries: [],
    approvalAuditHydrated: false,
    approvalAuditStorageStatus: "idle",
    approvalAuditStorageWarning: null
  });
}

beforeEach(() => {
  mocks.loadReadOnlyReportSource.mockReset();
  mocks.runApprovedDryRunAction.mockReset();
  mocks.isDesktopRuntime.mockReturnValue(false);
  mocks.listReadOnlyReportSources.mockResolvedValue(fixedSources);
  mocks.checkBridgeHealth.mockResolvedValue({
    healthy: false,
    resolution: { bridgeMode: "metadata-only", repoRoot: null }
  });
  resetStore();
});

afterEach(() => cleanup());

function switchDesktopChatToPreview(text = "Preview this safely") {
  const input = screen.queryByLabelText("Local model request");
  if (!input) return;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTestId("mode-safe-preview"));
}

describe("safe command composer UI", () => {
  it("keeps the empty Workbench execution-free before intent is staged", async () => {
    resetStore("load-capabilities");
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("safe-command-composer")).toBeInTheDocument();
    expect(screen.getByTestId("action-preview-card")).toBeInTheDocument();
    expect(screen.getByText("DISPLAY ONLY · NOT EXECUTABLE")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /desktop bridge unavailable/i })).toBeDisabled();
    expect(mocks.loadReadOnlyReportSource).not.toHaveBeenCalled();
  });

  it("does not show a large action preview on the default empty surface", () => {
    resetStore();
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("workbench-assistant-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
  });

  it("loads a fixed desktop source through the existing untrusted import pipeline", async () => {
    const payload = JSON.stringify({ capabilities: [], provider: "desktop-composer-test" });
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
    mocks.loadReadOnlyReportSource.mockResolvedValue({
      ok: true,
      data: {
        source: fixedSources[0],
        stdoutJson: payload,
        untrusted: true,
        safetyLabels: ["UNTRUSTED"]
      }
    });
    resetStore("load-capabilities");
    render(<WorkbenchScreen />);
    switchDesktopChatToPreview();

    const load = await screen.findByRole("button", { name: /^load now$/i });
    fireEvent.click(load);

    await waitFor(() => {
      const state = useWorkbenchStore.getState();
      expect(state.screen).toBe("reports");
      expect(state.importRaw).toBe(payload);
      expect(state.importPreview?.untrusted).toBe(true);
    });
    expect(mocks.loadReadOnlyReportSource).toHaveBeenCalledWith("capabilities");
  });

  it("shows the approved check as unsupported in web mode", async () => {
    resetStore("check-reallang-file");
    render(<WorkbenchScreen />);
    expect(await screen.findByRole("button", { name: /desktop approval unavailable/i })).toBeDisabled();
    expect(screen.queryByTestId("approval-panel")).not.toBeInTheDocument();
    expect(mocks.runApprovedDryRunAction).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("keeps approval disabled when desktop bridge health is not ready", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.checkBridgeHealth.mockResolvedValue({
      healthy: false,
      resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" }
    });
    resetStore("check-reallang-file");
    render(<WorkbenchScreen />);
    switchDesktopChatToPreview();
    expect(await screen.findByRole("button", { name: /desktop approval unavailable/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /open workspace setup/i })).toBeEnabled();
  });

  it("requires explicit approval and renders successful output as inert and untrusted", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.checkBridgeHealth.mockResolvedValue({
      healthy: true,
      resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" }
    });
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: {
        actionId: "realc-check-hello-example",
        title: "Check the fixed hello.real example",
        commandSummary: "realc examples/hello.real --check",
        relativePath: "examples/hello.real",
        workspacePath: "C:\\RealLang",
        exitCode: 0,
        passed: true,
        stdout: "ok: examples/hello.real",
        stderr: "",
        durationMs: 24,
        writesFiles: false,
        networkRequired: false,
        untrusted: true,
        safetyLabels: ["UNTRUSTED", "NO WRITES"]
      }
    });
    resetStore("check-reallang-file");
    render(<WorkbenchScreen />);
    switchDesktopChatToPreview();

    fireEvent.click(await screen.findByRole("button", { name: /review approval/i }));
    expect(screen.getByTestId("approval-panel")).toBeInTheDocument();
    const run = screen.getByRole("button", { name: /run approved check/i });
    expect(run).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I understand this runs a local dry-run\/check command/i }));
    expect(run).toBeEnabled();
    fireEvent.click(run);

    expect(await screen.findByTestId("approved-dry-run-result")).toBeInTheDocument();
    const executionReport = screen.getByTestId("approved-dry-run-result");
    expect(executionReport).toHaveTextContent("UNTRUSTED OUTPUT");
    expect(screen.getByLabelText("Approved check stdout")).toHaveTextContent("ok: examples/hello.real");
    expect(mocks.runApprovedDryRunAction).toHaveBeenCalledWith(
      "realc-check-hello-example",
      { approvalAcknowledged: true }
    );
  });

  it("shows write actions as disabled approval-bridge previews", () => {
    resetStore("skill-benchmark");
    render(<WorkbenchScreen />);
    expect(screen.getAllByText("APPROVAL BRIDGE REQUIRED").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /approval bridge required/i })).toBeDisabled();
  });

  it("keeps staff-only action previews gated while Staff Mode is off", () => {
    resetStore("staff-improvement-dry-run");
    render(<WorkbenchScreen />);
    expect(screen.getByRole("button", { name: /staff mode off/i })).toBeDisabled();
    expect(screen.getByText(/Staff-only action details remain gated/i)).toBeInTheDocument();
  });

  it("shows slash-command safety detail before composing an action", async () => {
    resetStore();
    useWorkbenchStore.setState({ paletteOpen: true, commandQuery: "scheduler" });
    render(<CommandPalette />);
    expect(await screen.findByTestId("command-action-detail")).toBeInTheDocument();
    expect(screen.getAllByText("STAFF ONLY").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /compose preview/i })).toBeInTheDocument();
  });

  it("opens the command dropdown when slash text is typed in the composer", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    resetStore();
    render(<WorkbenchScreen />);

    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "/command" } });

    expect(await screen.findByTestId("composer-slash-menu")).toBeInTheDocument();
    expect(useWorkbenchStore.getState().paletteOpen).toBe(false);
    expect(screen.getByText("/ask")).toBeInTheDocument();
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all commands/i })).toBeInTheDocument();
  });

  it("filters the command dropdown from slash prefixes without sending chat", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    resetStore();
    render(<WorkbenchScreen />);

    const input = screen.getByLabelText("Local model request");
    fireEvent.change(input, { target: { value: "/image" } });

    expect(await screen.findByTestId("composer-slash-menu")).toBeInTheDocument();
    expect(screen.getByText("/image prompt")).toBeInTheDocument();
    expect(screen.getByText("/image job")).toBeInTheDocument();
    expect(screen.queryByText("/ask")).toBeNull();
    expect(mocks.runApprovedDryRunAction).not.toHaveBeenCalled();
  });
});
