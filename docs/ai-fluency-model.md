# RealLang AI fluency model

RealLang uses "AI-native" as an engineering constraint, not as a claim that the
language exposes model internals or replaces compiler correctness.

In this repository, AI-native means the language and tooling are designed to be
easier for coding agents to generate, diagnose, and repair reliably while still
compiling to native executables.

## What AI-native means here

RealLang is shaped around measurable properties:

- deterministic syntax with few ambiguous forms
- explicit mutability through `let`, `var`, and `set`
- explicit conditions through `condition(...)`
- no implicit type conversions
- structured diagnostics with stable error codes
- small vertical compiler milestones with tests
- benchmark and study harnesses that can score generated programs

These properties are intended to reduce avoidable model errors and make repair
loops more mechanical.

The broader design target is AI-generated systems code that is more
deterministic, repairable, and benchmarkable while preserving native execution
through hardened C today and future LLVM backends.

## What AI-native does not mean

RealLang does not currently:

- expose attention heads, logits, semantic vectors, or transformer internals
- embed an LLM runtime in the language
- use prompts as source code
- replace parsing, typechecking, or code generation with prompting
- claim that generated programs are automatically correct
- claim completed LLM reliability results

Those topics may belong to separate research projects, but they are not part of
RealLang v0.1.

## Research hypothesis

The working research hypothesis is:

> A language with deterministic syntax, explicit semantics, structured
> diagnostics, and a constrained feature surface may improve first-try compile
> success, repairability, and final correctness for AI-generated systems code.

This is a hypothesis. The repository currently includes a study framework in
`llm_study/`, not completed study results.

## Measurement targets

The LLM reliability study is intended to measure:

- first-try compile success
- first-try correct output
- number of repair attempts
- final compile success
- final correct output
- diagnostic usefulness during repair
- approximate token budget when available

The comparison languages currently represented in the study prompts are
RealLang, C, and C++.

## Design tradeoffs

RealLang may choose explicit syntax over shorter syntax when the explicit form
is easier for tools to generate and repair. This does not mean the language
should be verbose for its own sake. Each additional construct should justify
itself with clearer semantics, better diagnostics, or measurable reliability.

## Evidence standard

Claims about AI generation reliability should be tied to scored study data.
Until then, RealLang should describe its AI fluency as a design goal and
research direction, not as a proven result.

RealLang may eventually compete with Rust, C, and C++ if measured evidence shows
that AI-generated RealLang compiles correctly more often, needs fewer repair
attempts, and preserves native performance on comparable workloads. That is a
long-term research target, not a current claim.
