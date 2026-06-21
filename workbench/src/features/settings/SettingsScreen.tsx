import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Badge, Icon } from "../../components/primitives";

const DESCRIPTIONS: Record<string, string> = {
  general: "Appearance and local prototype behavior.",
  workspace: "Bounded paths and artifact locations for the active repository.",
  provider: "Deterministic local provider state and multimodal readiness.",
  permissions: "Effective write, command, and destructive-action boundaries.",
  research: "Network access remains off until an explicit allowlist is supplied.",
  staff: "Advanced update controls are disabled and hidden by default.",
  scheduler: "Bounded staff jobs with hard limits and no automatic apply step.",
  benchmarks: "Validation thresholds used before any output can earn confidence.",
  creative: "Planning-only multimodal capabilities and provenance settings.",
  engine: "Read-only detection and planning for Unreal and Blender workflows.",
  doctor: "Current safety posture across workspace, provider, network, and update gates."
};

function DoctorPanel() {
  const data = getWorkbenchData();
  const doctor = data.doctor;
  return (
    <>
      <div className="doctor-summary">
        <div>
          <strong>{doctor.totals.pass}</strong>
          <span>PASS</span>
        </div>
        <div>
          <strong>{doctor.totals.warn}</strong>
          <span>WARN</span>
        </div>
        <div>
          <strong>{doctor.totals.blocked}</strong>
          <span>BLOCKED</span>
        </div>
      </div>
      <div className="doctor-list">
        {doctor.checks.map((check) => (
          <div key={check.name}>
            <Icon name={check.status === "PASS" ? "circle-check" : "triangle-alert"} />
            <span>
              <b>{check.name}</b>
              <small>{check.detail}</small>
            </span>
            <Badge label={check.status} tone={check.status === "PASS" ? "green" : check.status === "BLOCKED" ? "violet" : "amber"} />
          </div>
        ))}
      </div>
    </>
  );
}

export function SettingsScreen() {
  const data = getWorkbenchData();
  const settingsSection = useWorkbenchStore((s) => s.settingsSection);
  const setSettingsSection = useWorkbenchStore((s) => s.setSettingsSection);
  const current = data.settingsSections.find((section) => section.id === settingsSection) || data.settingsSections[0];
  const fields = data.settings[current.id] || [];
  const staffSection = current.id === "staff" || current.id === "scheduler";

  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        <p className="eyebrow">SETTINGS</p>
        {data.settingsSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={current.id === section.id ? "is-active" : ""}
            onClick={() => setSettingsSection(section.id)}
          >
            <Icon name={section.icon} />
            <span>{section.label}</span>
            {section.id === "staff" || section.id === "scheduler" ? <Badge label="STAFF" tone="violet" /> : null}
          </button>
        ))}
      </aside>
      <section className="settings-content">
        <header>
          <div>
            <p className="eyebrow">EFFECTIVE CONFIGURATION</p>
            <h1>{current.label}</h1>
            <p>{DESCRIPTIONS[current.id] || "Read-only prototype configuration."}</p>
          </div>
          <Badge label="READ ONLY" tone="green" />
        </header>
        <div className="settings-safety-strip">
          <span>
            <Icon name="lock-keyhole" />
            <b>READONLY</b>
          </span>
          <span>
            <Icon name="hard-drive" />
            <b>LOCAL ONLY</b>
          </span>
          <span>
            <Icon name="wifi-off" />
            <b>NETWORK OFF</b>
          </span>
          <span>
            <Icon name="shield" />
            <b>STAFF OFF</b>
          </span>
        </div>
        {staffSection ? (
          <div className="staff-settings-gate">
            <Icon name="lock-keyhole" />
            <span>
              <b>Staff-only controls are gated.</b>
              <small>Display values cannot enable staff mode or scheduler execution.</small>
            </span>
            <Badge label="LOCKED" tone="violet" />
          </div>
        ) : null}
        {current.id === "doctor" ? (
          <DoctorPanel />
        ) : (
          <div className={`settings-fields ${staffSection ? "settings-fields--gated" : ""}`}>
            {fields.map(([label, value, note]) => (
              <div key={label}>
                <span>
                  <b>{label}</b>
                  <small>{note}</small>
                </span>
                <code>{value}</code>
                {staffSection ? <Icon name="lock" className="field-lock" /> : null}
              </div>
            ))}
          </div>
        )}
        <footer className="settings-footer">
          <Icon name="shield-check" />
          <span>
            <b>Safe defaults are active.</b> Changes are unavailable in this static prototype.
          </span>
        </footer>
      </section>
    </div>
  );
}
