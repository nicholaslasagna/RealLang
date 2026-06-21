import { useMemo, useState } from "react";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";
import { securityFindings } from "../../data/security/security-fixtures";
import {
  buildFixPlan,
  statusTone,
  summarizeFindings,
  type SecurityFixPlan
} from "../../data/security/security-model";
import { DeepSecurityReviewCard } from "./DeepSecurityReviewCard";
import { SecurityScanPanel } from "./SecurityScanPanel";
import { FindingBadges, FixPlanPanel, fixButtonLabel, statusLabel } from "./security-parts";

function postureTone(status: "pass" | "warn" | "blocked"): string {
  if (status === "pass") return "green";
  if (status === "blocked") return "violet";
  return "amber";
}

export function SecurityScreen() {
  const findings = securityFindings;
  const summary = useMemo(() => summarizeFindings(findings), [findings]);
  const [selectedId, setSelectedId] = useState<string>(findings[0]?.id ?? "");
  const [fixPlans, setFixPlans] = useState<Record<string, SecurityFixPlan>>({});

  const selected = findings.find((finding) => finding.id === selectedId) ?? findings[0];
  const activePlan = selected ? fixPlans[selected.id] ?? null : null;

  const planFix = () => {
    if (!selected) return;
    setFixPlans((prev) => ({ ...prev, [selected.id]: buildFixPlan(selected) }));
  };

  return (
    <div className="screen security-screen">
      <SectionHeading
        eyebrow="SECURITY CENTER · LOCAL"
        title="Security review"
        description="Vulnerabilities, dependency risk, and audit findings in one honest view. Scans are read-only and fix plans are preview-only — RealForge never auto-fixes or modifies dependencies."
      />

      <section className={`security-hero security-hero--${summary.status}`}>
        <div className="security-hero__status">
          <span className="security-hero__icon">
            <Icon name={summary.status === "pass" ? "shield-check" : "shield-alert"} />
          </span>
          <div>
            <p className="eyebrow">SECURITY POSTURE</p>
            <h2>{summary.status === "blocked" ? "Attention · 1 advisory blocked upstream" : summary.status === "warn" ? "Attention needed" : "No open advisories"}</h2>
            <small>Last checked {new Date(summary.lastCheckedAt).toISOString().slice(0, 10)} · fixtures + read-only scans · no remediation</small>
          </div>
          <Badge label={summary.status.toUpperCase()} tone={postureTone(summary.status)} />
        </div>
        <div className="security-hero__metrics">
          <article>
            <span>Total</span>
            <strong>{summary.total}</strong>
          </article>
          <article>
            <span>Open</span>
            <strong>{summary.open}</strong>
          </article>
          <article>
            <span>Resolved</span>
            <strong className="security-num--green">{summary.resolved}</strong>
          </article>
          <article>
            <span>Blocked</span>
            <strong className="security-num--violet">{summary.blocked}</strong>
          </article>
        </div>
        <div className="security-hero__severity">
          <span>Severity</span>
          <Badge label={`CRITICAL ${summary.critical}`} tone={summary.critical ? "amber" : "neutral"} />
          <Badge label={`HIGH ${summary.high}`} tone={summary.high ? "amber" : "neutral"} />
          <Badge label={`MODERATE ${summary.moderate}`} tone={summary.moderate ? "amber" : "neutral"} />
          <Badge label={`LOW ${summary.low}`} tone="neutral" />
        </div>
      </section>

      <div className="security-layout">
        <section className="security-finding-list" aria-label="Security findings">
          {findings.map((finding) => {
            const active = finding.id === selected?.id;
            return (
              <button
                key={finding.id}
                type="button"
                className={`security-finding ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => setSelectedId(finding.id)}
              >
                <header>
                  <Icon name={finding.ecosystem === "npm" ? "package" : finding.ecosystem === "cargo" ? "box" : "shield"} />
                  <b>{finding.packageName}</b>
                  <Badge label={finding.ecosystem.toUpperCase()} tone="neutral" />
                </header>
                <p>{finding.summary}</p>
                <FindingBadges finding={finding} />
                <footer>
                  <span>
                    {finding.currentVersion ?? "—"} → {finding.patchedVersion ?? "n/a"}
                  </span>
                  <span>
                    <Icon name="file-text" />
                    {finding.affectedFiles.length} file{finding.affectedFiles.length === 1 ? "" : "s"}
                  </span>
                </footer>
              </button>
            );
          })}
        </section>

        {selected ? (
          <section className="security-detail" aria-label="Finding detail">
            <header>
              <div>
                <p className="eyebrow">{selected.source.replace(/_/g, " ").toUpperCase()}</p>
                <h2>{selected.packageName}</h2>
                {selected.advisoryId ? <code className="security-advisory">{selected.advisoryId}</code> : null}
              </div>
              <FindingBadges finding={selected} />
            </header>

            <p className="security-detail__summary">{selected.summary}</p>

            <dl className="security-detail__facts">
              <div>
                <dt>Current → patched</dt>
                <dd>
                  <code>{selected.currentVersion ?? "—"}</code> → <code>{selected.patchedVersion ?? "n/a"}</code>
                </dd>
              </div>
              <div>
                <dt>Ecosystem</dt>
                <dd>{selected.ecosystem.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge label={statusLabel(selected.status)} tone={statusTone(selected.status)} />
                </dd>
              </div>
              <div>
                <dt>Fix available</dt>
                <dd>{selected.fixAvailable ? "YES" : "NO"}</dd>
              </div>
            </dl>

            <div className="security-detail__blocks">
              <section>
                <h4>Details</h4>
                <p>{selected.details}</p>
              </section>
              <section>
                <h4>Impact</h4>
                <p>{selected.impact}</p>
              </section>
              <section>
                <h4>Exposure</h4>
                <p>{selected.exposure}</p>
              </section>
              {selected.fixBlockedReason ? (
                <section>
                  <h4>Why it is blocked</h4>
                  <p>{selected.fixBlockedReason}</p>
                </section>
              ) : null}
              <section>
                <h4>Affected files</h4>
                <ul>
                  {selected.affectedFiles.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h4>Recommended action</h4>
                <p>{selected.recommendedAction}</p>
              </section>
              {selected.riskNotes.length ? (
                <section>
                  <h4>Risk notes</h4>
                  <ul>
                    {selected.riskNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="security-detail__actions">
              <Button
                label={fixButtonLabel(selected.status)}
                iconName={selected.status === "resolved" ? "badge-check" : selected.status === "blocked" ? "calendar-clock" : "wrench"}
                variant="primary"
                onClick={planFix}
              />
              <span className="security-muted">
                <Icon name="shield-check" />
                Preview only · no file is modified, no command runs, no apply path exists.
              </span>
            </div>

            {activePlan ? <FixPlanPanel plan={activePlan} /> : null}
          </section>
        ) : null}
      </div>

      <SecurityScanPanel />

      <DeepSecurityReviewCard />
    </div>
  );
}
