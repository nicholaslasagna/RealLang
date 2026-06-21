import { useWorkbenchStore } from "../state/workbench-store";
import { CapabilitiesScreen } from "../features/capabilities/CapabilitiesScreen";
import { BenchmarksScreen } from "../features/benchmarks/BenchmarksScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { ReportsScreen } from "../features/reports/ReportsScreen";
import { SecurityScreen } from "../features/security/SecurityScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { CodeScreen, ResearchScreen } from "../features/studio/DomainScreens";
import { StudioScreen } from "../features/studio/StudioScreen";
import { UpdatesScreen } from "../features/updates/UpdatesScreen";
import { WorkbenchScreen } from "../features/workbench/WorkbenchScreen";

export function MainRouter() {
  const screen = useWorkbenchStore((s) => s.screen);

  switch (screen) {
    case "home":
      return <HomeScreen />;
    case "workbench":
      return <WorkbenchScreen />;
    case "capabilities":
      return <CapabilitiesScreen />;
    case "code":
      return <CodeScreen />;
    case "research":
      return <ResearchScreen />;
    case "creative":
    case "image":
    case "vision":
    case "engine":
    case "assets":
      return <StudioScreen screen={screen} />;
    case "benchmarks":
      return <BenchmarksScreen />;
    case "reports":
      return <ReportsScreen />;
    case "security":
      return <SecurityScreen />;
    case "updates":
      return <UpdatesScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}
