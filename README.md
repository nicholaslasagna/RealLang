# RealLang

**RealLang** is an experimental AI-native systems programming language designed by **Imagicast Studios**. It prioritizes deterministic parsing, explicit semantics, LLM-oriented code generation reliability, AI-repairable diagnostics, and native executable output through a C backend.

RealLang is designed to make AI-generated systems code more deterministic,
repairable, and benchmarkable while preserving native execution through
hardened C today and future LLVM backends.

This repository implements the compiler incrementally in **vertical slices**—each milestone compiles only the programs it claims to support.

## Performance model

RealLang does **not** attempt to beat C by magic. RealLang currently lowers to C, then relies on mature native compilers for optimization. Its performance goal is **C-like native execution**. Its research goal is different: can an AI-native language improve first-try correctness, repairability, and code generation reliability while preserving native performance?

See [benchmarks/README.md](benchmarks/README.md) for the v0.1 harness (RealLang vs C vs C++ on loops, recursion, branches, and calls).

## Research direction

RealLang is designed by **Imagicast Studios** as an AI-native systems language. It lowers to C for native execution, uses deterministic syntax, explicit semantics, structured AI-repairable diagnostics, and a benchmark harness comparing RealLang-generated C against handwritten C/C++ baselines.

**Long-term question:** Can an AI-native language improve first-try compile success, correctness, and repairability while preserving C-like performance?

The [llm_study/](llm_study/) directory provides the **methodology and scoring harness** for that study (no completed results yet).

## RealForge

[RealForge](docs/realforge.md) is a **local-first coding agent platform built for RealLang**:
compiler-guided, benchmark-aware, repair-loop native, and designed to run with local
LLMs instead of cloud APIs.

It uses `realc` diagnostics, safe patching, and local model adapters configured via
`.realforge.toml` (see [local model adapters](docs/realforge-local-models.md)).

```bash
realforge check examples/hello.real
realforge repair path/to/bad.real --dry-run
realforge ask --task "plan a diagnostic review"
realforge plan --task "plan a diagnostic review"
realforge generate --task "hello world program" --dry-run
realforge doctor
realforge research --url https://example.com/docs --allow-domain example.com
realforge cycle --area tests --budget 1 --dry-run
realforge eval --provider mock --suite smoke
realforge bench-tasks --provider mock --suite smoke
realforge staff-status
```

Permissioned HTTPS research saves snapshots under `.realforge/research/` and can inform
`plan --include-research` without auto-editing files. Bounded `cycle` commands compose
improve → experiment → proposal flows without auto-merge. The `eval` harness scores local
providers on deterministic tasks without editing the main workspace. `bench-tasks` provides
structured repeatable benchmarks for tracking local providers and RealForge versions over time.
Staff-only
`improve-channel` commands (disabled by default) compose eval gates and cycles for a future
Improve/Update workflow; `update-bundle` packages pending proposals as reviewable update
candidates (with `verify` integrity checks in 1.6) without applying them. See
[research docs](docs/realforge-research.md), [cycle docs](docs/realforge-cycle.md),
[eval harness](docs/realforge-evals.md),
[task benchmarks](docs/realforge-task-benchmarks.md),
[staff mode](docs/realforge-staff-mode.md),
and [update bundles](docs/realforge-update-bundles.md).

See also [RealForge architecture](docs/realforge-architecture.md),
[local model adapters](docs/realforge-local-models.md),
[research](docs/realforge-research.md),
[cycle](docs/realforge-cycle.md),
[eval harness](docs/realforge-evals.md),
[staff mode](docs/realforge-staff-mode.md), and
[update bundles](docs/realforge-update-bundles.md).

## Integer overflow (v0.1)

**`i32` uses defined two's-complement wrapping arithmetic** (modulo 2³²). Overflow is not undefined behavior in the RealLang language model—for example, `examples/looptest.real` may wrap when the accumulated sum exceeds `i32` range.

The C backend lowers `i32` to `int32_t` and routes `+`, `-`, and `*` through explicit `uint32_t`-backed wrapping helpers. Division handles the `INT32_MIN / -1` overflow case explicitly; divide-by-zero behavior is not specified yet.

## Current language (through milestone 3)

- Modules, functions, parameters, calls
- `let` (immutable) and `var` (mutable) bindings, `set` mutation
- `i32` arithmetic, `bool`, comparisons
- `if condition(...) { } else { }`, `while condition(...) { }`
- Builtins: `print_str`, `print_i32`, `print_bool`

Examples: `hello.real`, `add.real`, `looptest.real`, `condition.real`

Pipeline: **lex → parse → typecheck → emit C**.

## AI-repairable diagnostic example

```
REAL_TYPE_ERROR[E203]
File: examples/bad.real
Line: 4
Column: 3
Problem:
  Cannot assign to immutable binding 'x'.
Why:
  'x' was declared with let, which creates an immutable binding.
Suggested repair:
  Change:
    let x: i32 = ...;
  To:
    var x: i32 = ...;
  Or remove this set statement.
```

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

realc examples/hello.real --emit-c
cc -std=c11 -Wall -Wextra -o hello examples/hello.c && ./hello

pytest

# Benchmarks (optional; branch_count is slow)
python benchmarks/run_benchmarks.py --skip-slow
```

## CLI

```bash
realc <file.real> --check
realc <file.real> --emit-c [-o output.c]
realforge check <file.real>
realforge repair <file.real> --dry-run|--apply
realforge ask --task "..."
realforge plan --task "..."
realforge generate --task "..." --dry-run|--apply --output <file.real>
realforge doctor
```

## Project layout

```
src/reallang/   RealLang compiler
src/realforge/  RealForge local agent layer
tests/          unit tests per compiler stage
examples/       RealLang source programs
docs/           language notes and roadmap
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Project documents

- [Language semantics](docs/language-semantics.md)
- [AI fluency model](docs/ai-fluency-model.md)
- [Performance model](docs/performance-model.md)
- [Rust comparison methodology](docs/rust-comparison-methodology.md)
- [Project status](docs/project-status.md)
- [RealForge agent layer](docs/realforge.md)
- [RealForge architecture](docs/realforge-architecture.md)
- [RealForge local models](docs/realforge-local-models.md)
- [RealForge research](docs/realforge-research.md)
- [RealForge cycle](docs/realforge-cycle.md)
- [RealForge eval harness](docs/realforge-evals.md)
- [RealForge task benchmarks](docs/realforge-task-benchmarks.md)
- [RealForge staff mode](docs/realforge-staff-mode.md)
- [RealForge update bundles](docs/realforge-update-bundles.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

MIT
