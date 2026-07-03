//! Approval-gated local image generation bridge.
//!
//! The frontend submits only a bounded prompt and acknowledgement boolean. Rust
//! owns the executable and argv; the prompt is written only to child stdin. The
//! backend (ComfyUI or an OpenAI-compatible image server) is chosen entirely by
//! the user's gitignored home config — never by the frontend. Output is one
//! sanitized base64 PNG, marked LOCAL UNTRUSTED; no model, key, path, or workflow
//! is ever returned.

use super::resolve_python::resolve_python;
use super::types::BridgeError;
use super::workspace::{get_workspace_resolution, WorkspaceResolutionStatus};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const IMAGE_MAX_PROMPT_CHARS: usize = 2_000;
pub const IMAGE_MAX_PROMPT_BYTES: usize = 8 * 1024;
pub const IMAGE_TIMEOUT_MS: u64 = 90_000; // > Python's 60s image timeout
pub const IMAGE_MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024; // base64 PNG (~12 MB) + JSON
pub const IMAGE_MAX_STDERR_BYTES: usize = 8 * 1024;
pub const IMAGE_PYTHON_MODULE: &str = "realforge.cli";
pub const IMAGE_ARGV: &[&str] = &["provider", "image", "--stdin", "--json"];

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
pub struct ProviderImageGenInput {
    pub prompt: String,
    pub approval_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CliImageError {
    code: String,
    #[allow(dead_code)]
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CliImageReport {
    ok: bool,
    attempted: bool,
    configured: bool,
    status: String,
    input_length: usize,
    duration_ms: u64,
    image_base64: Option<String>,
    mime: Option<String>,
    image_bytes: usize,
    #[allow(dead_code)]
    untrusted_output: bool,
    error: Option<CliImageError>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProviderImageError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProviderImageReport {
    pub ok: bool,
    pub attempted: bool,
    pub configured: bool,
    pub status: String,
    pub input_length: usize,
    pub duration_ms: u64,
    pub image_base64: Option<String>,
    pub mime: Option<String>,
    pub image_bytes: usize,
    pub untrusted_output: bool,
    pub error: Option<ProviderImageError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderImageGenResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ProviderImageReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl ProviderImageGenResult {
    fn success(data: ProviderImageReport) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub(crate) fn failure(code: &str, message: impl Into<String>) -> Self {
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

// ponytail: no single-flight guard/cancel for v1 — the UI disables Generate while a
// request runs and this is a single-user desktop app. Add the chat-style guard if
// concurrent image jobs ever become a real problem.
pub fn run_private_provider_image_gen(input: ProviderImageGenInput) -> ProviderImageGenResult {
    if !input.approval_acknowledged {
        return ProviderImageGenResult::failure(
            "approval_required",
            "Explicit approval is required before generating an image.",
        );
    }
    let prompt = match validate_prompt(&input.prompt) {
        Ok(prompt) => prompt,
        Err(error) => return ProviderImageGenResult::failure(&error.code, error.message),
    };

    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        return ProviderImageGenResult::failure(
            "workspace_not_ready",
            "The RealForge workspace and Python runtime must be ready before generating images.",
        );
    }
    let Some(repo_root) = resolution.repo_root.map(PathBuf::from) else {
        return ProviderImageGenResult::failure(
            "workspace_not_ready",
            "The RealForge workspace is unavailable.",
        );
    };
    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(_) => {
            return ProviderImageGenResult::failure(
                "executable_not_found",
                "The configured RealForge Python runtime is unavailable.",
            )
        }
    };
    if python.components().count() > 1 && !python.is_file() {
        return ProviderImageGenResult::failure(
            "executable_not_found",
            "The configured RealForge Python runtime is unavailable.",
        );
    }

    match run_image_command(&python, &repo_root, &prompt) {
        Ok(report) => ProviderImageGenResult::success(report),
        Err(error) => ProviderImageGenResult::failure(&error.code, error.message),
    }
}

fn validate_prompt(prompt: &str) -> Result<String, BridgeError> {
    if prompt.chars().count() > IMAGE_MAX_PROMPT_CHARS {
        return Err(BridgeError {
            code: "input_too_long".to_string(),
            message: format!("Image prompt exceeds {IMAGE_MAX_PROMPT_CHARS} characters."),
        });
    }
    if prompt.len() > IMAGE_MAX_PROMPT_BYTES {
        return Err(BridgeError {
            code: "input_too_large".to_string(),
            message: "Image prompt exceeds the byte limit.".to_string(),
        });
    }
    if prompt
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(BridgeError {
            code: "invalid_input".to_string(),
            message: "Image prompt contains unsupported control characters.".to_string(),
        });
    }
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err(BridgeError {
            code: "empty_input".to_string(),
            message: "Image prompt must not be empty.".to_string(),
        });
    }
    Ok(trimmed.to_string())
}

fn run_image_command(
    python: &Path,
    repo_root: &Path,
    prompt: &str,
) -> Result<ProviderImageReport, BridgeError> {
    let mut command = Command::new(python);
    command
        .env_clear()
        .arg("-m")
        .arg(IMAGE_PYTHON_MODULE)
        .args(IMAGE_ARGV)
        .current_dir(repo_root)
        .stdin(Stdio::piped())
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
        message: "Could not start the image generation command.".to_string(),
    })?;
    let Some(mut stdin) = child.stdin.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Image generation stdin was unavailable.".to_string(),
        });
    };
    if stdin.write_all(prompt.as_bytes()).is_err() {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "input_failed".to_string(),
            message: "Image prompt could not be delivered.".to_string(),
        });
    }
    drop(stdin);

    let Some(stdout) = child.stdout.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Image generation stdout was unavailable.".to_string(),
        });
    };
    let Some(stderr) = child.stderr.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Image generation stderr was unavailable.".to_string(),
        });
    };
    let stdout_reader = thread::spawn(move || read_capped(stdout, IMAGE_MAX_STDOUT_BYTES));
    let stderr_reader = thread::spawn(move || read_capped(stderr, IMAGE_MAX_STDERR_BYTES));
    let timeout = Duration::from_millis(IMAGE_TIMEOUT_MS);
    let started = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                terminate_child(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "timeout".to_string(),
                    message: "Image generation timed out before returning a result.".to_string(),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                terminate_child(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: "Image generation process monitoring failed.".to_string(),
                });
            }
        }
    };

    let stdout = join_capped_output(stdout_reader, "stdout", IMAGE_MAX_STDOUT_BYTES)?;
    let _stderr = join_capped_output(stderr_reader, "stderr", IMAGE_MAX_STDERR_BYTES)?;
    parse_image_output(&stdout, status)
}

