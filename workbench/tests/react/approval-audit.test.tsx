import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRealFiles: vi.fn(),
  runApprovedDryRunAction: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { composeActionPlan } from "../../src/composer/action-model";
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

async function approveAndRun() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /run approved check/i }));
  await waitFor(() => expect(mocks.runApprovedDryRunAction).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  mocks.listRealFiles.mockReset();
  mocks.runApprovedDryRunAction.mockReset();
  mocks.listRealFiles.mockResolvedValue({
    ok: true,
    files: ["src/main.real"],
    truncated: false,
    workspacePath: "/private/workspace"
  });
  useWorkbenchStore.setState({ approvalAuditEntries: [] });
});

afterEach(() => cleanup());

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
});
