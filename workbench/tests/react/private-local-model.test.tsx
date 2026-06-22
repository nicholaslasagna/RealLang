import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PrivateLocalModelPanel } from "../../src/components/PrivateLocalModelPanel";
import { PRIVATE_LOCAL_IMAGE_MODEL_PROFILE, PRIVATE_LOCAL_MODEL_PROFILE } from "../../src/providers";
import type { ProviderStatus } from "../../src/bridge";

const mocks = vi.hoisted(() => ({
  loadProviderStatus: vi.fn(),
  runPrivateProviderSmoke: vi.fn(),
  isDesktopRuntime: vi.fn(() => true)
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    loadProviderStatus: mocks.loadProviderStatus,
    loadPrivateLocalProviderConfig: mocks.loadProviderStatus,
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders private local profile with local untrusted label", async () => {
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("private-local-model-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(PRIVATE_LOCAL_MODEL_PROFILE.displayName.toUpperCase())).toBeInTheDocument();
    expect(screen.getAllByText(/local untrusted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/~\/\.realforge\.local\.toml/).length).toBeGreaterThan(0);
  });

  it("renders CLI-parity provider status fields", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("provider-status-grid")).toBeInTheDocument();
    });
    expect(screen.getByText(/home private config/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^YES$/).length).toBeGreaterThan(0);
    expect(screen.getByText("http://localhost:8000")).toBeInTheDocument();
    expect(screen.getByText(/api key configured/i)).toBeInTheDocument();
    expect(screen.getByText(/realforge provider status --json/i)).toBeInTheDocument();
    expect(screen.getAllByText(/realforge provider smoke --json/i).length).toBeGreaterThan(0);
  });

  it("does not expose API key value or exact model name", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByText(/model configured/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private-runtime-model/i)).not.toBeInTheDocument();
  });

  it("shows image provider configured with execution disabled", async () => {
    mocks.loadProviderStatus.mockResolvedValue(configuredStatus);
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("private-local-image-model-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(PRIVATE_LOCAL_IMAGE_MODEL_PROFILE.displayName.toUpperCase())).toBeInTheDocument();
    expect(screen.getByText(/image execution enabled/i)).toBeInTheDocument();
    expect(screen.getByText("http://localhost:8188")).toBeInTheDocument();
    expect(screen.getByText(/^DISABLED$/)).toBeInTheDocument();
  });

  it("renders structured invalid config errors safely", async () => {
    mocks.loadProviderStatus.mockResolvedValue({
      ...defaultsStatus,
      ok: false,
      source: "home_private",
      errors: [{ code: "invalid_toml", message: "Private local config TOML is invalid." }]
    });
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("provider-status-errors")).toBeInTheDocument();
    });
    expect(screen.getByText(/invalid_toml/i)).toBeInTheDocument();
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
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
      expect(screen.getByText(/desktop shell required/i)).toBeInTheDocument();
    });
    expect(mocks.loadProviderStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /desktop app required/i })).toBeDisabled();
    expect(mocks.runPrivateProviderSmoke).not.toHaveBeenCalled();
  });

  it("requires fresh approval and exposes no prompt textbox", async () => {
    render(<PrivateLocalModelPanel />);
    const runButton = await screen.findByRole("button", { name: /run provider smoke/i });
    expect(runButton).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /prompt/i })).not.toBeInTheDocument();
    expect(mocks.runPrivateProviderSmoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mocks.runPrivateProviderSmoke).toHaveBeenCalledWith({ approvalAcknowledged: true });
    });
    expect(await screen.findByTestId("provider-smoke-result")).toBeInTheDocument();
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
