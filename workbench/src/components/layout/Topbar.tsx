import { useWorkbenchStore } from "../../state/workbench-store";
import {
  getModelProviderProfile,
  MODEL_PROVIDER_PROFILES
} from "../../providers";
import { BrandMark } from "../BrandMark";
import { Icon } from "../primitives";

export function Topbar() {
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const sidebarOpen = useWorkbenchStore((s) => s.sidebarOpen);
  const toggleSidebar = useWorkbenchStore((s) => s.toggleSidebar);
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId);
  const selectModelProfile = useWorkbenchStore((s) => s.selectModelProfile);
  const selectedModelProfile = getModelProviderProfile(selectedModelProfileId) ?? MODEL_PROVIDER_PROFILES[0];

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
        <BrandMark />
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
          <span className="model-chip__copy">
            <b>Model</b>
            <small>{selectedModelProfile.displayName}</small>
          </span>
          <select
            className="model-chip__select"
            aria-label="Model connection"
            value={selectedModelProfile.id}
            onChange={(event) => selectModelProfile(event.currentTarget.value)}
          >
            <option value="private-local">Private Local Model</option>
            <option value="mock">Deterministic Mock</option>
            <option value="private-local-image" disabled>Private Local Image Model</option>
          </select>
        </span>
      </div>
      <div className="top-spacer" />
      <details className="status-cluster">
        <summary className="status-cluster__lead" aria-label="Safety status" title="Safe defaults active">
          <Icon name="shield-check" />
          <b>SAFE</b>
          <span className="status-cluster__hint">5 protections</span>
        </summary>
        <div className="status-cluster__pills" aria-label="Safety status details">
          {statusItems.map(([label, iconName, tone, tooltip]) => (
            <span key={label} className={`status-pill status-pill--${tone}`} title={tooltip}>
              <Icon name={iconName} />
              <span>{label}</span>
            </span>
          ))}
        </div>
      </details>
      <button
        className="icon-button mobile-menu"
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
      >
        <Icon name="menu" />
      </button>
    </>
  );
}
