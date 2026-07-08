# RealLang

**RealLang** is an experimental AI-native systems programming language designed by **Imagicast Studios**. It prioritizes deterministic parsing, explicit semantics, LLM-oriented code generation reliability, AI-repairable diagnostics, and native executable output through a C backend.

RealLang is designed to make AI-generated systems code more deterministic,
repairable, and benchmarkable while preserving native execution through
hardened C today and future LLVM backends.

This repository implements the compiler incrementally in **vertical slices**—each milestone compiles only the programs it claims to support.

## Performance model

RealLang does **not** attempt to beat C by magic. RealLang currently lowers to C, then relies on mature native compilers for optimization. Its performance goal is **C-like native execution**. Its research goal is different: can an AI-native language improve first-try correctness, repairability, and code generation reliability while preserving native performance?

See [benchmarks/README.md](benchmarks/README.md) for the v0.1 harness.

## Research direction

RealLang is designed by **Imagicast Studios** as an AI-native systems language. It lowers to C for native execution, uses deterministic syntax, explicit semantics, structured AI-repairable diagnostics, and a benchmark harness comparing RealLang-generated C against handwritten C/C++ baselines.

**Long-term question:** Can an AI-native language improve first-try compile success, correctness, and repairability while preserving C-like performance?

The [llm_study/](llm_study/) directory provides the methodology and scoring harness for that study.

## Integer overflow (v0.1)

**`i32` uses defined two's-complement wrapping arithmetic** (modulo 2³²). Overflow is not undefined behavior in the RealLang language model.

The C backend lowers `i32` to `int32_t` and routes `+`, `-`, and `*` through explicit `uint32_t`-backed wrapping helpers.

## Current language

- Modules, functions, parameters, calls
- `let` and `var` bindings, `set` mutation
- `i32` arithmetic, `bool`, comparisons
- `if condition(...) { } else { }`, `while condition(...) { }`
- Builtins: `print_str`, `print_i32`, `print_bool`

Pipeline: **lex → parse → typecheck → emit C**.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

realc examples/hello.real --emit-c
cc -std=c11 -Wall -Wextra -o hello examples/hello.c && ./hello

python -m pytest