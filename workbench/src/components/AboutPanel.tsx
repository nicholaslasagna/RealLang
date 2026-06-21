import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  bridgeModeLabel,
  getRuntimeInfo,
  getUpdateStatus,
  getWorkspaceResolution,
  listBridgeCapabilities,
  platformDisplayName,
  runtimeModeLabel,
  updateStatusLabel,
  workspaceStatusLabel
} from "../bridge";
import type { BridgeCapabilities, RuntimeInfo, UpdateStatus, WorkspaceResolution } from "../bridge";
import { getWorkbenchData } from "../data/workbench-data";
import { securityFindings } from "../data/security/security-fixtures";
import { summarizeFindings } from "../data/security/security-model";
import { Badge, Button, Icon } from "./primitives";

function channelLabel(channel: string): string {
  if (channel === "local_dev") return "Local dev";
  if (channel === "preview") return "Preview";
  return "Stable";
}

export function AboutPanel() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [capabilities, setCapabilities] = useState<BridgeCapabilities | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [resolution, setResolution] = useState<WorkspaceResolution | null>(null);
  const [copied, setCopied] = useState(false);

  const backendVersion = getWorkbenchData().version;
  const posture = useMemo(() => summarizeFindings(securityFindings), []);

  useEffect(() => {
    let active = true;
    Promise.all([getRuntimeInfo(), listBridgeCapabilities(), getUpdateStatus(), getWorkspaceResolution()]).then(
      ([info, caps, upd, res]) => {
        if (!active) return;
        setRuntime(info);
        setCapabilities(caps);
        setUpdate(upd);
        setResolution(res);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  if (!runtime || !capabilities || !update || !resolution) {
    return (
      <div className="about-panel about-panel--loading" data-testid="about-panel">
        <Icon name="activity" />
        <span>Loading About…</span>
      </div>
    );
  }

  const postureLabel = posture.status === "pass" ? "PASS" : posture.status.toUpperCase();
  const postureTone = posture.status === "pass" ? "green" : posture.status === "blocked" ? "violet" : "amber";

  // Inert, sanitized diagnostics — versions, modes, and statuses only. No env
  // vars, secrets, provider keys, file paths, or command output.
  const diagnostics = {
    workbenchVersion: runtime.workbenchVersion,
    realforgeBackend: backendVersion,
    runtime: runtime.runtime,
    platform: runtime.platform,
    arch: runtime.arch,
    bridgeMode: capabilities.bridgeMode,
    readOnly: capabilities.readOnly,
    approvedDryRunActions: capabilities.approvedDryRunActionCount,
    updateState: update.state,
    updateChannel: update.channel,
    updaterConfigured: update.configured,
    workspaceStatus: resolution.status,
    securityPosture: {
      status: posture.status,
      total: posture.total,
      open: posture.open,
      resolved: posture.resolved,
      blocked: posture.blocked
    },
    generatedAt: new Date().toISOString()
  };

  const copyDiagnostics = () => {
    const text = JSON.stringify(diagnostics, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => undefined);
    }
  };

  const rows: Array<[string, ReactNode]> = [
    ["Workbench version", <code key="wb">{runtime.workbenchVersion}</code>],
    ["RealForge backend", <code key="be">{backendVersion}</code>],
    ["Runtime mode", <Badge key="rt" label={runtimeModeLabel(runtime)} tone={runtime.runtime === "desktop" ? "cyan" : "neutral"} />],
    ["Platform", <code key="pf">{platformDisplayName(runtime.platform)}{runtime.arch !== "unknown" ? ` · ${runtime.arch}` : ""}</code>],
    ["Bridge mode", <Badge key="bm" label={bridgeModeLabel(capabilities)} tone={capabilities.metadataOnly ? "green" : capabilities.readOnly ? "cyan" : "amber"} />],
    ["Update status", <Badge key="us" label={updateStatusLabel(update.state)} tone={update.configured ? "cyan" : "amber"} />],
    ["Build channel", <code key="bc">{channelLabel(update.channel)}</code>],
    ["Workspace", <Badge key="ws" label={workspaceStatusLabel(resolution.status)} tone={resolution.status === "ready" ? "green" : "amber"} />],
    ["Security posture", <Badge key="sp" label={`${postureLabel} · ${posture.resolved} resolved · ${posture.blocked} blocked`} tone={postureTone} />]
  ];

  return (
    <article className="about-panel" data-testid="about-panel" aria-label="About RealForge Workbench">
      <header>
        <span className="about-panel__mark">
          <Icon name="shield-check" />
        </span>
        <div>
          <p className="eyebrow">ABOUT</p>
          <h2>RealForge Workbench</h2>
          <p>Workbench {runtime.workbenchVersion} · RealForge backend {backendVersion}</p>
        </div>
        <Badge label="READ ONLY" tone="green" />
      </header>
      <dl className="about-panel__grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <footer className="about-panel__footer">
        <Button
          label={copied ? "Copied diagnostics" : "Copy diagnostics"}
          iconName={copied ? "circle-check" : "clipboard-list"}
          variant="secondary"
          onClick={copyDiagnostics}
        />
        <span className="about-panel__note">
          <Icon name="shield-check" />
          Inert versions and statuses only — no environment variables, secrets, keys, paths, or command output.
        </span>
      </footer>
    </article>
  );
}
