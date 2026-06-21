//! Sanitized approval audit persistence under the Tauri app-config directory.
//!
//! This is a fixed-file metadata store, not a general write bridge. It accepts no
//! path, command, argv, workspace, environment, provider, or network input.

use super::types::BridgeError;
use super::workspace_store::config_dir;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const AUDIT_SCHEMA_VERSION: u32 = 1;
pub const AUDIT_FILE_NAME: &str = "approval-audit-log.json";
const AUDIT_TEMP_FILE_NAME: &str = "approval-audit-log.json.tmp";
pub const MAX_AUDIT_ENTRIES: usize = 50;
pub const MAX_AUDIT_FILE_BYTES: u64 = 128 * 1024;
pub const MAX_AUDIT_PREVIEW_CHARS: usize = 2_048;
const MAX_ID_LEN: usize = 128;
const MAX_TIMESTAMP_LEN: usize = 64;
const MAX_RELATIVE_PATH_LEN: usize = 512;
const MAX_ERROR_CODE_LEN: usize = 64;
const MAX_DURATION_MS: u64 = 86_400_000;

const CANONICAL_SAFETY_LABELS: &[&str] = &[
    "APPROVED",
    "DRY RUN",
    "UNTRUSTED OUTPUT",
    "NO WRITES",
    "NETWORK OFF",
    "LOCAL ONLY",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovalAuditEntryInput {
    pub id: String,
    pub timestamp: String,
    pub action_id: String,
    pub action_title: String,
    pub target_kind: String,
    #[serde(default)]
    pub target_relative_path: Option<String>,
    pub workspace_label: String,
    pub command_summary: String,
    pub acknowledgement_kind: String,
    pub status: String,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    #[serde(default)]
    pub stdout_preview: Option<String>,
    #[serde(default)]
    pub stderr_preview: Option<String>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub untrusted_output: bool,
    pub writes_files: bool,
    pub network_required: bool,
    #[serde(default)]
    pub safety_labels: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistedApprovalAuditEntry {
    pub id: String,
    pub timestamp: String,
    pub action_id: String,
    pub action_title: String,
    pub target_kind: String,
    pub target_relative_path: String,
    pub workspace_label: String,
    pub command_summary: String,
    pub acknowledgement_kind: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub untrusted_output: bool,
    pub writes_files: bool,
    pub network_required: bool,
    pub safety_labels: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditLog {
    pub version: u32,
    pub saved_at: String,
    pub entries: Vec<PersistedApprovalAuditEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawApprovalAuditLog {
    version: u32,
    saved_at: String,
    entries: Vec<ApprovalAuditEntryInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditWarning {
    pub code: String,
    pub message: String,
    pub dropped_entries: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditLoadResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ApprovalAuditLog>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<ApprovalAuditWarning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditSaveResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ApprovalAuditLog>,
    pub dropped_entries: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalAuditClearResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

pub fn approval_audit_file_path() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join(AUDIT_FILE_NAME))
}

fn empty_log() -> ApprovalAuditLog {
    ApprovalAuditLog {
        version: AUDIT_SCHEMA_VERSION,
        saved_at: now_timestamp(),
        entries: Vec::new(),
    }
}

impl ApprovalAuditLoadResult {
    fn success(data: ApprovalAuditLog, warning: Option<ApprovalAuditWarning>) -> Self {
        Self {
            ok: true,
            data: Some(data),
            warning,
            error: None,
        }
    }

    fn failure(code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            warning: None,
            error: Some(BridgeError {
                code: code.to_string(),
                message: message.into(),
            }),
        }
    }
}

impl ApprovalAuditSaveResult {
    fn success(data: ApprovalAuditLog, dropped_entries: usize) -> Self {
        Self {
            ok: true,
            data: Some(data),
            dropped_entries,
            error: None,
        }
    }

    fn failure(code: &str, message: impl Into<String>, dropped_entries: usize) -> Self {
        Self {
            ok: false,
            data: None,
            dropped_entries,
            error: Some(BridgeError {
                code: code.to_string(),
                message: message.into(),
            }),
        }
    }
}

impl ApprovalAuditClearResult {
    fn success() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }

    fn failure(code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(BridgeError {
                code: code.to_string(),
                message: message.into(),
            }),
        }
    }
}

pub fn load_approval_audit_log() -> ApprovalAuditLoadResult {
    let Some(path) = approval_audit_file_path() else {
        return ApprovalAuditLoadResult::failure(
            "config_unavailable",
            "app config directory is not initialized",
        );
    };
    if !path.exists() {
        return ApprovalAuditLoadResult::success(empty_log(), None);
    }
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(err) => {
            return ApprovalAuditLoadResult::success(
                empty_log(),
                Some(warning(
                    "audit_read_failed",
                    format!("audit metadata could not be read: {err}"),
                    0,
                )),
            )
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return ApprovalAuditLoadResult::success(
            empty_log(),
            Some(warning(
                "unsafe_audit_file",
                "audit path is not a regular app-config file",
                0,
            )),
        );
    }
    if metadata.len() > MAX_AUDIT_FILE_BYTES {
        return ApprovalAuditLoadResult::success(
            empty_log(),
            Some(warning(
                "audit_file_too_large",
                format!("audit file exceeds the {MAX_AUDIT_FILE_BYTES} byte limit"),
                0,
            )),
        );
    }
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) => {
            return ApprovalAuditLoadResult::success(
                empty_log(),
                Some(warning(
                    "audit_read_failed",
                    format!("audit file could not be read: {err}"),
                    0,
                )),
            )
        }
    };
    let raw = match serde_json::from_str::<RawApprovalAuditLog>(&text) {
        Ok(raw) => raw,
        Err(err) => {
            return ApprovalAuditLoadResult::success(
                empty_log(),
                Some(warning(
                    "corrupt_audit_log",
                    format!("audit JSON was ignored: {err}"),
                    0,
                )),
            )
        }
    };
    if raw.version != AUDIT_SCHEMA_VERSION || !valid_saved_at(&raw.saved_at) {
        return ApprovalAuditLoadResult::success(
            empty_log(),
            Some(warning(
                "unsupported_audit_schema",
                "audit schema version or savedAt value is unsupported",
                raw.entries.len(),
            )),
        );
    }

    let input_count = raw.entries.len();
    let entries = sanitize_entries(raw.entries);
    let dropped = input_count.saturating_sub(entries.len());
    ApprovalAuditLoadResult::success(
        ApprovalAuditLog {
            version: AUDIT_SCHEMA_VERSION,
            saved_at: raw.saved_at,
            entries,
        },
        (dropped > 0).then(|| {
            warning(
                "invalid_entries_dropped",
                "invalid audit entries were ignored",
                dropped,
            )
        }),
    )
}

