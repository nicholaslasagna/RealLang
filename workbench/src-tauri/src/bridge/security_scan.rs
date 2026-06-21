//! Read-only security scan bridge (0.14).
//!
//! Executes ONLY a fixed allowlist of read-only security/audit commands with
//! fixed argv arrays — never a shell, never user-supplied args, never an
//! install/update/fix/mutating subcommand. Output is captured (with caps and a
//! timeout) and returned as untrusted evidence. Nothing is written, no lockfile
//! or source file is modified, and no remediation is performed.
//!
//! npm audit intentionally exits non-zero when vulnerabilities are found, so a
//! non-zero exit is NOT treated as a bridge error here; the exit code and output
//! are returned to the frontend for honest display.

use super::types::{BridgeError, SecurityScanExecution, SecurityScanResult, SecurityScanSourceMeta};
use super::workspace::resolve_repo_root_for_spawn;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const SCAN_TIMEOUT_MS: u64 = 60_000;
pub const SCAN_MAX_STDOUT_BYTES: usize = 1024 * 1024;
pub const SCAN_MAX_STDERR_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanCwd {
    Workbench,
    SrcTauri,
}

#[derive(Debug, Clone, Copy)]
pub struct SecurityScanSource {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub display_command: &'static str,
    pub program: &'static str,
    pub argv: &'static [&'static str],
    pub cwd: ScanCwd,
    pub ecosystem: &'static str,
    pub output_format: &'static str,
    pub requires_network: bool,
}

/// Only these programs may ever be spawned by the scan bridge.
pub const ALLOWED_PROGRAMS: &[&str] = &["npm", "cargo"];

/// Tokens that would install, update, mutate, fix, or otherwise change state.
/// A source whose fixed argv contains any of these is rejected as defense in depth.
pub const DENIED_SCAN_TOKENS: &[&str] = &[
    "install", "i", "ci", "update", "upgrade", "add", "remove", "rm", "uninstall", "prune",
    "dedupe", "fix", "--fix", "publish", "pack", "link", "unlink", "exec", "run", "run-script",
    "init", "login", "logout", "set", "config", "cache", "patch", "generate-lockfile",
    "--offline-fix", "edit", "rebuild", "fund", "deprecate",
];

pub const SECURITY_SCAN_SOURCES: &[SecurityScanSource] = &[
    SecurityScanSource {
        id: "npm-audit-json",
        label: "npm audit (JSON)",
        description: "npm advisory audit for the Workbench package tree. May query the npm registry.",
        display_command: "npm audit --json",
        program: "npm",
        argv: &["audit", "--json"],
        cwd: ScanCwd::Workbench,
        ecosystem: "npm",
        output_format: "json",
        requires_network: true,
    },
    SecurityScanSource {
        id: "cargo-tree",
        label: "cargo dependency tree",
        description: "Full Rust dependency tree for the desktop shell (evidence, not a vulnerability scan).",
        display_command: "cargo tree",
        program: "cargo",
        argv: &["tree"],
        cwd: ScanCwd::SrcTauri,
        ecosystem: "cargo",
        output_format: "text",
        requires_network: false,
    },
    SecurityScanSource {
        id: "cargo-tree-glib",
        label: "cargo tree -i glib",
        description: "Traces the glib dependency path on the Linux target (evidence for the blocked glib advisory).",
        display_command: "cargo tree -i glib --target x86_64-unknown-linux-gnu",
        program: "cargo",
        argv: &["tree", "-i", "glib", "--target", "x86_64-unknown-linux-gnu"],
        cwd: ScanCwd::SrcTauri,
        ecosystem: "cargo",
        output_format: "text",
        requires_network: false,
    },
];

pub fn source_meta(source: &SecurityScanSource) -> SecurityScanSourceMeta {
    SecurityScanSourceMeta {
        id: source.id,
        label: source.label,
        description: source.description,
        display_command: source.display_command,
        ecosystem: source.ecosystem,
        output_format: source.output_format,
        requires_network: source.requires_network,
        read_only: true,
    }
}

pub fn get_scan_source(source_id: &str) -> Option<&'static SecurityScanSource> {
    SECURITY_SCAN_SOURCES.iter().find(|s| s.id == source_id)
}

