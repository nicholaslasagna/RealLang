import { useEffect, useState } from "react";
import {
  bridgeModeLabel,
  getRuntimeInfo,
  listBridgeCapabilities,
  runtimeModeLabel
} from "../bridge";
import type { BridgeCapabilities, RuntimeInfo } from "../bridge";
import { Badge, Icon } from "./primitives";

export function RuntimeIndicator() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [capabilities, setCapabilities] = useState<BridgeCapabilities | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getRuntimeInfo(), listBridgeCapabilities()]).then(([info, caps]) => {
      if (active) {
        setRuntime(info);
        setCapabilities(caps);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!runtime || !capabilities) return null;

  const runtimeTone = runtime.runtime === "desktop" ? "cyan" : "neutral";
  const bridgeTone = capabilities.metadataOnly ? "green" : capabilities.readOnly ? "cyan" : "amber";

  return (
    <div className="runtime-indicator" data-testid="runtime-indicator">
      <Icon name="cpu" />
      <span>
        <b>{runtimeModeLabel(runtime)}</b>
        <small>
          Platform {runtime.platform}
          {runtime.arch !== "unknown" ? ` · ${runtime.arch}` : ""} · Workbench {runtime.workbenchVersion}
        </small>
      </span>
      <Badge label={bridgeModeLabel(capabilities)} tone={bridgeTone} />
      <Badge label={runtime.runtime === "desktop" ? "DESKTOP" : "WEB"} tone={runtimeTone} />
    </div>
  );
}
