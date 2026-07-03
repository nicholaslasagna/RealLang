//! Approval-gated private chat sandbox bridge for Workbench 0.26-0.27.
//!
//! The frontend can submit only a bounded prompt and acknowledgement boolean.
//! Rust owns the executable and argv; the prompt is written only to child stdin.
//! One process may run at a time, and cancellation can only signal that process.

use super::resolve_python::resolve_python;
use super::types::BridgeError;
use super::workspace::{get_workspace_resolution, WorkspaceResolutionStatus};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

pub const CHAT_SANDBOX_MAX_PROMPT_CHARS: usize = 2_000;
pub const CHAT_SANDBOX_MAX_PROMPT_BYTES: usize = 8 * 1024;
pub const CHAT_SANDBOX_MAX_RESPONSE_CHARS: usize = 4_096;
pub const CHAT_SANDBOX_TIMEOUT_MS: u64 = 25_000;
pub const CHAT_SANDBOX_MAX_STDOUT_BYTES: usize = 32 * 1024;
pub const CHAT_SANDBOX_MAX_STDERR_BYTES: usize = 8 * 1024;
pub const CHAT_SANDBOX_PYTHON_MODULE: &str = "realforge.cli";
pub const CHAT_SANDBOX_ARGV: &[&str] = &["provider", "chat-sandbox", "--stdin", "--json"];
pub const CHAT_SANDBOX_STREAM_ARGV: &[&str] =
    &["provider", "chat-sandbox", "--stdin", "--stream"];

const PASSTHROUGH_ENV: &[&str] = &[
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
];

