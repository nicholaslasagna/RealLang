from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig, default_config
from realforge.diagnostics_parser import ParsedDiagnostic, parse_diagnostics
from realforge.diffing import unified_diff
from realforge.repair_rules import apply_safe_repairs
from realforge.report import format_check_fail, format_check_pass, format_repair_plan
from realforge.runner import run_realc_check
from realforge.safety import SafetyError, apply_with_backup, validate_apply
from realforge.workspace import read_source


@dataclass(frozen=True)
class CheckOutcome:
    ok: bool
    diagnostics: list[ParsedDiagnostic]
    stdout: str
    stderr: str


@dataclass(frozen=True)
class RepairOutcome:
    ok: bool
    changed: bool
    diagnostics_before: list[ParsedDiagnostic]
    diagnostics_after: list[ParsedDiagnostic]
    diff: str
    backup: Path | None
    message: str


def check_file(path: Path, config: RealForgeConfig | None = None) -> CheckOutcome:
    result = run_realc_check(path, config)
    diagnostics = parse_diagnostics(result.stderr)
    return CheckOutcome(result.returncode == 0, diagnostics, result.stdout, result.stderr)


def repair_file(
    path: Path,
    *,
    dry_run: bool = True,
    config: RealForgeConfig | None = None,
) -> RepairOutcome:
    cfg = config or default_config()
    before = read_source(path)
    check = check_file(path, cfg)
    if check.ok:
        return RepairOutcome(
            ok=True,
            changed=False,
            diagnostics_before=[],
            diagnostics_after=[],
            diff="",
            backup=None,
            message=f"already ok: {path}",
        )

    plan = apply_safe_repairs(before, check.diagnostics)
    diff = unified_diff(before, plan.source, fromfile=str(path), tofile=f"{path} (repaired)")

    if dry_run:
        msg = format_repair_plan(path, plan, dry_run=True)
        if diff.strip():
            msg += "\n\n" + diff
        return RepairOutcome(
            ok=False,
            changed=before != plan.source,
            diagnostics_before=check.diagnostics,
            diagnostics_after=[],
            diff=diff,
            backup=None,
            message=msg,
        )

    try:
        validate_apply(path, before, plan)
    except SafetyError as err:
        msg = format_repair_plan(path, plan, dry_run=False) + f"\n\napply blocked: {err}"
        return RepairOutcome(
            ok=False,
            changed=False,
            diagnostics_before=check.diagnostics,
            diagnostics_after=[],
            diff=diff,
            backup=None,
            message=msg,
        )

    backup = apply_with_backup(path, plan, suffix=cfg.backup_suffix)
    after_check = check_file(path, cfg)
    ok = after_check.ok
    msg = format_repair_plan(path, plan, dry_run=False)
    msg += f"\nbackup: {backup}"
    if ok:
        msg += f"\nPASS after repair: {path}"
    else:
        msg += f"\nFAIL after repair: {path}"
        if after_check.diagnostics:
            msg += "\n" + format_check_fail(path, after_check.diagnostics)

    return RepairOutcome(
        ok=ok,
        changed=True,
        diagnostics_before=check.diagnostics,
        diagnostics_after=after_check.diagnostics,
        diff=diff,
        backup=backup,
        message=msg,
    )
