import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { AboutPanel } from "../../components/AboutPanel";
import { PrivateLocalModelPanel } from "../../components/PrivateLocalModelPanel";
import { RuntimeIndicator } from "../../components/RuntimeIndicator";
import { UpdateCenterPanel } from "../../components/UpdateCenterPanel";
import { WorkspacePanel } from "../../components/WorkspacePanel";
import { Badge, Icon } from "../../components/primitives";
import { SETTINGS_NAV_GROUPS } from "./settings-nav-groups";

const DESCRIPTIONS: Record<string, string> = {
  general: "Appearance, runtime mode, and inert diagnostics.",
  workspace: "Repository folder selection and bridge health.",
  updates: "Signed desktop updates and release readiness.",
  provider: "Private local model status, smoke check, and chat sandbox.",
  permissions: "Write, command, and destructive-action boundaries.",
  research: "Network access remains off until an explicit allowlist is supplied.",
  staff: "Advanced update controls are disabled and hidden by default.",
  scheduler: "Bounded staff jobs with hard limits and no automatic apply step.",
  benchmarks: "Validation thresholds used before any output can earn confidence.",
  creative: "Planning-only multimodal capabilities and provenance settings.",
  engine: "Read-only detection and planning for Unreal and Blender workflows.",
  doctor: "Safety posture across workspace, provider, network, and update gates."
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
      <details className="settings-disclosure">
        <summary>Doctor check details</summary>
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
      </details>
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
  const sectionsById = Object.fromEntries(data.settingsSections.map((section) => [section.id, section]));

  return (
    <div className="settings-layout" data-testid="settings-screen">
      <aside className="settings-nav" aria-label="Settings categories">
        {SETTINGS_NAV_GROUPS.map((group) => {
          const items = group.sectionIds
            .map((id) => sectionsById[id])
            .filter((section): section is NonNullable<typeof section> => Boolean(section));
          if (items.length === 0) return null;
          return (
            <section key={group.label} className="settings-nav-group" aria-label={group.label}>
              <h2 className="settings-nav-group__label">{group.label}</h2>
              {items.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={current.id === section.id ? "is-active" : ""}
                  data-settings-section={section.id}
                  onClick={() => setSettingsSection(section.id)}
                >
                  <Icon name={section.icon} />
                  <span>{section.label}</span>
                  {section.id === "staff" || section.id === "scheduler" ? (
                    <Badge label="STAFF" tone="violet" />
                  ) : null}
                </button>
              ))}
            </section>
          );
        })}
      </aside>
      <section className="settings-content">
        <header className="settings-content__header">
          <div>
            <h1>{current.label}</h1>
            <p>{DESCRIPTIONS[current.id] || "Read-only prototype configuration."}</p>
          </div>
          <Badge label="READ ONLY" tone="green" />
        </header>
        <details className="settings-disclosure settings-boundaries">
          <summary>Active safety boundaries</summary>
          <div className="settings-safety-strip settings-safety-strip--compact">
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
        </details>
        {current.id === "general" ? (
          <div className="settings-panel-stack">
            <AboutPanel />
            <details className="settings-disclosure">
              <summary>Runtime details</summary>
              <RuntimeIndicator />
            </details>
          </div>
        ) : null}
        {current.id === "workspace" ? <WorkspacePanel /> : null}
        {current.id === "updates" ? <UpdateCenterPanel /> : null}
        {current.id === "provider" ? <PrivateLocalModelPanel /> : null}
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
        ) : current.id === "workspace" || current.id === "updates" || current.id === "provider" ? null : (
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
