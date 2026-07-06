import { useState } from "react";
import { Icon } from "../../components/primitives";
import { LocalModelTextPanel } from "./LocalModelTextPanel";
import {
  composeUnrealPrompt,
  getUnrealTemplate,
  UNREAL_TEMPLATES,
  type UnrealTemplateId
} from "./unreal-templates";

// Input cap keeps the composed prompt (template skeleton + brief) well under
// the 2000-char sandbox limit; see SHARED_RULES in unreal-templates.ts.
const MAX_INPUT_CHARS = 600;

/**
 * Unreal Production Cockpit. Pick a task template (gameplay, UMG, level
 * blockout, asset import, Blueprint architecture, cinematic, optimization, or
 * custom), describe the task, and the user-configured local model streams back
 * a reviewable Unreal work package: plan, Editor Python, manual editor steps,
 * validation checklist, and risks. RealForge never launches the editor and
 * never writes files — the user reviews and pastes scripts into UE's Python
 * console. Output stays LOCAL UNTRUSTED. Pairs with integrations/unreal/.
 */
export function EngineUnrealPanel() {
  const [templateId, setTemplateId] = useState<UnrealTemplateId>("assets");
  const template = getUnrealTemplate(templateId);

  return (
    <div className="unreal-cockpit">
      <div className="unreal-cockpit__templates" role="group" aria-label="Unreal task templates">
        {UNREAL_TEMPLATES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={`unreal-cockpit__template ${candidate.id === templateId ? "is-active" : ""}`.trim()}
            aria-pressed={candidate.id === templateId}
            data-testid={`unreal-template-${candidate.id}`}
            onClick={() => setTemplateId(candidate.id)}
          >
            <Icon name={candidate.icon} />
            <span>
              <b>{candidate.label}</b>
              <small>{candidate.blurb}</small>
            </span>
          </button>
        ))}
      </div>

      <LocalModelTextPanel
        key={templateId /* reset per-template input/result so stale output never mislabels */}
        maxInputChars={MAX_INPUT_CHARS}
        composePrompt={(input) => composeUnrealPrompt(templateId, input)}
        submitIconName="box"
        testIds={{
          notConfigured: "engine-unreal-not-configured",
          empty: "engine-unreal-empty",
          loading: "engine-unreal-loading",
          streaming: "engine-unreal-streaming",
          error: "engine-unreal-error",
          result: "engine-unreal-result"
        }}
        copy={{
          ariaLabel: "Unreal Engine assistant",
          inputId: "engine-unreal-input",
          inputLabel: `Describe the ${template.label} task`,
          placeholder: template.placeholder,
          approvalLabel: "I approve sending this task to my local model.",
          submitLabel: "Draft UE plan",
          runningLabel: "Drafting...",
          pendingTitle: "Your local model is drafting the Unreal work package...",
          pendingDetail: "One bounded request · it times out automatically · nothing is saved.",
          desktopRequiredTitle: "Desktop app required",
          desktopRequiredDetail: "Unreal planning runs on your local model and is available in the desktop app only.",
          notConfiguredTitle: "Local model not configured",
          notConfiguredDetail:
            "Point RealForge at your local model in ~/.realforge.local.toml. The same connection powers Chat.",
          emptyIcon: template.icon,
          emptyTitle: `Describe a ${template.label.toLowerCase()} task`,
          emptyDetail:
            "Your local model returns a structured work package: summary, architecture, Editor Python, manual editor steps, validation checklist, and risks. Review before running anything — RealForge launches nothing.",
          copyLabel: "Copy work package",
          copyPrefix: "LOCAL UNTRUSTED — review before running in the Unreal Editor",
          outputAriaLabel: "Untrusted local model Unreal work package",
          resultMeta: (durationMs) => `${durationMs} ms · ${template.label} · review before running`,
          errorFallback:
            "Make sure your local model is running. Output is never trusted - review before running in the editor."
        }}
      />
    </div>
  );
}