pub fn is_scan_source_valid(source: &SecurityScanSource) -> bool {
    ALLOWED_PROGRAMS.contains(&source.program)
        && !source.argv.is_empty()
        && source.argv.iter().all(|token| !token.is_empty())
        && !source
            .argv
            .iter()
            .any(|token| DENIED_SCAN_TOKENS.contains(&token.to_ascii_lowercase().as_str()))
}

pub fn list_scan_source_meta() -> Vec<SecurityScanSourceMeta> {
    SECURITY_SCAN_SOURCES.iter().map(source_meta).collect()
}

fn program_name(source: &SecurityScanSource) -> String {
    // std::process::Command on Windows only appends `.exe`; npm ships as npm.cmd.
    if cfg!(windows) && source.program == "npm" {
        "npm.cmd".to_string()
    } else {
        source.program.to_string()
    }
}

fn scan_cwd(repo_root: &Path, source: &SecurityScanSource) -> PathBuf {
    let workbench = repo_root.join("workbench");
    match source.cwd {
        ScanCwd::Workbench => workbench,
        ScanCwd::SrcTauri => workbench.join("src-tauri"),
    }
}

pub fn run_security_scan(source_id: &str) -> SecurityScanResult {
    let Some(source) = get_scan_source(source_id) else {
        return SecurityScanResult::failure(
            "unknown_scan_source",
            format!("unknown or disallowed security scan source: {source_id}"),
        );
    };
    if !is_scan_source_valid(source) {
        return SecurityScanResult::failure(
            "invalid_scan_source",
            format!("scan source is not a permitted read-only command: {source_id}"),
        );
    }

    let repo_root = resolve_repo_root_for_spawn();
    if !repo_root.join("workbench").join("package.json").exists() {
        return SecurityScanResult::failure(
            "workspace_not_ready",
            "workbench/package.json was not found; select a RealForge repository first",
        );
    }
    let cwd = scan_cwd(&repo_root, source);
    if !cwd.exists() {
        return SecurityScanResult::failure(
            "workspace_not_ready",
            format!("scan working directory is missing: {}", cwd.to_string_lossy()),
        );
    }

    match run_scan_process(source, &cwd, SCAN_TIMEOUT_MS, SCAN_MAX_STDOUT_BYTES, SCAN_MAX_STDERR_BYTES) {
        Ok(execution) => SecurityScanResult::success(execution),
        Err(error) => SecurityScanResult::failure(&error.code, error.message),
    }
}

#[derive(Debug)]
struct CappedOutput {
    bytes: Vec<u8>,
    exceeded: bool,
}

fn read_capped(mut reader: impl Read, max_bytes: usize) -> Result<CappedOutput, std::io::Error> {
    let mut bytes = Vec::new();
    let mut exceeded = false;
    let mut buffer = [0u8; 8192];
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

fn run_scan_process(
    source: &'static SecurityScanSource,
    cwd: &Path,
    timeout_ms: u64,
    max_stdout: usize,
    max_stderr: usize,
) -> Result<SecurityScanExecution, BridgeError> {
    let mut command = Command::new(program_name(source));
    command
        .args(source.argv)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_clear()
        .env("LANG", "C.UTF-8")
        .env("NO_COLOR", "1")
        .env("CI", "1");
    // Minimal read-only environment passthrough: enough for npm/cargo to locate
    // their toolchain, cache, and (for npm audit) the registry — nothing else.
    for name in [
        "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "WINDIR", "TEMP",
        "TMP", "CARGO_HOME", "RUSTUP_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }

    let start = Instant::now();
    let mut child = command.spawn().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            BridgeError {
                code: "executable_not_found".to_string(),
                message: format!("{} was not found on PATH", source.program),
            }
        } else {
            BridgeError {
                code: "spawn_failed".to_string(),
                message: format!("failed to start security scan: {err}"),
            }
        }
    })?;

    let stdout = child.stdout.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "scan stdout pipe was unavailable".to_string(),
    })?;
    let stderr = child.stderr.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "scan stderr pipe was unavailable".to_string(),
    })?;
    let stdout_reader = thread::spawn(move || read_capped(stdout, max_stdout));
    let stderr_reader = thread::spawn(move || read_capped(stderr, max_stderr));

    let timeout = Duration::from_millis(timeout_ms);
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
                    message: format!("security scan timed out after {timeout_ms}ms"),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: format!("failed while waiting for security scan: {err}"),
                });
            }
        }
    };

    let stdout_out = join_reader(stdout_reader, "stdout")?;
    let stderr_out = join_reader(stderr_reader, "stderr")?;

    Ok(SecurityScanExecution {
        source: source_meta(source),
        command_summary: source.display_command,
        cwd: cwd.to_string_lossy().into_owned(),
        // npm audit returns a non-zero exit when vulnerabilities are found; this
        // is expected and is NOT a bridge error. The exit code is reported as-is.
        exit_code: status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&stdout_out.bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_out.bytes).into_owned(),
        output_format: source.output_format,
        stdout_truncated: stdout_out.exceeded,
        duration_ms: start.elapsed().as_millis(),
        writes_files: false,
        network_used: source.requires_network,
        untrusted: true,
        safety_labels: vec![
            "UNTRUSTED",
            "READ-ONLY SCAN",
            "NO WRITES",
            "NO REMEDIATION",
        ],
    })
}

