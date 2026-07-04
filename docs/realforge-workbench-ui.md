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

## Workbench — private local model provider (provider-agnostic)

- Settings → **Provider / Local Model** generic **Private Local Model** profile
- Session-local model connection picker with private identity hidden
- OpenAI-compatible local provider type; endpoint scaffold in session only
- **LOCAL UNTRUSTED** trust label; output remains untrusted until validated
- Public template: `.realforge.toml.example` → copy to gitignored `~/.realforge.local.toml`
- No model weights, private names, API keys, or paths in the public repo
- No browser fetch/network; RealForge CLI uses local ignored config when wired
- Workbench 0.23: Settings provider panel matches `realforge provider status --json`
- RealForge 0.24: CLI adds the fixed `realforge provider smoke --json` reachability check
- Workbench 0.25: desktop Settings can run that fixed smoke check after explicit approval; no prompt input, browser request, private identity, or response persistence
- Workbench 0.26: desktop Settings adds one approval-gated private chat sandbox; user text only, no workspace/files/tools/history, session memory only
- Workbench 0.27: hardens private chat with one active request, input-free desktop cancellation, redacted timeout/cancel states, and capped untrusted copy
- Workbench 0.28: adds a sanitized private provider readiness dashboard; smoke state is session-only and workspace/files/tools/memory/image execution remain disconnected
- Workbench 0.29: consolidates readiness, sanitized status, smoke, chat, disabled image metadata, and the safety boundary into one provider console without adding authority
- Workbench 0.49: desktop Workbench opens to Chat, Safe Preview is an inline **Preview action**, Chat options stay collapsed, and local provider setup copies a private config template without scanning model folders or writing secrets
- Workbench 0.50: no-clutter visual pass with flatter native surfaces, outline controls, and Settings advanced categories behind disclosure; no new authority
- Workbench 0.51: design-brief alignment using near-black canvas, regular display type, white outline pills, 8px hairline cards, sparse accents, and no shadows; no new authority
- Provider status remains a sanitized boolean/host shape, with CLI guidance for full env/repo precedence

See [local models](realforge-local-models.md) and [provider template](provider-config.example.toml).
The desktop boundary is documented in the
[provider smoke threat model](../workbench/docs/provider-smoke-threat-model.md).
The single-turn text boundary is documented in the
[private chat sandbox threat model](../workbench/docs/private-chat-sandbox-threat-model.md).

## Workbench 0.18 - controlled workspace-relative .real file check

Workbench 0.18 extends the approved dry-run model to **select** a workspace-relative
`.real` file to typecheck, while preserving every safety property. It is still
dry-run/check-only and **not** a write bridge.

- **Read-only file discovery** (`list_real_files` IPC): scans only inside the
  resolved workspace, returns workspace-relative `.real` paths, excludes hidden/
  vendor/build dirs (`.git`, `.venv`, `node_modules`, `target`, `dist`, `build`,
  `__pycache__`, `.realforge`, …), never follows symlinks, and caps file count (500)
  and depth (12).
- **Second approval-gated action** `realc-check-workspace-file`: runs
  `realc <relative-path> --check`. Rust strictly validates the chosen path — `.real`
  only, workspace-relative, no traversal, canonicalized + contained, no symlink
  escape, no control characters, length-capped — and the fixed
  `realc-check-hello-example` action still works.
- **UI**: a **dropdown** of discovered files (no raw path textbox), workspace + selected
  path shown, exact validated argv preview, explicit acknowledgement, and helpful empty
  states (no files, list error, web/unhealthy upstream). Run is disabled without a
  selected file or acknowledgement.
- **Unchanged boundaries**: web mode is execution-free, no arbitrary argv/flags, no
  shell, no writes, no network, no new write IPC; output stays inert and `UNTRUSTED`.

## Workbench 0.19 - approval audit log and execution transparency

Workbench 0.19 adds a typed, session-only audit trail for the two existing approved
dry-run checks. It does not expand the bridge allowlist or add an IPC command.

- **Audit model**: action ID/title, fixed or validated relative target, sanitized
  command summary, explicit-checkbox acknowledgement kind, normalized result status,
  exit code when available, duration, and independently capped stdout/stderr previews.
- **Fixed safety posture**: every entry is `UNTRUSTED OUTPUT`, `NO WRITES`, and
  `NO NETWORK`; backend-provided trust labels cannot weaken these fields.
- **UI**: Workbench shows recent approved runs. Reports shows the full current-session
  list, with process output collapsed by default and a safe-copy summary that omits
  stdout/stderr and absolute workspace paths.
