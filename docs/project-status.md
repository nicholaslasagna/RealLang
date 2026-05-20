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

## Current quality signals

At the time this document was added:

- the full test suite passed
- examples compiled warning-free with `cc -std=c11 -Wall -Wextra`
- benchmark RealLang sources compiled warning-free in the test suite
- benchmark and LLM study harnesses existed
- no completed LLM reliability study results were published

These are useful early signals, not proof of production readiness.

## Known limitations

Known limitations include:

- divide-by-zero behavior is not specified
- accepted-program C validity still has known hardening work
- no LLVM backend exists yet
- no RealIR exists yet
- user-defined `void` functions are not implemented
- arrays, structs, imports, generics, ownership, and modules beyond a single
  source file are not implemented
- the standard library is limited to a few print builtins
- benchmark results are early smoke tests
- the LLM study framework exists but has no completed published results

## Near-term priority

The next credibility milestone should be backend and contract hardening, not a
large feature expansion.

Recommended near-term work:

- ensure accepted RealLang programs emit warning-free C
- add tests for currently accepted-invalid programs
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
