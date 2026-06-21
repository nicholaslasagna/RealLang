# Approval audit persistence threat model (0.20)

## Decision

Workbench 0.20 persists a sanitized history of approved dry-run checks in the
Tauri application config directory. Persistence is desktop-only, optional in the
sense that clearing the file returns the app to an empty history, and does not
change which actions may execute.

The persistence bridge has three fixed operations: load, replace, and clear one
fixed file. It is not a general file-write bridge. It accepts no path, workspace,
command, argument, environment, provider, network, patch, or update input.

## Storage boundary

- Fixed filename: `approval-audit-log.json`.
- Parent: Tauri's `app_config_dir()` for identifier `dev.reallang.workbench`.
- The frontend cannot choose or submit a storage path.
- The selected repository, workspace, `.realforge`, source tree, and current
  working directory are never used to resolve the audit file.
- Parent directories and a fixed temporary replacement file are created only
  under the resolved app-config directory.
- No shell, network request, provider call, or subprocess participates in audit
  persistence.

Tauri resolves platform locations. Typical roots are:

- macOS: `~/Library/Application Support/dev.reallang.workbench/`
- Windows: the user's roaming application-data directory under
  `dev.reallang.workbench\`
- Linux: `$XDG_CONFIG_HOME/dev.reallang.workbench/` or the platform config
  fallback

These are descriptive examples. The application does not construct these paths
in frontend code and does not copy the absolute path into an audit entry.

## Persisted schema

The file is a strict JSON object:

```json
{
  "version": 1,
  "savedAt": "unix-seconds",
  "entries": []
}
```

At most 50 newest entries are retained. The encoded file must not exceed 128 KiB.
The reader checks file metadata before reading or parsing. The writer validates
and canonicalizes every entry, rechecks the encoded size, and replaces only the
fixed audit file.

Allowed entry data:

- generated audit ID and timestamp, each length- and character-constrained
- one of the two approved action IDs and its canonical title
- canonical target kind and a sanitized workspace-relative `.real` path
- generic workspace label (`Selected workspace`), never a workspace path
- command summary reconstructed from the approved action and relative target
- explicit-checkbox acknowledgement kind
- normalized status and constrained error code
- exit code and bounded duration
- boolean truncation indicators
- fixed trust/safety values and fixed bridge source

## Data that must never be persisted

- absolute workspace, repository, home, app-config, or executable paths
- environment variables or environment maps
- provider names when they identify credentials, provider API keys, tokens,
  passwords, cookies, authorization headers, or other secrets
- full stdout or stderr
- stdout/stderr preview bodies, even when capped
- provider/model output, prompts, patches, source contents, or report payloads
- arbitrary command strings, argv arrays, working directories, or shell text

The 0.19 frontend may show up to 2,048 characters per stdout/stderr preview during
the current session. Before desktop persistence, those preview bodies are removed.
Only truncation/omission indicators survive. This is stricter than keyword
redaction because arbitrary compiler output cannot be proven secret-free.

## Redaction and path rules

The frontend strips preview bodies before IPC. Rust independently ignores any
preview body supplied by a modified client and reconstructs canonical fields.
Entries are dropped when they violate fixed trust booleans, source,
acknowledgement, action/target pairing, field lengths, character rules, or the
relative `.real` path policy.

Relative paths are normalized to forward slashes and rejected when empty,
over-length, absolute, drive-prefixed, control-containing, traversal-bearing, or
not `.real`. The fixed example always persists as `examples/hello.real`.

## Corruption, size, and deletion

- A missing file loads as an empty version-1 log without warning.
- Invalid JSON, an unsupported schema version, or a file above 128 KiB loads as
  an empty log with a structured warning. It is never interpreted or executed.
- Individually invalid entries are dropped; valid entries may still load.
- Saving writes a sanitized complete replacement, not an unbounded append.
- **Clear audit history** requires frontend confirmation and removes only the
  fixed app-config audit file. The in-memory list clears only after desktop
  deletion succeeds.
- No automatic retention beyond the newest-50 cap exists. Entries remain until
  displaced by newer entries or explicitly cleared.

## Privacy and tamper limitations

Even sanitized metadata can reveal activity times, relative filenames, action
outcomes, and durations to another process or user with access to the same OS
account. Clearing the file does not guarantee secure erasure from filesystem
snapshots, backups, journals, or forensic storage.

Version 1 is not encrypted, signed, chained, or tamper-evident. A local process
with app-config write access can delete or modify the file. Strict parsing and
canonicalization prevent modified content from gaining execution authority, but
they do not prove historical authenticity. Audit entries remain informational and
untrusted.

Future encryption, OS-keystore-backed keys, hash chaining, signed checkpoints,
retention controls, or export require a separate milestone and threat model.

## Web mode

Web preview remains session-only. Load returns an empty session result, save and
clear do not invoke desktop IPC, and no browser storage or network fallback is
used. Reloading web preview clears the log.

## Unchanged execution boundary

This milestone adds app-config persistence only. It does not add or widen approved
commands, arbitrary argv, shell access, patch/proposal apply, scheduler execution,
update installation, Git mutation, auto-fix, commit, merge, or workspace writes.
