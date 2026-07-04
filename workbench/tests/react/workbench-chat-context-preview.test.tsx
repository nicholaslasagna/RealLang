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
    approvalAuditStorageWarning: null,
    selectedModelProfileId: "private-local"
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
const askLocal = () => {
  const backToChat = screen.queryByTestId("mode-ask-local-button");
  if (backToChat) fireEvent.click(backToChat);
};
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });
const openChatOptions = () => {
  const options = screen.getByTestId("composer-chat-options") as HTMLDetailsElement;
  if (!options.open) fireEvent.click(within(options).getByText("Chat options"));
};
const approve = () => {
  openChatOptions();
  fireEvent.click(screen.getByRole("checkbox", { name: /Approve one local model request/i }));
};
const contextToggle = () => {
  openChatOptions();
  return screen.getByRole("checkbox", { name: /Include recent visible chat/i });
};
const lastCallPrompt = () => {
  const calls = mocks.runPrivateProviderChatSandbox.mock.calls;
  return calls[calls.length - 1][0].prompt as string;
};

async function completeFirstTurn(prompt = "first question", response = passReport) {
  mocks.runPrivateProviderChatSandbox.mockResolvedValueOnce(response);
  type(prompt);
  approve();
  fireEvent.click(sendButton());
  await screen.findByTestId("chat-turn-response");
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

describe("0.41 visible chat context preview", () => {
  it("shows no preview until the opt-in is enabled, and hides it again when disabled", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn();
    expect(screen.queryByTestId("composer-context-preview")).toBeNull();

    fireEvent.click(contextToggle());
    expect(screen.getByTestId("composer-context-preview")).toBeInTheDocument();
    expect(screen.getByTestId("composer-context-details")).toBeInTheDocument();

    fireEvent.click(contextToggle());
    expect(screen.queryByTestId("composer-context-preview")).toBeNull();
  });

  it("previews the exact visible turns that will be included", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn("what is a dry run");
    fireEvent.click(contextToggle());

    const entries = screen.getByTestId("composer-context-entries");
    expect(entries).toHaveTextContent("what is a dry run");
    expect(entries).toHaveTextContent(reply);
    expect(screen.getByTestId("composer-context-details")).toHaveTextContent(/No files, tools, workspace, memory, or hidden context/i);
  });

  it("excludes error turns from the preview", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn("good turn");
    // Second turn errors out and must not appear in the preview.
    mocks.runPrivateProviderChatSandbox.mockResolvedValueOnce({ ok: false, error: { code: "timeout", message: "timed out" } });
    type("bad turn");
    approve();
    fireEvent.click(sendButton());
    await screen.findByTestId("chat-turn-error");

    fireEvent.click(contextToggle());
    const entries = screen.getByTestId("composer-context-entries");
    expect(entries).toHaveTextContent("good turn");
    expect(entries).not.toHaveTextContent("bad turn");
  });

  it("discloses the cap and turn count", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn();
    fireEvent.click(contextToggle());
    const disclosure = screen.getByTestId("composer-context-disclosure");
    expect(disclosure).toHaveTextContent(/Including up to 1 visible turn/i);
    expect(disclosure).toHaveTextContent(/chars/i);
    expect(disclosure).toHaveTextContent(/visible chat only/i);
  });

  it("preview contains no provider/config/secret data", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn();
    fireEvent.click(contextToggle());
    const preview = screen.getByTestId("composer-context-preview");
    expect(preview.textContent ?? "").not.toMatch(/provider_kind|api[_ -]?key|base_url|sk-[a-z0-9]|\.safetensors|model_path/i);
  });

  it("still only sends the bounded composed prompt when enabled, with no audit or persistence", async () => {
    render(<WorkbenchScreen />);
    askLocal();
    await completeFirstTurn("first question");
    fireEvent.click(contextToggle());

    type("second question");
    approve();
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(2));

    const sent = lastCallPrompt();
    expect(sent).toContain("first question");
    expect(sent).toContain("second question");
    expect(Array.from(sent).length).toBeLessThanOrEqual(2000);
    expect(Object.keys(mocks.runPrivateProviderChatSandbox.mock.calls[1][0]).sort()).toEqual(["approvalAcknowledged", "prompt"]);
    expect(useWorkbenchStore.getState().approvalAuditEntries).toEqual([]);
    expect(window.localStorage.getItem("realforge-chat")).toBeNull();
    expect(screen.getAllByText("LOCAL UNTRUSTED").length).toBeGreaterThanOrEqual(2);
  });
});
