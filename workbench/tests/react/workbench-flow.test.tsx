import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn(),
  listReadOnlyReportSources: vi.fn(),
  runApprovedDryRunAction: vi.fn(),
  loadReadOnlyReportSource: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { WorkbenchScreen } from "../../src/features/workbench/WorkbenchScreen";
import { useWorkbenchStore } from "../../src/state/workbench-store";

function resetStore(stagedTask = "") {
  useWorkbenchStore.setState({
    screen: "workbench",
    staffPreview: false,
    commandQuery: "",
    stagedTask,
    composedActionId: "repair-diagnostic-dry-run",
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
  mocks.isDesktopRuntime.mockReturnValue(false);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: false, resolution: { bridgeMode: "metadata-only", repoRoot: null } });
  resetStore();
});

afterEach(() => cleanup());

describe("0.31 Workbench conversation flow", () => {
  it("empty state shows greeting, flow hint, action preview, and a prominent composer", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("workbench-greeting")).toBeInTheDocument();
    expect(screen.getByTestId("workbench-flow-hint")).toBeInTheDocument();
    expect(screen.getByTestId("action-preview-card")).toBeInTheDocument();
    expect(screen.getByTestId("safe-command-composer")).toBeInTheDocument();
  });

  it("greeting copy stays friendly and approval-first", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const greeting = screen.getByTestId("workbench-greeting");
    expect(within(greeting).getByText(/tell me what you want to build or fix/i)).toBeInTheDocument();
    expect(within(greeting).getByText(/until you approve it/i)).toBeInTheDocument();
  });

  it("holds the illustrative repair evidence until the user stages intent", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.queryByText("STRUCTURED PLAN")).toBeNull();
    cleanup();

    resetStore("Fix the i32 overflow in looptest.real");
    render(<WorkbenchScreen />);
    expect(screen.getByText("Fix the i32 overflow in looptest.real")).toBeInTheDocument();
    expect(screen.getByText("STRUCTURED PLAN")).toBeInTheDocument();
    // The flow-hint orientation steps back once the conversation is underway.
    expect(screen.queryByTestId("workbench-flow-hint")).toBeNull();
  });

  it("keeps safety details inspectable in the action preview", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.getByText("Show safety details")).toBeInTheDocument();
    // Display-only argv text remains present (collapsed but in the DOM).
    expect(screen.getByText("DISPLAY ONLY · NOT EXECUTABLE", { hidden: true })).toBeInTheDocument();
  });

  it("renders the approval history as a secondary reference block", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const reference = document.querySelector(".thread-reference");
    expect(reference).not.toBeNull();
    expect(within(reference as HTMLElement).getByText("Recent approved runs", { hidden: true })).toBeInTheDocument();
    expect(screen.getByTestId("workbench-secondary-details")).toBeInTheDocument();
  });

  it("centers the conversation surface and keeps the inspector collapsed by default", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const thread = document.querySelector(".thread");
    expect(thread).not.toBeNull();
    expect(document.querySelector(".workbench-layout--solo")).not.toBeNull();
    expect(screen.getByRole("button", { name: /details/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("safe-command-composer")).toBeInTheDocument();
  });

  it("collapses quick intents until expanded", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const wrap = screen.getByTestId("composer-intents-wrap");
    expect(wrap).not.toHaveAttribute("open");
    expect(screen.getByText("Quick intents")).toBeInTheDocument();
    expect(
      within(wrap).getByRole("button", { name: /load capabilities report/i, hidden: true })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Quick intents"));
    expect(within(wrap).getByRole("button", { name: /load capabilities report/i })).toBeVisible();
  });
});