pub fn save_approval_audit_log(entries: Vec<ApprovalAuditEntryInput>) -> ApprovalAuditSaveResult {
    let input_count = entries.len();
    let entries = sanitize_entries(entries);
    let dropped = input_count.saturating_sub(entries.len());
    let log = ApprovalAuditLog {
        version: AUDIT_SCHEMA_VERSION,
        saved_at: now_timestamp(),
        entries,
    };
    let payload = match serde_json::to_vec_pretty(&log) {
        Ok(payload) => payload,
        Err(err) => {
            return ApprovalAuditSaveResult::failure(
                "audit_encode_failed",
                format!("failed to encode audit history: {err}"),
                dropped,
            )
        }
    };
    if payload.len() as u64 > MAX_AUDIT_FILE_BYTES {
        return ApprovalAuditSaveResult::failure(
            "audit_file_too_large",
            "sanitized audit history exceeds the fixed file-size limit",
            dropped,
        );
    }
    let Some(dir) = config_dir() else {
        return ApprovalAuditSaveResult::failure(
            "config_unavailable",
            "app config directory is not initialized",
            dropped,
        );
    };
    let path = dir.join(AUDIT_FILE_NAME);
    if let Err(error) = write_fixed_file(&dir, &path, &payload) {
        return ApprovalAuditSaveResult::failure(&error.code, error.message, dropped);
    }
    ApprovalAuditSaveResult::success(log, dropped)
}

