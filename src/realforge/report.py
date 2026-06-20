from __future__ import annotations

from pathlib import Path

from realforge.diagnostics_parser import ParsedDiagnostic
from realforge.repair_rules import RepairPlan


def format_diagnostic_summary(diag: ParsedDiagnostic) -> str:
    lines = [
        f"error family: {diag.kind}",
        f"error code: {diag.code}",
    ]
    if diag.file:
        lines.append(f"file: {diag.file}")
    if diag.line is not None:
        lines.append(f"line: {diag.line}")
    if diag.column is not None:
        lines.append(f"column: {diag.column}")
    lines.append(f"problem: {diag.problem}")
    if diag.why:
        lines.append(f"why: {diag.why}")
    if diag.repair:
        lines.append(f"suggested repair: {diag.repair}")
    return "\n".join(lines)


def format_check_pass(path: Path) -> str:
    return f"PASS: {path}"


def format_check_fail(path: Path, diagnostics: list[ParsedDiagnostic]) -> str:
    parts = [f"FAIL: {path}"]
    for diag in diagnostics:
        parts.append("")
        parts.append(format_diagnostic_summary(diag))
    return "\n".join(parts)


def format_repair_plan(path: Path, plan: RepairPlan, *, dry_run: bool) -> str:
    mode = "dry-run" if dry_run else "apply"
    lines = [f"RealForge repair ({mode}): {path}"]
    for action in plan.actions:
        status = "manual" if action.manual_required else ("applied" if action.applied else "skipped")
        lines.append(f"- [{action.code}] {action.description} ({status})")
    for note in plan.manual_notes:
        lines.append(f"  note: {note}")
    return "\n".join(lines)
