//! Read-only bridge health checks (metadata + optional allowlisted probe).

use super::spawn::{probe_capabilities_json, DEFAULT_MAX_OUTPUT_BYTES};
use super::workspace_store;
use super::workspace::{
    get_workspace_resolution, WorkspaceResolution, WorkspaceResolutionStatus,
};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeHealth {
    pub resolution: WorkspaceResolution,
    pub healthy: bool,
    pub probe_attempted: bool,
    pub probe_ok: bool,
    pub probe_source_id: Option<String>,
    pub next_actions: Vec<String>,
}

pub fn check_bridge_health() -> BridgeHealth {
    let mut resolution = get_workspace_resolution();
    let mut probe_attempted = false;
    let mut probe_ok = false;
    let mut probe_source_id = None;

    if resolution.status == WorkspaceResolutionStatus::Ready {
        if let (Some(repo), Some(python)) = (
            resolution.repo_root.as_ref().map(PathBuf::from),
            resolution.python_path.as_ref().map(PathBuf::from),
        ) {
            probe_attempted = true;
            probe_source_id = Some("capabilities".to_string());
            probe_ok = probe_capabilities_json(&python, &repo, 8_000, DEFAULT_MAX_OUTPUT_BYTES);
            if !probe_ok {
                resolution.status = WorkspaceResolutionStatus::CliUnavailable;
                if resolution.errors.is_empty() {
                    resolution.errors.push(
                        "RealForge CLI is not available from the resolved Python interpreter."
                            .to_string(),
                    );
                }
            }
        }
    }

    let next_actions = next_actions_for(&resolution);
    let healthy = resolution.status == WorkspaceResolutionStatus::Ready && probe_ok;

    workspace_store::record_health_summary(
        match resolution.status {
            WorkspaceResolutionStatus::Ready if probe_ok => "ready",
            WorkspaceResolutionStatus::Ready => "cli_unavailable",
            WorkspaceResolutionStatus::FoundBySaved => "found_by_saved",
            WorkspaceResolutionStatus::FoundByEnv => "found_by_env",
            WorkspaceResolutionStatus::FoundByWalkup => "found_by_walkup",
            WorkspaceResolutionStatus::SelectedByUser => "selected_by_user",
            WorkspaceResolutionStatus::SavedPathMissing => "saved_path_missing",
            WorkspaceResolutionStatus::Missing => "missing",
            WorkspaceResolutionStatus::Invalid => "invalid",
            WorkspaceResolutionStatus::CliUnavailable => "cli_unavailable",
            WorkspaceResolutionStatus::VenvMissing => "venv_missing",
            WorkspaceResolutionStatus::PythonMissing => "python_missing",
        },
        healthy,
    );

    BridgeHealth {
        resolution,
        healthy,
        probe_attempted,
        probe_ok,
        probe_source_id,
        next_actions,
    }
}

fn next_actions_for(resolution: &WorkspaceResolution) -> Vec<String> {
    match resolution.status {
        WorkspaceResolutionStatus::SavedPathMissing => vec![
            "Choose a new RealForge repository folder.".to_string(),
            "Or clear the saved workspace to fall back to REALFORGE_REPO_ROOT or automatic discovery.".to_string(),
        ],
        WorkspaceResolutionStatus::Missing => vec![
            "Select your RealForge repository folder in Settings → Workspace.".to_string(),
            "Or set REALFORGE_REPO_ROOT to your repo root and restart the app.".to_string(),
        ],
        WorkspaceResolutionStatus::Invalid => vec![
            "Choose a folder that contains workbench/package.json and src/realforge/.".to_string(),
        ],
        WorkspaceResolutionStatus::VenvMissing => vec![
            "From the repository root, create a virtualenv: python3 -m venv .venv".to_string(),
            "Then install RealForge: pip install -e \".[dev]\"".to_string(),
        ],
        WorkspaceResolutionStatus::PythonMissing => vec![
            "Repair the .venv interpreter or recreate the virtualenv.".to_string(),
            "On Windows use .venv\\Scripts\\python.exe; on macOS/Linux use .venv/bin/python.".to_string(),
        ],
        WorkspaceResolutionStatus::CliUnavailable => vec![
            "Install RealForge into the virtualenv: pip install -e \".[dev]\"".to_string(),
            "Retry the health check after installation.".to_string(),
        ],
        WorkspaceResolutionStatus::Ready => vec![
            "Load read-only reports from the Reports screen.".to_string(),
        ],
        WorkspaceResolutionStatus::FoundByEnv
        | WorkspaceResolutionStatus::FoundByWalkup
        | WorkspaceResolutionStatus::FoundBySaved
        | WorkspaceResolutionStatus::SelectedByUser => resolution
            .errors
            .first()
            .map(|e| format!("Resolve workspace issue: {e}"))
            .into_iter()
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::workspace::{resolve_workspace_with, WorkspaceResolutionStatus};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn health_reports_missing_python_cleanly() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rf-health-{stamp}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src/realforge")).unwrap();
        fs::create_dir_all(root.join("workbench")).unwrap();
        fs::write(root.join("workbench/package.json"), "{}").unwrap();
        fs::create_dir_all(root.join(".venv/bin")).unwrap();

        let resolution =
            resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.status, WorkspaceResolutionStatus::PythonMissing);
        let actions = next_actions_for(&resolution);
        assert!(!actions.is_empty());
        let _ = fs::remove_dir_all(&root);
    }
}
