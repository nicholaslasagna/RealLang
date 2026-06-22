import { Icon } from "../../components/primitives";

/**
 * Calm "what happens next" orientation for the Workbench.
 * Shown in the empty state so the always-present preview reads as a starting
 * point in a sequence rather than an abrupt dump. Presentation only.
 */
const FLOW_STEPS: ReadonlyArray<{ icon: string; label: string; detail: string }> = [
  { icon: "command", label: "Describe", detail: "Say what you want in plain language." },
  { icon: "eye", label: "Preview", detail: "See the exact plan and command — nothing runs yet." },
  { icon: "shield-check", label: "Approve", detail: "Confirm one bounded, local dry-run." },
  { icon: "circle-check", label: "Result", detail: "Inert, untrusted output appears here." }
];

export function WorkbenchFlowHint() {
  return (
    <section className="flow-hint" data-testid="workbench-flow-hint" aria-label="How this works">
      <p className="flow-hint__label">How this works</p>
      <ol className="flow-hint__steps">
        {FLOW_STEPS.map((step) => (
          <li key={step.label}>
            <span className="flow-hint__icon"><Icon name={step.icon} /></span>
            <div>
              <b>{step.label}</b>
              <small>{step.detail}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
