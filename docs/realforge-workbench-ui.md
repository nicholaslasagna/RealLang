# RealForge Workbench UI prototype

The repository includes an experimental static RealForge Workbench prototype in
`workbench/`. It translates the approved cockpit design into an offline-safe,
repository-owned interface foundation for future CLI/report JSON integration.

The prototype includes Home, Workbench, Capabilities, Code, Research, Creative,
Image, Vision, Engine, Assets, Benchmarks, **Reports**, Updates, and Settings
screens (14 total) plus a searchable slash-command palette. Staff workflows are
hidden behind a clearly labeled visual preview and remain off by default.

This is not a backend integration. Built-in values are mocked or fixture-backed,
no RealForge command is executed from the browser, and no source, proposal, Git,
provider, network, engine, or asset operation is available. No auto-apply,
auto-commit, or auto-merge path exists.

## Architecture direction

Workbench started as a **static offline-safe prototype** (HTML + CSS + browser
JavaScript). That was appropriate for 0.1–0.3. RealForge Workbench is intended to
become a **flawless cross-platform desktop application** (macOS and Windows): a
Codex/Cursor/Claude-Code-like local AI engineering workbench — not a long-term raw
HTML dashboard or quick web UI.

Long-term stack: **React + TypeScript + Vite** frontend, **Tauri** desktop shell
(0.6 skeleton landed), **local-first** runtime, **strict allowlisted bridge**
(fixed `argv`, no shell strings), with future installer packaging and code
signing/notarization.

## Workbench 0.15 - UI declutter, navigation hierarchy, Security UX polish

- Calmer grouped sidebar: **Core** (Home/Workbench/Capabilities), **Engineering**
  (Code/Research), **Studio** (Creative/Image/Vision/Engine/Assets), **Evaluate**
  (Benchmarks/Security), **System** (Reports/Updates/Settings). The old "Advanced"
  group is removed; Security joins Evaluate, Reports joins System.
- Compact top **safety-status cluster**: one loud primary (green SAFE) plus quiet
  detail pills with tooltips (READONLY/LOCAL ONLY/NETWORK OFF/DOCTOR PASS/STAFF).
  No safety labels removed; pills collapse to icons on narrower desktops.
- Accurate version labeling: **Workbench 0.15 · RealForge backend 2.7** (no more
  stale "Version 2.7").
- Composer/inspector polish: argv preview stays visible but secondary; the
  inspector summarizes first, details second.
- Security Center reads as a calmer cockpit: clear Known findings / Read-only scan
  bridge / Deep review sections; fewer badges per card; esbuild **RESOLVED**, glib
  **BLOCKED UPSTREAM · TRACKED** (never fixed); npm audit network warning kept;
  "Plan fix" stays preview-only; no scan runs without an explicit click.
- **No behavior or safety changes** — no backend execution, auto-fix, write bridge,
  shell, arbitrary args, or weakened staff gating.

See [workbench/docs/ui-navigation.md](../workbench/docs/ui-navigation.md).

## Workbench 0.14 - read-only security scan bridge

- New narrowly allowlisted **security scan bridge**: desktop-only IPC
  `run_security_scan_source` / `list_security_scan_sources`
- Allowed sources (fixed argv, source ID only): `npm-audit-json`
  (`npm audit --json`), `cargo-tree` (`cargo tree`), `cargo-tree-glib`
  (`cargo tree -i glib --target x86_64-unknown-linux-gnu`)
- No shell, no arbitrary args, install/update/fix tokens rejected, `env_clear` +
  minimal passthrough, 60 s timeout, 1 MiB/64 KiB output caps
- Output is untrusted; npm audit JSON maps into live `SecurityFinding`s
  (`trustedSource: false`); cargo tree is dependency evidence, not vulnerability
  truth; the glib advisory stays **blocked** (scanning does not resolve it)
- `npm audit` may query the npm registry (network) and is labeled **MAY REQUIRE
  NETWORK** even though the posture is NETWORK OFF — shown honestly
- Web mode refuses scans (`unsupported_web`); no browser `fetch`
- No remediation, no lockfile/manifest/source mutation; "Plan fix" stays
  preview-only. `cargo audit` / `npm outdated` / `cargo update` are deferred.

See the [scan bridge threat model](../workbench/docs/security-scan-bridge-threat-model.md).

## Workbench 0.13 - Security Center and vulnerability triage

- New **Security** screen: posture hero, findings list, detail inspector, and
  preview-only fix planning
- Typed `SecurityFinding` / `SecurityScanSummary` / `SecurityFixPlan` models with
  local fixtures for the real advisories
- esbuild advisory shown **RESOLVED**; glib advisory shown **BLOCKED UPSTREAM** and
  never marked fixed or hidden
- "Plan fix" / "Review validation" / "Create tracking plan" compose a preview-only
  plan that is untrusted, approval-required, and writes no files
- No automatic fixes, no dependency-file edits from the UI, no tool execution, no
  new write/IPC path, no shell, no browser network
- Read-only scan catalog (`npm audit`, `cargo tree`, `cargo audit`) is display-only
  and marked NOT EXECUTED; deep-review areas are marked FUTURE

See the [Security Center](../workbench/docs/security-center.md) and
[dependency security notes](../workbench/docs/security-dependencies.md).

## Workbench 0.12 - one approved no-write check

- Exactly one executable desktop action: `realc-check-hello-example`
- Fixed command: `realc examples/hello.real --check`
- Explicit acknowledgement required before each run
- Fixed target and argv in Rust; no arbitrary path, command, or arguments
- Canonical workspace containment, minimal environment, timeout, and output caps
- Inert result with exit code, duration, capped stdout/stderr, and UNTRUSTED label
- No write, patch, proposal, scheduler, update, commit, merge, or network path
- Web mode remains execution-free