fn terminate_child(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn parse_image_output(
    stdout: &str,
    status: ExitStatus,
) -> Result<ProviderImageReport, BridgeError> {
    let parsed = serde_json::from_str::<CliImageReport>(stdout).map_err(|_| BridgeError {
        code: if status.success() {
            "invalid_json".to_string()
        } else {
            "image_failed".to_string()
        },
        message: "Image generation did not return the expected sanitized JSON report."
            .to_string(),
    })?;
    Ok(sanitize_report(parsed))
}

fn sanitize_report(report: CliImageReport) -> ProviderImageReport {
    let status = match report.status.as_str() {
        "pass" => "pass",
        "not_configured" => "not_configured",
        "rejected" => "rejected",
        _ => "fail",
    };
    // Only forward image bytes on a real pass; never trust a non-PNG mime.
    let mime = match report.mime.as_deref() {
        Some("image/png") if status == "pass" => Some("image/png".to_string()),
        _ => None,
    };
    let image_base64 = if status == "pass" { report.image_base64 } else { None };
    let image_bytes = if image_base64.is_some() {
        report.image_bytes
    } else {
        0
    };
    ProviderImageReport {
        ok: report.ok && status == "pass",
        attempted: report.attempted,
        configured: report.configured,
        status: status.to_string(),
        input_length: report.input_length.min(IMAGE_MAX_PROMPT_CHARS),
        duration_ms: report.duration_ms.min(IMAGE_TIMEOUT_MS),
        image_base64,
        mime,
        image_bytes,
        untrusted_output: true,
        error: sanitize_error(report.error, status),
    }
}

fn sanitize_error(error: Option<CliImageError>, status: &str) -> Option<ProviderImageError> {
    if status == "pass" {
        return None;
    }
    let code = error
        .as_ref()
        .map(|value| value.code.as_str())
        .unwrap_or("provider_error");
    let (code, message) = match code {
        "empty_input" => ("empty_input", "Image prompt must not be empty."),
        "input_too_long" => ("input_too_long", "Image prompt exceeds the character limit."),
        "input_too_large" => ("input_too_large", "Image prompt exceeds the byte limit."),
        "invalid_input" => (
            "invalid_input",
            "Image prompt contains unsupported characters.",
        ),
        "not_configured" => (
            "not_configured",
            "Private local image provider is not configured.",
        ),
        "invalid_config" => (
            "invalid_config",
            "Private local provider configuration is invalid.",
        ),
        "connection_failed" => ("connection_failed", "Local image provider connection failed."),
        "timeout" => ("timeout", "Local image provider request timed out."),
        "http_error" => ("http_error", "Local image provider returned an HTTP error."),
        "invalid_json" => ("invalid_json", "Local image provider returned invalid JSON."),
        "invalid_response" => (
            "invalid_response",
            "Local image provider returned an unsupported image.",
        ),
        "image_too_large" => (
            "image_too_large",
            "Local image exceeded the sandbox size limit.",
        ),
        "response_too_large" => (
            "response_too_large",
            "Local image provider response exceeded the sandbox limit.",
        ),
        "workflow_no_placeholder" => (
            "workflow_no_placeholder",
            "The ComfyUI workflow is missing the %prompt% token.",
        ),
        "invalid_workflow" => ("invalid_workflow", "The ComfyUI workflow is not valid JSON."),
        "workflow_missing" => (
            "workflow_missing",
            "The configured ComfyUI workflow file could not be read.",
        ),
        "workflow_too_large" => (
            "workflow_too_large",
            "The configured ComfyUI workflow file is too large.",
        ),
        _ => ("provider_error", "Local image provider request failed."),
    };
    Some(ProviderImageError {
        code: code.to_string(),
        message: message.to_string(),
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

fn join_capped_output(
    reader: thread::JoinHandle<Result<CappedOutput, std::io::Error>>,
    stream: &str,
    max_bytes: usize,
) -> Result<String, BridgeError> {
    let output = reader
        .join()
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("Image generation {stream} reader failed."),
        })?
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("Image generation {stream} could not be read."),
        })?;
    if output.exceeded {
        return Err(BridgeError {
            code: "output_too_large".to_string(),
            message: format!("Image generation {stream} exceeded the {max_bytes}-byte limit."),
        });
    }
    String::from_utf8(output.bytes).map_err(|_| BridgeError {
        code: "invalid_output".to_string(),
        message: format!("Image generation {stream} was not valid UTF-8."),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli_report() -> CliImageReport {
        CliImageReport {
            ok: true,
            attempted: true,
            configured: true,
            status: "pass".to_string(),
            input_length: 5,
            duration_ms: 42,
            image_base64: Some("iVBORw0KGgo=".to_string()),
            mime: Some("image/png".to_string()),
            image_bytes: 68,
            untrusted_output: false,
            error: None,
        }
    }

    #[test]
    fn input_accepts_only_prompt_and_approval() {
        let parsed = serde_json::from_str::<ProviderImageGenInput>(
            r#"{"prompt":"a fox","approvalAcknowledged":true}"#,
        )
        .unwrap();
        assert_eq!(parsed.prompt, "a fox");
        assert!(parsed.approval_acknowledged);
        for extra in ["args", "path", "model", "endpoint", "workflow"] {
            let payload =
                format!(r#"{{"prompt":"x","approvalAcknowledged":true,"{extra}":"blocked"}}"#);
            assert!(serde_json::from_str::<ProviderImageGenInput>(&payload).is_err());
        }
    }

    #[test]
    fn command_shape_is_fixed_and_stdin_only() {
        assert_eq!(IMAGE_PYTHON_MODULE, "realforge.cli");
        assert_eq!(IMAGE_ARGV, &["provider", "image", "--stdin", "--json"]);
    }

    #[test]
    fn prompt_validation_is_bounded() {
        assert_eq!(validate_prompt("  a cat  ").unwrap(), "a cat");
        assert_eq!(validate_prompt("   ").unwrap_err().code, "empty_input");
        assert_eq!(
            validate_prompt(&"X".repeat(IMAGE_MAX_PROMPT_CHARS + 1))
                .unwrap_err()
                .code,
            "input_too_long"
        );
        assert_eq!(
            validate_prompt("bad\0prompt").unwrap_err().code,
            "invalid_input"
        );
    }

    #[test]
    fn sanitizer_forces_untrusted_and_keeps_png_on_pass() {
        let report = sanitize_report(cli_report());
        assert!(report.untrusted_output);
        assert!(report.ok);
        assert_eq!(report.mime.as_deref(), Some("image/png"));
        assert!(report.image_base64.is_some());
    }

    #[test]
    fn sanitizer_drops_image_and_redacts_error_on_failure() {
        let mut source = cli_report();
        source.ok = false;
        source.status = "fail".to_string();
        source.mime = Some("image/png".to_string());
        source.image_base64 = Some("leaked".to_string());
        source.error = Some(CliImageError {
            code: "unknown-private-code".to_string(),
            message: "private transport detail".to_string(),
        });
        let report = sanitize_report(source);
        let serialized = serde_json::to_string(&report).unwrap();
        assert_eq!(report.image_base64, None);
        assert_eq!(report.mime, None);
        assert_eq!(report.image_bytes, 0);
        assert!(!serialized.contains("leaked"));
        assert!(!serialized.contains("private transport detail"));
        assert_eq!(report.error.unwrap().code, "provider_error");
    }

    #[test]
    fn sanitizer_maps_comfyui_workflow_error() {
        let mut source = cli_report();
        source.ok = false;
        source.status = "fail".to_string();
        source.error = Some(CliImageError {
            code: "workflow_no_placeholder".to_string(),
            message: "detail".to_string(),
        });
        let report = sanitize_report(source);
        assert_eq!(report.error.unwrap().code, "workflow_no_placeholder");
    }

    #[test]
    fn serialized_report_has_no_private_fields() {
        let report = sanitize_report(cli_report());
        let serialized = serde_json::to_value(report).unwrap();
        let object = serialized.as_object().unwrap();
        assert!(!object.contains_key("model"));
        assert!(!object.contains_key("api_key"));
        assert!(!object.contains_key("workflow"));
        assert!(!object.contains_key("endpoint"));
        assert!(!object.contains_key("prompt"));
    }
}
