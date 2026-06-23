import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_TURNS,
  availableContextTurnCount,
  composeVisibleChatContext,
  visibleContextTurns
} from "../../src/features/workbench/chat-context";
import type { ChatTurn } from "../../src/features/workbench/WorkbenchChatThread";

function turn(id: number, prompt: string, response: string | null, opts: Partial<{ running: boolean; status: string; ok: boolean }> = {}): ChatTurn {
  if (opts.ok === false) {
    return { id, prompt, running: false, result: { ok: false, error: { code: "timeout", message: "timed out" } } };
  }
  if (opts.running) {
    return { id, prompt, running: true, result: null };
  }
  return {
    id,
    prompt,
    running: false,
    result: {
      ok: true,
      data: {
        ok: true,
        attempted: true,
        configured: true,
        provider_kind: "openai_compatible_local",
        status: (opts.status as "pass") ?? "pass",
        input_length: prompt.length,
        duration_ms: 10,
        response,
        response_truncated: false,
        untrusted_output: true,
        error: null
      }
    }
  };
}

describe("composeVisibleChatContext", () => {
  it("returns just the current prompt when there are no usable turns", () => {
    expect(composeVisibleChatContext([], "hello")).toBe("hello");
    expect(composeVisibleChatContext([turn(1, "q", null, { running: true })], "hello")).toBe("hello");
    expect(composeVisibleChatContext([turn(1, "q", "a", { status: "not_configured" })], "hello")).toBe("hello");
    expect(composeVisibleChatContext([turn(1, "q", "a", { ok: false })], "hello")).toBe("hello");
  });

  it("includes prior user + model text and always preserves the current prompt", () => {
    const turns = [turn(1, "what is a dry run", "it checks without writing")];
    const composed = composeVisibleChatContext(turns, "and is it safe");
    expect(composed).toContain("what is a dry run");
    expect(composed).toContain("it checks without writing");
    expect(composed).toContain("and is it safe");
    expect(composed).toMatch(/Current request:\s*\nand is it safe$/);
  });

  it("caps the number of included turns to the most recent MAX_CONTEXT_TURNS", () => {
    const turns = Array.from({ length: 6 }, (_, i) => turn(i + 1, `prompt-${i + 1}`, `answer-${i + 1}`));
    const composed = composeVisibleChatContext(turns, "now");
    // 6 turns exist; only the last 4 (3..6) are included.
    expect(composed).not.toContain("prompt-1");
    expect(composed).not.toContain("prompt-2");
    expect(composed).toContain("prompt-3");
    expect(composed).toContain("prompt-6");
    expect(composed).toContain("answer-6");
  });

  it("hard-caps the composed prompt to the backend 2000-char limit", () => {
    const turns = [turn(1, "x".repeat(2000), "y".repeat(5000))];
    const composed = composeVisibleChatContext(turns, "z".repeat(2000));
    expect(Array.from(composed).length).toBeLessThanOrEqual(2000);
  });

  it("includes only visible turn text — no provider/status/config/secret data", () => {
    const turns = [turn(1, "hi there", "hello back")];
    const composed = composeVisibleChatContext(turns, "again");
    expect(composed).not.toMatch(/provider_kind|openai_compatible_local|api[_ -]?key|base_url|endpoint|input_length|duration_ms|untrusted_output|sk-/i);
  });

  it("counts only completed, successful, non-empty turns", () => {
    const turns = [
      turn(1, "a", "ra"),
      turn(2, "b", null, { running: true }),
      turn(3, "c", "rc"),
      turn(4, "d", "rd", { ok: false }),
      turn(5, "e", "", )
    ];
    expect(availableContextTurnCount(turns)).toBe(2);
    expect(visibleContextTurns(turns).map((t) => t.prompt)).toEqual(["a", "c"]);
  });

  it("exposes a conservative turn cap", () => {
    expect(MAX_CONTEXT_TURNS).toBeLessThanOrEqual(4);
  });
});
