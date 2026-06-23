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
  it("empty state shows an assistant-first greeting, compact orientation, and prominent composer", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("workbench-greeting")).toBeInTheDocument();
    expect(screen.getByTestId("workbench-flow-hint")).toBeInTheDocument();
    expect(screen.getByTestId("workbench-assistant-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.getByRole("heading", { name: /what do you want to work on/i })).toBeInTheDocument();
    expect(screen.getByTestId("safe-command-composer")).toBeInTheDocument();
  });

  it("greeting copy stays friendly and approval-first", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const greeting = screen.getByTestId("workbench-greeting");
    expect(within(greeting).getByText(/tell me what you want to build or fix/i)).toBeInTheDocument();
    expect(within(greeting).getByText(/until you approve it/i)).toBeInTheDocument();
  });

  it("nudges to Chat for free conversational text instead of a fake repair preview (0.42)", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.queryByText("STRUCTURED PLAN")).toBeNull();
    cleanup();

    // Free conversational text in Safe preview must NOT become a Repair diagnostic dry-run.
    resetStore("My favorite test word is nebula");
    render(<WorkbenchScreen />);
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.queryByText("STRUCTURED PLAN")).toBeNull();
    // Instead, a gentle nudge points to Chat.
    const nudge = screen.getByTestId("chat-nudge");
    expect(nudge).toHaveTextContent(/looks like a chat message/i);
    expect(screen.queryByTestId("workbench-flow-hint")).toBeNull();
  });

  it("keeps safety details and argv inspectable once an explicit action is composed", () => {
    resetStore("");
    useWorkbenchStore.setState({ composedActionId: "general-plan" });
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("action-preview-card")).toBeInTheDocument();
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

  it("opens the inspector only after the Details toggle", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    expect(screen.queryByLabelText("Composed action inspector")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByLabelText("Composed action inspector")).toBeInTheDocument();
  });

  it("collapses suggestions until expanded", () => {
    resetStore("");
    render(<WorkbenchScreen />);
    const wrap = screen.getByTestId("composer-intents-wrap");
    expect(wrap).not.toHaveAttribute("open");
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(
      within(wrap).getByRole("button", { name: /load capabilities report/i, hidden: true })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Suggestions"));
    const intent = within(wrap).getByRole("button", { name: /load capabilities report/i });
    expect(intent).toBeVisible();
    fireEvent.click(intent);
    expect(wrap).not.toHaveAttribute("open");
  });
});
