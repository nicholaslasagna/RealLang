# RealLang overview

**RealLang** is an experimental AI-native systems programming language designed by **Imagicast Studios**. The language and compiler are shaped for:

- **Deterministic parsing** — unambiguous grammar and predictable tokenization
- **Explicit semantics** — few surprises for readers, tools, and models
- **LLM-safe code generation** — syntax and errors that models can produce and fix reliably
- **AI-repairable diagnostics** — structured errors with stable codes, locations, and suggested repairs
- **Native-speed compilation** — C emission today; LLVM backends planned

Performance is modeled as **C-like**, not “faster than C”: generated C is the current lowering path, with future LLVM support for the same semantics.

---

## Types (v0.1)

| Type | Notes |
|------|-------|
| `i32` | 32-bit signed integer; wrapping arithmetic (see below) |
| `bool` | `true` / `false` |
| `void` | Function return / statement-only builtins |
| `string` | String literals for `print_str` |

### `i32` overflow semantics

RealLang v0.1 defines **`i32` arithmetic as two's-complement wrapping modulo 2³²**. Addition, subtraction, multiplication, and division that exceed the representable range wrap deterministically in the language semantics.

This is intentional and documented—not “whatever C does.” The reference C backend currently maps `i32` to C `int`; a future backend milestone will lower wrapping arithmetic explicitly (for example via `uint32_t` casts) so generated code cannot depend on undefined signed overflow in C.

---

## Syntax (implemented)

- `module <name>;`
- `fn <name>(<params>) -> <type> { ... }`
- `let <name>: <type> = <expr>;` — immutable
- `var <name>: <type> = <expr>;` — mutable
- `set <name> = <expr>;` — only on `var` bindings; types must match
- `return <expr>;`
- `if condition(<bool-expr>) { ... } else { ... }`
- `while condition(<bool-expr>) { ... }`
- `i32` arithmetic: `+`, `-`, `*`, `/`
- Comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=` → `bool`

### Builtins

| Name | Signature |
|------|-----------|
| `print_str` | `(string) -> void` |
| `print_i32` | `(i32) -> void` |
| `print_bool` | `(bool) -> void` |

---

## Compiler stages

1. **Lexer** — source → tokens
2. **Parser** — tokens → AST
3. **Typechecker** — AST → validated program (structured errors on failure)
4. **Codegen** — AST → C source

---

## Diagnostics (milestone 4)

Errors use stable codes for automated repair:

| Prefix | Examples |
|--------|----------|
| `REAL_LEX_ERROR` | `E001` unknown token |
| `REAL_PARSE_ERROR` | `E101` missing `;`, `E102` missing `)`, `E103` missing `}` |
| `REAL_TYPE_ERROR` | `E203` set on `let`, `E205` wrong arity, `E207`/`E208` non-bool condition |

Each diagnostic may include file path, line, column, problem, why, expected/found, and suggested repair.

See [roadmap.md](roadmap.md) for planned milestones.
