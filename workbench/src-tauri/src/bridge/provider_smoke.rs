//! Approval-gated fixed provider smoke bridge for Workbench 0.25.
//!
//! This module owns the executable and every argument. The frontend can submit
//! only an acknowledgement boolean. No prompt, path, endpoint, model identifier,
//! arbitrary argv, shell, workspace content, or write operation crosses IPC.

use super::resolve_python::resolve_python;
use super::types::BridgeError;
use super::workspace::{get_workspace_resolution, WorkspaceResolutionStatus};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const PROVIDER_SMOKE_TIMEOUT_MS: u64 = 8_000;
pub const PROVIDER_SMOKE_MAX_STDOUT_BYTES: usize = 16 * 1024;
pub const PROVIDER_SMOKE_MAX_STDERR_BYTES: usize = 8 * 1024;
pub const PROVIDER_SMOKE_RESPONSE_PREVIEW_CHARS: usize = 160;
pub const PROVIDER_SMOKE_PYTHON_MODULE: &str = "realforge.cli";
pub const PROVIDER_SMOKE_ARGV: &[&str] = &["provider", "smoke", "--json"];

const PASSTHROUGH_ENV: &[&str] = &[
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderSmokeInput {
    pub approval_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CliSmokeError {
    code: String,
    #[allow(dead_code)]
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CliSmokeReport {
    ok: bool,
    attempted: bool,
    configured: bool,
    provider_kind: Option<String>,
    endpoint_configured: bool,
    endpoint_host: Option<String>,
    model_configured: bool,
    api_key_configured: bool,
    status: String,
    duration_ms: u64,
    response_preview: Option<String>,
    response_truncated: bool,
    #[allow(dead_code)]
    untrusted_output: bool,
    error: Option<CliSmokeError>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProviderSmokeError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProviderSmokeReport {
    pub ok: bool,
    pub attempted: bool,
    pub configured: bool,
    pub provider_kind: Option<String>,
    pub endpoint_configured: bool,
    pub endpoint_host: Option<String>,
    pub model_configured: bool,
    pub api_key_configured: bool,
    pub status: String,
    pub duration_ms: u64,
    pub response_preview: Option<String>,
    pub response_truncated: bool,
    pub untrusted_output: bool,
    pub error: Option<ProviderSmokeError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSmokeResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ProviderSmokeReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl ProviderSmokeResult {
    fn success(data: ProviderSmokeReport) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    fn failure(code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(BridgeError {
                code: code.to_string(),
                message: message.into(),
            }),
        }
    }
}

pub fn run_private_provider_smoke(input: ProviderSmokeInput) -> ProviderSmokeResult {
    if !input.approval_acknowledged {
        return ProviderSmokeResult::failure(
            "approval_required",
            "Explicit approval is required before running the provider smoke check.",
        );
    }

    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        return ProviderSmokeResult::failure(
            "workspace_not_ready",
            "The RealForge workspace and Python runtime must be ready before running provider smoke.",
        );
    }
    let Some(repo_root) = resolution.repo_root.map(PathBuf::from) else {
        return ProviderSmokeResult::failure(
            "workspace_not_ready",
            "The RealForge workspace is unavailable.",
        );
    };
    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(_) => {
            return ProviderSmokeResult::failure(
                "executable_not_found",
                "The configured RealForge Python runtime is unavailable.",
            );
        }
    };
    if python.components().count() > 1 && !python.is_file() {
        return ProviderSmokeResult::failure(
            "executable_not_found",
            "The configured RealForge Python runtime is unavailable.",
        );
    }

    match run_fixed_smoke(
        &python,
        &repo_root,
        PROVIDER_SMOKE_TIMEOUT_MS,
        PROVIDER_SMOKE_MAX_STDOUT_BYTES,
        PROVIDER_SMOKE_MAX_STDERR_BYTES,
    ) {
        Ok(report) => ProviderSmokeResult::success(report),
        Err(error) => ProviderSmokeResult::failure(&error.code, error.message),
    }
}

fn run_fixed_smoke(
    python: &Path,
    repo_root: &Path,
    timeout_ms: u64,
    max_stdout_bytes: usize,
    max_stderr_bytes: usize,
) -> Result<ProviderSmokeReport, BridgeError> {
    let mut command = Command::new(python);
    command
        .env_clear()
        .arg("-m")
        .arg(PROVIDER_SMOKE_PYTHON_MODULE)
        .args(PROVIDER_SMOKE_ARGV)
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

    let mut child = command.spawn().map_err(|_| BridgeError {
        code: "spawn_failed".to_string(),
        message: "Could not start the fixed provider smoke command.".to_string(),
    })?;
    let stdout = child.stdout.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "Provider smoke stdout was unavailable.".to_string(),
    })?;
    let stderr = child.stderr.take().ok_or_else(|| BridgeError {
        code: "spawn_failed".to_string(),
        message: "Provider smoke stderr was unavailable.".to_string(),
    })?;
    let stdout_reader = thread::spawn(move || read_capped(stdout, max_stdout_bytes));
    let stderr_reader = thread::spawn(move || read_capped(stderr, max_stderr_bytes));
    let timeout = Duration::from_millis(timeout_ms);
    let started = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "timeout".to_string(),
                    message: "Provider smoke timed out before returning a result.".to_string(),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: "Provider smoke process monitoring failed.".to_string(),
                });
            }
        }
    };

    let stdout = join_capped_output(stdout_reader, "stdout", max_stdout_bytes)?;
    let _stderr = join_capped_output(stderr_reader, "stderr", max_stderr_bytes)?;
    parse_smoke_output(&stdout, status)
}

