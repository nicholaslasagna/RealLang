# RealForge architecture

RealForge is an experimental local-first AI engineering environment: a
**compiler-guided**, **benchmark-aware**, **repair-loop native**, and
**multimodal-ready** agent platform. RealLang is the first compiler integration;
code, research, creative, image, engine, evaluation, and staff workflows are
capability domains over the same trust architecture.

Current releases are small, test-backed vertical slices that grow incrementally without
rewriting RealLang or requiring cloud endpoints. RealForge 0.3 hardens workspace
trust: boundary enforcement, backup rotation, and post-apply rollback.

RealForge remains experimental and does not claim to outperform Codex, Claude Code,
or Cursor yet.

## Shared capability loop

Every capability domain should plug into the same bounded flow:

```text
context → provider → structured output → validation → sandbox/report
        → staff approval when required → optional apply/update
```

- Provider and research input remains untrusted.
- Generated patches, plans, and future assets remain untrusted until validated.
- Normal flows are read-only or dry-run first.
- Reports are both human-readable and machine-readable where implemented.
- Destructive actions require explicit approval; there is no auto-merge or auto-commit.

## Interaction and capability registry (2.2)

| Module | Role |
|--------|------|
| `capabilities.py` | Capability domains, status, safety level, command, write/staff/network metadata |
| `interaction.py` | Slash-command grammar; no interactive shell or command execution |
| `settings_surface.py` | Read-only effective settings and `PASS`/`WARN`/`BLOCKED` sanity checks |

These modules expose dataclasses to terminal formatters and JSON output so a
future GUI or TUI can use the same report data without weakening safety gates.

## Creative and engine-aware planning (2.1)

RealForge 2.1 adds a planning-only creative layer:

```text
task → local provider strict JSON → validated creative artifact → print or explicit metadata write
project path → bounded filesystem scan → EngineProjectProfile → dry-run UnrealCommandPlan
image path → workspace check → SHA-256/basic metadata → ImageAnalysisReport
```

| Module | Role |
|--------|------|
| `creative/models.py` | Immutable artifact schemas, strict JSON fields, bounded stores |
| `creative/game_brief.py` | `GameDesignBrief` construction from untrusted provider JSON |
| `creative/map_design.py` | `MapDesignPlan` construction |
| `creative/asset_brief.py` | `AssetBrief` construction |
| `creative/image_report.py` | Metadata/hash-only image reports; no semantic recognition |
| `creative/engine_profile.py` | Read-only Unreal filesystem detection |
| `creative/unreal.py` | Dry-run, approval-required Unreal plans |

The creative layer never executes provider command suggestions, generates
binary assets, opens Unreal, or mutates engine projects. Optional report writes
are limited to `.realforge/creative/` and `.realforge/engines/`.

## Workspace awareness (0.4)

RealForge 0.4 adds deterministic workspace indexing before more autonomous behavior:

```text
scan workspace → symbol table → context bundle → (future) local provider prompt
```

- `index/` scans `.real` files, docs, tests, and benchmarks while ignoring caches and generated outputs
- `symbols.py` extracts conservative text-based symbol tables
- `context_builder.py` assembles bounded context with README/docs priority and explicit safety rules
- `realforge context` prints bundles only; it does not call models or edit files
- index cache writes require explicit `--write` and stay inside the workspace root

## Context-aware planning (0.5)

RealForge 0.5 connects workspace context to the provider interface without autonomous editing:

```text
scan workspace → build context bundle → provider plan JSON → structured AgentPlan → print
```

- `context_builder.py` supplies bounded project context
- `providers/prompts.py` defines the planning contract and expected JSON fields
- `planner.py` parses provider JSON robustly and raises `ProviderPlanError` on invalid output
- `ask`/`plan` never execute `commands_to_run` or modify `files_to_modify`
- MockProvider remains the deterministic CI-safe default; local providers are optional

## Self-improvement proposals (0.6)

RealForge 0.6 adds a **dry-run-only** self-improvement loop:

```text
scan workspace → build improvement context → provider JSON plan → print proposal
                                                      ↘ optional untrusted diff
```

