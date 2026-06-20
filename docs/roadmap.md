# RealLang roadmap

RealLang is designed by **Imagicast Studios**. Development proceeds in small, test-backed milestones.

Current ordering discipline:

1. Codex audit and technical risk review
2. Documentation and open-source polish
3. `i32` C backend hardening
4. Accepted-program C validity
5. Return-path, literal-bound, and block-scope correctness
6. RealIR design
7. Minimal RealIR implementation
8. Language expansion
9. LLVM backend experiments

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

## Milestone 10 - return-path analysis and integer literal bounds

Strengthen guaranteed-return analysis and reject integer literals outside the
documented `i32` language range unless/until explicit literal semantics say
otherwise.

## Milestone 11 - block scope correctness

Finish lexical block-scope behavior so nested declarations, mutation, and
diagnostics match the documented semantics and generated C.

## Milestone 12 - RealIR design document

Document a minimal typed RealIR before implementing it. Define values,
instructions, blocks, control flow, function signatures, diagnostics handoff,
and lowering requirements from AST to C/LLVM.

## Milestone 13 - minimal RealIR implementation

Introduce the smallest useful RealIR pipeline behind existing behavior, with no
new language syntax.

## Milestone 14 - `i64` / `f64`

Wider numeric types and print builtins, after current integer semantics are
hardened.

## Milestone 15 - arrays

Fixed arrays and indexing

## Milestone 16 - LLVM backend experiment

Alternative backend beyond C emission

## Milestone 17 - extended benchmarks + published tables

Larger suite; optional Assembly baselines

## Milestone 18 - run LLM reliability study

Execute `llm_study` across agents; aggregate first-try and repair metrics

## RealForge platform roadmap

RealForge grows as a local-first AI engineering environment through separate,
test-backed capability slices:

- 2.1 - creative/game/engine planning foundation
- 2.2 - capability registry, slash-command grammar, and settings surfaces
- 2.3 - multimodal provider interface (implemented scaffold)
- 2.4 - image-generation workflow planner (implemented; planning artifacts only)
- 2.5 - optional vision/image-understanding adapter foundation (implemented; mock-first)
- 2.6 - Unreal/Blender engine and asset pipeline planner
- 2.7 - general agent skill benchmark suite
- 2.8 - local model tournament by capability domain
- 2.9 - staff update UI backend expansion; no auto-apply
- 3.0 - resume RealLang RealIR design and implementation

Each domain must preserve untrusted inputs, dry-run defaults, structured
reports, validation before trust, explicit writes, and human approval for
destructive actions.
