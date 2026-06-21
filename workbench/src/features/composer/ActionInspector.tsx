import type { ComposedAction } from "../../composer/action-model";
import { actionStatusLabel } from "../../composer/action-model";
import { Icon } from "../../components/primitives";

interface ActionInspectorProps {
  action: ComposedAction;
  runtime: "web" | "desktop";
  bridgeHealthy: boolean;
}

export function ActionInspector({ action, runtime, bridgeHealthy }: ActionInspectorProps) {
  const summary =
    action.currentExecutionStatus === "approval_required"
      ? "Preview only. Running it requires one explicit local approval — no writes, no network."
      : action.currentExecutionStatus === "read_only_available"
        ? "Read-only. Loads untrusted report data through the desktop bridge; nothing is written."
        : "Preview only. This action composes structured intent; no command runs from here.";

  return (
    <aside className="inspector" aria-label="Composed action inspector">
      <header>
        <Icon name="panel-right" />
        <b>ACTION INSPECTOR</b>
      </header>
      <p className="inspector-summary">{summary}</p>
      <section className="proposal-facts">
        <div><span>Domain</span><b>{action.domain.toUpperCase()}</b></div>
        <div><span>Runtime</span><b>{runtime.toUpperCase()}</b></div>
        <div><span>Bridge</span><b>{bridgeHealthy ? "READ-ONLY READY" : "NOT READY"}</b></div>
        <div><span>Status</span><b>{actionStatusLabel(action.currentExecutionStatus)}</b></div>
        <div><span>Source ID</span><code>{action.fixedSourceId ?? "none"}</code></div>
      </section>
      <section>
        <h3>FUTURE REQUIREMENTS</h3>
        <ul className="inspector-requirements">
          {action.futureRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
        </ul>
      </section>
      <section>
        <h3>RISK BOUNDARY</h3>
        <p className="risk-note">
          <Icon name="triangle-alert" />
          Displayed arguments are review metadata. The browser cannot submit them to IPC.
        </p>
      </section>
      <section>
        <h3>NEXT SAFE STEP</h3>
        <p className="next-command">{action.nextSafeStep}</p>
      </section>
    </aside>
  );
}
