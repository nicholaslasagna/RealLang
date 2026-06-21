//! Persisted workspace selection — app config dir only (macOS / Windows / Linux).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CONFIG_FILE: &str = "workspace.json";

static CONFIG_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

// Test-only serialization lock. The process-global CONFIG_DIR is shared across
// all tests, so tests that set it (via init_config_dir) must run one at a time to
// avoid racing each other under the default parallel `cargo test`. Production code
// never touches this; `check:tauri` runs with --test-threads=1 regardless.
#[cfg(test)]
pub(crate) static CONFIG_DIR_TEST_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
pub(crate) fn lock_config_dir_for_test() -> std::sync::MutexGuard<'static, ()> {
    CONFIG_DIR_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedWorkspace {
    pub repo_root: String,
    pub discovery_method: String,
    pub saved_at: String,
    pub last_health_ok_at: Option<String>,
    pub last_health_status: Option<String>,
}

pub fn init_config_dir(dir: PathBuf) {
    if let Ok(mut guard) = CONFIG_DIR.lock() {
        *guard = Some(dir);
    }
}

pub fn config_dir() -> Option<PathBuf> {
    CONFIG_DIR.lock().ok().and_then(|g| g.clone())
}

pub fn config_file_path() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join(CONFIG_FILE))
}

pub fn get_saved_workspace() -> Option<SavedWorkspace> {
    let path = config_file_path()?;
    let text = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_workspace(repo_root: &Path, discovery_method: &str) -> Result<SavedWorkspace, String> {
    let dir = config_dir().ok_or_else(|| "app config directory is not initialized".to_string())?;
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create config directory: {err}"))?;

    let saved = SavedWorkspace {
        repo_root: repo_root.to_string_lossy().into_owned(),
        discovery_method: discovery_method.to_string(),
        saved_at: now_timestamp(),
        last_health_ok_at: None,
        last_health_status: None,
    };

    let path = dir.join(CONFIG_FILE);
    let payload = serde_json::to_string_pretty(&saved)
        .map_err(|err| format!("failed to encode workspace config: {err}"))?;
    fs::write(&path, payload).map_err(|err| format!("failed to write workspace config: {err}"))?;
    Ok(saved)
}

pub fn clear_saved_workspace() -> Result<(), String> {
    if let Some(path) = config_file_path() {
        if path.is_file() {
            fs::remove_file(&path).map_err(|err| format!("failed to remove workspace config: {err}"))?;
        }
    }
    Ok(())
}

pub fn record_health_summary(status: &str, healthy: bool) {
    let Some(mut saved) = get_saved_workspace() else {
        return;
    };
    saved.last_health_status = Some(status.to_string());
    if healthy {
        saved.last_health_ok_at = Some(now_timestamp());
    }
    if let Some(dir) = config_dir() {
        let path = dir.join(CONFIG_FILE);
        if let Ok(payload) = serde_json::to_string_pretty(&saved) {
            let _ = fs::write(path, payload);
        }
    }
}

fn now_timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_config_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-ws-store-{name}-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn saves_and_loads_workspace_under_config_dir() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("save");
        init_config_dir(dir.clone());
        let _ = clear_saved_workspace();
        let repo = dir.join("mock-repo");
        fs::create_dir_all(&repo).unwrap();
        let saved = save_workspace(&repo, "saved").unwrap();
        assert_eq!(saved.repo_root, repo.to_string_lossy());
        assert_eq!(saved.discovery_method, "saved");
        let loaded = get_saved_workspace().unwrap();
        assert_eq!(loaded, saved);
        assert_eq!(config_file_path().unwrap().parent().unwrap(), &dir);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clears_saved_workspace() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("clear");
        init_config_dir(dir.clone());
        let repo = dir.join("mock-repo");
        fs::create_dir_all(&repo).unwrap();
        save_workspace(&repo, "saved").unwrap();
        clear_saved_workspace().unwrap();
        assert!(get_saved_workspace().is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
