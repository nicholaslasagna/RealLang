# RealForge Workbench UI

This directory contains the RealForge Workbench — a local-first AI engineering
interface prototype evolving toward a cross-platform desktop app (macOS +
Windows). **0.5 Phase 1** migrated the UI to **React + TypeScript + Vite**;
**0.6** added a Tauri desktop shell; **0.7** adds allowlisted read-only CLI IPC
in desktop mode; **0.8** adds workspace onboarding, resolution, and bridge health;
**0.9** adds persisted workspace selection and a signed-update center scaffold
(web workflow unchanged, output still untrusted). **0.10** adds signed-update
pipeline readiness (env-based config detection), release checklist UI, and saved
workspace invalidation polish.
**0.11** adds a typed safe command composer: structured action previews, slash
command safety details, and runtime-aware loading for the same three existing
read-only source IDs. It adds no write-capable IPC.
**0.12** adds exactly one approval-gated desktop validation action:
`realc examples/hello.real --check`. Its action ID, target, and argv are fixed in
Rust; it writes no files, requires no network, and returns untrusted inert output.
**0.13** adds a **Security Center** — vulnerability triage, typed security finding
models, real-advisory fixtures, and **preview-only** fix planning. It makes no
changes: no auto-fix, no dependency edits from the UI, no tool execution, no new
write/IPC path. esbuild is shown resolved; glib remains **blocked upstream** and
is never marked fixed. See [docs/security-center.md](docs/security-center.md).
**0.14** adds a narrowly allowlisted **read-only security scan bridge**: desktop-only
`npm audit --json` / `cargo tree` / `cargo tree -i glib` with fixed argv, no shell,
no arbitrary args, timeout/output caps, and untrusted output mapped into live
findings/evidence. No remediation, no lockfile/manifest mutation; `npm audit` may use
the network and is labeled accordingly. See
[docs/security-scan-bridge-threat-model.md](docs/security-scan-bridge-threat-model.md).
**0.15** is a **UI declutter** pass: calmer grouped navigation (Core / Engineering /
Studio / Evaluate / System), a compact top safety-status cluster (tooltips, one clear
primary), composer/inspector polish, a calmer Security Center, and accurate version
labels (Workbench 0.15 · RealForge backend 2.7). No behavior or safety changes. See
[docs/ui-navigation.md](docs/ui-navigation.md).
**0.16** aligns every version surface to **Workbench 0.16.0** (package.json,
Cargo.toml, tauri.conf.json, Rust/frontend constants, sidebar, Update Center, bundle
metadata) while keeping **RealForge backend 2.7** separate; adds a **Settings → General
→ About** surface (versions, runtime, bridge mode, update/workspace status, security
posture, inert Copy diagnostics), applies a consistent what/why/next pattern to
onboarding states, and adds a **1280px** visual-smoke checkpoint. No behavior/safety
changes.

**0.17** is a **release-readiness / threat-model** milestone. It adds a
[signed-updater threat model](docs/signed-updater-threat-model.md) and a typed,
honest **release readiness checklist** in the Update Center (Settings → Updates):
15 items with `pass`/`warn`/`missing`/`deferred` status, platform, required track,
and next action; display-only validation commands; and explicit "no unsigned
updates" / "private keys never stored" statements. It does **not** wire a real
updater, download or install anything, add endpoints/keys, or change any safety
boundary. Signing, notarization, and updater config stay honestly `missing`/
`deferred`; the bundle stays `0.16.0` until an actual signed release. See
[docs/update-pipeline.md](docs/update-pipeline.md).

**0.18** extends the approved dry-run model with a **controlled workspace-relative
`.real` file check**. A read-only `list_real_files` IPC (hidden/vendor/build dirs
excluded, symlinks skipped, count/depth capped) feeds a **dropdown**; a second
approval-gated action runs `realc <relative-path> --check`. The path is strictly
validated in Rust (`.real` only, workspace-relative, no traversal, canonicalized +
contained, no symlink escape, no control chars, length-capped). It is still
dry-run/check-only — **no** write bridge, arbitrary argv, raw path textbox, shell,
or network — and the fixed `hello.real` check still works. See
[docs/approval-bridge-threat-model.md](docs/approval-bridge-threat-model.md).

**0.19** adds a **session-only approval audit log** for those two approved checks.
Each completed, explicitly approved run records sanitized action/target metadata,
status, exit code, duration, capped stdout/stderr previews, and fixed no-write,
no-network, and untrusted-output labels. Recent runs appear in Workbench; the full
session list appears in Reports with output collapsed by default and a metadata-only
safe-copy action. Nothing is written to the workspace, `.realforge`, app config, or
the repository. No IPC command or execution authority is added. Persistent audit
storage remains deferred pending an app-config-only design and separate threat model.
The signed bundle version remains `0.16.0` under the 0.17 release policy.

