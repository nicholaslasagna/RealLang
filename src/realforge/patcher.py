from __future__ import annotations

from pathlib import Path

from realforge.permissions import Permissions
from realforge.repair_rules import RepairPlan
from realforge.workspace import assert_can_write, create_backup, write_with_backup


class PatcherError(Exception):
    pass


def validate_apply(path: Path, original: str, plan: RepairPlan) -> None:
    if plan.source == original:
        raise PatcherError("no safe repair changes to apply")
    if not any(a.applied for a in plan.actions):
        raise PatcherError("no proven-safe repairs available for --apply")


def apply_with_backup(
    path: Path,
    plan: RepairPlan,
    *,
    suffix: str = ".bak",
    permissions: Permissions | None = None,
) -> Path:
    perms = permissions or Permissions()
    assert_can_write(path, perms)
    backup = create_backup(path, suffix)
    path.write_text(plan.source, encoding="utf-8")
    return backup


def write_text_with_backup(
    path: Path,
    content: str,
    *,
    suffix: str,
    permissions: Permissions,
) -> Path | None:
    return write_with_backup(path, content, suffix=suffix, permissions=permissions)
