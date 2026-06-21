import type { ReactNode } from "react";
import type { ImportField, ImportPreview } from "../../state/types";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon } from "../../components/primitives";

function safetyTone(label: string) {
  if (label === "UNTRUSTED") return "amber";
  if (label === "STAFF ONLY" || label === "APPROVAL REQUIRED") return "violet";
  if (label === "DRY RUN") return "blue";
  if (label === "VALIDATED") return "green";
  return "cyan";
}

function statusTone(status: string) {
  if (status === "PASS" || status === "VALIDATED") return "green";
  if (status === "BLOCKED") return "violet";
  if (status === "WARN" || status === "PENDING") return "amber";
  return "neutral";
}

function renderImportFields(fields?: ImportField[]) {
  if (!fields?.length) return <p className="import-note">No additional fields were present in this report.</p>;
  return (
    <dl className="import-fields">
      {fields.map((field, index) => {
        if (field.type === "more") {
          return (
            <div key={`more-${index}`} className="import-fields__more">
              <dt />
              <dd className="import-more">+{String(field.value)} more field(s) not shown</dd>
            </div>
          );
        }
        let value: ReactNode;
        if (field.type === "list") {
          const items = (field.value as string[]).map((item) => <li key={item}>{item}</li>);
          const more = field.moreCount && field.moreCount > 0 ? <li className="import-more">+{field.moreCount} more</li> : null;
          value = (
            <ul>
              {items}
              {more}
            </ul>
          );
        } else if (field.type === "flag") {
          value = <Badge label={field.value ? "YES" : "NO"} tone={field.value ? "green" : "neutral"} />;
        } else if (field.type === "count") {
          value = <code>{String(field.value)} item(s)</code>;
        } else {
          const more =
            field.truncatedChars && field.truncatedChars > 0 ? (
              <span className="import-more"> … +{field.truncatedChars} more characters</span>
            ) : null;
          value = (
            <code>
              {String(field.value)}
              {more}
            </code>
          );
        }
        return (
          <div key={`${field.label}-${index}`}>
            <dt>{field.label}</dt>
            <dd>{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ImportPreviewPanel({ preview }: { preview: ImportPreview | null }) {
  const toggleStaffPreview = useWorkbenchStore((s) => s.toggleStaffPreview);

  if (!preview) {
    return (
      <div className="import-status import-status--idle">
        <Icon name="clipboard-list" />
        <div>
          <b>No report previewed yet</b>
          <p>Paste JSON or load a sample, then choose Preview report. Nothing is sent anywhere.</p>
        </div>
      </div>
    );
  }
  if (preview.parseError) {
    return (
      <div className="import-status import-status--error">
        <Icon name="triangle-alert" />
        <div>
          <b>Could not parse JSON</b>
          <p>{preview.error}</p>
        </div>
      </div>
    );
  }
  if (preview.empty || preview.ok !== true) {
    return (
      <div className="import-status import-status--idle">
        <Icon name="clipboard-list" />
        <div>
          <b>Nothing to preview</b>
          <p>{preview.error || "Paste a RealForge report as JSON to preview it."}</p>
        </div>
      </div>
    );
  }

  let detectBadge;
  if (preview.selectionMode === "manual") detectBadge = <Badge label="MANUAL TYPE" tone="neutral" />;
  else if (preview.selectionMode === "unrecognized") detectBadge = <Badge label="UNRECOGNIZED" tone="amber" />;
  else detectBadge = <Badge label="AUTO-DETECTED" tone="cyan" />;

  const meta = preview.meta || {};
  const status = meta.status || "UNKNOWN";
  const statusClaimed = status === "VALIDATED";
  const statusBadge = (
    <Badge label={statusClaimed ? "VALIDATED · CLAIMED" : status} tone={statusClaimed ? "amber" : statusTone(status)} />
  );

  const body = preview.gated ? (
    <div className="staff-settings-gate import-gate">
      <Icon name="lock-keyhole" />
      <span>
        <b>Staff-only report · advanced details locked.</b>
        <small>Advanced fields stay hidden while Staff Mode is off. Enabling the staff UI preview changes no backend state and grants no permissions.</small>
      </span>
      <div className="import-gate__actions">
        <Badge label="LOCKED" tone="violet" />
        <Button label="Enable staff UI preview" iconName="eye" variant="violet" onClick={toggleStaffPreview} />
      </div>
    </div>
  ) : (
    renderImportFields(preview.fields)
  );

  return (
    <article className="import-result">
      <header className="import-result__head">
        <div>
          <p className="eyebrow">PREVIEWED REPORT</p>
          <h2>{preview.label}</h2>
        </div>
        <div className="import-result__badges">
          {detectBadge}
          {statusBadge}
        </div>
      </header>
      {preview.generic ? (
        <div className="workflow-notice workflow-notice--amber">
          <Icon name="triangle-alert" />
          <span>{preview.reason || "Unrecognized report type. Showing a raw field preview."}</span>
        </div>
      ) : null}
      {preview.mismatch ? (
        <div className="workflow-notice workflow-notice--amber">
          <Icon name="triangle-alert" />
          <span>
            This JSON looks like <b>{preview.mismatch.detectedLabel}</b>, but you selected <b>{preview.mismatch.selectedLabel}</b>.
          </span>
        </div>
      ) : null}
      <div className="import-meta-grid">
        {[
          ["Kind", meta.kind || preview.typeId || "unknown"],
          ["Report id", meta.id || "—"],
          ["Provider", meta.provider || "(none declared)"],
          ["Model", meta.model || "(none declared)"]
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <code>{String(value)}</code>
          </div>
        ))}
      </div>
      <div className="import-trust-row">
        <Badge label={preview.hasProvider ? "PROVIDER OUTPUT UNTRUSTED" : "IMPORTED JSON · UNTRUSTED"} tone="amber" />
        {preview.claimedValidated ? <Badge label="VALIDATION CLAIMED · UNVERIFIED" tone="amber" /> : null}
        {preview.staffOnly ? <Badge label="STAFF ONLY" tone="violet" /> : null}
        {preview.approvalRequired ? <Badge label="APPROVAL REQUIRED" tone="violet" /> : null}
        {preview.dryRun ? <Badge label="DRY RUN" tone="blue" /> : null}
      </div>
      {preview.safetyLabels?.length ? (
        <div className="import-safety">
          {preview.safetyLabels.map((label) => (
            <Badge key={label} label={label} tone={safetyTone(label)} />
          ))}
        </div>
      ) : null}
      {preview.reviewOnly ? (
        <div className="workflow-notice workflow-notice--violet import-review">
          <Icon name="lock-keyhole" />
          <span>
            <b>Review only.</b> Patch, proposal, and update data is never applied or merged from an import. <em>Backend bridge not connected.</em>
          </span>
          <button className="button button--ghost" type="button" disabled aria-disabled="true">
            <Icon name="git-pull-request-arrow" />
            <span>Apply (disabled)</span>
          </button>
        </div>
      ) : null}
      <div className="import-section-label">KEY FIELDS</div>
      {body}
      {preview.suggestedCommands?.length ? (
        <section className="import-commands">
          <header>
            <Icon name="terminal" />
            <b>SUGGESTED COMMANDS</b>
            <Badge label="NOT EXECUTED" tone="amber" />
          </header>
          <div className="import-command-list">
            {preview.suggestedCommands.map((command) => (
              <code key={command} className="command-line">
                {command}
              </code>
            ))}
            {preview.suggestedCommandsMore && preview.suggestedCommandsMore > 0 ? (
              <code className="command-line import-more">+{preview.suggestedCommandsMore} more command(s) not shown</code>
            ) : null}
          </div>
          <p>
            <Icon name="shield-check" />
            Shown as suggestions only. RealForge never runs commands from an imported report.
          </p>
        </section>
      ) : null}
      {preview.warnings?.length ? (
        <section className="import-warnings">
          <header>
            <Icon name="triangle-alert" />
            <b>ADAPTER WARNINGS</b>
            <span>{preview.warnings.length}</span>
          </header>
          <ul>
            {preview.warnings.map((item) => (
              <li key={`${item.path}-${item.code}`}>
                <code>{item.path}</code>
                <span className="import-warning-code">{item.code}</span>
                {item.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
