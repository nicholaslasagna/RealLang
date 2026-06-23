import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Topbar } from "../../src/components/layout/Topbar";
import { useWorkbenchStore } from "../../src/state/workbench-store";

afterEach(() => cleanup());

describe("RealForge brand mark", () => {
  it("renders the symbol mark without replacing accessible RealForge text", () => {
    useWorkbenchStore.setState({ staffPreview: false, sidebarOpen: false });
    render(<Topbar />);

    const mark = screen.getByTestId("brand-mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("REALFORGE")).toBeInTheDocument();
    expect(screen.getByText("AI ENGINEERING WORKBENCH")).toBeInTheDocument();
  });

  it("labels mock as the preview runtime, not local chat", () => {
    useWorkbenchStore.setState({ staffPreview: false, sidebarOpen: false });
    render(<Topbar />);

    expect(screen.getByText("Preview runtime")).toBeInTheDocument();
    expect(screen.getByText(/chat uses local provider/i)).toBeInTheDocument();
    expect(screen.queryByText("deterministic")).not.toBeInTheDocument();
  });
});