static ACTIVE_CHAT_REQUEST: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderChatSandboxInput {
    pub prompt: String,
    pub approval_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CliChatSandboxError {
    code: String,
    #[allow(dead_code)]
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CliChatSandboxReport {
    ok: bool,
    attempted: bool,
    configured: bool,
    provider_kind: Option<String>,
    status: String,
    input_length: usize,
    duration_ms: u64,
    response: Option<String>,
    response_truncated: bool,
    #[allow(dead_code)]
    untrusted_output: bool,
    error: Option<CliChatSandboxError>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProviderChatSandboxError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProviderChatSandboxReport {
    pub ok: bool,
    pub attempted: bool,
    pub configured: bool,
    pub provider_kind: Option<String>,
    pub status: String,
    pub input_length: usize,
    pub duration_ms: u64,
    pub response: Option<String>,
    pub response_truncated: bool,
    pub untrusted_output: bool,
    pub error: Option<ProviderChatSandboxError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderChatSandboxResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ProviderChatSandboxReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl ProviderChatSandboxResult {
    fn success(data: ProviderChatSandboxReport) -> Self {
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderChatSandboxCancelResult {
    pub ok: bool,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

#[derive(Debug)]
struct ActiveChatRequestGuard {
    cancellation: Arc<AtomicBool>,
}

impl Drop for ActiveChatRequestGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
            if active
                .as_ref()
                .is_some_and(|current| Arc::ptr_eq(current, &self.cancellation))
            {
                *active = None;
            }
        }
    }
}

fn begin_chat_request() -> Result<(Arc<AtomicBool>, ActiveChatRequestGuard), BridgeError> {
    let mut active = ACTIVE_CHAT_REQUEST.lock().map_err(|_| BridgeError {
        code: "request_state_unavailable".to_string(),
        message: "Private chat sandbox request state is unavailable.".to_string(),
    })?;
    if active.is_some() {
        return Err(BridgeError {
            code: "request_in_progress".to_string(),
            message: "A private chat sandbox request is already running.".to_string(),
        });
    }
    let cancellation = Arc::new(AtomicBool::new(false));
    *active = Some(Arc::clone(&cancellation));
    Ok((
        Arc::clone(&cancellation),
        ActiveChatRequestGuard { cancellation },
    ))
}

pub fn cancel_private_provider_chat_sandbox() -> ProviderChatSandboxCancelResult {
    match ACTIVE_CHAT_REQUEST.lock() {
        Ok(active) => {
            if let Some(cancellation) = active.as_ref() {
                cancellation.store(true, Ordering::Release);
                ProviderChatSandboxCancelResult {
                    ok: true,
                    status: "cancellation_requested".to_string(),
                    error: None,
                }
            } else {
                ProviderChatSandboxCancelResult {
                    ok: true,
                    status: "idle".to_string(),
                    error: None,
                }
            }
        }
        Err(_) => ProviderChatSandboxCancelResult {
            ok: false,
            status: "unavailable".to_string(),
            error: Some(BridgeError {
                code: "request_state_unavailable".to_string(),
                message: "Private chat sandbox request state is unavailable.".to_string(),
            }),
        },
    }
}

pub fn run_private_provider_chat_sandbox(
    input: ProviderChatSandboxInput,
) -> ProviderChatSandboxResult {
    if !input.approval_acknowledged {
        return ProviderChatSandboxResult::failure(
            "approval_required",
            "Explicit approval is required before sending sandbox text.",
        );
    }
    let prompt = match validate_prompt(&input.prompt) {
        Ok(prompt) => prompt,
        Err(error) => {
            return ProviderChatSandboxResult::failure(&error.code, error.message);
        }
    };
    let (cancellation, _active_request) = match begin_chat_request() {
        Ok(active_request) => active_request,
        Err(error) => {
            return ProviderChatSandboxResult::failure(&error.code, error.message);
        }
    };

    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        return ProviderChatSandboxResult::failure(
            "workspace_not_ready",
            "The RealForge workspace and Python runtime must be ready before using private chat sandbox.",
        );
    }
    let Some(repo_root) = resolution.repo_root.map(PathBuf::from) else {
        return ProviderChatSandboxResult::failure(
            "workspace_not_ready",
            "The RealForge workspace is unavailable.",
        );
    };
    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(_) => {
            return ProviderChatSandboxResult::failure(
                "executable_not_found",
                "The configured RealForge Python runtime is unavailable.",
            );
        }
    };
    if python.components().count() > 1 && !python.is_file() {
        return ProviderChatSandboxResult::failure(
            "executable_not_found",
            "The configured RealForge Python runtime is unavailable.",
        );
    }

    match run_fixed_chat(
        &python,
        &repo_root,
        &prompt,
        CHAT_SANDBOX_TIMEOUT_MS,
        CHAT_SANDBOX_MAX_STDOUT_BYTES,
        CHAT_SANDBOX_MAX_STDERR_BYTES,
        &cancellation,
    ) {
        Ok(report) => ProviderChatSandboxResult::success(report),
        Err(error) => ProviderChatSandboxResult::failure(&error.code, error.message),
    }
}

fn validate_prompt(prompt: &str) -> Result<String, BridgeError> {
    if prompt.chars().count() > CHAT_SANDBOX_MAX_PROMPT_CHARS {
        return Err(BridgeError {
            code: "input_too_long".to_string(),
            message: format!(
                "Chat sandbox input exceeds {CHAT_SANDBOX_MAX_PROMPT_CHARS} characters."
            ),
        });
    }
    if prompt.len() > CHAT_SANDBOX_MAX_PROMPT_BYTES {
        return Err(BridgeError {
            code: "input_too_large".to_string(),
            message: "Chat sandbox input exceeds the byte limit.".to_string(),
        });
    }
    if prompt
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(BridgeError {
            code: "invalid_input".to_string(),
            message: "Chat sandbox input contains unsupported control characters.".to_string(),
        });
    }
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err(BridgeError {
            code: "empty_input".to_string(),
            message: "Chat sandbox input must not be empty.".to_string(),
        });
    }
    Ok(trimmed.to_string())
}

fn run_fixed_chat(
    python: &Path,
    repo_root: &Path,
    prompt: &str,
    timeout_ms: u64,
    max_stdout_bytes: usize,
    max_stderr_bytes: usize,
    cancellation: &AtomicBool,
) -> Result<ProviderChatSandboxReport, BridgeError> {
    if cancellation.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    let mut command = Command::new(python);
    command
        .env_clear()
        .arg("-m")
        .arg(CHAT_SANDBOX_PYTHON_MODULE)
        .args(CHAT_SANDBOX_ARGV)
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
        message: "Could not start the fixed private chat sandbox command.".to_string(),
    })?;
    let Some(mut stdin) = child.stdin.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Private chat sandbox stdin was unavailable.".to_string(),
        });
    };
    if stdin.write_all(prompt.as_bytes()).is_err() {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "input_failed".to_string(),
            message: "Private chat sandbox input could not be delivered.".to_string(),
        });
    }
    drop(stdin);

    let Some(stdout) = child.stdout.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Private chat sandbox stdout was unavailable.".to_string(),
        });
    };
    let Some(stderr) = child.stderr.take() else {
        terminate_child(&mut child);
        return Err(BridgeError {
            code: "spawn_failed".to_string(),
            message: "Private chat sandbox stderr was unavailable.".to_string(),
        });
    };
    let stdout_reader = thread::spawn(move || read_capped(stdout, max_stdout_bytes));
    let stderr_reader = thread::spawn(move || read_capped(stderr, max_stderr_bytes));
    let timeout = Duration::from_millis(timeout_ms);
    let started = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if cancellation.load(Ordering::Acquire) => {
                terminate_child(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(cancelled_error());
            }
            Ok(None) if started.elapsed() >= timeout => {
                terminate_child(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "timeout".to_string(),
                    message: "Private chat sandbox timed out before returning a result."
                        .to_string(),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                terminate_child(&mut child);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(BridgeError {
                    code: "spawn_failed".to_string(),
                    message: "Private chat sandbox process monitoring failed.".to_string(),
                });
            }
        }
    };

    let stdout = join_capped_output(stdout_reader, "stdout", max_stdout_bytes)?;
    let _stderr = join_capped_output(stderr_reader, "stderr", max_stderr_bytes)?;
    parse_chat_output(&stdout, status)
}

