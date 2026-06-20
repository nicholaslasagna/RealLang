# RealForge scheduler (2.0)

RealForge 2.0 adds a **staff-only recurring improvement scheduler foundation**. This is the safe CLI/config backend for a future staff-only **Improve / Update** button.

The scheduler is **not an infinite autonomous loop**. It is bounded by configuration, produces proposals and update bundles, and **never auto-applies or auto-commits**.

RealForge does not claim to outperform Codex, Claude Code, Cursor, Mythos, or other frontier tools.

## Configuration

Add to `.realforge.toml`:

```toml
[staff]
enabled = true

[scheduler]
enabled = false
mode = "manual"                 # manual | recurring
max_runs_per_invocation = 1     # 1 to 3
areas = ["tests", "docs", "realforge"]
provider = "mock"
require_leaderboard_pass = true
minimum_benchmark_score = 0.75
create_update_bundle = true
auto_apply = false              # unsupported/refused in 2.0
auto_commit = false             # unsupported/refused in 2.0
```

Rules:

- Scheduler commands are **staff-only** (`[staff].enabled = true`).
- `[scheduler].enabled = false` refuses run commands; `scheduler-status`, `scheduler-list`, and `scheduler-show` still work.
- `auto_apply` and `auto_commit` are **unsupported/refused** even if set `true`.
- `max_runs_per_invocation` is capped at **3**.
- No infinite loops.

## Commands

```bash
realforge scheduler-status
realforge scheduler-run --dry-run
realforge scheduler-run
realforge scheduler-list
realforge scheduler-show <run_id>
```

## scheduler-run flow

For each selected area (up to `max_runs_per_invocation`):

1. Improvement plan (read-only)
2. Provider patch proposal (untrusted; saved under `.realforge/patch_proposals/`)
3. Isolated experiment
4. Merge proposal if experiment passes
5. Update bundle if `create_update_bundle = true`

The scheduler **stops before apply**. Human approval remains required through `apply-proposal --confirm`.

## Benchmark gate

When `require_leaderboard_pass = true`, the scheduler checks saved task benchmark reports for the configured `provider` against `minimum_benchmark_score`.

Create benchmarks first:

```bash
realforge bench-tasks --provider mock --suite all --write
realforge leaderboard
```

## SchedulerRunReport

Reports are stored under `.realforge/scheduler_runs/<id>.json` (gitignored).

Fields include:

- provider, areas, dry_run, benchmark gate results
- per-area results (patch proposal, experiment, proposal, bundle IDs)
- proposals/update bundles/experiments created
- `main_workspace_modified` (must remain false)
- `stopped_reason`, `next_steps`, `safety_notes`

## Safety

- Staff-only; scheduler never enables itself
- Main workspace source snapshot before/after each run
- Patch proposals remain untrusted
- Experiments run in isolated workspaces only
- Proposal/update bundle integrity systems remain the source of truth
- No automatic internet fetch in 2.0

See also [Staff mode](realforge-staff-mode.md), [Patch proposals (1.9)](realforge-patch-proposals.md), and [Update bundles](realforge-update-bundles.md).
