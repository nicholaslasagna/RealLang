import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateLocalModelPanel } from "../../src/components/PrivateLocalModelPanel";
import { SettingsScreen } from "../../src/features/settings/SettingsScreen";
import { SETTINGS_NAV_GROUPS } from "../../src/features/settings/settings-nav-groups";
import { useWorkbenchStore } from "../../src/state/workbench-store";
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

describe("Settings simplification (0.35)", () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ screen: "settings", settingsSection: "general" });
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.loadProviderStatus.mockResolvedValue(defaultsStatus);
  });

  afterEach(() => cleanup());

  it("renders grouped settings categories", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("settings-screen")).toBeInTheDocument();
    for (const group of SETTINGS_NAV_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /provider \/ local model/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^settings$/i })).toBeNull();
  });

  it("collapses safety boundaries by default", () => {
    render(<SettingsScreen />);
    const boundaries = screen.getByText(/safety details/i).closest("details");
    expect(boundaries).not.toHaveAttribute("open");
    expect(screen.getAllByText(/safe defaults/i).length).toBeGreaterThan(0);
  });

  it("keeps provider summary visible with advanced details collapsed", async () => {
    useWorkbenchStore.setState({ settingsSection: "provider" });
    render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId("provider-readiness-dashboard")).toBeInTheDocument());
    expect(screen.getByText(/provider readiness/i)).toBeInTheDocument();
    const advanced = screen.getByTestId("provider-advanced-details");
    expect(advanced).not.toHaveAttribute("open");
    expect(screen.getByTestId("provider-safe-actions")).toBeInTheDocument();
    expect(screen.getByTestId("provider-safe-actions")).not.toHaveAttribute("open");
    expect(screen.getByText(/fixed smoke check · single-turn sandbox · approval required/i)).toBeInTheDocument();
    expect(screen.getByTestId("provider-smoke-card")).toBeInTheDocument();
  });

  it("keeps smoke and chat approval-gated in safe actions", async () => {
    render(<PrivateLocalModelPanel />);
    fireEvent.click(screen.getByText(/connection checks/i));
    const smokeRun = await screen.findByRole("button", { name: /run provider smoke/i });
    const chatSend = screen.getByRole("button", { name: /send approved text/i });
    expect(smokeRun).toBeDisabled();
    expect(chatSend).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /approve one fixed provider smoke check/i }));
    expect(smokeRun).toBeEnabled();
  });

  it("keeps image execution disabled in advanced details", async () => {
    mocks.loadProviderStatus.mockResolvedValue({
      ...defaultsStatus,
      configured: true,
      image_provider_configured: true,
      image_provider_execution_enabled: false
    });
    render(<PrivateLocalModelPanel />);
    fireEvent.click(screen.getByText(/advanced provider details/i));
    await waitFor(() => expect(screen.getByTestId("private-local-image-model-panel")).toBeInTheDocument());
    expect(screen.getByText(/^DISABLED$/)).toBeInTheDocument();
  });
});
