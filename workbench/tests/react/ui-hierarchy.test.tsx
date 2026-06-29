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
  it("splits navigation into Create (creative-first) and a folded Advanced group", () => {
    const nav = getWorkbenchData().navigation;
    const byId = Object.fromEntries(nav.map((item) => [item.id, item.group]));
    expect(byId.home).toBe("Create");
    expect(byId.workbench).toBe("Create");
    expect(byId.image).toBe("Create");
    expect(byId.code).toBe("Advanced");
    expect(byId.capabilities).toBe("Advanced");
    expect(byId.security).toBe("Advanced");
    expect(byId.reports).toBe("Advanced");
    expect(byId.settings).toBe("Advanced");
    expect(byId.updates).toBe("Advanced");
    expect([...new Set(nav.map((i) => i.group))]).toEqual(["Create", "Advanced"]);
    expect(nav.length).toBe(15);
  });

  it("renders every nav item and the two intent groups in the sidebar", () => {
    resetHome();
    render(<App />);
    const sidebar = document.getElementById("sidebar")!;
    for (const label of [
      "Home", "Chat", "Capabilities", "Code", "Research", "Creative", "Image",
      "Vision", "Engine", "Assets", "Benchmarks", "Security", "Reports", "Updates", "Settings"
    ]) {
      expect(within(sidebar).getByText(label)).toBeInTheDocument();
    }
    for (const group of ["Create", "Advanced"]) {
      expect(within(sidebar).getByText(group)).toBeInTheDocument();
    }
    expect(within(sidebar).queryByText("Core")).toBeNull();
  });

  it("highlights Chat as the primary destination", () => {
    resetHome();
    render(<App />);
    const sidebar = document.getElementById("sidebar")!;
    expect(within(sidebar).getByRole("button", { name: "Chat" }).className).toMatch(/nav-item--primary/);
  });

  it("keeps Settings discoverable for provider configuration", () => {
    resetHome();
    render(<App />);
    const sidebar = document.getElementById("sidebar")!;
    expect(within(sidebar).getByRole("button", { name: "Settings" })).toBeInTheDocument();
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
      expect(within(topbar).getByText(label, { hidden: true })).toBeInTheDocument();
    }
    expect(within(topbar).queryByText("STAFF PREVIEW")).toBeNull();
  });
});
