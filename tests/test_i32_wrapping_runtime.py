import subprocess
from pathlib import Path

from reallang.cli import main as realc_main


def _compile_and_run(source: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    src = tmp_path / "wrap.real"
    out_c = tmp_path / "wrap.c"
    binary = tmp_path / "wrap"
    src.write_text(source, encoding="utf-8")

    assert realc_main([str(src), "--emit-c", "-o", str(out_c)]) == 0
    cc = subprocess.run(
        ["cc", "-std=c11", "-Wall", "-Wextra", str(out_c), "-o", str(binary)],
        capture_output=True,
        text=True,
    )
    assert cc.returncode == 0, cc.stderr

    return subprocess.run([str(binary)], capture_output=True, text=True, check=True)


def test_i32_add_sub_mul_wrap_at_runtime(tmp_path: Path):
    source = """module main;
fn main() -> i32 {
  print_i32(2147483647 + 1);
  print_i32(0 - 1);
  print_i32(65536 * 65536);
  return 0;
}
"""
    run = _compile_and_run(source, tmp_path)
    assert run.stdout == "-2147483648\n-1\n0\n"


def test_i32_division_overflow_wraps_at_runtime(tmp_path: Path):
    source = """module main;
fn main() -> i32 {
  let min: i32 = 2147483647 + 1;
  let neg_one: i32 = 0 - 1;
  print_i32(min / neg_one);
  return 0;
}
"""
    run = _compile_and_run(source, tmp_path)
    assert run.stdout == "-2147483648\n"
