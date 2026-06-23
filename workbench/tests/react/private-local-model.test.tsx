import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PrivateLocalModelPanel } from "../../src/components/PrivateLocalModelPanel";
import { PRIVATE_LOCAL_IMAGE_MODEL_PROFILE, PRIVATE_LOCAL_MODEL_PROFILE } from "../../src/providers";
import type { ProviderChatSandboxResult, ProviderStatus } from "../../src/bridge";

const mocks = vi.hoisted(() => ({
  cancelPrivateProviderChatSandbox: vi.fn(),
  loadProviderStatus: vi.fn(),
  runPrivateProviderChatSandbox: vi.fn(),
  runPrivateProviderSmoke: vi.fn(),
  isDesktopRuntime: vi.fn(() => true)
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    loadProviderStatus: mocks.loadProviderStatus,
    loadPrivateLocalProviderConfig: mocks.loadProviderStatus,
    cancelPrivateProviderChatSandbox: mocks.cancelPrivateProviderChatSandbox,
    runPrivateProviderChatSandbox: mocks.runPrivateProviderChatSandbox,
    runPrivateProviderSmoke: mocks.runPrivateProviderSmoke,
    isDesktopRuntime: mocks.isDesktopRuntime
  };
});

const defaultsStatus: ProviderStatus = {
  ok: true,
  configured: false,
  source: "defaults",
  provider_kind: "mock",
  trust: "local_untrusted",
  endpoint_configured: false,
  endpoint_host: null,
  model_configured: false,
  api_key_configured: false,
  image_provider_configured: false,
  image_provider_kind: null,
  image_endpoint_host: null,
  image_provider_execution_enabled: false,
  warnings: [],
  errors: []
};

const configuredStatus: ProviderStatus = {
  ok: true,
  configured: true,
  source: "home_private",
  provider_kind: "openai_compatible_local",
  trust: "local_untrusted",
  endpoint_configured: true,
  endpoint_host: "http://localhost:8000",
  model_configured: true,
  api_key_configured: true,
  image_provider_configured: true,
  image_provider_kind: "local_image_provider",
  image_endpoint_host: "http://localhost:8188",
  image_provider_execution_enabled: false,
  warnings: [],
  errors: []
};