fn parse_smoke_output(
    stdout: &str,
    status: ExitStatus,
) -> Result<ProviderSmokeReport, BridgeError> {
    let parsed = serde_json::from_str::<CliSmokeReport>(stdout).map_err(|_| BridgeError {
        code: if status.success() {
            "invalid_json".to_string()
        } else {
            "smoke_failed".to_string()
        },
        message: "Provider smoke did not return the expected sanitized JSON report.".to_string(),
    })?;
    Ok(sanitize_report(parsed))
}

fn sanitize_report(report: CliSmokeReport) -> ProviderSmokeReport {
    let endpoint_host = sanitize_endpoint_host(report.endpoint_host.as_deref());
    let (response_preview, preview_truncated) = sanitize_response_preview(report.response_preview);
    let status = match report.status.as_str() {
        "pass" => "pass",
        "not_configured" => "not_configured",
        _ => "fail",
    };
    let error = sanitize_error(report.error, status);

    ProviderSmokeReport {
        ok: report.ok && status == "pass",
        attempted: report.attempted,
        configured: report.configured,
        provider_kind: match report.provider_kind.as_deref() {
            Some("openai_compatible_local") => Some("openai_compatible_local".to_string()),
            _ => None,
        },
        endpoint_configured: report.endpoint_configured && endpoint_host.is_some(),
        endpoint_host,
        model_configured: report.model_configured,
        api_key_configured: report.api_key_configured,
        status: status.to_string(),
        duration_ms: report.duration_ms.min(PROVIDER_SMOKE_TIMEOUT_MS),
        response_preview,
        response_truncated: report.response_truncated || preview_truncated,
        untrusted_output: true,
        error,
    }
}

fn sanitize_error(error: Option<CliSmokeError>, status: &str) -> Option<ProviderSmokeError> {
    if status == "pass" {
        return None;
    }
    let code = error
        .as_ref()
        .map(|value| value.code.as_str())
        .unwrap_or("provider_error");
    let (code, message) = match code {
        "not_configured" => (
            "not_configured",
            "Private local provider is not configured.",
        ),
        "unsupported_provider" => (
            "unsupported_provider",
            "Provider smoke supports only the OpenAI-compatible local provider.",
        ),
        "connection_failed" => ("connection_failed", "Local provider connection failed."),
        "timeout" => ("timeout", "Local provider smoke request timed out."),
        "http_error" => ("http_error", "Local provider returned an HTTP error."),
        "invalid_json" => ("invalid_json", "Local provider returned invalid JSON."),
        "invalid_response" => (
            "invalid_response",
            "Local provider returned an unsupported response.",
        ),
        "response_too_large" => (
            "response_too_large",
            "Local provider response exceeded the smoke limit.",
        ),
        "config_too_large" | "invalid_toml" | "invalid_config" => (
            "invalid_config",
            "Private local provider configuration is invalid.",
        ),
        _ => ("provider_error", "Local provider smoke request failed."),
    };
    Some(ProviderSmokeError {
        code: code.to_string(),
        message: message.to_string(),
    })
}

fn sanitize_endpoint_host(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(char::is_control)
        || value.contains(['/', '?', '#', '@'])
            && !value.starts_with("http://")
            && !value.starts_with("https://")
    {
        return None;
    }
    let (scheme, host) = value
        .strip_prefix("http://")
        .map(|host| ("http", host))
        .or_else(|| value.strip_prefix("https://").map(|host| ("https", host)))?;
    if host.contains(['/', '?', '#', '@']) || !is_loopback_host(host) {
        return None;
    }
    Some(format!("{scheme}://{host}"))
}

fn is_loopback_host(host: &str) -> bool {
    fn valid_port(port: &str) -> bool {
        !port.is_empty() && port.len() <= 5 && port.chars().all(|ch| ch.is_ascii_digit())
    }

    if host == "localhost" || host == "127.0.0.1" || host == "[::1]" {
        return true;
    }
    if let Some(port) = host.strip_prefix("localhost:") {
        return valid_port(port);
    }
    if let Some(port) = host.strip_prefix("127.0.0.1:") {
        return valid_port(port);
    }
    if let Some(port) = host.strip_prefix("[::1]:") {
        return valid_port(port);
    }
    false
}

