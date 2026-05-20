# Rust comparison methodology

RealLang does not currently claim to be faster, safer, or more mature than Rust.
Any Rust comparison should be methodology-focused until measured results exist.

Rust is a production systems language with a mature compiler, optimizer,
package ecosystem, ownership model, and extensive real-world use. RealLang is
an early experimental compiler project that currently lowers to C.

## Valid comparison goals

Valid RealLang versus Rust questions include:

- Does RealLang's syntax improve first-try compile success for AI-generated
  small systems programs?
- Do RealLang diagnostics reduce repair attempts for coding agents?
- Can RealLang preserve native execution while using a smaller, more explicit
  surface area?
- How do generated binaries compare on narrowly defined benchmark tasks?
- Which language features most often cause generation or repair failures?

Invalid comparison goals include broad claims such as:

- RealLang is faster than Rust.
- RealLang is safer than Rust.
- RealLang replaces Rust.
- RealLang has better production readiness than Rust.

Those claims would require evidence far beyond this repository's current state.

## Performance comparison rules

A future Rust benchmark comparison should:

- use equivalent algorithms and output checks
- compile Rust with explicit release flags
- record compiler versions for Rust, C, C++, and RealLang's C compiler
- record CPU, OS, and command-line metadata
- report raw samples, median, mean, min, max, and spread
- include correctness checks before timing comparisons
- avoid benchmark tasks that favor one language through unavailable features
- clearly state whether RealLang output is raw emitted C or post-processed C

Performance tables should be framed as benchmark results, not language-wide
performance conclusions.

## LLM reliability comparison rules

A future LLM reliability comparison should:

- use task prompts of comparable specificity
- include RealLang, Rust, C, and C++ prompts when making cross-language claims
- preserve first attempts before any repair
- score compile success and output correctness automatically
- record repair attempts separately from first-try results
- keep model, temperature, tool access, and prompt versions fixed where possible
- publish failed attempts as well as successful attempts

The main research claim should be about generation reliability and repairability
only if scored data supports it.

## Feature maturity comparison

RealLang and Rust are not comparable in feature maturity today. RealLang does
not yet have ownership, borrowing, lifetimes, crates, traits, pattern matching,
generics, macros, robust modules, or a mature standard library.

Comparisons should therefore be scoped to implemented RealLang features:

- functions
- local bindings
- explicit mutation
- integer and bool expressions
- control flow
- structured diagnostics
- generated C execution

## Reporting template

Any future Rust comparison should include:

- exact RealLang commit
- exact Rust compiler version
- benchmark source files
- commands used
- machine and OS metadata
- raw result artifacts
- known limitations
- a statement that results apply only to the measured tasks

