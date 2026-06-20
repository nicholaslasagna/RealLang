# RealForge self-improvement (0.6)

RealForge self-improvement is **experimental**. Version **0.6 is dry-run only**:
RealForge can inspect its own repository, propose a focused improvement plan, and
optionally print an untrusted patch diff. It does **not** modify files, apply
patches, or run validation commands automatically.

RealForge does **not** claim to match or exceed Codex, Claude Code, Cursor, or
Mythos yet. Local models may be used, but **model output is untrusted**.

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

Recursive self-improvement requires additional safeguards not present in 0.6:

- sandboxing (for example git worktree experiments)
- validation scoring against tests and benchmarks
- rollback paths with explicit restore steps
- approval-gated merges after human review

Future milestones may add evaluation scoring and approval-gated merges. Until then,
treat `realforge improve` as a planning aid only.

## Example commands

```bash
realforge improve --dry-run
realforge improve --area tests --dry-run
realforge improve --area realforge --propose-patch --dry-run
```

MockProvider returns deterministic plans for tests. Local providers use strict JSON
prompts in `providers/prompts.py`.

## Related documents

- [RealForge overview](realforge.md)
- [Architecture](realforge-architecture.md)
- [Local models](realforge-local-models.md)
