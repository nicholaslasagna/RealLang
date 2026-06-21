// Workbench 0.17 — release readiness model.
//
// A typed, HONEST release checklist. It never marks signing, notarization, or the
// updater as ready unless that fact is actually configured/derivable. Items the
// running app cannot verify (build/test/audit) are surfaced as "verify before
// release" rather than faked as done. Nothing here downloads, installs, signs, or
// runs a command — the validation commands are display-only.

export type ReleaseStatus = "pass" | "warn" | "missing" | "deferred";
export type ReleasePlatform = "all" | "macOS" | "Windows";
export type ReleaseTrack = "dev" | "preview" | "stable";

export interface ReleaseChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly status: ReleaseStatus;
  readonly platform: ReleasePlatform;
  readonly requiredFor: ReleaseTrack;
  readonly details: string;
  readonly nextAction: string;
}

export interface ReleaseReadinessInput {
  /** Running Workbench version (e.g. from runtime/update metadata). */
  readonly workbenchVersion: string;
  /** Version the build should report. */
  readonly expectedVersion: string;
  /** Updater minisign public key configured (from update status env detection). */
  readonly updaterPublicKeyConfigured: boolean;
  /** Signed-release endpoint configured. */
  readonly updaterEndpointConfigured: boolean;
}

export interface ReleaseReadinessSummary {
  readonly total: number;
  readonly pass: number;
  readonly warn: number;
  readonly missing: number;
  readonly deferred: number;
  readonly readyForDev: boolean;
  readonly readyForPreview: boolean;
  readonly readyForStable: boolean;
  readonly highestReadyTrack: ReleaseTrack | null;
}

// Display-only validation commands. The UI never runs these; they are the gates a
// human/CI runs before a release.
export const RELEASE_VALIDATION_COMMANDS: readonly string[] = Object.freeze([
  "npm run check",
  "npm test",
  "npm run build",
  "npm run smoke:visual",
  "npm run check:tauri",
  "npm run tauri:build",
  "npm audit"
]);

