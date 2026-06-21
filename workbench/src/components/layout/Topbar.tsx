import { useWorkbenchStore } from "../../state/workbench-store";
import { Icon } from "../primitives";

export function Topbar() {
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const toggleSidebar = useWorkbenchStore((s) => s.toggleSidebar);

  const statusItems: Array<[string, string, string]> = [
    ["READONLY", "lock-keyhole", "amber"],
    ["LOCAL ONLY", "hard-drive", "cyan"],
    ["NETWORK OFF", "wifi-off", "neutral"],
    ["DOCTOR PASS", "shield-check", "green"],
    [staffPreview ? "STAFF PREVIEW" : "STAFF OFF", "shield", staffPreview ? "violet" : "neutral"]
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
      <div className="top-statuses">
        {statusItems.map(([label, iconName, tone]) => (
          <span key={label} className={`status-pill status-pill--${tone}`}>
            <Icon name={iconName} />
            <span>{label}</span>
          </span>
        ))}
      </div>
      <button className="icon-button mobile-menu" type="button" onClick={toggleSidebar} aria-label="Toggle navigation">
        <Icon name="menu" />
      </button>
    </>
  );
}
