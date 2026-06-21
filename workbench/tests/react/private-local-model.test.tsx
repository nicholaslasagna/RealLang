import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PrivateLocalModelPanel } from "../../src/components/PrivateLocalModelPanel";
import { PRIVATE_LOCAL_MODEL_PROFILE } from "../../src/providers";
import { useWorkbenchStore } from "../../src/state/workbench-store";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true)
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    isDesktopRuntime: mocks.isDesktopRuntime
  };
});

describe("Private local model panel", () => {
  beforeEach(() => {
    cleanup();
    mocks.isDesktopRuntime.mockReturnValue(true);
    useWorkbenchStore.getState().clearPrivateLocalModelSession();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders private local profile with local untrusted label", async () => {
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("private-local-model-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(PRIVATE_LOCAL_MODEL_PROFILE.displayName.toUpperCase())).toBeInTheDocument();
    expect(screen.getAllByText(/local untrusted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not in repo/i)).toBeInTheDocument();
    expect(screen.getByText(/model identity is stored in gitignored local config/i)).toBeInTheDocument();
  });

  it("does not hardcode private model names", () => {
    const source = [
      PRIVATE_LOCAL_MODEL_PROFILE.displayName,
      PRIVATE_LOCAL_MODEL_PROFILE.modelNamePlaceholder,
      PRIVATE_LOCAL_MODEL_PROFILE.id
    ].join(" ");
    const forbidden = ["qw" + "en", "ae" + "on", "dr" + "oyd"];
    for (const term of forbidden) {
      expect(source.toLowerCase()).not.toContain(term);
    }
  });

  it("shows web unavailable state without endpoint inputs", async () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    render(<PrivateLocalModelPanel />);
    await waitFor(() => {
      expect(screen.getByText(/unavailable in web preview/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/local openai-compatible endpoint/i)).not.toBeInTheDocument();
  });

  it("updates session endpoint and model label without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called");
    });
    render(<PrivateLocalModelPanel />);
    const endpointInputs = screen.getAllByLabelText(/local openai-compatible endpoint/i);
    fireEvent.change(endpointInputs[endpointInputs.length - 1], {
      target: { value: "http://127.0.0.1:9000/v1" }
    });
    const modelInputs = screen.getAllByLabelText(/local model name/i);
    fireEvent.change(modelInputs[modelInputs.length - 1], {
      target: { value: "my-private-model" }
    });
    fireEvent.click(screen.getByRole("button", { name: /mark configured locally/i }));
    expect(useWorkbenchStore.getState().privateLocalModel.configured).toBe(true);
    expect(useWorkbenchStore.getState().privateLocalModel.endpoint).toBe("http://127.0.0.1:9000/v1");
    expect(screen.getAllByText("my-private-model").length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