fn terminate_child(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn cancelled_error() -> BridgeError {
    BridgeError {
        code: "cancelled".to_string(),
        message: "Private chat sandbox request was cancelled.".to_string(),
    }
}

fn parse_chat_output(
    stdout: &str,
    status: ExitStatus,
) -> Result<ProviderChatSandboxReport, BridgeError> {
    let parsed = serde_json::from_str::<CliChatSandboxReport>(stdout).map_err(|_| BridgeError {
        code: if status.success() {
            "invalid_json".to_string()
        } else {
            "chat_failed".to_string()
        },
        message: "Private chat sandbox did not return the expected sanitized JSON report."
            .to_string(),
    })?;
    Ok(sanitize_report(parsed))
}

fn sanitize_report(report: CliChatSandboxReport) -> ProviderChatSandboxReport {
    let (response, response_truncated) = sanitize_response(report.response);
    let status = match report.status.as_str() {
        "pass" => "pass",
        "not_configured" => "not_configured",
        "rejected" => "rejected",
        _ => "fail",
    };
    ProviderChatSandboxReport {
        ok: report.ok && status == "pass",
        attempted: report.attempted,
        configured: report.configured,
        provider_kind: match report.provider_kind.as_deref() {
            Some("openai_compatible_local") => Some("openai_compatible_local".to_string()),
            _ => None,
        },
        status: status.to_string(),
        input_length: report.input_length.min(CHAT_SANDBOX_MAX_PROMPT_CHARS),
        duration_ms: report.duration_ms.min(CHAT_SANDBOX_TIMEOUT_MS),
        response,
        response_truncated: report.response_truncated || response_truncated,
        untrusted_output: true,
        error: sanitize_error(report.error, status),
    }
}

fn sanitize_error(
    error: Option<CliChatSandboxError>,
    status: &str,
) -> Option<ProviderChatSandboxError> {
    if status == "pass" {
        return None;
    }
    let code = error
        .as_ref()
        .map(|value| value.code.as_str())
        .unwrap_or("provider_error");
    let (code, message) = match code {
        "empty_input" => ("empty_input", "Chat sandbox input must not be empty."),
        "input_too_long" => (
            "input_too_long",
            "Chat sandbox input exceeds the character limit.",
        ),
        "input_too_large" => (
            "input_too_large",
            "Chat sandbox input exceeds the byte limit.",
        ),
        "invalid_input" => (
            "invalid_input",
            "Chat sandbox input contains unsupported characters.",
        ),
        "not_configured" => (
            "not_configured",
            "Private local provider is not configured.",
        ),
        "unsupported_provider" => (
            "unsupported_provider",
            "Private chat sandbox supports only the OpenAI-compatible local provider.",
        ),
        "connection_failed" => ("connection_failed", "Local provider connection failed."),
        "timeout" => ("timeout", "Local provider chat request timed out."),
        "http_error" => ("http_error", "Local provider returned an HTTP error."),
        "invalid_json" => ("invalid_json", "Local provider returned invalid JSON."),
        "invalid_response" => (
            "invalid_response",
            "Local provider returned an unsupported response.",
        ),
        "response_too_large" => (
            "response_too_large",
            "Local provider response exceeded the sandbox limit.",
        ),
        "invalid_config" => (
            "invalid_config",
            "Private local provider configuration is invalid.",
        ),
        _ => ("provider_error", "Local provider chat request failed."),
    };
    Some(ProviderChatSandboxError {
        code: code.to_string(),
        message: message.to_string(),
    })
}

fn sanitize_response(value: Option<String>) -> (Option<String>, bool) {
    let Some(value) = value else {
        return (None, false);
    };
    let safe = value
        .chars()
        .map(|character| {
            if character.is_control() && !matches!(character, '\n' | '\t') {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let truncated = safe.chars().count() > CHAT_SANDBOX_MAX_RESPONSE_CHARS;
    let response = safe
        .chars()
        .take(CHAT_SANDBOX_MAX_RESPONSE_CHARS)
        .collect::<String>();
    if response.is_empty() {
        (None, truncated)
    } else {
        (Some(response), truncated)
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
            message: format!("Private chat sandbox {stream} reader failed."),
        })?
        .map_err(|_| BridgeError {
            code: "read_failed".to_string(),
            message: format!("Private chat sandbox {stream} could not be read."),
        })?;
    if output.exceeded {
        return Err(BridgeError {
            code: "output_too_large".to_string(),
            message: format!(
                "Private chat sandbox {stream} exceeded the {max_bytes}-byte limit."
            ),
        });
    }
    String::from_utf8(output.bytes).map_err(|_| BridgeError {
        code: "invalid_output".to_string(),
        message: format!("Private chat sandbox {stream} was not valid UTF-8."),
    })
}

// ---------------------------------------------------------------------------
// Streaming (0.28). Same approval gate, prompt caps, single-flight guard,
// cancellation, timeout, and redaction as the single-shot path — but sanitized
// NDJSON delta/final/error events are forwarded to the frontend as they arrive.
// Rust re-sanitizes EVERY event: the child is never trusted to have already
// capped the response or redacted provider identity. Exactly one terminal event
// (final or error) is always emitted so the UI can never hang "responding".
// ---------------------------------------------------------------------------

/// Sanitized stream event forwarded to the frontend over a Tauri channel.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatStreamEvent {
    Delta {
        text: String,
    },
    Final {
        ok: bool,
        attempted: bool,
        configured: bool,
        provider_kind: Option<String>,
        status: String,
        input_length: usize,
        duration_ms: u64,
        response_truncated: bool,
        untrusted_output: bool,
    },
    Error {
        ok: bool,
        attempted: bool,
        configured: bool,
        provider_kind: Option<String>,
        status: String,
        input_length: usize,
        duration_ms: u64,
        untrusted_output: bool,
        error: ProviderChatSandboxError,
    },
}

/// Raw NDJSON line shape emitted by the CLI `--stream` path (pre-sanitization).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum CliStreamEvent {
    Delta {
        text: String,
    },
    Final {
        #[serde(default)]
        ok: bool,
        #[serde(default)]
        attempted: bool,
        #[serde(default)]
        configured: bool,
        #[serde(default)]
        provider_kind: Option<String>,
        #[serde(default)]
        status: String,
        #[serde(default)]
        input_length: usize,
        #[serde(default)]
        duration_ms: u64,
        #[serde(default)]
        response_truncated: bool,
    },
    Error {
        #[serde(default)]
        attempted: bool,
        #[serde(default)]
        configured: bool,
        #[serde(default)]
        provider_kind: Option<String>,
        #[serde(default)]
        status: String,
        #[serde(default)]
        input_length: usize,
        #[serde(default)]
        duration_ms: u64,
        #[serde(default)]
        error: Option<CliChatSandboxError>,
    },
}

enum LineMsg {
    Line(String),
    TooLarge,
    ReadError,
}

fn normalize_stream_status(status: &str) -> String {
    match status {
        "pass" => "pass",
        "not_configured" => "not_configured",
        "rejected" => "rejected",
        _ => "fail",
    }
    .to_string()
}

fn sanitize_stream_provider_kind(kind: Option<String>) -> Option<String> {
    match kind.as_deref() {
        Some("openai_compatible_local") => Some("openai_compatible_local".to_string()),
        _ => None,
    }
}

fn sanitize_delta_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() && !matches!(character, '\n' | '\t') {
                ' '
            } else {
                character
            }
        })
        .collect()
}

