import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Security-relevant invariant for every "real AI" studio panel: a prompt must
// never reach the local model unless the runtime is desktop, a provider is
// configured, the user explicitly approved this send, and the input is non-empty.
const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
  loadProviderStatus: vi.fn(),
  runPrivateProviderChatSandbox: vi.fn(),
  runPrivateProviderImageGen: vi.fn(),
  setChatStreamDeltaListener: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return { ...actual, ...mocks };
});

import { CreativeBriefPanel } from "../../src/features/studio/CreativeBriefPanel";
import { AssetsPlanPanel } from "../../src/features/studio/AssetsPlanPanel";
import { EngineUnrealPanel } from "../../src/features/studio/EngineUnrealPanel";
import { ImageGenerator } from "../../src/features/studio/ImageGenerator";
import { composeUnrealPrompt, UNREAL_TEMPLATES } from "../../src/features/studio/unreal-templates";

function providerStatus(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    configured: false,
    source: "home_private",
    provider_kind: null,
    trust: "local_untrusted",
    endpoint_configured: false,
    endpoint_host: null,
    model_configured: false,
    api_key_configured: false,
    image_provider_configured: false,
    image_provider_kind: null,
    image_endpoint_host: null,
    image_provider_execution_enabled: false,
    warnings: [],
    errors: [],
    ...over
  };
}

const passChat = {
  ok: true as const,
  data: {
    ok: true,
    attempted: true,
    configured: true,
    provider_kind: "openai_compatible_local",
    status: "pass" as const,
    input_length: 5,
    duration_ms: 10,
    response: "CONCEPT: a thing.",
    response_truncated: false,
    untrusted_output: true as const,
    error: null
  }
};

