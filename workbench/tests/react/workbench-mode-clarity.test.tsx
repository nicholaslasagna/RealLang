import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
  checkBridgeHealth: vi.fn(),
  listReadOnlyReportSources: vi.fn(),
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
    settingsSection: "general",
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
    approvalAuditStorageWarning: null
  });
}

const passReport = {
  ok: true,
  data: {
    ok: true, attempted: true, configured: true, provider_kind: "openai_compatible_local",
    status: "pass" as const, input_length: 5, duration_ms: 20, response: "Hi.",
    response_truncated: false, untrusted_output: true as const, error: null
  }
};

const safePreviewInput = () => screen.getByLabelText("Reviewed context for this action");
const composer = () => screen.getByTestId("safe-command-composer");
const openChatOptions = () => {
  const options = screen.getByTestId("composer-chat-options") as HTMLDetailsElement;
  if (!options.open) fireEvent.click(within(options).getByText("Chat options"));
};

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  mocks.runPrivateProviderChatSandbox.mockResolvedValue(passReport);
  resetStore();
});

afterEach(() => cleanup());

describe("0.42 chat vs safe-preview clarity", () => {
  it("clearly offers a Chat mode (sandbox available)", () => {
    render(<WorkbenchScreen />);
    const chat = screen.getByTestId("mode-ask-local");
    expect(chat).toBeEnabled();
    expect(chat).toHaveTextContent(/Chat/);
  });

  it("Chat mode starts with collapsed options and no Commands button", () => {
    render(<WorkbenchScreen />);
    fireEvent.click(screen.getByTestId("mode-ask-local"));

    const options = screen.getByTestId("composer-chat-options") as HTMLDetailsElement;
    expect(options.open).toBe(false);
    expect(screen.queryByRole("button", { name: "Commands", exact: true })).toBeNull();
    expect(screen.getByLabelText("Local model request")).toHaveAttribute("placeholder", "Ask your local model…");
    expect(screen.getByTestId("composer-ask-approval")).not.toBeVisible();
    expect(screen.getByTestId("composer-profile")).not.toBeVisible();

    openChatOptions();
    expect(options.open).toBe(true);
    expect(screen.getByRole("checkbox", { name: /Approve one local model request/i })).toBeInTheDocument();
    expect(screen.getByTestId("composer-context-toggle")).toBeVisible();
  });

  it("does NOT turn conversational text into a repair dry-run in Safe preview", () => {
    render(<WorkbenchScreen />);
    fireEvent.change(safePreviewInput(), { target: { value: "My favorite test word is nebula" } });
    fireEvent.submit(composer());
    // Text is staged, but no fake repair preview / no model call.
    expect(useWorkbenchStore.getState().stagedTask).toBe("My favorite test word is nebula");
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.queryByText("STRUCTURED PLAN")).toBeNull();
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    // A gentle nudge points to Chat instead.
    expect(screen.getByTestId("chat-nudge")).toHaveTextContent(/looks like a chat message/i);
  });

  it("the nudge switches to Chat without calling the model", () => {
    render(<WorkbenchScreen />);
    fireEvent.change(safePreviewInput(), { target: { value: "tell me a joke" } });
    fireEvent.submit(composer());
    fireEvent.click(screen.getByTestId("chat-nudge-switch"));
    expect(screen.getByTestId("workbench-chat-thread")).toBeInTheDocument();
    expect(screen.getByTestId("composer-chat-options")).toBeInTheDocument();
    expect(screen.getByTestId("composer-ask-approval")).not.toBeVisible();
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });

  it("Safe preview still stages an action preview for an explicit suggestion", () => {
    render(<WorkbenchScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Load capabilities report" }));
    expect(screen.getByTestId("action-preview-card")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-nudge")).toBeNull();
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });

  it("Ask local model does not show an action preview; the context toggle is chat-only", () => {
    render(<WorkbenchScreen />);
    // Context toggle is not present in Safe preview.
    expect(screen.queryByTestId("composer-context-toggle")).toBeNull();
    fireEvent.click(screen.getByTestId("mode-ask-local"));
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.getByTestId("workbench-chat-thread")).toBeInTheDocument();
    openChatOptions();
    expect(screen.getByTestId("composer-context-toggle")).toBeInTheDocument();
  });

  it("Ask local model sends through the sandbox only after approval; Safe preview never calls the model", async () => {
    render(<WorkbenchScreen />);
    // Safe preview never calls the model.
    fireEvent.change(safePreviewInput(), { target: { value: "stage something" } });
    fireEvent.submit(composer());
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();

    // Chat: requires approval.
    fireEvent.click(screen.getByTestId("mode-ask-local"));
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "hello" } });
    const send = screen.getByRole("button", { name: "Ask local model", exact: true });
    expect(send).toBeDisabled();
    fireEvent.submit(composer());
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();

    openChatOptions();
    fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));
    fireEvent.click(send);
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledWith({ prompt: "hello", approvalAcknowledged: true });
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("explains why Chat is unavailable in web mode", () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.checkBridgeHealth.mockResolvedValue({ healthy: false, resolution: { bridgeMode: "metadata-only", repoRoot: null } });
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("mode-ask-local")).toBeDisabled();
    expect(screen.getByTestId("composer-web-note")).toHaveTextContent(/desktop app only/i);
  });
});
