//! Desktop update center — signed-updater readiness scaffold (no network until configured).

use serde::Serialize;

const WORKBENCH_VERSION: &str = "0.10";

const ENV_ENDPOINT: &str = "REALFORGE_UPDATE_ENDPOINT";
const ENV_PUBKEY: &str = "REALFORGE_UPDATER_PUBKEY";
const ENV_CHANNEL: &str = "REALFORGE_UPDATE_CHANNEL";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    Stable,
    Preview,
    LocalDev,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConfiguration {
    pub configured: bool,
    pub channel: UpdateChannel,
    pub endpoint_configured: bool,
    pub endpoint_url: Option<String>,
    pub public_key_configured: bool,
    pub signing_required: bool,
    pub install_allowed: bool,
    pub disabled_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseChecklistItem {
    pub id: String,
    pub label: String,
    pub status: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub state: &'static str,
    pub configured: bool,
    pub current_version: String,
    pub platform: String,
    pub arch: String,
    pub channel: UpdateChannel,
    pub configuration: UpdateConfiguration,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub message: String,
    pub safety_notes: Vec<String>,
    pub release_checklist: Vec<ReleaseChecklistItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub ok: bool,
    pub state: &'static str,
    pub configured: bool,
    pub message: String,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
}

pub fn release_checklist() -> Vec<ReleaseChecklistItem> {
    vec![
        ReleaseChecklistItem {
            id: "version_bump".into(),
            label: "App version bumped".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "tauri_build".into(),
            label: "Tauri build passes".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "signed_bundle".into(),
            label: "Signed bundle generated".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "update_manifest".into(),
            label: "Update manifest generated".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "signature_verified".into(),
            label: "Signature verified".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "release_notes".into(),
            label: "Release notes attached".into(),
            status: "pending",
        },
        ReleaseChecklistItem {
            id: "macos_notarization".into(),
            label: "macOS notarization (future)".into(),
            status: "future",
        },
        ReleaseChecklistItem {
            id: "windows_signing".into(),
            label: "Windows signing (future)".into(),
            status: "future",
        },
    ]
}

fn parse_channel(raw: Option<&str>) -> UpdateChannel {
    match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("preview") => UpdateChannel::Preview,
        Some("local_dev") | Some("local-dev") | Some("localdev") => UpdateChannel::LocalDev,
        _ => UpdateChannel::Stable,
    }
}

fn read_env_config() -> (Option<String>, Option<String>, UpdateChannel) {
    let endpoint = std::env::var(ENV_ENDPOINT)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let pubkey = std::env::var(ENV_PUBKEY)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let channel = parse_channel(std::env::var(ENV_CHANNEL).ok().as_deref());
    (endpoint, pubkey, channel)
}

fn resolve_configuration() -> (UpdateConfiguration, &'static str, String) {
    let (endpoint, pubkey, channel) = read_env_config();
    let endpoint_configured = endpoint.is_some();
    let public_key_configured = pubkey.is_some();

    if !endpoint_configured && !public_key_configured {
        let configuration = UpdateConfiguration {
            configured: false,
            channel,
            endpoint_configured: false,
            endpoint_url: None,
            public_key_configured: false,
            signing_required: true,
            install_allowed: false,
            disabled_reason: Some(
                "Signed update endpoint and public key are not configured for this build.".into(),
            ),
        };
        return (
            configuration,
            "not_configured",
            "Signed update endpoint and public key are not configured for this build.".into(),
        );
    }

    if endpoint_configured && !public_key_configured {
        let configuration = UpdateConfiguration {
            configured: false,
            channel,
            endpoint_configured: true,
            endpoint_url: endpoint,
            public_key_configured: false,
            signing_required: true,
            install_allowed: false,
            disabled_reason: Some(format!(
                "Update endpoint is set via {ENV_ENDPOINT} but no public key is configured ({ENV_PUBKEY})."
            )),
        };
        return (
            configuration,
            "missing_public_key",
            format!(
                "Update endpoint is configured but the minisign public key is missing. Set {ENV_PUBKEY} before checking for updates."
            ),
        );
    }

    if !endpoint_configured && public_key_configured {
        let configuration = UpdateConfiguration {
            configured: false,
            channel,
            endpoint_configured: false,
            endpoint_url: None,
            public_key_configured: true,
            signing_required: true,
            install_allowed: false,
            disabled_reason: Some(format!(
                "Public key is set via {ENV_PUBKEY} but no update endpoint is configured ({ENV_ENDPOINT})."
            )),
        };
        return (
            configuration,
            "missing_endpoint",
            format!(
                "Updater public key is configured but the release endpoint is missing. Set {ENV_ENDPOINT} before checking for updates."
            ),
        );
    }

    let configuration = UpdateConfiguration {
        configured: true,
        channel,
        endpoint_configured: true,
        endpoint_url: endpoint,
        public_key_configured: true,
        signing_required: true,
        install_allowed: false,
        disabled_reason: None,
    };
    (
        configuration,
        "ready_to_check",
        "Signed updater configuration detected. Update checking is ready for integration — this build does not download or install updates yet.".into(),
    )
}

