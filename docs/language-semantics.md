# RealLang language semantics

This document describes the semantics RealLang currently intends to expose. It
is not a complete language specification yet. When the implementation and this
document disagree, that disagreement should be treated as a compiler or
documentation issue, not as permission to make undocumented claims.

## Current scope

RealLang v0.1 currently supports:

- module declarations
- functions with parameters and `i32` return values
- function calls
- `return` statements
- immutable `let` bindings
- mutable `var` bindings
- explicit `set` mutation
- `i32`
- `bool`
- string literals for `print_str`
- arithmetic: `+`, `-`, `*`, `/`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- `if condition(...) { ... } else { ... }`
- `while condition(...) { ... }`
- builtins: `print_i32`, `print_bool`, `print_str`

RealLang currently lowers to C. The C backend is the reference execution path
for this repository today.

## Design constraints

RealLang prioritizes deterministic syntax and explicit semantics. The current
surface area is intentionally small so each added feature can be tested through
the full compiler pipeline.

Important constraints:

- Mutability is explicit: `let` is immutable, `var` is mutable, and `set`
  performs mutation.
- Conditions are explicit: control flow uses `condition(...)`.
- There are no implicit type conversions.
- Syntax should be easy for tools and code generators to produce consistently.
- Diagnostics should be structured enough for automated repair loops.

## Types

### `i32`

`i32` is intended to mean a 32-bit signed integer value with defined
two's-complement wrapping arithmetic modulo 2^32.

This is a RealLang language rule, not a C rule. The current C backend still
lowers `i32` to C `int`, and the backend has a known hardening task: arithmetic
lowering must avoid relying on C signed overflow behavior.

Until that hardening lands, programs that overflow `i32` should be treated as
semantically specified by RealLang but not yet faithfully lowered by the C
backend.

Division is currently available through `/`. More precise division semantics,
including divide-by-zero behavior and the overflow case `INT_MIN / -1`, still
need to be specified and tested.

### `bool`

`bool` values are `true` and `false`. Conditions must evaluate to `bool`.

Current comparison support accepts comparisons over equal operand types. The
exact long-term policy for ordered comparisons on `bool` should be specified
before expanding the language.

### `string`

String literals currently exist for `print_str`. RealLang does not yet expose a
general string type with variables, operations, ownership, allocation, or
Unicode semantics.

### `void`

`void` exists in the internal model for statement-only builtins such as
`print_i32`, `print_bool`, and `print_str`. User-defined `void` functions are
not currently part of the implemented syntax.

## Names and scopes

The intended model is lexical scoping with explicit declarations. The compiler
currently rejects redeclarations within a function environment, but block-scope
semantics need more hardening so typechecking and emitted C agree exactly.

Names that are valid RealLang identifiers may still collide with generated C
identifiers or C keywords. The backend should eventually sanitize or reject
such names consistently.

## Backend contract

The intended frontend/backend contract is:

1. If parsing or typechecking fails, `realc` emits a structured diagnostic.
2. If typechecking succeeds, generated C should compile warning-free under the
   supported C compiler flags.
3. Generated C should preserve the documented RealLang semantics.

The project is not fully at that contract yet. The known gaps are tracked as
compiler hardening work, not as language features.

