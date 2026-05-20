# RealLang performance model

RealLang does not claim to be faster than Rust, C, or C++.

The current performance model is simple: RealLang lowers to C, then relies on a
native C compiler for optimization and machine-code generation. Performance
claims must be limited to measured benchmark results and must include the
benchmark methodology.

## Current backend

The current backend emits C source code. The normal pipeline is:

```text
RealLang source -> lexer -> parser -> typechecker -> C source -> C compiler
```

LLVM is a planned future backend, not the current implementation.

## What "native execution" means

In this repository, native execution means RealLang programs are compiled into a
native binary through generated C and a C compiler. It does not mean RealLang
has its own optimizing native backend today.

## What can be claimed today

It is reasonable to claim:

- RealLang currently emits C.
- RealLang examples compile warning-free under the tested C flags.
- The benchmark harness compares RealLang-generated C against handwritten C and
  C++ baselines for small workloads.
- Any performance observation is limited to the benchmark, machine, compiler,
  flags, and date that produced it.

It is not reasonable to claim:

- RealLang is faster than Rust.
- RealLang is faster than C or C++.
- RealLang has proven production-grade performance.
- RealLang has a mature optimizer.
- RealLang benchmarks are publication-grade scientific results.

## Current benchmark harness

The benchmark harness lives in `benchmarks/`. It currently covers:

- loop summation
- recursive Fibonacci
- branch-heavy loop counting
- function calls in a loop

The harness reports correctness, mean, median, min, max, standard deviation,
and spread ratio. It is useful for smoke testing and early comparisons, but it
is not yet enough for broad performance claims.

## Known benchmark limitations

Current limitations include:

- small benchmark set
- few timed runs by default
- process startup included in timing samples
- no pinned CPU frequency or scheduler isolation
- no compiler version and hardware metadata in committed results
- RealLang-generated benchmark C is post-processed for some anti-DCE hardening
- `i32` wrapping lowering is not hardened yet

These limitations do not make the harness useless. They define the boundary of
what the results can support.

## Integer semantics and performance

RealLang defines `i32` as wrapping two's-complement arithmetic, but the current
C backend still lowers `i32` to C `int`. C signed overflow is not a valid
implementation strategy for RealLang's documented arithmetic semantics.

Before serious `-O3` performance claims, the backend should lower `i32`
arithmetic explicitly, for example through fixed-width helpers or `uint32_t`
based operations that preserve the language semantics.

## Future evidence requirements

Before publishing stronger performance comparisons, the project should record:

- exact RealLang commit
- OS and kernel version
- CPU model
- compiler names and versions
- compiler flags
- benchmark command
- warmup and timed run counts
- raw timing samples
- correctness outputs
- whether results were generated from raw or post-processed emitted C

