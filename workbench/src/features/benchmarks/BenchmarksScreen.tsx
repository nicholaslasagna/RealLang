import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";

export function BenchmarksScreen() {
  const data = getWorkbenchData();
  const bench = data.benchmarks;
  const previewCommand = useWorkbenchStore((s) => s.previewCommand);

  return (
    <div className="screen">
      <SectionHeading
        eyebrow="BENCHMARKS · LOCAL"
        title="Measure before trust."
        description="Static mock results show how task, skill, safety, and leaderboard reports could be presented without superiority claims."
      />
      <div className="page-action-row">
        <span>
          <Icon name="shield-check" />
          Gate {bench.gate} · current result passes
        </span>
        <Button label="Preview skill bench" iconName="play" variant="primary" onClick={() => previewCommand("/skill-bench")} />
      </div>
      <div className="benchmark-summary">
        <article>
          <span>Overall score</span>
          <strong>{bench.overall}</strong>
          <small>
            gate {bench.gate} · PASS
          </small>
        </article>
        <article>
          <span>Tasks</span>
          <strong>{bench.tasks}</strong>
          <small>skill-bench smoke suite</small>
        </article>
        <article>
          <span>Safety outcomes</span>
          <strong>0</strong>
          <small>unsafe suggestions applied</small>
        </article>
      </div>
      <section className="benchmark-panel">
        <header>
          <div>
            <p className="eyebrow">SKILL-BENCH DOMAIN SCORES</p>
            <h2>Capability profile</h2>
          </div>
          <Badge label="MOCK DATA" tone="neutral" />
        </header>
        <div className="score-list">
          {bench.domains.map((domain, index) => (
            <div key={domain}>
              <span>{domain}</span>
              <i>
                <b style={{ width: `${bench.scores[index] * 100}%` }} />
              </i>
              <code>{bench.scores[index].toFixed(2)}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
