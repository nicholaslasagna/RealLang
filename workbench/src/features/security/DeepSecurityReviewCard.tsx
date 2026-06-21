import { Badge, Icon } from "../../components/primitives";

interface ReviewArea {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

const REVIEW_AREAS: readonly ReviewArea[] = [
  { icon: "package", title: "Dependency audit", description: "npm / cargo / pip advisories with severity, patched version, and exposure." },
  { icon: "workflow", title: "Unsafe dependency path tracing", description: "Trace which crate or package pins a vulnerable transitive dependency." },
  { icon: "square-terminal", title: "Command / IPC audit", description: "Enumerate the desktop IPC surface and confirm no shell or write path exists." },
  { icon: "folder-git-2", title: "Path traversal review", description: "Verify workspace containment, canonicalization, and symlink rejection." },
  { icon: "git-pull-request-arrow", title: "Supply-chain review", description: "Lockfile integrity, allowlisted sources, and reproducible build inputs." },
  { icon: "shield-check", title: "Tauri permission review", description: "Capabilities, allowlist scope, and plugin permissions for the desktop shell." },
  { icon: "calendar-clock", title: "Update pipeline review", description: "Signed-update readiness, channel config, and install gating." },
  { icon: "lock-keyhole", title: "Approval bridge review", description: "Confirm the one fixed action stays approval-gated, no-write, and inert." },
  { icon: "file-text", title: "Threat model generation", description: "Structured threat models and rejected-input matrices per surface." }
];

export function DeepSecurityReviewCard() {
  return (
    <section className="deep-review-panel" aria-labelledby="deep-review-title">
      <header>
        <span className="deep-review-icon">
          <Icon name="scan-eye" />
        </span>
        <div>
          <p className="eyebrow">DEEP SECURITY REVIEW</p>
          <h2 id="deep-review-title">A structured surface, not an autonomous scanner</h2>
          <p>
            RealForge can map and plan a deep cybersecurity dive. For 0.13 this is a structured
            review surface and plan generator — it does not run scanners or change anything.
          </p>
        </div>
        <Badge label="PREVIEW" tone="blue" />
      </header>
      <div className="deep-review-grid">
        {REVIEW_AREAS.map((area) => (
          <article key={area.title} className="deep-review-area">
            <span>
              <Icon name={area.icon} />
            </span>
            <div>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
            </div>
            <Badge label="FUTURE" tone="neutral" />
          </article>
        ))}
      </div>
      <footer>
        <Icon name="shield-alert" />
        <span>
          Future scanners and fix pipelines will run only read-only, allowlisted, threat-modeled
          commands behind explicit approval gates. No autonomous remediation.
        </span>
      </footer>
    </section>
  );
}
