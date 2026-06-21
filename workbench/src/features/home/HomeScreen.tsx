import type { WorkbenchScreen } from "../../state/types";
import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, MetricCard } from "../../components/primitives";

export function HomeScreen() {
  const data = getWorkbenchData();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const openPalette = useWorkbenchStore((s) => s.openPalette);

  return (
    <div className="screen screen--home">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" />
            LOCAL ENVIRONMENT · V{data.version}
          </p>
          <h1>RealForge is ready</h1>
          <p>Local-first AI engineering workbench with safe defaults already active.</p>
          <div className="hero-actions">
            <Button label="Open Workbench" iconName="square-terminal" variant="primary" onClick={() => navigate("workbench")} />
            <Button
              label="Browse commands"
              iconName="command"
              variant="ghost"
              onClick={() => openPalette()}
              aria-keyshortcuts="Meta+K Control+K"
            />
          </div>
        </div>
        <div className="hero-signal">
          <span className="signal-mark" aria-hidden="true">
            <i />
          </span>
          <div>
            <b>SAFE DEFAULTS</b>
            <strong>Ready for bounded work</strong>
            <small>Readonly · local only · network off · approval manual</small>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-label">
          <span>WORKSPACE STATUS</span>
          <i />
        </div>
        <div className="metrics-grid">
          <MetricCard title="Workspace health" iconName="activity" tone="green" emphasis="featured" footer="Boundary and permission gates active">
            <div className="health-score">
              <strong>8</strong>
              <span>/10</span>
            </div>
            <div className="mini-list">
              <span>
                <i className="dot dot--green" />8 PASS
              </span>
              <span>
                <i className="dot dot--amber" />2 WARN
              </span>
              <span>
                <i className="dot" />0 BLOCKED
              </span>
            </div>
          </MetricCard>
          <MetricCard title="Provider / model" iconName="server" tone="cyan" footer={<>{<Badge label="LOCAL ONLY" tone="cyan" />} {<Badge label="TEXT" tone="neutral" />}</>}>
            <strong className="metric-main">mock</strong>
            <span className="metric-sub">deterministic · offline</span>
          </MetricCard>
          <MetricCard title="Latest benchmark" iconName="trophy" tone="amber" footer="planning suite · static mock">
            <div className="score-line">
              <strong>0.86</strong>
              <span>+0.04</span>
            </div>
            <div className="sparkline">
              {[42, 50, 47, 61, 67, 72, 78, 86].map((height, index) => (
                <i key={height} style={{ height: `${height}%` }} className={index === 7 ? "is-last" : ""} />
              ))}
            </div>
          </MetricCard>
          <MetricCard title="Latest validation" iconName="badge-check" tone="green" footer="No workspace writes">
            <ul className="validation-list">
              <li>
                realc --check <Badge label="PASS" tone="green" />
              </li>
              <li>
                pytest · full <Badge label="PASS" tone="green" />
              </li>
              <li>
                git diff --check <Badge label="PASS" tone="green" />
              </li>
            </ul>
          </MetricCard>
        </div>
      </section>

      <section className="home-lower">
        <article className="list-panel list-panel--primary">
          <header>
            <div>
              <p className="eyebrow">RECENT TASKS</p>
              <h2>Reviewable local history</h2>
            </div>
            <Button label="Open workbench" iconName="arrow-right" variant="ghost" onClick={() => navigate("workbench")} />
          </header>
          <div className="task-list">
            {[
              ["wrench", "Repair i32 overflow · looptest.real", "DRY RUN", "blue", "2m"],
              ["list-checks", "Plan benchmark suite expansion", "VALIDATED", "green", "18m"],
              ["drama", "Creative brief · aerial duel arena", "UNTRUSTED", "amber", "1h"],
              ["eye", "Vision analyze · concept.png", "WARN", "amber", "3h"]
            ].map(([ic, title, status, tone, time]) => (
              <button key={title} className="task-row" type="button" onClick={() => navigate("workbench")}>
                <Icon name={String(ic)} />
                <span>
                  <b>{title}</b>
                  <small>{time} ago · mock artifact</small>
                </span>
                <Badge label={String(status)} tone={String(tone)} />
                <Icon name="chevron-right" />
              </button>
            ))}
          </div>
        </article>
        <article className="action-panel">
          <p className="eyebrow">SUGGESTED NEXT ACTIONS</p>
          <h2>Continue safely</h2>
          <div className="suggestion-list">
            {[
              ["/check", "Validate examples after the last edit", "workbench"],
              ["/skill-bench", "Refresh capability-domain scores", "benchmarks"],
              ["/doctor", "Review two configuration warnings", "settings"]
            ].map(([cmd, desc, screen]) => (
              <button key={cmd} type="button" onClick={() => navigate(screen as WorkbenchScreen)}>
                <code>{cmd}</code>
                <span>{desc}</span>
                <Icon name="arrow-right" />
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
