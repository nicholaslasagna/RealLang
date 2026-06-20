# RealForge local model leaderboard (1.8)

RealForge 1.8 adds a **local model leaderboard** built from saved task benchmark reports under `.realforge/task_benchmarks/`.

The leaderboard compares **saved RealForge task benchmark reports** only. Scores are internal, rule-based measurements — **not scientific proof** of superiority over Codex, Claude Code, Cursor, Mythos, or other frontier commercial tools.

It is intended for **local provider selection** and **longitudinal tracking** across RealForge versions. Provider output remains **untrusted**.

## Prerequisites

Create benchmark reports first:

```bash
realforge bench-tasks --provider mock --suite all --write
realforge bench-tasks --provider ollama --suite planning --write
```

Reports are written only with `--write`. The main workspace is not modified during benchmarks.

## Commands

```bash
realforge leaderboard
realforge leaderboard --suite planning
realforge leaderboard --suite generation
realforge leaderboard --suite safety
realforge leaderboard --suite self-improve
realforge leaderboard --provider mock
realforge leaderboard --realforge-version 1.7.0
realforge leaderboard --latest
realforge leaderboard --trend
realforge leaderboard export --output leaderboard.json
```

All leaderboard commands are **read-only** with respect to source files. Export writes metadata JSON inside the workspace boundary.

## Ranking

Default ranking (highest first):

1. `normalized_score` descending
2. Fewer `safety_failures`
3. Newer `started_at`
4. Shorter `duration_ms` (weak final tie-breaker)

Each row includes:

- `rank`, `provider`, `provider_model`, `suite`
- `normalized_score`, `passed`, `safety_failures`
- `realforge_version`, `report_id`, `started_at`

## Filters

| Flag | Effect |
|------|--------|
| `--suite` | Limit to one benchmark suite |
| `--provider` | Limit to one provider name |
| `--realforge-version` | Limit to reports from a specific RealForge version |
| `--latest` | Keep only the newest report per provider/model/suite |
| `--trend` | Group by provider/model/suite and show score history summary |

## Trend mode

`--trend` groups saved reports and shows:

- report count
- latest score, best score, first score
- score delta from first to latest report

Useful for tracking improvement after RealForge or provider changes.

## Export

```bash
realforge leaderboard export --output .realforge/leaderboard.json
```

Export JSON contains **metadata only** (rankings or trend summaries). It does not include raw provider outputs unless those were already stored in source benchmark reports and explicitly requested in a future flag.

## Relationship to eval and bench-tasks

| Command | Purpose |
|---------|---------|
| `realforge eval` | Quick provider sanity checks |
| `realforge bench-tasks` | Durable structured task benchmarks |
| `realforge leaderboard` | Compare saved benchmark reports over time |
| `realforge skill-bench` | Broad cross-domain skill benchmarks (2.7) |

Use **eval** for wiring checks. Use **bench-tasks** to produce comparable reports. Use **leaderboard** to rank and track those reports.

The leaderboard ranks **`bench-tasks`** reports only. RealForge 2.7's
[`skill-bench`](realforge-skill-benchmarks.md) writes its cross-domain reports to a
separate store (`.realforge/skill_benchmarks/`) and does not change the existing
leaderboard; a dedicated cross-domain leaderboard view is deferred to a future release.

## Safety

- Read-only over repository source files
- Malformed benchmark JSON is skipped with a warning (does not crash)
- Does not require live local model servers
- Does not fetch live internet
- Does not compare against frontier commercial tools as a superiority claim

See also [Task benchmarks (1.7)](realforge-task-benchmarks.md) and [RealForge evals](realforge-evals.md).
