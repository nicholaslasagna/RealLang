import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RuntimeIndicator } from "../../src/components/RuntimeIndicator";
import { SettingsScreen } from "../../src/features/settings/SettingsScreen";
import { useWorkbenchStore } from "../../src/state/workbench-store";

describe("RuntimeIndicator", () => {
  it("renders web preview metadata in settings context", async () => {
    useWorkbenchStore.setState({ settingsSection: "general" });
    render(<RuntimeIndicator />);
    await waitFor(() => {
      expect(screen.getByTestId("runtime-indicator")).toBeInTheDocument();
    });
    expect(screen.getByText(/Web preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Metadata only/i)).toBeInTheDocument();
  });

  it("settings general section includes runtime indicator", async () => {
    useWorkbenchStore.setState({ settingsSection: "general" });
    render(<SettingsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("runtime-indicator")).toBeInTheDocument();
    });
  });
});
