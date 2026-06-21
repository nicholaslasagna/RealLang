use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadOnlyReportSourceMeta {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub display_command: &'static str,
    pub detect_type: &'static str,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedReadOnlyReport {
    pub source: ReadOnlyReportSourceMeta,
    pub stdout_json: String,
    pub untrusted: bool,
    pub safety_labels: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReadOnlyReportResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<LoadedReadOnlyReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePaths {
    pub app_data_dir: Option<String>,
    pub app_config_dir: Option<String>,
    pub resource_dir: Option<String>,
    pub config_file: Option<String>,
}

impl LoadReadOnlyReportResult {
    pub fn success(data: LoadedReadOnlyReport) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn failure(code: &str, message: impl Into<String>) -> Self {
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
pub struct SecurityScanSourceMeta {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub display_command: &'static str,
    pub ecosystem: &'static str,
    pub output_format: &'static str,
    pub requires_network: bool,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanExecution {
    pub source: SecurityScanSourceMeta,
    pub command_summary: &'static str,
    pub cwd: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub output_format: &'static str,
    pub stdout_truncated: bool,
    pub duration_ms: u128,
    pub writes_files: bool,
    pub network_used: bool,
    pub untrusted: bool,
    pub safety_labels: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<SecurityScanExecution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl SecurityScanResult {
    pub fn success(data: SecurityScanExecution) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn failure(code: &str, message: impl Into<String>) -> Self {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovedDryRunInput {
    pub approval_acknowledged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedDryRunExecution {
    pub action_id: &'static str,
    pub title: &'static str,
    pub command_summary: &'static str,
    pub workspace_path: String,
    pub exit_code: i32,
    pub passed: bool,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
    pub writes_files: bool,
    pub network_required: bool,
    pub untrusted: bool,
    pub safety_labels: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedDryRunResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ApprovedDryRunExecution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl ApprovedDryRunResult {
    pub fn success(data: ApprovedDryRunExecution) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn failure(code: &str, message: impl Into<String>) -> Self {
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
