import {
  AUDIT_SESSION_LIMIT,
  formatSafeAuditSummary,
  type ApprovalAuditEntry
} from "../../audit/approval-audit";
import { Badge, Button, Icon } from "../../components/primitives";
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
  const storageStatus = useWorkbenchStore((state) => state.approvalAuditStorageStatus);
  const storageWarning = useWorkbenchStore((state) => state.approvalAuditStorageWarning);
  const clearApprovalAuditHistory = useWorkbenchStore((state) => state.clearApprovalAuditHistory);
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

  const clearHistory = async () => {
    const confirmed = window.confirm(
      "Clear approval audit history? This removes only the fixed local app-config history file."
    );
    if (!confirmed) return;
    await clearApprovalAuditHistory();
  };

  const storageLabel =
    storageStatus === "persisted"
      ? "PERSISTED LOCALLY"
      : storageStatus === "loading"
        ? "LOADING HISTORY"
        : storageStatus === "error"
          ? "SESSION FALLBACK"
          : "SESSION ONLY";

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
            <p className="eyebrow">LOCAL HISTORY · SANITIZED</p>
            <h2 id={compact ? "recent-approval-runs-title" : "approval-log-title"}>
              {compact ? "Recent approved runs" : "Approval log"}
            </h2>
          </div>
        </div>
        {!compact ? (
          <div className="approval-audit__controls">
            <Badge label={storageLabel} tone={storageStatus === "persisted" ? "green" : "cyan"} />
            <Button
              label="Clear history"
              iconName="file-x"
              variant="ghost"
              disabled={(entries.length === 0 && !storageWarning) || storageStatus === "loading"}
              onClick={clearHistory}
            />
          </div>
        ) : null}
      </header>

      {!compact ? (
        <div className="approval-audit__policy" role="note">
          <span>{entries.length} / {AUDIT_SESSION_LIMIT} entries</span>
          <p>
            {storageStatus === "persisted"
              ? "Stored in local app config only. No repository or workspace writes. Output bodies are not persisted."
              : "Session only in web preview or while desktop persistence is unavailable. Reloading clears session-only history."}
          </p>
        </div>
      ) : null}
      {!compact && storageWarning ? (
        <p className="approval-audit__warning" role="status">
          <Icon name="triangle-alert" /> {storageWarning}
        </p>
      ) : null}

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
