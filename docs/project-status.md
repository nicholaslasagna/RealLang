# RealLang project status

RealLang is an early, test-backed compiler project. It is not a finished
systems language, and it should not be presented as one.

## Current identity

- Name: RealLang
- File extension: `.real`
- Compiler command: `realc`
- Compiler implementation: Python
- Current backend: C code generation
- Planned backend work: hardened C lowering first, LLVM later
- Designed by: Imagicast Studios
- License stated in README: MIT

## Current compiler pipeline

```text
lex -> parse -> typecheck -> emit C
```

The emitted C is compiled by an external C compiler such as `cc`.

## Long-term ambition

RealLang should eventually compete with Rust, C, and C++ through measurable
strengths, not broad superiority claims.

The intended evidence targets are:

- AI-generated RealLang compiles correctly more often than AI-generated Rust,
  C, or C++ on comparable tasks.
- RealLang diagnostics reduce repair attempts.
- RealLang syntax reduces ambiguity for tools and coding agents.
- RealLang native backends preserve C/Rust-like performance on measured
  workloads.
- RealLang benchmarks are reproducible, honest, and scoped to the data they
  actually measure.

Until benchmark and study data support a narrow claim, RealLang should frame
these as goals rather than proven outcomes.

## Current implemented language features

- module declarations
- functions
- parameters
- `i32` and `bool` return values for non-main functions
- function calls
- return statements
- `let` immutable bindings
- `var` mutable bindings
- `set` mutation
- `i32`
- `bool`
- string literals for `print_str`
- arithmetic: `+`, `-`, `*`, `/`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- `if condition(...)`
- `while condition(...)`
- builtins: `print_i32`, `print_bool`, `print_str`

## RealForge status

RealForge is an experimental local-first coding agent layer in the same repository.
As of RealForge 0.3:

- `check`, `repair`, `ask`, `plan`, `generate`, and `doctor` commands exist
- local model configuration via `.realforge.toml` is supported
- Ollama and OpenAI-compatible **local** providers are optional; tests use `MockProvider` only
- workspace boundary enforcement, backup rotation, and post-apply rollback are implemented
- workspace indexing, symbol tables, and bounded context bundles are available (`index`, `symbols`, `context`)
- context-aware planning via `plan --include-context` and `ask --include-context` (planning is not editing)
- MockProvider remains the CI-safe default; local providers are optional

## Current quality signals

As of Milestone 11:

- the full test suite passed
- examples compiled warning-free with `cc -std=c11 -Wall -Wextra`
- benchmark RealLang sources compiled warning-free in the test suite
- accepted programs require guaranteed `i32` or `bool` return paths
- `i32` source integer literals are checked against the documented
  `0..2147483647` range
- block scoping is enforced with declaration-point visibility, block-local
  `if`/`while` bindings, rejected shadowing, and nested `set` resolution
- benchmark and LLM study harnesses existed
- no completed LLM reliability study results were published

These are useful early signals, not proof of production readiness.

## Known limitations

Known limitations include:

- divide-by-zero behavior is not specified
- no LLVM backend exists yet
- no RealIR exists yet
- user-defined `void` functions are not implemented
- nested shadowing is intentionally rejected in v0.1
- arrays, structs, imports, generics, ownership, and modules beyond a single
  source file are not implemented
- the standard library is limited to a few print builtins
- benchmark results are early smoke tests
- the LLM study framework exists but has no completed published results

## Near-term priority

The next credibility milestone should be backend and contract hardening, not a
large feature expansion.

Recommended near-term work:

- keep accepted RealLang programs warning-free under the supported C flags
- add tests for any newly discovered accepted-invalid programs
- keep `i32` lowering aligned with RealLang wrapping semantics as new
  expression forms are added
- document exact semantics before adding new types or arrays
- keep each milestone small and test-backed

## Status language

Preferred wording:

- "RealLang currently lowers to C."
- "RealLang is designed to study AI generation reliability."
- "The benchmark harness compares small workloads."
- "No completed LLM reliability results are claimed yet."

Avoid wording such as:

- "RealLang is faster than Rust."
- "RealLang is safer than Rust."
- "RealLang has proven AI reliability."
- "RealLang is production-ready."
