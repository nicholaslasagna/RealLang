# RealForge

RealForge is an experimental **local-first coding-agent platform** for RealLang.
It sits beside the RealLang compiler and uses **`realc` diagnostics as the feedback
loop** for conservative repairs, test execution, and (eventually) benchmark-driven
workflows.

RealForge does **not** require OpenAI, Anthropic, Gemini, Claude, Codex, Cursor, or
any cloud provider. Local models are supported through optional adapters (Ollama,
OpenAI-compatible local servers). The default `mock` provider is deterministic and
requires no external services.

## What RealForge 0.1 does

```text
task or source file
  → model provider (plan-only) OR repair loop
  → realc --check (subprocess via runner.py)
  → parse structured REAL_*_ERROR[Exxx] diagnostics
  → apply safe rule-based repairs (optional, permission-gated)
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

# Plan-only agent demo (mock provider, no file edits)
realforge ask --provider mock --task "inspect hello.real diagnostics"

# Environment health check
realforge doctor
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

- Default permission mode is **`readonly`** (no implicit file writes or shell commands).
- `--dry-run` never modifies files.
- `--apply` always creates `<file>.real.bak` before writing (explicit CLI action).
- Only explicitly safe repairs are applied automatically.
- Destructive shell commands are blocked in `runner.py`.
- If a repair cannot be proven safe, RealForge reports **manual repair required**.

## Package layout

```
src/realforge/
  cli.py                 realforge command
  config.py              paths, provider URLs, permission defaults
  agent_loop.py          plan-only and repair-loop orchestration
  planner.py             structured agent plans
  runner.py              subprocess wrapper (all shell execution)
  diagnostics_parser.py  parse structured compiler output
  repair_rules.py        conservative repair planning
  patcher.py             backup + apply guards
  diffing.py             unified diff for dry-run
  permissions.py         readonly / ask / workspace-write gates
  memory.py              in-process session notes
  report.py              human-readable summaries
  doctor.py              environment checks
  providers/             local model adapters (mock implemented)
  index/                 workspace indexing scaffolds
```

RealForge intentionally calls **`realc` through subprocess** rather than importing
compiler internals. That proves RealLang diagnostics are machine-readable for agent
loops.

## Related documents

- [Architecture](realforge-architecture.md)
- [Local models](realforge-local-models.md)
- [Language semantics](language-semantics.md)
- [LLM study framework](../llm_study/README.md)
