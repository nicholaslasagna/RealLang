# RealLang language semantics

This document describes the semantics RealLang currently intends to expose. It
is not a complete language specification yet. When the implementation and this
document disagree, that disagreement should be treated as a compiler or
documentation issue, not as permission to make undocumented claims.

## Current scope

RealLang v0.1 currently supports:

- module declarations
- functions with parameters and `i32` or `bool` return values
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

Source integer literals are non-negative decimal tokens in the range
`0..2147483647`. RealLang v0.1 does not have unary minus syntax, so
`-2147483648` is not accepted as a direct source literal or as unary minus over
`2147483648`. Negative `i32` values can be produced by supported arithmetic
expressions, which use the wrapping semantics described below.

This is a RealLang language rule, not a C rule. The C backend lowers `i32` to
`int32_t` and uses explicit `uint32_t`-backed helpers for wrapping `+`, `-`,
and `*`, so those operations do not rely on C signed overflow behavior.

Division is currently available through `/`. The backend handles the signed
division overflow case `INT32_MIN / -1` explicitly. Divide-by-zero behavior
still needs to be specified and tested.

### `bool`

`bool` values are `true` and `false`. Conditions must evaluate to `bool`.

Current comparison support accepts comparisons over equal operand types. The
exact long-term policy for ordered comparisons on `bool` should be specified
before expanding the language.

### `string`

String literals currently exist for `print_str`. RealLang does not yet expose a
general string type with variables, operations, ownership, allocation, or
Unicode semantics.

### Function return types

Non-main user-defined functions can currently return `i32` or `bool`.
`main` has a fixed v0.1 signature:

```real
fn main() -> i32
```

### `void`

`void` exists in the internal model for statement-only builtins such as
`print_i32`, `print_bool`, and `print_str`. User-defined `void` functions are
not currently part of the implemented syntax.

## Names and scopes

The implemented model is lexical scoping with explicit declarations.

- Function parameters are visible throughout the function body.
- `let` and `var` bindings are visible from their declaration point to the end
  of the current block.
- `if` branches and `while` bodies introduce nested block scopes.
- Bindings declared inside `if`, `else`, or `while` blocks are not visible
  after that block.
- Redeclaration in the same block is rejected.
- Shadowing a visible outer binding is rejected in v0.1. This is the simpler
  AI-friendly policy: each visible name resolves to one binding, which keeps
  diagnostics and generated C easier to repair.
- The same binding name may be reused in sibling blocks, such as the `if` and
  `else` branches of the same statement, because neither binding is visible in
  the other sibling block.
- `set` resolves the nearest visible binding and requires that binding to be a
  mutable `var`; attempts to mutate a `let` are rejected.

Because RealLang v0.1 emits C directly, user identifiers must also be portable
C identifiers. Function, parameter, and binding names cannot use C reserved
keywords, reserved C implementation prefixes, standard library names needed by
generated code, or generated runtime helper names.

Function parameter names must be unique within the function.

## Return paths

Every currently supported user-defined non-void function must guarantee a
`return` on every control-flow path.

The v0.1 return-path rules are intentionally conservative:

- A direct `return` statement satisfies the current path.
- `if condition(...) { ... } else { ... }` satisfies the current path only when
  both branches guarantee a return.
- `while condition(...) { ... }` does not guarantee a return, even when the
  condition appears constant.

The parser currently requires `else` on every `if`, so an `if` without `else`
is rejected before return-path analysis.

## Backend contract

The intended frontend/backend contract is:

1. If parsing or typechecking fails, `realc` emits a structured diagnostic.
2. If typechecking succeeds, generated C should compile warning-free under the
   supported C compiler flags.
3. Generated C should preserve the documented RealLang semantics.

The accepted-program C validity contract is intentionally narrow: it applies to
currently implemented RealLang features and the supported C toolchain flags.
