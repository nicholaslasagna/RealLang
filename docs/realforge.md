# RealForge

RealForge is a **local-first coding agent platform built for RealLang**: compiler-guided,
benchmark-aware, repair-loop native, and designed to run with local LLMs instead of
cloud APIs.

It sits beside the RealLang compiler and uses **`realc` diagnostics as the primary
feedback loop** for conservative repairs. Benchmark and test feedback loops are part
of the architecture and are integrated incrementally.

RealForge does **not** require OpenAI, Anthropic, Gemini, Claude, Codex, Cursor, or
any cloud provider. Local models are configured through `.realforge.toml` (Ollama or
OpenAI-compatible local servers). The default `mock` provider is deterministic and
requires no external services.

## What RealForge 0.5 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.5 adds **context-aware planning**:

- `realforge plan --task "..." --include-context` — bounded workspace context + structured plan
- `realforge ask --task "..." --include-context` — lighter user-facing planning output
- Provider prompt contract with safety constraints, available commands, and JSON plan shape
- Structured plans include `files_to_inspect`, `files_to_modify`, `commands_to_run`, `risks`, and `requires_write_permission`
- Model output is **untrusted**; planning does not edit files or run commands
- `--max-context-chars`, `--permission`, and `--provider mock` (CI-safe default)

## What RealForge 0.4 adds

RealForge remains **experimental** and does not add autonomous editing in 0.4.
Version 0.4 adds deterministic **workspace awareness** and **context construction**:

- `realforge index` — scan workspace for `.real` files, docs, tests, and benchmarks
- `realforge symbols` — conservative text-based symbol tables (modules, functions, bindings)
- `realforge context --task "..."` — bounded, deterministic context bundles for local providers
- Optional index cache at `.realforge/index.json` with explicit `--write` only

Symbol scanning is text-based, not a full parser import. Treat extracted symbols as hints,
not compiler facts.

## What RealForge 0.3 adds

RealForge remains **experimental**. It does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.3 hardens workspace safety before expanding agent power:

- **Workspace boundary enforcement** — all writes must stay inside the configured workspace root, including explicit `--apply`
- **Backup rotation** — numbered backups (`file.real.bak`, `file.real.bak.1`, …) preserve prior backups
- **Post-apply rollback** — failed recheck after `repair --apply` restores the backup by default; use `--keep-failed-repair` to retain the modified file
- **Live diagnostic roundtrip tests** against real `realc --check` stderr
- **Runner permission tests** for destructive-command blocking and readonly vs workspace-write behavior

## What RealForge 0.2 adds

- `.realforge.toml` model configuration
- Local generation through **Ollama** or **OpenAI-compatible local** HTTP endpoints
- `realforge ask`, `realforge plan`, and `realforge generate --dry-run`
- Explicit `--apply` for generated file writes (permission-gated)

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

# Apply proven-safe repairs with backup (rollback on failed recheck by default)
realforge repair path/to/bad.real --apply
realforge repair path/to/bad.real --apply --keep-failed-repair

# Context-aware planning (read-only; does not edit files)
realforge plan --task "explain hello.real" --include-context --provider mock
realforge ask --task "summarize project" --include-context --provider mock
realforge plan --task "..." --include-context --max-context-chars 8000 --permission readonly

# Generate RealLang source without writing files
realforge generate --task "hello world program" --dry-run

# Workspace awareness (read-only by default)
realforge index
realforge symbols
realforge context --task "explain hello.real" --max-chars 4000
realforge index --write

# Environment health check
realforge doctor
```

Example `.realforge.toml`:

```toml
[model]
provider = "ollama"
model = "qwen2.5-coder:32b"
base_url = "http://localhost:11434"
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

RealForge is still experimental. Autonomous editing remains permission-gated; local
model support does not bypass safety checks.

- Default permission mode is **`readonly`** (no implicit file writes or shell commands).
- **`--dry-run` never modifies files.**
- **`--apply` refuses paths outside the workspace root**, even when explicitly requested.
- **`--apply` creates rotated backups** (`file.real.bak`, `file.real.bak.1`, …) before writing.
- **Failed recheck after repair rolls back by default**; pass `--keep-failed-repair` to keep the modified file.
- Only explicitly safe repairs are applied automatically.
- Destructive shell commands are blocked in `runner.py`.
- If a repair cannot be proven safe, RealForge reports **manual repair required**.
- RealForge does **not** claim to outperform Codex, Claude Code, or Cursor yet.

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
  index/                 workspace scan, symbols, context builder
```

RealForge intentionally calls **`realc` through subprocess** rather than importing
compiler internals. That proves RealLang diagnostics are machine-readable for agent
loops.

## Related documents

- [Architecture](realforge-architecture.md)
- [Local models](realforge-local-models.md)
- [Language semantics](language-semantics.md)
- [LLM study framework](../llm_study/README.md)
