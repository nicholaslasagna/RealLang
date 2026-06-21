//! One-action, approval-gated, no-write validation bridge for Workbench 0.12.

use super::resolve_python::resolve_python;
use super::types::{
    ApprovedDryRunExecution, ApprovedDryRunInput, ApprovedDryRunResult, BridgeError,
};
use super::workspace::{get_workspace_resolution, WorkspaceResolutionStatus};
use std::ffi::OsStr;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const APPROVED_ACTION_TIMEOUT_MS: u64 = 10_000;
pub const APPROVED_ACTION_MAX_STREAM_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy)]
pub struct ApprovedDryRunAction {
    pub id: &'static str,
    pub title: &'static str,
    pub display_command: &'static str,
    pub python_module: &'static str,
    pub target: &'static str,
    pub argv_suffix: &'static [&'static str],
}

pub const APPROVED_DRY_RUN_ACTIONS: &[ApprovedDryRunAction] = &[ApprovedDryRunAction {
    id: "realc-check-hello-example",
    title: "Check the fixed hello.real example",
    display_command: "realc examples/hello.real --check",
    python_module: "reallang.cli",
    target: "examples/hello.real",
    argv_suffix: &["--check"],
}];

const PASSTHROUGH_ENV: &[&str] = &[
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
];

pub fn get_approved_action(action_id: &str) -> Option<&'static ApprovedDryRunAction> {
    APPROVED_DRY_RUN_ACTIONS
        .iter()
        .find(|action| action.id == action_id)
}

pub fn run_approved_dry_run_action(
    action_id: &str,
    input: ApprovedDryRunInput,
) -> ApprovedDryRunResult {
    let Some(action) = get_approved_action(action_id) else {
        return ApprovedDryRunResult::failure(
            "unknown_action",
            format!("unknown or disallowed approved action: {action_id}"),
        );
    };
    if !input.approval_acknowledged {
        return ApprovedDryRunResult::failure(
            "approval_required",
            "explicit local check approval was not acknowledged",
        );
    }

    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        return ApprovedDryRunResult::failure(
            "workspace_not_ready",
            "workspace and virtualenv must be ready before running the approved check",
        );
    }
    let Some(repo_root_text) = resolution.repo_root else {
        return ApprovedDryRunResult::failure(
            "workspace_not_ready",
            "workspace root is unavailable",
        );
    };
    let repo_root = PathBuf::from(repo_root_text);
    let target = match validate_workspace_target(&repo_root, Path::new(action.target)) {
        Ok(path) => path,
        Err(error) => return ApprovedDryRunResult::failure(&error.code, error.message),
    };
    if target.extension() != Some(OsStr::new("real")) {
        return ApprovedDryRunResult::failure(
            "invalid_target",
            "approved target must be a .real file",
        );
    }

    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(message) => return ApprovedDryRunResult::failure("executable_not_found", message),
    };
    if python.components().count() > 1 && !python.is_file() {
        return ApprovedDryRunResult::failure(
            "executable_not_found",
            format!(
                "Python interpreter not found at {}",
                python.to_string_lossy()
            ),
        );
    }

    match run_fixed_action(
        &python,
        &repo_root,
        action,
        APPROVED_ACTION_TIMEOUT_MS,
        APPROVED_ACTION_MAX_STREAM_BYTES,
    ) {
        Ok(execution) => ApprovedDryRunResult::success(execution),
        Err(error) => ApprovedDryRunResult::failure(&error.code, error.message),
    }
}

fn validate_workspace_target(repo_root: &Path, relative: &Path) -> Result<PathBuf, BridgeError> {
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(BridgeError {
            code: "invalid_target".to_string(),
            message: "approved target must be a traversal-free relative path".to_string(),
        });
    }

    let canonical_root = repo_root.canonicalize().map_err(|err| BridgeError {
        code: "workspace_not_ready".to_string(),
        message: format!("failed to canonicalize workspace root: {err}"),
    })?;
    let candidate = repo_root.join(relative);
    let canonical_target = candidate.canonicalize().map_err(|err| BridgeError {
        code: "invalid_target".to_string(),
        message: format!("approved target is missing or unreadable: {err}"),
    })?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(BridgeError {
            code: "outside_workspace".to_string(),
            message: "approved target resolves outside the selected workspace".to_string(),
        });
    }
    if !canonical_target.is_file() {
        return Err(BridgeError {
            code: "invalid_target".to_string(),
            message: "approved target is not a file".to_string(),
        });
    }
    Ok(canonical_target)
}

fn run_fixed_action(
    python: &Path,
    repo_root: &Path,
    action: &'static ApprovedDryRunAction,
    timeout_ms: u64,
    max_stream_bytes: usize,
) -> Result<ApprovedDryRunExecution, BridgeError> {
    let mut command = Command::new(python);
    command
        .env_clear()
        .arg("-m")
        .arg(action.python_module)
        .arg(action.target)
        .args(action.argv_suffix)
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", repo_root.join("src"))
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONUTF8", "1")
        .env("LANG", "C.UTF-8");
    for name in PASSTHROUGH_ENV {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }

    let mut child = command.spawn().map_err(|err| BridgeError {
        code: "spawn_failed".to_string(),
        message: format!("failed to start approved local check: {err}"),
    })?;
    let stdout = child.stdout.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "approved check stdout pipe was unavailable".to_string(),
    })?;
    let stderr = child.stderr.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "approved check stderr pipe was unavailable".to_string(),
    })?;
    let stdout_reader = thread::spawn(move || read_capped(stdout, max_stream_bytes));
    let stderr_reader = thread::spawn(move || read_capped(stderr, max_stream_bytes));
    let timeout = Duration::from_millis(timeout_ms);
    let start = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "timeout".to_string(),
                    message: format!("approved local check timed out after {timeout_ms}ms"),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: format!("failed while waiting for approved local check: {err}"),
                });
            }
        }
    };

    let stdout = join_capped_output(stdout_reader, "stdout")?;
    let stderr = join_capped_output(stderr_reader, "stderr")?;
    let duration_ms = start.elapsed().as_millis();
    Ok(ApprovedDryRunExecution {
        action_id: action.id,
        title: action.title,
        command_summary: action.display_command,
        workspace_path: repo_root.to_string_lossy().into_owned(),
        exit_code: status.code().unwrap_or(-1),
        passed: status.success(),
        stdout,
        stderr,
        duration_ms,
        writes_files: false,
        network_required: false,
        untrusted: true,
        safety_labels: vec![
            "UNTRUSTED",
            "APPROVED LOCAL CHECK",
            "NO WRITES",
            "LOCAL ONLY",
            "NETWORK OFF",
        ],
    })
}

