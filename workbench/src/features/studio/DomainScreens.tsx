import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Icon, SectionHeading } from "../../components/primitives";

export function CodeScreen() {
  const navigate = useWorkbenchStore((s) => s.navigate);

  return (
    <div className="screen domain-screen">
      <SectionHeading
        eyebrow="CODE · COMPILER GUIDED"
        title="Repository work, bounded by diagnostics."
        description="RealLang checks, structured diagnostics, dry-run repairs, and validated patch proposals without an IDE clone."
      />
      <div className="two-column-panels">
        <section className="feature-panel">
          <header>
            <Icon name="folder-git-2" />
            <div>
              <p className="eyebrow">REPOSITORY MAP</p>
              <h2>RealLang</h2>
            </div>
            <Badge label="INDEXED" tone="green" />
          </header>
          <div className="repo-tree">
            <code>src/reallang/</code>
            <span>compiler · 18 files</span>
            <code>src/realforge/</code>
            <span>agent platform · 42 files</span>
            <code>tests/</code>
            <span>436 passing</span>
            <code>docs/</code>
            <span>semantics and workflows</span>
          </div>
        </section>
        <section className="feature-panel">
          <header>
            <Icon name="activity" />
            <div>
              <p className="eyebrow">DIAGNOSTIC SIGNAL</p>
              <h2>Structured output</h2>
            </div>
            <Badge label="STABLE CODES" tone="cyan" />
          </header>
          <div className="diagnostic-example">
            <code>E221 · integer literal out of range</code>
            <p>Repair guidance is explicit, machine-readable, and scoped to one location.</p>
            <button type="button" onClick={() => navigate("workbench")}>
              Open dry-run repair <Icon name="arrow-right" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ResearchScreen() {
  const previewCommand = useWorkbenchStore((s) => s.previewCommand);
  const navigate = useWorkbenchStore((s) => s.navigate);

  return (
    <div className="screen domain-screen">
      <SectionHeading
        eyebrow="RESEARCH · PERMISSIONED"
        title="Research only when you allow it."
        description="HTTPS sources require an explicit domain allowlist. Saved content remains untrusted and never edits the workspace."
      />
      <section className="empty-state empty-state--amber">
        <span className="empty-state__icon">
          <Icon name="globe" />
        </span>
        <div>
          <p className="eyebrow">SAFE START</p>
          <h2>Start with a bounded request</h2>
          <p>Choose a command to preview structured output. No backend command runs and no workspace file changes.</p>
        </div>
        <div className="empty-commands">
          <button
            className="is-primary"
            type="button"
            onClick={() => previewCommand("/research")}
          >
            <code>/research</code>
            <span>Preview workflow</span>
            <Icon name="arrow-right" />
          </button>
          <button type="button" onClick={() => { previewCommand("/context"); navigate("workbench"); }}>
            <code>/context</code>
            <span>View context</span>
            <Icon name="arrow-right" />
          </button>
        </div>
      </section>
    </div>
  );
}