- `self_improve.py` orchestrates area-focused context and provider calls
- `self_improvement_plan.py` defines `SelfImprovementPlan` parsing and formatting
- `improve --dry-run` never writes files or runs validation commands
- `--propose-patch` prints unified diff text labeled as untrusted; RealForge does not apply it
- Recursive improvement still requires sandboxing, scoring, rollback, and human approval (future)

See [Self-improvement (0.6)](realforge-self-improvement.md).

## Isolated experiments (0.7)

RealForge 0.7 evaluates saved unified diffs in temporary workspaces outside the main repo:

```text
snapshot main workspace → create worktree/copy → apply patch → validate → report → cleanup
```

- `experiment.py` orchestrates patch application and validation presets
- `git_utils.py` prefers `git worktree` and falls back to directory copy
- `experiment_report.py` records command results, cleanup, and main-workspace integrity
- `--patch-file` is required for apply mode; model patches must be saved to disk first
- No auto-merge exists; human approval is still required

## Approval-gated merge proposals (0.8)

RealForge 0.8 turns successful experiments into reviewable merge proposals:

```text
passed ExperimentReport → propose-merge → .realforge/proposals/<id>.json → show-proposal → apply-proposal --confirm → validate → optional --commit
```

- `proposals.py` validates experiment reports and stores pending proposals
- `apply-proposal` requires `--confirm`, blocks dirty workspaces, and rolls back on failed validation
- Proposal patches are copied into `.realforge/proposals/` for stable local references
- Changes remain uncommitted by default; `--commit` uses author `Imagicast Studios <reallang@users.noreply.github.com>`

## Permissioned research (0.9)

RealForge 0.9 adds explicit HTTPS research fetches with domain allowlists:

```text
research --url --allow-domain → snapshot + metadata → plan --include-research
```

- `research/` modules validate URLs, enforce size/time limits, and store snapshots locally
- Default network access is off unless `realforge research` is used
- Planning includes summaries and citations, not unbounded raw HTML

See [Research (0.9)](realforge-research.md).

## Command policy and permissions (1.2)

RealForge 1.2 replaces broad `workspace-write` shell access with an explicit **validation command allowlist**:

| Category | Examples | When allowed |
|----------|----------|--------------|
| Validation | pytest, `git diff --check`, `realc --check`, benchmark smoke | `allow_validation_commands=True` during experiments/apply validation |
| Git read-only | `git status`, `git diff`, `git rev-parse` | readonly/manual/workspace-write |
| Patch apply | `git apply`, `patch -p1` | `allow_patch_apply=True` during proposal apply |
| Proposal git | `git add -- <targets>`, `git commit` | `allow_proposal_git_writes=True` during `--commit` |

- **`manual` mode** (formerly `ask`) is review-only; it does **not** prompt interactively
- Provider-generated commands in plans/improvement proposals are **suggestions only**
- Research summaries injected into planning context are labeled **untrusted external content**
- Validation subprocesses strip common secret env vars but still execute **project test/code** (not a sandbox)
- TODO (future): network sandboxing for validation commands

## Proposal integrity hardening (1.1)

RealForge 1.1 strengthens the experiment → proposal → apply trust boundary:

```text
patch SHA-256 at experiment → verify at propose-merge → copy to .realforge/proposals/<id>/patch.diff
  → verify at apply → path-safe targets → backup patch_targets → validate (same mode) → scoped commit
```

- `patch_safety.py` computes hashes, validates targets, and manages rollback backups
- `ExperimentReport` stores `patch_sha256`, `patch_targets`, `validation_mode`, and `workspace_content_digest`
- `MergeProposal` stores `copied_patch_sha256`, `patch_targets`, and `validation_mode`
- Legacy experiment/proposal JSON without 1.1 fields is **rejected** (no silent downgrade)
- Rollback is **stronger than 1.0** but still best-effort where OS/git limitations apply
- RealForge still does **not** auto-merge

## Controlled improvement cycles (1.0)

RealForge 1.0 composes planning, experiments, and proposals into bounded cycles:

```text
cycle --dry-run → plan + validation preview
cycle --patch-file → experiment → propose-merge (pending) → manual apply-proposal --confirm
```

- `cycle.py` orchestrates attempts with budget limits (max 3)
- `cycle_report.py` stores reports under `.realforge/cycles/`
- Cycles never auto-merge, auto-apply, commit, or fetch internet directly
- Saved research snapshots may be attached with `--research-id`

