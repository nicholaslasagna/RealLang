import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WorkspacePanel } from "../../src/components/WorkspacePanel";
import { WorkspaceOnboardingCard } from "../../src/components/WorkspaceOnboardingCard";

const mocks = vi.hoisted(() => ({
  checkBridgeHealth: vi.fn(),
  getSavedWorkspace: vi.fn(),
  getWorkspacePaths: vi.fn(),
  clearSavedWorkspace: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  selectWorkspaceDirectory: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    checkBridgeHealth: mocks.checkBridgeHealth,
    getSavedWorkspace: mocks.getSavedWorkspace,
    getWorkspacePaths: mocks.getWorkspacePaths,
    clearSavedWorkspace: mocks.clearSavedWorkspace,
    isDesktopRuntime: mocks.isDesktopRuntime,
    selectWorkspaceDirectory: mocks.selectWorkspaceDirectory
  };
});

const sampleHealth = {
  healthy: false,
  probeAttempted: false,
  probeOk: false,
  probeSourceId: null,
  nextActions: ["Install the desktop app to connect to a local RealForge repository."],
  resolution: {
    status: "unknown" as const,
    repoRoot: null,
    workbenchPath: null,
    pythonPath: null,
    discoveryMethod: "web_preview",
    errors: ["Workspace resolution runs in the desktop shell only."],
    warnings: [],
    bridgeMode: "metadata-only" as const,
    platform: "MacIntel",
    arch: "unknown",
    supportedSources: [
      {
        id: "capabilities",
        label: "Capability registry",
        description: "test",
        displayCommand: "realforge capabilities --json",
        detectType: "capability_registry",
        readOnly: true as const
      }
    ]
  }
};

describe("workspace runtime UI", () => {
  beforeEach(() => {
    mocks.checkBridgeHealth.mockReset();
    mocks.getSavedWorkspace.mockReset();
    mocks.getWorkspacePaths.mockReset();
    mocks.clearSavedWorkspace.mockReset();
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.getSavedWorkspace.mockResolvedValue(null);
    mocks.getWorkspacePaths.mockResolvedValue({
      appDataDir: null,
      appConfigDir: null,
      resourceDir: null,
      configFile: null
    });
    mocks.checkBridgeHealth.mockResolvedValue(sampleHealth);
  });

  it("renders Settings workspace panel with bridge metadata", async () => {
    render(<WorkspacePanel />);
    await waitFor(() => {
      expect(screen.getByTestId("workspace-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(/supported read-only sources/i)).toBeInTheDocument();
    expect(screen.getAllByText(/capabilities/).length).toBeGreaterThan(0);
    expect(screen.getByText(/web preview shows workspace metadata only/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved across app restarts/i)).toBeInTheDocument();
  });

  it("renders persisted workspace details when saved", async () => {
    mocks.getSavedWorkspace.mockResolvedValue({
      repoRoot: "/tmp/saved-repo",
      discoveryMethod: "saved",
      savedAt: "1710000000",
      lastHealthOkAt: "1710000100",
      lastHealthStatus: "ready"
    });
    mocks.getWorkspacePaths.mockResolvedValue({
      appDataDir: "/app/data",
      appConfigDir: "/app/config",
      resourceDir: null,
      configFile: "/app/config/workspace.json"
    });
    render(<WorkspacePanel />);
    await waitFor(() => {
      expect(screen.getByText("/tmp/saved-repo")).toBeInTheDocument();
    });
    expect(screen.getByText("/app/config/workspace.json")).toBeInTheDocument();
  });

  it("renders home onboarding card in web preview", async () => {
    render(<WorkspaceOnboardingCard />);
    await waitFor(() => {
      expect(screen.getByTestId("workspace-onboarding")).toBeInTheDocument();
    });
    expect(screen.getByText(/desktop workspace preview/i)).toBeInTheDocument();
    expect(screen.getByText(/validated and persisted/i)).toBeInTheDocument();
  });

  it("renders saved workspace missing state with clear and reselect actions", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.checkBridgeHealth.mockResolvedValue({
      ...sampleHealth,
      healthy: false,
      nextActions: [
        "Choose a new RealForge repository folder.",
        "Or clear the saved workspace to fall back to REALFORGE_REPO_ROOT or automatic discovery."
      ],
      resolution: {
        ...sampleHealth.resolution,
        status: "saved_path_missing",
        repoRoot: "/tmp/moved-repo",
        discoveryMethod: "saved",
        errors: ["Saved workspace moved or deleted.", "The persisted path no longer exists: /tmp/moved-repo"]
      }
    });
    render(<WorkspaceOnboardingCard />);
    await waitFor(() => {
      expect(screen.getAllByText(/saved workspace moved or deleted/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: /choose new workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear saved workspace/i })).toBeInTheDocument();
  });
});
