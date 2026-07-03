import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Streaming chat bridge: desktop path opens a Tauri channel, forwards live
// tokens to the active delta listener, and aggregates the terminal event into the
// same sanitized result shape as the single-shot command.

const hoisted = vi.hoisted(() => ({
  desktop: true,
  events: [] as unknown[]
}));

vi.mock("../../src/bridge/detect-runtime", () => ({
  isDesktopRuntime: () => hoisted.desktop,
  isWebPreviewRuntime: () => !hoisted.desktop
}));

class FakeChannel {
  onmessage: ((event: unknown) => void) | null = null;
}

const invoke = vi.fn(async (command: string, args: { onEvent?: FakeChannel }) => {
  if (command === "run_private_provider_chat_sandbox_stream") {
    const channel = args.onEvent;
    for (const event of hoisted.events) channel?.onmessage?.(event);
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: FakeChannel }));

import { runPrivateProviderChatSandbox, setChatStreamDeltaListener } from "../../src/bridge/workbench-bridge";

function finalEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "final",
    ok: true,
    attempted: true,
    configured: true,
    provider_kind: "openai_compatible_local",
    status: "pass",
    input_length: 5,
    duration_ms: 12,
    response_truncated: false,
    untrusted_output: true,
    ...overrides
  };
}

beforeEach(() => {
  hoisted.desktop = true;
  hoisted.events = [];
  invoke.mockClear();
  setChatStreamDeltaListener(null);
});

afterEach(() => setChatStreamDeltaListener(null));

describe("streaming private chat sandbox bridge", () => {
  it("forwards live tokens and aggregates the final response", async () => {
    hoisted.events = [
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      finalEvent()
    ];
    const tokens: string[] = [];
    setChatStreamDeltaListener((text) => tokens.push(text));

    const result = await runPrivateProviderChatSandbox({ prompt: "hi", approvalAcknowledged: true });

    expect(tokens).toEqual(["Hel", "lo"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.response).toBe("Hello");
      expect(result.data.status).toBe("pass");
      expect(result.data.untrusted_output).toBe(true);
    }
    // Only prompt + acknowledgement and the channel cross the boundary.
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0] as [string, { input: unknown; onEvent: unknown }];
    expect(command).toBe("run_private_provider_chat_sandbox_stream");
    expect(Object.keys(args).sort()).toEqual(["input", "onEvent"]);
    expect(args.input).toEqual({ prompt: "hi", approvalAcknowledged: true });
  });

  it("maps a terminal error event to a structured result", async () => {
    hoisted.events = [
      {
        type: "error",
        ok: false,
        attempted: false,
        configured: false,
        provider_kind: null,
        status: "not_configured",
        input_length: 0,
        duration_ms: 0,
        untrusted_output: true,
        error: { code: "not_configured", message: "Private local provider is not configured." }
      }
    ];
    const result = await runPrivateProviderChatSandbox({ prompt: "hi", approvalAcknowledged: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("not_configured");
      expect(result.data.error?.code).toBe("not_configured");
      expect(result.data.response).toBeNull();
    }
  });

  it("ignores tokens emitted after the terminal event", async () => {
    hoisted.events = [finalEvent({ input_length: 1, duration_ms: 1 }), { type: "delta", text: "late" }];
    const tokens: string[] = [];
    setChatStreamDeltaListener((text) => tokens.push(text));
    const result = await runPrivateProviderChatSandbox({ prompt: "hi", approvalAcknowledged: true });
    expect(tokens).toEqual([]);
    if (result.ok) expect(result.data.response).toBeNull();
  });

  it("refuses in web runtime without opening a channel", async () => {
    hoisted.desktop = false;
    const result = await runPrivateProviderChatSandbox({ prompt: "hi", approvalAcknowledged: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_web");
    expect(invoke).not.toHaveBeenCalled();
  });
});
