import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isDesktopRuntime, loadProviderStatus } from "../bridge";
import type { ProviderStatus } from "../bridge";
import {
  PRIVATE_LOCAL_IMAGE_MODEL_PROFILE,
  PRIVATE_LOCAL_MODEL_PROFILE,
  providerConfigStatusLabel,
  trustLevelLabel
} from "../providers";
import type { ProviderConfigStatus } from "../providers";
import { Badge, Button, Icon } from "./primitives";
import { PrivateChatSandboxCard } from "./PrivateChatSandboxCard";
import { ProviderSmokeCard } from "./ProviderSmokeCard";

const HOME_CONFIG_LABEL = "~/.realforge.local.toml";
const CLI_STATUS_HINT = "realforge provider status --json";
const CLI_SMOKE_HINT = "realforge provider smoke --json";

function resolveStatus(desktop: boolean, configured: boolean): ProviderConfigStatus {
  if (!desktop) return "unavailable";
  if (configured) return "configured_locally";
  return "not_configured";
}

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

function sourceLabel(source: string | undefined): string {
  if (source === "home_private") return "Home private config";
  if (source === "defaults") return "Defaults";
  if (source === "unavailable") return "Unavailable in web preview";
  return source ?? "—";
}

function StatusRow({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="private-local-model__row">
      <span>
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </div>
  );
}

