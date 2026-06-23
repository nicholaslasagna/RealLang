import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_TURNS,
  buildContextPreview,
  composeVisibleChatContext
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

describe("buildContextPreview", () => {
  it("is empty for no eligible turns", () => {
    const p = buildContextPreview([]);
    expect(p).toMatchObject({ eligibleTurns: 0, includedTurns: 0, approxChars: 0, truncated: false });
    expect(p.entries).toEqual([]);
  });

  it("reflects a single eligible turn", () => {
    const p = buildContextPreview([turn(1, "hi", "hello back")]);
    expect(p.eligibleTurns).toBe(1);
    expect(p.includedTurns).toBe(1);
    expect(p.entries).toEqual([{ prompt: "hi", responseText: "hello back" }]);
    expect(p.approxChars).toBeGreaterThan(0);
    expect(p.truncated).toBe(false);
  });

  it("caps included turns and flags truncation", () => {
    const turns = Array.from({ length: 6 }, (_, i) => turn(i + 1, `p${i + 1}`, `r${i + 1}`));
    const p = buildContextPreview(turns);
    expect(p.eligibleTurns).toBe(6);
    expect(p.includedTurns).toBe(MAX_CONTEXT_TURNS);
    expect(p.truncated).toBe(true);
    expect(p.entries.map((e) => e.prompt)).toEqual(["p3", "p4", "p5", "p6"]);
  });

  it("excludes running and error turns, matching the composer", () => {
    const turns = [turn(1, "a", "ra"), turn(2, "b", null, { running: true }), turn(3, "c", "rc", { ok: false }), turn(4, "d", "rd")];
    const p = buildContextPreview(turns);
    expect(p.entries.map((e) => e.prompt)).toEqual(["a", "d"]);
  });

  it("caps approxChars to the context char limit", () => {
    const turns = Array.from({ length: 4 }, (_, i) => turn(i + 1, "x".repeat(500), "y".repeat(500)));
    const p = buildContextPreview(turns);
    expect(p.approxChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(p.truncated).toBe(true);
  });

  it("reflects only visible text — no provider/config/secret fields", () => {
    const p = buildContextPreview([turn(1, "hi there", "hello back")]);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/provider_kind|openai_compatible_local|api[_ -]?key|base_url|endpoint|input_length|duration_ms|sk-/i);
  });

  it("preview entries match what the composer actually sends", () => {
    const turns = [turn(1, "first", "answer one"), turn(2, "second", "answer two")];
    const preview = buildContextPreview(turns);
    const composed = composeVisibleChatContext(turns, "current");
    for (const entry of preview.entries) {
      expect(composed).toContain(entry.prompt);
      expect(composed).toContain(entry.responseText);
    }
    expect(composed).toContain("current");
  });
});
