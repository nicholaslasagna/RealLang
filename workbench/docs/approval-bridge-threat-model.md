# Workbench 0.12 approval bridge threat model

## Decision

Workbench 0.12 permits exactly one approval-gated desktop action:

- Action ID: `realc-check-hello-example`
- Display command: `realc examples/hello.real --check`
- Process: the resolved workspace Python interpreter
- Fixed argv: `-m reallang.cli examples/hello.real --check`
- Working directory: the validated RealForge repository root

The existing `reallang.cli` check branch reads, lexes, parses, and typechecks the
source file. It does not emit C and does not select an output path. The action
does not call a provider or require network access.

This is a read-only validation bridge, not a write bridge.

## Action boundary

The Rust allowlist contains one approved dry-run action. The frontend sends only
the fixed action ID and an approval acknowledgement boolean. Rust selects the
module, argv, and fixed file path. Browser text, displayed argv, workspace files,
and provider output cannot add or replace process arguments.

No repair, patch, proposal, scheduler, benchmark, update, Git, commit, merge, or
provider action is present in this allowlist.

## Allowed input

The only accepted input is:

- `approvalAcknowledged: true`

There is no file path, command string, argument array, environment map, timeout,
output limit, working directory, provider, or network input.

## Rejected input and path handling

Rust rejects:

- unknown action IDs
- missing or false approval acknowledgement
- absolute target paths
- parent-directory traversal
- a missing or non-file target
- a target whose canonical path escapes the canonical workspace root, including
  a fixed-path symlink that resolves outside the workspace
- an unresolved or unhealthy workspace/Python environment

The 0.12 UI does not offer file selection. Arbitrary workspace-relative paths
remain deferred until a separate path-input review.

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

## Approval and runtime behavior

The UI shows the exact action, fixed argv preview, workspace, no-write/no-network
facts, and untrusted-output warning. Execution remains disabled until the user
checks: "I understand this runs a local dry-run/check command."

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
