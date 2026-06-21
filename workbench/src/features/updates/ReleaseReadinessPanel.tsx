import {
  RELEASE_VALIDATION_COMMANDS,
  buildReleaseChecklist,
  releaseStatusTone,
  summarizeReleaseReadiness,
  type ReleaseChecklistItem
} from "../../data/release/release-readiness";
import { Badge, Icon } from "../../components/primitives";

const EXPECTED_VERSION = "0.16.0";

interface ReleaseReadinessPanelProps {
  currentVersion: string;
  publicKeyConfigured: boolean;
  endpointConfigured: boolean;
}

function platformTone(platform: ReleaseChecklistItem["platform"]): string {
  return platform === "all" ? "neutral" : "blue";
}

function trackLabel(track: string | null): string {
  if (track === "stable") return "STABLE-READY";
  if (track === "preview") return "PREVIEW-READY";
  if (track === "dev") return "DEV-READY";
  return "NOT DEV-READY";
}

export function ReleaseReadinessPanel({ currentVersion, publicKeyConfigured, endpointConfigured }: ReleaseReadinessPanelProps) {
  const items = buildReleaseChecklist({
    workbenchVersion: currentVersion,
    expectedVersion: EXPECTED_VERSION,
    updaterPublicKeyConfigured: publicKeyConfigured,
    updaterEndpointConfigured: endpointConfigured
  });
  const summary = summarizeReleaseReadiness(items);

  return (
    <article className="release-readiness" data-testid="update-release-checklist" aria-label="Release readiness checklist">
      <header className="release-readiness__head">
        <div>
          <p className="eyebrow">RELEASE READINESS CHECKLIST</p>
          <h3>Honest gates for a signed release</h3>
        </div>
        <Badge label={trackLabel(summary.highestReadyTrack)} tone={summary.readyForStable ? "green" : summary.readyForPreview ? "cyan" : summary.readyForDev ? "amber" : "violet"} />
      </header>

      <div className="release-readiness__counts">
        <span><b className="release-num--green">{summary.pass}</b> pass</span>
        <span><b className="release-num--amber">{summary.warn}</b> verify</span>
        <span><b className="release-num--violet">{summary.missing}</b> missing</span>
        <span><b className="release-num--cyan">{summary.deferred}</b> deferred</span>
      </div>

      <ul className="release-readiness__list">
        {items.map((item) => (
          <li key={item.id} className="release-item">
            <div className="release-item__head">
              <Badge label={item.status.toUpperCase()} tone={releaseStatusTone(item.status)} />
              <b>{item.label}</b>
              <span className="release-item__tags">
                <Badge label={item.platform === "all" ? "ALL" : item.platform.toUpperCase()} tone={platformTone(item.platform)} />
                <Badge label={item.requiredFor.toUpperCase()} tone="neutral" />
              </span>
            </div>
            <p className="release-item__details">{item.details}</p>
            {item.status !== "pass" ? (
              <p className="release-item__next">
                <Icon name="arrow-right" />
                {item.nextAction}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <section className="release-readiness__commands" aria-label="Release validation commands">
        <p className="eyebrow">VALIDATION COMMANDS · NOT RUN BY UI</p>
        <div className="release-commands">
          {RELEASE_VALIDATION_COMMANDS.map((command) => (
            <code key={command}>{command}</code>
          ))}
        </div>
        <p className="release-readiness__note">
          <Icon name="shield-check" />
          These gates are run by a human or CI before a release. The Workbench never runs them, downloads updates, or installs anything.
        </p>
      </section>

      <p className="release-readiness__keys">
        <Icon name="lock-keyhole" />
        No unsigned updates will be installed. Private signing keys are never stored in the app or repository — only the public key is referenced for verification.
      </p>
    </article>
  );
}
