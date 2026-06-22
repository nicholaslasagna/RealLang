import type { PrivateProviderReadiness } from "../providers";
import { Badge, Icon } from "./primitives";

interface ProviderSafetyBoundaryProps {
  readiness: PrivateProviderReadiness;
}

export function ProviderSafetyBoundary({ readiness }: ProviderSafetyBoundaryProps) {
  const disconnected = [
    ["Workspace context", readiness.workspaceContextEnabled],
    ["File access", readiness.fileAccessEnabled],
    ["Tools", readiness.toolsEnabled],
    ["Shell", readiness.shellEnabled],
    ["Memory", readiness.memoryEnabled],
    ["Persistence", readiness.persistenceEnabled],
    ["Image generation", readiness.imageGenerationEnabled]
  ] as const;

  return (
    <section
      className="provider-safety-boundary"
      data-testid="provider-safety-boundary"
      aria-labelledby="provider-safety-boundary-title"
    >
      <header>
        <div className="provider-section-title">
          <span><Icon name="shield-check" /></span>
          <div>
            <p className="eyebrow">SAFETY BOUNDARY</p>
            <h2 id="provider-safety-boundary-title">Disconnected by design</h2>
            <p>Provider access stops at the fixed smoke check and bounded single-turn sandbox.</p>
          </div>
        </div>
        <div className="provider-chip-row">
          <Badge label="NO CONTEXT" tone="green" />
          <Badge label="NO WRITES" tone="green" />
          <Badge label="NO MEMORY" tone="green" />
        </div>
      </header>
      <div className="provider-safety-boundary__grid">
        {disconnected.map(([label, enabled]) => (
          <span key={label}>
            <Icon name={enabled ? "circle-check" : "lock-keyhole"} />
            <b>{label}</b>
            <small>{enabled ? "ON" : "OFF"}</small>
          </span>
        ))}
      </div>
      <p><Icon name="shield-check" /> Output remains <code>local_untrusted</code> and requires user review.</p>
    </section>
  );
}
