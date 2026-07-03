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
  const localModelSummary = loading
    ? "Checking your local model setup..."
    : !desktop
      ? "Open the desktop app to use a local provider."
      : status?.configured
        ? "Configured locally. Run a smoke check if chat cannot connect."
        : "Not configured yet. Add a private local provider when you are ready.";

  const openWorkbench = () => navigate("workbench");
  const openProvider = () => {
    setSettingsSection("provider");
    navigate("settings");
  };
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
          <h1>RealForge is ready.</h1>
          <p>Ask the local model, shape a safe preview, and keep every action reviewable before it touches your workspace.</p>
          <div className="home-launchpad__primary">
            <Button
              label="Open Workbench"
              iconName="square-terminal"
              variant="primary"
              onClick={openWorkbench}
            />
            <button type="button" className="home-secondary-action" onClick={openProvider}>
              Check local model
            </button>
          </div>
        </header>

        <details className="home-launchpad__shortcuts">
          <summary>
            <Icon name="sparkles" />
            More quick starts
          </summary>
          <section className="home-launchpad__secondary" aria-label="Quick links">
            <button type="button" className="home-link-card" onClick={openWorkbench}>
              <Icon name="cpu" />
              <span>
                <b>Start local chat</b>
                <small>You approve each request · no files or tools</small>
              </span>
            </button>
            <button type="button" className="home-link-card" onClick={openProvider}>
              <Icon name="activity" />
              <span>
                <b>Run smoke check</b>
                <small>Verify your local model server</small>
              </span>
            </button>
            <button type="button" className="home-link-card" onClick={() => navigate("security")}>
              <Icon name="shield-alert" />
              <span>
                <b>Review safety</b>
                <small>Scans and policy boundaries</small>
              </span>
            </button>
          </section>
        </details>

        <section className="home-launchpad__status" data-testid="home-status-summary" aria-label="Status summary">
          <div className="home-launchpad__status-head">
            <h2>Local model</h2>
            <Badge label={providerReadinessLabel(readiness.overallReadiness)} tone={statusTone(readiness.overallReadiness !== "not_configured" && readiness.overallReadiness !== "error")} />
          </div>
          <p className="home-status-summary-line">{localModelSummary}</p>
          <details className="home-status-details">
            <summary>Status details</summary>
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
          </details>
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
                  Check local model readiness
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
            RealForge will not change files here. Local model output stays <strong>local_untrusted</strong> until you review it.
          </span>
        </footer>
      </div>
    </div>
  );
}
