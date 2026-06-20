# RealForge cycle (1.0)

RealForge 1.0 adds a **controlled recursive improvement cycle** that composes existing
safety-gated capabilities into one orchestration command. Cycles are **bounded**, do not
auto-merge, and still require explicit human approval before any main-workspace apply.

RealForge does **not** claim to match or exceed Codex, Claude Code, Cursor, or Mythos yet.
This is a **local-first agent architecture**, not a frontier-model superiority claim.

## What 1.0 adds

```text
improve plan → (optional saved research) → isolated experiment → merge proposal → human apply
```

Commands:

- `realforge cycle --area tests --budget 1 --dry-run`
- `realforge cycle --area tests --budget 1 --patch-file change.diff`
- `realforge cycle --area docs --budget 1 --research-id <id> --patch-file change.diff`
- `realforge cycle-list`
- `realforge cycle-show <cycle_id>`

## Cycle behavior

### Dry-run

- Builds a self-improvement plan for the selected area
- Prints proposed validation steps
- Optionally includes saved research summaries (`--research-id`)
- Does **not** create experiments, proposals, or source-file edits
- Does **not** fetch internet resources

### Patch mode

- Runs an isolated experiment using the provided unified diff
- If the experiment passes, creates a **pending merge proposal**
- If the experiment fails, records failure details in a cycle report
- Does **not** apply proposals to the main workspace
- Does **not** commit changes
- Prints next manual commands:
  - `realforge show-proposal <id>`
  - `realforge apply-proposal <id> --confirm`

## Budget

- `--budget` is the maximum number of cycle attempts (1, 2, or 3)
- Budgets above 3 are rejected in v1.0
- Each attempt creates a `CycleAttempt` record inside the cycle report

## Storage

Cycle reports are saved under:

```text
.realforge/cycles/<cycle_id>.json
.realforge/cycles/<cycle_id>/attempt_<n>_experiment.json
```

The `.realforge/cycles/` directory is gitignored by default.

## Safety

- Cycles compose existing experiment and proposal systems; they do not bypass them
- No auto-merge, no auto-apply, no commits
- No direct internet fetch during `cycle` (research must be saved first via `realforge research`)
- Main workspace source files are snapshotted before/after; unexpected changes fail the cycle
- Model output remains untrusted; human `--confirm` is still required to apply proposals

## Example workflow

```bash
realforge improve --area tests --dry-run
realforge research --url https://example.com/docs --allow-domain example.com
realforge cycle --area tests --budget 1 --patch-file /tmp/change.diff
realforge show-proposal <proposal_id>
realforge apply-proposal <proposal_id> --confirm
```

## Related documents

- [Self-improvement](realforge-self-improvement.md)
- [Research (0.9)](realforge-research.md)
- [Architecture](realforge-architecture.md)
