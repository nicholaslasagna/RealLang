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
});
