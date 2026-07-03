import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../src/App";
import { useWorkbenchStore } from "../../src/state/workbench-store";

afterEach(() => {
  cleanup();
});

function resetStore() {
  useWorkbenchStore.setState({
    screen: "home",
    workbenchMode: "default",
    settingsSection: "general",
    staffPreview: false,
    commandQuery: "",
    sidebarOpen: false,
    operationStatus: "Idle · ready",
    lastCommand: "none · prototype ready",
    stagedTask: "",
    composedActionId: "repair-diagnostic-dry-run",
    importRaw: "",
    importType: "auto",
    importPreview: null,
    paletteOpen: false,
    toast: null,
    desktopLoadStatus: "idle",
    desktopLoadSourceId: null,
    desktopLoadError: null,
    approvalAuditEntries: [],
    approvalAuditHydrated: false,
    approvalAuditStorageStatus: "idle",
    approvalAuditStorageWarning: null
  });
}

describe("Workbench React app", () => {
  it("renders the app shell and home screen", () => {
    resetStore();
    render(<App />);
    expect(document.getElementById("app")).toBeTruthy();
    expect(screen.getByText(/RealForge is ready/i)).toBeInTheDocument();
    expect(screen.getAllByText("READONLY").length).toBeGreaterThan(0);
    expect(screen.getAllByText("STAFF OFF").length).toBeGreaterThan(0);
  });

  it("renders reports import with untrusted banner", () => {
    resetStore();
    useWorkbenchStore.setState({ screen: "reports" });
    render(<App />);
    expect(screen.getByText(/Imported JSON is untrusted/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Report JSON/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity log/i).closest("details")).not.toHaveAttribute("open");
  });

  it("keeps capability safety details collapsed by default", () => {
    resetStore();
    useWorkbenchStore.setState({ screen: "capabilities" });
    render(<App />);
    const details = screen.getAllByText(/Safety details/i).map((node) => node.closest("details"));
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((node) => !node?.hasAttribute("open"))).toBe(true);
  });

  it("shows parse error for invalid JSON without throwing", () => {
    resetStore();
    useWorkbenchStore.setState({
      screen: "reports",
      importRaw: "{not json",
      importPreview: {
        parseError: true,
        error: "Unexpected token"
      }
    });
    render(<App />);
    expect(screen.getAllByText(/Could not parse JSON/i).length).toBeGreaterThan(0);
  });

  it("keeps staff preview off by default on updates screen", () => {
    resetStore();
    useWorkbenchStore.setState({ screen: "updates", staffPreview: false });
    render(<App />);
    expect(screen.getAllByText(/Locked by policy/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/STAFF OFF · POLICY ENFORCED/i)).toBeInTheDocument();
  });

  it("exposes read-only CLI catalog without execution hooks in source", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const reports = await readFile(join(root, "src/features/reports/CliBridgePanel.tsx"), "utf8");
    const store = await readFile(join(root, "src/state/workbench-store.ts"), "utf8");
    expect(reports).toMatch(/cli-bridge-panel/);
    expect(reports).toMatch(/NO SHELL/);
    expect(store).toMatch(/copyCliCommand/);
    expect(store).toMatch(/loadDesktopReport/);
    expect(store).not.toMatch(/loadSource\s*\(/);
  });
});
