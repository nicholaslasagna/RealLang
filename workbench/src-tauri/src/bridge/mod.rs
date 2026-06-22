//! Workbench bridge - metadata IPC, read-only reports, and one approved no-write check.
//!
//! Uses `std::process::Command` with fixed argv arrays only. No shell, no shell plugin,
//! no user-supplied command text, no write/apply/scheduler commands.

mod allowlist;
mod approval;
mod approval_audit_store;
mod health;
mod private_provider_config;
mod real_files;
mod resolve_python;
mod security_scan;
mod spawn;
mod types;
mod update;
mod workspace;
mod workspace_store;

use allowlist::list_source_metadata;
use approval::run_approved_dry_run_action as spawn_approved_dry_run;
use approval_audit_store::{
    clear_approval_audit_log as clear_audit_store, load_approval_audit_log as load_audit_store,
    save_approval_audit_log as save_audit_store, ApprovalAuditClearResult, ApprovalAuditEntryInput,
    ApprovalAuditLoadResult, ApprovalAuditSaveResult,
};
use private_provider_config::{
    load_private_local_provider_config as read_private_provider_config, ProviderStatusReport,
};
use health::{check_bridge_health as compute_bridge_health, BridgeHealth};
use real_files::list_real_files as list_real;
use security_scan::{list_scan_source_meta, run_security_scan as spawn_security_scan};
use serde::Serialize;
use spawn::load_readonly_report_source as spawn_load;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use types::{
    ApprovedDryRunInput, ApprovedDryRunResult, LoadReadOnlyReportResult, RealFileListResult,
    ReadOnlyReportSourceMeta, SecurityScanResult, SecurityScanSourceMeta, WorkspacePaths,
};
use update::{check_for_update as run_update_check, get_update_status as read_update_status, UpdateCheckResult, UpdateStatus};
use workspace::{
    get_workspace_resolution as resolve_workspace, is_valid_repo_root, set_session_workspace,
    WorkspaceResolution,
};
use workspace_store::{
    clear_saved_workspace as clear_saved_store, get_saved_workspace as read_saved_workspace,
    save_workspace, SavedWorkspace,
};

const WORKBENCH_VERSION: &str = "0.16.0";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub runtime: &'static str,
    pub app_name: &'static str,
    pub workbench_version: &'static str,
    pub platform: String,
    pub arch: String,
    pub bridge_mode: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCapabilities {
    pub bridge_mode: &'static str,
    pub read_only: bool,
    pub writes: bool,
    pub network: bool,
    pub shell_execution: bool,
    pub cli_spawn: bool,
    pub approval_gated_writes: bool,
    pub approval_gated_dry_run: bool,
    pub approved_dry_run_action_count: usize,
    pub metadata_only: bool,
}

