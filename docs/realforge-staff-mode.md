# RealForge staff mode (1.4)

RealForge 1.4 adds a **staff-only improvement/update channel** — the backend foundation for a future “Improve / Update” workflow, similar in spirit to a coding-agent update button, but safer and config-gated.

Staff mode is **advanced**, **disabled by default**, and **not exposed to normal users**.

## Configuration

Add to `.realforge.toml`:

```toml
[staff]
enabled = false

[improvement]
channel = "stable"              # stable | experimental
max_budget = 1                  # 1 to 3
require_eval_pass = true
minimum_eval_score = 0.75       # normalized 0.0–1.0 average task score
allow_research = false
allow_patch_proposals = true
auto_apply = false
auto_commit = false
```

### Rules

- If `[staff].enabled` is **false**, staff/update/improvement-channel commands **refuse to run**.
- Normal commands (`check`, `repair`, `plan`, `eval`, etc.) still work without staff mode.
- Staff mode is never enabled silently.
- `auto_apply` and `auto_commit` remain **unsupported in v1.4** (refused even if set to `true`).

## Commands

```bash
realforge staff-status
realforge update-check
realforge improve-channel --area tests --dry-run
realforge improve-channel --area tests --patch-file change.diff
realforge update-history
```

| Command | Staff required | Behavior |
|---------|----------------|----------|
| `staff-status` | No | Read-only status of staff/improvement settings and safety gates |
| `update-check` | Yes | Read-only scan of candidate improvement areas; no edits, experiments, or internet |
| `improve-channel --dry-run` | Yes | Build improvement plan; run provider eval if configured; no experiments |
| `improve-channel --patch-file` | Yes | Enforce config gates → controlled cycle → pending proposal if experiment passes |
| `update-history` | Yes | Read-only timeline of cycle, proposal, and eval records |

## Improvement flow

```text
update-check (read-only opportunities)
  → improve-channel --dry-run (plan + optional eval)
  → improve-channel --patch-file (experiment in isolated workspace)
  → pending proposal
  → manual: show-proposal / apply-proposal --confirm
```

### Config gates (patch flow)

- `budget` must be ≤ `[improvement].max_budget` (hard cap 3)
- If `require_eval_pass`, provider eval must pass and meet `minimum_eval_score`
- If `allow_patch_proposals` is false, patch flow is rejected
- If `allow_research` is false, research IDs are not attached
- Eval suite: `smoke` for `stable` channel, `all` for `experimental`

## Safety

- **No infinite loops** — budget capped at 3
- **No auto-merge** — proposals remain approval-gated
- **No auto-apply / auto-commit in v1.4** — manual `apply-proposal --confirm` required
- **No automatic internet** — research only when explicitly configured and IDs provided
- **Provider output remains untrusted**
- **Main workspace is not edited** during dry-run or update-check

## Interpreting this release

Staff mode is the **foundation** for a future staff-only Improve/Update UX. It does **not**:

- Add a web UI or editor integration
- Enable unrestricted autonomous self-editing
- Prove RealForge is better than Codex, Claude Code, Cursor, Mythos, or other frontier tools

The long-term goal remains a **local-first, self-improving, compiler-guided agent platform** with bounded, evaluated, approval-gated cycles.

See also [RealForge](realforge.md), [cycles](realforge-cycle.md), and [evals](realforge-evals.md).
