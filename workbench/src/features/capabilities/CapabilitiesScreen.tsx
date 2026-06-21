import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Button, Icon, SectionHeading } from "../../components/primitives";

function capabilityTone(status: string) {
  if (status === "available") return "green";
  if (status === "staff-only") return "violet";
  return "cyan";
}

export function CapabilitiesScreen() {
  const data = getWorkbenchData();
  const navigate = useWorkbenchStore((s) => s.navigate);
  const available = data.capabilities.filter((c) => c.status === "available").length;
  const staffOnly = data.capabilities.filter((c) => c.staff).length;

  return (
    <div className="screen">
      <SectionHeading
        eyebrow="CAPABILITY REGISTRY"
        title="Capabilities"
        description="One trust-oriented loop across every domain. Provider, research, and generated output stays untrusted until validated."
      />
      <div className="page-action-row">
        <span>
          <Icon name="shield-check" />
          {data.capabilities.length} registered domains · {available} available · {staffOnly} staff-only
        </span>
        <Button label="Open Workbench" iconName="square-terminal" variant="primary" onClick={() => navigate("workbench")} />
      </div>
      <div className="capability-grid">
        {data.capabilities.map((cap) => (
          <article key={cap.domain} className="capability-card">
            <header>
              <span className="capability-icon">
                <Icon name={cap.icon} />
              </span>
              <h2>{cap.domain}</h2>
              <Badge label={cap.status.toUpperCase()} tone={capabilityTone(cap.status)} />
            </header>
            <p>{cap.description}</p>
            <div className="capability-badges">
              <Badge label={cap.safety.toUpperCase()} tone={cap.safety.includes("untrusted") ? "amber" : "blue"} />
              <Badge label={`WRITES ${cap.writes.toUpperCase()}`} tone={cap.writes === "yes" ? "amber" : "neutral"} />
              {cap.staff ? <Badge label="STAFF" tone="violet" /> : <Badge label="NO STAFF" tone="neutral" />}
              {cap.network ? <Badge label="NETWORK" tone="amber" /> : <Badge label="LOCAL" tone="cyan" />}
            </div>
            <footer>
              <Icon name="terminal" />
              <code>{cap.next}</code>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
