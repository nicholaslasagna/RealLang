import { useEffect, useRef, useState } from "react";
import { composeActionPlan } from "../../composer/action-model";
import { useComposerRuntime } from "../../composer/use-composer-runtime";
import { useWorkbenchStore } from "../../state/workbench-store";
import { isDesktopRuntime, loadProviderStatus, runPrivateProviderChatSandbox, type ProviderStatus } from "../../bridge";
import { Badge, Icon } from "../../components/primitives";
import { ActionInspector } from "../composer/ActionInspector";
import { ActionPreviewCard } from "../composer/ActionPreviewCard";
import { ApprovedDryRunPanel } from "../composer/ApprovedDryRunPanel";
import { ComposerDock, type ComposerMode } from "../composer/ComposerDock";
import { ApprovalAuditLog } from "../audit/ApprovalAuditLog";
import { WorkbenchGreeting } from "./WorkbenchGreeting";
import { WorkbenchFlowHint } from "./WorkbenchFlowHint";
import { WorkbenchChatThread, type ChatTurn } from "./WorkbenchChatThread";
import { WorkbenchProviderReadiness } from "./WorkbenchProviderReadiness";
import { availableContextTurnCount, buildContextPreview, composeVisibleChatContext } from "./chat-context";

const DEFAULT_ACTION_ID = "repair-diagnostic-dry-run";