const passImage = {
  ok: true as const,
  data: {
    ok: true,
    attempted: true,
    configured: true,
    status: "pass" as const,
    input_length: 5,
    duration_ms: 10,
    image_base64: "iVBORw0KGgo=",
    mime: "image/png" as const,
    image_bytes: 10,
    untrusted_output: true as const,
    error: null
  }
};

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.loadProviderStatus.mockResolvedValue(providerStatus());
  mocks.runPrivateProviderChatSandbox.mockResolvedValue(passChat);
  mocks.runPrivateProviderImageGen.mockResolvedValue(passImage);
  mocks.setChatStreamDeltaListener.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("local-model studio panels — approval gating", () => {
  it("Creative does not call the model on web (desktop required)", async () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    render(<CreativeBriefPanel />);
    expect(screen.getByText(/desktop app required/i)).toBeTruthy();
    const button = screen.getByRole("button", { name: /generate brief/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });

  it("Creative stays gated until configured + approved + non-empty, then sends a bounded brief prompt", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ configured: true }));
    render(<CreativeBriefPanel />);

    const approve = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(approve.disabled).toBe(false));

    const button = screen.getByRole("button", { name: /generate brief/i }) as HTMLButtonElement;
    // Configured but empty + unapproved → still gated.
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a neon fox" } });
    expect(button.disabled).toBe(true); // not approved yet
    fireEvent.click(approve);
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    const arg = mocks.runPrivateProviderChatSandbox.mock.calls[0][0];
    expect(arg.approvalAcknowledged).toBe(true);
    expect(arg.prompt).toContain("a neon fox");
    expect(arg.prompt).toContain("CONCEPT");
    expect(arg.prompt.length).toBeLessThanOrEqual(2000);
  });

  it("Assets sends a bounded production-plan prompt once gated open", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ configured: true }));
    render(<AssetsPlanPanel />);

    const approve = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(approve.disabled).toBe(false));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a corridor kit" } });
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("button", { name: /draft plan/i }));

    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    const arg = mocks.runPrivateProviderChatSandbox.mock.calls[0][0];
    expect(arg.approvalAcknowledged).toBe(true);
    expect(arg.prompt).toContain("a corridor kit");
    expect(arg.prompt).toContain("DELIVERABLES");
    expect(arg.prompt.length).toBeLessThanOrEqual(2000);
  });

  it("Engine sends a bounded Unreal prompt with editor-python guidance once gated open", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ configured: true }));
    render(<EngineUnrealPanel />);

    const approve = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(approve.disabled).toBe(false));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "import FBX props to /Game/Props" } });
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("button", { name: /draft ue plan/i }));

    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    const arg = mocks.runPrivateProviderChatSandbox.mock.calls[0][0];
    expect(arg.approvalAcknowledged).toBe(true);
    expect(arg.prompt).toContain("import FBX props to /Game/Props");
    expect(arg.prompt).toContain("EDITOR PYTHON");
    expect(arg.prompt).toContain("import unreal");
    expect(arg.prompt.length).toBeLessThanOrEqual(2000);
  });

  it("Unreal cockpit renders all templates and switching them re-shapes the prompt", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ configured: true }));
    render(<EngineUnrealPanel />);

    for (const template of UNREAL_TEMPLATES) {
      expect(screen.getByTestId(`unreal-template-${template.id}`)).toBeTruthy();
    }

    // Switch to UMG; the reset panel must be re-approved (gate survives template switches).
    fireEvent.click(screen.getByTestId("unreal-template-umg"));
    const approve = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "an inventory screen" } });
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("button", { name: /draft ue plan/i }));

    await waitFor(() => expect(mocks.runPrivateProviderChatSandbox).toHaveBeenCalledTimes(1));
    const arg = mocks.runPrivateProviderChatSandbox.mock.calls[0][0];
    expect(arg.approvalAcknowledged).toBe(true);
    expect(arg.prompt).toContain("an inventory screen");
    expect(arg.prompt).toContain("UMG");
    expect(arg.prompt).toContain("widget tree");
    expect(arg.prompt).toContain("state flow");
  });

  it("every Unreal template composes a bounded, structured, safety-constrained prompt", () => {
    const longestBrief = "x".repeat(600);
    for (const template of UNREAL_TEMPLATES) {
      const prompt = composeUnrealPrompt(template.id, longestBrief);
      expect(prompt.length).toBeLessThanOrEqual(2000);
      expect(prompt).toContain("Unreal Engine 5.x");
      expect(prompt).toContain("no destructive operations");
      expect(prompt).toContain("# VERIFY:");
      expect(prompt).toContain("EDITOR PYTHON");
      expect(prompt).toContain("MANUAL EDITOR STEPS");
      expect(prompt).toContain("VALIDATION CHECKLIST");
      expect(prompt).toContain("untrusted until a human reviews");
      expect(prompt).toContain(longestBrief);
    }
    // Template-specific shaping.
    expect(composeUnrealPrompt("level", "a canyon")).toMatch(/placement plan[\s\S]*folders[\s\S]*lighting[\s\S]*navmesh/i);
    expect(composeUnrealPrompt("assets", "40 props")).toMatch(/naming conventions[\s\S]*batch import/i);
    expect(composeUnrealPrompt("gameplay", "a hook")).toMatch(/input actions[\s\S]*replication/i);
    expect(composeUnrealPrompt("blueprint", "a quest")).toMatch(/Blueprint classes[\s\S]*interfaces/i);
    expect(composeUnrealPrompt("cinematic", "an intro")).toMatch(/Sequencer[\s\S]*shot list/i);
    expect(composeUnrealPrompt("optimization", "slow scene")).toMatch(/profiling checklist[\s\S]*draw-call/i);
  });

  it("Image is gated on the image provider and approval before generating", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ image_provider_configured: true }));
    render(<ImageGenerator />);

    const approve = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(approve.disabled).toBe(false));

    const button = screen.getByRole("button", { name: /generate image/i }) as HTMLButtonElement;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a red circle" } });
    expect(button.disabled).toBe(true); // not approved yet
    fireEvent.click(approve);
    fireEvent.click(button);

    await waitFor(() => expect(mocks.runPrivateProviderImageGen).toHaveBeenCalledTimes(1));
    const arg = mocks.runPrivateProviderImageGen.mock.calls[0][0];
    expect(arg.approvalAcknowledged).toBe(true);
    expect(arg.prompt).toBe("a red circle");
    // Chat bridge must not be touched by the image panel.
    expect(mocks.runPrivateProviderChatSandbox).not.toHaveBeenCalled();
  });

  it("Image will not generate when only the chat provider is configured", async () => {
    mocks.loadProviderStatus.mockResolvedValue(providerStatus({ configured: true, image_provider_configured: false }));
    render(<ImageGenerator />);
    await waitFor(() => expect(mocks.loadProviderStatus).toHaveBeenCalled());

    const button = screen.getByRole("button", { name: /generate image/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a red circle" } });
    const approve = screen.getByRole("checkbox") as HTMLInputElement;
    expect(approve.disabled).toBe(true); // image provider not configured
    fireEvent.click(button);
    expect(mocks.runPrivateProviderImageGen).not.toHaveBeenCalled();
  });
});
