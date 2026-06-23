import type { ProviderStatus } from "../bridge";
import {
  PRIVATE_LOCAL_MODEL_PROFILE,
  providerConfigStatusLabel,
  trustLevelLabel
} from "../providers";
import { Badge, Icon } from "./primitives";

const CLI_STATUS_HINT = "realforge provider status --json";

interface ProviderStatusSummaryProps {
  status: ProviderStatus | null;
  loading: boolean;
  desktop: boolean;
}

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

function sourceLabel(source: string | undefined): string {
  if (source === "home_private") return "Private home config";
  if (source === "defaults") return "Safe defaults";
  if (source === "unavailable") return "Desktop only";
  return "Unavailable";
}

function providerKindLabel(value: string | null | undefined): string {
  if (value === "openai_compatible_local") return "OpenAI-compatible local";
  if (value === "mock") return "Mock / default";
  return "Unavailable";
}

function safeEndpointLabel(value: string | null | undefined): string {
  if (!value) return "NOT CONFIGURED";
  const lower = value.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("[::1]")) {
    return "loopback host";
  }
  return "endpoint host configured";
}

export function ProviderStatusSummary({ status, loading, desktop }: ProviderStatusSummaryProps) {
  const profile = PRIVATE_LOCAL_MODEL_PROFILE;
  const configured = Boolean(status?.configured);
  const configStatus = !desktop ? "unavailable" : configured ? "configured_locally" : "not_configured";

  return (
    <section
      className="provider-settings-section provider-status-summary"
      data-testid="provider-status-summary"
      aria-labelledby="chat-provider-config-title"
    >
      <header className="provider-settings-section__heading">
        <div className="provider-section-title">
          <span><Icon name="server" /></span>
          <div>
            <p className="eyebrow">CHAT PROVIDER</p>
            <h2 id="chat-provider-config-title">Private Local Model</h2>
            <p>Sanitized connection metadata. Exact identity and secrets never cross the desktop bridge.</p>
          </div>
        </div>
        <div className="provider-chip-row">
          <Badge label={providerConfigStatusLabel(configStatus).toUpperCase()} tone={configured ? "green" : "amber"} />
          <Badge label={trustLevelLabel(profile.trustLevel)} tone="amber" />
        </div>
      </header>

      {!desktop ? (
        <div className="provider-console-state" role="status">
          <Icon name="lock-keyhole" />
          <span>
            <b>Desktop status unavailable</b>
            <small>Web preview never reads private provider configuration or executes provider checks.</small>
          </span>
        </div>
      ) : loading ? (
        <div className="provider-console-state" role="status">
          <Icon name="activity" />
          <span>
            <b>Loading sanitized status</b>
            <small>Only public-safe booleans and local endpoint host metadata will be displayed.</small>
          </span>
        </div>
      ) : null}

      <dl className="provider-status-summary__grid" data-testid="provider-status-grid">
        <div><dt>Provider state</dt><dd>{status?.ok && configured ? "READY" : "NOT READY"}</dd></div>
        <div><dt>Source</dt><dd>{sourceLabel(status?.source)}</dd></div>
        <div><dt>Provider kind</dt><dd>{providerKindLabel(status?.provider_kind)}</dd></div>
        <div><dt>Local endpoint</dt><dd>{safeEndpointLabel(status?.endpoint_host)}</dd></div>
        <div><dt>Model configured</dt><dd>{yesNo(status?.model_configured ?? false)}</dd></div>
        <div><dt>API key configured</dt><dd>{yesNo(status?.api_key_configured ?? false)}</dd></div>
      </dl>

      {status?.warnings?.length ? (
        <div className="provider-status-summary__messages" data-testid="provider-status-warnings">
          {status.warnings.map((warning) => (
            <p key={warning}><Icon name="triangle-alert" /><span><b>Warning</b>{warning}</span></p>
          ))}
        </div>
      ) : null}
      {status?.errors?.length ? (
        <div className="provider-status-summary__messages" data-testid="provider-status-errors">
          {status.errors.map((entry) => (
            <p key={`${entry.code}:${entry.message}`}><Icon name="triangle-alert" /><span><b>[{entry.code}]</b>{entry.message}</span></p>
          ))}
        </div>
      ) : null}

      <footer className="provider-status-summary__footer">
        <span><Icon name="terminal" /> Manual status: <code>{CLI_STATUS_HINT}</code></span>
        <small>Private identity, keys, prompts, paths, and model files are never displayed.</small>
      </footer>
    </section>
  );
}
