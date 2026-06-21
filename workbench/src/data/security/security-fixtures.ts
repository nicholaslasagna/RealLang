// Workbench 0.13 — Security Center fixtures.
//
// These describe the ACTUAL current advisories and review state for the
// RealForge Workbench. They are honest: esbuild is resolved (lockfile shows
// 0.28.1, `npm audit` clean), glib remains blocked upstream and is NOT marked
// fixed. Fixtures are untrusted display data (trustedSource is false except for
// the local-tool-derived npm audit result).

import type { SecurityFinding } from "./security-model";

const LAST_CHECKED = "2026-06-21T00:00:00Z";

export const securityFindings: readonly SecurityFinding[] = Object.freeze([
  Object.freeze({
    id: "npm-esbuild-dev-server-file-read",
    source: "npm_audit",
    ecosystem: "npm",
    packageName: "esbuild",
    currentVersion: "0.28.1",
    patchedVersion: "0.28.1",
    severity: "low",
    status: "resolved",
    affectedFiles: ["workbench/package.json", "workbench/package-lock.json"],
    advisoryId: null,
    cveId: null,
    ghsaId: null,
    summary:
      "esbuild dev server could allow arbitrary file read on Windows (affected >=0.27.3 <0.28.1).",
    details:
      "esbuild's development server had a path-traversal / arbitrary file read issue on Windows in the affected range. It was a direct devDependency used only by the local data-artifact build (Vite 8 is Rolldown-based and does not pull esbuild).",
    impact:
      "Limited to running esbuild's own dev server on Windows; this project uses Vite for dev and never runs `esbuild serve`.",
    exposure:
      "Local developer machines only. The shipped desktop app does not run esbuild.",
    fixAvailable: true,
    fixBlockedReason: null,
    recommendedAction:
      "Resolved by bumping the esbuild devDependency to ^0.28.1 (installed 0.28.1). Keep `npm audit` clean on dependency changes.",
    riskNotes: [
      "Re-validate `npm audit` after any dependency or lockfile change.",
      "esbuild remains a build-time tool only; it is never bundled into the app."
    ],
    lastCheckedAt: LAST_CHECKED,
    trustedSource: true,
    needsHumanReview: true,
    platformTags: ["NPM", "WINDOWS"]
  }),
  Object.freeze({
    id: "cargo-glib-soundness",
    source: "dependabot",
    ecosystem: "cargo",
    packageName: "glib",
    currentVersion: "0.18.5",
    patchedVersion: "0.20.0",
    severity: "moderate",
    status: "blocked",
    affectedFiles: ["workbench/src-tauri/Cargo.lock"],
    advisoryId: "RUSTSEC-2024-0429",
    cveId: null,
    ghsaId: null,
    summary:
      "glib <0.20.0 carries a Rust soundness advisory (unsound iterator binding). NOT fixed — blocked upstream.",
    details:
      "glib 0.18.5 is pinned by gtk 0.18.2, which is required by Tauri 2.11's GTK3 Linux webview stack (webkit2gtk 2.0.2 / tao 0.35 / wry 0.55.1 -> tauri-runtime-wry -> tauri). `cargo update -p glib --precise 0.20.0` fails because gtk 0.18.2 requires `glib ^0.18`.",
    impact:
      "A soundness/undefined-behavior issue in a specific glib iterator binding; not a known remote-code-execution vector. The app does not call the affected API directly.",
    exposure:
      "Linux-only. The desktop shell uses WKWebView on macOS and WebView2 on Windows, where the glib/GTK crates are not compiled or linked.",
    fixAvailable: false,
    fixBlockedReason:
      "gtk 0.18.2 (Tauri 2.11 GTK3 stack) requires glib ^0.18; no compatible 0.20 path exists until upstream Tauri/gtk-rs moves.",
    recommendedAction:
      "Track upstream Tauri/gtk-rs and retry the dependency upgrade on each Tauri bump. Do not hand-pin glib. Keep documented in docs/security-dependencies.md.",
    riskNotes: [
      "Do not mark this resolved; it is acknowledged and tracked, not fixed.",
      "Do not force-pin glib or remove Tauri functionality to silence the alert.",
      "Re-run `cargo update -p glib --precise 0.20.0` on each Tauri/gtk-rs upgrade."
    ],
    lastCheckedAt: LAST_CHECKED,
    trustedSource: false,
    needsHumanReview: true,
    platformTags: ["CARGO", "TAURI", "LINUX ONLY"]
  }),
  Object.freeze({
    id: "realforge-approval-bridge-review",
    source: "realforge_audit",
    ecosystem: "tauri",
    packageName: "workbench-approval-bridge",
    currentVersion: "0.16.0",
    patchedVersion: null,
    severity: "info",
    status: "resolved",
    affectedFiles: [
      "workbench/src-tauri/src/bridge/approval.rs",
      "workbench/src-tauri/src/bridge/spawn.rs"
    ],
    advisoryId: null,
    cveId: null,
    ghsaId: null,
    summary:
      "Desktop IPC & approval-bridge review: one fixed dry-run action, no shell, no write/apply path.",
    details:
      "The 0.12 approval bridge exposes exactly one fixed action (realc examples/hello.real --check) with a fixed argv, deny-unknown-fields input, env_clear, workspace containment, traversal/symlink rejection, timeout, and output caps. The read-only report loader uses a fixed allowlist (capabilities/slash/settings-doctor). Web mode never executes commands.",
    impact:
      "No arbitrary command, shell, write, apply, scheduler, commit, or merge path is reachable from the UI or IPC.",
    exposure:
      "Desktop shell only; one approval-gated read-only check. Web mode is execution-free.",
    fixAvailable: false,
    fixBlockedReason: null,
    recommendedAction:
      "Maintain the one-action allowlist and re-audit on every change to the IPC surface or approval flow.",
    riskNotes: [
      "Re-audit whenever the bridge, allowlist, or approval flow changes.",
      "This is a manual review record, not verified tool output."
    ],
    lastCheckedAt: LAST_CHECKED,
    trustedSource: false,
    needsHumanReview: true,
    platformTags: ["TAURI"]
  })
]) as readonly SecurityFinding[];

export const securityLastCheckedAt = LAST_CHECKED;