describe("Private local model panel", () => {
  beforeEach(() => {
    cleanup();
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.loadProviderStatus.mockReset();
    mocks.loadProviderStatus.mockResolvedValue(defaultsStatus);
    mocks.runPrivateProviderSmoke.mockReset();
    mocks.runPrivateProviderSmoke.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        endpoint_configured: true,
        endpoint_host: "http://localhost:8000",
        model_configured: true,
        api_key_configured: true,
        status: "pass",
        duration_ms: 37,
        response_preview: "OK",
        response_truncated: false,
        untrusted_output: true,
        error: null
      }
    });
    mocks.runPrivateProviderChatSandbox.mockReset();
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        status: "pass",
        input_length: 16,
        duration_ms: 48,
        response: "Bounded response",
        response_truncated: false,
        untrusted_output: true,
        error: null
      }
    });
    mocks.cancelPrivateProviderChatSandbox.mockReset();
    mocks.cancelPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      status: "cancellation_requested"
    });
  });

  afterEach(() => {
    cleanup();
    delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    vi.restoreAllMocks();
  });

  function openProviderAdvancedDetails() {
    fireEvent.click(screen.getByText(/advanced provider details/i));
  }

  function openReadinessChecklist() {
    fireEvent.click(screen.getByText(/readiness checklist/i));
  }

  it("renders private local profile with local untrusted label", async () => {
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("private-local-model-panel")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: PRIVATE_LOCAL_MODEL_PROFILE.displayName })).toBeInTheDocument();
    expect(screen.getAllByText(/local untrusted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/exact identity and secrets never cross/i)).toBeInTheDocument();
  });

  it("renders CLI-parity provider status fields", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    openProviderAdvancedDetails();
    await waitFor(() => {
      expect(screen.getByTestId("provider-status-grid")).toBeInTheDocument();
    });
    expect(screen.getByText(/private home config/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^YES$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("loopback host").length).toBeGreaterThan(0);
    expect(screen.queryByText("http://localhost:8000")).not.toBeInTheDocument();
    expect(screen.getAllByText(/api key configured/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/realforge provider status --json/i)).toBeInTheDocument();
    expect(screen.getAllByText(/realforge provider smoke --json/i).length).toBeGreaterThan(0);
  });

  it("does not expose API key value or exact model name", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getAllByText(/model configured/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private-runtime-model/i)).not.toBeInTheDocument();
  });

  it("shows image provider configured with execution disabled", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    openProviderAdvancedDetails();
    await waitFor(() => {
      expect(screen.getByTestId("private-local-image-model-panel")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: PRIVATE_LOCAL_IMAGE_MODEL_PROFILE.displayName })).toBeInTheDocument();
    expect(screen.getByText(/^Image execution$/i)).toBeInTheDocument();
    expect(screen.getAllByText("loopback host").length).toBeGreaterThan(0);
    expect(screen.queryByText("http://localhost:8188")).not.toBeInTheDocument();
    expect(screen.getByText(/^DISABLED$/)).toBeInTheDocument();
  });

  it("renders the sanitized provider lifecycle and disconnected boundaries", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    const dashboard = await screen.findByTestId("provider-readiness-dashboard");
    expect(within(dashboard).getByText("Provider readiness")).toBeInTheDocument();
    openReadinessChecklist();
    expect(within(dashboard).getByText("Private config")).toBeInTheDocument();
    expect(within(dashboard).getByText("Sanitized status")).toBeInTheDocument();
    expect(within(dashboard).getByText("Fixed smoke check")).toBeInTheDocument();
    expect(within(dashboard).getByText("Private chat sandbox")).toBeInTheDocument();
    expect(within(dashboard).getByText("Image provider")).toBeInTheDocument();
    openProviderAdvancedDetails();
    const safety = screen.getByTestId("provider-safety-boundary");
    expect(within(safety).getAllByText("OFF")).toHaveLength(7);
    for (const label of ["Workspace context", "File access", "Tools", "Shell", "Memory", "Persistence", "Image generation"]) {
      expect(within(safety).getByText(label)).toBeInTheDocument();
    }
    expect(within(dashboard).getByText("Config detected")).toBeInTheDocument();
    expect(within(dashboard).getByText("METADATA ONLY")).toBeInTheDocument();
    expect(within(dashboard).getByTestId("provider-readiness-diagnosis")).toHaveTextContent(/Configured, not verified/i);
  });

  it("advances readiness from configured to sandbox ready after a session smoke pass", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    const dashboard = await screen.findByTestId("provider-readiness-dashboard");
    expect(within(dashboard).getByText("Config detected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    fireEvent.click(screen.getByRole("button", { name: /run provider smoke/i }));

    await waitFor(() => expect(within(dashboard).getByText(/sandbox ready/i)).toBeInTheDocument());
    expect(within(dashboard).getAllByText("PASS").length).toBeGreaterThan(0);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("renders structured invalid config errors safely", async () => {
    mocks.loadProviderStatus.mockResolvedValue({
      ...defaultsStatus,
      ok: false,
      source: "home_private",
      errors: [{ code: "invalid_toml", message: "Private local config TOML is invalid." }]
    });
    render(<PrivateLocalModelPanel />);
    openProviderAdvancedDetails();
    await waitFor(() => {
      expect(screen.getByTestId("provider-status-errors")).toBeInTheDocument();
    });
    expect(screen.getByText(/invalid_toml/i)).toBeInTheDocument();
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
  });

  it("renders each sanitized provider warning once", async () => {
    mocks.loadProviderStatus.mockResolvedValue({
      ...configuredStatus,
      warnings: ["Sanitized provider warning."]
    });
    render(<PrivateLocalModelPanel />);
    openProviderAdvancedDetails();
    await screen.findByTestId("provider-status-warnings");
    expect(screen.getAllByText("Sanitized provider warning.")).toHaveLength(1);
  });

  it("does not hardcode private model names", () => {
    const source = [
      PRIVATE_LOCAL_MODEL_PROFILE.displayName,
      PRIVATE_LOCAL_MODEL_PROFILE.modelNamePlaceholder,
      PRIVATE_LOCAL_MODEL_PROFILE.id,
      PRIVATE_LOCAL_IMAGE_MODEL_PROFILE.displayName,
      PRIVATE_LOCAL_IMAGE_MODEL_PROFILE.id
    ].join(" ");
    const forbidden = ["qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"];
    for (const term of forbidden) {
      expect(source.toLowerCase()).not.toContain(term);
    }
  });

  it("shows web unavailable state without loading status", async () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.loadProviderStatus.mockClear();
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByText(/desktop status unavailable/i)).toBeInTheDocument();
    });
    expect(mocks.loadProviderStatus).not.toHaveBeenCalled();
    const desktopOnlyButtons = screen.getAllByRole("button", { name: /desktop app required/i });
    expect(desktopOnlyButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(mocks.runPrivateProviderSmoke).not.toHaveBeenCalled();
    expect(desktopOnlyButtons.length).toBeGreaterThan(1);
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
    const dashboard = screen.getByTestId("provider-readiness-dashboard");
    expect(within(dashboard).getByText("DESKTOP ONLY")).toBeInTheDocument();
    expect(within(dashboard).getByText("LOCKED")).toBeInTheDocument();
  });

  it("requires fresh approval and exposes no prompt textbox", async () => {
    render(<PrivateLocalModelPanel />);
    const runButton = await screen.findByRole("button", { name: /run provider smoke/i });
    expect(runButton).toBeDisabled();
    expect(within(screen.getByTestId("provider-smoke-card")).queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.runPrivateProviderSmoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mocks.runPrivateProviderSmoke).toHaveBeenCalledWith({ approvalAcknowledged: true });
    });
    expect(await screen.findByTestId("provider-smoke-result")).toBeInTheDocument();
    expect(screen.getAllByText("loopback host").length).toBeGreaterThan(0);
    expect(screen.queryByText("http://localhost:8000")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/untrusted provider response preview/i)).toHaveTextContent("OK");
    expect(screen.getAllByText(/^UNTRUSTED$/).length).toBeGreaterThan(0);
    expect(runButton).toBeDisabled();
  });

  it("caps the displayed preview and ignores extra private response fields", async () => {
    const fullResponse = "X".repeat(400);
    mocks.runPrivateProviderSmoke.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        endpoint_configured: true,
        endpoint_host: "http://localhost:8000",
        model_configured: true,
        api_key_configured: true,
        status: "pass",
        duration_ms: 37,
        response_preview: fullResponse,
        response_truncated: false,
        untrusted_output: true,
        error: null,
        api_key: "not-visible-secret-value",
        model: "hidden-local-identity",
        model_path: "/private/model/location"
      }
    });
    render(<PrivateLocalModelPanel />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    fireEvent.click(screen.getByRole("button", { name: /run provider smoke/i }));

    const preview = await screen.findByLabelText(/untrusted provider response preview/i);
    expect(preview.textContent).toHaveLength(160);
    expect(screen.getByText("TRUNCATED")).toBeInTheDocument();
    expect(screen.queryByText(/not-visible-secret-value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden-local-identity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private\/model\/location/i)).not.toBeInTheDocument();
  });

  it("renders structured not-configured results without a response preview", async () => {
    mocks.runPrivateProviderSmoke.mockResolvedValue({
      ok: true,
      data: {
        ok: false,
        attempted: false,
        configured: false,
        provider_kind: null,
        endpoint_configured: false,
        endpoint_host: null,
        model_configured: false,
        api_key_configured: false,
        status: "not_configured",
        duration_ms: 2,
        response_preview: null,
        response_truncated: false,
        untrusted_output: true,
        error: { code: "not_configured", message: "Private local provider is not configured." }
      }
    });
    render(<PrivateLocalModelPanel />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    fireEvent.click(screen.getByRole("button", { name: /run provider smoke/i }));

    expect(await screen.findByTestId("provider-smoke-result")).toBeInTheDocument();
    expect(screen.getAllByText(/^NOT CONFIGURED$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\[not_configured\]/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/untrusted provider response preview/i)).not.toBeInTheDocument();
  });

  it("requires approval before sending bounded sandbox text", async () => {
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    const send = screen.getByRole("button", { name: /send approved text/i });
    expect(send).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "One local request" } });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => {
      expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledWith({
        prompt: "One local request",
        approvalAcknowledged: true
      });
    });
    expect(await screen.findByTestId("chat-sandbox-result")).toBeInTheDocument();
    expect(screen.getByLabelText(/untrusted private chat sandbox response/i)).toHaveTextContent("Bounded response");
    expect(screen.getAllByText("LOCAL UNTRUSTED").length).toBeGreaterThan(0);
    expect(send).toBeDisabled();
  });

  it("locks the sandbox while running and resets approval after completion", async () => {
    let resolveRequest: (value: ProviderChatSandboxResult) => void = () => {};
    mocks.runPrivateProviderChatSandbox.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    const approval = screen.getByRole("checkbox", { name: /approve this one local provider request/i });
    fireEvent.change(textarea, { target: { value: "One request" } });
    fireEvent.click(approval);
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));

    expect(screen.getByRole("button", { name: /waiting for local response/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel request/i })).toBeEnabled();
    expect(textarea).toBeDisabled();

    resolveRequest({
      ok: false,
      error: { code: "cancelled", message: "Private chat sandbox request was cancelled." }
    });
    await waitFor(() => expect(screen.getByText(/request cancelled/i)).toBeInTheDocument());
    expect(approval).not.toBeChecked();
    expect(textarea).toBeEnabled();
  });

  it("requests desktop cancellation and renders the redacted cancelled state", async () => {
    let resolveRequest: (value: ProviderChatSandboxResult) => void = () => {};
    mocks.runPrivateProviderChatSandbox.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    fireEvent.change(textarea, { target: { value: "Sensitive user text" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel request/i }));

    await waitFor(() => expect(mocks.cancelPrivateProviderChatSandbox).toHaveBeenCalledWith());
    expect(screen.getByRole("button", { name: /cancelling request/i })).toBeDisabled();
    resolveRequest({
      ok: false,
      error: { code: "cancelled", message: "Private chat sandbox request was cancelled." }
    });
    const error = await screen.findByTestId("chat-sandbox-bridge-error");
    expect(error).toHaveTextContent("[cancelled] Request cancelled");
    expect(error).not.toHaveTextContent("Sensitive user text");
  });

  it("renders a redacted timeout state without echoing the prompt", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: false,
      error: {
        code: "timeout",
        message: "Private chat sandbox timed out before returning a result."
      }
    });
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    fireEvent.change(textarea, { target: { value: "Do not echo this prompt" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));

    const error = await screen.findByTestId("chat-sandbox-bridge-error");
    expect(error).toHaveTextContent("[timeout] Request timed out");
    expect(error).not.toHaveTextContent("Do not echo this prompt");
  });

  it("caps sandbox prompt and response text", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        status: "pass",
        input_length: 2000,
        duration_ms: 48,
        response: "R".repeat(5000),
        response_truncated: false,
        untrusted_output: true,
        error: null
      }
    });
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    fireEvent.change(textarea, { target: { value: "P".repeat(2200) } });
    expect(textarea).toHaveValue("P".repeat(2000));
    expect(screen.getByText(/2,000 \/ 2,000 characters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));

    const response = await screen.findByLabelText(/untrusted private chat sandbox response/i);
    expect(response.textContent).toHaveLength(4096);
    expect(screen.getByText("TRUNCATED")).toBeInTheDocument();
  });

  it("does not render extra private fields and clears all sandbox content", async () => {
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        status: "pass",
        input_length: 5,
        duration_ms: 48,
        response: "Visible response",
        response_truncated: false,
        untrusted_output: true,
        error: null,
        api_key: "not-visible-key-value",
        model: "hidden-local-identity",
        model_path: "/hidden/model/location"
      }
    });
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));
    expect(await screen.findByText("Visible response")).toBeInTheDocument();
    expect(screen.queryByText(/not-visible-key-value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden-local-identity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden\/model\/location/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear sandbox/i }));
    expect(textarea).toHaveValue("");
    expect(screen.queryByTestId("chat-sandbox-result")).not.toBeInTheDocument();
  });

  it("clears only the visible response when requested", async () => {
    render(<PrivateLocalModelPanel />);
    const textarea = await screen.findByRole("textbox", { name: /your sandbox text/i });
    fireEvent.change(textarea, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));
    expect(await screen.findByTestId("chat-sandbox-result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear response/i }));
    expect(screen.queryByTestId("chat-sandbox-result")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("Keep this draft");
  });

  it("copies only the capped visible response with an untrusted label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    mocks.runPrivateProviderChatSandbox.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        status: "pass",
        input_length: 5,
        duration_ms: 48,
        response: "R".repeat(5_000),
        response_truncated: true,
        untrusted_output: true,
        error: null
      }
    });
    render(<PrivateLocalModelPanel />);
    fireEvent.change(await screen.findByRole("textbox", { name: /your sandbox text/i }), {
      target: { value: "Hello" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this one local provider request/i }));
    fireEvent.click(screen.getByRole("button", { name: /send approved text/i }));
    fireEvent.click(await screen.findByRole("button", { name: /copy response/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`LOCAL UNTRUSTED\n\n${"R".repeat(4_096)}`);
    expect(screen.getByRole("button", { name: /copied untrusted response/i })).toBeInTheDocument();

  });

  it("does not use fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called");
    });
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(mocks.loadProviderStatus).toHaveBeenCalled();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
