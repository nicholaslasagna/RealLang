import { LocalModelTextPanel } from "./LocalModelTextPanel";

// Input cap keeps the composed prompt well under the 2000-char sandbox limit.
const MAX_INPUT_CHARS = 600;

/**
 * Compose the bounded production-plan request sent to the local model. The
 * shared panel handles the approval gate, streaming, errors, and untrusted label.
 */
function composePlanPrompt(input: string): string {
  return [
    "You are a technical art and production lead. Turn the brief or direction below into a reviewable production plan.",
    "Use these labelled sections, each on its own line:",
    "DELIVERABLES: the concrete assets or outputs.",
    "PIPELINE: ordered production stages.",
    "TASKS: a short numbered breakdown with rough effort.",
    "DEPENDENCIES: what blocks what.",
    "CONSTRAINTS: engine, tech, and performance limits to respect.",
    "REVIEW GATES: checkpoints before anything ships.",
    "RISKS: two or three risks with mitigations.",
    "",
    `Brief: ${input}`
  ].join("\n");
}

/**
 * Real, approval-gated production-plan generation. One bounded brief -> the
 * user's local chat model (same sandbox as Chat) -> a streamed, structured plan
 * shown as LOCAL UNTRUSTED. Planning only: no tools launch and no files change.
 */
export function AssetsPlanPanel() {
  return (
    <LocalModelTextPanel
      maxInputChars={MAX_INPUT_CHARS}
      composePrompt={composePlanPrompt}
      submitIconName="workflow"
      testIds={{
        notConfigured: "assets-plan-not-configured",
        empty: "assets-plan-empty",
        loading: "assets-plan-loading",
        streaming: "assets-plan-streaming",
        error: "assets-plan-error",
        result: "assets-plan-result"
      }}
      copy={{
        ariaLabel: "Production plan generator",
        inputId: "assets-plan-input",
        inputLabel: "Describe a brief or asset to plan",
        placeholder:
          "Describe a brief or asset... e.g. a modular sci-fi corridor kit for Unreal: trims, decals, collision, LODs, 4k texel density",
        approvalLabel: "I approve sending this brief to my local model.",
        submitLabel: "Draft plan",
        runningLabel: "Planning...",
        pendingTitle: "Your local model is drafting the plan...",
        pendingDetail: "One bounded request · it times out automatically · nothing is saved.",
        desktopRequiredTitle: "Desktop app required",
        desktopRequiredDetail: "Plans run on your local model and are available in the desktop app only.",
        notConfiguredTitle: "Local model not configured",
        notConfiguredDetail:
          "Point RealForge at your local model in ~/.realforge.local.toml. The same connection powers Chat.",
        emptyIcon: "package",
        emptyTitle: "Describe a brief to draft a production plan",
        emptyDetail:
          "Your local model shapes it into deliverables, pipeline, tasks, dependencies, constraints, review gates, and risks. Approve each send.",
        copyLabel: "Copy plan",
        copyPrefix: "LOCAL UNTRUSTED",
        outputAriaLabel: "Untrusted local model production plan",
        resultMeta: (durationMs) => `${durationMs} ms · plan only · nothing runs`,
        errorFallback: "Make sure your local model is running. Output is never trusted - review before use."
      }}
    />
  );
}
