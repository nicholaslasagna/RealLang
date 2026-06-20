import sys
from pathlib import Path

import pytest

from realforge.agent_loop import check_file, repair_file
from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def _rollback_source() -> str:
    return """module main;
fn main() -> i32 {
  let x: i32 = 1;
  set x = 2;
  let big: i32 = 2147483648;
  return 0;
}
"""


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
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    before = check_file(path, cfg)
    assert not before.ok

    outcome = repair_file(path, dry_run=False, config=cfg, permissions=perms)
    assert outcome.changed
    assert outcome.backup is not None
    assert "var x: i32" in path.read_text(encoding="utf-8")
    assert outcome.ok
    assert not outcome.rolled_back


def test_repair_rollback_on_failed_recheck(tmp_path: Path):
    path = tmp_path / "bad.real"
    original = _rollback_source()
    path.write_text(original, encoding="utf-8")
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)

    outcome = repair_file(path, dry_run=False, config=cfg, permissions=perms)
    assert not outcome.ok
    assert outcome.rolled_back
    assert "rollback:" in outcome.message
    assert path.read_text(encoding="utf-8") == original
    assert outcome.backup is not None
    assert outcome.backup.is_file()


def test_repair_keep_failed_repair_retains_changes(tmp_path: Path):
    path = tmp_path / "bad.real"
    path.write_text(_rollback_source(), encoding="utf-8")
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)

    outcome = repair_file(
        path,
        dry_run=False,
        config=cfg,
        permissions=perms,
        keep_failed_repair=True,
    )
    assert not outcome.ok
    assert not outcome.rolled_back
    assert "keep-failed-repair" in outcome.message
    assert "var x: i32" in path.read_text(encoding="utf-8")


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
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    outcome = repair_file(path, dry_run=False, config=cfg, permissions=perms)
    assert not outcome.ok
    assert outcome.backup is None
    assert "apply blocked" in outcome.message
