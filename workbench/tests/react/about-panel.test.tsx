import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutPanel } from "../../src/components/AboutPanel";
import { SettingsScreen } from "../../src/features/settings/SettingsScreen";
import { useWorkbenchStore } from "../../src/state/workbench-store";

afterEach(() => {
  cleanup();
});

async function loadedAboutPanel() {
  // Wait for the loaded article (its h2), then grab the now-current testid node.
  await screen.findByText("RealForge Workbench");
  return screen.getByTestId("about-panel");
}

describe("About panel (0.16)", () => {
  it("shows aligned Workbench and separate backend versions", async () => {
    render(<AboutPanel />);
    const panel = await loadedAboutPanel();
    expect(within(panel).getByText(/Workbench 0\.16\.0 · RealForge backend 2\.7/)).toBeInTheDocument();
    expect(within(panel).getAllByText("0.16.0").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("2.7").length).toBeGreaterThan(0);
    expect(within(panel).queryByText(/0\.12\.0/)).toBeNull();
  });

  it("renders runtime mode, bridge mode, update status, workspace, and security posture", async () => {
    render(<AboutPanel />);
    const panel = await loadedAboutPanel();
    fireEvent.click(within(panel).getByText(/system diagnostics/i));
    expect(within(panel).getByText("Runtime mode")).toBeInTheDocument();
    expect(within(panel).getAllByText("Web preview").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Bridge mode")).toBeInTheDocument();
    expect(within(panel).getByText("Update status")).toBeInTheDocument();
    expect(within(panel).getByText("Workspace")).toBeInTheDocument();
    expect(within(panel).getByText("Security posture")).toBeInTheDocument();
    expect(within(panel).getByText(/resolved · 1 blocked/i)).toBeInTheDocument();
  });

  it("offers an inert Copy diagnostics control with no secrets/env/keys", async () => {
    render(<AboutPanel />);
    const panel = await loadedAboutPanel();
    expect(within(panel).getByRole("button", { name: /copy diagnostics/i })).toBeInTheDocument();
    expect(within(panel).getByText(/no environment variables, secrets, keys, paths, or command output/i)).toBeInTheDocument();
  });

  it("is mounted in Settings → General alongside the runtime indicator", async () => {
    useWorkbenchStore.setState({ settingsSection: "general" });
    render(<SettingsScreen />);
    await screen.findByText("RealForge Workbench");
    expect(screen.getByTestId("about-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("runtime-indicator")).toBeInTheDocument());
  });
});
