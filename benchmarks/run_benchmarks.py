#!/usr/bin/env python3
"""RealLang benchmark harness v0.1 — macOS-first, portable C/C++ toolchain."""

from __future__ import annotations

import json
import os
import shutil
import statistics
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

BENCHMARKS = [
    {
        "name": "loop_sum",
        "description": "while loop with var/set and i32 accumulation",
        "expected_output": "1249975000",
    },
    {
        "name": "fibonacci_recursive",
        "description": "recursive fib(35) with if/else",
        "expected_output": "9227465",
    },
    {
        "name": "branch_count",
        "description": "tight loop with if/else and comparisons",
        "expected_output": "5000000",
    },
    {
        "name": "function_call",
        "description": "helper function called in a hot loop",
        "expected_output": "1250025000",
    },
]

RUNS_DEFAULT = 7
LANGS = ("real", "c", "cpp")
# Flag unstable timings when spread is large relative to median.
SPREAD_WARN_RATIO = 0.75


@dataclass
class RunStats:
    language: str
    benchmark: str
    runs: int
    warmup_runs: int
    expected_output: str
    actual_output: str
    correct: bool
    mean_ms: float
    median_ms: float
    min_ms: float
    max_ms: float
    stdev_ms: float
    spread_ratio: float
    unstable: bool
    samples_ms: list[float]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _tool_env(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    src = str(root / "src")
    env["PYTHONPATH"] = src if "PYTHONPATH" not in env else f"{src}{os.pathsep}{env['PYTHONPATH']}"
    return env


def run_cmd(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(cmd)}\n"
            f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )


def harden_emitted_c(path: Path) -> None:
    """Discourage -O3 from constant-folding benchmark loops in generated C."""
    text = path.read_text(encoding="utf-8")
    if "bench_limit" not in text:
        header = "static volatile int bench_limit = 50000;\n\n"
        text = header + text.replace("i < 50000", "i < bench_limit")
    text = text.replace("int i =", "volatile int i =")
    text = text.replace("int total =", "volatile int total =")
    text = text.replace("int count =", "volatile int count =")
    path.write_text(text, encoding="utf-8")


def realc_cmd(root: Path, src: Path, out: Path) -> None:
    realc = shutil.which("realc")
    if realc:
        run_cmd([realc, str(src), "--emit-c", "-o", str(out)], env=_tool_env(root))
        return
    run_cmd(
        [sys.executable, "-m", "reallang.cli", str(src), "--emit-c", "-o", str(out)],
        env=_tool_env(root),
    )


def compile_real(name: str, build_dir: Path, bench_dir: Path, root: Path) -> Path:
    src = bench_dir / "real" / f"{name}.real"
    emitted = build_dir / f"{name}_real.c"
    binary = build_dir / f"{name}_real"
    realc_cmd(root, src, emitted)
    if name in ("loop_sum", "function_call", "branch_count"):
        harden_emitted_c(emitted)
    run_cmd(["cc", "-std=c11", "-O3", "-Wall", "-Wextra", str(emitted), "-o", str(binary)])
    return binary


def compile_c(name: str, build_dir: Path, bench_dir: Path) -> Path:
    src = bench_dir / "c" / f"{name}.c"
    binary = build_dir / f"{name}_c"
    run_cmd(["cc", "-std=c11", "-O3", "-Wall", "-Wextra", str(src), "-o", str(binary)])
    return binary


def compile_cpp(name: str, build_dir: Path, bench_dir: Path) -> Path:
    src = bench_dir / "cpp" / f"{name}.cpp"
    binary = build_dir / f"{name}_cpp"
    run_cmd(["c++", "-std=c++17", "-O3", "-Wall", "-Wextra", str(src), "-o", str(binary)])
    return binary


def compile_binary(
    language: str, name: str, build_dir: Path, bench_dir: Path, root: Path
) -> Path:
    if language == "real":
        return compile_real(name, build_dir, bench_dir, root)
    if language == "c":
        return compile_c(name, build_dir, bench_dir)
    if language == "cpp":
        return compile_cpp(name, build_dir, bench_dir)
    raise ValueError(language)


def run_timed(binary: Path, runs: int, *, warmup: int = 1) -> tuple[str, list[float]]:
    for _ in range(warmup):
        subprocess.run([str(binary)], capture_output=True, text=True, check=True)

    output = ""
    samples: list[float] = []
    for _ in range(runs):
        start = time.perf_counter()
        proc = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        samples.append(elapsed_ms)
        output = proc.stdout.strip()
    return output, samples


def summarize(samples: list[float]) -> tuple[float, float, float, float, float, float]:
    mean = statistics.mean(samples)
    median = statistics.median(samples)
    mn = min(samples)
    mx = max(samples)
    stdev = statistics.stdev(samples) if len(samples) > 1 else 0.0
    spread = (mx - mn) / median if median > 0 else float("inf")
    return mean, median, mn, mx, stdev, spread