**Private local model support (provider-agnostic):** Settings → Provider shows a
generic **Private Local Model** OpenAI-compatible profile. Copy
`.realforge.toml.example` to gitignored `~/.realforge.local.toml` for local use. The
public repo never stores model identity, weights, API keys, or private prompts.
Desktop IPC reads sanitized home-config metadata only (no secrets). Workbench UI
session fields remain supplementary — no browser endpoint probes. Output
remains **LOCAL UNTRUSTED**. See [docs/private-local-provider.md](docs/private-local-provider.md).

**0.20** adds threat-modeled, desktop-only persistence for sanitized approval
history. The fixed `approval-audit-log.json` file lives under Tauri app config,
keeps at most 50 entries, and is limited to 128 KiB. Rust accepts no storage path,
reconstructs canonical action/target metadata, and drops invalid entries. Output
preview bodies, absolute workspace paths, environment data, and secrets are never
persisted. Reports shows local/session status and provides a confirmed **Clear
history** action. Web preview remains session-only. This adds no command, shell,
network, patch, update-install, Git, or workspace-write authority. See the
[persistence threat model](docs/approval-audit-persistence-threat-model.md).

**0.25** adds an approval-gated **Provider Smoke Test** card under Settings →
Provider / Local Model. Desktop mode can run only the fixed
`realforge provider smoke --json` command; Rust owns the executable and arguments,
uses a short timeout and stream caps, parses and re-sanitizes JSON, and returns no
API key, exact model identity, model path, private request, or full response. The UI
has no prompt field and keeps the capped **UNTRUSTED** preview in component memory
only. Web mode cannot run smoke. This does not add chat, image execution, a general
command bridge, workspace writes, or audit persistence. See the
[provider smoke threat model](docs/provider-smoke-threat-model.md).

**0.26** adds an approval-gated **Private Chat Sandbox** under Settings →
Provider / Local Model. It is one bounded user-only request, delivered through stdin
to a fixed CLI command. No workspace context, files, tools, history, memory, image
request, or automatic follow-up is included. Prompt and capped **LOCAL UNTRUSTED**
response stay in component memory only and can be cleared explicitly. Web mode
cannot run it. This is not an agent, general command bridge, or persistence feature.
See the [private chat sandbox threat model](docs/private-chat-sandbox-threat-model.md).

**0.27** hardens that sandbox without expanding its authority. The UI and Rust
bridge allow one request at a time; desktop cancellation signals only the active
fixed child process, and cancel/timeout paths kill and reap it before returning a
static redacted result. Approval resets after every attempt. Clear-response and
clear-sandbox remain session-only, and explicit copy includes only the capped
visible response prefixed **LOCAL UNTRUSTED**. There is still no workspace context,
tool use, transcript, persistence, audit entry, shell, write path, or image request.

**0.28** adds a frontend-only **Provider Readiness** dashboard under Settings →
Provider / Local Model. It summarizes sanitized configuration, current-session
smoke status, chat sandbox availability, and metadata-only image-provider state.
Workspace context, files, tools, shell, memory, persistence, and image generation
remain explicitly off. No new IPC, provider call, storage, or execution authority
is added. See the [readiness dashboard documentation](docs/provider-readiness-dashboard.md).

**0.29** consolidates those provider surfaces into one calm, ordered console:
readiness, sanitized chat status, fixed smoke test, private chat sandbox,
disabled image-provider metadata, and the disconnected-capability boundary. The
smoke and chat approval gates are unchanged, output remains `local_untrusted`,
and web preview remains execution-free. This is frontend organization only; it
adds no IPC, provider request, storage, workspace access, or execution authority.

**0.36** makes the Workbench route assistant-first by default. The empty state is
now a centered greeting + composer + small safety sentence; action preview cards,
argv details, repair evidence, audit reference, and the Action Inspector appear
only after an intent is staged or selected, or through explicit details toggles.
The bottom status rail is quieter, while no-write/dry-run/latest-command details
remain inspectable. This is layout/information hierarchy only: no IPC, provider
call, shell, write bridge, workspace context, memory, persistence, image
generation, or autonomous execution authority is added.

### Versioning

Two versions are tracked and never conflated:

- **Workbench** (this desktop UI): `0.16.0` — shown in the sidebar footer, Settings →
  General → About, the Update Center "Current version", and the desktop bundle.