export function PrivateLocalModelPanel() {
  const profile = PRIVATE_LOCAL_MODEL_PROFILE;
  const imageProfile = PRIVATE_LOCAL_IMAGE_MODEL_PROFILE;
  const desktop = isDesktopRuntime();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(desktop);

  const refreshStatus = useCallback(async () => {
    if (!desktop) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatus(await loadProviderStatus());
    setLoading(false);
  }, [desktop]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const chatStatus = resolveStatus(desktop, status?.configured ?? false);

  return (
    <div className="private-local-model" data-testid="private-local-model-panel">
      <div className="private-local-model__summary">
        <Badge label={profile.displayName.toUpperCase()} tone="cyan" />
        <Badge label={trustLevelLabel(profile.trustLevel)} tone="amber" />
        <Badge
          label={providerConfigStatusLabel(chatStatus).toUpperCase()}
          tone={chatStatus === "configured_locally" ? "green" : "amber"}
        />
      </div>
      <p className="private-local-model__intro">
        Sanitized local provider metadata only. Model identity lives in{" "}
        <code>{HOME_CONFIG_LABEL}</code> (gitignored). Provider output remains <strong>untrusted</strong>.
      </p>
      {loading ? (
        <p className="private-local-model__hint" role="status">
          Loading provider status…
        </p>
      ) : null}
      <div className="private-local-model__grid" data-testid="provider-status-grid">
        <StatusRow label="Status ok" hint="Structured home config read">
          <Badge label={yesNo(status?.ok ?? false)} tone={status?.ok ? "green" : "amber"} />
        </StatusRow>
        <StatusRow label="Configured" hint="Chat provider ready">
          <Badge label={yesNo(status?.configured ?? false)} tone={status?.configured ? "green" : "amber"} />
        </StatusRow>
        <StatusRow label="Source" hint="Fixed home config only">
          <code>{sourceLabel(status?.source)}</code>
        </StatusRow>
        <StatusRow label="Provider kind">
          <code>{status?.provider_kind ?? profile.providerKind}</code>
        </StatusRow>
        <StatusRow label="Trust">
          <code>{status?.trust ?? "local_untrusted"}</code>
        </StatusRow>
        <StatusRow label="Endpoint configured">
          <Badge
            label={yesNo(status?.endpoint_configured ?? false)}
            tone={status?.endpoint_configured ? "green" : "amber"}
          />
        </StatusRow>
        <StatusRow label="Endpoint host" hint="Local host/port only">
          <code>{status?.endpoint_host ?? "(not configured)"}</code>
        </StatusRow>
        <StatusRow label="Model configured" hint="Boolean only — never exact name">
          <Badge
            label={yesNo(status?.model_configured ?? false)}
            tone={status?.model_configured ? "green" : "amber"}
          />
        </StatusRow>
        <StatusRow label="API key configured" hint="Boolean only — never value">
          <Badge
            label={yesNo(status?.api_key_configured ?? false)}
            tone={status?.api_key_configured ? "green" : "amber"}
          />
        </StatusRow>
        <StatusRow label="Local config file" hint="Fixed home path only">
          <code>{HOME_CONFIG_LABEL}</code>
        </StatusRow>
        <StatusRow label="Repository visibility">
          <Badge label="NOT IN REPO" tone="green" />
        </StatusRow>
      </div>
      {status?.warnings?.length ? (
        <div className="private-local-model__notes" data-testid="provider-status-warnings">
          <p className="eyebrow">WARNINGS</p>
          <ul>
            {status.warnings.map((warning) => (
              <li key={warning}>
                <Icon name="triangle-alert" />
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {status?.errors?.length ? (
        <div className="private-local-model__notes" data-testid="provider-status-errors">
          <p className="eyebrow">ERRORS</p>
          <ul>
            {status.errors.map((entry) => (
              <li key={`${entry.code}:${entry.message}`}>
                <Icon name="triangle-alert" />
                [{entry.code}] {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="private-local-model__notes">
        <p className="eyebrow">CLI PARITY</p>
        <ul>
          <li>
            <Icon name="terminal" />
            Run <code>{CLI_STATUS_HINT}</code> in a terminal for full precedence (repo/env/home).
          </li>
          <li>
            <Icon name="activity" />
            Run <code>{CLI_SMOKE_HINT}</code> in a terminal to verify local runtime reachability.
          </li>
          <li>
            <Icon name="wifi-off" />
            Workbench can run only the separately approved fixed smoke check; it has no arbitrary provider command path.
          </li>
          <li>
            <Icon name="shield-check" />
            Do not commit API keys, weights, private prompts, or model paths.
          </li>
        </ul>
      </div>
      <footer className="private-local-model__footer">
        {desktop ? (
          <Button
            label="Refresh provider status"
            iconName="activity"
            variant="secondary"
            disabled={loading}
            onClick={() => void refreshStatus()}
          />
        ) : (
          <span className="private-local-model__hint">Desktop shell required for provider status</span>
        )}
        <span className="private-local-model__hint">Secrets and model names are never returned over IPC</span>
      </footer>
      <ProviderSmokeCard />
      <PrivateChatSandboxCard />
      <section
        className="private-local-model private-local-model--image"
        data-testid="private-local-image-model-panel"
        aria-label="Private local image model"
      >
        <div className="private-local-model__summary">
          <Badge label={imageProfile.displayName.toUpperCase()} tone="cyan" />
          <Badge label="FUTURE" tone="amber" />
          <Badge label={trustLevelLabel(imageProfile.trustLevel)} tone="amber" />
          <Badge
            label={
              status?.image_provider_configured
                ? providerConfigStatusLabel("configured_locally").toUpperCase()
                : providerConfigStatusLabel(resolveStatus(desktop, false)).toUpperCase()
            }
            tone={status?.image_provider_configured ? "green" : "amber"}
          />
        </div>
        <p className="private-local-model__intro">
          Optional local image provider metadata from <code>[image_provider]</code>. Execution remains disabled.
        </p>
        <div className="private-local-model__grid">
          <StatusRow label="Image provider configured">
            <Badge
              label={yesNo(status?.image_provider_configured ?? false)}
              tone={status?.image_provider_configured ? "green" : "amber"}
            />
          </StatusRow>
          <StatusRow label="Image execution enabled">
            <Badge
              label={status?.image_provider_execution_enabled ? "ENABLED" : "DISABLED"}
              tone="amber"
            />
          </StatusRow>
          <StatusRow label="Provider type">
            <code>{status?.image_provider_kind ?? imageProfile.providerKind}</code>
          </StatusRow>
          <StatusRow label="Endpoint host" hint="Safe local host/port only; never probed">
            <code>{status?.image_endpoint_host ?? "(not configured)"}</code>
          </StatusRow>
          <StatusRow label="Trust">
            <code>{status?.trust ?? "local_untrusted"}</code>
          </StatusRow>
        </div>
      </section>
    </div>
  );
}
