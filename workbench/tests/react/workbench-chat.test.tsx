import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn(),
  listReadOnlyReportSources: vi.fn(),
  runApprovedDryRunAction: vi.fn(),
  loadReadOnlyReportSource: vi.fn(),
  runPrivateProviderChatSandbox: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { WorkbenchScreen } from "../../src/features/workbench/WorkbenchScreen";
import { useWorkbenchStore } from "../../src/state/workbench-store";

function resetStore() {
  useWorkbenchStore.setState({
    screen: "workbench",
    staffPreview: false,
    commandQuery: "",
    stagedTask: "",
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
    approvalAuditStorageWarning: null,
    selectedModelProfileId: "private-local"
  });
}

const passReport = {
  ok: true as const,
  data: {
    ok: true,
    attempted: true,
    configured: true,
    provider_kind: "openai_compatible_local",
    status: "pass" as const,
    input_length: 12,
    duration_ms: 42,
    response: "Hello from the local model.",
    response_truncated: false,
    untrusted_output: true as const,
    error: null
  }
};

function enterDesktop() {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
}

function openChatOptions() {
  const options = screen.getByTestId("composer-chat-options") as HTMLDetailsElement;
  if (!options.open) fireEvent.click(within(options).getByText("Chat options"));
}

function approveLocalRequest() {
  openChatOptions();
  fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));
}

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(false);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: false, resolution: { bridgeMode: "metadata-only", repoRoot: null } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  resetStore();
});

afterEach(() => cleanup());

describe("0.32 main composer → private chat sandbox", () => {
  it("defaults to safe-preview mode in web preview with the action preview intact", () => {
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("mode-safe-preview")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.getByTestId("workbench-assistant-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-ask-approval")).toBeNull();
  });

  it("keeps web mode execution-free", () => {
    render(<WorkbenchScreen />);
    expect(screen.queryByTestId("mode-ask-local")).toBeNull();
    expect(screen.getByTestId("composer-web-note")).toHaveTextContent(/desktop app only/i);
  });

  it("requires explicit approval before the send control is enabled (desktop)", () => {
    enterDesktop();
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("composer-chat-options")).toBeInTheDocument();
    expect(screen.getByTestId("composer-ask-approval")).toBeVisible();
    const send = screen.getByRole("button", { name: "Ask local model", exact: true });
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "ping" } });
    // Still disabled while typing, before approval.
    expect(send).toBeDisabled();
    approveLocalRequest();
    expect(send).toBeEnabled();
  });

  it("never sends without an explicit approved click (no auto-send while typing)", () => {
    enterDesktop();
    render(<WorkbenchScreen />);
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "do not send me" } });
    // Submitting the form without approval must not reach the bridge.
    fireEvent.submit(screen.getByTestId("safe-command-composer"));
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
  });

  it("sends one bounded request after approval and renders an untrusted assistant turn", async () => {
    enterDesktop();
    mocks.runPrivateProviderChatSandbox.mockResolvedValue(passReport);
    render(<WorkbenchScreen />);
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "summarize this" } });
    approveLocalRequest();
    fireEvent.click(screen.getByRole("button", { name: "Ask local model", exact: true }));

    // Exactly one bounded request, with only prompt + acknowledgement (no context/tools/path).
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledWith({ prompt: "summarize this", approvalAcknowledged: true });
    const callArg = mocks.runPrivateProviderChatSandbox.mock.calls[0][0];
    expect(Object.keys(callArg).sort()).toEqual(["approvalAcknowledged", "prompt"]);

    // User prompt + LOCAL UNTRUSTED assistant response render in the thread.
    expect(screen.getByTestId("chat-turn-prompt")).toHaveTextContent("summarize this");
    const turn = await screen.findByTestId("workbench-chat-turn");
    expect(await within(turn).findByTestId("chat-turn-response")).toHaveTextContent("Hello from the local model.");
    expect(within(turn).getByText("LOCAL UNTRUSTED")).toBeInTheDocument();

    // No approval-audit entry is created for chat bodies.
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("caps the visible response and flags truncation", async () => {
    enterDesktop();
    const huge = "x".repeat(5000);
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: { ...passReport.data, response: huge, response_truncated: true }
    });
    render(<WorkbenchScreen />);
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "long please" } });
    approveLocalRequest();
    fireEvent.click(screen.getByRole("button", { name: "Ask local model", exact: true }));

    const response = await screen.findByTestId("chat-turn-response");
    expect(response.textContent?.length ?? 0).toBeLessThanOrEqual(4096);
    const turn = screen.getByTestId("workbench-chat-turn");
    expect(within(turn).getByText("TRUNCATED")).toBeInTheDocument();
  });

  it("renders a structured, redacted bridge error without crashing", async () => {
    enterDesktop();
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: false,
      error: { code: "timeout", message: "Local provider request timed out." }
    });
    render(<WorkbenchScreen />);
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "slow" } });
    approveLocalRequest();
    fireEvent.click(screen.getByRole("button", { name: "Ask local model", exact: true }));
    expect(await screen.findByTestId("chat-turn-error")).toHaveTextContent("timeout");
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("still stages a safe-preview action when switched back", () => {
    enterDesktop();
    render(<WorkbenchScreen />);
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "Fix the overflow" } });
    fireEvent.click(screen.getByTestId("mode-safe-preview"));
    expect(useWorkbenchStore.getState().stagedTask).toBe("Fix the overflow");
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });
});
