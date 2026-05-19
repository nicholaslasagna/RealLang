# RealLang roadmap

RealLang is designed by **Imagicast Studios**. Development proceeds in small, test-backed milestones—no milestone is “done” until its example programs compile and its tests pass.

## Milestone 1 — hello.real vertical slice ✅

**Status:** completed

- Lexer, parser, AST, typechecker, C codegen
- CLI: `realc examples/hello.real --emit-c`
- Example: `examples/hello.real`

## Milestone 2 — functions and arithmetic ✅

**Status:** completed

- Function declarations with parameters, calls, `i32` arithmetic, `let`, return checking
- Example: `examples/add.real`

## Milestone 3 — mutation and control flow ✅

**Status:** completed

- `var` / `set`, `bool`, comparisons, `if` / `else`, `while condition(...)`
- Examples: `examples/looptest.real`, `examples/condition.real`

## Milestone 4 — diagnostics and correctness hardening ✅

**Status:** completed

- Structured diagnostics with stable error codes (`REAL_*_ERROR[Exxx]`)
- File, line, column; expected/found; suggested repairs
- Documented v0.1 `i32` wrapping overflow semantics
- Clean generated C (`cc -std=c11 -Wall -Wextra`) for all examples
- Codegen TODO for explicit wrapping lowering in a future backend pass

## Milestone 5 — wider numeric types

- `i64`, `f64`
- Additional print builtins
- Benchmark prep

## Milestone 6 — performance benchmarks

- Benchmark suite against C, C++, and Assembly baselines
- Measure generated-C output; later, LLVM lowering when available

## Milestone 7 — LLM generation reliability

- Study how reliably models generate valid RealLang
- Measure repair loops using compiler diagnostics
- Document patterns that improve generation and fix rates
