import { FormEvent } from "react";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon } from "../../components/primitives";

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

function Inspector() {
  return (
    <aside className="inspector" aria-label="Task inspector">
      <header>
        <Icon name="panel-right" />
        <b>CONTEXT BUNDLE</b>
      </header>
      <section>
        <h3>FILES REFERENCED</h3>
        {[
          ["examples/looptest.real", "1.2k"],
          ["docs/language-semantics.md", "8.4k"],
          ["tests/test_i32_wrapping_runtime.py", "3.1k"]
        ].map(([name, size]) => (
          <div key={name} className="file-row">
            <Icon name="file-code-2" />
            <code>{name}</code>
            <small>{size}</small>
          </div>
        ))}
      </section>
      <section>
        <h3>VALIDATION COMMANDS</h3>
        <code className="command-line">realc --check</code>
        <code className="command-line">pytest -q tests/test_i32_wrapping_runtime.py</code>
      </section>
      <section>
        <h3>RISKS</h3>
        <p className="risk-note">
          <Icon name="triangle-alert" />
          Generated patch details are illustrative and not valid RealLang syntax.
        </p>
      </section>
      <section className="proposal-facts">
        <div>
          <span>Proposal status</span>
          <b>PENDING</b>
        </div>
        <div>
          <span>Update bundle</span>
          <b>NONE</b>
        </div>
        <div>
          <span>Patch hash</span>
          <code>a3f7…91c</code>
        </div>
      </section>
      <section>
        <h3>NEXT SAFE COMMAND</h3>
        <code className="next-command">realforge propose-patch --task … --dry-run</code>
      </section>
    </aside>
  );
}

export function WorkbenchScreen() {
  const stagedTask = useWorkbenchStore((s) => s.stagedTask);
  const openPalette = useWorkbenchStore((s) => s.openPalette);
  const stageTask = useWorkbenchStore((s) => s.stageTask);
  const showToast = useWorkbenchStore((s) => s.showToast);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = (event.currentTarget.elements.namedItem("task-input") as HTMLTextAreaElement | null)?.value.trim() || "";
    if (!input) {
      showToast("Enter a task to stage a mock thread", "warn");
      return;
    }
    stageTask(input);
  };

  return (
    <div className="workbench-layout">
      <section className="workbench-main">
        <header className="workbench-header">
          <div>
            <p className="eyebrow">WORKBENCH · CODE</p>
            <h1>Dry-run repair plan</h1>
            <span>Review the plan, proposal, and evidence before any future apply step.</span>
          </div>
          <div>
            <Badge label="DRY RUN" tone="blue" />
            <Badge label="NO WRITES" tone="green" />
          </div>
        </header>
        <div className="thread-scroll">
          <div className="thread">
            {stagedTask ? (
              <div className="thread-message thread-message--user">
                {stagedTask}
                <small>staged locally · not executed</small>
              </div>
            ) : null}
            <div className="thread-message thread-message--user">
              Plan a fix for the i32 overflow diagnostic in <code>examples/looptest.real</code> and validate it. Dry run only.
            </div>
            <div className="agent-label">
              <span className="mini-mark" />
              <b>RealForge</b>
              <small>mock · planner</small>
              <Badge label="UNTRUSTED PROVIDER OUTPUT" tone="amber" />
            </div>
            <PlanCard />
            <PatchCard />
            <ValidationCard />
          </div>
        </div>
        <form className="composer" id="workbench-form" onSubmit={onSubmit}>
          <div className="composer-context">
            <span>@RealLang</span>
            <span>12 files</span>
            <span>realc diagnostics</span>
            <small>Provider output remains untrusted</small>
          </div>
          <div className="composer-box">
            <Button label="Slash" iconName="slash" variant="slash" onClick={() => openPalette()} />
            <label className="sr-only" htmlFor="task-input">
              Workbench task
            </label>
            <textarea id="task-input" name="task-input" rows={1} placeholder="Describe a task, or type / for commands" />
            <button className="send-button" type="submit" aria-label="Stage mock task">
              <Icon name="arrow-up" />
            </button>
          </div>
        </form>
      </section>
      <Inspector />
    </div>
  );
}
