import { formatSafeAuditSummary, type ApprovalAuditEntry } from "../../audit/approval-audit";
import { Badge, Icon } from "../../components/primitives";
import { useWorkbenchStore } from "../../state/workbench-store";

interface ApprovalAuditLogProps {
  compact?: boolean;
}

function statusTone(status: ApprovalAuditEntry["status"]): string {
  if (status === "success") return "green";
  if (status === "failed" || status === "timed_out") return "amber";
  return "violet";
}

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? "Unknown time" : parsed.toLocaleString();
}

export function ApprovalAuditLog({ compact = false }: ApprovalAuditLogProps) {
  const entries = useWorkbenchStore((state) => state.approvalAuditEntries);
  const showToast = useWorkbenchStore((state) => state.showToast);
  const visibleEntries = compact ? entries.slice(0, 3) : entries;

  const copySafeSummary = async (entry: ApprovalAuditEntry) => {
    if (!navigator.clipboard?.writeText) {
      showToast("Clipboard unavailable · safe summary remains visible in the audit entry", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatSafeAuditSummary(entry));
      showToast("Sanitized audit summary copied · process output omitted");
    } catch {
      showToast("Clipboard unavailable · no audit data copied", "warn");
    }
  };

  return (
    <section
      className={`approval-audit ${compact ? "approval-audit--compact" : ""}`.trim()}
      aria-labelledby={compact ? "recent-approval-runs-title" : "approval-log-title"}
      data-testid={compact ? "recent-approval-runs" : "approval-audit-log"}
    >
      <header className="approval-audit__heading">
        <div>
          <Icon name="clipboard-list" />
          <div>
            <p className="eyebrow">SESSION ONLY · SANITIZED</p>
            <h2 id={compact ? "recent-approval-runs-title" : "approval-log-title"}>
              {compact ? "Recent approved runs" : "Approval log"}
            </h2>
          </div>
        </div>
        <Badge label="NO PERSISTENCE" tone="cyan" />
      </header>

      {visibleEntries.length === 0 ? (
        <div className="approval-audit__empty">
          <Icon name="shield-check" />
          <div>
            <b>No approved dry-runs yet</b>
            <p>Approved checks will appear here after explicit user confirmation.</p>
          </div>
        </div>
      ) : (
        <div className="approval-audit__entries">
          {visibleEntries.map((entry) => (
            <article className="approval-audit-entry" key={entry.id}>
              <header>
                <div>
                  <b>{entry.actionTitle}</b>
                  <code>{entry.targetRelativePath ?? "fixed target"}</code>
                </div>
                <Badge label={entry.status.replace("_", " ").toUpperCase()} tone={statusTone(entry.status)} />
              </header>
              <div className="approval-audit-entry__meta">
                <span>{formatTimestamp(entry.timestamp)}</span>
                <span>{entry.workspaceLabel}</span>
                <span>{entry.durationMs} ms</span>
                <span>exit {entry.exitCode ?? "n/a"}</span>
                {entry.errorCode ? <span>{entry.errorCode}</span> : null}
              </div>
              <code className="approval-audit-entry__command">{entry.commandSummary}</code>
              <div className="approval-audit-entry__badges">
                <Badge label="UNTRUSTED OUTPUT" tone="amber" />
                <Badge label="NO WRITES" tone="green" />
                <Badge label="NO NETWORK" tone="cyan" />
              </div>
              {!compact && (entry.stdoutPreview || entry.stderrPreview) ? (
                <details className="approval-audit-entry__output">
                  <summary>Output previews</summary>
                  {entry.stdoutPreview ? (
                    <div>
                      <b>stdout{entry.stdoutTruncated ? " · truncated" : ""}</b>
                      <pre>{entry.stdoutPreview}</pre>
                    </div>
                  ) : null}
                  {entry.stderrPreview ? (
                    <div>
                      <b>stderr{entry.stderrTruncated ? " · truncated" : ""}</b>
                      <pre>{entry.stderrPreview}</pre>
                    </div>
                  ) : null}
                </details>
              ) : null}
              {!compact ? (
                <button className="approval-audit-entry__copy" type="button" onClick={() => copySafeSummary(entry)}>
                  <Icon name="clipboard-list" /> Copy safe summary
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {compact && entries.length > visibleEntries.length ? (
        <p className="approval-audit__more">{entries.length - visibleEntries.length} more in Reports</p>
      ) : null}
    </section>
  );
}
