//! Fixed-path private local provider config reader (`~/.realforge.local.toml` only).
//!
//! No user-provided paths, shell, network, secrets, model names, or model paths cross IPC.

use super::types::BridgeError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CONFIG_FILE_NAME: &str = ".realforge.local.toml";
const MAX_FILE_BYTES: u64 = 32 * 1024;
const MAX_FIELD_LEN: usize = 256;
const LOCAL_CHAT_KIND: &str = "openai_compatible_local";
const LOCAL_IMAGE_KIND: &str = "local_image_provider";
const LOCAL_TRUST: &str = "local_untrusted";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProviderStatusError {
    pub code: String,
    pub message: String,
}

/// Sanitized status aligned with `realforge provider status --json`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProviderStatusReport {
    pub ok: bool,
    pub configured: bool,
    pub source: String,
    pub provider_kind: Option<String>,
    pub trust: &'static str,
    pub endpoint_configured: bool,
    pub endpoint_host: Option<String>,
    pub model_configured: bool,
    pub api_key_configured: bool,
    pub image_provider_configured: bool,
    pub image_provider_kind: Option<String>,
    pub image_endpoint_host: Option<String>,
    pub image_provider_execution_enabled: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<ProviderStatusError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedProviderBundle {
    pub ok: bool,
    pub chat: ChatProviderStatus,
    pub image: ImageProviderStatus,
    pub trust: &'static str,
    pub config_source: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatProviderStatus {
    pub configured: bool,
    pub provider_kind: Option<&'static str>,
    pub endpoint_scheme: Option<String>,
    pub endpoint_host: Option<String>,
    pub model_configured: bool,
    pub api_key_configured: bool,
    pub display_name_configured: bool,
    pub trust: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProviderStatus {
    pub configured: bool,
    pub provider_kind: Option<&'static str>,
    pub endpoint_scheme: Option<String>,
    pub endpoint_host: Option<String>,
    pub display_name_configured: bool,
    pub trust: &'static str,
    pub execution_enabled: bool,
}

#[derive(Debug, Default, Deserialize)]
struct RootConfig {
    provider: Option<ProviderSection>,
    model: Option<LegacyModelSection>,
    image_provider: Option<ImageProviderSection>,
    providers: Option<LegacyProvidersSection>,
}

#[derive(Debug, Default, Deserialize)]
struct ProviderSection {
    kind: Option<String>,
    display_name: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    trust: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct LegacyModelSection {
    provider: Option<String>,
    display_name: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    trust: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ImageProviderSection {
    kind: Option<String>,
    display_name: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    model_path: Option<String>,
    trust: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct LegacyProvidersSection {
    image: Option<ImageProviderSection>,
}

pub fn private_local_config_path() -> Option<PathBuf> {
    home_dir().map(|home| home.join(CONFIG_FILE_NAME))
}

pub fn load_private_local_provider_config() -> ProviderStatusReport {
    let Some(path) = private_local_config_path() else {
        return structured_error(
            "home_unavailable",
            "Could not resolve the user home directory.".to_string(),
        );
    };

    if !path.is_file() {
        return empty_status(
            true,
            "No private local provider config found in the user home directory.",
        );
    }

    let metadata = match fs::metadata(&path) {
        Ok(meta) => meta,
        Err(err) => {
            return structured_error(
                "metadata_failed",
                format!("Could not read private local config metadata: {err}"),
            );
        }
    };
    if metadata.len() > MAX_FILE_BYTES {
        return structured_error(
            "config_too_large",
            "Private local config file exceeds the allowed size.".to_string(),
        );
    }

    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) => {
            return structured_error(
                "read_failed",
                format!("Could not read private local config: {err}"),
            );
        }
    };

    match parse_redacted_status(&text) {
        Ok(bundle) => report_from_bundle(bundle),
        Err(_) => structured_error(
            "invalid_toml",
            "Private local config TOML is invalid.".to_string(),
        ),
    }
}

fn report_from_bundle(bundle: RedactedProviderBundle) -> ProviderStatusReport {
    let endpoint_configured = bundle.chat.endpoint_scheme.is_some() && bundle.chat.endpoint_host.is_some();
    let endpoint_host = match (&bundle.chat.endpoint_scheme, &bundle.chat.endpoint_host) {
        (Some(scheme), Some(host)) => Some(format!("{scheme}://{host}")),
        _ => None,
    };
    let image_endpoint_host = match (&bundle.image.endpoint_scheme, &bundle.image.endpoint_host) {
        (Some(scheme), Some(host)) => Some(format!("{scheme}://{host}")),
        _ => None,
    };
    let errors = bundle
        .error
        .map(|err| vec![ProviderStatusError {
            code: err.code,
            message: err.message,
        }])
        .unwrap_or_default();
    let source = if bundle.config_source == "defaults" {
        "defaults".to_string()
    } else {
        "home_private".to_string()
    };
    let provider_kind = bundle
        .chat
        .provider_kind
        .map(str::to_string)
        .or_else(|| if source == "defaults" { Some("mock".to_string()) } else { None });
    ProviderStatusReport {
        ok: bundle.ok,
        configured: bundle.chat.configured,
        source,
        provider_kind,
        trust: bundle.trust,
        endpoint_configured,
        endpoint_host,
        model_configured: bundle.chat.model_configured,
        api_key_configured: bundle.chat.api_key_configured,
        image_provider_configured: bundle.image.configured,
        image_provider_kind: bundle.image.provider_kind.map(str::to_string),
        image_endpoint_host,
        image_provider_execution_enabled: false,
        warnings: Vec::new(),
        errors,
    }
}

fn parse_redacted_status(text: &str) -> Result<RedactedProviderBundle, toml::de::Error> {
    let parsed: RootConfig = toml::from_str(text)?;
    let chat = chat_status(parsed.provider, parsed.model);
    let image = image_status(
        parsed
            .image_provider
            .or_else(|| parsed.providers.and_then(|providers| providers.image)),
    );
    Ok(RedactedProviderBundle {
        ok: true,
        chat,
        image,
        trust: LOCAL_TRUST,
        config_source: "home_private",
        message: "Private local provider metadata loaded from the user home directory."
            .to_string(),
        error: None,
    })
}

fn chat_status(
    current: Option<ProviderSection>,
    legacy: Option<LegacyModelSection>,
) -> ChatProviderStatus {
    let (kind, display_name, model, base_url, api_key, _trust) = if let Some(section) = current {
        (
            section.kind,
            section.display_name,
            section.model,
            section.base_url,
            section.api_key,
            section.trust,
        )
    } else if let Some(section) = legacy {
        (
            section.provider,
            section.display_name,
            section.model,
            section.base_url,
            section.api_key,
            section.trust,
        )
    } else {
        return empty_chat_status();
    };

    let recognized = sanitized_field(kind.as_deref()).as_deref() == Some(LOCAL_CHAT_KIND);
    let endpoint = base_url.as_deref().and_then(parse_local_endpoint);
    let model_configured = sanitized_field(model.as_deref())
        .is_some_and(|value| value != "<configured-locally>");
    let api_key_configured = sanitized_field(api_key.as_deref()).is_some();
    ChatProviderStatus {
        configured: recognized && endpoint.is_some() && model_configured,
        provider_kind: recognized.then_some(LOCAL_CHAT_KIND),
        endpoint_scheme: endpoint.as_ref().map(|value| value.scheme.clone()),
        endpoint_host: endpoint.as_ref().map(|value| value.host.clone()),
        model_configured,
        api_key_configured,
        display_name_configured: sanitized_field(display_name.as_deref()).is_some(),
        trust: LOCAL_TRUST,
    }
}

fn image_status(section: Option<ImageProviderSection>) -> ImageProviderStatus {
    let Some(section) = section else {
        return empty_image_status();
    };
    let recognized = sanitized_field(section.kind.as_deref()).as_deref() == Some(LOCAL_IMAGE_KIND);
    let endpoint = section.base_url.as_deref().and_then(parse_local_endpoint);
    let _private_fields = (
        section.api_key.as_deref(),
        section.model.as_deref(),
        section.model_path.as_deref(),
        section.trust.as_deref(),
    );
    ImageProviderStatus {
        configured: recognized && endpoint.is_some(),
        provider_kind: recognized.then_some(LOCAL_IMAGE_KIND),
        endpoint_scheme: endpoint.as_ref().map(|value| value.scheme.clone()),
        endpoint_host: endpoint.as_ref().map(|value| value.host.clone()),
        display_name_configured: sanitized_field(section.display_name.as_deref()).is_some(),
        trust: LOCAL_TRUST,
        execution_enabled: false,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedEndpoint {
    scheme: String,
    host: String,
}

fn parse_local_endpoint(raw: &str) -> Option<ParsedEndpoint> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_FIELD_LEN || trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    let (raw_scheme, remainder) = trimmed.split_once("://")?;
    let scheme = raw_scheme.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let authority = remainder.split('/').next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.contains('?') || authority.contains('#') {
        return None;
    }
    let (host, port) = split_host_port(authority)?;
    if !matches!(host.to_ascii_lowercase().as_str(), "localhost" | "127.0.0.1" | "::1") {
        return None;
    }
    let normalized_host = if host.contains(':') {
        format!("[{}]", host.to_ascii_lowercase())
    } else {
        host.to_ascii_lowercase()
    };
    Some(ParsedEndpoint {
        scheme,
        host: port.map_or(normalized_host.clone(), |port| format!("{normalized_host}:{port}")),
    })
}

fn split_host_port(authority: &str) -> Option<(&str, Option<u16>)> {
    if let Some(rest) = authority.strip_prefix('[') {
        let (host, suffix) = rest.split_once(']')?;
        if suffix.is_empty() {
            return Some((host, None));
        }
        let port = suffix.strip_prefix(':')?.parse::<u16>().ok()?;
        return (port > 0).then_some((host, Some(port)));
    }
    if authority.matches(':').count() > 1 {
        return None;
    }
    match authority.split_once(':') {
        Some((host, raw_port)) => {
            let port = raw_port.parse::<u16>().ok()?;
            (port > 0).then_some((host, Some(port)))
        }
        None => Some((authority, None)),
    }
}

fn sanitized_field(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_FIELD_LEN || trimmed.contains(['\n', '\r']) {
        return None;
    }
    Some(trimmed.to_string())
}

fn empty_chat_status() -> ChatProviderStatus {
    ChatProviderStatus {
        configured: false,
        provider_kind: None,
        endpoint_scheme: None,
        endpoint_host: None,
        model_configured: false,
        api_key_configured: false,
        display_name_configured: false,
        trust: LOCAL_TRUST,
    }
}

fn empty_image_status() -> ImageProviderStatus {
    ImageProviderStatus {
        configured: false,
        provider_kind: None,
        endpoint_scheme: None,
        endpoint_host: None,
        display_name_configured: false,
        trust: LOCAL_TRUST,
        execution_enabled: false,
    }
}

fn empty_status(ok: bool, message: &str) -> ProviderStatusReport {
    report_from_bundle(RedactedProviderBundle {
        ok,
        chat: empty_chat_status(),
        image: empty_image_status(),
        trust: LOCAL_TRUST,
        config_source: "defaults",
        message: message.to_string(),
        error: None,
    })
}

fn structured_error(code: &str, message: String) -> ProviderStatusReport {
    report_from_bundle(RedactedProviderBundle {
        ok: false,
        chat: empty_chat_status(),
        image: empty_image_status(),
        trust: LOCAL_TRUST,
        config_source: "home_private",
        message: message.clone(),
        error: Some(BridgeError {
            code: code.into(),
            message,
        }),
    })
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("USERPROFILE").ok().filter(|value| !value.trim().is_empty()))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_redacted_multimodal_status() {
        let result = report_from_bundle(parse_redacted_status(
            r#"
[provider]
kind = "openai_compatible_local"
display_name = "Private Local Model"
model = "runtime-only-name"
base_url = "http://localhost:8000/v1"
api_key = "runtime-only-secret"

[image_provider]
kind = "local_image_provider"
display_name = "Private Local Image Model"
base_url = "http://localhost:8188"
api_key = "image-runtime-secret"
model = "image-runtime-name"
model_path = "/private/runtime/path"
"#,
        )
        .unwrap());
        assert!(result.configured);
        assert!(result.image_provider_configured);
        assert!(!result.image_provider_execution_enabled);
        assert!(result.api_key_configured);
        let json = serde_json::to_string(&result).unwrap();
        for private_value in [
            "runtime-only-name",
            "runtime-only-secret",
            "image-runtime-secret",
            "image-runtime-name",
            "/private/runtime/path",
            "model_path",
            "\"api_key\"",
        ] {
            assert!(!json.contains(private_value), "leaked {private_value}");
        }
    }

    #[test]
    fn api_key_is_never_returned() {
        let result = report_from_bundle(
            parse_redacted_status(
            r#"
[provider]
kind = "openai_compatible_local"
model = "configured"
base_url = "http://127.0.0.1:9000/v1"
api_key = "not-for-ipc"
"#,
        )
        .unwrap(),
        );
        let json = serde_json::to_string(&result).unwrap();
        assert!(result.api_key_configured);
        assert!(!json.contains("not-for-ipc"));
        assert!(!json.contains(r#""api_key""#));
        assert!(json.contains("api_key_configured"));
    }

    #[test]
    fn rejects_non_local_image_endpoint() {
        let result = report_from_bundle(parse_redacted_status(
            r#"
[image_provider]
kind = "local_image_provider"
base_url = "https://example.com"
"#,
        )
        .unwrap());
        assert!(!result.image_provider_configured);
        assert!(result.endpoint_host.is_none());
    }

    #[test]
    fn accepts_legacy_chat_schema_without_exposing_identity() {
        let result = report_from_bundle(parse_redacted_status(
            r#"
[model]
provider = "openai_compatible_local"
model = "legacy-runtime-name"
base_url = "http://localhost:8000/v1"
"#,
        )
        .unwrap());
        assert!(result.configured);
        assert!(!serde_json::to_string(&result).unwrap().contains("legacy-runtime-name"));
    }

    #[test]
    fn local_endpoint_parser_rejects_credentials_and_invalid_ports() {
        assert!(parse_local_endpoint("http://localhost:8000/v1").is_some());
        assert!(parse_local_endpoint("http://[::1]:8188").is_some());
        assert!(parse_local_endpoint("http://secret@localhost:8000").is_none());
        assert!(parse_local_endpoint("http://localhost:99999").is_none());
    }
}