def write_summary(results: list[RunStats], path: Path) -> None:
    lines = [
        "# RealLang benchmark summary",
        "",
        "**Early harness — not rigorous science yet.** Results are useful for smoke",
        "comparisons only. Timing measures **process execution** (not compile time),",
        "after one warmup run, with median/mean/min/max/stdev reported.",
        "",
        "RealLang lowers to C, then uses `cc -O3`. This does **not** claim RealLang",
        "is faster than C or C++.",
        "",
        "| Benchmark | Lang | OK | Median | Mean | Min | Max | Stdev | Spread |",
        "|-----------|------|----|--------|------|-----|-----|-------|--------|",
    ]
    for row in results:
        flag = " ⚠" if row.unstable else ""
        lines.append(
            f"| {row.benchmark} | {row.language} | "
            f"{'yes' if row.correct else 'NO'} | "
            f"{row.median_ms:.2f} | {row.mean_ms:.2f} | {row.min_ms:.2f} | {row.max_ms:.2f} | "
            f"{row.stdev_ms:.2f} | {row.spread_ratio:.2f}{flag} |"
        )
    lines.extend(
        [
            "",
            "Spread = (max − min) / median. Values above "
            f"{SPREAD_WARN_RATIO:.2f} are flagged as unstable.",
            "",
            "The longer-term research goal is AI generation reliability, not winning",
            "a raw speed race against mature native compilers.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Run RealLang benchmark harness v0.1")
    parser.add_argument("--runs", type=int, default=RUNS_DEFAULT, help="timed runs per binary")
    parser.add_argument("--warmup", type=int, default=1, help="warmup executions before timing")
    parser.add_argument("--skip-slow", action="store_true", help="skip branch_count benchmark")
    args = parser.parse_args(argv)

    root = repo_root()
    bench_dir = Path(__file__).resolve().parent
    build_dir = bench_dir / "build"
    results_dir = bench_dir / "results"

    if shutil.which("cc") is None:
        print("error: cc not found on PATH", file=sys.stderr)
        return 1
    if shutil.which("c++") is None:
        print("error: c++ not found on PATH", file=sys.stderr)
        return 1

    build_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    all_results: list[RunStats] = []
    suite = [b for b in BENCHMARKS if not (args.skip_slow and b["name"] == "branch_count")]

    for spec in suite:
        name = spec["name"]
        expected = spec["expected_output"]
        for language in LANGS:
            print(f"=== {name} ({language}) ===")
            binary = compile_binary(language, name, build_dir, bench_dir, root)
            output, samples = run_timed(binary, args.runs, warmup=args.warmup)
            correct = output == expected
            mean, median, mn, mx, stdev, spread = summarize(samples)
            unstable = spread > SPREAD_WARN_RATIO
            if not correct:
                print(
                    f"  correctness FAILED: expected {expected!r}, got {output!r}",
                    file=sys.stderr,
                )
            if unstable:
                print(
                    f"  WARNING: unstable spread ratio {spread:.2f} "
                    f"(min={mn:.2f}ms max={mx:.2f}ms median={median:.2f}ms)",
                    file=sys.stderr,
                )
            stats = RunStats(
                language=language,
                benchmark=name,
                runs=args.runs,
                warmup_runs=args.warmup,
                expected_output=expected,
                actual_output=output,
                correct=correct,
                mean_ms=mean,
                median_ms=median,
                min_ms=mn,
                max_ms=mx,
                stdev_ms=stdev,
                spread_ratio=spread,
                unstable=unstable,
                samples_ms=samples,
            )
            all_results.append(stats)
            print(
                f"  {'OK' if correct else 'BAD'}  "
                f"median={median:.2f}ms mean={mean:.2f}ms "
                f"min={mn:.2f}ms max={mx:.2f}ms stdev={stdev:.2f}ms"
            )

    json_path = results_dir / "results.json"
    json_path.write_text(
        json.dumps(
            {
                "harness": "reallang-benchmarks-v0.1",
                "disclaimer": (
                    "Early benchmark harness for smoke comparisons only — not rigorous "
                    "scientific benchmarking yet."
                ),
                "methodology": {
                    "timed_runs": args.runs,
                    "warmup_runs": args.warmup,
                    "timing_includes_compile": False,
                    "timing_unit": "milliseconds wall clock per process execution",
                    "statistics": ["mean", "median", "min", "max", "stdev", "spread_ratio"],
                    "spread_warn_threshold": SPREAD_WARN_RATIO,
                    "anti_dce": (
                        "volatile accumulators and bench_limit in C/C++; "
                        "post-processed volatile in generated RealLang C for loop benchmarks"
                    ),
                },
                "compiler_flags": {
                    "c": "-std=c11 -O3 -Wall -Wextra",
                    "cpp": "-std=c++17 -O3 -Wall -Wextra",
                    "real": "realc --emit-c, hardened C, then same C flags",
                },
                "results": [asdict(r) for r in all_results],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_summary(all_results, results_dir / "summary.md")
    print(f"\nwrote {json_path}")
    print(f"wrote {results_dir / 'summary.md'}")

    if not all(r.correct for r in all_results):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
