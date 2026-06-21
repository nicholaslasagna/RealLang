import type { WorkspaceResolutionStatus } from "./types";

const STATUS_LABELS: Record<WorkspaceResolutionStatus, string> = {
  unknown: "Unknown",
  found_by_saved: "Saved workspace",
  found_by_env: "Found via REALFORGE_REPO_ROOT",
  found_by_walkup: "Found automatically",
  selected_by_user: "Selected by you",
  saved_path_missing: "Saved workspace missing",
  missing: "Not found",
  invalid: "Invalid folder",
  cli_unavailable: "CLI unavailable",
  venv_missing: "Virtualenv missing",
  python_missing: "Python missing",
  ready: "Ready"
};

const STATUS_TONES: Record<WorkspaceResolutionStatus, "green" | "cyan" | "amber" | "violet" | "neutral"> = {
  unknown: "neutral",
  found_by_saved: "cyan",
  found_by_env: "cyan",
  found_by_walkup: "cyan",
  selected_by_user: "cyan",
  saved_path_missing: "violet",
  missing: "amber",
  invalid: "violet",
  cli_unavailable: "amber",
  venv_missing: "amber",
  python_missing: "amber",
  ready: "green"
};

export function workspaceStatusLabel(status: WorkspaceResolutionStatus): string {
  return STATUS_LABELS[status];
}

export function workspaceStatusTone(
  status: WorkspaceResolutionStatus
): "green" | "cyan" | "amber" | "violet" | "neutral" {
  return STATUS_TONES[status];
}

export function discoveryMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    saved: "Persisted selection",
    selected_by_user: "Session folder picker",
    found_by_env: "REALFORGE_REPO_ROOT",
    found_by_walkup: "Automatic walk-up",
    web_preview: "Web preview",
    missing: "Not configured"
  };
  return labels[method] ?? method;
}

export function updateStatusLabel(state: string): string {
  const labels: Record<string, string> = {
    unavailable_web: "Unavailable in web",
    not_configured: "Not configured",
    missing_public_key: "Missing public key",
    missing_endpoint: "Missing endpoint",
    ready_to_check: "Ready to check",
    checking: "Checking…",
    update_available: "Update available",
    up_to_date: "Up to date",
    download_ready: "Download ready",
    install_and_restart: "Install and restart",
    error: "Error"
  };
  return labels[state] ?? state;
}

export function platformDisplayName(platform: string): string {
  if (platform === "macos" || platform === "darwin") return "macOS";
  if (platform === "windows") return "Windows";
  if (platform === "linux") return "Linux";
  return platform;
}
