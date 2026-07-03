import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeScreen } from "../../src/features/home/HomeScreen";
import type { ProviderStatus } from "../../src/bridge";

const mocks = vi.hoisted(() => ({
  loadProviderStatus: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    loadProviderStatus: mocks.loadProviderStatus,
    isDesktopRuntime: mocks.isDesktopRuntime,
    checkBridgeHealth: mocks.checkBridgeHealth
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

describe("Home launchpad", () => {
  beforeEach(() => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.loadProviderStatus.mockResolvedValue(defaultsStatus);
    mocks.checkBridgeHealth.mockResolvedValue({
      healthy: false,
      resolution: { bridgeMode: "metadata-only", repoRoot: null, status: "unavailable" }
    });
  });

  afterEach(() => cleanup());

  it("renders hero and primary Open Workbench action", () => {
    render(<HomeScreen />);
    expect(screen.getByTestId("home-launchpad")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /realforge is ready/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open workbench/i })).toBeInTheDocument();
    expect(document.querySelectorAll(".home-launchpad__primary .button--primary")).toHaveLength(1);
    expect((screen.getByText(/more quick starts/i).closest("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("shows provider and safety status without private identity", async () => {
    render(<HomeScreen />);
    const summary = screen.getByTestId("home-status-summary");
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/status details/i).closest("details")).not.toHaveAttribute("open");
    expect(within(summary).getByText("Local provider")).toBeInTheDocument();
    expect(within(summary).getByText(/image execution/i)).toBeInTheDocument();
    expect(screen.getByTestId("home-safety-boundary")).toHaveTextContent(/local_untrusted/i);
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private-runtime-model/i)).not.toBeInTheDocument();
  });

  it("guides web users toward desktop for execution", () => {
    render(<HomeScreen />);
    expect(screen.getByTestId("home-next-step")).toHaveTextContent(/desktop app/i);
    expect(mocks.loadProviderStatus).not.toHaveBeenCalled();
  });

  it("loads sanitized provider status on desktop without exposing secrets", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.loadProviderStatus.mockResolvedValue({
      ...defaultsStatus,
      configured: true,
      source: "home_private",
      provider_kind: "openai_compatible_local",
      endpoint_configured: true,
      endpoint_host: "http://localhost:8000",
      model_configured: true,
      api_key_configured: true
    });
    mocks.checkBridgeHealth.mockResolvedValue({
      healthy: true,
      resolution: {
        status: "ready",
        bridgeMode: "read-only",
        repoRoot: "/mock",
        workbenchPath: "/mock/workbench",
        pythonPath: "/mock/python",
        discoveryMethod: "test",
        errors: [],
        warnings: [],
        platform: "darwin",
        arch: "arm64",
        supportedSources: []
      }
    });
    render(<HomeScreen />);
    await waitFor(() => expect(mocks.loadProviderStatus).toHaveBeenCalled());
    const summary = screen.getByTestId("home-status-summary");
    expect(within(summary).getAllByText("Configured").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/localhost:8000/)).not.toBeInTheDocument();
  });

  it("routes provider readiness to Settings provider section", async () => {
    const { useWorkbenchStore } = await import("../../src/state/workbench-store");
    useWorkbenchStore.setState({ screen: "home", settingsSection: "general" });
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^check local model$/i }));
    expect(useWorkbenchStore.getState().screen).toBe("settings");
    expect(useWorkbenchStore.getState().settingsSection).toBe("provider");
  });
});
