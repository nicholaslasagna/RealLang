import { isDesktopRuntime } from "../bridge";
import {
  PRIVATE_LOCAL_MODEL_PROFILE,
  providerConfigStatusLabel,
  trustLevelLabel
} from "../providers";
import type { ProviderConfigStatus } from "../providers";
import { useWorkbenchStore } from "../state/workbench-store";
import { Badge, Button, Icon } from "./primitives";

function resolveStatus(desktop: boolean, configured: boolean): ProviderConfigStatus {
  if (!desktop) return "unavailable";
  return configured ? "configured_locally" : "not_configured";
}

export function PrivateLocalModelPanel() {
  const profile = PRIVATE_LOCAL_MODEL_PROFILE;
  const desktop = isDesktopRuntime();
  const session = useWorkbenchStore((s) => s.privateLocalModel);
  const setEndpoint = useWorkbenchStore((s) => s.setPrivateLocalEndpoint);
  const setModelLabel = useWorkbenchStore((s) => s.setPrivateLocalModelLabel);
  const markConfigured = useWorkbenchStore((s) => s.markPrivateLocalConfigured);
  const clearSession = useWorkbenchStore((s) => s.clearPrivateLocalModelSession);

  const status = resolveStatus(desktop, session.configured);
  const displayedModel =
    session.modelLabel.trim() || (session.configured ? profile.modelNamePlaceholder : profile.modelNamePlaceholder);

  return (
    <div className="private-local-model" data-testid="private-local-model-panel">
      <div className="private-local-model__summary">
        <Badge label={profile.displayName.toUpperCase()} tone="cyan" />
        <Badge label={trustLevelLabel(profile.trustLevel)} tone="amber" />
        <Badge label={providerConfigStatusLabel(status).toUpperCase()} tone={status === "configured_locally" ? "green" : "amber"} />
      </div>
      <p className="private-local-model__intro">
        Connect RealForge to a privately served OpenAI-compatible model on localhost. Model identity is stored in
        gitignored local config (for example <code>.realforge.local.toml</code>), not in this public repository.
        Provider output remains <strong>untrusted</strong> until validated.
      </p>
      <div className="private-local-model__grid">
        <div className="private-local-model__row">
          <span>
            <b>Provider type</b>
            <small>OpenAI-compatible local server</small>
          </span>
          <code>{profile.providerKind}</code>
        </div>
        <div className="private-local-model__row">
          <span>
            <b>Display name</b>
            <small>Public-safe label only</small>
          </span>
          <code>{profile.displayName}</code>
        </div>
        <div className="private-local-model__row">
          <span>
            <b>Endpoint</b>
            <small>Session scaffold — copy to local config for CLI use</small>
          </span>
          {desktop ? (
            <input
              className="private-local-model__input"
              type="url"
              value={session.endpoint}
              placeholder={profile.defaultBaseUrl ?? "http://localhost:8000/v1"}
              aria-label="Local OpenAI-compatible endpoint"
              onChange={(event) => setEndpoint(event.target.value)}
            />
          ) : (
            <code>{profile.defaultBaseUrl}</code>
          )}
        </div>
        <div className="private-local-model__row">
          <span>
            <b>Model name</b>
            <small>Shown only when you enter it in this session</small>
          </span>
          {desktop ? (
            <input
              className="private-local-model__input"
              type="text"
              value={session.modelLabel}
              placeholder={profile.modelNamePlaceholder}
              aria-label="Local model name"
              onChange={(event) => setModelLabel(event.target.value)}
            />
          ) : (
            <code>{profile.modelNamePlaceholder}</code>
          )}
        </div>
        <div className="private-local-model__row">
          <span>
            <b>Active model label</b>
            <small>Runtime session display</small>
          </span>
          <code>{displayedModel}</code>
        </div>
        <div className="private-local-model__row">
          <span>
            <b>Repository visibility</b>
            <small>Private identity never committed</small>
          </span>
          <Badge label={profile.storesPrivateIdentityInRepo ? "STORED" : "NOT IN REPO"} tone="green" />
        </div>
      </div>
      <div className="private-local-model__notes">
        <p className="eyebrow">LOCAL CONFIG</p>
        <ul>
          <li>
            <Icon name="file-text" />
            Copy <code>.realforge.toml.example</code> to <code>.realforge.local.toml</code> (gitignored).
          </li>
          <li>
            <Icon name="shield-check" />
            Do not commit API keys, weights, private prompts, or model paths.
          </li>
          <li>
            <Icon name="wifi-off" />
            Workbench does not call the endpoint from the browser — RealForge CLI uses local config when wired.
          </li>
        </ul>
      </div>
      <footer className="private-local-model__footer">
        {desktop ? (
          <>
            <Button
              label="Mark configured locally"
              iconName="check"
              variant="primary"
              disabled={!session.endpoint.trim()}
              onClick={() => markConfigured()}
            />
            <Button
              label="Clear session"
              iconName="x"
              variant="secondary"
              onClick={() => clearSession()}
            />
          </>
        ) : (
          <span className="private-local-model__hint">Desktop shell required for session configuration scaffold</span>
        )}
        <span className="private-local-model__hint">No network probe · no endpoint test from UI</span>
      </footer>
    </div>
  );
}
