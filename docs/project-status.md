# RealLang project status

RealLang is an early, test-backed compiler project. It is not a finished
systems language, and it should not be presented as one.

## Current identity

- Name: RealLang
- File extension: `.real`
- Compiler command: `realc`
- Compiler implementation: Python
- Current backend: C code generation
- Planned backend work: hardened C lowering first, LLVM later
- Designed by: Imagicast Studios
- License stated in README: MIT

## Current compiler pipeline

```text
lex -> parse -> typecheck -> emit C
```

The emitted C is compiled by an external C compiler such as `cc`.

## Long-term ambition

RealLang should eventually compete with Rust, C, and C++ through measurable
strengths, not broad superiority claims.

The intended evidence targets are:

- AI-generated RealLang compiles correctly more often than AI-generated Rust,
  C, or C++ on comparable tasks.
- RealLang diagnostics reduce repair attempts.
- RealLang syntax reduces ambiguity for tools and coding agents.
- RealLang native backends preserve C/Rust-like performance on measured
  workloads.
- RealLang benchmarks are reproducible, honest, and scoped to the data they
  actually measure.

Until benchmark and study data support a narrow claim, RealLang should frame
these as goals rather than proven outcomes.

## Current implemented language features

- module declarations
- functions
- parameters
- `i32` and `bool` return values for non-main functions
- function calls
- return statements
- `let` immutable bindings
- `var` mutable bindings
- `set` mutation
- `i32`
- `bool`
- string literals for `print_str`
- arithmetic: `+`, `-`, `*`, `/`
- comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`
- `if condition(...)`
- `while condition(...)`
- builtins: `print_i32`, `print_bool`, `print_str`

## RealForge status

RealForge is an experimental local-first AI engineering layer in the same repository.
It is developing as a general environment rather than a
single-purpose coding or game-design tool. As of RealForge 2.7:

- `check`, `repair`, `ask`, `plan`, `generate`, `doctor`, `index`, `symbols`, and `context` commands exist
- `improve --dry-run` proposes structured self-improvement plans without modifying files
- optional `--propose-patch --dry-run` prints untrusted unified diffs only
- `experiment --dry-run` previews validation steps without creating a workspace
- `experiment --patch-file` applies patches only in isolated git worktrees or copied workspaces
- experiment reports store `patch_sha256`, `patch_targets`, and `validation_mode`
- `propose-merge`, `list-proposals`, `show-proposal`, and `apply-proposal --confirm` implement approval-gated merges with hash verification
- `research`, `research-list`, and `research-show` provide permissioned HTTPS research snapshots
- `plan --include-research` can attach saved research summaries to planning context
- `cycle`, `cycle-list`, and `cycle-show` orchestrate bounded recursive improvement flows
- `eval`, `eval-list`, and `eval-show` run read-only local provider quality harnesses (1.3); rule-based, not a superiority benchmark
- `bench-tasks`, `bench-task-list`, and `bench-task-show` run repeatable task benchmarks with version tracking (1.7)
- `leaderboard` and `leaderboard export` rank saved task benchmark reports for local provider comparison (1.8)
- `propose-patch --dry-run` asks providers for untrusted unified diff proposals without modifying the main workspace (1.9)
- `scheduler-status`, `scheduler-run`, `scheduler-list`, and `scheduler-show` provide bounded staff scheduler jobs that produce proposals/bundles without auto-apply (2.0)
- `creative brief`, `creative map`, and `creative asset` produce structured local-provider planning artifacts labeled untrusted (2.1)
- `creative image` produces SHA-256 and metadata-only reports; no semantic image recognition is claimed (2.1)
- `engine scan` detects Unreal project structure without opening or modifying Unreal (2.1)
- `unreal plan` produces dry-run, human-approval-required plans without executing commands or editing engine projects (2.1)
- `capabilities` reports general capability domains, safety levels, commands, and staff/network/write requirements (2.2)
- `slash` defines a future interaction grammar without starting a shell or executing commands (2.2)
- `settings` and `settings doctor` provide read-only human/JSON configuration and safety reports (2.2)
- `multimodal capabilities` reports optional provider support without making model/network calls (2.3)
- `vision analyze` produces untrusted, capability-gated reports from bounded image inputs (2.3)
- `image prompt` produces untrusted prompt specifications only; no binary generation exists (2.3)
- `image job` produces untrusted job specs with prompt hashes, reference hashes, and human-review iteration criteria (2.4)
- `image prompt-pack` produces untrusted prompt variants and negative-prompt planning (2.4)
- `image references` produces metadata-only reference boards from bounded local images (2.4)
- `image iterate` emits a separate plan from a saved job without mutating that job (2.4)
- `vision understand` produces rich, untrusted creative and asset-planning reports; mock mode performs no semantic recognition (2.5)
- `vision compare` produces bounded multi-image comparison reports; mock output compares hashes/workflow metadata only (2.5)
- `vision asset-brief` embeds the existing untrusted `AssetBrief` schema without creating meshes, textures, or assets (2.5)
- `asset pipeline` composes optional bounded creative/image/vision artifacts into an untrusted production plan (2.6)
- `blender asset-plan` produces a dry-run DCC plan without requiring or executing Blender (2.6)
- `unreal import-plan` uses read-only Unreal detection and produces no imports or project changes (2.6)
- `engine pipeline` records validated project-relative operations and inert command suggestions (2.6)
- `skill-bench`, `skill-bench-list`, and `skill-bench-show` run broad cross-domain skill benchmarks across code, docs, research, creative, image, vision, engine, asset, safety, and self-improve domains (2.7); rule-based, not a superiority benchmark, with no main workspace mutation
- `workbench/` provides a static, offline-safe UI prototype with mocked data and no backend side effects; Workbench 0.2 adds typed report contracts, defensive adapters, checked JSON fixtures, and fixture-backed view models
- `staff-status`, `update-check`, `improve-channel`, and `update-history` provide staff-only improvement/update channel foundation (1.4); disabled by default
- `update-bundle create/list/show/mark/export` package validated proposals as versioned update candidates (1.5); metadata only, no auto-apply
- `update-bundle verify`, status transition rules, export hardening, and update-history bundle integration (1.6)
- `staff-status` shows pending proposal/bundle counts and latest eval score (1.6)
- validation command allowlist and `manual` permission mode (1.2); provider/research output labeled untrusted
- patch hash chains, validation mode parity, path-safe apply, scoped commits, and stronger rollback (1.1)
- local model configuration via `.realforge.toml` is supported
- Ollama and OpenAI-compatible **local** providers are optional; tests use `MockProvider` only
- workspace boundary enforcement, backup rotation, and post-apply rollback are implemented
- workspace indexing, symbol tables, and bounded context bundles are available
- context-aware planning via `plan --include-context` and `ask --include-context`
- MockProvider remains the CI-safe default; local providers are optional
- RealForge does not claim to match frontier coding agents yet
- RealForge does not generate AAA assets or claim AAA-quality creative output

## Current quality signals

As of Milestone 11:

- the full test suite passed
- examples compiled warning-free with `cc -std=c11 -Wall -Wextra`
- benchmark RealLang sources compiled warning-free in the test suite
- accepted programs require guaranteed `i32` or `bool` return paths
- `i32` source integer literals are checked against the documented
  `0..2147483647` range
- block scoping is enforced with declaration-point visibility, block-local
  `if`/`while` bindings, rejected shadowing, and nested `set` resolution
- benchmark and LLM study harnesses existed
- no completed LLM reliability study results were published

These are useful early signals, not proof of production readiness.

## Known limitations

Known limitations include:

- divide-by-zero behavior is not specified
- no LLVM backend exists yet
- no RealIR exists yet
- user-defined `void` functions are not implemented
- nested shadowing is intentionally rejected in v0.1
- arrays, structs, imports, generics, ownership, and modules beyond a single
  source file are not implemented
- the standard library is limited to a few print builtins
- benchmark results are early smoke tests
- the LLM study framework exists but has no completed published results

## Near-term priority

The next credibility milestone should be backend and contract hardening, not a
large feature expansion.

Recommended near-term work:

- keep accepted RealLang programs warning-free under the supported C flags
- add tests for any newly discovered accepted-invalid programs
- keep `i32` lowering aligned with RealLang wrapping semantics as new
  expression forms are added
- document exact semantics before adding new types or arrays
- keep each milestone small and test-backed

## Status language

Preferred wording:

- "RealLang currently lowers to C."
- "RealLang is designed to study AI generation reliability."
- "The benchmark harness compares small workloads."
- "No completed LLM reliability results are claimed yet."

Avoid wording such as:

- "RealLang is faster than Rust."
- "RealLang is safer than Rust."
- "RealLang has proven AI reliability."
- "RealLang is production-ready."
