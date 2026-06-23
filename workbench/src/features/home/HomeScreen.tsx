import { useEffect, useState } from "react";
import { isDesktopRuntime, loadProviderStatus } from "../../bridge";
import type { ProviderStatus } from "../../bridge";
import { derivePrivateProviderReadiness, providerReadinessLabel } from "../../providers";
import { useWorkbenchStore } from "../../state/workbench-store";
import { WorkspaceOnboardingCard } from "../../components/WorkspaceOnboardingCard";
import { Badge, Button, Icon } from "../../components/primitives";
import { homeNextStepMessage } from "./home-guidance";

function statusTone(ok: boolean): "green" | "amber" {
  return ok ? "green" : "amber";
}

export function HomeScreen() {
  const desktop = isDesktopRuntime();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const recentEntries = useWorkbenchStore((s) => s.approvalAuditEntries).slice(0, 4);

  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(desktop);

  useEffect(() => {
    if (!desktop) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let active = true;
    void loadProviderStatus()
      .then((report) => {
        if (active) setStatus(report);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [desktop]);

  const readiness = derivePrivateProviderReadiness(status, desktop);
  const nextStep = homeNextStepMessage(readiness, desktop, loading);

  const openWorkbench = () => navigate("workbench");
  const openProvider = () => {
    setSettingsSection("provider");
    navigate("settings");
  };
  const openSecurity = () => navigate("security");

  const statusRows: Array<{ label: string; value: string; ok: boolean }> = [
    {
      label: "Local provider",
      value: readiness.configDetected && status?.configured ? "Configured" : "Not configured",
      ok: Boolean(status?.configured)
    },
    {
      label: "Smoke check",
      value: !desktop
        ? "Desktop only"
        : readiness.configDetected
          ? "Available (approval-gated)"
          : "Not configured",
      ok: desktop && readiness.configDetected
    },
    {
      label: "Chat sandbox",
      value: !desktop ? "Desktop only" : readiness.chatSandboxAvailable ? "Available" : "Not ready",
      ok: readiness.chatSandboxAvailable
    },
    {
      label: "Image execution",
      value: readiness.imageProviderConfigured ? "Disabled (metadata only)" : "Disabled",
      ok: false
    },
    {
      label: "Workspace / tools / memory",
      value: "Disconnected",
      ok: true
    }
  ];

  return (
    <div className="screen screen--home screen--launchpad" data-testid="home-launchpad">
      <div className="home-launchpad__inner">
        <header className="home-launchpad__hero">
          <h1>What do you want to work on?</h1>
          <p>Plan in plain language, preview exactly what would run, and approve only bounded local steps.</p>
          <div className="home-launchpad__primary">
            <Button
              label="Open Workbench"
              iconName="square-terminal"
              variant="primary"
              onClick={openWorkbench}
            />
          </div>
        </header>

        <section className="home-launchpad__secondary" aria-label="Quick links">
          <button type="button" className="home-link-card" onClick={openWorkbench}>
            <Icon name="cpu" />
            <span>
              <b>Ask local model</b>
              <small>Desktop sandbox · single turn · approval required</small>
            </span>
          </button>
          <button type="button" className="home-link-card" onClick={openProvider}>
            <Icon name="activity" />
            <span>
              <b>Run provider smoke check</b>
              <small>Fixed minimal prompt · Settings → Provider</small>
            </span>
          </button>
          <button type="button" className="home-link-card" onClick={openProvider}>
            <Icon name="gauge" />
            <span>
              <b>Check provider readiness</b>
              <small>Sanitized status only · no secrets</small>
            </span>
          </button>
          <button type="button" className="home-link-card" onClick={openSecurity}>
            <Icon name="shield-alert" />
            <span>
              <b>Review safety center</b>
              <small>Findings · scans · policy boundaries</small>
            </span>
          </button>
        </section>

        <section className="home-launchpad__status" data-testid="home-status-summary" aria-label="Status summary">
          <div className="home-launchpad__status-head">
            <h2>Status</h2>
            <Badge label={providerReadinessLabel(readiness.overallReadiness)} tone={statusTone(readiness.overallReadiness !== "not_configured" && readiness.overallReadiness !== "error")} />
          </div>
          <dl className="home-status-grid">
            {statusRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <Badge label={row.value} tone={row.ok ? "green" : "amber"} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="home-launchpad__next" data-testid="home-next-step">
          <Icon name="arrow-right" />
          <p>{nextStep}</p>
        </section>

        {desktop ? <WorkspaceOnboardingCard /> : null}

        <section className="home-launchpad__recent" aria-label="Recent work">
          <div className="home-launchpad__recent-head">
            <h2>{recentEntries.length ? "Recent approved runs" : "Suggested next steps"}</h2>
          </div>
          {recentEntries.length ? (
            <ul className="home-recent-list">
              {recentEntries.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="home-recent-row" onClick={openWorkbench}>
                    <span>
                      <b>{entry.actionTitle}</b>
                      <small>{entry.commandSummary}</small>
                    </span>
                    <Badge label={entry.status.toUpperCase()} tone={entry.status === "success" ? "green" : "amber"} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="home-suggest-list">
              <li>
                <button type="button" onClick={openWorkbench}>
                  Describe a repair or feature in Workbench
                </button>
              </li>
              <li>
                <button type="button" onClick={openProvider}>
                  Review Private Local Model readiness
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate("capabilities")}>
                  Browse capability registry (read-only)
                </button>
              </li>
            </ul>
          )}
        </section>

        <footer className="home-launchpad__boundary" data-testid="home-safety-boundary">
          <Icon name="shield-check" />
          <span>
            <strong>local_untrusted</strong> · approval-first · no writes by default · private model identity stays on
            your machine
          </span>
        </footer>
      </div>
    </div>
  );
}