function EmptyWorkbenchCard() {
  return (
    <article className="workbench-empty-card" data-testid="workbench-assistant-empty-state">
      <div>
        <Icon name="sparkles" />
        <span>Start with a plain-language request</span>
      </div>
      <p>
        RealForge can chat locally or prepare a safe preview. Details are available after you choose what to do.
      </p>
    </article>
  );
}

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
  const setWorkbenchMode = useWorkbenchStore((s) => s.setWorkbenchMode);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const desktop = isDesktopRuntime();
  const [mode, setMode] = useState<ComposerMode>("preview");
  // Session-only visible chat thread. Multiple turns may be shown, but each call
  // to the provider is an independent bounded request (prior turns are NOT sent).
  // Never persisted, never added to the approval audit, never hidden transcript memory.
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const turnIdRef = useRef(0);
  const runtime = useComposerRuntime(staffPreview);
  const action = composeActionPlan(actionId, runtime);
  const showsRepairEvidence = action.id === "repair-diagnostic-dry-run";
  const hasStagedTask = stagedTask.trim().length > 0;
  const inAskLocal = mode === "ask-local";
  // An action preview only appears once the user EXPLICITLY composes a specific action
  // (a suggestion/palette intent → non-default id, or an approval request). Typing free
  // conversational text never auto-stages a fake "Repair diagnostic dry-run".
  const hasExplicitAction = approvalActionId === action.id || actionId !== DEFAULT_ACTION_ID;
  // Free text was staged in Safe preview without choosing an action — likely a chat message.
  const looksLikeChat = !inAskLocal && hasStagedTask && !hasExplicitAction;
  const previewEmpty = !inAskLocal && !hasExplicitAction && !hasStagedTask;
  const chatRunning = chatTurns.some((turn) => turn.running);
  const headerTitle = inAskLocal
    ? "Local model chat"
    : hasExplicitAction
      ? action.title
      : "What do you want to work on?";

  useEffect(() => {
    setWorkbenchMode(inAskLocal ? "chat" : "default");
    return () => setWorkbenchMode("default");
  }, [inAskLocal, setWorkbenchMode]);

  useEffect(() => {
    if (!inAskLocal || !desktop) {
      setProviderStatus(null);
      setProviderStatusLoading(false);
      return;
    }

    let active = true;
    setProviderStatusLoading(true);
    void loadProviderStatus()
      .then((nextStatus) => {
        if (active) setProviderStatus(nextStatus);
      })
      .finally(() => {
        if (active) setProviderStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [desktop, inAskLocal]);

  const loadReadOnlyAction = async (sourceId: "capabilities" | "slash" | "settings-doctor") => {
    const loaded = await loadDesktopReport(sourceId);
    if (loaded) navigate("reports");
  };

  // Reuses the existing narrow chat-sandbox IPC. No workspace/files/tools/argv —
  // only the bounded prompt + acknowledgement the Rust bridge already validates.
  // By default prior turns are NOT sent; when the user opts in, recent VISIBLE turns are
  // composed into a single bounded prompt on the frontend (capped, disclosed). No workspace,
  // file, provider, or config data is ever included.
  const askLocalModel = async (prompt: string, includeContext = false) => {
    const id = (turnIdRef.current += 1);
    const actuallyIncluded = includeContext && availableContextTurnCount(chatTurns) > 0;
    const sentPrompt = actuallyIncluded ? composeVisibleChatContext(chatTurns, prompt) : prompt;
    setChatTurns((prev) => [...prev, { id, prompt, result: null, running: true, contextIncluded: actuallyIncluded }]);
    const response = await runPrivateProviderChatSandbox({ prompt: sentPrompt, approvalAcknowledged: true });
    setChatTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, result: response, running: false } : turn)));
  };

  const clearChat = () => {
    if (chatRunning) return;
    setChatTurns([]);
  };

  const lastChatResult = chatTurns.length ? chatTurns[chatTurns.length - 1].result : null;

  const openProviderSettings = () => {
    setSettingsSection("provider");
    navigate("settings");
  };

  return (
    <div
      className={`workbench-layout ${showDetails ? "" : "workbench-layout--solo"} ${
        previewEmpty ? "workbench-layout--empty" : ""
      } ${inAskLocal ? "workbench-layout--chat" : ""}`.trim()}
    >
      <section
        className={`workbench-main ${previewEmpty ? "workbench-main--empty" : ""} ${
          inAskLocal ? "workbench-main--chat" : ""
        }`.trim()}
      >
        <header className="workbench-header workbench-header--calm">
          <div>
            <h1>{headerTitle}</h1>
            <span>
              {inAskLocal
                ? "Ask the user-configured local model. You approve each request; the conversation is session-only and not saved."
                : hasExplicitAction
                  ? "Review the staged preview. Details stay inspectable, and running it still needs approval."
                  : "Choose Chat to talk to your local model, or describe an action to preview safely."}
            </span>
          </div>
          <button
            type="button"
            className={`details-toggle ${showDetails ? "is-active" : ""}`}
            aria-pressed={showDetails}
            onClick={() => setShowDetails((open) => !open)}
          >
            <Icon name={showDetails ? "x" : "sliders-horizontal"} />
            <span>{showDetails ? "Hide details" : "Details"}</span>
          </button>
        </header>
        <div className="thread-scroll">
          <div className="thread">
            {!inAskLocal ? <WorkbenchGreeting /> : null}
            {inAskLocal ? (
              <>
                <WorkbenchProviderReadiness
                  desktop={desktop}
                  loading={providerStatusLoading}
                  status={providerStatus}
                  lastResult={lastChatResult}
                  onOpenSettings={openProviderSettings}
                />
                <WorkbenchChatThread turns={chatTurns} onClear={clearChat} onConfigureProvider={openProviderSettings} />
              </>
            ) : (
              <>
                {previewEmpty ? <WorkbenchFlowHint /> : null}
                {previewEmpty ? <EmptyWorkbenchCard /> : null}
                {looksLikeChat ? (
                  <article className="chat-nudge" data-testid="chat-nudge">
                    <Icon name="cpu" />
                    <div>
                      <b>This looks like a chat message</b>
                      <p>
                        Safe preview only stages action previews — it doesn&rsquo;t chat. To send this to your
                        user-configured local model, switch to Chat.
                      </p>
                      <button
                        type="button"
                        className="chat-nudge__action"
                        data-testid="chat-nudge-switch"
                        disabled={!desktop}
                        onClick={() => setMode("ask-local")}
                      >
                        <Icon name="cpu" /> {desktop ? "Switch to Chat" : "Chat is available in the desktop app"}
                      </button>
                    </div>
                  </article>
                ) : null}
                {hasExplicitAction ? (
                  <>
                    {hasStagedTask ? (
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
                    {showsRepairEvidence && hasStagedTask ? (
                      <>
                        <div className="agent-label">
                          <span className="mini-mark" />
                          <b>RealForge</b>
                          <small>mock · illustrative plan</small>
                          <Badge label="UNTRUSTED PROVIDER OUTPUT" tone="amber" />
                        </div>
                        <PlanCard />
                        <PatchCard />
                        <ValidationCard />
                      </>
                    ) : null}
                  </>
                ) : null}
                <details className="thread-secondary" data-testid="workbench-secondary-details">
                  <summary>Boundaries &amp; reference</summary>
                  {!showsRepairEvidence ? (
                    <article className="composer-boundary-card">
                      <Icon name="shield-check" />
                      <div>
                        <b>Composition boundary active</b>
                        <p>No provider, network, workspace write, apply, commit, merge, update, or scheduler path is available from this action.</p>
                      </div>
                    </article>
                  ) : null}
                  <section className="thread-reference" aria-label="Reference">
                    <p className="thread-reference__label">Reference</p>
                    <ApprovalAuditLog compact />
                  </section>
                </details>
              </>
            )}
          </div>
        </div>
        <ComposerDock
          action={action}
          mode={mode}
          onModeChange={setMode}
          onAskLocalModel={askLocalModel}
          chatRunning={chatRunning}
          contextPreview={buildContextPreview(chatTurns)}
        />
      </section>
      {showDetails ? (
        <ActionInspector action={action} runtime={runtime.runtime} bridgeHealthy={runtime.bridgeHealthy} />
      ) : null}
    </div>
  );
}
