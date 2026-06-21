# RealForge Workbench - Tauri desktop shell (0.6-0.20)

Workbench **0.6** added a **Tauri 2** desktop shell around the React + Vite app.
**0.7** adds **allowlisted read-only CLI IPC** in desktop mode only.
**0.8** adds **workspace resolution**, **onboarding UI**, and **bridge health**.
**0.9** adds **persisted workspace selection** and an **update center scaffold**.
**0.10** adds **signed-update pipeline readiness** and **workspace invalidation polish**.
**0.11** adds a frontend **safe command composer preview** without adding Tauri
commands or widening the read-only allowlist.
**0.12** adds exactly one threat-modeled, approval-gated, no-write validation
action. It does not enable a write bridge.
**0.13-0.14** add the Security Center and a read-only, allowlisted security scan
bridge (`npm audit --json`, `cargo tree`) — read-only, no remediation.
**0.15** is a UI declutter / navigation-hierarchy pass.
**0.16** aligns desktop bundle metadata to **Workbench 0.16.0** and adds a Settings
About surface. No new commands or write authority.
**0.17** adds a signed-updater **threat model** and a typed **release-readiness
checklist**. No real updater, no install path, no endpoints/keys, no new commands.
**0.18** adds a controlled, validated workspace-relative **`.real` file check**
(`list_real_files` read-only IPC + a second approval-gated `realc … --check`
action). Still dry-run/check-only — no write bridge, no arbitrary argv, no shell.
**0.19** adds frontend-only, session-memory execution auditing for those approved
checks. It adds no Tauri command, filesystem write, persistence, or execution power.
**0.20** adds a fixed-file, app-config-only store for sanitized approval metadata.
It adds no command execution, shell, network, workspace write, or general file API.

## What 0.16 includes (version metadata)

0.16 is a metadata/About/onboarding milestone — **no** new Tauri commands, write
bridge, shell, or network. The desktop bundle and runtime now report the same
version as the UI:

| Surface | Value |
|---------|-------|
| `package.json` / `package-lock.json` | `0.16.0` |
| `src-tauri/Cargo.toml` | `0.16.0` |
| `src-tauri/tauri.conf.json` (bundle metadata) | `0.16.0` |
| Rust `WORKBENCH_VERSION` (`mod.rs`, `update.rs`) | `0.16.0` |
| Frontend `WORKBENCH_VERSION` (`web-fallback.ts`) | `0.16.0` |
| Runtime IPC `get_runtime_info.workbenchVersion` | `0.16.0` |
| Update Center `get_update_status.currentVersion` | `0.16.0` |

The **RealForge backend** version (`2.7`) stays separate and is shown beside the
Workbench version. The Update Center / `tauri-plugin-updater` readiness scaffold
uses the **Workbench** version for app-update metadata, never the backend version.
`tauri build` therefore produces a `0.16.0` bundle whose reported version matches
the sidebar, About surface, and Update Center. A `version-alignment` test pins all
of these so a stale `0.12.0` cannot silently return.

## What 0.12 includes

| Area | Status |
|------|--------|
| Approved action ID | `realc-check-hello-example` only |
| Fixed command | `realc examples/hello.real --check` |
| User path / argv input | **No** |
| Explicit UI acknowledgement | Yes |
| Canonical workspace containment | Yes |
| Timeout and stdout/stderr caps | Yes |
| Output trust | **UNTRUSTED** |
| Writes / network / shell | **No** |
| Apply / scheduler / update / Git | **No** |

See [approval bridge threat model](./approval-bridge-threat-model.md).

## What 0.11 includes

| Area | Status |
|------|--------|
| Typed high-level action catalog | Yes — frontend review metadata |
| Slash-command safety detail | Yes |
| Display-only proposed argv tokens | Yes — never sent to IPC |
| Existing read-only source loads | Yes — same 3 source IDs |
| Web execution | **No** |
| Write / apply / scheduler execution | **No** |
| New Tauri IPC commands | **No** |
| Shell plugin / arbitrary argv | **No** |

See [command-composer.md](./command-composer.md) for the action model and boundary.

## What 0.10 includes

| Area | Status |
|------|--------|
| Typed `UpdateConfiguration` IPC model | Yes |
| Env-based readiness (`REALFORGE_UPDATE_*`) | Yes — no secrets in repo |
| `missing_public_key` / `missing_endpoint` states | Yes |
| `ready_to_check` when endpoint + pubkey both set | Yes — no network yet |
| Release readiness checklist UI | Yes — informational |
| Install button | Disabled until verified signed update |
| `saved_path_missing` workspace status | Yes |
| `tauri-plugin-updater` | **Deferred** — see [update-pipeline.md](./update-pipeline.md) |
| Write / apply / scheduler / approval actions | **No** |
| Unsigned auto-update | **No** |

See [update-pipeline.md](./update-pipeline.md) for future signed updater setup.

## What 0.9 includes