See [Cycle (1.0)](realforge-cycle.md).

## Local provider evaluation (1.3)

RealForge 1.3 adds a read-only **eval harness** for comparing local providers before increasing autonomy:

```text
realforge eval --provider mock --suite smoke|planning|safety|generation
  → rule-based EvalReport (print or --write to .realforge/evals/)
```

| Module | Role |
|--------|------|
| `eval_runner.py` | Suite orchestration, scoring, temp-workspace generation checks |
| `eval_report.py` | `EvalReport` / `EvalTaskResult` JSON and formatters |
| `eval_safety.py` | Unsafe command detection for plan command fields |

- Eval uses `MockProvider` in CI; Ollama/local servers are optional for manual runs
- Safety suite injects adversarial untrusted research text with `RESEARCH_UNTRUSTED_BOUNDARY`
- Generation tasks run `realc --check` only inside `tempfile` directories
- Results are **rule-based and early** — not proof of superiority over frontier tools

See [Eval harness (1.3)](realforge-evals.md).

## Task benchmarks (1.7)

RealForge 1.7 adds durable structured task benchmarks for longitudinal comparison:

```text
realforge bench-tasks --provider mock --suite smoke|planning|generation|safety|self-improve
  → BenchmarkReport (print or --write to .realforge/task_benchmarks/)
```

| Module | Role |
|--------|------|
| `bench_runner.py` | Suite orchestration, rule-based scoring, temp-workspace generation checks |
| `bench_report.py` | `BenchmarkReport` / `BenchmarkTaskResult` JSON and formatters |

- Complements the quicker `realforge eval` harness; includes `realforge_version` in reports
- Results are internal rule-based measurements — not proof of superiority over frontier tools

See [Task benchmarks (1.7)](realforge-task-benchmarks.md).

## Local model leaderboard (1.8)

RealForge 1.8 ranks saved task benchmark reports for local provider comparison:

```text
realforge leaderboard [--suite ...] [--provider ...] [--latest] [--trend]
realforge leaderboard export --output leaderboard.json
```

| Module | Role |
|--------|------|
| `leaderboard.py` | Load/filter/rank reports, trend summaries, empty-state guidance |
| `leaderboard_report.py` | Export metadata JSON with workspace boundary checks |

- Read-only over source files; compares saved RealForge task benchmarks only
- Not proof of superiority over frontier commercial tools

See [Local model leaderboard (1.8)](realforge-leaderboard.md).

## Patch proposals (1.9)

RealForge 1.9 adds task-driven untrusted patch proposals:

```text
realforge propose-patch --task "..." --provider mock --dry-run [--save] [--experiment]
  → PatchProposal validation via patch_safety.py
  → optional isolated experiment (no auto-merge)
```

| Module | Role |
|--------|------|
| `patch_proposal.py` | Orchestration, validation, optional experiment hook |
| `patch_proposal_report.py` | PatchProposal storage schema and writers |

- Dry-run by default; saving is not approval
- Main workspace unchanged; human approval still required for apply

See [Patch proposals (1.9)](realforge-patch-proposals.md).

## Staff scheduler (2.0)

RealForge 2.0 adds bounded staff scheduler jobs:

```text
realforge scheduler-status
realforge scheduler-run [--dry-run]
  → patch proposal → isolated experiment → merge proposal → optional update bundle
```

| Module | Role |
|--------|------|
| `scheduler.py` | Staff-gated bounded job orchestration and benchmark gate |
| `scheduler_report.py` | SchedulerRunReport storage under `.realforge/scheduler_runs/` |

- Not an infinite autonomous loop; capped by `max_runs_per_invocation`
- Never auto-applies or auto-commits

See [Scheduler (2.0)](realforge-scheduler.md).

## Staff improvement channel (1.4)

RealForge 1.4 adds config-gated **staff mode** for a future Improve/Update workflow:

```text
[staff].enabled + [improvement] settings
  → update-check / improve-channel / update-history
  → optional provider eval gate → controlled cycle → pending proposal
```

