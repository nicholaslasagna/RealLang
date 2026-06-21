import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearApprovalAuditLog: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  listRealFiles: vi.fn(),
  loadApprovalAuditLog: vi.fn(),
  saveApprovalAuditLog: vi.fn(),
  runApprovedDryRunAction: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { composeActionPlan } from "../../src/composer/action-model";
import { createApprovalAuditEntry, prepareApprovalAuditEntriesForPersistence } from "../../src/audit/approval-audit";
import { ApprovalAuditLog } from "../../src/features/audit/ApprovalAuditLog";
import { ApprovedDryRunPanel } from "../../src/features/composer/ApprovedDryRunPanel";
import { useWorkbenchStore } from "../../src/state/workbench-store";

const runtime = {
  runtime: "desktop" as const,
  bridgeHealthy: true,
  staffMode: false,
  allowlistedSourceIds: ["capabilities", "slash", "settings-doctor"]
};

const helloAction = composeActionPlan("check-reallang-file", runtime);
const workspaceAction = composeActionPlan("check-reallang-workspace-file", runtime);

function successfulExecution(actionId: "realc-check-hello-example" | "realc-check-workspace-file", relativePath: string) {
  return {
    actionId,
    title: actionId === "realc-check-hello-example" ? "Check the fixed hello.real example" : "Check a workspace .real file",
    commandSummary: `realc ${relativePath} --check`,
    relativePath,
    workspacePath: "/private/workspace",
    exitCode: 0,
    passed: true,
    stdout: "check ok",
    stderr: "",
    durationMs: 14,
    writesFiles: false as const,
    networkRequired: false as const,
    untrusted: true as const,
    safetyLabels: ["UNTRUSTED"]
  };
}

function auditEntry(id = "approval-test") {
  return createApprovalAuditEntry({
    id,
    timestamp: "2026-06-21T12:00:00.000Z",
    actionId: "realc-check-workspace-file",
    actionTitle: "Check a workspace .real file",
    targetRelativePath: "src/main.real",
    result: { ok: true, data: successfulExecution("realc-check-workspace-file", "src/main.real") },
    measuredDurationMs: 14
  });
}