- **Storage**: memory only. No repository, workspace, `.realforge`, browser-storage,
  or app-config write occurs. Closing or reloading the frontend clears the list.
- **Unchanged authority**: web-mode blocks and pre-approval validation failures are
  not logged as approved runs; there is still no write, patch/proposal apply,
  scheduler, update install, commit, merge, shell, or arbitrary-argv path.

Persistent audit history is deferred. It would require app-config-only storage plus
a separate retention, redaction, and tamper-evidence threat model. The bundle version
remains `0.16.0` until the signed-release requirements documented in 0.17 are met.

## Workbench 0.20 - app-config-only approval history

Workbench 0.20 implements the separately threat-modeled persistence step for desktop
approval history:

- fixed `approval-audit-log.json` under Tauri app config; no frontend path input
- strict version-1 schema, newest-50 retention, and 128 KiB read/write cap
- canonical Rust validation with invalid-entry dropping and safe corrupt-file fallback
- no stdout/stderr preview bodies, full output, secrets, environment variables,
  provider keys, or absolute workspace paths persisted
- Reports status, entry count, confirmed clear action, and app-config-only policy copy
- web preview remains session-only with no browser-storage fallback

The store is not a write bridge: it cannot target the repository or workspace and
does not add shell, network, arbitrary argv, patch/proposal apply, scheduler, update
install, commit, or merge. Version 1 is not encrypted or tamper-evident. See the
[persistence threat model](../workbench/docs/approval-audit-persistence-threat-model.md).

## Workbench 0.17 - release readiness & signed-updater threat model

Workbench 0.17 is a **release-readiness / threat-model** milestone. It prepares for a
real signed updater **without** shipping one: no update download, no install, no
unsigned-install path, and no fake endpoint or key.

- **Signed-updater threat model** (`workbench/docs/signed-updater-threat-model.md`):
  update trust boundary, signed-artifact + public-key handling, the private key never
  in the repo, channel model (stable/preview/local-dev), downgrade/replay and metadata
  integrity, user-confirmed install, macOS notarization / Windows Authenticode futures,
  failure/offline states, and how app updates differ from RealForge self-improvement /
  update bundles.
- **Typed release-readiness checklist** (`src/data/release/release-readiness.ts`): 15
  items with `pass`/`warn`/`missing`/`deferred` status, `platform`, `requiredFor`
  track, `details`, and `nextAction`. Signing, notarization, and updater config stay
  honestly `missing`/`deferred` — never faked as ready. Rendered in the Update Center
  with display-only validation commands and explicit "no unsigned updates" /
  "private keys never stored" statements.
- **No behavior/safety change**: no real updater, no install, no new IPC, no write
  bridge, no shell, no network. The bundle version stays `0.16.0` until a real signed
  release.

## Workbench 0.16 - version alignment, About surface, onboarding polish

Workbench 0.16 is a **metadata / About / onboarding** milestone. It adds **no**
backend command, write bridge, shell, network call, or auto-fix.

- **Version alignment.** Every Workbench surface now reports **0.16.0**:
  `package.json`/`package-lock.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json`, the Rust constants (`mod.rs`, `update.rs`), the
  frontend constant (`web-fallback.ts`), the sidebar footer, the runtime/About
  surface, and the Update Center "Current version". The desktop bundle metadata
  matches the UI. The **RealForge backend** version (`2.7`) stays separate and is
  never conflated. A `version-alignment` test pins these so stale `0.12.0`/`0.10`/
  `0.15` labels cannot silently return.
