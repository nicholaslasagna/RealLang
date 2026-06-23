import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    ok: true,
    attempted: true,
    configured: true,
    provider_kind: "openai_compatible_local",
    status: "pass" as const,
    input_length: 5,
    duration_ms: 22,
    response: "Bounded local answer.",
    response_truncated: false,
    untrusted_output: true as const,
    error: null
  }
};

const textarea = () => screen.getByLabelText("Local model request") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Ask local model", exact: true });
const askLocal = () => fireEvent.click(screen.getByTestId("mode-ask-local"));
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });
const approve = () => fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));

let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  mocks.runPrivateProviderChatSandbox.mockResolvedValue(passReport);
  scrollSpy = vi.fn();
  // jsdom has no layout; provide a spy so the auto-scroll behavior is observable.
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollSpy;
  resetStore();
});

afterEach(() => cleanup());

describe("0.39 local chat usability polish", () => {
  it("scrolls the newest turn into view after a send", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("hello");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("returns focus to the composer after a button send", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("focus me");
    approve();
    fireEvent.click(sendButton());
    expect(document.activeElement).toBe(textarea());
    await screen.findByTestId("chat-turn-response");
  });

  it("renders a pending assistant state while the request is in flight", async () => {
    let resolveChat: (value: unknown) => void = () => {};
    mocks.runPrivateProviderChatSandbox.mockImplementation(() => new Promise((resolve) => { resolveChat = resolve; }));
    render(<WorkbenchScreen />);
    askLocal();
    type("pending");
    approve();
    fireEvent.click(sendButton());
    const loading = await screen.findByTestId("chat-turn-loading");
    expect(loading).toHaveTextContent(/responding/i);
    resolveChat(passReport);
    await screen.findByTestId("chat-turn-response");
  });

  it("renders a long multi-line prompt in full (wrapping preserved)", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    const long = "first line\n" + "z".repeat(600);
    type(long);
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");
    expect(screen.getByTestId("chat-turn-prompt")).toHaveTextContent("first line");
    expect((screen.getByTestId("chat-turn-prompt").textContent ?? "").length).toBeGreaterThan(600);
  });

  it("Clear chat removes turns and keeps the mode and composer usable", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("one");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");

    fireEvent.click(screen.getByTestId("chat-thread-clear"));
    expect(screen.queryByTestId("workbench-chat-turn")).toBeNull();
    expect(screen.getByTestId("chat-thread-empty")).toBeInTheDocument();
    // Still in Ask-local mode and able to send again.
    expect(screen.getByTestId("composer-ask-approval")).toBeInTheDocument();
    type("two");
    approve();
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));
  });

  it("never sends prior turns to the provider (each call is bounded)", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    type("first prompt");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-response");

    type("second prompt");
    approve();
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));

    const second = mocks.runPrivateProviderChatSandbox.mock.calls[1][0];
    expect(second).toEqual({ prompt: "second prompt", approvalAcknowledged: true });
    expect(Object.keys(second).sort()).toEqual(["approvalAcknowledged", "prompt"]);
    // The second request does not carry the first turn's text.
    expect(JSON.stringify(second)).not.toContain("first prompt");
    // Still LOCAL UNTRUSTED, no audit, no persistence.
    expect(screen.getAllByText("LOCAL UNTRUSTED").length).toBeGreaterThanOrEqual(2);
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
    expect(window.localStorage.getItem("realforge-chat")).toBeNull();
  });
});
