# RealForge self-improvement and experiments

RealForge self-improvement is **experimental**. Version **0.6** added dry-run plans and
untrusted patch display. Version **0.7** added isolated experiment workspaces. Version
**0.8** adds **approval-gated merge proposals** — successful experiments can become
reviewable proposals, but nothing merges automatically. Version **0.9** adds
**permissioned internet research**. Version **1.0** adds **controlled recursive improvement
cycles**. Version **1.1** **hardens proposal integrity** with patch hash chains, validation
mode parity, path-safe apply, scoped commits, and stronger rollback.

RealForge does **not** claim to match or exceed Codex, Claude Code, Cursor, or Mythos yet.
Local models may be used, but **model output is untrusted**.

## What 1.1 adds

- Patch **SHA-256 hash chain** from experiment → proposal → apply; tampered patches are blocked
- **`validation_mode` parity** — apply reruns the same mode that passed in the experiment
- **Path-safe patch targets** — rejects traversal, `.git/`, and `.realforge/` writes from patches
- **`patch_targets`** stored in reports/proposals; used for backup, rollback, and `git add`
- **Non-git dirty checks** via `workspace_content_digest` (no silent skip)
- **Legacy reports/proposals** without 1.1 metadata are rejected
- Clearer status wording:
  - experiment pass **≠** merge
  - proposal created **≠** applied
  - apply passed **≠** committed (unless `--commit`)
- Rollback is stronger than 1.0 but still best-effort where OS/git limits apply
- RealForge still does **not** auto-merge

## What 1.0 adds

- `realforge cycle --area ... --budget 1..3 --dry-run` previews plan + validation steps
- `realforge cycle --patch-file ...` runs isolated experiments and creates pending proposals on success
- `--research-id` attaches saved research snapshots without fetching new URLs
- Cycles do not auto-merge, auto-apply, or commit

See [Cycle (1.0)](realforge-cycle.md).

## What 0.9 adds

- `realforge research --url ... --allow-domain ...` for explicit HTTPS research fetches
- Saved snapshots under `.realforge/research/` with metadata and summaries
- `plan --include-research <id>` attaches citation metadata to planning context
- Research informs plans only; it does not edit files or auto-merge

See [Research (0.9)](realforge-research.md).

## Approval-gated merge proposals (0.8, hardened in 1.1)

RealForge 0.8 turns successful experiments into reviewable merge proposals. Version 1.1
adds patch hash chains, validation mode parity, path-safe targets, scoped commits, and
stronger rollback:

```text
passed ExperimentReport → propose-merge → .realforge/proposals/<id>/patch.diff → show-proposal → apply-proposal --confirm → validate (same mode) → optional --commit (patch targets only)
```

- `proposals.py` validates experiment reports and stores pending proposals
- `apply-proposal` requires `--confirm`, verifies patch hashes, blocks dirty workspaces, and rolls back on failed validation
- Proposal patches are copied into `.realforge/proposals/<id>/patch.diff` with `copied_patch_sha256` metadata
- Changes remain uncommitted by default; `--commit` stages only `patch_targets`
- Proposal JSON and patch files are **security-sensitive** — treat `.realforge/proposals/` like credentials

## What 0.8 adds

```text
passed ExperimentReport → propose-merge → pending proposal → apply-proposal --confirm → validate → optional --commit
```

- `realforge propose-merge --report <experiment_report.json>` — requires `passed=true` and clean main workspace metadata
- `realforge list-proposals` / `realforge show-proposal <id>` — read-only review
- `realforge apply-proposal <id> --confirm` — applies patch to main workspace with backup/rollback
- Post-apply validation reruns the experiment's validation mode (1.1+); failure rolls back patch targets
- `--commit` commits only patch targets after validation passes (1.1+); default leaves changes uncommitted
- Dirty main workspaces are blocked (`.realforge/` metadata is ignored)
- No auto-merge; human `--confirm` is mandatory

## What 0.7 adds

```text
snapshot main workspace → isolated worktree/copy → apply --patch-file → validate → ExperimentReport → cleanup
```

- `realforge experiment --area tests --dry-run` — print plan and validation steps only
- `realforge experiment --area tests --patch-file change.diff` — evaluate a saved unified diff in isolation
- `--validation quick|examples|benchmarks` — validation preset inside the experiment workspace
- `--keep` — preserve the experiment workspace after the run
- `--output report.json` — write structured `ExperimentReport` JSON

Patches are **not** applied from model output directly; save a unified diff to disk first.
No auto-merge exists. Human approval is still required before any main-branch change.

This is the next safety step toward recursive self-improvement: sandboxed evaluation with
validation scoring hooks, rollback via cleanup, and explicit main-workspace integrity checks.

## What 0.6 adds

```text
scan workspace → build improvement context → provider JSON plan → print proposal
                                                      ↘ optional untrusted diff
```

- `realforge improve --dry-run` — default self-improvement proposal mode
- `realforge improve --area <safety|tests|docs|compiler|realforge> --dry-run`
- `realforge improve --area ... --propose-patch --dry-run` — print unified diff only

Improvement areas constrain context selection and the structured plan:

| Area | Focus |
|------|-------|
| `safety` | permissions, workspace boundaries, rollback |
| `tests` | pytest coverage and validation discipline |
| `docs` | RealForge and RealLang documentation accuracy |
| `compiler` | compiler-adjacent improvements without syntax changes |
| `realforge` | agent layer, CLI, providers, context |

## SelfImprovementPlan fields

Provider output is parsed into a structured plan with:

- `title`, `area`, `problem_statement`
- `current_evidence`, `proposed_changes`
- `files_to_inspect`, `files_to_modify`, `tests_to_add`
- `validation_commands`, `risks`, `rollback_plan`, `success_criteria`
- `requires_human_approval`, `confidence`

Invalid provider JSON raises `ProviderPlanError` and stops safely.

## Safety rules (0.6)

- **Plan-only** — no file writes during `improve`
- **No command execution** beyond existing safe read/index operations
- **Model output is untrusted** — plans and patches are proposals for human review
- **Patch proposals are display-only** — RealForge labels them as untrusted and never applies them
- **Human approval is required** for any future apply flow
- **No automatic commits** of model-generated patches

## Recursive improvement (future)

Recursive self-improvement requires additional safeguards beyond 0.7:

- git worktree experiments with stronger sandbox boundaries (0.7 foundation)
- evaluation scoring against tests and benchmarks (0.7 validation presets)
- rollback paths with explicit restore steps (0.7 cleanup + main snapshot checks)
- approval-gated merges after human review (not implemented)

Future milestones may add approval-gated merges and richer scoring. Until then,
treat `realforge improve` as planning-only and `realforge experiment` as isolated
evaluation only.

## Example commands

```bash
realforge improve --dry-run
realforge improve --area tests --dry-run
realforge improve --area realforge --propose-patch --dry-run

realforge experiment --area tests --dry-run
realforge experiment --area tests --patch-file /tmp/change.diff
realforge experiment --area tests --patch-file change.diff --keep --output report.json
realforge propose-merge --report report.json
realforge apply-proposal <proposal_id> --confirm

realforge cycle --area tests --budget 1 --dry-run
realforge cycle --area tests --budget 1 --patch-file change.diff
```

MockProvider returns deterministic plans for tests. Local providers use strict JSON
prompts in `providers/prompts.py`.

## Related documents

- [RealForge overview](realforge.md)
- [Architecture](realforge-architecture.md)
- [Local models](realforge-local-models.md)