- **About surface.** A new **Settings → General → About** card ("About RealForge
  Workbench") shows Workbench version, backend version, runtime mode, platform,
  bridge mode, update status, build channel, workspace status, and a
  security-posture summary. **Copy diagnostics** copies inert JSON only (versions,
  modes, statuses) — no environment variables, secrets, keys, file paths, or
  command output.
- **Onboarding polish.** A shared `StateNote` (what happened / why it matters /
  next safe action) gives empty, loading, and error states a calm, consistent
  voice across workspace, bridge-health, web-mode, Update Center, and
  security-scan surfaces.
- **Responsive.** The visual smoke now checks **1024 / 1280 / 1440** and walks the
  Security, Reports, and Settings/About screens for overflow and console errors.

## Workbench 0.35 - Settings simplification

- Settings nav grouped by intent: **App**, **Local model**, **System**, **Boundaries**,
  **Advanced** — quieter labels, same section IDs.
- Provider settings split: readiness summary → safe actions (smoke + chat) → collapsed
  advanced details (status grid, image metadata, safety matrix).
- General About/diagnostics, workspace grid, update configuration, and doctor checks
  use progressive disclosure (`<details>`) without removing controls.
- Safety boundary strip collapsed by default; all READONLY / LOCAL ONLY labels remain.

See [workbench/docs/settings.md](../workbench/docs/settings.md).

## Workbench 0.36 - Assistant-first Workbench declutter

- Default Workbench route opens on a centered assistant surface: greeting, compact
  flow hint, one composer, and a small safety sentence.
- Large action preview, argv metadata, safety facts, repair evidence, and audit
  reference stay hidden until the user stages or selects an intent.
- Action Inspector is closed by default and opens through the **Details** toggle.
- Bottom rail is reduced to current state + compact safe-mode summary; detailed
  no-write/dry-run/latest-command information remains inspectable.
- No new IPC, provider call, write bridge, shell, workspace context, memory,
  persistence, image generation, or autonomous execution path is added.

## Workbench 0.50 - no-clutter visual-system pass

- Heavy glow/card treatment is flattened into hairline borders, near-black native
  surfaces, and calmer outline controls.
- Chat, Home, Provider, and Settings surfaces keep the same safety boundaries but
  expose less instrumentation by default.
- Settings keeps App, Local model, System, and Boundaries visible; Advanced is now
  opt-in through a disclosure.
- No model authority, IPC, provider call, workspace context, tools, writes, shell,
  memory, persistence, image generation, or autonomous execution path is added.

## Workbench 0.51 - design-brief alignment

- The visual system now follows the attached brief more strictly: one near-black
  canvas, regular-weight display type, 8px content cards, hairline elevation, and
  white outline pills as the shared interactive shape.
- Shadows, glow-heavy cards, bright stacked state chrome, and overused accent
  gradients are flattened across Workbench, Home, Settings, Provider, Reports,
  Security, and Studio screens.
- Accent color remains sparse and informative; provider output and local model
  boundaries remain visible but calmer.
- No behavior, provider authority, IPC, workspace context, tools, writes, shell,
  memory, persistence, image generation, or autonomous execution path is added.

## Workbench 0.16 - Home launchpad and intent-based navigation

- **Home** is a calm launchpad: hero “What do you want to work on?”, primary **Open
  Workbench**, secondary links (local model, provider smoke/readiness, safety center),
  compact sanitized status summary, suggested/recent work, and a short
  `local_untrusted` boundary footer. No new provider IPC from Home — desktop reuses
  existing `loadProviderStatus()` only.
- Sidebar regrouped by intent: **Start** (Home/Workbench), **Build** (Code/Research),
  **Studio**, **Evaluate** (Capabilities/Benchmarks/Security/Reports), **System**
  (Settings/Updates). Workbench is visually primary; Settings → Provider stays the
  path for private local model readiness.
- Image execution remains disabled/metadata-only; workspace/tools/memory stay
  disconnected; private model identity remains local-only and never appears in the
  launchpad summary.

See [workbench/docs/ui-navigation.md](../workbench/docs/ui-navigation.md).

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
11. **Controlled workspace `.real` path input** (0.18) - validated relative picker, no arbitrary argv
12. **Session-only approval audit log** (0.19) - sanitized transparency, no persistence or new authority
13. **App-config approval history** (0.20) - fixed sanitized metadata file, confirmed clear, web session-only
14. **Provider smoke display** (0.25) - fixed desktop command, fresh approval, sanitized untrusted session result
15. **Private chat sandbox** (0.26) - bounded stdin-only text, fresh approval, no context/tools/history/persistence
16. **Private chat hardening** (0.27) - single active request, fixed-child cancellation, safe clear/copy behavior, no new authority
17. **Private provider readiness** (0.28) - sanitized lifecycle, session-only smoke status, explicit disconnected capabilities, no new authority
18. **Provider area UX consolidation** (0.29) - ordered provider console, reduced duplication, unchanged approval and trust boundaries
19. **Assistant-first Workbench declutter** (0.36) - prompt-first default, details on demand, unchanged approval and trust boundaries
20. **Chat-first Workbench simplification** (0.49) - Chat default, preview action in the same composer, off-canvas chat navigation, private-config setup guide, no new authority
21. **No-clutter fluidity pass** (0.50) - flatter native visual system, Advanced Settings behind disclosure, no behavior or authority change
22. **Design-brief alignment** (0.51) - near-black canvas, white outline pills, 8px cards, no shadows, no behavior or authority change
21. Future: encrypted/tamper-evident audit history, write bridge, signed updater, and any security remediation/fix pipeline require separate reviews and approval gates

Run and validation instructions are in [`workbench/README.md`](../workbench/README.md).
