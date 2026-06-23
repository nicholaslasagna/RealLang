import { Icon } from "../../components/primitives";

const FLOW_STEPS: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: "command", label: "Describe your task" },
  { icon: "eye", label: "Preview the plan" },
  { icon: "shield-check", label: "Approve a safe dry-run" },
  { icon: "circle-check", label: "Review untrusted output" }
];

/**
 * Calm orientation for the empty Workbench — a short inline path, not a dashboard grid.
 */
export function WorkbenchFlowHint() {
  return (
    <section className="flow-hint flow-hint--calm" data-testid="workbench-flow-hint" aria-label="How this works">
      <p className="flow-hint__label">How this works</p>
      <ol className="flow-hint__steps flow-hint__steps--inline">
        {FLOW_STEPS.map((step) => (
          <li key={step.label}>
            <Icon name={step.icon} />
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
