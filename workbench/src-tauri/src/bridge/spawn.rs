//! Read-only CLI spawn — fixed argv only, no shell, capped output, timeout.

use super::allowlist::{get_allowlisted_source, is_readonly_source_valid, source_meta, AllowlistedSource};
use super::workspace::resolve_repo_root_for_spawn;
use super::resolve_python::resolve_python;
use super::types::{BridgeError, LoadedReadOnlyReport, LoadReadOnlyReportResult};
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const DEFAULT_TIMEOUT_MS: u64 = 15_000;
pub const DEFAULT_MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

pub fn load_readonly_report_source(source_id: &str) -> LoadReadOnlyReportResult {
    let Some(source) = get_allowlisted_source(source_id) else {
        return LoadReadOnlyReportResult::failure(
            "unknown_source",
            format!("unknown or disallowed report source: {source_id}"),
        );
    };

    if !is_readonly_source_valid(source) {
        return LoadReadOnlyReportResult::failure(
            "invalid_source",
            format!("source is not a permitted read-only command: {source_id}"),
        );
    }

    let repo_root = resolve_repo_root_for_spawn();
    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(message) => {
            return LoadReadOnlyReportResult::failure("executable_not_found", message);
        }
    };

    if python.components().count() > 1 && !python.exists() {
        return LoadReadOnlyReportResult::failure(
            "executable_not_found",
            format!(
                "Python interpreter not found at {}",
                python.to_string_lossy()
            ),
        );
    }

    match run_python_module(&python, &repo_root, source, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_OUTPUT_BYTES)
    {
        Ok(stdout_json) => {
            if serde_json::from_str::<serde_json::Value>(&stdout_json).is_err() {
                return LoadReadOnlyReportResult::failure(
                    "invalid_json",
                    "command output was not valid JSON",
                );
            }

            LoadReadOnlyReportResult::success(LoadedReadOnlyReport {
                source: source_meta(source),
                stdout_json,
                untrusted: true,
                safety_labels: vec!["UNTRUSTED", "READONLY", "NO WRITES", "LOCAL ONLY"],
            })
        }
        Err(error) => LoadReadOnlyReportResult::failure(&error.code, error.message),
    }
}

/// Allowlisted read-only probe for bridge health (capabilities --json only).
pub fn probe_capabilities_json(
    python: &Path,
    repo_root: &Path,
    timeout_ms: u64,
    max_output_bytes: usize,
) -> bool {
    let Some(source) = get_allowlisted_source("capabilities") else {
        return false;
    };
    match run_python_module(python, repo_root, source, timeout_ms, max_output_bytes) {
        Ok(stdout) => serde_json::from_str::<serde_json::Value>(&stdout).is_ok(),
        Err(_) => false,
    }
}

fn run_python_module(
    python: &Path,
    repo_root: &Path,
    source: &AllowlistedSource,
    timeout_ms: u64,
    max_output_bytes: usize,
) -> Result<String, BridgeError> {
    let mut command = Command::new(python);
    command
        .arg("-m")
        .arg("realforge.cli")
        .args(source.argv)
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", repo_root.join("src"))
        .env("LANG", "C.UTF-8");

    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        command.env("HOME", home);
    }
    #[cfg(windows)]
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        command.env("USERPROFILE", userprofile);
    }

    let mut child = command.spawn().map_err(|err| BridgeError {
        code: "spawn_failed".to_string(),
        message: format!("failed to start read-only CLI process: {err}"),
    })?;

    let timeout = Duration::from_millis(timeout_ms);
    let start = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = Vec::new();
                if let Some(mut pipe) = child.stdout.take() {
                    read_limited(&mut pipe, max_output_bytes, &mut stdout).map_err(|err| {
                        BridgeError {
                            code: err.code,
                            message: err.message,
                        }
                    })?;
                }
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_string(&mut stderr);
                }

                if !status.success() {
                    let detail = if stderr.trim().is_empty() {
                        format!("command exited with status {status}")
                    } else {
                        stderr.trim().to_string()
                    };
                    return Err(BridgeError {
                        code: "non_zero_exit".to_string(),
                        message: detail,
                    });
                }

                return String::from_utf8(stdout).map_err(|_| BridgeError {
                    code: "invalid_output".to_string(),
                    message: "command output was not valid UTF-8".to_string(),
                });
            }
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(BridgeError {
                    code: "timeout".to_string(),
                    message: format!("read-only CLI command timed out after {timeout_ms}ms"),
                });
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(err) => {
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: format!("failed while waiting for CLI process: {err}"),
                });
            }
        }
    }
}

fn read_limited(
    reader: &mut impl Read,
    max_bytes: usize,
    out: &mut Vec<u8>,
) -> Result<(), BridgeError> {
    let mut buf = [0u8; 8192];
    loop {
        let read = reader.read(&mut buf).map_err(|err| BridgeError {
            code: "read_failed".to_string(),
            message: format!("failed to read CLI stdout: {err}"),
        })?;
        if read == 0 {
            break;
        }
        if out.len() + read > max_bytes {
            return Err(BridgeError {
                code: "output_too_large".to_string(),
                message: format!("command output exceeded {max_bytes} byte cap"),
            });
        }
        out.extend_from_slice(&buf[..read]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_limited_enforces_cap() {
        let data = vec![0u8; 16];
        let mut out = Vec::new();
        let err = read_limited(&mut &data[..], 8, &mut out).unwrap_err();
        assert_eq!(err.code, "output_too_large");
    }

    #[test]
    fn read_limited_accepts_small_payload() {
        let data = br#"{"ok":true}"#;
        let mut out = Vec::new();
        read_limited(&mut &data[..], 1024, &mut out).unwrap();
        assert_eq!(out, data);
    }
}