| Area | Status |
|------|--------|
| Persisted workspace (`workspace.json` in app config dir) | Yes — macOS / Windows / Linux |
| `get_saved_workspace` / `save_workspace_selection` / `clear_saved_workspace` | Yes |
| Discovery priority: saved → session → env → walk-up | Yes |
| Settings → Updates update center UI | Yes |
| `get_update_status` / `check_for_update` IPC | Yes — returns `not_configured` |
| Tauri updater plugin / signed downloads | **Deferred** — no fake keys or endpoints |
| Write / apply / scheduler / approval actions | **No** |
| Unsigned auto-update | **No** |

### Future signed updater setup

See [update-pipeline.md](./update-pipeline.md) for the full checklist. Summary:

1. Generate signing keys (`tauri signer generate`) — private key stays out of repo
2. Add `tauri-plugin-updater` and configure `tauri.conf.json` endpoints + pubkey
3. Wire `check_for_update` to the plugin after CI publishes signed manifests
4. Enable `installAllowed` only after signature verification

Until then, **Check for Updates** is disabled (or returns `not_configured`) — no network.

## What 0.8 includes

| Area | Status |
|------|--------|
| Workspace resolution model (env / walk-up / folder picker) | Yes — desktop only |
| `get_workspace_resolution` IPC (metadata, no shell) | Yes |
| `check_bridge_health` IPC (filesystem + optional capabilities probe) | Yes |
| `select_workspace_directory` folder picker | Yes — persists valid selection in 0.9+ |
| Home onboarding card + Settings → Workspace panel | Yes |
| Reports CLI catalog bridge health strip | Yes |
| Write / apply / scheduler / approval actions | **No** |
| Shell plugin | **No** |
| Browser fetch / network from UI | **No** |

## What 0.7 includes

| Area | Status |
|------|--------|
| Tauri window hosting React dev/build | Yes |
| IPC metadata (runtime, capabilities, catalog, paths) | Yes |
| IPC `load_readonly_report_source` (3 fixed sources) | Yes — desktop only |
| Source-ID based invocation (no command strings from UI) | Yes |
| `std::process::Command` with fixed `.arg()` argv | Yes — **no shell** |
| Timeout (15s) + stdout cap (2MB) | Yes |
| Cross-platform `.venv` Python resolution | Yes |
| Web mode CLI execution | **No** — explicit `unsupported_web` |

### Allowlisted read-only sources (initial)

| Source ID | Fixed argv | JSON stdout |
|-----------|------------|-------------|
| `capabilities` | `capabilities --json` | Capability registry |
| `slash` | `slash --json` | Slash command registry |
| `settings-doctor` | `settings doctor --json` | Doctor / status summary |

Output always enters the **untrusted** import preview pipeline — same adapters and
trust rules as paste/import.

## Project layout

```text
workbench/
  src/audit/                     → typed audit entries + persistence sanitization
  src/composer/                  → typed action catalog + bridge availability
  src/features/audit/            → recent/full audit views; safe summary copy
  src/features/composer/         → preview UI; no process or IPC primitives
  src/bridge/                    → frontend bridge (web fallback + Tauri invoke)
  src-tauri/src/bridge/
    approval.rs                  → two approved no-write validation actions
    approval_audit_store.rs      → fixed app-config metadata persistence
    allowlist.rs                 → Rust-side source IDs + fixed argv
    workspace.rs                 → repo discovery, validation, session override
    health.rs                    → bridge health + optional probe
    resolve_python.rs            → .venv Python paths (macOS/Linux/Windows)
    spawn.rs                     → Command spawn, timeout, output cap
    update.rs                    → update readiness (env config detection)
    mod.rs                       → IPC command handlers
```

## Commands

```bash
cd workbench
npm install
npm run dev          # web
npm run tauri:dev    # desktop + Vite
npm run tauri:build
npm run check:tauri  # Rust unit tests
```

## Workspace resolution (0.8–0.9)

Discovery order:

1. **Persisted workspace** (`workspace.json` under Tauri app config dir)
2. **Session folder picker** selection (current app session)
3. **`REALFORGE_REPO_ROOT`** environment variable
4. **Walk-up** from current working directory or executable directory

A path is valid when it contains `workbench/package.json` and either
`src/realforge/` or `pyproject.toml`.

### Resolution statuses

| Status | Meaning |
|--------|---------|
| `found_by_saved` | Valid repo from persisted config |
| `saved_path_missing` | Persisted path no longer exists on disk |
| `found_by_env` | Valid repo from `REALFORGE_REPO_ROOT` |
| `found_by_walkup` | Valid repo discovered automatically |
| `selected_by_user` | Valid repo from folder picker |
| `missing` | No repo root found |
| `invalid` | Path selected but failed validation |
| `venv_missing` | Repo valid but `.venv` absent |
| `python_missing` | `.venv` present but interpreter not found inside |
| `cli_unavailable` | Python found but capabilities probe failed |
| `ready` | Repo, venv Python, and CLI probe OK |

### Fixing a missing CLI

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Set `REALFORGE_REPO_ROOT` to the repo root for bundled apps without adjacent checkout:

```bash
export REALFORGE_REPO_ROOT=/path/to/RealLang
```

