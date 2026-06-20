# RealForge self-improvement and experiments

RealForge self-improvement is **experimental**. Version **0.6** added dry-run plans and
untrusted patch display. Version **0.7** adds **isolated experiment workspaces** that
apply saved patch files and run validation without modifying the main working tree.

RealForge does **not** claim to match or exceed Codex, Claude Code, Cursor, or
Mythos yet. Local models may be used, but **model output is untrusted**.

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
```

MockProvider returns deterministic plans for tests. Local providers use strict JSON
prompts in `providers/prompts.py`.

## Related documents

- [RealForge overview](realforge.md)
- [Architecture](realforge-architecture.md)
- [Local models](realforge-local-models.md)
