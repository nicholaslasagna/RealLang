import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";

const STAGE_ICONS = ["shield-check", "search", "git-pull-request-arrow", "flask-conical", "package", "eye", "user-round-check"];

export function UpdatesScreen() {
  const data = getWorkbenchData();
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const toggleStaffPreview = useWorkbenchStore((s) => s.toggleStaffPreview);
  const safePlaceholder = useWorkbenchStore((s) => s.safePlaceholder);

  if (!staffPreview) {
    return (
      <div className="screen updates-screen">
        <SectionHeading
          eyebrow="UPDATES · STAFF-ONLY CHANNEL"
          title="Locked by policy. Ready for review."
          description="Staff Off is the intentional default. Advanced improvement controls remain unavailable to normal users."
        />
        <section className="staff-lock">
          <span>
            <Icon name="lock-keyhole" />
          </span>
          <div>
            <p className="eyebrow">STAFF OFF · POLICY ENFORCED</p>
            <h2>The update channel is securely gated</h2>
            <p>You can inspect a visual preview of the review sequence. Previewing does not enable staff mode, execute a step, or change backend state.</p>
          </div>
          <Button label="Preview guarded flow" iconName="eye" variant="violet" onClick={toggleStaffPreview} />
        </section>
        <div className="safety-triptych">
          <article>
            <b>NO AUTO-APPLY</b>
            <span>Manual confirmation remains mandatory.</span>
          </article>
          <article>
            <b>NO AUTO-COMMIT</b>
            <span>Prototype actions never touch Git.</span>
          </article>
          <article>
            <b>APPROVAL REQUIRED</b>
            <span>Every destructive transition stays gated.</span>
          </article>
        </div>
        <section className="locked-flow-preview" aria-label="Staff update flow preview">
          <header>
            <span>STAFF-ONLY UPDATE CHANNEL</span>
            <b>7 REVIEW GATES</b>
          </header>
          <div>
            {data.updateStages.map(([title], index) => (
              <span key={title}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                {title}
              </span>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen updates-screen">
      <SectionHeading
        eyebrow="UPDATES · PREVIEW MODE"
        title="Staff-approved improvement cycle."
        description="Visual preview only. The backend remains off and STAFF OFF remains the actual state."
      />
      <div className="preview-banner">
        <Icon name="eye" />
        <span>
          <b>STAFF UI PREVIEW</b> · no backend setting changed · no action can apply or commit
        </span>
        <Button label="Exit preview" iconName="x" variant="ghost" onClick={toggleStaffPreview} />
      </div>
      <section className="update-report-summary">
        <div>
          <p className="eyebrow">
            FIXTURE-BACKED UPDATE BUNDLE · {data.updateBundle.version}
          </p>
          <h2>{data.updateBundle.proposal.title}</h2>
          <p>{data.updateBundle.validationSummary}</p>
        </div>
        <span>
          <Badge label="UNTRUSTED" tone="amber" />
          <Badge label="DRY RUN" tone="blue" />
          <Badge label="APPROVAL REQUIRED" tone="violet" />
        </span>
      </section>
      <section className="update-flow">
        {data.updateStages.map(([title, description], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <Icon name={STAGE_ICONS[index] ?? "shield"} />
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            {index < data.updateStages.length - 1 ? <i><Icon name="chevron-right" /></i> : null}
          </article>
        ))}
      </section>
      <section className="manual-gate">
        <div>
          <Icon name="shield-alert" />
          <span>
            <b>Manual apply remains outside this prototype.</b>
            <small>no auto-apply · no auto-commit · no auto-merge</small>
          </span>
        </div>
        <Button label="Preview next gate" iconName="play" variant="violet" onClick={safePlaceholder} />
      </section>
    </div>
  );
}
