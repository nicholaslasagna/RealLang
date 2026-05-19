import subprocess
from pathlib import Path

import pytest

from reallang.cli import main as realc_main

BENCH_REAL = Path(__file__).resolve().parents[1] / "benchmarks" / "real"
NAMES = ["loop_sum", "fibonacci_recursive", "branch_count", "function_call"]


@pytest.mark.parametrize("name", NAMES)
def test_benchmark_real_compiles_warning_free(name: str, tmp_path: Path):
    src = BENCH_REAL / f"{name}.real"
    out_c = tmp_path / f"{name}.c"
    binary = tmp_path / name
    assert realc_main([str(src), "--emit-c", "-o", str(out_c)]) == 0
    proc = subprocess.run(
        ["cc", "-std=c11", "-O3", "-Wall", "-Wextra", str(out_c), "-o", str(binary)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert "warning:" not in proc.stderr.lower()


def test_benchmark_sources_exist():
    root = Path(__file__).resolve().parents[1] / "benchmarks"
    for name in NAMES:
        assert (root / "real" / f"{name}.real").is_file()
        assert (root / "c" / f"{name}.c").is_file()
        assert (root / "cpp" / f"{name}.cpp").is_file()
    assert (root / "run_benchmarks.py").is_file()
