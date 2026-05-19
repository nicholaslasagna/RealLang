# RealLang LLM generation reliability study (framework v0.1)

**Status: methodology and harness only — no completed research results yet.**

This directory defines a repeatable study for comparing how reliably AI coding agents produce correct programs in **RealLang** versus **C** and **C++** on the same tasks.

## What we measure

| Field | Meaning |
|-------|---------|
| `first_try_compile_success` | First submission compiles without repair |
| `first_try_correct_output` | First submission stdout matches expected |
| `repair_attempts` | Human/agent fixes after first try |
| `final_compile_success` | Final submission compiles |
| `final_correct_output` | Final stdout matches expected |
| `token_count_estimate` | Optional token budget (recorded manually) |
| `runtime_ms_if_available` | Optional execution time from scorer |
| `notes` | Free-form observations |

Schema: [schema.json](schema.json)

## Layout

```
llm_study/
  prompts/reallang/   prompts/c/   prompts/cpp/   # per-language task prompts
  expected/           # golden stdout per task
  results/            # place scored JSON records here (not committed by default)
  score_submission.py # compile, run, compare stdout
```

## Workflow (manual — no API keys)

1. Give an agent the prompt for a task/language, e.g. `prompts/reallang/loop_sum.md`.
2. Save the agent’s first answer to a file (e.g. `results/agentA/loop_sum_v1.real`).
3. Score it:

```bash
python llm_study/score_submission.py \
  --task loop_sum \
  --language reallang \
  --file results/agentA/loop_sum_v1.real \
  --first-try \
  -o results/agentA/loop_sum_v1.score.json
```

4. If it fails, repair using compiler diagnostics, increment `--repair-attempts`, score the fixed file without `--first-try`.

Repeat for C and C++ prompts on the same tasks.

## Golden outputs

| Task | Expected stdout |
|------|-----------------|
| `loop_sum` | `1249975000` |
| `fibonacci_recursive` | `9227465` |
| `branch_count` | `5000000` |
| `function_call` | `1250025000` |

## Research question (not answered here)

> Can an AI-native language improve first-try compile success, correctness, and repairability while preserving C-like performance?

Answering that requires running this harness across agents and aggregating `results/*.json` — future work.

## Related

- Compiler diagnostics: RealLang `REAL_*_ERROR[Exxx]` messages
- Performance smoke tests: [../benchmarks/README.md](../benchmarks/README.md)
