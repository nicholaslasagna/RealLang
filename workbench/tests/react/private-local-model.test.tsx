import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PrivateLocalModelPanel } from "../../src/components/PrivateLocalModelPanel";
import { PRIVATE_LOCAL_IMAGE_MODEL_PROFILE, PRIVATE_LOCAL_MODEL_PROFILE } from "../../src/providers";
import type { ProviderStatus } from "../../src/bridge";

const mocks = vi.hoisted(() => ({
  loadProviderStatus: vi.fn(),
  isDesktopRuntime: vi.fn(() => true)
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    loadProviderStatus: mocks.loadProviderStatus,
    loadPrivateLocalProviderConfig: mocks.loadProviderStatus,
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
    expect(screen.getByText(/realforge provider smoke --json/i)).toBeInTheDocument();
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
