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

function send(prompt: string) {
  fireEvent.click(screen.getByTestId("mode-ask-local"));
  fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: prompt } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));
  fireEvent.click(screen.getByRole("button", { name: "Ask local model", exact: true }));
}

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  resetStore();
});

afterEach(() => cleanup());

describe("0.33 local chat UX hardening", () => {
  it("shows a running state and disables the send control while in flight", async () => {
    let resolveChat: (value: unknown) => void = () => {};
    mocks.runPrivateProviderChatSandbox.mockImplementation(
      () => new Promise((resolve) => { resolveChat = resolve; })
    );
    render(<WorkbenchScreen />);
    send("hold please");
    expect(await screen.findByTestId("chat-turn-loading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask local model", exact: true })).toBeDisabled();
    resolveChat({ ok: true, data: baseReport });
    await screen.findByTestId("chat-turn-response");
  });

  it("requires an explicit re-approval before retrying the same prompt (no auto-retry)", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
    render(<WorkbenchScreen />);
    send("retry me");
    await screen.findByTestId("chat-turn-response");
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1);

    const sendAgain = screen.getByRole("button", { name: "Send again" });
    expect(sendAgain).toBeDisabled();
    // No retry happened just by rendering.
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("chat-turn-retry-ack"));
    expect(sendAgain).toBeEnabled();
    fireEvent.click(sendAgain);
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));
    // The retry reused the same prompt through the same bridge.
    expect(mocks.runPrivateProviderChatSandbox).toHaveBeenLastCalledWith({ prompt: "retry me", approvalAcknowledged: true });
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
  });

  it("renders a redacted timeout error with a retry next-step", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: false,
      error: { code: "timeout", message: "Local provider request timed out." }
    });
    render(<WorkbenchScreen />);
    send("slow one");
    const error = await screen.findByTestId("chat-turn-error");
    expect(error).toHaveTextContent("timed out");
    expect(error).toHaveTextContent(/Retry below/i);
    // No raw endpoint/secret leaks in the error.
    expect(error.textContent ?? "").not.toMatch(/sk-|http:\/\/|127\.0\.0\.1|localhost/);
  });

  it("renders a useful next step and a Configure action when not configured", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: { ...baseReport, status: "not_configured", response: null, error: { code: "not_configured", message: "No local provider configured." } }
    });
    render(<WorkbenchScreen />);
    send("are you there");
    const structured = await screen.findByTestId("chat-turn-structured-error");
    expect(structured).toHaveTextContent(/Settings → Provider \/ Local Model/i);
    fireEvent.click(screen.getByRole("button", { name: /Configure local provider/i }));
    expect(useWorkbenchStore.getState().screen).toBe("settings");
    expect(useWorkbenchStore.getState().settingsSection).toBe("provider");
  });

  it("explains desktop-only execution in web mode", () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.checkBridgeHealth.mockResolvedValue({ healthy: false, resolution: { bridgeMode: "metadata-only", repoRoot: null } });
    render(<WorkbenchScreen />);
    expect(screen.getByTestId("composer-web-note")).toHaveTextContent(/desktop app only/i);
    expect(screen.getByTestId("mode-ask-local")).toBeDisabled();
  });

  it("clear response removes the visible turn", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
    render(<WorkbenchScreen />);
    send("clear me");
    await screen.findByTestId("chat-turn-response");
    fireEvent.click(screen.getByRole("button", { name: "Clear response" }));
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
  });

  it("keeps a single turn (no hidden transcript history) across multiple sends", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
    render(<WorkbenchScreen />);
    send("first question");
    await screen.findByTestId("chat-turn-response");
    // Second send replaces the first; the thread never accumulates turns.
    fireEvent.change(screen.getByLabelText("Local model request"), { target: { value: "second question" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));
    fireEvent.click(screen.getByRole("button", { name: "Ask local model", exact: true }));
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId("workbench-chat-turn")).toHaveLength(1);
    expect(screen.getByTestId("chat-turn-prompt")).toHaveTextContent("second question");
  });

  it("does not surface provider identity, keys, or paths in the turn", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
    render(<WorkbenchScreen />);
    send("identity check");
    const turn = await screen.findByTestId("workbench-chat-turn");
    const text = turn.textContent ?? "";
    expect(text).not.toMatch(/api[_ -]?key/i);
    expect(text).not.toMatch(/sk-[a-z0-9]/i);
    expect(text).not.toMatch(/\.safetensors|\.gguf|model_path|base_url/i);
    // Only the sanitized metadata is shown.
    expect(within(turn).getByText("Saved")).toBeInTheDocument();
  });

  it("does not auto-send on Enter in the textarea", () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({ ok: true, data: baseReport });
    render(<WorkbenchScreen />);
    fireEvent.click(screen.getByTestId("mode-ask-local"));
    const textarea = screen.getByLabelText("Local model request");
    fireEvent.change(textarea, { target: { value: "should not send" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
  });
});
