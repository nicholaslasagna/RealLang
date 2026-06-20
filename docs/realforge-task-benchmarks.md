# RealForge task benchmarks (1.7)

RealForge 1.7 adds a **repeatable task benchmark suite** for measuring local provider behavior and RealForge orchestration on fixed tasks over time.

These are **internal, rule-based measurements** — not scientific proof of superiority over Codex, Claude Code, Cursor, Mythos, or other frontier tools.

## Commands

```bash
realforge bench-tasks --provider mock --suite smoke
realforge bench-tasks --provider mock --suite planning
realforge bench-tasks --provider mock --suite generation
realforge bench-tasks --provider mock --suite safety
realforge bench-tasks --provider mock --suite self-improve
realforge bench-tasks --provider mock --suite all --write
realforge bench-task-list
realforge bench-task-show <benchmark_id>
```

- Default suite: **smoke**
- Default provider: **mock** (CI-safe; no Ollama required)
- `--write` stores reports under `.realforge/task_benchmarks/` (gitignored)
- Without `--write`, results print only

## Suites

| Suite | Tasks | Focus |
|-------|-------|-------|
| `smoke` | 4 cross-suite samples | Quick regression signal |
| `planning` | 4 planning prompts | Schema, files, validation, risks, permissions |
| `generation` | 4 RealLang generation prompts | `realc --check` in temp dirs, supported syntax |
| `safety` | 4 adversarial prompts | Unsafe commands, paths, approval gates |
| `self-improve` | 3 improvement areas | `SelfImprovementPlan` schema and allowlisted validation |
| `all` | All tasks above | Full benchmark run |

## Benchmark report fields

Reports include:

- `realforge_version` — RealForge version at run time (for longitudinal comparison)
- `provider` / `provider_model`
- `total_score`, `normalized_score` (0.0–1.0)
- `passed`, `safety_failures`, `generated_artifacts_count`
- Per-task `checks` map with transparent rule-based scoring

## Relationship to `realforge eval`

| | `realforge eval` | `realforge bench-tasks` |
|--|------------------|-------------------------|
| Purpose | Quick provider sanity checks | Durable task benchmarks |
| Scope | Smaller harness (1.3) | Structured suites for tracking over time |
| Version tracking | Provider-focused | Includes `realforge_version` |
| Storage | `.realforge/evals/` | `.realforge/task_benchmarks/` |

Use **eval** for fast wiring checks. Use **bench-tasks** when comparing local providers and RealForge versions across releases.

## Safety

- Does **not** modify the main workspace
- Uses temp directories for generation/`realc --check`
- Does **not** fetch live internet in tests
- Provider output remains **untrusted**
- Does **not** auto-apply, auto-merge, or commit

## Interpreting results

Pass threshold per task: **60% of max_score**. Reports are rule-based and early — useful for tracking RealForge/local-model progress, not for claiming frontier superiority.

See also [RealForge evals](realforge-evals.md) and [RealForge](realforge.md).
