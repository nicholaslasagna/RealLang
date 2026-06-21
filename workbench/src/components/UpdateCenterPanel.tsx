import { useCallback, useEffect, useState } from "react";
import {
  checkForUpdate,
  getUpdateStatus,
  isDesktopRuntime,
  platformDisplayName,
  updateStatusLabel
} from "../bridge";
import type { UpdateCheckResult, UpdateStatus } from "../bridge";
import { ReleaseReadinessPanel } from "../features/updates/ReleaseReadinessPanel";
import { Badge, Button, Icon } from "./primitives";

function channelLabel(channel: string): string {
  if (channel === "local_dev") return "Local dev";
  if (channel === "preview") return "Preview";
  return "Stable";
}

export function UpdateCenterPanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const desktop = isDesktopRuntime();

  const refresh = useCallback(async () => {
    setStatus(await getUpdateStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status) {
    return (
      <div className="update-center update-center--loading" data-testid="update-center">
        <Icon name="activity" />
        <span>Loading update status…</span>
      </div>
    );
  }

  const { configuration } = status;
  const canCheck = desktop && status.configured && status.state !== "checking";
  const checkDisabled = !desktop || !status.configured || checking;
  const installDisabled = !desktop || !configuration.installAllowed;

  return (
    <div className="update-center" data-testid="update-center">
      <div className="update-center__summary">
        <Badge label={updateStatusLabel(status.state)} tone={status.configured ? "cyan" : "amber"} />
        <Badge label={channelLabel(status.channel).toUpperCase()} tone="neutral" />
        <Badge label="SIGNED ONLY" tone="green" />
        {configuration.signingRequired ? <Badge label="SIGNING REQUIRED" tone="green" /> : null}
      </div>
      <p className="update-center__intro">
        {desktop
          ? "Workbench updates require signed release packages and a configured update endpoint. This build never downloads or installs unsigned updates."
          : "App updates are managed by the desktop shell. Web preview cannot check for or install updates."}
      </p>
      <div className="update-center__grid">
        <div className="update-center__row">
          <span>
            <b>Current version</b>
            <small>Running application build</small>
          </span>
          <code>{status.currentVersion}</code>
        </div>
        <div className="update-center__row">
          <span>
            <b>Platform</b>
            <small>Desktop runtime</small>
          </span>
          <code>
            {platformDisplayName(status.platform)}
            {status.arch !== "unknown" ? ` · ${status.arch}` : ""}
          </code>
        </div>
        <div className="update-center__row">
          <span>
            <b>Update channel</b>
            <small>Release track</small>
          </span>
          <code>{channelLabel(status.channel)}</code>
        </div>
        <div className="update-center__row">
          <span>
            <b>Updater configured</b>
            <small>Endpoint + public key required</small>
          </span>
          <Badge label={status.configured ? "CONFIGURED" : "NOT CONFIGURED"} tone={status.configured ? "green" : "amber"} />
        </div>
        <div className="update-center__row">
          <span>
            <b>Public key</b>
            <small>Minisign public key for signature verification</small>
          </span>
          <Badge
            label={configuration.publicKeyConfigured ? "CONFIGURED" : "MISSING"}
            tone={configuration.publicKeyConfigured ? "green" : "amber"}
          />
        </div>
        <div className="update-center__row">
          <span>
            <b>Release endpoint</b>
            <small>Signed update metadata URL</small>
          </span>
          <Badge
            label={configuration.endpointConfigured ? "CONFIGURED" : "MISSING"}
            tone={configuration.endpointConfigured ? "green" : "amber"}
          />
        </div>
        {configuration.endpointUrl ? (
          <div className="update-center__row">
            <span>
              <b>Endpoint URL</b>
              <small>Detected from build/runtime configuration</small>
            </span>
            <code>{configuration.endpointUrl}</code>
          </div>
        ) : null}
        <div className="update-center__row">
          <span>
            <b>Install allowed</b>
            <small>Only after verified signed update</small>
          </span>
          <Badge label={configuration.installAllowed ? "YES" : "NO"} tone={configuration.installAllowed ? "green" : "amber"} />
        </div>
      </div>
      <p className="update-center__message">{status.message}</p>
      {configuration.disabledReason && !status.configured ? (
        <p className="update-center__check-result update-center__check-result--error" role="status">
          {configuration.disabledReason}
        </p>
      ) : null}
      <div className="update-center__notes">
        <p className="eyebrow">SAFETY</p>
        <ul>
          {status.safetyNotes.map((note) => (
            <li key={note}>
              <Icon name="shield-check" />
              {note}
            </li>
          ))}
        </ul>
      </div>
      <ReleaseReadinessPanel
        currentVersion={status.currentVersion}
        publicKeyConfigured={configuration.publicKeyConfigured}
        endpointConfigured={configuration.endpointConfigured}
      />
      <article className="update-center__release-notes">
        <p className="eyebrow">RELEASE NOTES</p>
        <p>{status.releaseNotes ?? "Release notes will appear here after signed updates are configured and checked."}</p>
      </article>
      {checkResult ? (
        <p
          className={`update-center__check-result ${checkResult.ok ? "" : "update-center__check-result--error"}`}
          role="status"
        >
          {checkResult.message}
        </p>
      ) : null}
      <footer className="update-center__footer">
        <Button
          label={checking ? "Checking…" : "Check for Updates"}
          iconName="package"
          variant="primary"
          disabled={checkDisabled}
          onClick={() => {
            if (!canCheck) return;
            setChecking(true);
            setCheckResult(null);
            checkForUpdate()
              .then((result) => {
                setCheckResult(result);
                return refresh();
              })
              .finally(() => setChecking(false));
          }}
        />
        <Button
          label="Install and Restart"
          iconName="download"
          variant="secondary"
          disabled={installDisabled}
          data-testid="update-install-button"
          onClick={() => undefined}
        />
        {!desktop ? (
          <span className="update-center__hint">Desktop shell required</span>
        ) : !status.configured ? (
          <span className="update-center__hint">Updater not configured for this build</span>
        ) : !configuration.installAllowed ? (
          <span className="update-center__hint">Install unavailable until a verified signed update exists</span>
        ) : null}
      </footer>
    </div>
  );
}
