import type { ApprovedDryRunExecution } from "../../bridge";
import { Badge, Icon } from "../../components/primitives";

interface WorkbenchResultCardProps {
  result: ApprovedDryRunExecution | null;
  error: string | null;
}

/**
 * Presentation of an approved dry-run outcome (success or blocked).
 * Output is always shown as inert and untrusted. This component renders only
 * what the bridge returned — it never re-runs, executes, or follows up.
 */
export function WorkbenchResultCard({ result, error }: WorkbenchResultCardProps) {
  if (error) {
    return (
      <div className="approval-result approval-result--error" role="alert">
        <span className="approval-result__status approval-result__status--fail">
          <Icon name="triangle-alert" /> Check blocked
        </span>
        <Badge label="BLOCKED" tone="amber" />
        <p>{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const passed = result.passed;
  return (
    <article
      className={`approval-result approval-result--${passed ? "pass" : "fail"}`}
      data-testid="approved-dry-run-result"
      aria-live="polite"
    >
      <header>
        <span className={`approval-result__status approval-result__status--${passed ? "pass" : "fail"}`}>
          <Icon name={passed ? "circle-check" : "triangle-alert"} />
          {passed ? "Check passed" : "Check finished with findings"}
        </span>
        <div>
          <p className="eyebrow">INERT EXECUTION REPORT</p>
          <h3>{result.commandSummary}</h3>
        </div>
        <Badge label="UNTRUSTED OUTPUT" tone="amber" />
        <Badge label={passed ? "PASS" : "FAIL"} tone={passed ? "green" : "amber"} />
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
  );
}
