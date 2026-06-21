//! Fixed allowlist of read-only RealForge CLI report sources (Workbench 0.7).
//! Source IDs and argv arrays are the only execution inputs — never user strings.

use super::types::ReadOnlyReportSourceMeta;

#[derive(Debug, Clone, Copy)]
pub struct AllowlistedSource {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub display_command: &'static str,
    pub detect_type: &'static str,
    pub argv: &'static [&'static str],
}

pub const DENIED_SUBCOMMANDS: &[&str] = &[
    "repair",
    "generate",
    "improve",
    "propose-patch",
    "experiment",
    "propose-merge",
    "apply-proposal",
    "cycle",
    "research",
    "scheduler-run",
    "improve-channel",
    "update-bundle",
    "update-check",
    "index",
];

pub const ALLOWLISTED_SOURCES: &[AllowlistedSource] = &[
    AllowlistedSource {
        id: "capabilities",
        label: "Capability registry",
        description: "Capability domains, safety levels, and suggested next commands.",
        display_command: "realforge capabilities --json",
        detect_type: "capability_registry",
        argv: &["capabilities", "--json"],
    },
    AllowlistedSource {
        id: "slash",
        label: "Slash command registry",
        description: "Read-only slash-command grammar exposed by the CLI.",
        display_command: "realforge slash --json",
        detect_type: "slash_command_registry",
        argv: &["slash", "--json"],
    },
    AllowlistedSource {
        id: "settings-doctor",
        label: "Settings doctor (safety posture)",
        description: "Read-only safety/configuration validation summary.",
        display_command: "realforge settings doctor --json",
        detect_type: "doctor_status",
        argv: &["settings", "doctor", "--json"],
    },
];

pub fn source_meta(source: &AllowlistedSource) -> ReadOnlyReportSourceMeta {
    ReadOnlyReportSourceMeta {
        id: source.id,
        label: source.label,
        description: source.description,
        display_command: source.display_command,
        detect_type: source.detect_type,
        read_only: true,
    }
}

pub fn get_allowlisted_source(source_id: &str) -> Option<&'static AllowlistedSource> {
    ALLOWLISTED_SOURCES.iter().find(|entry| entry.id == source_id)
}

pub fn is_readonly_source_valid(source: &AllowlistedSource) -> bool {
    !source.argv.is_empty()
        && source
            .argv
            .iter()
            .all(|token| !token.is_empty())
        && !DENIED_SUBCOMMANDS.contains(&source.argv[0])
}

pub fn list_source_metadata() -> Vec<ReadOnlyReportSourceMeta> {
    ALLOWLISTED_SOURCES
        .iter()
        .map(|source| source_meta(source))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_has_exactly_three_sources() {
        let ids: Vec<_> = ALLOWLISTED_SOURCES.iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["capabilities", "slash", "settings-doctor"]);
    }

    #[test]
    fn unknown_source_not_in_allowlist() {
        assert!(get_allowlisted_source("not-real").is_none());
    }

    #[test]
    fn argv_is_fixed_and_read_only() {
        for source in ALLOWLISTED_SOURCES {
            assert!(is_readonly_source_valid(source));
            assert!(!source.argv.iter().any(|t| t.contains(' ')));
            for denied in DENIED_SUBCOMMANDS {
                assert_ne!(source.argv[0], *denied);
            }
        }
    }
}
