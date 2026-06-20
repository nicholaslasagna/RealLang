# RealForge architecture

RealForge 0.1 is a small, test-backed vertical slice of a local-first coding agent.
It is designed to grow incrementally without rewriting RealLang or requiring cloud APIs.

## Control flow

```text
model provider → planner → tools → realc diagnostics → repair loop → tests → report
```

### Components

| Layer | Module | Role |
|-------|--------|------|
| Provider | `providers/` | Local model adapters (`MockProvider` today; Ollama / OpenAI-compatible scaffolds) |
| Planner | `planner.py` | Turn provider output into structured `AgentPlan` steps |
| Agent loop | `agent_loop.py` | `plan-only` or `repair-loop` modes; no auto-edit unless permitted |
| Tools | `runner.py`, `index/` | Shell execution (realc, future pytest/benchmarks), workspace indexing |
| Diagnostics | `diagnostics_parser.py` | Parse `REAL_*_ERROR[Exxx]` blocks from `realc --check` stderr |
| Repair | `repair_rules.py`, `patcher.py` | Conservative rule-based fixes; backup before writes |
| Safety | `permissions.py` | `readonly` (default), `ask`, `workspace-write` |
| Memory | `memory.py` | Session notes for multi-step loops (v0.1 in-process only) |
| Report | `report.py`, `doctor.py` | Human-readable summaries and environment checks |

## Agent modes (v0.1)

### Plan-only

Used by `realforge ask`. The provider returns a deterministic plan. RealForge does
not edit files or run destructive commands.

### Repair loop

Used internally and by `realforge repair`. Flow:

1. Run `realc --check` on a `.real` file.
2. Parse diagnostics.
3. Apply only proven-safe repairs (currently E203 let→var).
4. On `--apply`, write through `patcher.py` with backup.
5. Rerun `realc --check` and report outcome.

## Permission model

| Mode | Shell | File writes |
|------|-------|-------------|
| `readonly` | `realc --check` only | blocked |
| `ask` | blocked in v0.1 (future prompt) | blocked |
| `workspace-write` | allowed (non-destructive) | allowed within workspace root |

CLI `--apply` is an explicit user action and bypasses readonly for that write only.

## Subprocess boundary

RealForge never imports RealLang compiler modules for checking. All compiler feedback
goes through:

```bash
realc <file.real> --check
```

This keeps RealForge decoupled and validates that RealLang diagnostics are
agent-ready.

## Future work (not in 0.1)

- Wire Ollama and OpenAI-compatible local providers into the planner
- Multi-file repair sessions with `index/` symbol awareness
- Pytest and benchmark harness integration through `runner.py`
- Persistent memory and session replay