/// A Rust-authored (trusted) terminal error event — code and message are static
/// constants, never private provider text.
fn stream_bridge_error(code: &str, message: &str, status: &str) -> ChatStreamEvent {
    ChatStreamEvent::Error {
        ok: false,
        attempted: false,
        configured: false,
        provider_kind: None,
        status: normalize_stream_status(status),
        input_length: 0,
        duration_ms: 0,
        untrusted_output: true,
        error: ProviderChatSandboxError {
            code: code.to_string(),
            message: message.to_string(),
        },
    }
}

/// Map a CLI terminal line (final/error) to a sanitized event; deltas return None.
fn map_terminal_cli_event(event: CliStreamEvent, extra_truncated: bool) -> Option<ChatStreamEvent> {
    match event {
        CliStreamEvent::Delta { .. } => None,
        CliStreamEvent::Final {
            ok,
            attempted,
            configured,
            provider_kind,
            status,
            input_length,
            duration_ms,
            response_truncated,
        } => {
            let normalized = normalize_stream_status(&status);
            Some(ChatStreamEvent::Final {
                ok: ok && normalized == "pass",
                attempted,
                configured,
                provider_kind: sanitize_stream_provider_kind(provider_kind),
                status: normalized,
                input_length: input_length.min(CHAT_SANDBOX_MAX_PROMPT_CHARS),
                duration_ms: duration_ms.min(CHAT_SANDBOX_TIMEOUT_MS),
                response_truncated: response_truncated || extra_truncated,
                untrusted_output: true,
            })
        }
        CliStreamEvent::Error {
            attempted,
            configured,
            provider_kind,
            status,
            input_length,
            duration_ms,
            error,
        } => {
            let normalized = normalize_stream_status(&status);
            let sanitized = sanitize_error(error, &normalized).unwrap_or(ProviderChatSandboxError {
                code: "provider_error".to_string(),
                message: "Local provider chat request failed.".to_string(),
            });
            Some(ChatStreamEvent::Error {
                ok: false,
                attempted,
                configured,
                provider_kind: sanitize_stream_provider_kind(provider_kind),
                status: normalized,
                input_length: input_length.min(CHAT_SANDBOX_MAX_PROMPT_CHARS),
                duration_ms: duration_ms.min(CHAT_SANDBOX_TIMEOUT_MS),
                untrusted_output: true,
                error: sanitized,
            })
        }
    }
}