- **RealForge backend** (the Python engine): `2.7` — shown beside the Workbench
  version. The Update Center uses the **Workbench** version for app-update metadata.

Historical milestones:

- **0.1** static offline UI prototype
- **0.2** typed report contracts and defensive adapters (`src/data/`)
- **0.3** read-only JSON report import (Reports screen)
- **0.3.1** import trust hardening
- **0.4** manual read-only CLI bridge catalog
- **0.5** React + TypeScript + Vite app shell (all 14 screens)
- **0.5b** TypeScript data layer migration (adapters, import, CLI catalog, fixtures)
- **0.5c** TypeScript strictness, CSS token split, cross-platform bridge prep
- **0.6** Tauri desktop shell skeleton (metadata-only IPC)
- **0.7** Allowlisted read-only CLI IPC (desktop only)
- **0.8** Workspace onboarding, resolution, and bridge health (desktop only)
- **0.9** Persisted workspace + update center scaffold (signed updater deferred)
- **0.10** Update pipeline readiness + workspace invalidation polish (updater plugin still deferred)
- **0.11** Safe command composer preview (three existing read-only loads; all writes disabled)
- **0.12** One threat-modeled, approval-gated, fixed no-write validation action
- **0.13** Security Center + vulnerability triage (preview-only fix plans; no auto-fix, no dependency edits)
- **0.14** Read-only security scan bridge (allowlisted `npm audit`/`cargo tree`; untrusted output, no remediation)
- **0.15** UI declutter + navigation hierarchy + Security UX polish (no behavior/safety changes)
- **0.16** Version alignment (Workbench 0.16.0), Settings About surface, onboarding polish, 1280px smoke (no behavior/safety changes)
- **0.17** Signed-updater threat model + typed release-readiness checklist (no real updater, no unsigned install, no fake endpoints/keys)
- **0.18** Controlled workspace-relative `.real` file check (validated picker; still dry-run/check-only, no write bridge, no arbitrary argv)
- **0.19** Session-only approval audit log and sanitized execution transparency (no persistence, no new IPC or execution power)
- **0.20** App-config-only sanitized approval history (fixed file, confirmed clear, web remains session-only)
- **0.25** Approval-gated fixed provider smoke display (desktop only; no arbitrary prompt, identity exposure, or persistence)
- **0.26** Approval-gated private chat sandbox (single turn, stdin-only, no context/tools/history/persistence)
- **0.27** Private chat sandbox hardening (single active request, desktop cancellation, redacted timeout/cancel states, safe visible-response copy)
- **0.28** Private provider readiness dashboard (sanitized lifecycle, session-only smoke status, disconnected capabilities visible, no new authority)
- **0.29** Provider area UX consolidation (ordered console, reduced duplication, unchanged approval and trust boundaries)
- **0.31** Conversation flow polish (greeting → describe → preview → approve → result → reference; gated illustrative evidence, secondary audit, clearer result affordance; no new authority, IPC, or execution power)
- **0.32** Main composer can use the existing private chat sandbox (explicit Ask-local mode, desktop-only, per-send approval, LOCAL UNTRUSTED single-turn output; reuses the existing IPC; no workspace/files/tools/memory/persistence, no new provider authority)
- **0.36** Assistant-first Workbench declutter (prompt-first empty route, action/inspector/safety details on demand; no new authority)
- **0.38** Real local chat interaction (Enter sends / Shift+Enter newline; session-only visible multi-turn thread with single-turn bounded calls — prior turns never sent; informational Local model profile selector; Safe preview and Ask local model fully separated; reuses existing IPC, no new authority/persistence/audit)

## Toolchain and dependency security

- **Node.js:** developed and validated on **Node 22** (npm 10). Vite 8 (Rolldown)
  and Vitest 4 require a current Node LTS — **Node 18 is end-of-life and not
  supported** by this toolchain. Use Node 20.19+ or 22.12+.
- **Rust:** the desktop shell requires recent stable Rust (validated on 1.92).
- Dependency advisories and their status are tracked in
  [docs/security-dependencies.md](docs/security-dependencies.md):
  - **esbuild** dev-server file-read advisory — **resolved** (devDependency bumped
    to `^0.28.1`; `npm audit` reports 0 vulnerabilities).
  - **glib `<0.20`** Rust soundness advisory — **blocked upstream** by Tauri 2.11's
    GTK3 (gtk-rs 0.18) Linux webview stack; Linux-only exposure, tracked for a
    future Tauri bump.