pub fn get_update_status() -> UpdateStatus {
    let (configuration, state, message) = resolve_configuration();
    let configured = configuration.configured;

    UpdateStatus {
        state,
        configured,
        current_version: WORKBENCH_VERSION.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        channel: configuration.channel,
        configuration,
        latest_version: None,
        release_notes: None,
        message,
        safety_notes: vec![
            "Only signed update packages may be installed.".to_string(),
            "Unsigned builds are never downloaded or installed automatically.".to_string(),
            "Install and restart remain disabled until a verified signed update is available.".to_string(),
            "No drag-and-drop reinstall is required once signed updates are enabled.".to_string(),
        ],
        release_checklist: release_checklist(),
    }
}

pub fn check_for_update() -> UpdateCheckResult {
    let (configuration, state, message) = resolve_configuration();

    if !configuration.configured {
        return UpdateCheckResult {
            ok: false,
            state,
            configured: false,
            message,
            latest_version: None,
            release_notes: None,
        };
    }

    UpdateCheckResult {
        ok: false,
        state: "ready_to_check",
        configured: true,
        message: "Signed updater configuration is present. Network check and install are not wired in this build — integrate tauri-plugin-updater after release signing is live.".to_string(),
        latest_version: None,
        release_notes: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvRestore {
        endpoint: Option<Result<String, std::env::VarError>>,
        pubkey: Option<Result<String, std::env::VarError>>,
        channel: Option<Result<String, std::env::VarError>>,
    }

    impl EnvRestore {
        fn capture() -> Self {
            Self {
                endpoint: Some(std::env::var(ENV_ENDPOINT)),
                pubkey: Some(std::env::var(ENV_PUBKEY)),
                channel: Some(std::env::var(ENV_CHANNEL)),
            }
        }
    }

    impl Drop for EnvRestore {
        fn drop(&mut self) {
            restore_env(ENV_ENDPOINT, &self.endpoint);
            restore_env(ENV_PUBKEY, &self.pubkey);
            restore_env(ENV_CHANNEL, &self.channel);
        }
    }

    fn restore_env(key: &str, previous: &Option<Result<String, std::env::VarError>>) {
        match previous {
            Some(Ok(value)) => unsafe { std::env::set_var(key, value) },
            _ => unsafe { std::env::remove_var(key) },
        }
    }

    fn env_test_lock() -> (MutexGuard<'static, ()>, EnvRestore) {
        (ENV_LOCK.lock().unwrap(), EnvRestore::capture())
    }

    #[test]
    fn updater_reports_not_configured_without_network() {
        let (_lock, _restore) = env_test_lock();
        unsafe {
            std::env::remove_var(ENV_ENDPOINT);
            std::env::remove_var(ENV_PUBKEY);
            std::env::remove_var(ENV_CHANNEL);
        }
        let status = get_update_status();
        assert!(!status.configured);
        assert_eq!(status.state, "not_configured");
        assert!(!status.configuration.install_allowed);
        assert!(status.configuration.signing_required);
        let check = check_for_update();
        assert!(!check.ok);
        assert_eq!(check.state, "not_configured");
    }

    #[test]
    fn missing_public_key_when_only_endpoint_set() {
        let (_lock, _restore) = env_test_lock();
        unsafe {
            std::env::set_var(ENV_ENDPOINT, "https://releases.example.com/workbench/latest.json");
            std::env::remove_var(ENV_PUBKEY);
        }
        let status = get_update_status();
        assert!(!status.configured);
        assert_eq!(status.state, "missing_public_key");
        assert!(status.configuration.endpoint_configured);
        assert!(!status.configuration.public_key_configured);
    }

    #[test]
    fn missing_endpoint_when_only_pubkey_set() {
        let (_lock, _restore) = env_test_lock();
        unsafe {
            std::env::remove_var(ENV_ENDPOINT);
            std::env::set_var(ENV_PUBKEY, "dW50cnVzdGVkLWV4YW1wbGUta2V5");
        }
        let status = get_update_status();
        assert!(!status.configured);
        assert_eq!(status.state, "missing_endpoint");
        assert!(!status.configuration.endpoint_configured);
        assert!(status.configuration.public_key_configured);
    }

    #[test]
    fn ready_to_check_when_endpoint_and_pubkey_present() {
        let (_lock, _restore) = env_test_lock();
        unsafe {
            std::env::set_var(ENV_ENDPOINT, "https://releases.example.com/workbench/latest.json");
            std::env::set_var(ENV_PUBKEY, "dW50cnVzdGVkLWV4YW1wbGUta2V5");
            std::env::set_var(ENV_CHANNEL, "preview");
        }
        let status = get_update_status();
        assert!(status.configured);
        assert_eq!(status.state, "ready_to_check");
        assert_eq!(status.channel, UpdateChannel::Preview);
        assert!(!status.configuration.install_allowed);
        let check = check_for_update();
        assert!(!check.ok);
        assert_eq!(check.state, "ready_to_check");
        assert!(check.message.contains("not wired"));
    }

    #[test]
    fn release_checklist_includes_future_platform_steps() {
        let checklist = release_checklist();
        assert!(checklist.iter().any(|item| item.id == "macos_notarization"));
        assert!(checklist.iter().any(|item| item.id == "windows_signing"));
    }
}
