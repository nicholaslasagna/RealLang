from __future__ import annotations

from pathlib import Path

from realforge.repair_rules import RepairPlan
from realforge.workspace import create_backup


class SafetyError(Exception):
    pass


def validate_apply(path: Path, original: str, plan: RepairPlan) -> None:
    if plan.source == original:
        raise SafetyError("no safe repair changes to apply")
    if not any(a.applied for a in plan.actions):
        raise SafetyError("no proven-safe repairs available for --apply")


def apply_with_backup(path: Path, plan: RepairPlan, *, suffix: str = ".bak") -> Path:
    backup = create_backup(path, suffix)
    path.write_text(plan.source, encoding="utf-8")
    return backup