- The **Security Center** screen (0.13) surfaces these advisories with severity,
  exposure, affected files, and **preview-only** fix plans. It never modifies
  dependency files, runs scanners, or applies changes. See
  [docs/security-center.md](docs/security-center.md).

## Run (React app — default)

```bash
cd workbench
npm install   # first time only
npm run dev
```

Open `http://localhost:5173`. Vite serves the React app with repository-owned
assets and the existing cockpit CSS.

## Legacy static shell (reference)

The pre-React HTML/JS prototype is preserved under `legacy/`:

```bash
npm run dev:legacy
```

Then open `http://localhost:4173` (serves `legacy/index.html`).

## Validate

```bash
npm run check      # fixtures + syntax + tsc
npm test           # node tests + vitest React tests
npm run build      # production dist/ (offline bundle)
npm run build:data # legacy bundle + Node CLI allowlist artifacts
npm run smoke:visual  # Playwright layout smoke at 1024px, 1280px, and 1440px (after build)
npm run check:tauri   # Rust IPC bridge unit tests (requires cargo)
```

## Desktop shell (Tauri — 0.6)

```bash
npm run tauri:dev    # desktop window + Vite dev server
npm run tauri:build  # production desktop bundle (requires Rust + WebView)
```

See [docs/desktop-shell.md](docs/desktop-shell.md) for macOS/Windows setup, IPC
commands, and safety boundaries. **0.7** adds read-only CLI load for three
fixed sources in desktop mode only. **0.8** adds workspace discovery, folder picker
(session-only), and bridge health checks. Signing/installers are future work.

## Validate (web)

```bash
npm run check      # fixtures + syntax + tsc + tauri icon gen
npm test           # node tests + vitest React tests
npm run build      # production dist/ (offline bundle)
npm run build:data # legacy bundle + Node CLI allowlist artifacts
```

## Architecture (0.12)

```text
src/bridge/                       → typed frontend bridge (web fallback + Tauri IPC)
src/composer/                     → typed action catalog + runtime availability
src/features/composer/            → action preview, inspector, and intent controls
src-tauri/src/bridge/
  approval.rs                     → one fixed approved check, timeout/caps, no writes
  workspace_store.rs              → persisted workspace.json in app config dir
  update.rs                       → update readiness (env config, no network)
  workspace.rs                    → repo discovery, validation, saved priority
  health.rs                       → bridge health + optional capabilities probe
  allowlist.rs / spawn.rs         → read-only CLI IPC (unchanged from 0.7)
docs/update-pipeline.md           → signed updater future setup
docs/command-composer.md          → 0.11 action and execution boundary
docs/approval-bridge-threat-model.md → 0.12 threat model and rejected inputs
```

**Safety unchanged:** web mode never executes CLI. Workspace writes only go to app
config. Updater does not network until `tauri-plugin-updater` and release signing
are wired. See [docs/update-pipeline.md](docs/update-pipeline.md).

The **Reports** screen previews RealForge-style JSON reports without a backend:

- Paste JSON, or load a built-in sample (skill benchmark, update bundle +
  proposal, creative brief, vision report, settings, capability registry).
- The report type is auto-detected from its fields (for example
  `task_results` + `domain_scores` -> skill benchmark, `patch_sha256` /
  `patch_targets` -> patch proposal, `candidate_version` -> update bundle,
  `capabilities` -> capability registry, `sections` -> settings,
  `detected_subjects` / `asset_opportunities` -> image understanding). A manual
  type selector is always available, and unmatched JSON falls back to a generic
  raw field preview marked **UNRECOGNIZED**.
- The preview reuses the report adapters, so it shows the report type, parsed
  summary, key fields, adapter warnings, safety labels, whether the report is
  staff-only, and whether provider output is untrusted.
- A persistent banner states that imported JSON is untrusted and that RealForge
  will not execute commands or apply changes from a report.
- Suggested commands inside a report are shown as suggestions only and marked
  **NOT EXECUTED**. Patch, proposal, merge, and update reports are labeled
  **review only** with a disabled apply control (the backend bridge is not
  connected).
- Staff-only reports stay gated while Staff Mode is off: advanced details remain
  locked until the staff UI preview is enabled, which changes no backend state.

**Trust invariants (0.3.1).** The import preview layer enforces trust; it does
not let the imported payload describe itself as safe:

- Imported JSON is **always** treated as untrusted. Fields like
  `"untrusted": false` cannot remove the UNTRUSTED label.
- A source-declared `"status": "VALIDATED"` (or a `VALIDATED` safety label) is
  surfaced as **VALIDATION CLAIMED · UNVERIFIED**, never as RealForge
  verification.
