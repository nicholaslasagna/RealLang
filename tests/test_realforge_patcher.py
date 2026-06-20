import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.patcher import PatcherError, apply_with_backup, validate_apply
from realforge.permissions import PermissionError, PermissionMode, Permissions
from realforge.repair_rules import RepairAction, RepairPlan


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


def test_validate_apply_requires_changes(tmp_path: Path):
    path = tmp_path / "x.real"
    original = "module main;\n"
    path.write_text(original, encoding="utf-8")
    with pytest.raises(PatcherError, match="no safe repair changes"):
        validate_apply(path, original, _plan(original, applied=True))


def test_validate_apply_requires_applied_action(tmp_path: Path):
    path = tmp_path / "x.real"
    original = "let x"
    path.write_text(original, encoding="utf-8")
    with pytest.raises(PatcherError, match="no proven-safe repairs"):
        validate_apply(path, original, _plan("var x", applied=False))


def test_apply_with_backup_writes_and_creates_backup(tmp_path: Path):
    path = tmp_path / "bad.real"
    original = "let x: i32 = 1;\n"
    repaired = "var x: i32 = 1;\n"
    path.write_text(original, encoding="utf-8")
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=tmp_path)
    backup = apply_with_backup(path, _plan(repaired), permissions=perms)
    assert backup.is_file()
    assert path.read_text(encoding="utf-8") == repaired
    assert backup.read_text(encoding="utf-8") == original


def test_apply_blocked_in_readonly_mode(tmp_path: Path):
    path = tmp_path / "bad.real"
    path.write_text("let\n", encoding="utf-8")
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=tmp_path)
    with pytest.raises(PermissionError):
        apply_with_backup(path, _plan("var\n"), permissions=perms)
