import { LocalModelTextPanel } from "./LocalModelTextPanel";

// Direction cap keeps the composed prompt well under the 2000-char sandbox limit.
const MAX_DIRECTION_CHARS = 600;

/**
 * Compose the bounded brief request sent to the local model. This is the only
 * Creative-specific part; execution still uses the shared approval-gated sandbox.
 */
function composeBriefPrompt(direction: string): string {
  return [
    "You are a creative director. Turn the direction below into a concise, structured creative brief.",
    "Use these labelled sections, each on its own line:",
    "CONCEPT: one or two sentences.",
    "MOOD & TONE: 3-5 descriptors.",
    "VISUAL PROMPT: one vivid prompt ready for image generation.",
    "VARIANTS: three short alternative angles.",
    "AVOID: negative guidance - what to exclude.",
    "PRODUCTION NOTES: two or three practical notes.",
    "",
    `Direction: ${direction}`
  ].join("\n");
}

/**
 * Real, approval-gated creative brief generation. One bounded direction -> the
 * user's local chat model (same sandbox as Chat) -> a streamed, structured brief
 * shown as LOCAL UNTRUSTED. Session-only: nothing is persisted or audited.
 */
export function CreativeBriefPanel() {
  return (
    <LocalModelTextPanel
      maxInputChars={MAX_DIRECTION_CHARS}
      composePrompt={composeBriefPrompt}
      submitIconName="sparkles"
      testIds={{
        notConfigured: "creative-brief-not-configured",
        empty: "creative-brief-empty",
        loading: "creative-brief-loading",
        streaming: "creative-brief-streaming",
        error: "creative-brief-error",
        result: "creative-brief-result"
      }}
      copy={{
        ariaLabel: "Creative brief generator",
        inputId: "creative-brief-direction",
        inputLabel: "Describe a creative direction",
        placeholder:
          "Describe a direction... e.g. a survival-horror forest entity: readable traversal, escalating dread, moonlit palette",
        approvalLabel: "I approve sending this direction to my local model.",
        submitLabel: "Generate brief",
        runningLabel: "Generating...",
        pendingTitle: "Your local model is drafting the brief...",
        pendingDetail: "One bounded request · it times out automatically · nothing is saved.",
        desktopRequiredTitle: "Desktop app required",
        desktopRequiredDetail: "Briefs run on your local model and are available in the desktop app only.",
        notConfiguredTitle: "Local model not configured",
        notConfiguredDetail:
          "Point RealForge at your local model in ~/.realforge.local.toml. The same connection powers Chat.",
        emptyIcon: "drama",
        emptyTitle: "Describe a direction to draft a brief",
        emptyDetail:
          "Your local model shapes it into concept, mood, a visual prompt, variants, and production notes. Approve each send.",
        copyLabel: "Copy brief",
        copyPrefix: "LOCAL UNTRUSTED",
        outputAriaLabel: "Untrusted local model brief",
        resultMeta: (durationMs) => `${durationMs} ms · review before use`,
        errorFallback: "Make sure your local model is running. Output is never trusted - review before use."
      }}
    />
  );
}
