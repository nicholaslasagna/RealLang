import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../src/App";
import { getWorkbenchData } from "../../src/data/workbench-data";
import { useWorkbenchStore } from "../../src/state/workbench-store";

afterEach(() => {
  cleanup();
});

function resetHome() {
  useWorkbenchStore.setState({
    screen: "home",
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

describe("0.15 navigation hierarchy", () => {
  it("groups Security under Evaluate and Reports under System (no Advanced group)", () => {
    const nav = getWorkbenchData().navigation;
    const byId = Object.fromEntries(nav.map((item) => [item.id, item.group]));
    expect(byId.security).toBe("Evaluate");
    expect(byId.benchmarks).toBe("Evaluate");
    expect(byId.reports).toBe("System");
    expect(byId.updates).toBe("System");
    expect(byId.settings).toBe("System");
    expect(nav.some((item) => item.group === "Advanced")).toBe(false);
    expect(nav.length).toBe(15);
  });

  it("renders every nav item and the five groups in the sidebar", () => {
    resetHome();
    render(<App />);
    const sidebar = document.getElementById("sidebar")!;
    for (const label of [
      "Home", "Workbench", "Capabilities", "Code", "Research", "Creative", "Image",
      "Vision", "Engine", "Assets", "Benchmarks", "Security", "Reports", "Updates", "Settings"
    ]) {
      expect(within(sidebar).getByText(label)).toBeInTheDocument();
    }
    for (const group of ["Core", "Engineering", "Studio", "Evaluate", "System"]) {
      expect(within(sidebar).getByText(group)).toBeInTheDocument();
    }
    expect(within(sidebar).queryByText("Advanced")).toBeNull();
  });

  it("shows an accurate, non-stale version label", () => {
    resetHome();
    render(<App />);
    const sidebar = document.getElementById("sidebar")!;
    expect(within(sidebar).getByText("Workbench 0.16.0")).toBeInTheDocument();
    expect(within(sidebar).getByText(/RealForge backend 2\.7/)).toBeInTheDocument();
    expect(within(sidebar).queryByText(/VERSION 2\.7/i)).toBeNull();
    expect(within(sidebar).queryByText(/Workbench 0\.1[0-5]\b/)).toBeNull();
  });

  it("keeps the safety status cluster with a clear primary and all labels", () => {
    resetHome();
    render(<App />);
    const topbar = document.getElementById("topbar")!;
    expect(within(topbar).getByText("SAFE")).toBeInTheDocument();
    for (const label of ["READONLY", "LOCAL ONLY", "NETWORK OFF", "DOCTOR PASS", "STAFF OFF"]) {
      expect(within(topbar).getByText(label)).toBeInTheDocument();
    }
    expect(within(topbar).queryByText("STAFF PREVIEW")).toBeNull();
  });
});
