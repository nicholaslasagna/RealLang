# RealForge Workbench safe command composer (0.11-0.20)

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

## 0.20 persisted approval history

Desktop mode now loads and replaces one fixed app-config file through
`load_approval_audit_log`, `save_approval_audit_log`, and
`clear_approval_audit_log`. These are metadata-storage operations, not command
execution. No path is accepted from the frontend.

Before save, the frontend removes stdout/stderr preview bodies. Rust independently
validates each entry, reconstructs canonical action titles, relative targets,
command summaries, trust values, and safety labels, then retains at most 50 entries
within a 128 KiB file. Absolute workspace paths, full output, preview bodies,
environment data, provider keys, and arbitrary command metadata are not stored.

Reports shows persisted/session status and a confirmed clear action. Clearing
removes only the fixed audit file and in-memory history. Web preview remains
session-only and does not use browser storage. Encryption and tamper evidence are
deferred. See
[approval-audit-persistence-threat-model.md](./approval-audit-persistence-threat-model.md).

## Conversation flow (0.31)

The Workbench presents its existing composer as one continuous, approval-first
conversation. The flow is presentation only — it adds no provider authority, no
live model wiring, no workspace context, no tools, no shell, and no persistence.

Sequence:

1. **Greeting** — a friendly assistant opening (`WorkbenchGreeting`) states the
   approval-first contract: nothing runs or touches files until you approve it.
2. **Describe** — the user types intent in plain language in the composer. No
   shell command or arbitrary argument is accepted.
3. **Preview** — the always-present `ActionPreviewCard` shows the composed
   action with a calm one-line safety summary; full labels, the facts grid, and
   the display-only argv stay inspectable under **Show safety details**.
4. **Approve** — write/execute paths remain gated. The one fixed dry-run check
   requires explicit, per-run acknowledgement before the read-only bridge runs.
5. **Result** — `WorkbenchResultCard` renders the inert execution report with a
   clear pass/finished/blocked affordance. Output stays `UNTRUSTED` and cannot
   trigger apply, repair, commit, merge, update, or scheduler actions.
6. **Reference** — sanitized approval history stays available as a secondary
   `Reference` block, not a primary conversation turn.

An empty Workbench shows the greeting plus a `WorkbenchFlowHint` ("Describe →
Preview → Approve → Result") so the preview reads as a starting point rather than
an abrupt dump. Illustrative planning evidence appears only after the user stages
intent, and is labelled as untrusted, illustrative provider output. None of these
changes alter the approval gates, dry-run-only behavior, untrusted output trust
level, or the absence of workspace/tool/model autonomy.

## Main composer local sandbox mode (0.32, updated 0.49)

The desktop Workbench now treats chat as the primary surface and keeps Safe
Preview as an inline action from the same composer:

1. **Chat** — sends one bounded request to the **existing** private chat sandbox
   (`run_private_provider_chat_sandbox`) and renders the response in the thread
   as a `LOCAL UNTRUSTED` assistant turn.
2. **Preview action** — stages a structured, display-only action preview from the
   same typed text. The `ActionPreviewCard`, approval flow, approved dry-run
   result, audit reference, and display-only argv details all still work.

Chat is **desktop only**; web preview stays execution-free and can still compose a
Safe Preview. Chat requires an explicit per-send approval and never auto-sends
while typing. The request carries only a bounded prompt plus an acknowledgement
— no workspace, files, context unless the visible-chat option is enabled, tools,
shell, memory, history, or image generation. Output is
`local_untrusted`, capped, and session-only; nothing is persisted or added to the
approval audit. See
[main-composer-chat-threat-model.md](./main-composer-chat-threat-model.md).

This is not an autonomous agent and not image generation; the private model
identity stays local-only and never appears in tracked files.

## 0.38 real local chat interaction

Ask-local mode now behaves like a real local chat surface: Enter sends, Shift+Enter adds a
newline, and the thread shows a session-only back-and-forth. Each call is still one bounded
request — previous turns are never sent to the provider, and nothing is persisted or added to
the approval audit. A "Local model profile" selector is available for session-local Workbench
connection choice; only **Private Local Model** can send chat today, while mock and future
image profiles remain preview-only in Chat. It exposes no model name, endpoint, key, or path.
Safe preview is still a separate safety boundary, but no longer a separate
dominant surface. The user types once, then chooses either Send for Chat or
Preview action for a dry-run review. A typed chat prompt never renders as a fake
command preview.

## 0.49 chat-first simplification

- Chat opens as the default desktop Workbench state.
- The sidebar becomes an off-canvas menu in Chat to preserve horizontal space.
- The bottom status rail is hidden; safety copy remains in the topbar and inline
  Chat labels.
- Chat options are closed by default. Profile/context controls remain available
  behind the disclosure, and the approval checkbox stays inline near Send.
- No authority changes: no new IPC, no shell, no workspace/file context, no
  writes, no memory persistence, no image generation, and no autonomous loop.