pub fn clear_approval_audit_log() -> ApprovalAuditClearResult {
    let Some(dir) = config_dir() else {
        return ApprovalAuditClearResult::failure(
            "config_unavailable",
            "app config directory is not initialized",
        );
    };
    for name in [AUDIT_FILE_NAME, AUDIT_TEMP_FILE_NAME] {
        let path = dir.join(name);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
            Err(err) => {
                return ApprovalAuditClearResult::failure(
                    "audit_clear_failed",
                    format!("failed to inspect fixed audit file: {err}"),
                )
            }
        };
        if metadata.is_dir() {
            return ApprovalAuditClearResult::failure(
                "unsafe_audit_file",
                "fixed audit path unexpectedly contains a directory",
            );
        }
        if let Err(err) = fs::remove_file(&path) {
            return ApprovalAuditClearResult::failure(
                "audit_clear_failed",
                format!("failed to remove fixed audit file: {err}"),
            );
        }
    }
    ApprovalAuditClearResult::success()
}

fn sanitize_entries(entries: Vec<ApprovalAuditEntryInput>) -> Vec<PersistedApprovalAuditEntry> {
    entries
        .into_iter()
        .filter_map(sanitize_entry)
        .take(MAX_AUDIT_ENTRIES)
        .collect()
}

fn sanitize_entry(input: ApprovalAuditEntryInput) -> Option<PersistedApprovalAuditEntry> {
    if !valid_id(&input.id)
        || !valid_timestamp(&input.timestamp)
        || input.workspace_label != "Selected workspace"
        || input.acknowledgement_kind != "explicit_checkbox"
        || input.source != "approved_dry_run_bridge"
        || !input.untrusted_output
        || input.writes_files
        || input.network_required
        || input.duration_ms > MAX_DURATION_MS
        || input.action_title.len() > 256
        || input.command_summary.len() > 1_024
        || input.safety_labels.len() > 16
        || input.safety_labels.iter().any(|label| label.len() > 64)
        || !valid_status(&input.status)
        || input
            .error_code
            .as_deref()
            .is_some_and(|code| !valid_error_code(code))
    {
        return None;
    }

    let (action_title, target_kind, target_relative_path) = match input.action_id.as_str() {
        "realc-check-hello-example" => (
            "Check the fixed hello.real example",
            "fixed_example",
            "examples/hello.real".to_string(),
        ),
        "realc-check-workspace-file" => {
            let relative = sanitize_relative_real_path(input.target_relative_path.as_deref()?)?;
            (
                "Check a workspace .real file",
                "workspace_real_file",
                relative,
            )
        }
        _ => return None,
    };
    if input.target_kind != target_kind {
        return None;
    }

    // Input titles, command summaries, safety labels, and preview bodies are
    // intentionally ignored. Canonical metadata is reconstructed here.
    let stdout_preview = input.stdout_preview.as_ref().map(|preview| {
        preview
            .chars()
            .take(MAX_AUDIT_PREVIEW_CHARS)
            .collect::<String>()
    });
    let stderr_preview = input.stderr_preview.as_ref().map(|preview| {
        preview
            .chars()
            .take(MAX_AUDIT_PREVIEW_CHARS)
            .collect::<String>()
    });
    let stdout_truncated = input.stdout_truncated || stdout_preview.is_some();
    let stderr_truncated = input.stderr_truncated || stderr_preview.is_some();
    let command_summary = format!("realc {target_relative_path} --check");

    Some(PersistedApprovalAuditEntry {
        id: input.id,
        timestamp: input.timestamp,
        action_id: input.action_id,
        action_title: action_title.to_string(),
        target_kind: target_kind.to_string(),
        target_relative_path,
        workspace_label: "Selected workspace".to_string(),
        command_summary,
        acknowledgement_kind: "explicit_checkbox".to_string(),
        status: input.status,
        error_code: input.error_code,
        exit_code: input.exit_code,
        duration_ms: input.duration_ms,
        stdout_truncated,
        stderr_truncated,
        untrusted_output: true,
        writes_files: false,
        network_required: false,
        safety_labels: CANONICAL_SAFETY_LABELS
            .iter()
            .map(|label| (*label).to_string())
            .collect(),
        source: "approved_dry_run_bridge".to_string(),
    })
}

