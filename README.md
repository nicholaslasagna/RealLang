# RealLang

**RealLang** is an experimental AI-native systems programming language designed by **Imagicast Studios**. It prioritizes deterministic parsing, explicit semantics, LLM-oriented code generation reliability, AI-repairable diagnostics, and native executable output through a C backend.

RealLang is designed to make AI-generated systems code more deterministic,
repairable, and benchmarkable while preserving native execution through
hardened C today and future LLVM backends.

This repository implements the compiler incrementally in **vertical slices**—each milestone compiles only the programs it claims to support.

## Performance model

RealLang does **not** attempt to beat C by magic. RealLang currently lowers to C, then relies on mature native compilers for optimization. Its performance goal is **C-like native execution**. Its research goal is different: can an AI-native language improve first-try correctness, repairability, and code generation reliability while preserving native performance?

See [benchmarks/README.md](benchmarks/README.md) for the v0.1 harness (RealLang vs C vs C++ on loops, recursion, branches, and calls).

## Research direction

RealLang is designed by **Imagicast Studios** as an AI-native systems language. It lowers to C for native execution, uses deterministic syntax, explicit semantics, structured AI-repairable diagnostics, and a benchmark harness comparing RealLang-generated C against handwritten C/C++ baselines.

**Long-term question:** Can an AI-native language improve first-try compile success, correctness, and repairability while preserving C-like performance?

The [llm_study/](llm_study/) directory provides the **methodology and scoring harness** for that study (no completed results yet).

## RealForge

[RealForge](docs/realforge.md) is an experimental **local-first AI engineering
environment**: a compiler-guided, benchmark-aware agent platform for coding,
research, creative planning, evaluation, and staff-approved improvement workflows.
RealLang is its first compiler integration, not its only long-term capability domain.

It uses `realc` diagnostics, safe patching, and local model adapters configured via
`.realforge.toml` (see [local model adapters](docs/realforge-local-models.md)).

```bash
realforge check examples/hello.real
realforge repair path/to/bad.real --dry-run
realforge ask --task "plan a diagnostic review"
realforge plan --task "plan a diagnostic review"
realforge generate --task "hello world program" --dry-run
realforge doctor
realforge research --url https://example.com/docs --allow-domain example.com
realforge cycle --area tests --budget 1 --dry-run
realforge eval --provider mock --suite smoke
realforge bench-tasks --provider mock --suite smoke
realforge leaderboard
realforge skill-bench --provider mock --suite smoke
realforge skill-bench --provider mock --suite all
realforge propose-patch --task "add a comment to README" --provider mock --dry-run
realforge scheduler-status
realforge staff-status
realforge capabilities
realforge slash
realforge settings
realforge settings doctor
realforge multimodal capabilities --provider mock
realforge vision analyze --image references/concept.png --task "review image" --provider mock
realforge vision understand --image references/concept.png --task "review creative and asset implications" --provider mock
realforge vision compare --image references/a.png --image references/b.png --task "compare style consistency" --provider mock
realforge vision asset-brief --image references/concept.png --task "plan an asset brief" --provider mock
realforge image prompt --task "design a concept image" --provider mock
realforge image job --task "plan a concept image workflow" --provider mock
realforge image prompt-pack --task "build prompt variants" --provider mock
realforge image references --task "record references" --image references/concept.png
realforge creative brief --provider mock --task "design an asymmetrical horror game"
realforge creative map --provider mock --task "design Hall 13 abandoned school map"
realforge creative asset --provider mock --task "design a forest monster statue prop"
realforge engine scan --path /workspace/MyGame
realforge unreal plan --path /workspace/MyGame --provider mock --task "plan a map blockout"
realforge asset pipeline --provider mock --task "plan a forest monster production workflow"
realforge blender asset-plan --provider mock --task "plan a twisted forest altar prop"
realforge unreal import-plan --path /workspace/MyGame --provider mock --task "plan an asset import"
realforge engine pipeline --path /workspace/MyGame --provider mock --task "plan an engine workflow"
```

Permissioned HTTPS research saves snapshots under `.realforge/research/` and can inform
`plan --include-research` without auto-editing files. Bounded `cycle` commands compose
improve → experiment → proposal flows without auto-merge. The `eval` harness scores local
providers on deterministic tasks without editing the main workspace. `bench-tasks` provides
structured repeatable benchmarks for tracking local providers and RealForge versions over time.
`leaderboard` summarizes saved benchmark reports for local provider selection.
`propose-patch --dry-run` asks local providers for untrusted unified diff proposals without
modifying the main workspace. Staff-only
`improve-channel` commands (disabled by default) compose eval gates and cycles for a future
Improve/Update workflow; `update-bundle` packages pending proposals as reviewable update
candidates (with `verify` integrity checks in 1.6) without applying them.
RealForge 2.1 creative commands produce planning artifacts only: they do not generate binary
assets or modify Unreal projects. Image reports are metadata-only unless a future vision
provider is added. See [creative planning](docs/realforge-creative.md) and
[Unreal foundation](docs/realforge-unreal.md).
RealForge 2.4 adds untrusted image job specs, prompt packs, reference boards, and
iteration plans. These are JSON planning artifacts; no binary image-generation
adapter exists. See [image workflows](docs/realforge-image-workflows.md).
RealForge 2.5 expands provider-backed vision reports for creative review,
comparison, and asset-brief planning. Mock mode performs no semantic recognition,
and all reports remain untrusted. See
[image understanding](docs/realforge-image-understanding.md).
RealForge 2.6 adds untrusted, dry-run asset and engine pipeline reports. Unreal
and Blender support is planning-only: no commands run, no assets are generated,
and no projects are modified. See
[asset pipelines](docs/realforge-asset-pipelines.md) and
[Blender planning](docs/realforge-blender.md).
RealForge 2.7 adds broad cross-domain `skill-bench` benchmarks across code, docs,
research, creative, image, vision, engine, asset, safety, and self-improve domains.
They are internal and rule-based — not scientific proof of superiority — and help
compare local providers and RealForge versions. No main workspace mutation occurs,
provider output stays untrusted, and image/vision/engine/asset tasks run in temp
directories with no Unreal, Blender, image, or vision model required. See
[skill benchmarks](docs/realforge-skill-benchmarks.md).

