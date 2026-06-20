from __future__ import annotations

from pathlib import Path

from realforge.permissions import PermissionError, Permissions
from realforge.repair_rules import RepairPlan
from realforge.workspace import create_backup


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
    explicit: bool = False,
) -> Path:
    perms = permissions or Permissions()
    if not explicit and not perms.can_write_file(path):
        raise PermissionError(f"write not permitted for {path} in {perms.mode.value} mode")
    backup = create_backup(path, suffix)
    path.write_text(plan.source, encoding="utf-8")
    return backup
