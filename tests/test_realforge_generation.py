import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.generation import run_generate
from realforge.permissions import PermissionError, PermissionMode, Permissions
from realforge.providers import MockProvider


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def test_mock_generate_dry_run_does_not_write(tmp_path: Path):
    output = tmp_path / "generated.real"
    outcome = run_generate(
        "write hello world program",
        MockProvider(),
        dry_run=True,
        output=output,
        config=_config(tmp_path),
    )
    assert outcome.dry_run
    assert "mock generate" in outcome.result.content
    assert not output.exists()


def test_mock_generate_apply_writes_with_permission(tmp_path: Path):
    output = tmp_path / "generated.real"
    cfg = _config(tmp_path)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    outcome = run_generate(
        "write hello world program",
        MockProvider(),
        dry_run=False,
        output=output,
        config=cfg,
        permissions=perms,
    )
    assert not outcome.dry_run
    assert output.is_file()
    assert "module main;" in output.read_text(encoding="utf-8")


def test_generate_apply_blocked_outside_workspace(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    outside = tmp_path / "outside.real"
    cfg = _config(workspace)
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=workspace)
    with pytest.raises(PermissionError):
        run_generate(
            "write hello world program",
            MockProvider(),
            dry_run=False,
            output=outside,
            config=cfg,
            permissions=perms,
        )