fn sanitize_relative_real_path(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    if normalized.is_empty()
        || normalized.len() > MAX_RELATIVE_PATH_LEN
        || normalized.chars().any(|ch| ch.is_control())
        || normalized.starts_with('/')
        || normalized.as_bytes().get(1) == Some(&b':')
        || !normalized.ends_with(".real")
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    let path = Path::new(&normalized);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return None;
    }
    Some(normalized)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_LEN
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn valid_timestamp(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_TIMESTAMP_LEN
        && value.bytes().all(|byte| {
            byte.is_ascii_digit() || matches!(byte, b'-' | b':' | b'.' | b'T' | b'Z' | b'+')
        })
}

fn valid_saved_at(value: &str) -> bool {
    !value.is_empty() && value.len() <= 20 && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn valid_status(value: &str) -> bool {
    matches!(
        value,
        "success" | "failed" | "timed_out" | "rejected" | "unavailable"
    )
}

fn valid_error_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ERROR_CODE_LEN
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn write_fixed_file(dir: &Path, path: &Path, payload: &[u8]) -> Result<(), BridgeError> {
    fs::create_dir_all(dir).map_err(|err| BridgeError {
        code: "audit_write_failed".to_string(),
        message: format!("failed to create app config directory: {err}"),
    })?;
    if path.parent() != Some(dir)
        || path.file_name().and_then(|name| name.to_str()) != Some(AUDIT_FILE_NAME)
    {
        return Err(BridgeError {
            code: "unsafe_audit_path".to_string(),
            message: "audit storage path escaped the fixed app-config boundary".to_string(),
        });
    }
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(BridgeError {
                code: "unsafe_audit_file".to_string(),
                message: "fixed audit target is not a regular file".to_string(),
            });
        }
    }

    let temp = dir.join(AUDIT_TEMP_FILE_NAME);
    match fs::symlink_metadata(&temp) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(BridgeError {
                code: "unsafe_audit_file".to_string(),
                message: "fixed audit temporary path is not a regular file".to_string(),
            })
        }
        Ok(_) => fs::remove_file(&temp).map_err(|err| BridgeError {
            code: "audit_write_failed".to_string(),
            message: format!("failed to replace stale audit temporary file: {err}"),
        })?,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => {
            return Err(BridgeError {
                code: "audit_write_failed".to_string(),
                message: format!("failed to inspect audit temporary file: {err}"),
            })
        }
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|err| BridgeError {
            code: "audit_write_failed".to_string(),
            message: format!("failed to create fixed audit temporary file: {err}"),
        })?;
    if let Err(err) = file.write_all(payload).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temp);
        return Err(BridgeError {
            code: "audit_write_failed".to_string(),
            message: format!("failed to write sanitized audit history: {err}"),
        });
    }
    drop(file);

    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path).map_err(|err| BridgeError {
            code: "audit_write_failed".to_string(),
            message: format!("failed to replace existing audit history: {err}"),
        })?;
    }
    if let Err(err) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(BridgeError {
            code: "audit_write_failed".to_string(),
            message: format!("failed to atomically replace audit history: {err}"),
        });
    }
    Ok(())
}

fn warning(code: &str, message: impl Into<String>, dropped_entries: usize) -> ApprovalAuditWarning {
    ApprovalAuditWarning {
        code: code.to_string(),
        message: message.into(),
        dropped_entries,
    }
}

