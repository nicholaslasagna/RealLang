# Local bridge boundary (Workbench 0.12)

Strict integration layer between the React UI and RealForge CLI / Tauri runtime on
**macOS and Windows**. The UI never spawns subprocesses directly in web mode.

## Today

| Surface | Role |
|---------|------|
| `src/data/cli/cli-report-sources.ts` | Shared read-only allowlist (fixed `argv`) |
| `src/bridge/` | Typed frontend client — web fallback + Tauri IPC |
| `src-tauri/src/bridge/` | Rust allowlist + read-only CLI + workspace + update readiness |
| `tools/realforge-report-bridge.mjs` | Dev-only Node helper (web workflow) |

**Desktop (0.7):** `loadReadOnlyReportSource(sourceId)` — allowlisted read-only CLI.

**Desktop (0.8):** `getWorkspaceResolution()`, `checkBridgeHealth()`, `selectWorkspaceDirectory()`.

**Desktop (0.9):** `getSavedWorkspace()`, `saveWorkspaceSelection()`, `clearSavedWorkspace()`.

**Desktop (0.10):** `getUpdateStatus()`, `checkForUpdate()` with typed `UpdateConfiguration`,
env-based readiness detection, and honest `not_configured` / `ready_to_check` states.

**Composer (0.11):** high-level actions can preview safety metadata. Only the
existing `loadReadOnlyReportSource(sourceId)` path can load now; proposed argv is
display-only and never crosses the bridge.

**Approval check (0.12):** `runApprovedDryRunAction()` accepts one fixed action
ID and an acknowledgement boolean. Rust owns the fixed `reallang.cli` argv and
`examples/hello.real` target. Output remains untrusted.

**Web:** explicit `unsupported_web` / `unavailable_web` fallbacks — no execution, no network.

## Rules (non-negotiable)

| Rule | Detail |
|------|--------|
| Source IDs only | UI passes `capabilities`, `slash`, `settings-doctor` — never command text |
| Fixed `argv` only | Rust/Node build `python -m realforge.cli <frozen argv>` |
| No shell | `std::process::Command` / `execFileSync` — no shell plugin |
| Workspace persistence | Writes only to app config dir (`workspace.json`) — never mutates repo |
| Updater | No network until `tauri-plugin-updater` + signing infra wired |
| Output untrusted | All JSON through report import adapters |
| Write commands | Deferred until approval-gated milestone |
| Composer | Source IDs only for live loads; all other actions are preview-only |
| Approved check | One fixed no-write action; no user path or argv |

## Frontend API

```typescript
import {
  getWorkspaceResolution,
  getSavedWorkspace,
  saveWorkspaceSelection,
  clearSavedWorkspace,
  checkBridgeHealth,
  getUpdateStatus,
  checkForUpdate,
  loadReadOnlyReportSource,
  runApprovedDryRunAction
} from "../bridge";
```

## Tauri IPC

See [desktop-shell.md](../docs/desktop-shell.md) and [update-pipeline.md](../docs/update-pipeline.md).

## Persisted workspace (0.9–0.10)

Valid repository roots selected in the desktop app are saved to
`{app_config_dir}/workspace.json` and restored on launch. Priority:
**saved → session → REALFORGE_REPO_ROOT → walk-up**.

If the saved path is deleted or moved, resolution returns `saved_path_missing` with
friendly Home/Settings actions (choose new folder or clear saved workspace).

## Update center (0.10)

Settings → Updates shows version, channel, configuration readiness, safety copy,
and a release checklist. Optional env vars:

- `REALFORGE_UPDATE_ENDPOINT`
- `REALFORGE_UPDATER_PUBKEY`
- `REALFORGE_UPDATE_CHANNEL`

**Check for Updates** is disabled until both endpoint and public key are configured.
**Install and Restart** stays disabled until a verified signed update exists.
No fake auto-update behavior.
