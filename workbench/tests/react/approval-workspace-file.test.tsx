import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRealFiles: vi.fn(),
  runApprovedDryRunAction: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { ApprovedDryRunPanel } from "../../src/features/composer/ApprovedDryRunPanel";
import { composeActionPlan } from "../../src/composer/action-model";
import { useWorkbenchStore } from "../../src/state/workbench-store";

const desktopContext = {
  runtime: "desktop" as const,
  bridgeHealthy: true,
  staffMode: false,
  allowlistedSourceIds: ["capabilities", "slash", "settings-doctor"]
};

const workspaceFileAction = composeActionPlan("check-reallang-workspace-file", desktopContext);
const helloAction = composeActionPlan("check-reallang-file", desktopContext);

function execution(relativePath: string) {
  return {
    actionId: "realc-check-workspace-file" as const,
    title: "Check a workspace .real file",
    commandSummary: `realc ${relativePath} --check`,
    relativePath,
    workspacePath: "/ws",
    exitCode: 0,
    passed: true,
    stdout: "check ok",
    stderr: "",
    durationMs: 12,
    writesFiles: false as const,
    networkRequired: false as const,
    untrusted: true as const,
    safetyLabels: ["UNTRUSTED", "NO WRITES"]
  };
}

beforeEach(() => {
  mocks.listRealFiles.mockReset();
  mocks.runApprovedDryRunAction.mockReset();
  mocks.listRealFiles.mockResolvedValue({
    ok: true,
    files: ["examples/hello.real", "src/loop.real"],
    truncated: false,
    workspacePath: "/ws"
  });
  useWorkbenchStore.setState({ approvalAuditEntries: [] });
});

afterEach(() => cleanup());

describe("workspace .real file approved check (0.18)", () => {
  it("renders a file picker (dropdown, not a raw path textbox)", async () => {
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    const picker = await screen.findByTestId("approval-file-picker");
    expect(within(picker).getByRole("combobox")).toBeInTheDocument();
    // No raw free-text path input.
    expect(within(picker).queryByRole("textbox")).toBeNull();
    expect(within(picker).getByRole("option", { name: "examples/hello.real" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "src/loop.real" })).toBeInTheDocument();
  });

  it("shows the validated argv preview with the selected file substituted", async () => {
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    await screen.findByTestId("approval-file-picker");
    const command = screen.getByLabelText("Exact approved command");
    expect(within(command).getByText("realc")).toBeInTheDocument();
    expect(within(command).getByText("examples/hello.real")).toBeInTheDocument();
    expect(within(command).getByText("--check")).toBeInTheDocument();
  });

  it("requires both a selected file and acknowledgement before running", async () => {
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    await screen.findByTestId("approval-file-picker");
    const runButton = screen.getByRole("button", { name: /run approved check/i });
    expect(runButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(runButton).not.toBeDisabled();
  });

  it("runs the check with only approval + the chosen relativePath and renders inert output", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValue({ ok: true, data: execution("examples/hello.real") });
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    await screen.findByTestId("approval-file-picker");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /run approved check/i }));

    await waitFor(() => expect(screen.getByTestId("approved-dry-run-result")).toBeInTheDocument());
    expect(mocks.runApprovedDryRunAction).toHaveBeenCalledWith("realc-check-workspace-file", {
      approvalAcknowledged: true,
      relativePath: "examples/hello.real"
    });
    expect(useWorkbenchStore.getState().approvalAuditEntries[0].targetRelativePath).toBe("examples/hello.real");
    const result = screen.getByTestId("approved-dry-run-result");
    expect(within(result).getByText("UNTRUSTED OUTPUT")).toBeInTheDocument();
    expect(within(result).getByText("realc examples/hello.real --check")).toBeInTheDocument();
  });

  it("shows an empty state and disables run when no .real files exist", async () => {
    mocks.listRealFiles.mockResolvedValue({ ok: true, files: [], truncated: false, workspacePath: "/ws" });
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No \.real files found/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run approved check/i })).toBeDisabled();
    expect(mocks.runApprovedDryRunAction).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("surfaces a list error inertly without crashing", async () => {
    mocks.listRealFiles.mockResolvedValue({ ok: false, files: [], truncated: false, workspacePath: null, error: { code: "workspace_not_ready", message: "no workspace" } });
    render(<ApprovedDryRunPanel action={workspaceFileAction} workspacePath="/ws" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not list workspace files/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run approved check/i })).toBeDisabled();
  });

  it("keeps the fixed hello-example action working with no file picker and no relativePath", async () => {
    mocks.runApprovedDryRunAction.mockResolvedValue({
      ok: true,
      data: { ...execution("examples/hello.real"), actionId: "realc-check-hello-example" }
    });
    render(<ApprovedDryRunPanel action={helloAction} workspacePath="/ws" onClose={() => {}} />);
    expect(screen.queryByTestId("approval-file-picker")).toBeNull();
    expect(mocks.listRealFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /run approved check/i }));
    await waitFor(() => expect(mocks.runApprovedDryRunAction).toHaveBeenCalled());
    expect(mocks.runApprovedDryRunAction).toHaveBeenCalledWith("realc-check-hello-example", {
      approvalAcknowledged: true
    });
  });
});
