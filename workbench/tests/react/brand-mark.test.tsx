import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Topbar } from "../../src/components/layout/Topbar";
import { useWorkbenchStore } from "../../src/state/workbench-store";

afterEach(() => cleanup());

describe("RealForge brand mark", () => {
  it("renders the symbol mark without replacing accessible RealForge text", () => {
    useWorkbenchStore.setState({ staffPreview: false, sidebarOpen: false, selectedModelProfileId: "private-local" });
    render(<Topbar />);

    const mark = screen.getByTestId("brand-mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("REALFORGE")).toBeInTheDocument();
    expect(screen.getByText("AI ENGINEERING WORKBENCH")).toBeInTheDocument();
  });

  it("shows a simple model connection picker in the topbar", () => {
    useWorkbenchStore.setState({ staffPreview: false, sidebarOpen: false, selectedModelProfileId: "private-local" });
    render(<Topbar />);

    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getAllByText("Private Local Model").length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: /model connection/i })).toBeInTheDocument();
  });
});
