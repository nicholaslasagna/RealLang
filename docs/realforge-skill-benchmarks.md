# RealForge skill benchmarks (2.7)

RealForge 2.7 adds a **general agent skill benchmark suite**: a broad, cross-domain
benchmark that exercises RealForge/provider behavior across every major capability
domain in one run.

These are **internal, rule-based measurements** — not scientific proof of superiority
over Codex, Claude Code, Cursor, Mythos, GPT-5.5, or any other frontier system. They
exist to compare **local providers** and **RealForge versions** across domains, and to
provide the foundation for future local-model tournaments.

The main workspace is never mutated. Provider output remains **untrusted**. Image,
vision, engine, and asset tasks run entirely inside ephemeral temp directories and
generate **no binary images or assets**; no Unreal, Blender, image model, or vision
model is required.

## Commands

```bash
realforge skill-bench --provider mock --suite smoke
realforge skill-bench --provider mock --suite all
realforge skill-bench --provider mock --suite code
realforge skill-bench --provider mock --suite docs
realforge skill-bench --provider mock --suite research
realforge skill-bench --provider mock --suite creative
realforge skill-bench --provider mock --suite image
realforge skill-bench --provider mock --suite vision
realforge skill-bench --provider mock --suite engine
realforge skill-bench --provider mock --suite asset
realforge skill-bench --provider mock --suite safety
realforge skill-bench --provider mock --suite self-improve
realforge skill-bench-list
realforge skill-bench-show <id>
```

- Default suite: **smoke**
- Default provider: **mock** (CI-safe; no Ollama, Unreal, Blender, image, or vision model required)
- `--write` stores reports under `.realforge/skill_benchmarks/` (gitignored)
- Without `--write`, results print only and nothing is stored

## Domains

| Suite | Tasks | Focus |
|-------|-------|-------|
| `code` | 3 | RealLang generation (`realc --check` in temp dirs), diagnostic-repair planning, safe dry-run patch proposal |
| `docs` | 2 | README/status update planning, structured doc improvement plan |
| `research` | 2 | Saved/mock research summary boundary, adversarial-instruction resistance; no live fetch |
| `creative` | 3 | `GameDesignBrief`, `MapDesignPlan`, `AssetBrief` |
| `image` | 3 | `ImageGenerationJob`, `PromptPack`, metadata-only `ImageReferenceBoard` from temp images |
| `vision` | 3 | `ImageUnderstandingReport`, `ImageComparisonReport`, `ImageToAssetBriefReport` |
| `engine` | 3 | Fake Unreal project scan, `UnrealCommandPlan`, `EnginePipelineReport` |
| `asset` | 3 | `AssetPipelinePlan`, `BlenderAssetPlan`, `UnrealAssetImportPlan` |
| `safety` | 4 | Adversarial research, unsafe command detection, approval-gate preservation, path-traversal rejection |
| `self-improve` | 2 | `SelfImprovementPlan` with human approval, risks, rollback, allowlisted validation |
| `smoke` | 6 | One representative task across several domains for a quick signal |
| `all` | every domain | Full cross-domain run |

## Report schema

`SkillBenchmarkReport`:

- `id`, `created_at`, `realforge_version`
- `provider`, `provider_model` (optional)
- `suite`
- `task_results`
- `total_score`, `normalized_score`, `passed`
- `safety_failures`
- `domain_scores` — normalized score per domain
- `duration_ms`
- `notes`

`SkillTaskResult`:

- `task_id`, `suite`, `domain`
- `prompt`, `expected_behavior`
- `output_summary`
- `schema_valid`, `checks`
- `score`, `max_score`
- `safety_flags`
- `artifacts_created` — ephemeral temp artifacts created (always inside temp dirs)
- `notes`

## Scoring

Scoring is **rule-based and transparent**. Each task aggregates a small set of
weighted boolean checks into a `0–100` score; the report normalizes across tasks and
reports a per-domain breakdown. A task fails when its normalized score falls below
`0.6` or when it raises a safety flag; any safety flag also fails the whole report.

This is **not** a scientific measurement. The deterministic `MockProvider` scores high
but **not necessarily perfectly**: vision tasks, for example, are honestly penalized
because the mock performs no semantic image recognition — only a real configured vision
provider earns the semantic-analysis check. Safety tasks are designed so that an
intentionally unsafe provider is detected and fails the suite.

## Relationship to other benchmarks

- `eval` stays the quick provider sanity check (1.3).
- `bench-tasks` stays the durable, longitudinal task benchmark (1.7).
- `leaderboard` ranks saved `bench-tasks` reports (1.8).
- `skill-bench` is the broader **cross-domain** benchmark introduced in 2.7.

Skill-benchmark reports are stored separately under `.realforge/skill_benchmarks/`
and do not affect the existing leaderboard. A dedicated cross-domain leaderboard view
is deferred to a future release.

## Safety boundaries

- No command execution, auto-apply, auto-merge, or auto-commit.
- No live internet access; research tasks use saved/mock summaries only.
- No Unreal, Blender, image, or vision model dependency.
- Fake images and fake engine projects are created in temp directories.
- No binary images or assets are generated; no main workspace file is modified.
- Provider output, generated plans, patches, and assets remain untrusted until validated.
