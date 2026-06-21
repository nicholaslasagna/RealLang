# Workbench approval bridge threat model (0.12-0.19)

## Decision

Workbench permits two approval-gated, read-only desktop actions:

- `realc-check-hello-example` — fixed target `examples/hello.real`
  (display: `realc examples/hello.real --check`)
- `realc-check-workspace-file` (0.18) — a **controlled, validated** workspace-relative
  `.real` file chosen from a read-only file list
  (display: `realc <relative-path> --check`)

Both run the resolved workspace Python interpreter with fixed argv
`-m reallang.cli <target> --check` and the validated repository root as the working
directory. The `reallang.cli` check branch reads, lexes, parses, and typechecks the
source file. It does not emit C, select an output path, call a provider, or use the
network.

This remains a read-only validation bridge, **not** a write bridge. 0.18 adds
controlled file *selection*, not arbitrary commands or argv.

## Action boundary

The Rust allowlist contains exactly two approved dry-run actions. The frontend sends
only the action ID, an approval acknowledgement boolean, and — for the workspace-file
action — a single `relativePath` string. Rust selects the module, the fixed argv
suffix (`--check`), and validates the path. Browser text, displayed argv, workspace
files, and provider output cannot add or replace process flags or arguments.

No repair, patch, proposal, scheduler, benchmark, update, Git, commit, merge, or
provider action is present in this allowlist.

## Allowed input

The accepted input fields (`deny_unknown_fields`) are:

- `approvalAcknowledged: true`
- `relativePath` (optional) — a workspace-relative `.real` path, used **only** by
  `realc-check-workspace-file` and ignored by the fixed action

There is no command string, argument array, flag, environment map, timeout, output
limit, working directory, provider, or network input. Any other field is rejected by
the schema.

## File-selection boundary (0.18)

The workspace-file action accepts a single relative path, validated in Rust before
execution:

- allowed extension: **`.real`** only (checked on both the input string and the
  canonical resolved file)
- **workspace-relative only** — absolute paths are rejected
- **no traversal** — `..`, root, and Windows path-prefix components are rejected
- **canonicalized + contained** — the canonical target must stay within the canonical
  workspace root
- **no symlink escape** — a symlink whose canonical target resolves outside the
  workspace is rejected (`outside_workspace`)
- **no control characters** — newline/control-character bytes are rejected
- **length cap** — paths longer than 512 characters are rejected
- the file must exist and be a regular file

The path is supplied by the user via a **dropdown of files** discovered by
`list_real_files` (below) — there is no raw command textbox. Even a hand-supplied
path passes the same strict validation. The validated relative path is the only
process argument that varies; the program, module, and `--check` flag are fixed.

## Rejected input and path handling

Rust rejects:

- unknown action IDs
- missing or false approval acknowledgement
- a workspace-file action with no `relativePath`
- absolute target paths
- parent-directory traversal
- non-`.real` extensions (input or resolved)
- control characters or over-length paths
- a missing or non-file target
- a target whose canonical path escapes the canonical workspace root, including a
  symlink that resolves outside the workspace
- an unresolved or unhealthy workspace/Python environment

## File discovery (`list_real_files`)

A separate read-only IPC command lists workspace `.real` files:

- scans only inside the resolved, canonicalized workspace root
- returns workspace-relative, forward-slash paths
- **excludes** hidden directories and `.git`, `.venv`, `node_modules`, `target`,
  `dist`, `build`, `__pycache__`, `.realforge`, and other cache/vendor dirs
- **never follows symlinks** (file or directory) — no escape, no loops
- caps the file count (500) and traversal depth (12); marks `truncated`
- returns `.real` files only; no writes, no shell, no network, structured errors

## Process and shell avoidance

Rust uses `std::process::Command` with the resolved Python executable and fixed
`.arg()` values. It does not use a shell, shell plugin, `sh -c`, `cmd.exe /c`, or
string command parsing.

The process receives a minimal allowlisted environment. Sensitive provider and
cloud credential variables are not forwarded. `PYTHONDONTWRITEBYTECODE=1` and
`PYTHONNOUSERSITE=1` prevent bytecode writes and user-site imports.

## Resource limits and output

The action has a fixed timeout and independent stdout/stderr byte caps. Timeout,
spawn failure, invalid UTF-8, and excess output return structured bridge errors.
The result records the fixed command summary, exit code, duration, capped output,
workspace path, and PASS/FAIL state.

All process output is inert and marked `UNTRUSTED`. It is never interpreted as a
command, patch, approval, or follow-up action.

## Session-only audit boundary (0.19)

The frontend records completed, explicitly approved attempts in an in-memory audit
list. Success, compiler failure, timeout, rejection, and unavailable outcomes are
normalized for display. Each entry stores only a generic `Selected workspace`
indicator, the fixed or validated relative `.real` target, a locally reconstructed
command summary, exit code when available, duration, and independently capped
stdout/stderr previews. Output remains untrusted and collapsed by default.

The audit model does not store an absolute workspace path, environment variables,
provider credentials, or full process output. Safe-copy summaries omit stdout and
stderr entirely. The list is capped and disappears when the frontend session ends.
It is not persisted to the repository, workspace, `.realforge`, browser storage, or
Tauri app config.

No audit IPC exists. The execution bridge and its two-action allowlist are unchanged.
Requests blocked before approval, including web-mode and no-file-selected states, do
not become approved-run entries. Persistent audit storage is deferred; any future
implementation must use app-config-only storage, define retention and redaction, and
receive a separate threat review.

## Approval and runtime behavior

The UI shows the exact action, the validated argv preview (with the chosen `.real`
file substituted for the workspace-file action), workspace, no-write/no-network
facts, and untrusted-output warning. For the workspace-file action the file is
chosen from a dropdown; execution is disabled until a file is selected. Execution
remains disabled until the user checks: "I understand this runs a local dry-run/
check command." Empty states (no `.real` files, list error) keep run disabled.

The Rust command independently rejects an unacknowledged request. This boolean
records acknowledgement; the safety boundary remains the fixed read-only Rust
allowlist.

Web mode returns `unsupported_web` and never invokes IPC. Desktop mode requires
healthy workspace bridge resolution. Staff Mode is not required because this is
a normal read-only validation action; staff-only action previews remain gated.

## Rollback and future risk

Rollback is not required because the action has no write path. A future bridge
that writes files, applies patches, mutates Git, installs updates, starts a
scheduler, or runs provider-generated commands requires a separate threat model,
typed request schema, target review, dry-run evidence, rollback design, and
auditable human approval. This threat model does not authorize those capabilities.

### Residual trust boundary

The action executes the selected workspace's resolved Python interpreter and
`reallang.cli` source. The audited 0.12 compiler check path has no write or
network behavior, but the process is not contained by an operating-system
filesystem or network sandbox. A maliciously modified workspace module or Python
interpreter could violate the command metadata. Workspace selection and bridge
health are therefore trust prerequisites, not proof of code integrity. A future
bridge that targets untrusted repositories needs signed/bundled compiler code or
an OS-level sandbox before its no-write/no-network properties can be treated as a
hard security boundary.
