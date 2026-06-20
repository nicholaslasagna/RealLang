import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions
from realforge.runner import CommandBlockedError, PermissionError, run_command


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def test_blocks_destructive_commands(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    with pytest.raises(CommandBlockedError):
        run_command(("rm", "-rf", "/"), config=cfg, permissions=perms)


def test_readonly_blocks_non_realc_commands(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=tmp_path)
    with pytest.raises(PermissionError):
        run_command(("pytest", "-q"), config=cfg, permissions=perms)


def test_readonly_allows_realc_check(tmp_path: Path):
    source = tmp_path / "ok.real"
    source.write_text(
        """module main;
fn main() -> i32 {
  return 0;
}
""",
        encoding="utf-8",
    )
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=tmp_path)
    result = run_command(
        (sys.executable, "-m", "reallang.cli", str(source), "--check"),
        config=cfg,
        permissions=perms,
    )
    assert result.returncode == 0


def test_workspace_write_allows_pytest_command(tmp_path: Path):
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    result = run_command((sys.executable, "--version"), config=cfg, permissions=perms)
    assert result.returncode == 0
