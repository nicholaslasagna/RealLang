import sys
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.repair_loop import check_file, repair_file

ROOT = Path(__file__).resolve().parents[1]


def _config() -> RealForgeConfig:
    return RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"))


def test_repair_apply_success(tmp_path: Path):
    path = tmp_path / "bad.real"
    path.write_text(
        """module main;
fn main() -> i32 {
  let x: i32 = 10;
  set x = 20;
  return 0;
}
""",
        encoding="utf-8",
    )
    before = check_file(path, _config())
    assert not before.ok

    outcome = repair_file(path, dry_run=False, config=_config())
    assert outcome.changed
    assert outcome.backup is not None
    assert outcome.backup.is_file()
    assert "var x: i32" in path.read_text(encoding="utf-8")
    assert outcome.ok

    after = check_file(path, _config())
    assert after.ok


def test_repair_apply_blocked_without_safe_fix(tmp_path: Path):
    path = tmp_path / "bad.real"
    path.write_text(
        """module main;
fn main(argc: i32) -> i32 {
  return argc;
}
""",
        encoding="utf-8",
    )
    outcome = repair_file(path, dry_run=False, config=_config())
    assert not outcome.ok
    assert outcome.backup is None
    assert "apply blocked" in outcome.message
