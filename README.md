# RealLang

**RealLang** is an experimental AI-native systems programming language designed by **Imagicast Studios**. It prioritizes deterministic parsing, explicit semantics, LLM-safe code generation, AI-repairable diagnostics, and native-speed compilation through a C backend.

This repository implements the compiler incrementally in **vertical slices**—each milestone compiles only the programs it claims to support.

## Performance model

RealLang targets **C-like performance** by lowering to generated C today, with a planned LLVM backend later. It is not positioned as “faster than C”; the goal is predictable, native-speed output with semantics that stay easy for both humans and models to reason about.

## Integer overflow (v0.1)

**`i32` uses defined two's-complement wrapping arithmetic** (modulo 2³²). Overflow is not undefined behavior in the RealLang language model—for example, `examples/looptest.real` may wrap when the accumulated sum exceeds `i32` range.

The current C backend lowers `i32` to C `int` and documents a planned hardening step: explicit `uint32_t`-based lowering (or equivalent) so generated C never relies on accidental or undefined signed overflow. See the TODO in `src/reallang/codegen.py`.

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
```

## CLI

```bash
realc <file.real> --emit-c [-o output.c]
```

## Project layout

```
src/reallang/   lexer, parser, AST, typechecker, codegen, diagnostics, CLI
tests/          unit tests per compiler stage
examples/       RealLang source programs
docs/           language notes and roadmap
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## License

MIT
