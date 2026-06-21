# Read-only security scan bridge — threat model (0.14)

The security scan bridge lets the desktop Workbench run a **fixed allowlist of
read-only security/audit commands** and adapt their output into Security Center
evidence. It is a narrow, read-only extension of the existing read-only CLI bridge
and approved-dry-run patterns. It performs **no remediation** and modifies nothing.

## Allowed source IDs and exact fixed argv

| Source ID | Program | Fixed argv | cwd | Output | Network |
|-----------|---------|------------|-----|--------|---------|
| `npm-audit-json` | `npm` | `["audit", "--json"]` | `workbench/` | JSON | **may query the npm registry** |
| `cargo-tree` | `cargo` | `["tree"]` | `workbench/src-tauri/` | text | local (cold cache may fetch the index) |
| `cargo-tree-glib` | `cargo` | `["tree", "-i", "glib", "--target", "x86_64-unknown-linux-gnu"]` | `workbench/src-tauri/` | text | local (cold cache may fetch the index) |

The frontend may pass only a **source ID**. The program, argv, and cwd are fixed in
Rust (`src-tauri/src/bridge/security_scan.rs`). `cargo-audit`, `npm outdated`,
`cargo update`, and anything that mutates a lockfile or source file are **deferred**
and not present.

## Rejected inputs

- Unknown / non-allowlisted source ID → `unknown_scan_source`.
- Any source whose program is not in `{npm, cargo}` → rejected by `is_scan_source_valid`.
- Any source whose argv contains an install/update/fix/mutating token
  (`install`, `ci`, `update`, `add`, `remove`, `fix`, `--fix`, `publish`, `run`,
  `exec`, `config`, `cache`, `generate-lockfile`, …) → rejected.
- Arbitrary args, command strings, flags, packages, or paths from the UI → **not
  accepted at all**; the IPC takes only `sourceId: String`.

## No shell, no arbitrary args

- Execution uses `std::process::Command` with a fixed argument array — **never a
  shell**, never string interpolation, no `tauri-plugin-shell`.
- The argv arrays are compile-time `&'static [&'static str]` constants.

## Timeout and output caps

- Timeout: **60 s** (`SCAN_TIMEOUT_MS`); on timeout the child is killed.
- stdout cap: **1 MiB**; stderr cap: **64 KiB**. Output beyond the cap is
  truncated (flagged `stdoutTruncated`), never grown unbounded.
- Pipes are drained on reader threads to avoid pipe-buffer deadlock.

## Environment handling

- `env_clear()` then a minimal read-only passthrough allowlist: `PATH`, `HOME`,
  `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `SYSTEMROOT`, `WINDIR`, `TEMP`, `TMP`,
  `CARGO_HOME`, `RUSTUP_HOME`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`.
- Fixed `LANG=C.UTF-8`, `NO_COLOR=1`, `CI=1`. `stdin` is `/dev/null`.

## Workspace requirements

- Requires a resolved repository root with `workbench/package.json`; otherwise
  `workspace_not_ready`. The scan cwd (`workbench/` or `workbench/src-tauri/`) must
  exist. The frontend additionally gates **Run scan** on desktop runtime + bridge
  health being ready.

## Output is untrusted

- Every result is marked `untrusted: true` with labels `UNTRUSTED`,
  `READ-ONLY SCAN`, `NO WRITES`, `NO REMEDIATION`.
- Mapped findings (`npm audit` → `SecurityFinding`) keep `trustedSource: false` and
  `needsHumanReview: true`. `cargo tree` output is **dependency-path evidence, not
  vulnerability truth**, and never resolves an advisory (glib stays blocked).
- `npm audit` exits non-zero when vulnerabilities exist; that is expected and is
  **not** treated as a bridge error — the exit code and output are reported as-is.

## No writes, no remediation

- No command writes files, modifies a lockfile/manifest, installs, updates, fixes,
  applies a patch/proposal, runs the scheduler, installs an update, commits, or
  merges. Remediation stays **preview-only** (`buildFixPlan`).

## Web-mode refusal

- In web mode, `runSecurityScanSource` returns `unsupported_web` — the browser
  never executes a command and never makes a `fetch`. The UI shows the command for
  manual terminal use only.

## Network honesty

- `npm audit` queries the npm registry advisory database, so it is marked
  `requiresNetwork: true` / `networkUsed: true` and the UI shows a **MAY REQUIRE
  NETWORK** warning even though the product posture is NETWORK OFF. This is shown
  honestly rather than pretending the scan is local-only.

## Future risks (for a later auto-fix bridge)

A future remediation bridge (`npm audit fix`, `cargo update -p …`, dependency PRs)
would write lockfiles/manifests and must be a **separate, threat-modeled,
approval-gated** milestone with: explicit per-change approval, dry-run + diff
preview first, validation commands, rollback, no auto-merge/auto-commit, and no
arbitrary package/version input. It is **out of scope** for 0.14.
