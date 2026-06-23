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

export function ProviderReadinessDashboard({
  readiness,
  loading,
  desktop,
  onRefreshStatus
}: ProviderReadinessDashboardProps) {
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
      className="provider-readiness"
      data-testid="provider-readiness-dashboard"
      aria-labelledby="provider-readiness-title"
    >
      <header className="provider-readiness__header">
        <span className="provider-readiness__icon"><Icon name="gauge" /></span>
        <div>
          <h2 id="provider-readiness-title">Provider readiness</h2>
          <p>Local configuration, reachability, and bounded provider surfaces for this session.</p>
        </div>
        <div className="provider-readiness__badges">
          <Badge label={providerReadinessLabel(readiness.overallReadiness)} tone={readinessTone(readiness.overallReadiness)} />
          <Badge label="LOCAL UNTRUSTED" tone="amber" />
        </div>
      </header>

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

      <footer className="provider-readiness__actions">
        <div>
          <p className="eyebrow">NEXT SAFE ACTIONS</p>
          <span>No action adds workspace context, tools, persistence, or image execution.</span>
        </div>
        <Button
          label={desktop ? "Refresh provider status" : "Desktop app required"}
          iconName="activity"
          variant="secondary"
          disabled={!desktop || loading}
          onClick={onRefreshStatus}
        />
        <a href="#provider-smoke-title"><Icon name="activity" /> Run fixed smoke check</a>
        <a href="#private-chat-sandbox-title"><Icon name="cpu" /> Try private chat sandbox</a>
      </footer>
    </section>
  );
}
