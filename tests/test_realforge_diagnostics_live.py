import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.diagnostics_parser import parse_diagnostics
from realforge.runner import CommandBlockedError, PermissionError, run_command, run_realc_check


def _config() -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=Path.cwd(),
    )


def _check(path: Path, config: RealForgeConfig | None = None):
    result = run_realc_check(path, config or _config())
    diagnostics = parse_diagnostics(result.stderr)
    assert diagnostics, result.stderr
    return diagnostics[0]


@pytest.mark.parametrize(
    ("source", "code", "problem_fragment"),
    [
        (
            """module main;
fn main() -> i32 {
  let x: i32 = 1;
  set x = 2;
  return 0;
}
""",
            "E203",
            "immutable binding",
        ),
        (
            """module main;
fn main(x: i32) -> i32 {
  return x;
}
""",
            "E217",
            "declare parameters",
        ),
        (
            """module main;
fn main() -> i32 {
  print_i32(1);
}
""",
            "E220",
            "return",
        ),
        (
            """module main;
fn main() -> i32 {
  let x: i32 = 2147483648;
  return 0;
}
""",
            "E221",
            "2147483648",
        ),
    ],
)
def test_live_realc_diagnostic_roundtrip(
    tmp_path: Path,
    source: str,
    code: str,
    problem_fragment: str,
):
    path = tmp_path / "bad.real"
    path.write_text(source, encoding="utf-8")
    cfg = RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=tmp_path,
    )
    diag = _check(path, cfg)
    assert diag.code == code
    assert diag.file == str(path)
    assert diag.line is not None
    assert diag.column is not None
    assert problem_fragment.lower() in diag.problem.lower()