async function approveAndRun() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /run approved check/i }));
  await waitFor(() => expect(mocks.runApprovedDryRunAction).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  mocks.clearApprovalAuditLog.mockReset();
  mocks.isDesktopRuntime.mockReset();
  mocks.isDesktopRuntime.mockReturnValue(false);
  mocks.listRealFiles.mockReset();
  mocks.loadApprovalAuditLog.mockReset();
  mocks.saveApprovalAuditLog.mockReset();
  mocks.runApprovedDryRunAction.mockReset();
  mocks.clearApprovalAuditLog.mockResolvedValue({ ok: true });
  mocks.loadApprovalAuditLog.mockResolvedValue({
    ok: true,
    data: { version: 1, savedAt: "0", entries: [] }
  });
  mocks.saveApprovalAuditLog.mockResolvedValue({
    ok: true,
    data: { version: 1, savedAt: "0", entries: [] },
    droppedEntries: 0
  });
  mocks.listRealFiles.mockResolvedValue({
    ok: true,
    files: ["src/main.real"],
    truncated: false,
    workspacePath: "/private/workspace"
  });
  useWorkbenchStore.setState({
    approvalAuditEntries: [],
    approvalAuditHydrated: false,
    approvalAuditStorageStatus: "idle",
    approvalAuditStorageWarning: null
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("approval audit UI", () => {
  it("renders a clear empty session state", () => {
    render(<ApprovalAuditLog />);
    expect(screen.getByText("No approved dry-runs yet")).toBeInTheDocument();
    expect(screen.getByText(/after explicit user confirmation/i)).toBeInTheDocument();
  });

  it("records an approved fixed hello check and preserves the existing result", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: successfulExecution("realc-check-hello-example", "examples/hello.real")
    });
    render(
      <>
        <ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />
        <ApprovalAuditLog />
      </>
    );
    await approveAndRun();
    expect(await screen.findByTestId("approved-dry-run-result")).toHaveTextContent("check ok");
    expect(useWorkbenchStore.getState().approvalAuditEntries[0]).toMatchObject({
      actionId: "realc-check-hello-example",
      targetRelativePath: "examples/hello.real",
      status: "success"
    });
  });

  it("records the selected workspace-relative target", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: successfulExecution("realc-check-workspace-file", "src/main.real")
    });
    render(<ApprovedDryRunPanel action={workspaceAction} workspacePath="/private/workspace" onClose={() => {}} />);
    await screen.findByRole("option", { name: "src/main.real" });
    await approveAndRun();
    expect(useWorkbenchStore.getState().approvalAuditEntries[0].targetRelativePath).toBe("src/main.real");
  });

  it("records failed and timed-out approved attempts", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValueOnce({
      ok: true,
      data: { ...successfulExecution("realc-check-hello-example", "examples/hello.real"), passed: false, exitCode: 1, stderr: "type error" }
    });
    const first = render(<ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />);
    await approveAndRun();
    expect(useWorkbenchStore.getState().approvalAuditEntries[0].status).toBe("failed");
    first.unmount();

    mocks.runApprovedDryRunAction.mockClear();
    mocks.runApprovedDryRunAction.mockResolvedValueOnce({ ok: false, error: { code: "timeout", message: "deadline exceeded" } });
    render(<ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />);
    await approveAndRun();
    expect(useWorkbenchStore.getState().approvalAuditEntries[0].status).toBe("timed_out");
  });

  it("keeps process output collapsed by default", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: successfulExecution("realc-check-hello-example", "examples/hello.real")
    });
    render(
      <>
        <ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />
        <ApprovalAuditLog />
      </>
    );
    await approveAndRun();
    const disclosure = await screen.findByText("Output previews");
    expect(disclosure.closest("details")).not.toHaveAttribute("open");
  });

  it("copies a metadata-only summary without process secrets or full paths", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: {
        ...successfulExecution("realc-check-hello-example", "examples/hello.real"),
        stdout: "PROVIDER_KEY=do-not-copy",
        stderr: "/private/workspace/internal"
      }
    });
    render(
      <>
        <ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />
        <ApprovalAuditLog />
      </>
    );
    await approveAndRun();
    fireEvent.click(await screen.findByRole("button", { name: /copy safe summary/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain("examples/hello.real");
    expect(copied).not.toContain("do-not-copy");
    expect(copied).not.toContain("/private/workspace");
  });

  it("does not create an entry before a selectable target exists", async () => {
    mocks.listRealFiles.mockResolvedValue({ ok: true, files: [], truncated: false, workspacePath: "/private/workspace" });
    render(<ApprovedDryRunPanel action={workspaceAction} workspacePath="/private/workspace" onClose={() => {}} />);
    await screen.findByText("No .real files found");
    expect(screen.getByRole("button", { name: /run approved check/i })).toBeDisabled();
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("loads and renders persisted desktop entries", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const persisted = prepareApprovalAuditEntriesForPersistence([auditEntry("persisted-1")]);
    mocks.loadApprovalAuditLog.mockResolvedValue({
      ok: true,
      data: { version: 1, savedAt: "1750521600", entries: persisted }
    });

    await useWorkbenchStore.getState().initializeApprovalAuditHistory();
    render(<ApprovalAuditLog />);
    expect(screen.getByText("PERSISTED LOCALLY")).toBeInTheDocument();
    expect(screen.getByText("src/main.real")).toBeInTheDocument();
    expect(screen.getByText("1 / 50 entries")).toBeInTheDocument();
    expect(screen.queryByText("Output previews")).not.toBeInTheDocument();
  });

  it("persists an approved desktop run without output bodies or absolute paths", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    useWorkbenchStore.setState({
      approvalAuditHydrated: true,
      approvalAuditStorageStatus: "persisted"
    });
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: {
        ...successfulExecution("realc-check-hello-example", "examples/hello.real"),
        stdout: "PROVIDER_KEY=never-send",
        stderr: "/private/workspace/internal"
      }
    });
    render(<ApprovedDryRunPanel action={helloAction} workspacePath="/private/workspace" onClose={() => {}} />);
    await approveAndRun();
    await waitFor(() => expect(mocks.saveApprovalAuditLog).toHaveBeenCalledTimes(1));
    const payload = mocks.saveApprovalAuditLog.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect("stdoutPreview" in payload[0]).toBe(false);
    expect("stderrPreview" in payload[0]).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("never-send");
    expect(JSON.stringify(payload)).not.toContain("/private/workspace");
  });

  it("keeps web preview session-only without persistence IPC", async () => {
    await useWorkbenchStore.getState().initializeApprovalAuditHistory();
    expect(useWorkbenchStore.getState().approvalAuditStorageStatus).toBe("session_only");
    expect(mocks.loadApprovalAuditLog).not.toHaveBeenCalled();
    expect(mocks.saveApprovalAuditLog).not.toHaveBeenCalled();
    render(<ApprovalAuditLog />);
    expect(screen.getByText("SESSION ONLY")).toBeInTheDocument();
  });

  it("confirms and clears desktop app-config history", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn(() => true)
    });
    useWorkbenchStore.setState({
      approvalAuditEntries: [auditEntry()],
      approvalAuditHydrated: true,
      approvalAuditStorageStatus: "persisted"
    });
    render(<ApprovalAuditLog />);
    fireEvent.click(screen.getByRole("button", { name: /clear history/i }));
    await waitFor(() => expect(mocks.clearApprovalAuditLog).toHaveBeenCalledTimes(1));
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
    expect(screen.getByText("No approved dry-runs yet")).toBeInTheDocument();
  });

  it("allows an empty corrupt persisted file to be cleared", () => {
    useWorkbenchStore.setState({
      approvalAuditEntries: [],
      approvalAuditHydrated: true,
      approvalAuditStorageStatus: "persisted",
      approvalAuditStorageWarning: "Audit JSON was corrupt and was ignored."
    });
    render(<ApprovalAuditLog />);
    expect(screen.getByRole("button", { name: /clear history/i })).toBeEnabled();
    expect(screen.getByText(/corrupt and was ignored/i)).toBeInTheDocument();
  });

  it("keeps the Workbench recent-runs view compact", () => {
    useWorkbenchStore.setState({ approvalAuditEntries: [auditEntry()] });
    render(<ApprovalAuditLog compact />);
    expect(screen.getByText("Recent approved runs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear history/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/entries$/)).not.toBeInTheDocument();
  });
});
