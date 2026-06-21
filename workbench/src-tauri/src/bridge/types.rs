use serde::Serialize;

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