#[derive(Debug)]
struct CappedOutput {
    bytes: Vec<u8>,
    exceeded: bool,
}

fn read_capped(mut reader: impl Read, max_bytes: usize) -> Result<CappedOutput, std::io::Error> {
    let mut bytes = Vec::new();
    let mut exceeded = false;
    let mut buffer = [0u8; 4096];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = max_bytes.saturating_sub(bytes.len());
        let retained = read.min(remaining);
        bytes.extend_from_slice(&buffer[..retained]);
        exceeded |= retained < read;
    }
    Ok(CappedOutput { bytes, exceeded })
}

fn join_capped_output(
    reader: thread::JoinHandle<Result<CappedOutput, std::io::Error>>,
    stream: &str,
) -> Result<String, BridgeError> {
    let output = reader
        .join()
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("approved check {stream} reader failed"),
        })?
        .map_err(|err| BridgeError {
            code: "read_failed".to_string(),
            message: format!("failed to read approved check {stream}: {err}"),
        })?;
    if output.exceeded {
        return Err(BridgeError {
            code: "output_too_large".to_string(),
            message: format!(
                "approved check {stream} exceeded {} byte cap",
                APPROVED_ACTION_MAX_STREAM_BYTES
            ),
        });
    }
    String::from_utf8(output.bytes).map_err(|_| BridgeError {
        code: "invalid_output".to_string(),
        message: format!("approved check {stream} was not valid UTF-8"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rf-approval-{name}-{stamp}"));
        fs::create_dir_all(root.join("examples")).unwrap();
        fs::write(root.join("examples/hello.real"), "module main;").unwrap();
        root
    }

    #[test]
    fn allowlist_contains_exactly_one_no_write_action() {
        assert_eq!(APPROVED_DRY_RUN_ACTIONS.len(), 1);
        let action = APPROVED_DRY_RUN_ACTIONS[0];
        assert_eq!(action.id, "realc-check-hello-example");
        assert_eq!(action.argv_suffix, &["--check"]);
        let all_tokens = format!(
            "{} {} {:?}",
            action.python_module, action.target, action.argv_suffix
        );
        for forbidden in ["repair", "apply", "scheduler", "commit", "merge", "update"] {
            assert!(!all_tokens.contains(forbidden));
        }
    }

    #[test]
    fn unknown_action_is_rejected_before_workspace_resolution() {
        let result = run_approved_dry_run_action(
            "apply-proposal",
            ApprovedDryRunInput {
                approval_acknowledged: true,
            },
        );
        assert!(!result.ok);
        assert_eq!(result.error.unwrap().code, "unknown_action");
    }

    #[test]
    fn missing_approval_is_rejected_before_workspace_resolution() {
        let result = run_approved_dry_run_action(
            "realc-check-hello-example",
            ApprovedDryRunInput {
                approval_acknowledged: false,
            },
        );
        assert!(!result.ok);
        assert_eq!(result.error.unwrap().code, "approval_required");
    }

    #[test]
    fn arbitrary_input_fields_are_rejected_by_schema() {
        let parsed = serde_json::from_str::<ApprovedDryRunInput>(
            r#"{"approvalAcknowledged":true,"args":["--emit-c"]}"#,
        );
        assert!(parsed.is_err());
    }

    #[test]
    fn fixed_target_must_be_workspace_relative_and_contained() {
        let root = temp_root("paths");
        assert!(validate_workspace_target(&root, Path::new("examples/hello.real")).is_ok());
        assert_eq!(
            validate_workspace_target(&root, Path::new("../outside.real"))
                .unwrap_err()
                .code,
            "invalid_target"
        );
        let absolute = root.join("examples/hello.real");
        assert_eq!(
            validate_workspace_target(&root, &absolute)
                .unwrap_err()
                .code,
            "invalid_target"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn stream_capture_enforces_output_cap() {
        let output = read_capped(&b"0123456789"[..], 4).unwrap();
        assert!(output.exceeded);
        assert_eq!(output.bytes, b"0123");
    }

    #[cfg(unix)]
    #[test]
    fn fixed_target_symlink_cannot_escape_workspace() {
        use std::os::unix::fs::symlink;

        let root = temp_root("symlink");
        let outside = root.parent().unwrap().join("rf-approval-outside.real");
        fs::write(&outside, "module main;").unwrap();
        let link = root.join("examples/escape.real");
        symlink(&outside, &link).unwrap();
        assert_eq!(
            validate_workspace_target(&root, Path::new("examples/escape.real"))
                .unwrap_err()
                .code,
            "outside_workspace"
        );
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&root);
    }
}
