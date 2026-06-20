import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.patcher import apply_with_backup
from realforge.permissions import PermissionError, PermissionMode, Permissions
from realforge.repair_rules import RepairAction, RepairPlan
from realforge.workspace import WorkspaceError, create_backup, next_backup_path


def _plan(source: str, applied: bool = True) -> RepairPlan:
    return RepairPlan(
        source=source,
        actions=[
            RepairAction(
                code="E203",
                description="Change let x to var x",
                applied=applied,
                manual_required=not applied,
            )
        ],
        manual_notes=[],
    )


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
    )


def test_backup_rotation_preserves_existing_backups(tmp_path: Path):
    path = tmp_path / "file.real"
    path.write_text("v0\n", encoding="utf-8")

    first = create_backup(path, ".bak")
    assert first.name == "file.real.bak"
    assert first.read_text(encoding="utf-8") == "v0\n"

    path.write_text("v1\n", encoding="utf-8")
    second = create_backup(path, ".bak")
    assert second.name == "file.real.bak.1"
    assert second.read_text(encoding="utf-8") == "v1\n"
    assert first.read_text(encoding="utf-8") == "v0\n"

    path.write_text("v2\n", encoding="utf-8")
    third = create_backup(path, ".bak")
    assert third.name == "file.real.bak.2"
    assert next_backup_path(path, ".bak") == tmp_path / "file.real.bak.3"


def test_apply_blocked_outside_workspace(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    outside = tmp_path / "outside.real"
    outside.write_text("module main;\n", encoding="utf-8")
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=workspace)

    with pytest.raises(WorkspaceError):
        apply_with_backup(
            outside,
            _plan("module patched;\n"),
            permissions=perms,
        )


def test_apply_requires_workspace_write_mode(tmp_path: Path):
    path = tmp_path / "inside.real"
    path.write_text("let\n", encoding="utf-8")
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=tmp_path)

    with pytest.raises(PermissionError):
        apply_with_backup(path, _plan("var\n"), permissions=perms)