- Staff gating is derived from the report **type** plus the Workbench staff
  state. A payload's `"staff_only": false` cannot unlock a staff-only report
  type (update bundle, scheduler run); a payload may only opt into stricter
  gating.
- Adapters align with real RealForge 2.7 backend shapes — skill-bench
  (`domain_scores`, `normalized_score`, `task_results`, `passed`,
  `safety_failures`), eval (`tasks`, `scores`, `total_score`, `passed`,
  `failures`), and patch proposals (`patch_sha256`, `patch_targets`,
  `files_to_modify`, `unified_diff`) — without breaking the simplified fixture
  shapes. Image-understanding reports route to the richer adapter.
- Preview rendering is bounded: long lists and long text are capped with a clear
  **+N more** affordance, and suggested commands wrap instead of clipping.
- If auto-detect sees one type but you manually select another, the preview
  warns: "This JSON looks like X, but you selected Y."

Imported JSON is parsed in the browser only. There is no file read, no CLI
invocation from the browser, and no network access.

## CLI report bridge (0.4)

Workbench 0.4 adds a **manual, read-only CLI bridge catalog** on the Reports
screen. It does **not** execute commands from the browser.

- `workbench/src/data/import/cli-report-sources.js` is the shared allowlist of
  fixed `argv` arrays (no shell strings, no user args).
- `workbench/tools/realforge-report-bridge.mjs` is a local Node helper for
  developers: `node tools/realforge-report-bridge.mjs load <source-id>`.
- The UI shows each allowlisted source, copies the bridge command to the
  clipboard, and instructs you to paste the JSON output into the import box.
- Denied subcommands include write/apply/scheduler/staff flows (`repair`,
  `propose-patch`, `scheduler-run`, `apply-proposal`, etc.).

```bash
cd workbench
npm run bridge:list
node tools/realforge-report-bridge.mjs load capabilities
```

Output remains **untrusted** until adapted by the import pipeline. No localhost
backend, no browser-to-shell bridge, and no live UI execution.

## Data flow

```text
source JSON fixture -> defensive adapter -> view model -> static renderer
pasted/sample JSON  -> defensive adapter -> import preview (read-only, untrusted)
```

Adapters collect warnings instead of throwing on missing or malformed optional
fields. Provider and generated output defaults to `UNTRUSTED`; staff-only report
data remains gated while Staff Mode is off. Type declarations cover the current
status, settings, capability, benchmark, patch/update, scheduler, creative,
image, vision, Unreal, Blender, asset, and engine-pipeline report families.

## Safety boundary

- All built-in data is static and mocked.
- Command palette selections compose typed action previews with explicit safety metadata.
- Workbench submission stages reviewed context locally in browser memory only.
- Proposed argv is fixed display metadata, never an executable browser command.
- Only `capabilities`, `slash`, and `settings-doctor` can load through desktop IPC.
- One additional desktop action ID, `realc-check-hello-example`, can run only
  after explicit approval; it has no path or argv input and cannot write.
- Imported report JSON is parsed in-browser only, **always** treated as
  untrusted regardless of its own fields, and never executed or applied.
  Suggested commands are display-only; patch/update reports are review-only with
  no working apply control.
- Source-declared validation in an imported report is a *claim*, not RealForge
  verification, and is labeled as such.
- Staff mode is a visual preview; the backend remains `STAFF OFF`. Staff gating
  for imported reports is enforced by the preview layer (report type + Workbench
  staff state); a payload cannot lower it.
- No browser network, arbitrary command, write, apply, commit, or merge path exists.
  Desktop command execution remains limited to the three fixed read-only sources.
- Future CLI/report JSON integration must preserve the same explicit trust and
  approval boundaries.

The integration order is pasted/local JSON preview (0.3), manual read-only CLI
catalog (0.4), React/TypeScript app shell (0.5), Tauri desktop shell (0.6+),
safe command composer preview (0.11), then a separately reviewed approval-gated
bridge.

## Next milestone (0.13+)

0.12 proves approval with one fixed no-write check. A 0.13 milestone should keep
the same command and add only a threat-modeled workspace-relative `.real` file
selector with canonical containment, symlink rejection, and input size limits.
Write actions and signed updater work remain separate. See
[docs/command-composer.md](docs/command-composer.md),
[docs/approval-bridge-threat-model.md](docs/approval-bridge-threat-model.md),
[docs/update-pipeline.md](docs/update-pipeline.md), and
[docs/desktop-shell.md](docs/desktop-shell.md).