## IPC commands

| Command | Purpose |
|---------|---------|
| `get_runtime_info` | App name, version, OS, arch, bridge mode (`read-only`) |
| `get_bridge_capabilities` | `cliSpawn: true`, read-only, no shell/writes/network |
| `list_readonly_report_sources` | Allowlisted source metadata (no argv over IPC) |
| `get_workspace_paths` | Tauri app dirs + workspace config file path |
| `get_saved_workspace` | Persisted workspace metadata |
| `save_workspace_selection` | Validate and persist repo root (app config only) |
| `clear_saved_workspace` | Remove persisted workspace |
| `get_workspace_resolution` | Repo/python discovery metadata (no subprocess) |
| `check_bridge_health` | Resolution + optional `capabilities --json` probe |
| `select_workspace_directory` | Folder picker; validates and persists repo root |
| `get_update_status` | Update center metadata (`not_configured` until signed) |
| `check_for_update` | No-op check when updater not configured |
| `load_readonly_report_source` | Run one allowlisted read-only CLI command |
| `list_security_scan_sources` | Read-only scan source metadata (0.14; no argv over IPC) |
| `run_security_scan_source` | Run one allowlisted read-only security scan (0.14) |
| `run_approved_dry_run_action` | Run one of two allowlisted checks after acknowledgement |
| `load_approval_audit_log` | Load the fixed sanitized app-config audit file |
| `save_approval_audit_log` | Replace the fixed file with validated metadata entries |
| `clear_approval_audit_log` | Remove only the fixed app-config audit file |

`load_readonly_report_source` accepts **only** `sourceId` (camelCase). Rust validates
against the allowlist and builds `python -m realforge.cli <fixed argv>`.

`run_security_scan_source` (0.14) accepts **only** `sourceId`. Rust validates against a
fixed scan allowlist (`security_scan.rs`) — programs limited to `{npm, cargo}`, fixed
argv arrays, install/update/fix tokens rejected, `env_clear` + minimal passthrough, 60 s
timeout, 1 MiB/64 KiB output caps, output marked untrusted, no writes, no remediation.
Allowed: `npm-audit-json` (cwd `workbench/`, **may use the network**), `cargo-tree` and
`cargo-tree-glib` (cwd `workbench/src-tauri/`, dependency evidence). npm audit's non-zero
"vulnerabilities found" exit is reported, not treated as an error. See the
[scan bridge threat model](security-scan-bridge-threat-model.md).

Structured errors: `unknown_source`, `executable_not_found`, `timeout`,
`output_too_large`, `invalid_json`, `non_zero_exit`, `spawn_failed`.

### Tauri permissions (0.8)

`capabilities/default.json` adds `dialog:default` for the folder picker only.
No shell plugin. No network plugin.

## Frontend bridge

```typescript
import {
  getWorkspaceResolution,
  getSavedWorkspace,
  saveWorkspaceSelection,
  clearSavedWorkspace,
  checkBridgeHealth,
  selectWorkspaceDirectory,
  getUpdateStatus,
  checkForUpdate,
  loadReadOnlyReportSource,
  runApprovedDryRunAction,
  loadApprovalAuditLog,
  saveApprovalAuditLog,
  clearApprovalAuditLog
} from "../bridge";
```

- **Web:** workspace/health return static preview metadata; CLI load returns `unsupported_web`
- **Desktop:** `invoke(...)` for resolution, health, picker, and read-only load

Home shows an onboarding card when the bridge is not healthy. Settings → Workspace
shows full resolution details and next actions. Reports shows a CLI bridge health strip.

## Cross-platform Python resolution

Rust `resolve_python.rs` checks (in order):

1. `.venv/bin/python`
2. `.venv/bin/python3`
3. `.venv/Scripts/python.exe`
4. `.venv/Scripts/python`
5. PATH fallback: `python3` (Unix) / `python` (Windows) — fixed name, no shell

Uses `PathBuf::join` throughout. Mirrors `tools/resolve-python.mjs` for the Node
dev bridge.

## Safety invariants

- No arbitrary command strings or args from the frontend
- No shell plugin, no `cmd.exe /c`, no `sh -c`
- Denied subcommands list blocks write/apply/scheduler paths in allowlist validation
- Imported JSON remains untrusted; staff gating unchanged
- No approval-gated writes until a future milestone
- Approval audit persistence is one fixed app-config file; no path input, workspace write, or output bodies
- Composer argv tokens are display-only and cannot be submitted to IPC
- Composer live loads are restricted to the unchanged three-source allowlist
- Approved actions accept a fixed ID, `approvalAcknowledged`, and only the validated
  relative path slot for the workspace-file action; Rust owns the module and flags
- Health probe uses the same allowlisted `capabilities --json` path as report load

## Future milestones

- Signed Tauri updater (endpoints + pubkey + CI artifacts)
- Approval-gated write bridge (separate milestone)
- Encrypted or tamper-evident audit history, after a separate key-management threat review
- Additional JSON-verified read-only sources (eval, bench, leaderboard)
- Installers, signing, notarization
