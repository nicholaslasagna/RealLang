import type { PrivateProviderReadiness } from "../../providers";

export function homeNextStepMessage(
  readiness: PrivateProviderReadiness,
  desktopAvailable: boolean,
  loading: boolean
): string {
  if (loading) return "Loading sanitized provider status…";
  if (!desktopAvailable) {
    return "Web preview is read-only. Open the desktop app for local provider smoke, chat sandbox, and approval-gated checks.";
  }
  if (readiness.overallReadiness === "error") {
    return "Fix your home private provider config, then refresh status in Settings → Provider.";
  }
  if (!readiness.configDetected || readiness.overallReadiness === "not_configured") {
    return "Set up your user-configured local model in home private config, then review readiness in Settings → Provider.";
  }
  if (readiness.smokeLastStatus === "not_run") {
    return "Provider looks configured. Run the fixed smoke check in Settings → Provider when you want to verify reachability.";
  }
  return "Open Workbench to describe a task, preview actions, or ask the local model sandbox.";
}
