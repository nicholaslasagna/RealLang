# Workbench Security Center (0.13 / 0.14)

The Security Center is a first-class, honest, read-only view of vulnerabilities,
dependency risk, audit findings, and **preview-only** AI-assisted fix planning.

It is a triage and planning surface — not an autonomous scanner and not a
remediation engine. **0.13** made no changes of any kind. **0.14** adds a
narrowly allowlisted **read-only security scan bridge** that runs a few fixed
audit/tree commands in desktop mode and adapts their (untrusted) output into
evidence and live findings. It still performs **no remediation** and modifies
nothing.

## 0.14 read-only scan bridge

- Desktop only. Web mode returns `unsupported_web` and shows the command for
  manual terminal use. No browser `fetch`, no shell.
- Fixed allowlist, source ID only — never argv, never arbitrary commands:
  - `npm-audit-json` → `npm audit --json` (cwd `workbench/`). **May query the npm
    registry**, so it is marked **MAY REQUIRE NETWORK** even though the product
    posture is NETWORK OFF. Mapped into untrusted live `SecurityFinding`s
    (`trustedSource: false`, `needsHumanReview: true`). A clean audit shows
    "npm audit clean".
  - `cargo-tree` → `cargo tree` (cwd `workbench/src-tauri/`). Dependency-path
    **evidence**, not a vulnerability scan.
  - `cargo-tree-glib` → `cargo tree -i glib --target x86_64-unknown-linux-gnu`.
    Traces the glib path to support the **blocked** glib finding — it does **not**
    resolve the advisory.
- Output is captured with a 60 s timeout and 1 MiB/64 KiB caps, marked
  `UNTRUSTED · READ-ONLY SCAN · NO WRITES · NO REMEDIATION`.
- `cargo audit`, `npm outdated`, `cargo update`, and anything that mutates a
  lockfile/manifest are **deferred**. See the
  [scan bridge threat model](security-scan-bridge-threat-model.md).
- Live findings still support **preview-only** "Plan fix" — no auto-fix, no
  dependency edit, no `npm audit fix` / `cargo update` execution.

## What it shows

- **Security posture hero** — total / open / resolved / blocked counts, severity
  spread, and an honest overall status (`pass` / `warn` / `blocked`). A
  blocked-upstream advisory with nothing open is surfaced as **blocked**, never
  as `pass`.
- **Findings list + detail inspector** — package, ecosystem, severity, status,
  affected files, current → patched version, impact, exposure, why it is
  blocked/resolved, recommended action, and validation commands.
- **Fix Plan preview** — a `SecurityFixPlan` composed locally from the finding
  (proposed steps, files likely touched, validation commands, risks, rollback
  plan). It is always **untrusted**, **approval-required**, and **writes no
  files**.
- **Read-only scan catalog (preview only)** — `npm audit --json`, `cargo tree`,
  `cargo audit` shown as display-only cards marked **NOT EXECUTED**. Nothing runs.
- **Deep Security Review** — a structured surface describing future capabilities
  (dependency audit, unsafe-path tracing, command/IPC audit, path-traversal
  review, supply-chain review, Tauri permission review, update-pipeline review,
  approval-bridge review, threat-model generation), all marked **FUTURE**.

## Current findings (real advisories)

| Package | Ecosystem | Severity | Status | Notes |
|---------|-----------|----------|--------|-------|
| esbuild | npm | low | **RESOLVED** | Dev-server file read on Windows (<0.28.1). Fixed by bumping the devDependency to `^0.28.1`; `npm audit` clean. |
| glib | cargo | moderate | **BLOCKED UPSTREAM** | RUSTSEC-2024-0429 soundness advisory (<0.20). Pinned by Tauri 2.11's GTK3 stack (gtk-rs 0.18). Linux-only exposure. **Not fixed.** |
| workbench-approval-bridge | tauri | info | **RESOLVED** | Manual review record: one fixed dry-run action, no shell, no write/apply path. |

The glib advisory is **not** marked fixed and is **not** hidden — it stays visible
and tracked. See [security-dependencies.md](security-dependencies.md).

## Hard safety boundaries (0.13)

- **No automatic fixes.** The "Plan fix" / "Review validation" / "Create tracking
  plan" buttons compose a preview only. There is no apply, update-now, or
  auto-fix control anywhere.
- **No dependency modification from the UI.** RealForge never edits
  `package.json`, `package-lock.json`, `Cargo.toml`, or `Cargo.lock` from here.
- **No tool execution.** Scan-catalog commands are display-only and marked NOT
  EXECUTED. No new IPC command, no shell plugin, no arbitrary command from user
  input.
- **No network.** The Security Center is local fixtures plus typed adapters; it
  introduces no `fetch`, socket, or backend call.
- **Untrusted by default.** Findings and fix plans are untrusted and flagged for
  human review (`trustedSource` is false unless derived from verified local tool
  output; `needsHumanReview` is true).

## Data model

`SecurityFinding`, `SecurityScanSummary`, and `SecurityFixPlan` live in
`src/data/security/security-model.ts`; the real advisories are in
`src/data/security/security-fixtures.ts`. `buildFixPlan()` is a deterministic,
local template (`generatedByAi` is `false` — no model is wired in 0.13).

## Roadmap

A future security scanner / fix pipeline will run only **read-only, allowlisted,
threat-modeled** commands behind explicit **approval gates** — the same posture
as the existing read-only CLI bridge and the one approved dry-run action. No
autonomous remediation, no auto-apply, no auto-merge.