pub fn init_app_config_dir(app: &AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        workspace_store::init_config_dir(dir);
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        runtime: "desktop",
        app_name: "RealForge Workbench",
        workbench_version: WORKBENCH_VERSION,
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        bridge_mode: "read-only",
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_bridge_capabilities() -> BridgeCapabilities {
    BridgeCapabilities {
        bridge_mode: "read-only",
        read_only: true,
        writes: false,
        network: false,
        shell_execution: false,
        cli_spawn: true,
        approval_gated_writes: false,
        approval_gated_dry_run: true,
        approved_dry_run_action_count: approval::APPROVED_DRY_RUN_ACTIONS.len(),
        metadata_only: false,
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_readonly_report_sources() -> Vec<ReadOnlyReportSourceMeta> {
    list_source_metadata()
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_workspace_paths(app: AppHandle) -> Result<WorkspacePaths, String> {
    let paths = app.path();
    Ok(WorkspacePaths {
        app_data_dir: paths
            .app_data_dir()
            .ok()
            .map(|p| p.to_string_lossy().into_owned()),
        app_config_dir: paths
            .app_config_dir()
            .ok()
            .map(|p| p.to_string_lossy().into_owned()),
        resource_dir: paths
            .resource_dir()
            .ok()
            .map(|p| p.to_string_lossy().into_owned()),
        config_file: workspace_store::config_file_path()
            .map(|p| p.to_string_lossy().into_owned()),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_saved_workspace() -> Option<SavedWorkspace> {
    read_saved_workspace()
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_workspace_selection(path: String) -> Result<SavedWorkspace, String> {
    let repo_root = PathBuf::from(path.trim());
    if repo_root.as_os_str().is_empty() {
        return Err("workspace path is empty".to_string());
    }
    if !repo_root.exists() {
        return Err("workspace path does not exist".to_string());
    }
    if !is_valid_repo_root(&repo_root, |p| p.exists()) {
        return Err("path is not a valid RealForge repository root".to_string());
    }
    let saved = save_workspace(&repo_root, "saved")?;
    set_session_workspace(repo_root);
    Ok(saved)
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_saved_workspace() -> Result<(), String> {
    clear_saved_store()?;
    workspace::clear_session_workspace();
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_workspace_resolution() -> WorkspaceResolution {
    resolve_workspace()
}

#[tauri::command(rename_all = "camelCase")]
pub fn check_bridge_health() -> BridgeHealth {
    compute_bridge_health()
}

#[tauri::command(rename_all = "camelCase")]
pub async fn select_workspace_directory(app: AppHandle) -> Result<WorkspaceResolution, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Select RealForge repository root")
            .blocking_pick_folder()
    })
    .await
    .map_err(|err| format!("folder picker failed: {err}"))?;

    match picked {
        Some(path) => {
            let repo_root = dialog_path_to_path_buf(path);
            if !is_valid_repo_root(&repo_root, |p| p.exists()) {
                return Err("path is not a valid RealForge repository root".to_string());
            }
            save_workspace(&repo_root, "selected_by_user")?;
            set_session_workspace(repo_root);
            Ok(resolve_workspace())
        }
        None => Err("folder_selection_cancelled".to_string()),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_update_status() -> UpdateStatus {
    read_update_status()
}

#[tauri::command(rename_all = "camelCase")]
pub fn check_for_update() -> UpdateCheckResult {
    run_update_check()
}

#[tauri::command(rename_all = "camelCase")]
pub fn load_readonly_report_source(source_id: String) -> LoadReadOnlyReportResult {
    spawn_load(&source_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_security_scan_sources() -> Vec<SecurityScanSourceMeta> {
    list_scan_source_meta()
}

#[tauri::command(rename_all = "camelCase")]
pub fn run_security_scan_source(source_id: String) -> SecurityScanResult {
    spawn_security_scan(&source_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_real_files() -> RealFileListResult {
    list_real()
}

#[tauri::command(rename_all = "camelCase")]
pub fn run_approved_dry_run_action(
    action_id: String,
    input: ApprovedDryRunInput,
) -> ApprovedDryRunResult {
    spawn_approved_dry_run(&action_id, input)
}

#[tauri::command(rename_all = "camelCase")]
pub fn load_approval_audit_log() -> ApprovalAuditLoadResult {
    load_audit_store()
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_approval_audit_log(entries: Vec<ApprovalAuditEntryInput>) -> ApprovalAuditSaveResult {
    save_audit_store(entries)
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_approval_audit_log() -> ApprovalAuditClearResult {
    clear_audit_store()
}

#[tauri::command(rename_all = "camelCase")]
pub fn load_private_local_provider_config() -> ProviderStatusReport {
    read_private_provider_config()
}

fn dialog_path_to_path_buf(path: FilePath) -> PathBuf {
    match path {
        FilePath::Path(path_buf) => path_buf,
        FilePath::Url(url) => PathBuf::from(url.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use allowlist::{get_allowlisted_source, ALLOWLISTED_SOURCES, DENIED_SUBCOMMANDS};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    use workspace::{resolve_workspace_with, WorkspaceResolutionStatus};
    use workspace_store::init_config_dir;

    #[test]
    fn bridge_capabilities_allow_readonly_cli_spawn() {
        let caps = get_bridge_capabilities();
        assert!(!caps.metadata_only);
        assert!(caps.cli_spawn);
        assert!(!caps.shell_execution);
        assert!(!caps.writes);
        assert!(!caps.network);
        assert!(caps.approval_gated_dry_run);
        assert_eq!(caps.approved_dry_run_action_count, 2);
        assert_eq!(caps.bridge_mode, "read-only");
    }

    #[test]
    fn allowlist_contains_only_three_source_ids() {
        assert_eq!(ALLOWLISTED_SOURCES.len(), 3);
        for id in ["capabilities", "slash", "settings-doctor"] {
            assert!(get_allowlisted_source(id).is_some());
        }
        assert!(get_allowlisted_source("scheduler-run").is_none());
    }

    #[test]
    fn denied_subcommands_exclude_write_paths() {
        for denied in [
            "apply-proposal",
            "scheduler-run",
            "update-bundle",
            "propose-patch",
        ] {
            assert!(DENIED_SUBCOMMANDS.contains(&denied));
        }
    }

    #[test]
    fn unknown_source_returns_structured_error() {
        let result = load_readonly_report_source("not-a-source".to_string());
        assert!(!result.ok);
        assert_eq!(result.error.as_ref().unwrap().code, "unknown_source");
    }

    #[test]
    fn workspace_resolution_from_env() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rf-ipc-env-{stamp}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src/realforge")).unwrap();
        fs::create_dir_all(root.join("workbench")).unwrap();
        fs::write(root.join("workbench/package.json"), "{}").unwrap();
        let resolution =
            resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.status, WorkspaceResolutionStatus::VenvMissing);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_invalid_workspace_save() {
        let _serialize = workspace_store::lock_config_dir_for_test();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-ws-store-invalid-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        init_config_dir(dir.clone());
        let invalid = std::env::temp_dir().join(format!("rf-invalid-root-{stamp}"));
        let _ = fs::remove_dir_all(&invalid);
        fs::create_dir_all(&invalid).unwrap();
        let err = save_workspace_selection(invalid.to_string_lossy().into()).unwrap_err();
        assert!(err.contains("not a valid RealForge repository"));
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&invalid);
    }

    #[test]
    fn workspace_config_stays_under_app_config_dir() {
        let _serialize = workspace_store::lock_config_dir_for_test();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-ws-app-config-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        init_config_dir(dir.clone());
        let _ = clear_saved_store();
        let repo = std::env::temp_dir().join(format!("rf-valid-repo-{stamp}"));
        let _ = fs::remove_dir_all(&repo);
        fs::create_dir_all(repo.join("src/realforge")).unwrap();
        fs::create_dir_all(repo.join("workbench")).unwrap();
        fs::write(repo.join("workbench/package.json"), "{}").unwrap();
        save_workspace_selection(repo.to_string_lossy().into()).unwrap();
        let config_path = workspace_store::config_file_path().unwrap();
        assert!(config_path.starts_with(&dir));
        clear_saved_workspace().unwrap();
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&repo);
    }
}
