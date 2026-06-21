import { useState } from "react";
import type { ComposedAction } from "../../composer/action-model";
import { runApprovedDryRunAction } from "../../bridge";
import type { ApprovedDryRunExecution } from "../../bridge";
import { Badge, Button, Icon } from "../../components/primitives";

interface ApprovedDryRunPanelProps {
  action: ComposedAction;
  workspacePath: string;
  onClose: () => void;
}

type RunState = "idle" | "running" | "complete" | "error";

export function ApprovedDryRunPanel({ action, workspacePath, onClose }: ApprovedDryRunPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [result, setResult] = useState<ApprovedDryRunExecution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approvedActionId = action.approvedDryRunActionId;

  if (!approvedActionId) return null;

  const runApprovedCheck = async () => {
    if (!acknowledged || runState === "running") return;
    setRunState("running");
    setAcknowledged(false);
    setResult(null);
    setError(null);
    const response = await runApprovedDryRunAction(approvedActionId, { approvalAcknowledged: true });
    if (!response.ok) {
      setRunState("error");
      setError(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setResult(response.data);
    setRunState("complete");
  };

  return (
    <section className="approval-panel" data-testid="approval-panel" aria-labelledby="approval-panel-title">
      <header>
        <span className="approval-panel__icon"><Icon name="shield-check" /></span>
        <div>
          <p className="eyebrow">ONE-TIME LOCAL CHECK APPROVAL</p>
          <h2 id="approval-panel-title">{action.title}</h2>
          <p>This approval applies only to the fixed 0.12 validation action shown below.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close approval panel" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>

      <div className="approval-panel__command" aria-label="Exact approved command">
        <span>FIXED ARGV</span>
        <div>
          {(action.fixedArgvTemplate ?? []).map((token, index) => <code key={`${token}-${index}`}>{token}</code>)}
        </div>
      </div>

      <dl className="approval-panel__facts">
        <div><dt>Workspace</dt><dd>{workspacePath}</dd></div>
        <div><dt>Writes files</dt><dd>FALSE</dd></div>
        <div><dt>Network required</dt><dd>FALSE</dd></div>
        <div><dt>Output trust</dt><dd>UNTRUSTED</dd></div>
      </dl>

      <label className="approval-confirmation">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={runState === "running"}
          onChange={(event) => setAcknowledged(event.currentTarget.checked)}
        />
        <span>
          <b>I understand this runs a local dry-run/check command.</b>
          <small>No file path, argv, environment, or command text can be changed.</small>
        </span>
      </label>

      <div className="approval-panel__actions">
        <span><Icon name="triangle-alert" /> Process output remains untrusted and inert.</span>
        <Button
          label={runState === "running" ? "Running fixed check" : "Run approved check"}
          iconName={runState === "running" ? "activity" : "play"}
          variant="primary"
          disabled={!acknowledged || runState === "running"}
          onClick={runApprovedCheck}
        />
      </div>

      {error ? (
        <div className="approval-result approval-result--error" role="alert">
          <Badge label="BLOCKED" tone="amber" />
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <article className="approval-result" data-testid="approved-dry-run-result" aria-live="polite">
          <header>
            <div>
              <p className="eyebrow">INERT EXECUTION REPORT</p>
              <h3>{result.commandSummary}</h3>
            </div>
            <Badge label="UNTRUSTED OUTPUT" tone="amber" />
            <Badge label={result.passed ? "PASS" : "FAIL"} tone={result.passed ? "green" : "amber"} />
          </header>
          <dl>
            <div><dt>Exit code</dt><dd>{result.exitCode}</dd></div>
            <div><dt>Duration</dt><dd>{result.durationMs} ms</dd></div>
            <div><dt>Writes</dt><dd>NO</dd></div>
            <div><dt>Follow-up</dt><dd>NONE</dd></div>
          </dl>
          {result.stdout ? <pre aria-label="Approved check stdout">{result.stdout}</pre> : null}
          {result.stderr ? <pre aria-label="Approved check stderr">{result.stderr}</pre> : null}
          <p><Icon name="lock-keyhole" /> Output cannot trigger apply, repair, commit, merge, update, or scheduler actions.</p>
        </article>
      ) : null}
    </section>
  );
}
