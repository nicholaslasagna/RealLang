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

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

function enabledLabel(value: boolean): string {
  return value ? "ON" : "OFF";
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

  const disconnected = [
    ["Workspace context", readiness.workspaceContextEnabled],
    ["File access", readiness.fileAccessEnabled],
    ["Tools", readiness.toolsEnabled],
    ["Shell", readiness.shellEnabled],
    ["Memory", readiness.memoryEnabled],
    ["Persistence", readiness.persistenceEnabled],
    ["Image generation", readiness.imageGenerationEnabled]
  ] as const;

  return (
    <section
      className="provider-readiness"
      data-testid="provider-readiness-dashboard"
      aria-labelledby="provider-readiness-title"
    >
      <header className="provider-readiness__header">
        <span className="provider-readiness__icon"><Icon name="gauge" /></span>
        <div>
          <p className="eyebrow">PRIVATE PROVIDER LIFECYCLE</p>
          <h2 id="provider-readiness-title">Provider Readiness</h2>
          <p>
            Sanitized local readiness only. Provider output remains untrusted, and no workspace, files, tools, or memory are connected.
          </p>
        </div>
        <div className="provider-readiness__badges">
          <Badge label={providerReadinessLabel(readiness.overallReadiness).toUpperCase()} tone={readinessTone(readiness.overallReadiness)} />
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

      <div className="provider-readiness__body">
        <section aria-labelledby="provider-readiness-config-title">
          <h3 id="provider-readiness-config-title">Sanitized configuration</h3>
          <dl className="provider-readiness__metrics">
            <div><dt>Config detected</dt><dd>{yesNo(readiness.configDetected)}</dd></div>
            <div><dt>Endpoint configured</dt><dd>{yesNo(readiness.endpointConfigured)}</dd></div>
            <div><dt>Model configured</dt><dd>{yesNo(readiness.modelConfigured)}</dd></div>
            <div><dt>API key configured</dt><dd>{yesNo(readiness.apiKeyConfigured)}</dd></div>
            <div><dt>Smoke session</dt><dd>{smokeStatusLabel(readiness.smokeLastStatus)}</dd></div>
            <div><dt>Chat limit</dt><dd>{readiness.chatSandboxLimits.maxPromptChars.toLocaleString()} CHARS</dd></div>
          </dl>
        </section>

        <section aria-labelledby="provider-readiness-boundary-title">
          <h3 id="provider-readiness-boundary-title">Disconnected by design</h3>
          <div className="provider-readiness__boundaries">
            {disconnected.map(([label, enabled]) => (
              <span key={label}>
                <Icon name={enabled ? "circle-check" : "lock-keyhole"} />
                <b>{label}</b>
                <small>{enabledLabel(enabled)}</small>
              </span>
            ))}
          </div>
        </section>
      </div>

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
