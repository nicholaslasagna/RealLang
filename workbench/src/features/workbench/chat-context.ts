import type { ChatTurn } from "./WorkbenchChatThread";

// Bounds for opt-in visible chat context (0.40). Conservative by design.
export const MAX_CONTEXT_TURNS = 4;
export const MAX_CONTEXT_CHARS = 1_500;
const PER_FIELD_CHARS = 500;
// Mirrors the Rust sandbox prompt cap. The composed prompt can never exceed it.
const BACKEND_MAX_PROMPT_CHARS = 2_000;

const CONTEXT_PREAMBLE =
  "Recent visible chat context (user-included, bounded — no files, tools, or memory):";

interface CompletedContextTurn {
  prompt: string;
  responseText: string;
}

function clip(value: string, limit: number): string {
  const chars = Array.from(value);
  return chars.length > limit ? chars.slice(0, limit).join("") : value;
}

/**
 * Visible turns eligible for inclusion: completed, successful, non-empty responses only
 * (oldest → newest). Running/error/empty turns are skipped. Only the user prompt and the
 * model's visible response text are read — never provider status, config, or secrets.
 */
export function visibleContextTurns(turns: readonly ChatTurn[]): CompletedContextTurn[] {
  const usable: CompletedContextTurn[] = [];
  for (const turn of turns) {
    if (turn.running || !turn.result || !turn.result.ok) continue;
    const data = turn.result.data;
    if (data.status !== "pass" || !data.response) continue;
    usable.push({ prompt: turn.prompt, responseText: data.response });
  }
  return usable;
}

/** Number of visible turns currently eligible for inclusion. */
export function availableContextTurnCount(turns: readonly ChatTurn[]): number {
  return visibleContextTurns(turns).length;
}

export interface ComposeOptions {
  maxTurns?: number;
  maxContextChars?: number;
}

export interface ContextPreviewEntry {
  prompt: string;
  responseText: string;
}

export interface ContextPreview {
  /** Total eligible visible turns (completed, successful, non-empty). */
  eligibleTurns: number;
  /** How many will actually be included (capped by the turn cap). */
  includedTurns: number;
  /** Approximate character count of the composed context block (excludes the current prompt). */
  approxChars: number;
  /** True if older turns were dropped or per-field/char caps trimmed content. */
  truncated: boolean;
  /** The clipped turns that will be included (oldest → newest) — visible text only. */
  entries: ContextPreviewEntry[];
}

/** Select + per-field-clip the most-recent eligible turns. Shared by preview and compose. */
function selectContextEntries(
  turns: readonly ChatTurn[],
  maxTurns: number
): { entries: ContextPreviewEntry[]; eligible: number; trimmed: boolean } {
  const all = visibleContextTurns(turns);
  const usable = all.slice(-maxTurns);
  let trimmed = all.length > usable.length;
  const entries = usable.map((turn) => {
    const prompt = clip(turn.prompt, PER_FIELD_CHARS);
    const responseText = clip(turn.responseText, PER_FIELD_CHARS);
    if (prompt !== turn.prompt || responseText !== turn.responseText) trimmed = true;
    return { prompt, responseText };
  });
  return { entries, eligible: all.length, trimmed };
}

function entriesToBlock(entries: readonly ContextPreviewEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`User: ${entry.prompt}`);
    lines.push(`Local model: ${entry.responseText}`);
  }
  return lines.join("\n");
}

/**
 * Build a transparency preview that reflects exactly what composeVisibleChatContext would
 * include: the same turn cap, the same per-field clipping, and the same context char cap.
 * Only visible turn text is reflected — never provider/config/secret data.
 */
export function buildContextPreview(turns: readonly ChatTurn[], options: ComposeOptions = {}): ContextPreview {
  const maxTurns = options.maxTurns ?? MAX_CONTEXT_TURNS;
  const maxContextChars = options.maxContextChars ?? MAX_CONTEXT_CHARS;
  const { entries, eligible, trimmed } = selectContextEntries(turns, maxTurns);
  let truncated = trimmed;
  let approxChars = Array.from(entriesToBlock(entries)).length;
  if (approxChars > maxContextChars) {
    approxChars = maxContextChars;
    truncated = true;
  }
  return { eligibleTurns: eligible, includedTurns: entries.length, approxChars, truncated, entries };
}

/**
 * Compose a single bounded prompt from the most-recent visible turns + the current prompt.
 * Only visible turn text is included — no workspace/file/provider/config/secret data. The
 * current prompt is always preserved, and the whole result never exceeds the backend cap.
 */
export function composeVisibleChatContext(
  turns: readonly ChatTurn[],
  currentPrompt: string,
  options: ComposeOptions = {}
): string {
  const maxTurns = options.maxTurns ?? MAX_CONTEXT_TURNS;
  const maxContextChars = options.maxContextChars ?? MAX_CONTEXT_CHARS;
  const { entries } = selectContextEntries(turns, maxTurns);
  if (entries.length === 0) return currentPrompt;

  const suffix = `\n\nCurrent request:\n${currentPrompt}`;
  // Always reserve room for the preamble + the current prompt within the backend cap.
  const budget = BACKEND_MAX_PROMPT_CHARS - CONTEXT_PREAMBLE.length - suffix.length - 1;
  const contextCap = Math.min(maxContextChars, budget);
  if (contextCap <= 0) return currentPrompt;

  let block = entriesToBlock(entries);
  if (Array.from(block).length > contextCap) {
    block = Array.from(block).slice(0, contextCap).join("");
  }

  const composed = `${CONTEXT_PREAMBLE}\n${block}${suffix}`;
  const composedChars = Array.from(composed);
  return composedChars.length > BACKEND_MAX_PROMPT_CHARS
    ? composedChars.slice(0, BACKEND_MAX_PROMPT_CHARS).join("")
    : composed;
}
