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

const baseReport = {
  ok: true,
  attempted: true,
  configured: true,
  provider_kind: "openai_compatible_local",
  status: "pass" as const,
  input_length: 7,
  duration_ms: 31,
  response: "A bounded local answer.",
  response_truncated: false,
  untrusted_output: true as const,
  error: null
};

const textarea = () => screen.getByLabelText("Local model request");
const sendButton = () => screen.getByRole("button", { name: "Ask local model", exact: true });
const askLocal = () => fireEvent.click(screen.getByTestId("mode-ask-local"));
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });
const approve = () => fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
  resetStore();
});

afterEach(() => cleanup());

describe("0.38 real local chat — keyboard", () => {
  it("Enter sends in Ask local model mode (after approval)", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("hello there");
    approve();
    fireEvent.keyDown(textarea(), { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledWith({ prompt: "hello there", approvalAcknowledged: true });
  });

  it("Cmd/Ctrl+Enter also sends", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("via meta");
    approve();
    fireEvent.keyDown(textarea(), { key: "Enter", code: "Enter", metaKey: true });
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
  });

  it("Shift+Enter inserts a newline and does not send", () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("line one");
    approve();
    fireEvent.keyDown(textarea(), { key: "Enter", code: "Enter", shiftKey: true });
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });

  it("Enter does not bypass approval", () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("not approved yet");
    fireEvent.keyDown(textarea(), { key: "Enter", code: "Enter" });
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
  });

  it("does not send in web/unsupported mode (Ask-local is unavailable)", () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.checkBridgeHealth.mockResolvedValue({ healthy: false, resolution: { bridgeMode: "metadata-only", repoRoot: null } });
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("mode-ask-local")).toBeDisabled();
    expect(screen.getByTestId("composer-web-note")).toHaveTextContent(/desktop app only/i);
    // Preview-mode Enter never reaches the model.
    fireEvent.keyDown(screen.getByLabelText("Reviewed context for this action"), { key: "Enter", code: "Enter" });
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });
});

describe("0.38 real local chat — visible thread", () => {
  it("renders multiple user/assistant turns in order during the session", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("first");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");

    type("second");
    approve();
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));

    const prompts = screen.getAllByTestId("chat-turn-prompt").map((node) => node.textContent ?? "");
    expect(prompts[0]).toContain("first");
    expect(prompts[1]).toContain("second");
    expect(screen.getAllByTestId("workbench-chat-turn")).toHaveLength(2);
    // Each assistant turn is labelled untrusted.
    expect(screen.getAllByText("LOCAL UNTRUSTED").length).toBeGreaterThanOrEqual(2);
    // Chat never touches the approval audit.
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("Clear chat removes the visible turns", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("clear me");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");
    fireEvent.click(screen.getByTestId("chat-thread-clear"));
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
    expect(screen.getByTestId("chat-thread-empty")).toBeInTheDocument();
  });

  it("labels the thread session-only and states prior turns are not sent", () => {
    render(<WorkbenchScreen />);
    askLocal();
    expect(screen.getByTestId("chat-thread-empty")).toHaveTextContent(/session view only/i);
  });

  it("disables send and shows a running state while in flight", async () => {
    let resolveChat: (value: unknown) => void = () => {};
    mocks.runPrivateProviderChatSandbox.mockImplementation(() => new Promise((resolve) => { resolveChat = resolve; }));
    render(<WorkbenchScreen />);
    askLocal();
    type("hold please");
    approve();
    fireEvent.click(sendButton());
    expect(await screen.findByTestId("chat-turn-loading")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    resolveChat({ ok: true, data: baseReport });
    await screen.findByTestId("chat-turn-response");
  });

  it("caps the visible response and flags truncation", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: { ...baseReport, response: "x".repeat(5000), response_truncated: true }
    });
    render(<WorkbenchScreen />);
    askLocal();
    type("long");
    approve();
    fireEvent.click(sendButton());
    const response = await screen.findByTestId("chat-turn-response");
    expect(response.textContent?.length ?? 0).toBeLessThanOrEqual(4096);
    expect(within(screen.getByTestId("workbench-chat-turn")).getByText("TRUNCATED")).toBeInTheDocument();
  });
});

describe("0.38 real local chat — errors and provider", () => {
  it("renders a redacted timeout error with a next-step and no endpoint leak", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: false, error: { code: "timeout", message: "Local provider request timed out." } });
    render(<WorkbenchScreen />);
    askLocal();
    type("slow");
    approve();
    fireEvent.click(sendButton());
    const error = await screen.findByTestId("chat-turn-error");
    expect(error).toHaveTextContent("timed out");
    expect(error).toHaveTextContent(/Ask again/i);
    expect(error.textContent ?? "").not.toMatch(/sk-|http:\/\/|127\.0\.0\.1|localhost/);
  });

  it("offers a Configure action and next step when not configured", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: { ...baseReport, status: "not_configured", response: null, error: { code: "not_configured", message: "No local provider configured." } }
    });
    render(<WorkbenchScreen />);
    askLocal();
    type("hi");
    approve();
    fireEvent.click(sendButton());
    const structured = await screen.findByTestId("chat-turn-structured-error");
    expect(structured).toHaveTextContent(/Settings → Provider \/ Local Model/i);
    fireEvent.click(screen.getByRole("button", { name: /Configure local provider/i }));
    expect(useWorkbenchStore.getState().screen).toBe("settings");
    expect(useWorkbenchStore.getState().settingsSection).toBe("provider");
  });

  it("shows an informational profile selector that leaks no private identity", () => {
    render(<WorkbenchScreen />);
    askLocal();
    const profile = screen.getByTestId("composer-profile");
    expect(profile).toHaveTextContent(/Local model profile/i);
    expect(profile).toHaveTextContent(/Configured local provider/i);
    expect(profile).toHaveTextContent(/configured default local provider/i);
    expect(within(profile).getByRole("combobox")).toBeDisabled();
    // No actual leaked values — a key, a weights path, or a live endpoint URL.
    const text = profile.textContent ?? "";
    expect(text).not.toMatch(/sk-[a-z0-9]|\.safetensors|\.gguf|https?:\/\/|127\.0\.0\.1|localhost/i);
  });

  it("does not surface provider keys, paths, or model names in a turn", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("identity check");
    approve();
    fireEvent.click(sendButton());
    const turn = await screen.findByTestId("workbench-chat-turn");
    const text = turn.textContent ?? "";
    expect(text).not.toMatch(/api[_ -]?key|model_path|base_url|sk-[a-z0-9]|\.safetensors|\.gguf/i);
  });
});

describe("0.38 real local chat — mode separation", () => {
  it("Ask local mode does not render a staged action preview", () => {
    render(<WorkbenchScreen />);
    askLocal();
    expect(screen.queryByTestId("action-preview-card")).toBeNull();
    expect(screen.getByTestId("workbench-chat-thread")).toBeInTheDocument();
  });

  it("Safe preview mode does not call the local model", () => {
    render(<WorkbenchScreen />);
    // Default is preview mode.
    fireEvent.change(screen.getByLabelText("Reviewed context for this action"), { target: { value: "Fix the overflow" } });
    fireEvent.submit(screen.getByTestId("safe-command-composer"));
    expect(useWorkbenchStore.getState().stagedTask).toBe("Fix the overflow");
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workbench-chat-thread")).toBeNull();
  });
});
