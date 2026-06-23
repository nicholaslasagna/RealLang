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

const reply = "Answer text from the local model.";
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
    response: reply,
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
const contextToggle = () => screen.getByRole("checkbox", { name: /Include recent visible chat/i });
const lastCallPrompt = () => {
  const calls = mocks.runPrivateProviderChatSandbox.mock.calls;
  return calls[calls.length - 1][0].prompt as string;
};

async function sendTurn(text: string) {
  type(text);
  approve();
  fireEvent.click(sendButton());
}

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.listReadOnlyReportSources.mockResolvedValue([]);
  mocks.checkBridgeHealth.mockResolvedValue({ healthy: true, resolution: { bridgeMode: "read-only", repoRoot: "C:\\RealLang" } });
  mocks.runPrivateProviderChatSandbox.mockReset();
  mocks.runPrivateProviderChatSandbox.mockResolvedValue(passReport);
  resetStore();
});

afterEach(() => cleanup());

describe("0.40 opt-in bounded visible chat context", () => {
  it("defaults context off", () => {
    render(<WorkbenchScreen />);
    askLocal();
    expect(contextToggle()).not.toBeChecked();
    expect(screen.queryByTestId("composer-context-disclosure")).toBeNull();
  });

  it("with context off, a later send carries only the current prompt", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await sendTurn("first question");
    await screen.findByTestId("chat-turn-response");
    await sendTurn("second question");
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));
    expect(lastCallPrompt()).toBe("second question");
  });

  it("with context on, a later send includes bounded prior visible turns", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await sendTurn("first question");
    await screen.findByTestId("chat-turn-response");

    fireEvent.click(contextToggle());
    expect(screen.getByTestId("composer-context-disclosure")).toHaveTextContent(/Including up to 1 visible turn/i);

    await sendTurn("second question");
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));

    const sent = lastCallPrompt();
    expect(sent).toContain("first question");
    expect(sent).toContain(reply);
    expect(sent).toContain("second question");
    // Still only the two-field bounded request; capped to the backend limit.
    expect(Object.keys(mocks.runPrivateProviderChatSandbox.mock.calls[1][0]).sort()).toEqual(["approvalAcknowledged", "prompt"]);
    expect(Array.from(sent).length).toBeLessThanOrEqual(2000);
    // No provider/config/secret data is composed in.
    expect(sent).not.toMatch(/provider_kind|api[_ -]?key|base_url|endpoint|input_length|sk-/i);

    // The turn that carried context is disclosed in the thread.
    expect(screen.getAllByTestId("chat-turn-context-tag").length).toBeGreaterThanOrEqual(1);
    // No persistence / no approval audit for chat body.
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
    expect(window.localStorage.getItem("realforge-chat")).toBeNull();
    expect(screen.getAllByText("LOCAL UNTRUSTED").length).toBeGreaterThanOrEqual(2);
  });

  it("lets the user turn context off again", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await sendTurn("first question");
    await screen.findByTestId("chat-turn-response");

    fireEvent.click(contextToggle()); // on
    await sendTurn("second question");
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));
    expect(lastCallPrompt()).toContain("first question");

    fireEvent.click(contextToggle()); // off again
    expect(screen.queryByTestId("composer-context-disclosure")).toBeNull();
    await sendTurn("third question");
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(3));
    expect(lastCallPrompt()).toBe("third question");
  });

  it("discloses 'no prior turns yet' when context is on with an empty thread", () => {
    render(<WorkbenchScreen />);
    askLocal();
    fireEvent.click(contextToggle());
    expect(screen.getByTestId("composer-context-disclosure")).toHaveTextContent(/No prior visible turns/i);
  });
});
