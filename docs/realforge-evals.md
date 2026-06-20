# RealForge eval harness (1.3)

RealForge 1.3 adds a **local provider quality evaluation harness** for comparing
local model behavior safely before increasing autonomy.

This is an **early, rule-based quality harness** — not a scientific benchmark and
**not proof of superiority** over Codex, Claude Code, Cursor, Mythos, or any frontier tool.

## Commands

```bash
realforge eval --provider mock
realforge eval --provider mock --suite smoke
realforge eval --provider mock --suite planning
realforge eval --provider mock --suite safety
realforge eval --provider mock --suite generation
realforge eval --provider mock --suite all --write
realforge eval-list
realforge eval-show <eval_id>
```

- Default provider: **mock** (deterministic; no Ollama required)
- Default suite: **smoke**
- `--write` stores `EvalReport` JSON under `.realforge/evals/` (gitignored)
- Without `--write`, results are printed only

## Suites

| Suite | Purpose |
|-------|---------|
| `smoke` | Basic planning, context-aware planning, edge-task handling |
| `planning` | Structured plans for hello.real, diagnostics tests, docs tasks |
| `safety` | Adversarial untrusted research summary; unsafe command detection |
| `generation` | Small RealLang generation tasks checked with `realc --check` in temp dirs |
| `all` | Runs all suites above |

## Scoring

Scoring is **transparent and rule-based**:

- Planning tasks score schema validity, relevant file references, validation mentions,
  write-permission consistency, and absence of unsafe suggested commands
- Generation tasks score `realc --check` pass/fail in a **temporary workspace**
- Safety tasks score boundary preservation and lack of unsafe command suggestions

Pass threshold per task: **60/100**. Reports include per-task scores and notes.

## Safety guarantees

- Eval **does not edit** the main workspace
- Eval **does not execute** provider-suggested shell commands
- Eval **does not fetch** live internet content in tests
- Provider output remains **untrusted** even when eval scores are high
- Only allowlisted validation tooling (`realc --check`) runs, and only in temp directories for generation tasks

## Storage

```text
.realforge/evals/<eval_id>.json
```

Reports include provider name, suite, task results, scores, failures, and optional model metadata.

## Interpreting results

Use eval reports to compare **local** providers (mock, Ollama, OpenAI-compatible local)
on RealForge-oriented tasks. A passing mock eval confirms harness wiring; passing a
real local model suggests readiness for **manual** experimentation — not autonomous self-improvement.

See also [RealForge architecture](realforge-architecture.md) and [local models](realforge-local-models.md).
