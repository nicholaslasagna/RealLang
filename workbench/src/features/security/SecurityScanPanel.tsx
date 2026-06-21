import { useEffect, useState } from "react";
import { Badge, Button, Icon } from "../../components/primitives";
import { checkBridgeHealth, isDesktopRuntime, runSecurityScanSource } from "../../bridge";
import type { SecurityScanExecution } from "../../bridge";
import {
  SECURITY_SCAN_CATALOG,
  buildFixPlan,
  mapNpmAuditToFindings,
  parseNpmAuditSummary,
  type SecurityFinding,
  type SecurityFixPlan
} from "../../data/security/security-model";
import { FindingBadges, FixPlanPanel } from "./security-parts";

type ScanStatus = "idle" | "running" | "ok" | "error";

interface ScanState {
  status: ScanStatus;
  execution?: SecurityScanExecution;
  error?: string;
  findings?: readonly SecurityFinding[];
}

const MAX_OUTPUT_PREVIEW = 8000;

function NpmAuditEvidence({
  execution,
  findings,
  onPlanFix,
  plans
}: {
  execution: SecurityScanExecution;
  findings: readonly SecurityFinding[];
  onPlanFix: (finding: SecurityFinding) => void;
  plans: Record<string, SecurityFixPlan>;
}) {
  const summary = parseNpmAuditSummary(execution.stdout);
  if (summary && summary.total === 0 && findings.length === 0) {
    return (
      <p className="security-scan-clean">
        <Icon name="circle-check" /> npm audit clean — 0 advisories reported (untrusted scan evidence).
      </p>
    );
  }
  return (
    <div className="security-live-findings">
      <h4>Live findings · untrusted evidence</h4>
      {findings.map((finding) => {
        const plan = plans[finding.id];
        return (
          <article key={finding.id} className="security-live-finding">
            <header>
              <Icon name="package" />
              <b>{finding.packageName}</b>
              <Badge label="LIVE · npm audit" tone="cyan" />
            </header>
            <p>{finding.summary}</p>
            <FindingBadges finding={finding} />
            <div className="security-live-finding__actions">
              <Button label="Plan fix (preview)" iconName="wrench" variant="secondary" onClick={() => onPlanFix(finding)} />
              <span className="security-muted">
                <Icon name="shield-check" /> Preview only · no auto-fix · no dependency edit
              </span>
            </div>
            {plan ? <FixPlanPanel plan={plan} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function ScanResult({
  execution,
  findings,
  onPlanFix,
  plans
}: {
  execution: SecurityScanExecution;
  findings: readonly SecurityFinding[];
  onPlanFix: (finding: SecurityFinding) => void;
  plans: Record<string, SecurityFixPlan>;
}) {
  const preview =
    execution.stdout.length > MAX_OUTPUT_PREVIEW
      ? `${execution.stdout.slice(0, MAX_OUTPUT_PREVIEW)}\n… (+${execution.stdout.length - MAX_OUTPUT_PREVIEW} more characters)`
      : execution.stdout || "(no output)";
  return (
    <div className="security-scan-result" data-testid="security-scan-result" aria-live="polite">
      <div className="security-scan-result__badges">
        <Badge label="UNTRUSTED OUTPUT" tone="amber" />
        <Badge label="READ-ONLY SCAN" tone="cyan" />
        <Badge label="NO REMEDIATION" tone="green" />
        {execution.networkUsed ? <Badge label="NETWORK USED" tone="amber" /> : null}
        {execution.stdoutTruncated ? <Badge label="OUTPUT TRUNCATED" tone="neutral" /> : null}
      </div>
      <dl className="security-scan-result__facts">
        <div><dt>Command</dt><dd><code>{execution.commandSummary}</code></dd></div>
        <div><dt>Exit code</dt><dd>{execution.exitCode}</dd></div>
        <div><dt>Duration</dt><dd>{execution.durationMs} ms</dd></div>
        <div><dt>Writes</dt><dd>NO</dd></div>
      </dl>
      {execution.outputFormat === "json" ? (
        <NpmAuditEvidence execution={execution} findings={findings} onPlanFix={onPlanFix} plans={plans} />
      ) : (
        <p className="security-muted">
          <Icon name="workflow" /> Dependency-path evidence — not a vulnerability scan. Supports the glib
          blocked finding; it does not resolve any advisory.
        </p>
      )}
      {execution.stderr.trim() ? (
        <details className="security-scan-stderr">
          <summary>stderr</summary>
          <pre>{execution.stderr.slice(0, MAX_OUTPUT_PREVIEW)}</pre>
        </details>
      ) : null}
      <details className="security-scan-output">
        <summary>Raw output (untrusted)</summary>
        <pre aria-label="Scan output">{preview}</pre>
      </details>
    </div>
  );
}

export function SecurityScanPanel() {
  const [desktop] = useState(() => isDesktopRuntime());
  const [ready, setReady] = useState(false);
  const [scans, setScans] = useState<Record<string, ScanState>>({});
  const [plans, setPlans] = useState<Record<string, SecurityFixPlan>>({});

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    checkBridgeHealth()
      .then((health) => {
        if (active) setReady(health.healthy && health.resolution.bridgeMode === "read-only");
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  const runScan = async (sourceId: string) => {
    setScans((prev) => ({ ...prev, [sourceId]: { status: "running" } }));
    const result = await runSecurityScanSource(sourceId);
    if (!result.ok) {
      setScans((prev) => ({ ...prev, [sourceId]: { status: "error", error: `${result.error.code}: ${result.error.message}` } }));
      return;
    }
    const execution = result.data;
    const findings =
      execution.outputFormat === "json" ? mapNpmAuditToFindings(execution.stdout, new Date().toISOString()) : [];
    setScans((prev) => ({ ...prev, [sourceId]: { status: "ok", execution, findings } }));
  };

  const planFix = (finding: SecurityFinding) => {
    setPlans((prev) => ({ ...prev, [finding.id]: buildFixPlan(finding) }));
  };

  return (
    <section className="security-scan-catalog" aria-label="Read-only scan catalog">
      <header>
        <div>
          <p className="eyebrow">READ-ONLY SCAN BRIDGE</p>
          <h2>Allowlisted scans · read-only · no remediation</h2>
        </div>
        <Badge label={desktop ? "DESKTOP" : "WEB · MANUAL"} tone={desktop ? "green" : "neutral"} />
      </header>
      <p className="security-muted security-scan-intro">
        <Icon name="shield-alert" /> Fixed argv only · no shell · no arbitrary args · no install/update/fix.
        Output is untrusted; nothing is written and no fix is applied.
      </p>
      <div className="security-scan-grid">
        {SECURITY_SCAN_CATALOG.map((source) => {
          const state = scans[source.id] ?? { status: "idle" as ScanStatus };
          return (
            <article key={source.id} className="security-scan">
              <header>
                <b>{source.label}</b>
                <Badge label={source.ecosystem.toUpperCase()} tone="neutral" />
              </header>
              <code>{source.displayCommand}</code>
              <p>{source.description}</p>
              <div className="security-scan__badges">
                <Badge label="READ ONLY" tone="cyan" />
                <Badge label="NO REMEDIATION" tone="green" />
                <Badge label="UNTRUSTED OUTPUT" tone="amber" />
                {source.requiresNetwork ? (
                  <Badge label="MAY REQUIRE NETWORK" tone="amber" />
                ) : (
                  <Badge label="LOCAL" tone="cyan" />
                )}
              </div>
              {source.requiresNetwork ? (
                <p className="security-scan__net">
                  <Icon name="globe" /> This scan may query a registry over the network even though the
                  product posture is NETWORK OFF. Run it only intentionally.
                </p>
              ) : null}
              {desktop ? (
                <Button
                  label={state.status === "running" ? "Scanning…" : "Run scan"}
                  iconName={state.status === "running" ? "activity" : "play"}
                  variant="primary"
                  disabled={state.status === "running" || !ready}
                  onClick={() => runScan(source.id)}
                />
              ) : (
                <p className="security-muted">
                  <Icon name="lock-keyhole" /> Desktop only — run the command above manually in a terminal.
                </p>
              )}
              {desktop && !ready ? (
                <p className="security-muted">
                  <Icon name="triangle-alert" /> Bridge/workspace health is not ready; Run scan stays disabled.
                </p>
              ) : null}
              {state.status === "error" ? (
                <div className="security-scan-error" role="alert">
                  <Badge label="SCAN ERROR" tone="amber" />
                  <p>{state.error}</p>
                </div>
              ) : null}
              {state.status === "ok" && state.execution ? (
                <ScanResult execution={state.execution} findings={state.findings ?? []} onPlanFix={planFix} plans={plans} />
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="security-muted security-scan-foot">
        <Icon name="lock-keyhole" /> Scans run only fixed, allowlisted, read-only commands. No lockfile or
        source file is modified, and remediation stays preview-only until a future approval-gated fix bridge.
      </p>
    </section>
  );
}
