//! RealForge workspace discovery and validation for the desktop bridge.

use super::allowlist::list_source_metadata;
use super::resolve_python::{join_candidate, resolve_python_with, VENV_PYTHON_CANDIDATES};
use super::types::ReadOnlyReportSourceMeta;
use super::workspace_store;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static SESSION_WORKSPACE: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceResolutionStatus {
    FoundBySaved,
    FoundByEnv,
    FoundByWalkup,
    SelectedByUser,
    SavedPathMissing,
    Missing,
    Invalid,
    CliUnavailable,
    VenvMissing,
    PythonMissing,
    Ready,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResolution {
    pub status: WorkspaceResolutionStatus,
    pub repo_root: Option<String>,
    pub workbench_path: Option<String>,
    pub python_path: Option<String>,
    pub discovery_method: String,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub bridge_mode: &'static str,
    pub platform: String,
    pub arch: String,
    pub supported_sources: Vec<ReadOnlyReportSourceMeta>,
}

pub fn set_session_workspace(path: PathBuf) {
    if let Ok(mut guard) = SESSION_WORKSPACE.lock() {
        *guard = Some(path);
    }
}

pub fn clear_session_workspace() {
    if let Ok(mut guard) = SESSION_WORKSPACE.lock() {
        *guard = None;
    }
}

pub fn session_workspace() -> Option<PathBuf> {
    SESSION_WORKSPACE.lock().ok().and_then(|g| g.clone())
}

pub fn resolve_repo_root_for_spawn() -> PathBuf {
    get_workspace_resolution().repo_root
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn get_workspace_resolution() -> WorkspaceResolution {
    let saved = workspace_store::get_saved_workspace().map(|entry| entry.repo_root);
    resolve_workspace_with(
        |p| p.exists(),
        std::env::var("REALFORGE_REPO_ROOT").ok(),
        saved,
        session_workspace(),
    )
}

pub fn resolve_workspace_with<F>(
    exists: F,
    env_override: Option<String>,
    saved_root: Option<String>,
    session_root: Option<PathBuf>,
) -> WorkspaceResolution
where
    F: Fn(&Path) -> bool + Copy,
{
    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let supported_sources = list_source_metadata();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if let Some(saved) = saved_root {
        let path = PathBuf::from(saved.trim());
        if path.as_os_str().is_empty() {
            warnings.push("Saved workspace path is empty.".to_string());
        } else if !exists(&path) {
            return WorkspaceResolution {
                status: WorkspaceResolutionStatus::SavedPathMissing,
                repo_root: Some(path.to_string_lossy().into_owned()),
                workbench_path: None,
                python_path: None,
                discovery_method: "saved".to_string(),
                errors: vec![
                    "Saved workspace moved or deleted.".to_string(),
                    format!(
                        "The persisted path no longer exists: {}",
                        path.to_string_lossy()
                    ),
                ],
                warnings,
                bridge_mode: "read-only",
                platform,
                arch,
                supported_sources,
            };
        }
        return finalize_resolution(
            path,
            WorkspaceResolutionStatus::FoundBySaved,
            "saved",
            &platform,
            &arch,
            supported_sources,
            &exists,
            &mut errors,
            &mut warnings,
        );
    }

    if let Some(selected) = session_root {
        return finalize_resolution(
            selected,
            WorkspaceResolutionStatus::SelectedByUser,
            "selected_by_user",
            &platform,
            &arch,
            supported_sources,
            &exists,
            &mut errors,
            &mut warnings,
        );
    }

    if let Some(env_root) = env_override {
        let path = PathBuf::from(env_root.trim());
        if path.as_os_str().is_empty() {
            warnings.push("REALFORGE_REPO_ROOT is set but empty.".to_string());
        } else if exists(&path) {
            return finalize_resolution(
                path,
                WorkspaceResolutionStatus::FoundByEnv,
                "found_by_env",
                &platform,
                &arch,
                supported_sources,
                &exists,
                &mut errors,
                &mut warnings,
            );
        } else {
            errors.push(format!(
                "REALFORGE_REPO_ROOT points to a missing directory: {}",
                path.to_string_lossy()
            ));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = find_repo_root(&cwd, &exists) {
            return finalize_resolution(
                root,
                WorkspaceResolutionStatus::FoundByWalkup,
                "found_by_walkup",
                &platform,
                &arch,
                supported_sources,
                &exists,
                &mut errors,
                &mut warnings,
            );
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(root) = find_repo_root(parent, &exists) {
                return finalize_resolution(
                    root,
                    WorkspaceResolutionStatus::FoundByWalkup,
                    "found_by_walkup",
                    &platform,
                    &arch,
                    supported_sources,
                    &exists,
                    &mut errors,
                    &mut warnings,
                );
            }
        }
    }

    WorkspaceResolution {
        status: WorkspaceResolutionStatus::Missing,
        repo_root: None,
        workbench_path: None,
        python_path: None,
        discovery_method: "missing".to_string(),
        errors: if errors.is_empty() {
            vec!["RealForge repository root was not found. Select your workspace or set REALFORGE_REPO_ROOT.".to_string()]
        } else {
            errors
        },
        warnings,
        bridge_mode: "read-only",
        platform,
        arch,
        supported_sources,
    }
}

fn finalize_resolution<F>(
    repo_root: PathBuf,
    discovery_status: WorkspaceResolutionStatus,
    discovery_method: &str,
    platform: &str,
    arch: &str,
    supported_sources: Vec<ReadOnlyReportSourceMeta>,
    exists: &F,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> WorkspaceResolution
where
    F: Fn(&Path) -> bool,
{
    if !is_valid_repo_root(&repo_root, exists) {
        return WorkspaceResolution {
            status: WorkspaceResolutionStatus::Invalid,
            repo_root: Some(repo_root.to_string_lossy().into_owned()),
            workbench_path: Some(repo_root.join("workbench").to_string_lossy().into_owned()),
            python_path: None,
            discovery_method: discovery_method.to_string(),
            errors: vec![format!(
                "Selected path is not a RealForge repository: {}",
                repo_root.to_string_lossy()
            )],
            warnings: warnings.clone(),
            bridge_mode: "read-only",
            platform: platform.to_string(),
            arch: arch.to_string(),
            supported_sources,
        };
    }

    let workbench_path = repo_root.join("workbench");
    let venv_dir = repo_root.join(".venv");
    let venv_present = exists(&venv_dir);

    if !venv_present {
        return WorkspaceResolution {
            status: WorkspaceResolutionStatus::VenvMissing,
            repo_root: Some(repo_root.to_string_lossy().into_owned()),
            workbench_path: Some(workbench_path.to_string_lossy().into_owned()),
            python_path: None,
            discovery_method: discovery_method.to_string(),
            errors: vec!["Python virtualenv (.venv) was not found in the repository.".to_string()],
            warnings: warnings.clone(),
            bridge_mode: "read-only",
            platform: platform.to_string(),
            arch: arch.to_string(),
            supported_sources,
        };
    }

    let venv_python = find_venv_python(&repo_root, exists);
    if let Some(python) = venv_python {
        return WorkspaceResolution {
            status: WorkspaceResolutionStatus::Ready,
            repo_root: Some(repo_root.to_string_lossy().into_owned()),
            workbench_path: Some(workbench_path.to_string_lossy().into_owned()),
            python_path: Some(python.to_string_lossy().into_owned()),
            discovery_method: discovery_method.to_string(),
            errors: errors.clone(),
            warnings: warnings.clone(),
            bridge_mode: "read-only",
            platform: platform.to_string(),
            arch: arch.to_string(),
            supported_sources,
        };
    }

    let fallback = resolve_python_with(&repo_root, exists).ok();
    let _ = discovery_status;
    WorkspaceResolution {
        status: WorkspaceResolutionStatus::PythonMissing,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        workbench_path: Some(workbench_path.to_string_lossy().into_owned()),
        python_path: fallback.map(|p| p.to_string_lossy().into_owned()),
        discovery_method: discovery_method.to_string(),
        errors: vec![
            "A .venv folder exists but no Python interpreter was found inside it.".to_string()
        ],
        warnings: warnings.clone(),
        bridge_mode: "read-only",
        platform: platform.to_string(),
        arch: arch.to_string(),
        supported_sources,
    }
}

pub fn is_valid_repo_root(path: &Path, exists: impl Fn(&Path) -> bool) -> bool {
    let has_workbench = exists(&path.join("workbench").join("package.json"));
    let has_realforge = exists(&path.join("src").join("realforge"));
    let has_pyproject = exists(&path.join("pyproject.toml"));
    has_workbench && (has_realforge || has_pyproject)
}

fn find_repo_root(start: &Path, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    for _ in 0..12 {
        if is_valid_repo_root(&current, &exists) {
            return Some(current);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

fn find_venv_python(repo_root: &Path, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    for parts in VENV_PYTHON_CANDIDATES {
        let candidate = join_candidate(repo_root, parts);
        if exists(&candidate) {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-ws-{name}-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("src/realforge")).unwrap();
        fs::create_dir_all(dir.join("workbench")).unwrap();
        fs::write(dir.join("workbench/package.json"), "{}").unwrap();
        fs::write(dir.join("pyproject.toml"), "[project]\nname='rf'\n").unwrap();
        dir
    }

    #[test]
    fn resolves_from_env() {
        let root = temp_repo("env");
        let resolution = resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.discovery_method, "found_by_env");
        assert_eq!(resolution.status, WorkspaceResolutionStatus::VenvMissing);
        assert_eq!(resolution.repo_root.as_deref(), Some(root.to_str().unwrap()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_invalid_root() {
        let root = std::env::temp_dir().join("rf-ws-invalid-empty");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let resolution = resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.status, WorkspaceResolutionStatus::Invalid);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_venv_missing() {
        let root = temp_repo("venv-missing");
        let resolution = resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.status, WorkspaceResolutionStatus::VenvMissing);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_ready_with_venv_python() {
        let root = temp_repo("ready");
        let python = root.join(".venv").join("bin").join("python");
        fs::create_dir_all(python.parent().unwrap()).unwrap();
        fs::write(&python, b"").unwrap();
        let resolution = resolve_workspace_with(|p| p.exists(), Some(root.to_string_lossy().into()), None, None);
        assert_eq!(resolution.status, WorkspaceResolutionStatus::Ready);
        assert!(resolution.python_path.is_some());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn saved_missing_path_reports_saved_path_missing() {
        let missing = std::env::temp_dir().join("rf-ws-missing-does-not-exist");
        let resolution = resolve_workspace_with(
            |p| p.exists(),
            None,
            Some(missing.to_string_lossy().into()),
            None,
        );
        assert_eq!(resolution.status, WorkspaceResolutionStatus::SavedPathMissing);
        assert_eq!(resolution.discovery_method, "saved");
        assert!(resolution.errors.iter().any(|e| e.contains("moved or deleted")));
    }

    #[test]
    fn saved_workspace_beats_env() {
        let saved = temp_repo("saved-priority");
        let env = temp_repo("env-priority");
        let resolution = resolve_workspace_with(
            |p| p.exists(),
            Some(env.to_string_lossy().into()),
            Some(saved.to_string_lossy().into()),
            None,
        );
        assert_eq!(resolution.discovery_method, "saved");
        assert_eq!(resolution.repo_root.as_deref(), Some(saved.to_str().unwrap()));
        let _ = fs::remove_dir_all(&saved);
        let _ = fs::remove_dir_all(&env);
    }
}
