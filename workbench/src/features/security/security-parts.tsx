import { Badge, Icon } from "../../components/primitives";
import {
  severityTone,
  statusTone,
  type SecurityFinding,
  type SecurityFixPlan
} from "../../data/security/security-model";

export function statusLabel(status: SecurityFinding["status"]): string {
  if (status === "blocked") return "BLOCKED UPSTREAM";
  return status.toUpperCase();
}

export function fixButtonLabel(status: SecurityFinding["status"]): string {
  if (status === "resolved") return "Review validation";
  if (status === "blocked") return "Create tracking plan";
  return "Plan fix (preview)";
}

function planStatusLabel(plan: SecurityFixPlan): string {
  if (plan.executionStatus === "preview_only") return "PREVIEW ONLY";
  if (plan.executionStatus === "blocked") return "TRACKING ONLY";
  if (plan.executionStatus === "approval_required") return "APPROVAL REQUIRED";
  return "DRY RUN AVAILABLE";
}

/**
 * `compact` (the default for cards) shows only the essentials — status, severity,
 * and fix availability — to keep cards calm. The full badge set (human review,
 * untrusted, platform tags) is shown in the detail inspector with `compact={false}`.
 */
export function FindingBadges({ finding, compact = false }: { finding: SecurityFinding; compact?: boolean }) {
  return (
    <div className="security-badges">
      <Badge label={statusLabel(finding.status)} tone={statusTone(finding.status)} />
      <Badge label={finding.severity.toUpperCase()} tone={severityTone(finding.severity)} />
      {finding.fixAvailable ? (
        <Badge label="FIX AVAILABLE" tone="cyan" />
      ) : finding.status === "blocked" ? (
        <Badge label="TRACKED · NO FIX YET" tone="violet" />
      ) : null}
      {compact ? null : (
        <>
          {finding.needsHumanReview ? <Badge label="HUMAN REVIEW" tone="amber" /> : null}
          {!finding.trustedSource ? <Badge label="UNTRUSTED UNTIL VERIFIED" tone="amber" /> : null}
          {(finding.platformTags ?? []).map((tag) => (
            <Badge key={tag} label={tag} tone={tag === "TAURI" ? "blue" : tag === "LIVE" ? "cyan" : "neutral"} />
          ))}
        </>
      )}
    </div>
  );
}

export function FixPlanPanel({ plan }: { plan: SecurityFixPlan }) {
  return (
    <article className="security-fix-plan" data-testid="security-fix-plan" aria-live="polite">
      <header>
        <div>
          <p className="eyebrow">FIX PLAN PREVIEW</p>
          <h3>{plan.title}</h3>
        </div>
        <div className="security-fix-plan__badges">
          <Badge label={planStatusLabel(plan)} tone="blue" />
          <Badge label="UNTRUSTED UNTIL VERIFIED" tone="amber" />
          <Badge label="APPROVAL REQUIRED" tone="violet" />
          <Badge label={plan.writesFiles ? "WRITES FILES" : "NO WRITES"} tone={plan.writesFiles ? "amber" : "green"} />
        </div>
      </header>
      <p className="security-fix-plan__note">
        <Icon name="shield-alert" />
        {plan.generatedByAi ? "AI-assisted preview." : "Deterministic preview — no AI model is wired."}{" "}
        RealForge does not modify dependency files, run tools, or apply changes from this plan.
      </p>
      <div className="security-fix-plan__cols">
        <section>
          <h4>Proposed steps</h4>
          <ol>
            {plan.proposedSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <section>
          <h4>Files likely touched</h4>
          {plan.filesLikelyTouched.length ? (
            <ul>
              {plan.filesLikelyTouched.map((file) => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="security-muted">None — review/tracking only.</p>
          )}
          <h4>Validate (not executed)</h4>
          <ul className="security-commands">
            {plan.commandsToValidate.map((command) => (
              <li key={command}>
                <code>{command}</code>
                <Badge label="NOT EXECUTED" tone="amber" />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="security-fix-plan__facts">
        <section>
          <h4>Risks</h4>
          <ul>
            {plan.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Rollback plan</h4>
          <p>{plan.rollbackPlan}</p>
        </section>
      </div>
      <footer>
        <Icon name="lock-keyhole" />
        <span>Dry-run first. Any future execution stays approval-gated and human-reviewed.</span>
      </footer>
    </article>
  );
}