See the [approval bridge threat model](../workbench/docs/approval-bridge-threat-model.md).

## Workbench 0.11 — safe command composer preview

- Typed high-level action catalog with explicit safety and availability metadata
- Workbench action preview, future requirements, risks, and next safe step
- Slash palette detail view with **Compose preview** instead of direct execution
- Desktop **Load now** only for `capabilities`, `slash`, and `settings-doctor`
- Loaded output still passes through the untrusted report import pipeline
- Write, apply, scheduler, update install, commit, and merge actions remain disabled
- No arbitrary shell text, arbitrary argv, new IPC command, or web execution

See [command composer](../workbench/docs/command-composer.md) and
[desktop shell](../workbench/docs/desktop-shell.md).

## Workbench 0.10 — signed update pipeline readiness

- Typed `UpdateConfiguration` model on `get_update_status` IPC
- Optional env-based readiness: `REALFORGE_UPDATE_ENDPOINT`, `REALFORGE_UPDATER_PUBKEY`, `REALFORGE_UPDATE_CHANNEL`
- Misconfiguration states: `missing_public_key`, `missing_endpoint`
- `ready_to_check` when fully configured — honest “ready for integration”, no fake success
- Release readiness checklist UI (informational)
- Install button disabled until verified signed update
- Saved workspace invalidation: `saved_path_missing` with choose/clear actions
- No `tauri-plugin-updater` until signing infrastructure exists

See [update pipeline](../workbench/docs/update-pipeline.md) and [desktop shell](../workbench/docs/desktop-shell.md).

## Workbench 0.9 — persisted workspace and update center scaffold

- Workspace selection persisted to Tauri app config (`workspace.json`)
- Discovery priority: saved → session → env → walk-up
- Settings → Updates update center with honest `not_configured` state
- No unsigned downloads, no fake updater, no `tauri-plugin-updater` until signing exists
- Bridge remains read-only

See [desktop shell](../workbench/docs/desktop-shell.md).

## Workbench 0.8 — workspace onboarding and bridge health

- Typed workspace resolution: env (`REALFORGE_REPO_ROOT`), walk-up, folder picker (session-only)
- `get_workspace_resolution` and `check_bridge_health` Tauri IPC — metadata + optional allowlisted probe
- Home onboarding card, Settings → Workspace panel, Reports bridge health strip
- Web mode returns preview metadata only — no execution, no network
- Bridge remains **read-only** — no write/apply/scheduler operations

See [desktop shell](../workbench/docs/desktop-shell.md).

## Workbench 0.7 — allowlisted read-only CLI IPC

- Desktop shell can load **3 fixed read-only JSON sources** by source ID only
- `load_readonly_report_source` Tauri IPC — no shell, no user args, 15s timeout, 2MB cap
- Output flows through the same **untrusted** import preview pipeline
- Web mode returns `unsupported_web` — no browser execution
- Windows/macOS `.venv` Python resolution in Rust (`PathBuf`, no shell strings)

See [desktop shell](../workbench/docs/desktop-shell.md).

**Do not keep expanding the monolithic `js/components.js` shell for major
features.** After Workbench 0.4, follow the migration plan for desktop-ready
architecture.

See the migration plan: [React migration plan](../workbench/docs/react-migration-plan.md).

## Workbench 0.4 — manual CLI bridge catalog

Workbench 0.4 adds a **read-only CLI report catalog** on the Reports screen:

- Shared allowlist: `workbench/src/data/import/cli-report-sources.js`
- Dev-only Node bridge: `workbench/tools/realforge-report-bridge.mjs`
- UI copies `node tools/realforge-report-bridge.mjs load <id>` — **never runs it**
- User pastes JSON output into the import box; adapters treat it as untrusted

No localhost backend, no browser command runner, no shell bridge.

## Workbench 0.3 — report import

The **Reports** screen previews RealForge-style JSON (paste or sample fixtures).
Imported JSON is always untrusted; staff gating is enforced by the preview layer;
suggested commands are not executed.

## Workbench 0.2 — data architecture

Workbench 0.2 adds TypeScript declaration contracts, defensive report adapters,
status normalization, source JSON fixtures, and UI view-model composition under
`workbench/src/data/`.

Adapters tolerate missing optional fields, return validation warnings for
malformed values, default provider output to `UNTRUSTED`, and preserve dry-run,
staff-only, approval, local-only, network-off, readonly, and no-write states.

## Integration order

1. Fixture-backed static UI (0.1–0.2)
2. Paste/sample report import with trust hardening (0.3)
3. Manual CLI bridge catalog + Node helper (0.4)
4. **React/TS desktop app migration** (0.5) — **Phase 1 complete**: Vite + React shell, all 14 screens
5. **Tauri shell + packaging** (0.6–0.10) — read-only IPC, workspace persistence, update readiness
6. **Safe command composer preview** (0.11) — typed intent, safety review, no write execution
7. **One approved no-write check** (0.12) - fixed action, explicit approval, untrusted output
8. **Security Center + vulnerability triage** (0.13) - honest findings, preview-only fix plans, no auto-fix
9. **Read-only security scan bridge** (0.14) - allowlisted npm audit / cargo tree; untrusted output, no remediation
10. **UI declutter + navigation hierarchy + Security UX polish** (0.15) - no behavior or safety changes
11. Future: controlled path input; write bridge, signed updater, and any security remediation/fix pipeline require separate reviews and approval gates

Run and validation instructions are in [`workbench/README.md`](../workbench/README.md).
