# RealLang benchmarks (v0.1)

Repeatable harness comparing **RealLang-generated C** against handwritten **C** and **C++** for features the language already supports.

**Disclaimer:** This is an **early smoke-test harness**, not rigorous scientific benchmarking. Do not treat results as publication-ready until workloads and methodology mature.

## What this measures

| Benchmark | Exercises |
|-----------|-----------|
| `loop_sum` | `while`, `var`, `set`, `i32` arithmetic |
| `fibonacci_recursive` | recursion, `if`/`else`, calls |
| `branch_count` | hot loop, comparisons, `if`/`else` |
| `function_call` | helper function in a tight loop |

## What this does **not** claim

RealLang does **not** attempt to beat C by magic. RealLang currently lowers to C, then relies on mature native compilers (`cc -O3`). Runtimes should be **close to comparable C** when codegen is equivalent.

The longer-term research goal is different: **AI generation reliability** (first-try correctness, repair loops, structured diagnostics)—not winning a raw speed crown.

## Requirements (macOS-first)

- Python 3.11+ with RealLang installed (`pip install -e ".[dev]"`)
- `cc` (Clang) and `c++` on `PATH`

## Methodology (v0.1)

- **Timing** measures **process execution only** (compile time is separate).
- One **warmup run** before recorded runs (configurable with `--warmup`).
- Default **7 timed runs** per binary; reports **mean, median, min, max, stdev**, and spread ratio `(max−min)/median`.
- Flags **unstable** results when spread ratio > 0.75 (often constant-folding or system noise).
- Loop benchmarks use **`volatile` accumulators** and a **`volatile bench_limit`** so `-O3` cannot erase the workload.

## Run

```bash
# From repo root (full suite; branch_count is slow)
python benchmarks/run_benchmarks.py

# Fewer timed runs
python benchmarks/run_benchmarks.py --runs 5

# Skip the 10M-iteration branch benchmark while iterating
python benchmarks/run_benchmarks.py --skip-slow
```

Outputs:

- `benchmarks/results/results.json` — machine-readable timings + correctness
- `benchmarks/results/summary.md` — human-readable table

Build artifacts land in `benchmarks/build/` (gitignored).

## Expected outputs (correctness)

| Benchmark | Expected `print_i32` line |
|-----------|---------------------------|
| `loop_sum` | `1249975000` (50k iterations, fits `i32`) |
| `fibonacci_recursive` | `9227465` |
| `branch_count` | `5000000` |
| `function_call` | `1250025000` |

## Overflow note

Benchmarks use `i32` sizes that fit in range without wrapping for **correctness checks**. RealLang v0.1 defines wrapping semantics, and the C backend lowers wrapping `+`, `-`, and `*` through explicit `uint32_t`-backed helpers. Broader `-O3` benchmark claims still need stronger methodology and environment metadata.
