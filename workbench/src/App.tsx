import { useEffect, useRef } from "react";
import { CommandPalette } from "./components/layout/CommandPalette";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusRail } from "./components/layout/StatusRail";
import { ToastRegion } from "./components/layout/ToastRegion";
import { Topbar } from "./components/layout/Topbar";
import { MainRouter } from "./components/MainRouter";
import { useWorkbenchStore } from "./state/workbench-store";
import { bindGlobalShortcuts } from "./platform/shortcuts";

export default function App() {
  const screen = useWorkbenchStore((s) => s.screen);
  const workbenchMode = useWorkbenchStore((s) => s.workbenchMode);
  const sidebarOpen = useWorkbenchStore((s) => s.sidebarOpen);
  const openPalette = useWorkbenchStore((s) => s.openPalette);
  const initializeApprovalAuditHistory = useWorkbenchStore((s) => s.initializeApprovalAuditHistory);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(
    () =>
      bindGlobalShortcuts({
        openPalette,
        toggleSidebarOff: () => {
          if (useWorkbenchStore.getState().sidebarOpen) {
            useWorkbenchStore.setState({ sidebarOpen: false });
          }
        }
      }),
    [openPalette]
  );

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => {
    void initializeApprovalAuditHistory();
  }, [initializeApprovalAuditHistory]);

  return (
    <>
      <div
        id="app"
        className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}
        data-screen={screen}
        data-workbench-mode={screen === "workbench" ? workbenchMode : "default"}
      >
        <header id="topbar" className="topbar" aria-label="Environment status">
          <Topbar />
        </header>
        <div className="app-body">
          <nav id="sidebar" className="sidebar" aria-label="RealForge sections">
            <Sidebar />
          </nav>
          <main id="main" className="main-panel" tabIndex={-1} ref={mainRef}>
            <MainRouter />
          </main>
        </div>
        <footer id="status-rail" className="status-rail" aria-label="Operation status">
          <StatusRail />
        </footer>
      </div>
      <CommandPalette />
      <ToastRegion />
    </>
  );
}