pub fn run_private_provider_chat_sandbox_stream<F>(input: ProviderChatSandboxInput, emit: F)
where
    F: Fn(ChatStreamEvent),
{
    if !input.approval_acknowledged {
        emit(stream_bridge_error(
            "approval_required",
            "Explicit approval is required before sending sandbox text.",
            "rejected",
        ));
        return;
    }
    let prompt = match validate_prompt(&input.prompt) {
        Ok(prompt) => prompt,
        Err(error) => {
            emit(stream_bridge_error(&error.code, &error.message, "rejected"));
            return;
        }
    };
    let (cancellation, _active_request) = match begin_chat_request() {
        Ok(active_request) => active_request,
        Err(error) => {
            emit(stream_bridge_error(&error.code, &error.message, "fail"));
            return;
        }
    };

    let resolution = get_workspace_resolution();
    if resolution.status != WorkspaceResolutionStatus::Ready {
        emit(stream_bridge_error(
            "workspace_not_ready",
            "The RealForge workspace and Python runtime must be ready before using private chat sandbox.",
            "fail",
        ));
        return;
    }
    let Some(repo_root) = resolution.repo_root.map(PathBuf::from) else {
        emit(stream_bridge_error(
            "workspace_not_ready",
            "The RealForge workspace is unavailable.",
            "fail",
        ));
        return;
    };
    let python = match resolve_python(&repo_root) {
        Ok(path) => path,
        Err(_) => {
            emit(stream_bridge_error(
                "executable_not_found",
                "The configured RealForge Python runtime is unavailable.",
                "fail",
            ));
            return;
        }
    };
    if python.components().count() > 1 && !python.is_file() {
        emit(stream_bridge_error(
            "executable_not_found",
            "The configured RealForge Python runtime is unavailable.",
            "fail",
        ));
        return;
    }

    stream_fixed_chat(
        &python,
        &repo_root,
        &prompt,
        CHAT_SANDBOX_TIMEOUT_MS,
        CHAT_SANDBOX_MAX_STDOUT_BYTES,
        &cancellation,
        &emit,
    );
}

