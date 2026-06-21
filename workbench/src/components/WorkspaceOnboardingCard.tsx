import { useCallback, useEffect, useState } from "react";
import {
  checkBridgeHealth,
  clearSavedWorkspace,
  isDesktopRuntime,
  platformDisplayName,
  selectWorkspaceDirectory,
  workspaceStatusLabel,
  workspaceStatusTone
} from "../bridge";
import type { BridgeHealth } from "../bridge";
import { useWorkbenchStore } from "../state/workbench-store";
import { Badge, Button, Icon } from "./primitives";

export function WorkspaceOnboardingCard() {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = isDesktopRuntime();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await checkBridgeHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!health) return null;

  const { resolution } = health;
  const savedPathMissing = resolution.status === "saved_path_missing";

  if (desktop && health.healthy) {
    return (
      <article className="workspace-onboarding workspace-onboarding--ready" data-testid="workspace-onboarding">
        <header>
          <Icon name="circle-check" />
          <div>
            <p className="eyebrow">DESKTOP WORKSPACE</p>
            <h2>Workspace ready</h2>
          </div>
          <Badge label="READY" tone="green" />
        </header>
        <p className="workspace-onboarding__lead">
          Your RealForge repository is connected. The read-only CLI bridge is healthy and reports can be loaded from the
          Reports screen.
        </p>
        <dl className="workspace-onboarding__grid">
          <div>
            <dt>Workspace</dt>
            <dd>{resolution.repoRoot}</dd>
          </div>
          <div>
            <dt>Python</dt>
            <dd>{resolution.pythonPath}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{resolution.discoveryMethod}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{platformDisplayName(resolution.platform)}</dd>
          </div>
        </dl>
      </article>
    );
  }

  const statusTone = workspaceStatusTone(resolution.status);
  const title = savedPathMissing
    ? "Saved workspace moved or deleted"
    : desktop
      ? "Set up your RealForge repository"
      : "Desktop workspace preview";

  return (
    <article
      className={`workspace-onboarding${savedPathMissing ? " workspace-onboarding--invalid" : ""}`}
      data-testid="workspace-onboarding"
    >
      <header>
        <Icon name={savedPathMissing ? "triangle-alert" : "folder"} />
        <div>
          <p className="eyebrow">DESKTOP WORKSPACE</p>
          <h2>{title}</h2>
        </div>
        <Badge label={workspaceStatusLabel(resolution.status)} tone={statusTone} />
      </header>
      <p className="workspace-onboarding__lead">
        {savedPathMissing
          ? "The repository path saved in your app config no longer exists. Choose a new folder or clear the saved workspace to use environment discovery."
          : desktop
            ? "Select your repository once — Workbench saves it in the app config directory and restores it on every launch."
            : "Workspace resolution and CLI health checks run in the desktop shell. Web preview stays metadata-only."}
      </p>
      <dl className="workspace-onboarding__grid">
        <div>
          <dt>Workspace</dt>
          <dd>{resolution.repoRoot ?? "Not configured"}</dd>
        </div>
        <div>
          <dt>Python</dt>
          <dd>{resolution.pythonPath ?? "Not found"}</dd>
        </div>
        <div>
          <dt>Bridge</dt>
          <dd>Read-only</dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd>{platformDisplayName(resolution.platform)}</dd>
        </div>
      </dl>
      {resolution.errors.length > 0 ? (
        <ul className="workspace-onboarding__issues">
          {resolution.errors.map((item) => (
            <li key={item}>
              <Icon name="triangle-alert" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {health.nextActions.length > 0 ? (
        <div className="workspace-onboarding__actions-list">
          <p className="eyebrow">NEXT STEPS</p>
          <ol>
            {health.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {error ? (
        <p className="workspace-onboarding__error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="workspace-onboarding__footer">
        {desktop ? (
          <>
            <Button
              label="Choose new workspace"
              iconName="folder"
              variant="primary"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setError(null);
                selectWorkspaceDirectory()
                  .then(() => refresh())
                  .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setLoading(false));
              }}
            />
            {savedPathMissing ? (
              <Button
                label="Clear saved workspace"
                iconName="file-x"
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  clearSavedWorkspace()
                    .then(() => refresh())
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                    .finally(() => setLoading(false));
                }}
              />
            ) : (
              <Button
                label={loading ? "Checking…" : "Retry health check"}
                iconName="activity"
                variant="secondary"
                disabled={loading}
                onClick={() => void refresh()}
              />
            )}
          </>
        ) : (
          <Button
            label="Open Settings → Workspace"
            iconName="settings"
            variant="secondary"
            onClick={() => {
              setSettingsSection("workspace");
              navigate("settings");
            }}
          />
        )}
      </footer>
      <p className="workspace-onboarding__note">
        <Icon name="shield-check" />
        Selection is validated and persisted under the app config directory — your repository is never modified.
      </p>
    </article>
  );
}
