import { useCallback, useEffect, useState } from "react";
import {
  checkBridgeHealth,
  clearSavedWorkspace,
  discoveryMethodLabel,
  getSavedWorkspace,
  getWorkspacePaths,
  isDesktopRuntime,
  platformDisplayName,
  selectWorkspaceDirectory,
  workspaceStatusLabel,
  workspaceStatusTone
} from "../bridge";
import type { BridgeHealth, SavedWorkspace } from "../bridge";
import { Badge, Button, Icon } from "./primitives";

export function WorkspacePanel() {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [saved, setSaved] = useState<SavedWorkspace | null>(null);
  const [configFile, setConfigFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = isDesktopRuntime();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextHealth, nextSaved, paths] = await Promise.all([
        checkBridgeHealth(),
        getSavedWorkspace(),
        getWorkspacePaths()
      ]);
      setHealth(nextHealth);
      setSaved(nextSaved);
      setConfigFile(paths.configFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!health) {
    return (
      <div className="workspace-panel workspace-panel--loading" data-testid="workspace-panel">
        <Icon name="activity" />
        <span>Loading workspace status…</span>
      </div>
    );
  }

  const { resolution } = health;
  const savedPathMissing = resolution.status === "saved_path_missing";
  const cliLabel = health.probeOk
    ? "Available"
    : health.probeAttempted
      ? "Unavailable"
      : resolution.pythonPath
        ? "Not probed"
        : "Unavailable";
  const cliTone = health.probeOk ? "green" : "amber";

  return (
    <div className="workspace-panel" data-testid="workspace-panel">
      <div className="workspace-panel__summary">
        <Badge label={workspaceStatusLabel(resolution.status)} tone={workspaceStatusTone(resolution.status)} />
        <Badge label="READ ONLY" tone="green" />
        {health.healthy ? <Badge label="BRIDGE READY" tone="green" /> : <Badge label="NEEDS SETUP" tone="amber" />}
        {saved ? <Badge label="PERSISTED" tone="cyan" /> : null}
      </div>
      <p className="workspace-panel__intro">
        {savedPathMissing
          ? "Your saved workspace path no longer exists on disk. Choose a new repository folder or clear the saved workspace to fall back to environment discovery."
          : desktop
            ? "Your workspace selection is saved in the app config directory and restored on launch. Priority: persisted → session picker → REALFORGE_REPO_ROOT → walk-up."
            : "Web preview shows workspace metadata only. Install the desktop app to connect to a local repository."}
      </p>
      <div className="workspace-panel__grid">
        <div className="workspace-panel__row">
          <span>
            <b>Repository root</b>
            <small>workbench/ and src/realforge/ required</small>
          </span>
          <code>{resolution.repoRoot ?? "—"}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Active source</b>
            <small>How this path was chosen</small>
          </span>
          <code>{discoveryMethodLabel(resolution.discoveryMethod)}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Persisted workspace</b>
            <small>Saved across app restarts</small>
          </span>
          <code>{saved?.repoRoot ?? "—"}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Config file</b>
            <small>App config directory only</small>
          </span>
          <code>{configFile ?? "—"}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Python interpreter</b>
            <small>.venv preferred</small>
          </span>
          <code>{resolution.pythonPath ?? "—"}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Last healthy check</b>
            <small>Recorded after bridge health probe</small>
          </span>
          <code>{saved?.lastHealthOkAt ?? "—"}</code>
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>RealForge CLI</b>
            <small>Probe: realforge capabilities --json</small>
          </span>
          <Badge label={cliLabel} tone={cliTone} />
        </div>
        <div className="workspace-panel__row">
          <span>
            <b>Platform</b>
            <small>Desktop runtime</small>
          </span>
          <code>
            {platformDisplayName(resolution.platform)}
            {resolution.arch !== "unknown" ? ` · ${resolution.arch}` : ""}
          </code>
        </div>
        <div className="workspace-panel__row workspace-panel__row--sources">
          <span>
            <b>Supported read-only sources</b>
            <small>Fixed argv allowlist</small>
          </span>
          <div className="workspace-panel__source-badges">
            {resolution.supportedSources.map((source) => (
              <Badge key={source.id} label={source.id} tone="cyan" />
            ))}
          </div>
        </div>
      </div>
      {(resolution.errors.length > 0 || resolution.warnings.length > 0) && (
        <div className="workspace-panel__messages">
          {resolution.errors.map((item) => (
            <p key={item} className="workspace-panel__message workspace-panel__message--error">
              <Icon name="triangle-alert" />
              {item}
            </p>
          ))}
          {resolution.warnings.map((item) => (
            <p key={item} className="workspace-panel__message workspace-panel__message--warn">
              <Icon name="shield-check" />
              {item}
            </p>
          ))}
        </div>
      )}
      {health.nextActions.length > 0 ? (
        <div className="workspace-panel__next">
          <p className="eyebrow">RECOMMENDED NEXT ACTIONS</p>
          <ol>
            {health.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {error ? (
        <p className="workspace-panel__message workspace-panel__message--error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="workspace-panel__footer">
        {desktop ? (
          <>
            <Button
              label={savedPathMissing ? "Choose new workspace" : "Select repository folder"}
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
            <Button
              label="Clear saved workspace"
              iconName="file-x"
              variant="secondary"
              disabled={loading || !saved}
              onClick={() => {
                setLoading(true);
                setError(null);
                clearSavedWorkspace()
                  .then(() => refresh())
                  .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setLoading(false));
              }}
            />
            <Button
              label={loading ? "Checking…" : "Retry health check"}
              iconName="activity"
              variant="secondary"
              disabled={loading}
              onClick={() => void refresh()}
            />
          </>
        ) : null}
        <p className="workspace-panel__persist-note">
          <Icon name="hard-drive" />
          Workspace config is stored only under the Tauri app config directory — never inside your repository.
        </p>
      </footer>
    </div>
  );
}
