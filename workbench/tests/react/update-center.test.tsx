import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { UpdateCenterPanel } from "../../src/components/UpdateCenterPanel";

const mocks = vi.hoisted(() => ({
  getUpdateStatus: vi.fn(),
  checkForUpdate: vi.fn(),
  isDesktopRuntime: vi.fn(() => false)
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    getUpdateStatus: mocks.getUpdateStatus,
    checkForUpdate: mocks.checkForUpdate,
    isDesktopRuntime: mocks.isDesktopRuntime
  };
});

const baseConfiguration = {
  configured: false,
  channel: "stable" as const,
  endpointConfigured: false,
  endpointUrl: null,
  publicKeyConfigured: false,
  signingRequired: true,
  installAllowed: false,
  disabledReason: "Signed update endpoint and public key are not configured for this build."
};

const releaseChecklist = [
  { id: "version_bump", label: "App version bumped", status: "pending" as const },
  { id: "signed_bundle", label: "Signed bundle generated", status: "pending" as const }
];

const notConfiguredStatus = {
  state: "not_configured" as const,
  configured: false,
  currentVersion: "0.16.0",
  platform: "macos",
  arch: "aarch64",
  channel: "stable" as const,
  configuration: baseConfiguration,
  latestVersion: null,
  releaseNotes: null,
  message: "Signed update endpoint and public key are not configured for this build.",
  safetyNotes: ["Only signed update packages may be installed."],
  releaseChecklist
};

describe("Update center panel", () => {
  beforeEach(() => {
    cleanup();
    mocks.getUpdateStatus.mockReset();
    mocks.checkForUpdate.mockReset();
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.getUpdateStatus.mockResolvedValue({
      state: "unavailable_web",
      configured: false,
      currentVersion: "0.16.0",
      platform: "MacIntel",
      arch: "unknown",
      channel: "stable",
      configuration: {
        ...baseConfiguration,
        disabledReason: "App updates are managed by the desktop shell only."
      },
      latestVersion: null,
      releaseNotes: null,
      message: "App updates are managed by the desktop shell only.",
      safetyNotes: ["Signed updates are required before any install or restart."],
      releaseChecklist: []
    });
  });

  it("renders web unavailable state", async () => {
    render(<UpdateCenterPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("update-center")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/desktop shell only/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /check for updates/i })).toBeDisabled();
    expect(screen.getByTestId("update-install-button")).toBeDisabled();
  });

  it("shows not configured on desktop without enabling check", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.getUpdateStatus.mockResolvedValue(notConfiguredStatus);
    render(<UpdateCenterPanel />);
    await waitFor(() => {
      expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/public key/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/release endpoint/i)).toBeInTheDocument();
    expect(screen.getByTestId("update-release-checklist")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /check for updates/i });
    expect(buttons[buttons.length - 1]).toBeDisabled();
    expect(screen.getByTestId("update-install-button")).toBeDisabled();
    expect(mocks.checkForUpdate).not.toHaveBeenCalled();
  });

  it("shows missing public key requirement when misconfigured", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.getUpdateStatus.mockResolvedValue({
      ...notConfiguredStatus,
      state: "missing_public_key",
      configuration: {
        ...baseConfiguration,
        endpointConfigured: true,
        endpointUrl: "https://releases.example.com/workbench/latest.json",
        disabledReason: "Update endpoint is set but no public key is configured."
      },
      message: "Update endpoint is configured but the minisign public key is missing."
    });
    render(<UpdateCenterPanel />);
    await waitFor(() => {
      expect(screen.getByText(/missing public key/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /check for updates/i })).toBeDisabled();
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument();
  });

  it("shows ready for integration without fake success when fully configured", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.getUpdateStatus.mockResolvedValue({
      ...notConfiguredStatus,
      state: "ready_to_check",
      configured: true,
      configuration: {
        configured: true,
        channel: "preview",
        endpointConfigured: true,
        endpointUrl: "https://releases.example.com/workbench/latest.json",
        publicKeyConfigured: true,
        signingRequired: true,
        installAllowed: false,
        disabledReason: null
      },
      message: "Signed updater configuration detected. Update checking is ready for integration."
    });
    mocks.checkForUpdate.mockResolvedValue({
      ok: false,
      state: "ready_to_check",
      configured: true,
      message: "Network check and install are not wired in this build.",
      latestVersion: null,
      releaseNotes: null
    });
    render(<UpdateCenterPanel />);
    await waitFor(() => {
      expect(screen.getByText(/ready for integration/i)).toBeInTheDocument();
    });
    const checkButton = screen.getByRole("button", { name: /check for updates/i });
    expect(checkButton).not.toBeDisabled();
    expect(screen.getByTestId("update-install-button")).toBeDisabled();
  });
});
