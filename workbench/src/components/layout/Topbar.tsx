import { useWorkbenchStore } from "../../state/workbench-store";
import { Icon } from "../primitives";

export function Topbar() {
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const toggleSidebar = useWorkbenchStore((s) => s.toggleSidebar);

  // [label, icon, tone, tooltip]. The cluster leads with one obvious "safe"
  // indicator; the individual pills stay compact and quiet (tooltips carry detail).
  const statusItems: Array<[string, string, string, string]> = [
    ["READONLY", "lock-keyhole", "amber", "Read-only mode — no workspace writes from the UI"],
    ["LOCAL ONLY", "hard-drive", "neutral", "Runs locally — no cloud provider"],
    ["NETWORK OFF", "wifi-off", "neutral", "Network off by default"],
    ["DOCTOR PASS", "shield-check", "neutral", "Environment doctor checks pass"],
    [
      staffPreview ? "STAFF PREVIEW" : "STAFF OFF",
      "shield",
      staffPreview ? "violet" : "neutral",
      staffPreview ? "Staff UI preview on — backend remains STAFF OFF" : "Staff controls are off (default)"
    ]
  ];

  return (
    <>
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span className="brand-copy">
          <strong>REALFORGE</strong>
          <small>AI ENGINEERING WORKBENCH</small>
        </span>
      </div>
      <div className="top-context" aria-label="Workspace and provider">
        <span className="context-chip">
          <Icon name="folder-git-2" />
          <b>RealLang</b>
          <small>workspace</small>
        </span>
        <span className="context-chip context-chip--provider">
          <Icon name="cpu" />
          <b>mock</b>
          <small>deterministic</small>
        </span>
      </div>
      <div className="top-spacer" />
      <div className="status-cluster" aria-label="Safety status" title="Safe defaults active">
        <span className="status-cluster__lead">
          <Icon name="shield-check" />
          <b>SAFE</b>
        </span>
        <div className="status-cluster__pills">
          {statusItems.map(([label, iconName, tone, tooltip]) => (
            <span key={label} className={`status-pill status-pill--${tone}`} title={tooltip}>
              <Icon name={iconName} />
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>
      <button className="icon-button mobile-menu" type="button" onClick={toggleSidebar} aria-label="Toggle navigation">
        <Icon name="menu" />
      </button>
    </>
  );
}
