import type { ComposedAction, CommandActionId } from "../../composer/action-model";
import { actionStatusLabel, actionStatusTone } from "../../composer/action-model";
import { Badge, Button, Icon } from "../../components/primitives";

interface CommandActionDetailProps {
  action: ComposedAction | null;
  onCompose: (actionId: CommandActionId) => void;
}

export function CommandActionDetail({ action, onCompose }: CommandActionDetailProps) {
  if (!action) {
    return (
      <aside className="command-detail command-detail--empty">
        <Icon name="workflow" />
        <h2>Preview unavailable</h2>
        <p>This command does not have a structured 0.11 action mapping yet.</p>
      </aside>
    );
  }

  return (
    <aside className="command-detail" data-testid="command-action-detail">
      <div className="command-detail__heading">
        <p className="eyebrow">{action.domain.toUpperCase()} · ACTION PREVIEW</p>
        <h2>{action.title}</h2>
        <p>{action.description}</p>
      </div>
      <Badge label={actionStatusLabel(action.currentExecutionStatus)} tone={actionStatusTone(action.currentExecutionStatus)} />
      <dl>
        <div><dt>Safety</dt><dd>{action.destructive ? "DESTRUCTIVE · DISABLED" : "BOUNDED"}</dd></div>
        <div><dt>Writes</dt><dd>{action.writesFiles ? "YES · DISABLED" : "NO"}</dd></div>
        <div><dt>Staff</dt><dd>{action.staffRequired ? "REQUIRED" : "NO"}</dd></div>
        <div><dt>Network</dt><dd>{action.networkRequired ? "REQUIRED · OFF" : "OFF"}</dd></div>
      </dl>
      <div className="command-detail__labels">
        {action.safetyLabels.slice(0, 5).map((label) => <span key={label}>{label}</span>)}
      </div>
      <p className="command-detail__warning"><Icon name="shield-alert" />{action.runtimeWarnings[0]}</p>
      <Button label="Compose preview" iconName="workflow" variant="primary" onClick={() => onCompose(action.id as CommandActionId)} />
    </aside>
  );
}