fn join_reader(
    reader: thread::JoinHandle<Result<CappedOutput, std::io::Error>>,
    stream: &str,
) -> Result<CappedOutput, BridgeError> {
    reader
        .join()
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("security scan {stream} reader panicked"),
        })?
        .map_err(|err| BridgeError {
            code: "read_failed".to_string(),
            message: format!("failed to read security scan {stream}: {err}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_contains_only_expected_read_only_sources() {
        let ids: Vec<_> = SECURITY_SCAN_SOURCES.iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["npm-audit-json", "cargo-tree", "cargo-tree-glib"]);
        for source in SECURITY_SCAN_SOURCES {
            assert!(is_scan_source_valid(source));
            assert!(ALLOWED_PROGRAMS.contains(&source.program));
        }
    }

    #[test]
    fn unknown_scan_source_is_rejected() {
        let result = run_security_scan("npm-install");
        assert!(!result.ok);
        assert_eq!(result.error.unwrap().code, "unknown_scan_source");
    }

    #[test]
    fn no_source_contains_a_mutating_or_install_token() {
        for source in SECURITY_SCAN_SOURCES {
            for token in source.argv {
                assert!(
                    !DENIED_SCAN_TOKENS.contains(&token.to_ascii_lowercase().as_str()),
                    "denied token {token} in {}",
                    source.id
                );
                assert!(!token.contains(' '), "argv token must not contain spaces");
            }
        }
    }

    #[test]
    fn a_source_with_a_mutating_token_fails_validation() {
        let bad = SecurityScanSource {
            id: "bad",
            label: "bad",
            description: "bad",
            display_command: "npm install",
            program: "npm",
            argv: &["install"],
            cwd: ScanCwd::Workbench,
            ecosystem: "npm",
            output_format: "text",
            requires_network: true,
        };
        assert!(!is_scan_source_valid(&bad));
    }

    #[test]
    fn a_source_with_a_disallowed_program_fails_validation() {
        let bad = SecurityScanSource {
            id: "bad-prog",
            label: "bad",
            description: "bad",
            display_command: "bash -c x",
            program: "bash",
            argv: &["-c", "x"],
            cwd: ScanCwd::Workbench,
            ecosystem: "npm",
            output_format: "text",
            requires_network: false,
        };
        assert!(!is_scan_source_valid(&bad));
    }

    #[test]
    fn read_capped_truncates_at_limit() {
        let out = read_capped(&b"0123456789"[..], 4).unwrap();
        assert!(out.exceeded);
        assert_eq!(out.bytes, b"0123");
    }

    static FAKE_MISSING: SecurityScanSource = SecurityScanSource {
        id: "fake-missing",
        label: "fake",
        description: "fake",
        display_command: "rf-nonexistent-scan-prog --version",
        program: "rf-nonexistent-scan-prog",
        argv: &["--version"],
        cwd: ScanCwd::Workbench,
        ecosystem: "npm",
        output_format: "text",
        requires_network: false,
    };

    #[test]
    fn missing_program_returns_executable_not_found() {
        let dir = std::env::temp_dir();
        let err = run_scan_process(&FAKE_MISSING, &dir, 5_000, 1024, 1024).unwrap_err();
        assert_eq!(err.code, "executable_not_found");
    }

    #[test]
    fn scan_metadata_marks_npm_audit_as_network() {
        let npm = get_scan_source("npm-audit-json").unwrap();
        assert!(npm.requires_network);
        let cargo = get_scan_source("cargo-tree").unwrap();
        assert!(!cargo.requires_network);
    }
}
