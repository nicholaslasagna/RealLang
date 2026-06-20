from __future__ import annotations

import re
from dataclasses import dataclass

from realforge.diagnostics_parser import ParsedDiagnostic

MANUAL_ONLY_CODES = frozenset({"E217", "E218", "E220", "E221"})
SAFE_AUTO_CODES = frozenset({"E203"})

BINDING_RE = re.compile(r"immutable binding '(\w+)'")
LET_DECL_RE = re.compile(r"^(\s*)let\s+(\w+)\s*:", re.MULTILINE)
SET_RE = re.compile(r"^\s*set\s+(\w+)\s*=", re.MULTILINE)


@dataclass(frozen=True)
class RepairAction:
    code: str
    description: str
    applied: bool
    manual_required: bool


@dataclass(frozen=True)
class RepairPlan:
    source: str
    actions: list[RepairAction]
    manual_notes: list[str]


def _extract_binding_name(diag: ParsedDiagnostic) -> str | None:
    m = BINDING_RE.search(diag.problem)
    return m.group(1) if m else None


def _can_repair_e203(source: str, name: str) -> bool:
    let_matches = [m for m in LET_DECL_RE.finditer(source) if m.group(2) == name]
    set_matches = [m for m in SET_RE.finditer(source) if m.group(1) == name]
    return len(let_matches) == 1 and len(set_matches) >= 1


def _apply_e203(source: str, name: str) -> tuple[str, bool]:
    if not _can_repair_e203(source, name):
        return source, False

    changed = False
    out: list[str] = []
    for line in source.splitlines(keepends=True):
        m = re.match(r"^(\s*)let(\s+" + re.escape(name) + r"\s*:)", line)
        if m and not changed:
            out.append(f"{m.group(1)}var{m.group(2)}{line[m.end():]}")
            changed = True
        else:
            out.append(line)
    return "".join(out), changed


def plan_repairs(source: str, diagnostics: list[ParsedDiagnostic]) -> RepairPlan:
    actions: list[RepairAction] = []
    manual_notes: list[str] = []
    working = source

    for diag in diagnostics:
        if diag.code in MANUAL_ONLY_CODES:
            note = f"{diag.code}: manual repair required — {diag.problem}"
            manual_notes.append(note)
            actions.append(
                RepairAction(
                    code=diag.code,
                    description=diag.problem,
                    applied=False,
                    manual_required=True,
                )
            )
            continue

        if diag.code == "E203":
            name = _extract_binding_name(diag)
            if not name:
                manual_notes.append("E203: could not identify binding name; manual repair required.")
                actions.append(
                    RepairAction(
                        code="E203",
                        description=diag.problem,
                        applied=False,
                        manual_required=True,
                    )
                )
                continue
            new_source, applied = _apply_e203(working, name)
            working = new_source
            actions.append(
                RepairAction(
                    code="E203",
                    description=f"Change let {name} to var {name}",
                    applied=applied,
                    manual_required=not applied,
                )
            )
            if not applied:
                manual_notes.append(
                    f"E203: safe let→var repair not proven for {name!r}; manual repair required."
                )
            continue

        manual_notes.append(f"{diag.code}: no automatic repair rule; manual repair required.")
        actions.append(
            RepairAction(
                code=diag.code,
                description=diag.problem,
                applied=False,
                manual_required=True,
            )
        )

    return RepairPlan(source=working, actions=actions, manual_notes=manual_notes)


def apply_safe_repairs(source: str, diagnostics: list[ParsedDiagnostic]) -> RepairPlan:
    """Apply only explicitly safe repairs (currently E203 let→var)."""
    safe = [d for d in diagnostics if d.code in SAFE_AUTO_CODES]
    unsafe = [d for d in diagnostics if d.code not in SAFE_AUTO_CODES]
    plan = plan_repairs(source, safe)
    if unsafe:
        extra = plan_repairs(source, unsafe)
        return RepairPlan(
            source=plan.source,
            actions=plan.actions + extra.actions,
            manual_notes=plan.manual_notes + extra.manual_notes,
        )
    return plan
