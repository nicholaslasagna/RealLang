from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum

from realforge.errors import ProviderPlanError

IMPROVE_AREAS = frozenset({"safety", "tests", "docs", "compiler", "realforge"})


class ImproveArea(str, Enum):
    SAFETY = "safety"
    TESTS = "tests"
    DOCS = "docs"
    COMPILER = "compiler"
    REALFORGE = "realforge"


@dataclass(frozen=True)
class SelfImprovementPlan:
    title: str
    area: str
    problem_statement: str
    current_evidence: tuple[str, ...]
    proposed_changes: tuple[str, ...]
    files_to_inspect: tuple[str, ...]
    files_to_modify: tuple[str, ...]
    tests_to_add: tuple[str, ...]
    validation_commands: tuple[str, ...]
    risks: tuple[str, ...]
    rollback_plan: str
    success_criteria: tuple[str, ...]
    requires_human_approval: bool
    confidence: str


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list of strings")
    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{field} must contain non-empty strings")
        items.append(item.strip())
    return tuple(items)


def _extract_json(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(stripped[start : end + 1])
    raise ValueError("no JSON object found in model response")


def parse_improvement_plan(text: str, *, provider: str, area: str) -> SelfImprovementPlan:
    try:
        payload = _extract_json(text)
    except json.JSONDecodeError as err:
        raise ProviderPlanError(provider, f"invalid JSON improvement plan: {err}", raw=text) from err
    except ValueError as err:
        raise ProviderPlanError(provider, str(err), raw=text) from err

    if not isinstance(payload, dict):
        raise ProviderPlanError(provider, "improvement plan JSON must be an object", raw=text)

    try:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("title is required")
        plan_area = str(payload.get("area", area)).strip() or area
        problem = str(payload.get("problem_statement", "")).strip()
        if not problem:
            raise ValueError("problem_statement is required")
        rollback = str(payload.get("rollback_plan", "")).strip()
        if not rollback:
            raise ValueError("rollback_plan is required")
        confidence = str(payload.get("confidence", "")).strip() or "unknown"
        requires = payload.get("requires_human_approval", True)
        if not isinstance(requires, bool):
            raise ValueError("requires_human_approval must be a boolean")

        validation = _string_list(payload.get("validation_commands"), "validation_commands")
        if not validation:
            raise ValueError("validation_commands must contain at least one command")

        return SelfImprovementPlan(
            title=title,
            area=plan_area,
            problem_statement=problem,
            current_evidence=_string_list(payload.get("current_evidence"), "current_evidence"),
            proposed_changes=_string_list(payload.get("proposed_changes"), "proposed_changes"),
            files_to_inspect=_string_list(payload.get("files_to_inspect"), "files_to_inspect"),
            files_to_modify=_string_list(payload.get("files_to_modify"), "files_to_modify"),
            tests_to_add=_string_list(payload.get("tests_to_add"), "tests_to_add"),
            validation_commands=validation,
            risks=_string_list(payload.get("risks"), "risks"),
            rollback_plan=rollback,
            success_criteria=_string_list(payload.get("success_criteria"), "success_criteria"),
            requires_human_approval=requires,
            confidence=confidence,
        )
    except ValueError as err:
        raise ProviderPlanError(provider, str(err), raw=text) from err


def mock_improvement_plan(area: str) -> SelfImprovementPlan:
    templates = {
        "safety": (
            "Harden RealForge workspace safety checks",
            "Self-improvement should strengthen permission gates and rollback reporting.",
            ("docs/realforge.md mentions workspace boundaries.", "tests/test_realforge_workspace.py covers backup rotation."),
            ("Add explicit audit logging for blocked writes.", "Document readonly planning guarantees."),
            ("src/realforge/permissions.py", "src/realforge/workspace.py"),
            ("src/realforge/report.py",),
            ("tests/test_realforge_improve.py",),
            (".venv/bin/pytest -q tests/test_realforge_workspace.py", "realforge doctor"),
            ("Changing permission defaults could break CLI expectations.",),
            "Revert permission/report changes and rerun pytest.",
            ("All safety tests pass.", "No file writes occur in dry-run improve mode."),
        ),
        "tests": (
            "Expand RealForge self-improvement test coverage",
            "Improvement loop needs stronger regression tests around dry-run behavior.",
            ("158 tests currently pass.", "tests/test_realforge_context_planning.py covers planning."),
            ("Add improve command CLI tests for each area.", "Add parser invalid JSON coverage."),
            ("tests/test_realforge_improve.py",),
            ("tests/test_realforge_improve.py",),
            ("tests/test_realforge_improve_cli.py",),
            (".venv/bin/pytest -q tests/test_realforge_improve.py", ".venv/bin/pytest -q"),
            ("Overfitting tests to MockProvider could hide provider regressions.",),
            "Revert added tests if they become flaky; restore prior test files from git.",
            ("New tests pass in isolation and full suite.",),
        ),
        "docs": (
            "Clarify RealForge self-improvement documentation",
            "Docs should explain dry-run-only recursive improvement boundaries.",
            ("docs/realforge.md exists.", "docs/project-status.md tracks milestones."),
            ("Add docs/realforge-self-improvement.md.", "Cross-link from realforge architecture doc."),
            ("docs/realforge-self-improvement.md", "docs/realforge-architecture.md"),
            ("docs/realforge-self-improvement.md",),
            ("tests/test_realforge_improve.py",),
            ("git diff --check", ".venv/bin/pytest -q"),
            ("Documentation drift if code changes without doc updates.",),
            "Revert documentation commits if review rejects the proposal.",
            ("Docs describe dry-run-only 0.6 behavior accurately.",),
        ),
        "compiler": (
            "Strengthen RealLang compiler diagnostic roundtrips",
            "Compiler-facing improvements must stay outside RealForge autonomous edits.",
            ("RealLang compiler tests pass.", "Structured diagnostics are machine-readable."),
            ("Add RealForge live diagnostic fixtures only if compiler emits stable codes.",),
            ("src/reallang/diagnostics.py", "tests/"),
            (),
            ("tests/test_realforge_diagnostics_live.py",),
            (".venv/bin/pytest -q tests/test_realforge_diagnostics_live.py", "realc --check examples/hello.real"),
            ("Touching compiler behavior is out of scope for RealForge-only patches.",),
            "Revert any compiler changes and rerun compiler test suite.",
            ("No compiler behavior change unless explicitly approved.",),
        ),
        "realforge": (
            "Refine RealForge improve loop ergonomics",
            "RealForge should propose focused improvements to its own agent layer.",
            ("RealForge 0.5 adds context-aware planning.", "index/context_builder.py exists."),
            ("Add self_improve.py orchestration hooks.", "Keep improve dry-run only."),
            ("src/realforge/self_improve.py", "src/realforge/cli.py"),
            ("src/realforge/self_improve.py",),
            ("tests/test_realforge_improve.py",),
            (".venv/bin/pytest -q", "realforge improve --dry-run"),
            ("Scope creep into autonomous editing would violate safety boundaries.",),
            "Revert RealForge module changes and restore prior CLI behavior.",
            ("Improve command remains read-only.", "MockProvider tests stay deterministic."),
        ),
    }
    key = area if area in templates else "realforge"
    title, problem, evidence, changes, inspect, modify, tests_add, validation, risks, rollback, success = templates[key]
    return SelfImprovementPlan(
        title=title,
        area=key,
        problem_statement=problem,
        current_evidence=evidence,
        proposed_changes=changes,
        files_to_inspect=inspect,
        files_to_modify=modify,
        tests_to_add=tests_add,
        validation_commands=validation,
        risks=risks,
        rollback_plan=rollback,
        success_criteria=success,
        requires_human_approval=True,
        confidence="high",
    )


def mock_patch_proposal(area: str) -> str:
    return "\n".join(
        [
            "--- a/tests/test_realforge_improve.py",
            "+++ b/tests/test_realforge_improve.py",
            "@@ -1,1 +1,2 @@",
            "+# UNTRUSTED MODEL PATCH PROPOSAL (dry-run only)",
            f"+# area={area}",
        ]
    )


def format_improvement_plan(plan: SelfImprovementPlan) -> str:
    lines = [
        "UNTRUSTED PROVIDER OUTPUT (not verified by RealForge)",
        "RealForge self-improvement proposal (dry-run only; not validated)",
        f"Title: {plan.title}",
        f"Area: {plan.area}",
        f"Problem: {plan.problem_statement}",
        f"Confidence: {plan.confidence}",
        f"Requires human approval: {plan.requires_human_approval}",
    ]
    if plan.current_evidence:
        lines.append("Current evidence:")
        for item in plan.current_evidence:
            lines.append(f"  - {item}")
    if plan.proposed_changes:
        lines.append("Proposed changes:")
        for item in plan.proposed_changes:
            lines.append(f"  - {item}")
    if plan.files_to_inspect:
        lines.append(f"Files to inspect: {', '.join(plan.files_to_inspect)}")
    if plan.files_to_modify:
        lines.append(f"Files to modify: {', '.join(plan.files_to_modify)}")
    if plan.tests_to_add:
        lines.append("Tests to add:")
        for item in plan.tests_to_add:
            lines.append(f"  - {item}")
    if plan.validation_commands:
        lines.append("Suggested validation commands (not executed automatically):")
        for cmd in plan.validation_commands:
            lines.append(f"  - {cmd}")
    if plan.risks:
        lines.append("Risks:")
        for risk in plan.risks:
            lines.append(f"  - {risk}")
    lines.append(f"Rollback plan: {plan.rollback_plan}")
    if plan.success_criteria:
        lines.append("Success criteria:")
        for item in plan.success_criteria:
            lines.append(f"  - {item}")
    lines.append("Note: provider output is untrusted; planning does not edit files or run commands.")
    return "\n".join(lines)
