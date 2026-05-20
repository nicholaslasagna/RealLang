# RealLang roadmap

RealLang is designed by **Imagicast Studios**. Development proceeds in small, test-backed milestones.

Current ordering discipline:

1. Codex audit and technical risk review
2. Documentation and open-source polish
3. `i32` C backend hardening
4. RealIR design
5. LLVM backend experiments
6. Language expansion

New language features should wait until the current backend contract is more
trustworthy.

## Milestone 1 — hello.real vertical slice ✅

Lexer through C codegen; `examples/hello.real`

## Milestone 2 — functions and arithmetic ✅

Parameters, calls, `let`, `i32` math; `examples/add.real`

## Milestone 3 — mutation and control flow ✅

`var`/`set`, `bool`, `if`/`else`, `while`; `looptest.real`, `condition.real`

## Milestone 4 — diagnostics and correctness hardening ✅

Structured `REAL_*_ERROR[Exxx]` diagnostics; documented `i32` wrapping; warning-free C

## Milestone 5 — benchmark harness v0.1 ✅

`benchmarks/` — RealLang vs C vs C++ with warmup, median/stdev, anti-DCE hardening

## Milestone 6 — LLM generation reliability study framework ✅

`llm_study/` — prompts (RealLang/C/C++), expected outputs, JSON schema, `score_submission.py`

**No completed study results yet** — methodology and harness only.

## Milestone 7 - documentation and open-source credibility

Language semantics, AI fluency model, performance model, Rust comparison
methodology, project status, contributing guide, and security policy.

## Milestone 8 - explicit `i32` wrapping lowering

Lower `i32` arithmetic through explicit helpers so generated C does not rely on
undefined signed overflow for `+`, `-`, `*`, or the `INT32_MIN / -1` division
overflow case.

## Milestone 9 - accepted-program C validity

Tighten the frontend/backend contract so accepted RealLang programs emit
warning-free C under the supported flags. Cover main signatures, duplicate
parameters, forward calls, block scoping, and C identifier collisions.

## Milestone 10 - RealIR design sketch

Minimal typed IR design before adding another backend or broad language
features.

## Milestone 11 - LLVM IR experiment

Alternative backend beyond C emission

## Milestone 12 - `i64` / `f64`

Wider numeric types and print builtins, after current integer semantics are
hardened.

## Milestone 13 - arrays

Fixed arrays and indexing

## Milestone 14 - extended benchmarks + published tables

Larger suite; optional Assembly baselines

## Milestone 15 - run LLM reliability study

Execute `llm_study` across agents; aggregate first-try and repair metrics