| Module | Role |
|--------|------|
| `staff.py` | Staff gate checks and `staff-status` formatting |
| `update_channel.py` | `update-check`, `improve-channel` dry-run and patch flows |
| `update_history.py` | Combined cycle/proposal/eval timeline |

- Disabled by default; never enabled silently
- No auto-apply/auto-commit in v1.4
- Does not claim superiority over frontier coding tools

See [Staff mode (1.4)](realforge-staff-mode.md).

## Control flow

```text
model provider → planner → tools → realc diagnostics → repair loop → tests → report
```

### Components

| Layer | Module | Role |
|-------|--------|------|
| Provider | `providers/` | Local model adapters (`MockProvider` today; Ollama / OpenAI-compatible scaffolds) |
| Capabilities | `capabilities.py`, `interaction.py`, `settings_surface.py` | Domain registry and future workbench interaction surfaces (2.2) |
| Planner | `planner.py` | Turn provider output into structured `AgentPlan` steps |
| Self-improve | `self_improve.py`, `self_improvement_plan.py` | Dry-run improvement proposals and optional untrusted patch text |
| Experiment | `experiment.py`, `experiment_report.py`, `git_utils.py` | Isolated patch evaluation and validation reports |
| Proposals | `proposals.py`, `proposal_report.py` | Approval-gated merge proposals and apply/rollback flow |
| Research | `research/` | Permissioned HTTPS fetch, snapshot store, planning summaries |
| Cycle | `cycle.py`, `cycle_report.py` | Bounded recursive improvement orchestration and reports |
| Eval | `eval_runner.py`, `eval_report.py`, `eval_safety.py` | Local provider quality harness (read-only; rule-based scoring) |
| Task benchmarks | `bench_runner.py`, `bench_report.py` | Repeatable task benchmarks with version tracking (1.7) |
| Creative planning | `creative/` | Structured game/map/asset plans, image metadata, and Unreal dry-run plans (2.1) |
| Staff | `staff.py`, `update_channel.py`, `update_history.py` | Staff-only improvement/update channel (config-gated; 1.4) |
| Agent loop | `agent_loop.py` | `plan-only` or `repair-loop` modes; no auto-edit unless permitted |
| Tools | `runner.py`, `index/` | Shell execution (realc, future pytest/benchmarks), workspace scan, symbols, context |
| Diagnostics | `diagnostics_parser.py` | Parse `REAL_*_ERROR[Exxx]` blocks from `realc --check` stderr |
| Repair | `repair_rules.py`, `patcher.py` | Conservative rule-based fixes; backup before writes |
| Safety | `permissions.py`, `command_policy.py`, `patch_safety.py` | Permission modes; validation allowlist; patch integrity |
| Memory | `memory.py` | Session notes for multi-step loops (v0.1 in-process only) |
| Report | `report.py`, `doctor.py` | Human-readable summaries and environment checks |

## Agent modes (v0.1)

### Plan-only

Used by `realforge ask`. The provider returns a deterministic plan. RealForge does
not edit files or run destructive commands.

### Repair loop

Used internally and by `realforge repair`. Flow:

1. Run `realc --check` on a `.real` file.
2. Parse diagnostics.
3. Apply only proven-safe repairs (currently E203 let→var).
4. On `--apply`, write through `patcher.py` with rotated backup.
5. Rerun `realc --check` and report outcome.
6. If recheck fails, restore the backup by default (unless `--keep-failed-repair`).

## Permission model

| Mode | Shell | File writes |
|------|-------|-------------|
| `readonly` | allowlisted read/check commands only | blocked |
| `manual` | same as readonly (no interactive prompt) | blocked |
| `workspace-write` | allowlisted validation/patch/git commands only | allowed inside workspace root |

CLI `--apply` requires `workspace-write` mode and a target path inside the workspace root.
Explicit `--apply` does not bypass workspace boundaries.

## Subprocess boundary

RealForge never imports RealLang compiler modules for checking. All compiler feedback
goes through:

```bash
realc <file.real> --check
```

This keeps RealForge decoupled and validates that RealLang diagnostics are
agent-ready.

## Future work (not in 0.1)

- Wire Ollama and OpenAI-compatible local providers into the planner
- Multi-file repair sessions with `index/` symbol awareness
- Pytest and benchmark harness integration through `runner.py`
- Persistent memory and session replay