Related RealForge documents include
[interaction and capabilities](docs/realforge-interaction.md),
[multimodal providers](docs/realforge-multimodal.md),
[vision reports](docs/realforge-vision.md),
[image understanding](docs/realforge-image-understanding.md),
[image-generation planning](docs/realforge-image-generation.md),
[image workflows](docs/realforge-image-workflows.md),
[asset pipelines](docs/realforge-asset-pipelines.md),
[Blender planning](docs/realforge-blender.md),
[research docs](docs/realforge-research.md), [cycle docs](docs/realforge-cycle.md),
[eval harness](docs/realforge-evals.md),
[task benchmarks](docs/realforge-task-benchmarks.md),
[skill benchmarks](docs/realforge-skill-benchmarks.md),
[leaderboard](docs/realforge-leaderboard.md),
[patch proposals](docs/realforge-patch-proposals.md),
[scheduler](docs/realforge-scheduler.md),
[staff mode](docs/realforge-staff-mode.md),
and [update bundles](docs/realforge-update-bundles.md).

See also [RealForge architecture](docs/realforge-architecture.md),
[local model adapters](docs/realforge-local-models.md),
[research](docs/realforge-research.md),
[cycle](docs/realforge-cycle.md),
[eval harness](docs/realforge-evals.md),
[staff mode](docs/realforge-staff-mode.md), and
[update bundles](docs/realforge-update-bundles.md).

## Integer overflow (v0.1)

**`i32` uses defined two's-complement wrapping arithmetic** (modulo 2³²). Overflow is not undefined behavior in the RealLang language model—for example, `examples/looptest.real` may wrap when the accumulated sum exceeds `i32` range.

The C backend lowers `i32` to `int32_t` and routes `+`, `-`, and `*` through explicit `uint32_t`-backed wrapping helpers. Division handles the `INT32_MIN / -1` overflow case explicitly; divide-by-zero behavior is not specified yet.

## Current language (through milestone 3)

- Modules, functions, parameters, calls
- `let` (immutable) and `var` (mutable) bindings, `set` mutation
- `i32` arithmetic, `bool`, comparisons
- `if condition(...) { } else { }`, `while condition(...) { }`
- Builtins: `print_str`, `print_i32`, `print_bool`

Examples: `hello.real`, `add.real`, `looptest.real`, `condition.real`

Pipeline: **lex → parse → typecheck → emit C**.

## AI-repairable diagnostic example

```
REAL_TYPE_ERROR[E203]
File: examples/bad.real
Line: 4
Column: 3
Problem:
  Cannot assign to immutable binding 'x'.
Why:
  'x' was declared with let, which creates an immutable binding.
Suggested repair:
  Change:
    let x: i32 = ...;
  To:
    var x: i32 = ...;
  Or remove this set statement.
```

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

realc examples/hello.real --emit-c
cc -std=c11 -Wall -Wextra -o hello examples/hello.c && ./hello

pytest

# Benchmarks (optional; branch_count is slow)
python benchmarks/run_benchmarks.py --skip-slow
```

## CLI

```bash
realc <file.real> --check
realc <file.real> --emit-c [-o output.c]
realforge check <file.real>
realforge repair <file.real> --dry-run|--apply
realforge ask --task "..."
realforge plan --task "..."
realforge generate --task "..." --dry-run|--apply --output <file.real>
realforge doctor
```

## Project layout

```
src/reallang/   RealLang compiler
src/realforge/  RealForge local agent layer
tests/          unit tests per compiler stage
examples/       RealLang source programs
docs/           language notes and roadmap
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Project documents

- [Language semantics](docs/language-semantics.md)
- [AI fluency model](docs/ai-fluency-model.md)
- [Performance model](docs/performance-model.md)
- [Rust comparison methodology](docs/rust-comparison-methodology.md)
- [Project status](docs/project-status.md)
- [RealForge agent layer](docs/realforge.md)
- [RealForge architecture](docs/realforge-architecture.md)
- [RealForge local models](docs/realforge-local-models.md)
- [RealForge research](docs/realforge-research.md)
- [RealForge cycle](docs/realforge-cycle.md)
- [RealForge eval harness](docs/realforge-evals.md)
- [RealForge task benchmarks](docs/realforge-task-benchmarks.md)
- [RealForge interaction and capabilities](docs/realforge-interaction.md)
- [RealForge multimodal providers](docs/realforge-multimodal.md)
- [RealForge vision reports](docs/realforge-vision.md)
- [RealForge image understanding](docs/realforge-image-understanding.md)
- [RealForge image-generation planning](docs/realforge-image-generation.md)
- [RealForge image workflows](docs/realforge-image-workflows.md)
- [RealForge asset pipelines](docs/realforge-asset-pipelines.md)
- [RealForge Blender planning](docs/realforge-blender.md)
- [RealForge creative planning](docs/realforge-creative.md)
- [RealForge Unreal foundation](docs/realforge-unreal.md)
- [RealForge staff mode](docs/realforge-staff-mode.md)
- [RealForge update bundles](docs/realforge-update-bundles.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

MIT