fn now_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::workspace_store::{init_config_dir, lock_config_dir_for_test};

    fn temp_config_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("rf-audit-store-{name}-{stamp}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn valid_entry(index: usize) -> ApprovalAuditEntryInput {
        ApprovalAuditEntryInput {
            id: format!("approval-{index}"),
            timestamp: "2026-06-21T12:00:00.000Z".to_string(),
            action_id: "realc-check-workspace-file".to_string(),
            action_title: "untrusted title input".to_string(),
            target_kind: "workspace_real_file".to_string(),
            target_relative_path: Some(format!("src/file-{index}.real")),
            workspace_label: "Selected workspace".to_string(),
            command_summary: "untrusted command input".to_string(),
            acknowledgement_kind: "explicit_checkbox".to_string(),
            status: "success".to_string(),
            error_code: None,
            exit_code: Some(0),
            duration_ms: 12,
            stdout_preview: Some("PROVIDER_KEY=must-not-persist".repeat(MAX_AUDIT_PREVIEW_CHARS)),
            stderr_preview: Some("/Users/private/workspace".to_string()),
            stdout_truncated: false,
            stderr_truncated: false,
            untrusted_output: true,
            writes_files: false,
            network_required: false,
            safety_labels: vec!["untrusted input label".to_string()],
            source: "approved_dry_run_bridge".to_string(),
        }
    }

    #[test]
    fn missing_file_loads_empty_log() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("missing");
        init_config_dir(dir.clone());
        let result = load_approval_audit_log();
        assert!(result.ok);
        assert!(result.warning.is_none());
        assert!(result.data.unwrap().entries.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_is_fixed_to_app_config_and_omits_output_bodies() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("boundary");
        let workspace = dir
            .parent()
            .unwrap()
            .join("rf-audit-workspace-must-stay-empty");
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        init_config_dir(dir.clone());

        let result = save_approval_audit_log(vec![valid_entry(1)]);
        assert!(result.ok);
        let path = approval_audit_file_path().unwrap();
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert!(path.is_file());
        assert!(!workspace.join(AUDIT_FILE_NAME).exists());
        let stored = fs::read_to_string(path).unwrap();
        assert!(!stored.contains("stdoutPreview"));
        assert!(!stored.contains("stderrPreview"));
        assert!(!stored.contains("must-not-persist"));
        assert!(!stored.contains("/Users/private"));
        assert!(stored.len() as u64 <= MAX_AUDIT_FILE_BYTES);
        let saved = result.data.unwrap().entries.remove(0);
        assert_eq!(saved.command_summary, "realc src/file-1.real --check");
        assert!(saved.stdout_truncated);
        assert!(saved.stderr_truncated);

        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn clear_removes_only_the_fixed_audit_file() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("clear");
        init_config_dir(dir.clone());
        save_approval_audit_log(vec![valid_entry(1)]);
        let unrelated = dir.join("unrelated.json");
        fs::write(&unrelated, "keep").unwrap();
        let result = clear_approval_audit_log();
        assert!(result.ok);
        assert!(!dir.join(AUDIT_FILE_NAME).exists());
        assert_eq!(fs::read_to_string(unrelated).unwrap(), "keep");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupt_and_oversized_files_load_as_empty_with_warning() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("corrupt");
        init_config_dir(dir.clone());
        let path = dir.join(AUDIT_FILE_NAME);
        fs::write(&path, "{not-json").unwrap();
        let corrupt = load_approval_audit_log();
        assert!(corrupt.ok);
        assert_eq!(corrupt.warning.unwrap().code, "corrupt_audit_log");
        assert!(corrupt.data.unwrap().entries.is_empty());

        fs::write(&path, vec![b'x'; MAX_AUDIT_FILE_BYTES as usize + 1]).unwrap();
        let oversized = load_approval_audit_log();
        assert!(oversized.ok);
        assert_eq!(oversized.warning.unwrap().code, "audit_file_too_large");
        assert!(oversized.data.unwrap().entries.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn entries_are_capped_and_invalid_entries_are_dropped() {
        let _serialize = lock_config_dir_for_test();
        let dir = temp_config_dir("sanitize");
        init_config_dir(dir.clone());
        let mut entries: Vec<_> = (0..MAX_AUDIT_ENTRIES + 5).map(valid_entry).collect();
        entries[1].target_relative_path = Some("../../outside.real".to_string());
        entries[2].writes_files = true;
        let result = save_approval_audit_log(entries);
        assert!(result.ok);
        assert_eq!(result.data.unwrap().entries.len(), MAX_AUDIT_ENTRIES);
        assert_eq!(result.dropped_entries, 5);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn fixed_action_ignores_untrusted_path_title_and_command_fields() {
        let mut input = valid_entry(1);
        input.action_id = "realc-check-hello-example".to_string();
        input.target_kind = "fixed_example".to_string();
        input.target_relative_path = Some("/absolute/secret.real".to_string());
        input.action_title = "SECRET_TOKEN=bad".to_string();
        input.command_summary = "rm -rf /".to_string();
        let saved = sanitize_entry(input).unwrap();
        assert_eq!(saved.target_relative_path, "examples/hello.real");
        assert_eq!(saved.action_title, "Check the fixed hello.real example");
        assert_eq!(saved.command_summary, "realc examples/hello.real --check");
    }
}