export function buildReleaseChecklist(input: ReleaseReadinessInput): readonly ReleaseChecklistItem[] {
  const versionAligned = input.workbenchVersion === input.expectedVersion;

  return Object.freeze([
    {
      id: "version_aligned",
      label: "Workbench version aligned",
      status: versionAligned ? "pass" : "warn",
      platform: "all",
      requiredFor: "dev",
      details: versionAligned
        ? `All surfaces report ${input.expectedVersion}.`
        : `Running ${input.workbenchVersion}, expected ${input.expectedVersion}.`,
      nextAction: versionAligned ? "No action needed." : "Re-align version surfaces and bundle metadata."
    },
    {
      id: "tauri_build",
      label: "Tauri build passes",
      status: "warn",
      platform: "all",
      requiredFor: "dev",
      details: "Cannot be verified inside the running app; build it in CI/locally before release.",
      nextAction: "Run `npm run tauri:build` and confirm a versioned bundle is produced."
    },
    {
      id: "npm_audit_clean",
      label: "npm audit clean",
      status: "warn",
      platform: "all",
      requiredFor: "dev",
      details: "Re-run on each dependency change; the running app does not audit live.",
      nextAction: "Run `npm audit` and confirm 0 vulnerabilities."
    },
    {
      id: "security_reviewed",
      label: "Security Center reviewed",
      status: "pass",
      platform: "all",
      requiredFor: "preview",
      details: "Security Center triage and read-only scan evidence are present.",
      nextAction: "Re-review findings before each release."
    },
    {
      id: "glib_documented",
      label: "glib upstream-blocked advisory documented",
      status: "pass",
      platform: "all",
      requiredFor: "preview",
      details: "Tracked in docs/security-dependencies.md as blocked upstream — not fixed.",
      nextAction: "Re-check on each Tauri/gtk-rs bump."
    },
    {
      id: "app_icons",
      label: "App icons finalized",
      status: "warn",
      platform: "all",
      requiredFor: "stable",
      details: "src-tauri/icons currently holds generated placeholders, not final branding.",
      nextAction: "Replace placeholder .icns/.ico/.png with final branding."
    },
    {
      id: "macos_signing",
      label: "macOS signing configured",
      status: "deferred",
      platform: "macOS",
      requiredFor: "stable",
      details: "No Apple Developer ID signing identity configured for the bundle.",
      nextAction: "Configure a Developer ID identity and Tauri macOS signing."
    },
    {
      id: "macos_notarization",
      label: "macOS notarization configured",
      status: "deferred",
      platform: "macOS",
      requiredFor: "stable",
      details: "Notarization/stapling is not set up.",
      nextAction: "Configure notarytool credentials and stapling in the release pipeline."
    },
    {
      id: "windows_signing",
      label: "Windows signing configured",
      status: "deferred",
      platform: "Windows",
      requiredFor: "stable",
      details: "No Authenticode certificate configured for the Windows installer.",
      nextAction: "Configure an Authenticode signing certificate for the MSI/NSIS bundle."
    },
    {
      id: "updater_public_key",
      label: "Updater public key configured",
      status: input.updaterPublicKeyConfigured ? "pass" : "missing",
      platform: "all",
      requiredFor: "preview",
      details: input.updaterPublicKeyConfigured
        ? "A minisign public key is configured for signature verification."
        : "No minisign public key configured; signature verification cannot run.",
      nextAction: input.updaterPublicKeyConfigured
        ? "No action needed."
        : "Set REALFORGE_UPDATER_PUBKEY to the minisign public key (never the private key)."
    },
    {
      id: "updater_endpoint",
      label: "Updater endpoint configured",
      status: input.updaterEndpointConfigured ? "pass" : "missing",
      platform: "all",
      requiredFor: "preview",
      details: input.updaterEndpointConfigured
        ? "A signed-release endpoint is configured."
        : "No signed-release endpoint configured.",
      nextAction: input.updaterEndpointConfigured
        ? "No action needed."
        : "Set REALFORGE_UPDATE_ENDPOINT to the signed update manifest URL."
    },
    {
      id: "release_notes",
      label: "Release notes prepared",
      status: "warn",
      platform: "all",
      requiredFor: "stable",
      details: "Release notes are not attached to a release yet.",
      nextAction: "Prepare release notes for the target version."
    },
    {
      id: "update_manifest",
      label: "Update manifest generated",
      status: "missing",
      platform: "all",
      requiredFor: "stable",
      details: "Requires the signed updater pipeline; no manifest is generated yet.",
      nextAction: "Generate a signed update manifest once signing is live."
    },
    {
      id: "signed_artifact",
      label: "Signed update artifact generated",
      status: "missing",
      platform: "all",
      requiredFor: "stable",
      details: "No signed artifact exists. Unsigned installs remain disabled by design.",
      nextAction: "Produce a signed bundle and detached signature."
    },
    {
      id: "install_verified",
      label: "Install-and-restart verified",
      status: "missing",
      platform: "all",
      requiredFor: "stable",
      details: "The updater plugin is not wired; the install/restart path is disabled.",
      nextAction: "Verify install-and-restart against a verified signed update before enabling it."
    }
  ]);
}

const TRACK_ORDER: readonly ReleaseTrack[] = ["dev", "preview", "stable"];

export function summarizeReleaseReadiness(
  items: readonly ReleaseChecklistItem[]
): ReleaseReadinessSummary {
  const counts = { pass: 0, warn: 0, missing: 0, deferred: 0 };
  for (const item of items) counts[item.status] += 1;

  // A track is ready only when every item required for that track is "pass".
  // "deferred" is intentionally NOT pass — stable readiness still requires it.
  const trackReady = (track: ReleaseTrack): boolean => {
    const requiredTracks = TRACK_ORDER.slice(0, TRACK_ORDER.indexOf(track) + 1);
    return items
      .filter((item) => requiredTracks.includes(item.requiredFor))
      .every((item) => item.status === "pass");
  };

  const readyForDev = trackReady("dev");
  const readyForPreview = trackReady("preview");
  const readyForStable = trackReady("stable");
  const highestReadyTrack: ReleaseTrack | null = readyForStable
    ? "stable"
    : readyForPreview
      ? "preview"
      : readyForDev
        ? "dev"
        : null;

  return {
    total: items.length,
    pass: counts.pass,
    warn: counts.warn,
    missing: counts.missing,
    deferred: counts.deferred,
    readyForDev,
    readyForPreview,
    readyForStable,
    highestReadyTrack
  };
}

export function releaseStatusTone(status: ReleaseStatus): string {
  if (status === "pass") return "green";
  if (status === "warn") return "amber";
  if (status === "deferred") return "cyan";
  return "violet";
}