fn sanitize_response_preview(value: Option<String>) -> (Option<String>, bool) {
    let Some(value) = value else {
        return (None, false);
    };
    let normalized = value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let truncated = normalized.chars().count() > PROVIDER_SMOKE_RESPONSE_PREVIEW_CHARS;
    let preview = normalized
        .chars()
        .take(PROVIDER_SMOKE_RESPONSE_PREVIEW_CHARS)
        .collect::<String>();
    if preview.is_empty() {
        (None, truncated)
    } else {
        (Some(preview), truncated)
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
    max_bytes: usize,
) -> Result<String, BridgeError> {
    let output = reader
        .join()
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("Provider smoke {stream} reader failed."),
        })?
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("Provider smoke {stream} could not be read."),
        })?;
    if output.exceeded {
        return Err(BridgeError {
            code: "output_too_large".to_string(),
            message: format!("Provider smoke {stream} exceeded the {max_bytes}-byte limit."),
        });
    }
    String::from_utf8(output.bytes).map_err(|_| BridgeError {
        code: "invalid_output".to_string(),
        message: format!("Provider smoke {stream} was not valid UTF-8."),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli_report() -> CliSmokeReport {
        CliSmokeReport {
            ok: true,
            attempted: true,
            configured: true,
            provider_kind: Some("openai_compatible_local".to_string()),
            endpoint_configured: true,
            endpoint_host: Some("http://localhost:8000".to_string()),
            model_configured: true,
            api_key_configured: true,
            status: "pass".to_string(),
            duration_ms: 42,
            response_preview: Some("OK".to_string()),
            response_truncated: false,
            untrusted_output: false,
            error: None,
        }
    }

    #[test]
    fn input_accepts_only_approval_boolean() {
        let parsed =
            serde_json::from_str::<ProviderSmokeInput>(r#"{"approvalAcknowledged":true}"#).unwrap();
        assert!(parsed.approval_acknowledged);
        assert!(serde_json::from_str::<ProviderSmokeInput>(
            r#"{"approvalAcknowledged":true,"args":["anything"]}"#
        )
        .is_err());
        assert!(serde_json::from_str::<ProviderSmokeInput>(
            r#"{"approvalAcknowledged":true,"prompt":"anything"}"#
        )
        .is_err());
    }

    #[test]
    fn command_shape_is_fixed() {
        assert_eq!(PROVIDER_SMOKE_PYTHON_MODULE, "realforge.cli");
        assert_eq!(PROVIDER_SMOKE_ARGV, &["provider", "smoke", "--json"]);
    }

    #[test]
    fn sanitizer_forces_untrusted_and_caps_preview() {
        let mut source = cli_report();
        source.response_preview = Some("X".repeat(PROVIDER_SMOKE_RESPONSE_PREVIEW_CHARS + 20));
        let report = sanitize_report(source);
        assert!(report.untrusted_output);
        assert!(report.response_truncated);
        assert_eq!(
            report.response_preview.unwrap().chars().count(),
            PROVIDER_SMOKE_RESPONSE_PREVIEW_CHARS
        );
    }

    #[test]
    fn sanitizer_rejects_non_loopback_or_path_endpoint() {
        for endpoint in [
            "https://example.invalid:8000",
            "http://localhost:8000/private/path",
            "http://user@localhost:8000",
        ] {
            let mut source = cli_report();
            source.endpoint_host = Some(endpoint.to_string());
            let report = sanitize_report(source);
            assert_eq!(report.endpoint_host, None);
            assert!(!report.endpoint_configured);
        }
    }

    #[test]
    fn sanitizer_drops_unknown_provider_identity_and_error_message() {
        let mut source = cli_report();
        source.ok = false;
        source.status = "fail".to_string();
        source.provider_kind = Some("private-identity".to_string());
        source.error = Some(CliSmokeError {
            code: "unknown-private-code".to_string(),
            message: "secret detail".to_string(),
        });
        let report = sanitize_report(source);
        let serialized = serde_json::to_string(&report).unwrap();
        assert_eq!(report.provider_kind, None);
        assert!(!serialized.contains("private-identity"));
        assert!(!serialized.contains("secret detail"));
        assert_eq!(report.error.unwrap().code, "provider_error");
    }

    #[test]
    fn failure_status_maps_to_fixed_redacted_error() {
        let mut source = cli_report();
        source.ok = false;
        source.status = "not_configured".to_string();
        source.error = Some(CliSmokeError {
            code: "not_configured".to_string(),
            message: "ignored detail".to_string(),
        });
        let report = sanitize_report(source);
        assert_eq!(report.status, "not_configured");
        assert_eq!(report.error.unwrap().code, "not_configured");
    }
}
