# RealForge

RealForge is an experimental **local coding-agent layer** for RealLang. It sits
beside the RealLang compiler and uses **`realc` diagnostics as the feedback
loop** for conservative, rule-based repairs.

RealForge is **not** an AI provider yet. It does **not** call OpenAI,
Anthropic, Gemini, Cursor, Codex, Claude, or any other external model API.

## What RealForge 0.1 does

```text
source file
  → realforge check / repair
  → realc --check (subprocess)
  → parse structured REAL_*_ERROR[Exxx] diagnostics
  → apply safe rule-based repairs (optional)
  → rerun realc --check
  → report pass/fail, diff, backup path
```

### CLI

```bash
# Typecheck via realc and summarize diagnostics
realforge check examples/hello.real

# Show proposed repairs without writing
realforge repair path/to/bad.real --dry-run

# Apply proven-safe repairs with backup
realforge repair path/to/bad.real --apply
```

### Supported automatic repairs (v0.1)

| Code | Behavior |
|------|----------|
| **E203** | If `let x` is later mutated with `set x`, safe repair may change that binding to `var x`. |
| **E217** | Manual repair required (`main` must take no parameters). |
| **E218** | Manual repair required (duplicate parameters). |
| **E220** | Manual repair required (missing guaranteed return path). |
| **E221** | Manual repair required (`i32` literal out of range). |
| Other codes | Reported as manual repair required. |

## Safety rules

- `--dry-run` never modifies files.
- `--apply` always creates `<file>.real.bak` before writing.
- Only explicitly safe repairs are applied automatically.
- If a repair cannot be proven safe, RealForge reports **manual repair required**.

## Architecture

```
src/realforge/
  cli.py                 realforge command
  runner.py              subprocess wrapper for realc --check
  diagnostics_parser.py  parse structured compiler output
  repair_rules.py        conservative repair planning
  repair_loop.py         check / repair orchestration
  safety.py              backup + apply guards
  diffing.py             unified diff for dry-run
  report.py              human-readable summaries
```

RealForge intentionally calls **`realc` through subprocess** rather than
importing compiler internals. That proves RealLang diagnostics are
machine-readable for agent loops.

## Long-term direction

Planned future work (not implemented in 0.1):

- provider adapters for external coding agents
- multi-file repair sessions
- benchmark-driven optimization workflows
- RealIR-aware optimization passes
- execution of the LLM reliability study in `llm_study/`

## Related documents

- [Language semantics](language-semantics.md)
- [AI fluency model](ai-fluency-model.md)
- [LLM study framework](../llm_study/README.md)
