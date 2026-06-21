# RealForge Workbench safe command composer (0.11-0.19)

Workbench 0.11 adds a typed, session-only composer for reviewing RealForge
actions before any execution bridge exists. Users choose a high-level intent;
they do not enter a shell command or pass arbitrary arguments to Tauri.

## Current behavior

Each action plan records its category, domain, trust and approval labels,
potential file writes, command/network requirements, platform availability,
warnings, and next safe step. A proposed argv may be shown as separate fixed
tokens for review. Those tokens are display-only and are never sent to IPC.

The slash palette now selects a structured action and shows its safety metadata
before **Compose preview** moves it into Workbench. Composed actions and context
remain in memory for the current session and do not write to the workspace.

## Available read-only loads

Desktop mode can show **Load now** only when bridge health is ready and the
action maps to one of the existing Rust allowlist source IDs:

| Source ID | Report |
|-----------|--------|
| `capabilities` | Capability registry |
| `slash` | Slash-command registry |
| `settings-doctor` | Settings doctor/status |

The frontend passes only the source ID. Rust owns the fixed argv. Loaded JSON
enters the existing report adapters and remains **UNTRUSTED**. Web mode cannot
load any CLI source; it can use manual Reports import instead.

## Deliberately unavailable

Repair, provider planning, benchmarks, patch apply, proposal apply, scheduler,
updates, and staff improvement execution are not connected. Write-capable
actions show **APPROVAL BRIDGE REQUIRED** and have no active execute control.
There is no shell plugin, arbitrary command input, arbitrary argv, auto-apply,
auto-commit, auto-merge, scheduler run, or update installation path in 0.11.

A future bridge must separately define typed requests, staff and approval gates,
dry-run behavior, validation commands, patch-target review, rollback plans, and
audit records. The 0.11 action catalog is review metadata, not authority to run.

## 0.12 approved local check

Workbench 0.12 makes exactly one composed action executable in desktop mode:

```text
realc examples/hello.real --check
```

The UI shows the validated workspace, fixed argv, `writesFiles=false`,
`networkRequired=false`, and untrusted-output warning. The run control remains
disabled until the user acknowledges the local check. Rust receives only
`realc-check-hello-example` and `approvalAcknowledged: true`; it does not accept a
path, argv, command string, environment, timeout, or output target.

Web mode remains execution-free. Every write-capable action remains preview-only
and approval-bridge-required. See
[approval-bridge-threat-model.md](./approval-bridge-threat-model.md).

## 0.18 controlled workspace `.real` file check

Workbench 0.18 adds a second approval-gated, read-only check that lets the user
choose a workspace-relative `.real` file:

```text
realc <relative-path> --check
```

The file is selected from a **dropdown** populated by the read-only `list_real_files`
IPC (hidden/vendor/build dirs excluded, symlinks skipped, count/depth capped) — there
is no raw path textbox. Rust receives only `realc-check-workspace-file`,
`approvalAcknowledged: true`, and the chosen `relativePath`, then strictly validates
it: `.real` only, workspace-relative, no traversal, canonicalized + contained, no
symlink escape, no control characters, length-capped. The argv stays fixed except for
the one validated path slot; there is still **no** arbitrary argv, no flags, no shell,
no writes, and no network. The run control stays disabled until a file is selected and
the check is acknowledged; output remains inert and `UNTRUSTED`. The fixed
`realc-check-hello-example` action is unchanged.

## 0.19 approval audit log

After an explicitly approved check finishes, the frontend appends one typed audit
entry to session memory. The entry records the approved action ID/title, fixed or
validated workspace-relative target, sanitized command summary, acknowledgement
kind, status, exit code when available, duration, and capped stdout/stderr previews.
Safety invariants are fixed in the model: output is `UNTRUSTED`, writes are false,
and network is false.

The compact recent-runs view is shown in Workbench. Reports shows the complete
current-session list with output previews collapsed by default. **Copy safe summary**
exports metadata only; it omits process output and absolute workspace paths.

The log is intentionally session-only. It is not written to the repository,
workspace, `.realforge`, browser storage, or Tauri app config. Web-mode blocks and
attempts stopped before approval are not recorded as approved runs. 0.19 adds no IPC
command and no write, patch, proposal, scheduler, updater, commit, or merge authority.
Persistent audit history would require app-config-only storage and a separate threat
model.
