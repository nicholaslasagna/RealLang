import { useEffect, useState } from "react";
import { checkBridgeHealth, isDesktopRuntime, workspaceStatusLabel, workspaceStatusTone } from "../../bridge";
import type { BridgeHealth } from "../../bridge";
import { Badge, Icon } from "../../components/primitives";

export function BridgeHealthStrip() {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const desktop = isDesktopRuntime();

  useEffect(() => {
    let active = true;
    checkBridgeHealth().then((result) => {
      if (active) setHealth(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!health) return null;

  const { resolution } = health;
  const tone = health.healthy ? "green" : workspaceStatusTone(resolution.status);

  return (
    <div className="bridge-health-strip" data-testid="bridge-health-strip">
      <Icon name={health.healthy ? "circle-check" : "activity"} />
      <span>
        <b>CLI bridge {health.healthy ? "ready" : "needs setup"}</b>
        <small>
          {desktop
            ? `${workspaceStatusLabel(resolution.status)} · read-only · ${resolution.supportedSources.length} sources`
            : "Desktop-only health checks — web preview uses manual import"}
        </small>
      </span>
      <Badge label={health.healthy ? "HEALTHY" : "CHECK"} tone={tone} />
      {!health.healthy && health.nextActions[0] ? (
        <span className="bridge-health-strip__hint">{health.nextActions[0]}</span>
      ) : null}
    </div>
  );
}
