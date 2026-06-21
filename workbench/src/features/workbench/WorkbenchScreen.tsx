import { useState } from "react";
import { composeActionPlan } from "../../composer/action-model";
import { useComposerRuntime } from "../../composer/use-composer-runtime";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Icon } from "../../components/primitives";
import { ActionInspector } from "../composer/ActionInspector";
import { ActionPreviewCard } from "../composer/ActionPreviewCard";
import { ApprovedDryRunPanel } from "../composer/ApprovedDryRunPanel";
import { ComposerDock } from "../composer/ComposerDock";
import { ApprovalAuditLog } from "../audit/ApprovalAuditLog";

function PlanCard() {
  const steps = [
    "Inspect looptest.real and locate the E221 i32 literal-range diagnostic.",
    "Identify the overflowing multiplication and binding type.",
    "Propose a conservative widening without changing unrelated code.",
    "Validate with realc --check and focused runtime tests."
  ];
  return (
    <article className="report-card report-card--cyan">
      <header>
        <Icon name="list-checks" />
        <b>STRUCTURED PLAN</b>
        <span>4 steps</span>
      </header>
      <ol className="plan-list">
        {steps.map((step, index) => (
          <li key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
      <div className="report-meta">
        <span>
          Writes files? <b>NO</b>
        </span>
        <span>
          Runs commands? <b>NO</b>
        </span>
        <span>
          Network? <b>NO</b>
        </span>
      </div>
    </article>
  );
}

function PatchCard() {
  const safePlaceholder = useWorkbenchStore((s) => s.safePlaceholder);
  return (
    <article className="report-card report-card--blue">
      <header>
        <Icon name="git-pull-request-arrow" />
        <b>PATCH PROPOSAL</b>
        <span>
          <Badge label="DRY RUN" tone="blue" />
          <button className="card-action" type="button" onClick={safePlaceholder}>
            Review proposal <Icon name="arrow-right" />
          </button>
        </span>
      </header>
      <div className="diff-block">
        <div>examples/looptest.real</div>
        <del>- let total: i32 = sum * 100000</del>
        <ins>+ let total: i32 = wrapped_total(sum)</ins>
      </div>
      <div className="report-meta">
        <span>
          Patch target: <b>1 file</b>
        </span>
        <span>
          Writes files? <b>NO</b>
        </span>
        <span>
          Status: <em>PENDING</em>
        </span>
      </div>
    </article>
  );
}

function ValidationCard() {
  return (
    <article className="report-card report-card--green">
      <header>
        <Icon name="badge-check" />
        <b>VALIDATION</b>
        <span>
          <Badge label="VALIDATED" tone="green" />
        </span>
      </header>
      <div className="validation-commands">
        <span>
          <Icon name="circle-check" />
          <code>realc --check</code>
        </span>
        <span>
          <Icon name="circle-check" />
          <code>pytest smoke</code>
        </span>
        <span>
          <Icon name="circle-check" />
          <code>i32 wrap runtime</code>
        </span>
      </div>
    </article>
  );
}

export function WorkbenchScreen() {
  const stagedTask = useWorkbenchStore((s) => s.stagedTask);
  const actionId = useWorkbenchStore((s) => s.composedActionId);
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const loadStatus = useWorkbenchStore((s) => s.desktopLoadStatus);
  const loadingSourceId = useWorkbenchStore((s) => s.desktopLoadSourceId);
  const loadDesktopReport = useWorkbenchStore((s) => s.loadDesktopReport);
  const navigate = useWorkbenchStore((s) => s.navigate);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const runtime = useComposerRuntime(staffPreview);
  const action = composeActionPlan(actionId, runtime);
  const showsRepairEvidence = action.id === "repair-diagnostic-dry-run";

  const loadReadOnlyAction = async (sourceId: "capabilities" | "slash" | "settings-doctor") => {
    const loaded = await loadDesktopReport(sourceId);
    if (loaded) navigate("reports");
  };

  return (
    <div className="workbench-layout">
      <section className="workbench-main">
        <header className="workbench-header">
          <div>
            <p className="eyebrow">WORKBENCH · SAFE COMMAND COMPOSER</p>
            <h1>{action.title}</h1>
            <span>Compose structured intent, inspect the safety boundary, then choose the next safe step.</span>
          </div>
          <div>
            <Badge label="PREVIEW ONLY" tone="blue" />
            <Badge label={action.writesFiles ? "WRITES DISABLED" : "NO WRITES"} tone={action.writesFiles ? "violet" : "green"} />
          </div>
        </header>
        <div className="thread-scroll">
          <div className="thread">
            {stagedTask ? (
              <div className="thread-message thread-message--user">
                {stagedTask}
                <small>reviewed context · session only · not executed</small>
              </div>
            ) : null}
            <ActionPreviewCard
              action={action}
              bridgeLoading={runtime.loading}
              bridgeError={runtime.error}
              loadStatus={loadStatus}
              loadingSourceId={loadingSourceId}
              onLoad={loadReadOnlyAction}
              onOpenReports={() => navigate("reports")}
              onRequestApproval={() => setApprovalActionId(action.id)}
              onOpenSetup={() => setSettingsSection("workspace")}
            />
            {approvalActionId === action.id && action.canRequestApproval && runtime.workspacePath ? (
              <ApprovedDryRunPanel
                action={action}
                workspacePath={runtime.workspacePath}
                onClose={() => setApprovalActionId(null)}
              />
            ) : null}
            <ApprovalAuditLog compact />
            {showsRepairEvidence ? (
              <>
                <div className="agent-label">
                  <span className="mini-mark" />
                  <b>RealForge</b>
                  <small>mock · planner</small>
                  <Badge label="UNTRUSTED PROVIDER OUTPUT" tone="amber" />
                </div>
                <PlanCard />
                <PatchCard />
                <ValidationCard />
              </>
            ) : (
              <article className="composer-boundary-card">
                <Icon name="shield-check" />
                <div>
                  <b>Composition boundary active</b>
                  <p>No provider, network, workspace write, apply, commit, merge, update, or scheduler path is available from this action.</p>
                </div>
              </article>
            )}
          </div>
        </div>
        <ComposerDock action={action} />
      </section>
      <ActionInspector action={action} runtime={runtime.runtime} bridgeHealthy={runtime.bridgeHealthy} />
    </div>
  );
}