fn stream_fixed_chat<F: Fn(ChatStreamEvent)>(
    python: &Path,
    repo_root: &Path,
    prompt: &str,
    timeout_ms: u64,
    max_stdout_bytes: usize,
    cancellation: &AtomicBool,
    emit: &F,
) {
    if cancellation.load(Ordering::Acquire) {
        emit(stream_bridge_error(
            "cancelled",
            "Private chat sandbox request was cancelled.",
            "fail",
        ));
        return;
    }

    let mut command = Command::new(python);
    command
        .env_clear()
        .arg("-m")
        .arg(CHAT_SANDBOX_PYTHON_MODULE)
        .args(CHAT_SANDBOX_STREAM_ARGV)
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

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            emit(stream_bridge_error(
                "spawn_failed",
                "Could not start the fixed private chat sandbox command.",
                "fail",
            ));
            return;
        }
    };
    match child.stdin.take() {
        Some(mut stdin) => {
            if stdin.write_all(prompt.as_bytes()).is_err() {
                terminate_child(&mut child);
                emit(stream_bridge_error(
                    "input_failed",
                    "Private chat sandbox input could not be delivered.",
                    "fail",
                ));
                return;
            }
            drop(stdin);
        }
        None => {
            terminate_child(&mut child);
            emit(stream_bridge_error(
                "spawn_failed",
                "Private chat sandbox stdin was unavailable.",
                "fail",
            ));
            return;
        }
    }
    let Some(stdout) = child.stdout.take() else {
        terminate_child(&mut child);
        emit(stream_bridge_error(
            "spawn_failed",
            "Private chat sandbox stdout was unavailable.",
            "fail",
        ));
        return;
    };
    // Drain stderr (capped, discarded) so a full pipe can never block the child.
    let stderr_reader = child.stderr.take().map(|stderr| {
        thread::spawn(move || {
            let _ = read_capped(stderr, CHAT_SANDBOX_MAX_STDERR_BYTES);
        })
    });

    let (tx, rx) = mpsc::channel::<LineMsg>();
    let reader = thread::spawn(move || {
        let mut buffered = BufReader::new(stdout);
        let mut line = String::new();
        let mut total = 0usize;
        loop {
            line.clear();
            match buffered.read_line(&mut line) {
                Ok(0) => break,
                Ok(read) => {
                    total = total.saturating_add(read);
                    if total > max_stdout_bytes {
                        let _ = tx.send(LineMsg::TooLarge);
                        break;
                    }
                    let trimmed = line.trim_end_matches(['\n', '\r']);
                    if !trimmed.is_empty()
                        && tx.send(LineMsg::Line(trimmed.to_string())).is_err()
                    {
                        break;
                    }
                }
                Err(_) => {
                    let _ = tx.send(LineMsg::ReadError);
                    break;
                }
            }
        }
    });

    let timeout = Duration::from_millis(timeout_ms);
    let started = Instant::now();
    let mut cumulative_chars = 0usize;
    let mut truncated_total = false;
    let mut saw_terminal = false;
    let mut failure: Option<ChatStreamEvent> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(25)) {
            Ok(LineMsg::Line(line)) => {
                match serde_json::from_str::<CliStreamEvent>(&line) {
                    Ok(CliStreamEvent::Delta { text }) => {
                        let safe = sanitize_delta_text(&text);
                        let remaining =
                            CHAT_SANDBOX_MAX_RESPONSE_CHARS.saturating_sub(cumulative_chars);
                        if remaining == 0 {
                            truncated_total = true;
                        } else {
                            let chars: Vec<char> = safe.chars().collect();
                            let take = chars.len().min(remaining);
                            if take < chars.len() {
                                truncated_total = true;
                            }
                            if take > 0 {
                                cumulative_chars += take;
                                let out: String = chars[..take].iter().collect();
                                emit(ChatStreamEvent::Delta { text: out });
                            }
                        }
                    }
                    Ok(other) => {
                        if let Some(event) = map_terminal_cli_event(other, truncated_total) {
                            saw_terminal = true;
                            emit(event);
                        }
                    }
                    // Malformed line: never forward raw child output.
                    Err(_) => {}
                }
                if cancellation.load(Ordering::Acquire) {
                    failure = Some(stream_bridge_error(
                        "cancelled",
                        "Private chat sandbox request was cancelled.",
                        "fail",
                    ));
                    break;
                }
                if started.elapsed() >= timeout {
                    failure = Some(stream_bridge_error(
                        "timeout",
                        "Private chat sandbox timed out before returning a result.",
                        "fail",
                    ));
                    break;
                }
            }
            Ok(LineMsg::TooLarge) => {
                failure = Some(stream_bridge_error(
                    "output_too_large",
                    "Private chat sandbox stdout exceeded its limit.",
                    "fail",
                ));
                break;
            }
            Ok(LineMsg::ReadError) => {
                failure = Some(stream_bridge_error(
                    "read_failed",
                    "Private chat sandbox stdout could not be read.",
                    "fail",
                ));
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if cancellation.load(Ordering::Acquire) {
                    failure = Some(stream_bridge_error(
                        "cancelled",
                        "Private chat sandbox request was cancelled.",
                        "fail",
                    ));
                    break;
                }
                if started.elapsed() >= timeout {
                    failure = Some(stream_bridge_error(
                        "timeout",
                        "Private chat sandbox timed out before returning a result.",
                        "fail",
                    ));
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    terminate_child(&mut child);
    let _ = reader.join();
    if let Some(handle) = stderr_reader {
        let _ = handle.join();
    }

    // Guarantee exactly one terminal event so the UI never hangs "responding".
    if let Some(event) = failure {
        if !saw_terminal {
            emit(event);
        }
    } else if !saw_terminal {
        emit(stream_bridge_error(
            "provider_error",
            "Private chat sandbox ended without a final result.",
            "fail",
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli_report() -> CliChatSandboxReport {
        CliChatSandboxReport {
            ok: true,
            attempted: true,
            configured: true,
            provider_kind: Some("openai_compatible_local".to_string()),
            status: "pass".to_string(),
            input_length: 5,
            duration_ms: 42,
            response: Some("Hello".to_string()),
            response_truncated: false,
            untrusted_output: false,
            error: None,
        }
    }

    #[test]
    fn input_accepts_only_prompt_and_approval() {
        let parsed = serde_json::from_str::<ProviderChatSandboxInput>(
            r#"{"prompt":"Hello","approvalAcknowledged":true}"#,
        )
        .unwrap();
        assert_eq!(parsed.prompt, "Hello");
        assert!(parsed.approval_acknowledged);
        for extra in ["args", "path", "tools", "model", "endpoint"] {
            let payload = format!(
                r#"{{"prompt":"Hello","approvalAcknowledged":true,"{extra}":"blocked"}}"#
            );
            assert!(serde_json::from_str::<ProviderChatSandboxInput>(&payload).is_err());
        }
    }

    #[test]
    fn command_shape_is_fixed_and_stdin_only() {
        assert_eq!(CHAT_SANDBOX_PYTHON_MODULE, "realforge.cli");
        assert_eq!(
            CHAT_SANDBOX_ARGV,
            &["provider", "chat-sandbox", "--stdin", "--json"]
        );
    }

    #[test]
    fn prompt_validation_is_bounded() {
        assert_eq!(validate_prompt("  Hello  ").unwrap(), "Hello");
        assert_eq!(validate_prompt("").unwrap_err().code, "empty_input");
        assert_eq!(
            validate_prompt(&"X".repeat(CHAT_SANDBOX_MAX_PROMPT_CHARS + 1))
                .unwrap_err()
                .code,
            "input_too_long"
        );
        assert_eq!(
            validate_prompt("Hello\0world").unwrap_err().code,
            "invalid_input"
        );
    }

    #[test]
    fn sanitizer_forces_untrusted_and_caps_response() {
        let mut source = cli_report();
        source.response = Some("R".repeat(CHAT_SANDBOX_MAX_RESPONSE_CHARS + 20));
        let report = sanitize_report(source);
        assert!(report.untrusted_output);
        assert!(report.response_truncated);
        assert_eq!(
            report.response.unwrap().chars().count(),
            CHAT_SANDBOX_MAX_RESPONSE_CHARS
        );
    }

    #[test]
    fn sanitizer_drops_unknown_identity_and_raw_error() {
        let mut source = cli_report();
        source.ok = false;
        source.status = "fail".to_string();
        source.provider_kind = Some("hidden-identity".to_string());
        source.error = Some(CliChatSandboxError {
            code: "unknown-private-code".to_string(),
            message: "private transport detail".to_string(),
        });
        let report = sanitize_report(source);
        let serialized = serde_json::to_string(&report).unwrap();
        assert_eq!(report.provider_kind, None);
        assert!(!serialized.contains("hidden-identity"));
        assert!(!serialized.contains("private transport detail"));
        assert_eq!(report.error.unwrap().code, "provider_error");
    }

    #[test]
    fn serialized_report_has_no_prompt_or_private_fields() {
        let report = sanitize_report(cli_report());
        let serialized = serde_json::to_value(report).unwrap();
        let object = serialized.as_object().unwrap();
        assert!(!object.contains_key("prompt"));
        assert!(!object.contains_key("api_key"));
        assert!(!object.contains_key("model"));
        assert!(!object.contains_key("model_path"));
        assert!(!object.contains_key("endpoint"));
    }

    #[test]
    fn concurrent_request_is_rejected_and_cancel_is_input_free() {
        let (cancellation, guard) = begin_chat_request().unwrap();
        let concurrent = begin_chat_request().unwrap_err();
        assert_eq!(concurrent.code, "request_in_progress");

        let cancelled = cancel_private_provider_chat_sandbox();
        assert!(cancelled.ok);
        assert_eq!(cancelled.status, "cancellation_requested");
        assert!(cancellation.load(Ordering::Acquire));

        drop(guard);
        let idle = cancel_private_provider_chat_sandbox();
        assert!(idle.ok);
        assert_eq!(idle.status, "idle");
    }

    #[test]
    fn stream_argv_is_fixed_and_stdin_only() {
        assert_eq!(
            CHAT_SANDBOX_STREAM_ARGV,
            &["provider", "chat-sandbox", "--stdin", "--stream"]
        );
    }

    #[test]
    fn stream_delta_text_strips_control_chars() {
        assert_eq!(sanitize_delta_text("a\u{0007}b\nc\td"), "a b\nc\td");
    }

    #[test]
    fn stream_terminal_error_redacts_identity_and_unknown_code() {
        let event = map_terminal_cli_event(
            CliStreamEvent::Error {
                attempted: true,
                configured: true,
                provider_kind: Some("hidden-identity".to_string()),
                status: "weird".to_string(),
                input_length: 9_999,
                duration_ms: 999_999,
                error: Some(CliChatSandboxError {
                    code: "unknown-private-code".to_string(),
                    message: "private transport detail".to_string(),
                }),
            },
            false,
        )
        .unwrap();
        let serialized = serde_json::to_string(&event).unwrap();
        assert!(!serialized.contains("hidden-identity"));
        assert!(!serialized.contains("private transport detail"));
        match event {
            ChatStreamEvent::Error {
                provider_kind,
                status,
                error,
                input_length,
                duration_ms,
                untrusted_output,
                ..
            } => {
                assert_eq!(provider_kind, None);
                assert_eq!(status, "fail");
                assert_eq!(error.code, "provider_error");
                assert_eq!(input_length, CHAT_SANDBOX_MAX_PROMPT_CHARS);
                assert_eq!(duration_ms, CHAT_SANDBOX_TIMEOUT_MS);
                assert!(untrusted_output);
            }
            _ => panic!("expected a sanitized error event"),
        }
    }

    #[test]
    fn stream_terminal_final_normalizes_and_forces_truncation_flag() {
        let event = map_terminal_cli_event(
            CliStreamEvent::Final {
                ok: true,
                attempted: true,
                configured: true,
                provider_kind: Some("openai_compatible_local".to_string()),
                status: "pass".to_string(),
                input_length: 5,
                duration_ms: 12,
                response_truncated: false,
            },
            true,
        )
        .unwrap();
        match event {
            ChatStreamEvent::Final {
                ok,
                provider_kind,
                response_truncated,
                untrusted_output,
                ..
            } => {
                assert!(ok);
                assert_eq!(provider_kind.as_deref(), Some("openai_compatible_local"));
                assert!(response_truncated);
                assert!(untrusted_output);
            }
            _ => panic!("expected a final event"),
        }
    }

    #[test]
    fn stream_bridge_error_is_static_and_marks_untrusted() {
        let event = stream_bridge_error("timeout", "Timed out.", "fail");
        match event {
            ChatStreamEvent::Error {
                provider_kind,
                untrusted_output,
                error,
                ..
            } => {
                assert_eq!(provider_kind, None);
                assert!(untrusted_output);
                assert_eq!(error.code, "timeout");
            }
            _ => panic!("expected an error event"),
        }
    }

    #[test]
    fn cancellation_and_timeout_errors_are_static_and_redacted() {
        let cancelled = cancelled_error();
        assert_eq!(cancelled.code, "cancelled");
        assert!(!cancelled.message.contains("prompt"));

        let timeout = BridgeError {
            code: "timeout".to_string(),
            message: "Private chat sandbox timed out before returning a result.".to_string(),
        };
        assert!(!timeout.message.contains("private input"));
    }
}
