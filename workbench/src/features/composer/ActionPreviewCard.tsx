import type { ComposedAction, FixedReadOnlySourceId } from "../../composer/action-model";
import { actionStatusLabel, actionStatusTone } from "../../composer/action-model";
import { Badge, Button, Icon } from "../../components/primitives";
import type { DesktopLoadStatus } from "../../state/types";

interface ActionPreviewCardProps {
  action: ComposedAction;
  bridgeLoading: boolean;
  bridgeError: string | null;
  loadStatus: DesktopLoadStatus;
  loadingSourceId: string | null;
  onLoad: (sourceId: FixedReadOnlySourceId) => void;
  onOpenReports: () => void;
  onRequestApproval: () => void;
  onOpenSetup: () => void;
}

function safetyTone(label: string) {
  if (label === "READONLY" || label === "LOCAL ONLY") return "cyan";
  if (label === "NO WRITES" || label === "NETWORK OFF") return "green";
  if (label === "STAFF ONLY" || label === "APPROVAL BRIDGE REQUIRED") return "violet";
  if (label === "APPROVAL REQUIRED" || label === "UNTRUSTED") return "amber";
  return "blue";
}

/**
 * A calm, human one-line summary of what the action is allowed to do.
 * The precise machine labels remain available (collapsed) in the details
 * section below — this row is an additive, reassuring summary, not a
 * replacement for any safety information.
 */
function safetySummary(action: ComposedAction): string {
  const parts: string[] = [];
  if (action.approvedDryRunActionId) parts.push("Approval-gated check");
  else if (action.fixedSourceId) parts.push("Read-only report");
  else parts.push("Safe preview");
  if (action.runsCommands && !action.fixedSourceId) parts.push("dry run");
  parts.push(action.writesFiles ? "no writes (disabled)" : "no writes");
  if (action.approvalRequired) parts.push("approval required");
  if (action.networkRequired) parts.push("network gated");
  return parts.join(" · ");
}

function ExecutionControl({
  action,
  bridgeLoading,
  loadStatus,
  loadingSourceId,
  onLoad,
  onOpenReports,
  onRequestApproval,
  onOpenSetup
}: Pick<
  ActionPreviewCardProps,
  "action" | "bridgeLoading" | "loadStatus" | "loadingSourceId" | "onLoad" | "onOpenReports"
  | "onRequestApproval" | "onOpenSetup"
>) {
  const loading = loadStatus === "loading" && loadingSourceId === action.fixedSourceId;
  if (action.canLoadNow && action.fixedSourceId) {
    return (
      <Button
        label={loading ? "Loading report" : "Load now"}
        iconName={loading ? "activity" : "file-text"}
        variant="primary"
        disabled={loading || bridgeLoading}
        onClick={() => onLoad(action.fixedSourceId as FixedReadOnlySourceId)}
      />
    );
  }
  if (action.fixedSourceId) {
    return (
      <div className="action-preview__controls">
        <Button label="Desktop bridge unavailable" iconName="lock-keyhole" variant="secondary" disabled />
        <Button label="Open Reports" iconName="file-text" variant="ghost" onClick={onOpenReports} />
      </div>
    );
  }
  if (action.approvedDryRunActionId) {
    if (action.canRequestApproval) {
      return (
        <Button label="Review approval" iconName="shield-check" variant="primary" onClick={onRequestApproval} />
      );
    }
    return (
      <div className="action-preview__controls">
        <Button label="Desktop approval unavailable" iconName="lock-keyhole" variant="secondary" disabled />
        <Button label="Open workspace setup" iconName="settings" variant="ghost" onClick={onOpenSetup} />
      </div>
    );
  }
  if (action.staffRequired && action.currentExecutionStatus === "unsupported") {
    return <Button label="Staff Mode off" iconName="lock-keyhole" variant="secondary" disabled />;
  }
  if (action.currentExecutionStatus === "approval_bridge_required") {
    return <Button label="Approval bridge required" iconName="shield-alert" variant="secondary" disabled />;
  }
  return <Button label="Preview only" iconName="eye" variant="secondary" disabled />;
}

export function ActionPreviewCard(props: ActionPreviewCardProps) {
  const { action, bridgeError } = props;
  return (
    <article className="action-preview" data-testid="action-preview-card">
      <header className="action-preview__header">
        <span className="action-preview__mark">
          <Icon name="workflow" />
        </span>
        <div>
          <p className="eyebrow">COMPOSED ACTION · {action.domain.toUpperCase()}</p>
          <h2>{action.title}</h2>
          <p>{action.description}</p>
        </div>
        <Badge label={actionStatusLabel(action.currentExecutionStatus)} tone={actionStatusTone(action.currentExecutionStatus)} />
      </header>

      <p className="action-preview__assurance">
        <Icon name="shield-check" />
        <span>{safetySummary(action)}</span>
      </p>

      <details className="action-preview__details">
        <summary>
          <Icon name="chevron-right" className="action-preview__chevron" />
          <span>Show safety details</span>
        </summary>
        <div className="action-preview__details-body">
          <div className="action-preview__labels" aria-label="Action safety metadata">
            {action.safetyLabels.map((label) => (
              <Badge key={label} label={label} tone={safetyTone(label)} />
            ))}
          </div>

          <dl className="action-preview__facts">
            <div><dt>Writes files</dt><dd>{action.writesFiles ? "YES · DISABLED" : "NO"}</dd></div>
            <div><dt>Runs commands</dt><dd>{action.approvedDryRunActionId ? "FIXED CHECK" : action.runsCommands ? "PLANNED" : "NO"}</dd></div>
            <div><dt>Network</dt><dd>{action.networkRequired ? "REQUIRES APPROVAL" : "OFF"}</dd></div>
            <div><dt>Approval</dt><dd>{action.approvalRequired ? "REQUIRED" : "NOT REQUIRED"}</dd></div>
          </dl>

          {action.proposedArgvPreview ? (
            <section className="argv-preview" aria-label={action.approvedDryRunActionId ? "Fixed approval argument preview" : "Display-only argument preview"}>
              <header>
                <span>{action.approvedDryRunActionId ? "FIXED APPROVAL ARGV" : "PROPOSED ARGV PREVIEW"}</span>
                <b>{action.approvedDryRunActionId ? "RUST ALLOWLIST · NO USER ARGS" : "DISPLAY ONLY · NOT EXECUTABLE"}</b>
              </header>
              <div>
                {action.proposedArgvPreview.map((token, index) => (
                  <code key={`${token}-${index}`}>{token}</code>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </details>

      <div className="action-preview__footer">
        <div className="action-preview__warnings">
          {(bridgeError ? [bridgeError, ...action.runtimeWarnings] : action.runtimeWarnings).map((warning, index) => (
            <p key={`${warning}-${index}`}><Icon name="triangle-alert" />{warning}</p>
          ))}
        </div>
        <ExecutionControl {...props} />
      </div>
    </article>
  );
}
