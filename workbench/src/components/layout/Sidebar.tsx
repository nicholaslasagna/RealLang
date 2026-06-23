import { getWorkbenchData } from "../../data/workbench-data";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Icon } from "../primitives";

export function Sidebar() {
  const screen = useWorkbenchStore((s) => s.screen);
  const staffPreview = useWorkbenchStore((s) => s.staffPreview);
  const navigate = useWorkbenchStore((s) => s.navigate);
  const data = getWorkbenchData();
  const groups = [...new Set(data.navigation.map((item) => item.group))];

  return (
    <>
      <div className="sidebar-scroll">
        {groups.map((group) => (
          <section key={group} className="nav-group" aria-labelledby={`nav-${group.toLowerCase()}`}>
            <h2 id={`nav-${group.toLowerCase()}`}>{group}</h2>
            {data.navigation
              .filter((item) => item.group === group)
              .map((item) => {
                const active = screen === item.id;
                const locked = item.id === "updates" && !staffPreview;
                const primary = item.id === "workbench";
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${active ? "is-active" : ""} ${primary ? "nav-item--primary" : ""}`.trim()}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {locked ? <Icon name="lock" className="nav-lock" /> : null}
                  </button>
                );
              })}
          </section>
        ))}
      </div>
      <div className="sidebar-version">
        <div>
          <Icon name="git-commit-horizontal" />
          <strong>Workbench {data.workbenchVersion}</strong>
        </div>
        <p>
          <span className="sidebar-backend">RealForge backend {data.version}</span>
          Read-only · output untrusted until validated.
        </p>
      </div>
    </>
  );
}
