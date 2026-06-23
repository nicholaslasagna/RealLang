import {
  providerReadinessLabel,
  type PrivateProviderReadiness,
  type ProviderSmokeSessionStatus
} from "../providers";
import { Badge, Button, Icon } from "./primitives";

interface ProviderReadinessDashboardProps {
  readiness: PrivateProviderReadiness;
  loading: boolean;
  desktop: boolean;
  onRefreshStatus: () => void;
}

function smokeStatusLabel(value: ProviderSmokeSessionStatus): string {
  const labels: Record<ProviderSmokeSessionStatus, string> = {
    not_run: "NOT RUN",
    pass: "PASS",
    fail: "FAILED",
    not_configured: "NOT CONFIGURED",
    unavailable: "UNAVAILABLE"
  };
  return labels[value];
}

function readinessTone(value: PrivateProviderReadiness["overallReadiness"]): string {
  if (value === "sandbox_ready" || value === "reachable") return "green";
  if (value === "configured") return "cyan";
  return "amber";
}

function diagnosis(readiness: PrivateProviderReadiness, desktop: boolean): { title: string; detail: string } {
  if (!desktop) {
    return {
      title: "Desktop only",
      detail: "Open the desktop app to read sanitized local-provider status or run smoke/chat checks."
    };
  }
  if (readiness.overallReadiness === "sandbox_ready" || readiness.overallReadiness === "reachable") {
    return {
      title: "Ready for local chat",
      detail: "Smoke passed in this session. Chat remains approval-gated and local_untrusted."
    };
  }
  if (readiness.overallReadiness === "configured") {
    return {
      title: "Configured, not verified",
      detail: "Run the fixed smoke check. If it fails, start your local OpenAI-compatible server and try again."
    };
  }
  if (readiness.overallReadiness === "error") {
    return {
      title: "Reachability failed",
      detail: "Review sanitized status, start the local provider if needed, then run a smoke check."
    };
  }
  return {
    title: "Not configured",
    detail: "Create private local provider config outside the repo. RealForge will not store secrets here."
  };
}

export function ProviderReadinessDashboard({
  readiness,
  loading,
  desktop,
  onRefreshStatus
}: ProviderReadinessDashboardProps) {
  const currentDiagnosis = diagnosis(readiness, desktop);
  const lifecycle = [
    {
      id: "config",
      label: "Private config",
      value: readiness.configDetected ? "DETECTED" : "NOT DETECTED",
      complete: readiness.configDetected,
      detail: "Fixed home config; contents remain local."
    },
    {
      id: "status",
      label: "Sanitized status",
      value: readiness.statusAvailable ? "AVAILABLE" : "UNAVAILABLE",
      complete: readiness.statusAvailable,
      detail: "Booleans and safe provider kind only."
    },
    {
      id: "smoke",
      label: "Fixed smoke check",
      value: readiness.smokeAvailable ? smokeStatusLabel(readiness.smokeLastStatus) : "DESKTOP ONLY",
      complete: readiness.smokeLastStatus === "pass",
      detail: "Approval-gated; current-session status only."
    },
    {
      id: "chat",
      label: "Private chat sandbox",
      value: readiness.chatSandboxAvailable ? "AVAILABLE" : "LOCKED",
      complete: readiness.chatSandboxAvailable,
      detail: "Single turn; bounded input and output."
    },
    {
      id: "image",
      label: "Image provider",
      value: readiness.imageProviderConfigured ? "METADATA ONLY" : "NOT CONFIGURED",
      complete: false,
      detail: "Execution and image generation remain disabled."
    }
  ];

  return (
    <section
      className="provider-readiness provider-readiness--calm"
      data-testid="provider-readiness-dashboard"
      aria-labelledby="provider-readiness-title"
    >
      <header className="provider-readiness__header">
        <span className="provider-readiness__icon"><Icon name="gauge" /></span>
        <div>
          <h2 id="provider-readiness-title">Provider readiness</h2>
          <p>Sanitized summary for your user-configured local model.</p>
        </div>
        <div className="provider-readiness__badges">
          <Badge label={providerReadinessLabel(readiness.overallReadiness)} tone={readinessTone(readiness.overallReadiness)} />
          <Badge label="LOCAL UNTRUSTED" tone="amber" />
        </div>
      </header>

      <div className="provider-readiness__summary-row" aria-label="Readiness overview">
        <Badge label={readiness.configDetected ? "Config detected" : "Not configured"} tone={readiness.configDetected ? "green" : "amber"} />
        <Badge label={readiness.chatSandboxAvailable ? "Sandbox ready" : "Sandbox locked"} tone={readiness.chatSandboxAvailable ? "cyan" : "amber"} />
        <Badge label="Image execution off" tone="neutral" />
      </div>

      <div className="provider-readiness__diagnosis" data-testid="provider-readiness-diagnosis">
        <Icon name={readiness.overallReadiness === "error" ? "triangle-alert" : "activity"} />
        <span>
          <b>{currentDiagnosis.title}</b>
          <small>{currentDiagnosis.detail}</small>
        </span>
      </div>

      <details className="settings-disclosure provider-readiness__checklist">
        <summary>Readiness checklist</summary>
        <ol className="provider-readiness__lifecycle" aria-label="Private provider readiness lifecycle">
          {lifecycle.map((step, index) => (
            <li key={step.id} className={step.complete ? "is-complete" : "is-pending"}>
              <span className="provider-readiness__step">{index + 1}</span>
              <span>
                <b>{step.label}</b>
                <small>{step.detail}</small>
              </span>
              <strong>{step.value}</strong>
            </li>
          ))}
        </ol>
      </details>

      <footer className="provider-readiness__actions">
        <Button
          label={desktop ? "Refresh provider status" : "Desktop app required"}
          iconName="activity"
          variant="secondary"
          disabled={!desktop || loading}
          onClick={onRefreshStatus}
        />
      </footer>
    </section>
  );
}
